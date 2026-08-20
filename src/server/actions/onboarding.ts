"use server";

import { revalidatePath } from "next/cache";
import { getRepository } from "@/server/data";
import { authorise, type ActionResult } from "./authorise";
import { OrganisationResearchService } from "@/server/onboarding/research-service";
import { DocumentDiscoveryService } from "@/server/onboarding/document-service";
import { PolitePageFetcher } from "@/server/onboarding/fetcher";
import { configuredRegisters } from "@/server/onboarding/registers";
import type { DocumentKind } from "@/types/domain";
import type { OnboardingInput } from "@/server/onboarding/discovery-service";

/**
 * Onboarding actions.
 *
 * The whole of MG-3 reduces to one boundary, and it is enforced here: research
 * writes **candidates**, and only `reviewCandidate` turns a candidate into
 * something the organisation asserts. There is deliberately no action that
 * approves in bulk without a human decision per value, and no path that writes
 * a profile field directly from extraction.
 */

const makeId = (prefix: string) => `${prefix}-${globalThis.crypto.randomUUID()}`;

/** A success carrying a message. `ok` in `authorise` is the bare constant. */
const succeeded = (message: string): ActionResult => ({ ok: true, message });

/**
 * Run research over public sources.
 *
 * Requires `profile:edit`, because what it produces is a proposal to change
 * the organisation's profile. It reaches out to the organisation's own website
 * and to registers, so it is also the most expensive action in the product and
 * is deliberately not triggered by page loads.
 */
export async function runOnboardingResearch(input: OnboardingInput): Promise<ActionResult> {
  const auth = await authorise("profile:edit");
  if (!auth.ok) return auth.result;

  const name = input.name?.trim();
  if (!name) {
    return { ok: false, message: "An organisation name is needed to start." };
  }

  const repo = getRepository();
  const fetcher = new PolitePageFetcher();

  const service = new OrganisationResearchService({
    repo,
    fetcher,
    registers: configuredRegisters(),
    now: auth.ctx.now,
    makeId,
    fetchBytes: async (url: string) => {
      // Documents are fetched separately from pages: they are binary, they are
      // large, and the page fetcher decodes text.
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "PegasusMissionOS/1.0 (+https://mission.pegasus-studio.co)" },
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) return null;
        return new Uint8Array(await response.arrayBuffer());
      } catch {
        return null;
      }
    },
  });

  try {
    const result = await service.run(auth.ctx, {
      name,
      websiteUrl: input.websiteUrl?.trim() || undefined,
      country: input.country?.trim() || undefined,
      registrationNumber: input.registrationNumber?.trim() || undefined,
      organisationType: input.organisationType,
    });

    revalidatePath("/onboarding/review");
    revalidatePath("/onboarding");

    return succeeded(
      result.candidates.length > 0
        ? `Found ${result.candidates.length} things about ${name} across ${result.sources.length} sources. Nothing has been added to your profile yet.`
        : "Research finished without establishing anything from public sources. You can enter your details directly.",
    );
  } catch (error) {
    // A failed run must not look like an empty organisation.
    return {
      ok: false,
      message: `Research could not complete: ${
        error instanceof Error ? error.message : "unknown error"
      }. Nothing was changed.`,
    };
  }
}

/**
 * Record a decision on one candidate.
 *
 * The one transition in the pipeline a person must make. `confirm` yields a
 * verified claim, `edit` yields a provided one because the value became the
 * human's rather than the source's, and `reject` writes only the decision.
 */
export async function reviewCandidate(
  candidateId: string,
  decision: "confirm" | "edit" | "reject",
  editedValue?: string,
): Promise<ActionResult> {
  const auth = await authorise("profile:edit");
  if (!auth.ok) return auth.result;

  if (decision === "edit" && !editedValue?.trim()) {
    return { ok: false, message: "An edited value cannot be empty." };
  }

  const repo = getRepository();
  const result = await repo.onboarding.decide(auth.ctx, candidateId, decision, editedValue);

  if (!result) {
    return { ok: false, message: "That finding could not be found." };
  }

  revalidatePath("/onboarding/review");
  return succeeded(
    decision === "reject"
      ? "Discarded. Nothing was added to your profile."
      : decision === "edit"
        ? "Saved as your value, with the original source kept for the record."
        : "Confirmed.",
  );
}

/**
 * Upload a document.
 *
 * Parsed, structured and put in front of a person. The file is never handed to
 * a model, and nothing it contains reaches the profile without passing through
 * the same review as everything else.
 */
export async function uploadOnboardingDocument(form: FormData): Promise<ActionResult> {
  const auth = await authorise("evidence:manage");
  if (!auth.ok) return auth.result;

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a file to upload." };
  }

  // A cap, stated rather than discovered by running out of memory.
  if (file.size > 25_000_000) {
    return { ok: false, message: "That file is larger than 25MB, which is more than Pegasus reads." };
  }

  const kind = (String(form.get("kind") ?? "other") || "other") as DocumentKind;
  const repo = getRepository();

  const service = new DocumentDiscoveryService({ repo, now: auth.ctx.now, makeId });

  const result = await service.ingest(auth.ctx, {
    bytes: new Uint8Array(await file.arrayBuffer()),
    fileName: file.name,
    title: String(form.get("title") ?? "") || file.name,
    kind,
    origin: "upload",
    // The organisation's own document, so it speaks for the organisation.
    authority: "organisation",
    containsPersonalData: form.get("containsPersonalData") === "on",
  });

  // Candidates from an upload join the run awaiting review, so an upload after
  // research does not create a second queue in a different place.
  const run = await repo.onboarding.latestRun(auth.ctx);
  if (run && result.candidates.length > 0) {
    await repo.onboarding.saveCandidates(auth.ctx, run.id, result.candidates);
  }

  revalidatePath("/onboarding/review");

  if (result.deduplicated) {
    return succeeded("Pegasus already holds an identical copy of that file, so nothing was added.");
  }

  if (result.parse.status !== "parsed") {
    // Recorded, not silently dropped. The document is on file and the reason
    // it could not be read is on the record.
    return {
      ok: true,
      message: `${result.title} was saved, but could not be read. ${result.parse.note ?? ""}`.trim(),
    };
  }

  return succeeded(
    result.candidates.length > 0
      ? `Read ${result.title} and found ${result.candidates.length} things to review.`
      : `Read ${result.title}. Nothing was extracted from it that Pegasus could label confidently.`,
  );
}
