"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, FileText, Globe, Landmark, Pencil, X } from "lucide-react";
import { Button, Card, CardBody, Pill } from "@/components/shared/ui";
import { useToast } from "@/components/shared/Toast";
import { reviewCandidate } from "@/server/actions/onboarding";
import type { CandidateFinding } from "@/lib/onboarding/context-builder";
import type { ProfileCandidate } from "@/lib/organisation-intelligence/types";

/**
 * One finding, with its provenance and the three decisions a reviewer can make.
 *
 * The design rule this screen exists to serve: **a reviewer must be able to
 * check the claim, not just the label.** So every card shows the value, where
 * it came from, exactly where in that source, and how it was read. Approving
 * without that is rubber-stamping, and rubber-stamping is what makes an
 * extraction pipeline dangerous rather than useful.
 */

const METHOD_LABELS: Record<string, string> = {
  "json-ld": "structured data",
  microdata: "structured data",
  meta: "page metadata",
  heading: "a page heading",
  pattern: "a labelled pattern",
  registry: "the official register",
  document: "a document",
  ai: "interpretation",
};

function SourceIcon({ method }: { method: string }) {
  if (method === "registry") return <Landmark className="h-3.5 w-3.5" aria-hidden />;
  if (method === "document") return <FileText className="h-3.5 w-3.5" aria-hidden />;
  return <Globe className="h-3.5 w-3.5" aria-hidden />;
}

function Provenance({ candidate }: { candidate: ProfileCandidate }) {
  const isUrl = /^https?:/.test(candidate.sourceUrl);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-subtle">
      <span className="inline-flex items-center gap-1.5">
        <SourceIcon method={candidate.method} />
        Read from {METHOD_LABELS[candidate.method] ?? candidate.method}
      </span>
      <span aria-hidden>·</span>
      <span>at {candidate.locator}</span>
      {isUrl && (
        <>
          <span aria-hidden>·</span>
          <a
            href={candidate.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-accent hover:underline"
          >
            View source
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </>
      )}
    </div>
  );
}

export function CandidateCard({
  finding,
  decided,
}: {
  finding: CandidateFinding;
  decided?: { decision: string };
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(finding.candidate.value);
  const [chosenId, setChosenId] = useState(finding.candidate.id);

  const alternatives = finding.alternatives ?? [];
  const chosen = alternatives.find((c) => c.id === chosenId) ?? finding.candidate;

  const decide = (decision: "confirm" | "edit" | "reject") => {
    startTransition(async () => {
      const result = await reviewCandidate(
        // For a conflict, the decision applies to whichever side was chosen.
        chosen.id,
        decision,
        decision === "edit" ? value : undefined,
      );
      notify(
        result.message ?? (result.ok ? "Saved." : "That did not work."),
        result.ok ? "success" : "error",
      );
      if (result.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  };

  if (decided) {
    return (
      <Card className="opacity-60">
        <CardBody className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <div className="text-xs text-ink-subtle">{finding.label}</div>
            <div className="truncate text-sm text-ink">{finding.candidate.value}</div>
          </div>
          <Pill className="flex-shrink-0">
            {decided.decision === "reject"
              ? "Discarded"
              : decided.decision === "edit"
                ? "Edited and saved"
                : "Confirmed"}
          </Pill>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="eyebrow mb-1.5">{finding.label}</div>

            {editing ? (
              <textarea
                value={value}
                onChange={(event) => setValue(event.target.value)}
                rows={3}
                aria-label={`Edit ${finding.label}`}
                className="w-full rounded-md border border-line bg-surface p-2.5 text-sm text-ink focus:border-accent focus:outline-none"
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-ink">{chosen.value}</p>
            )}

            {alternatives.length > 1 && !editing && (
              <fieldset className="mt-3 rounded-md border border-line bg-surface-sunken p-3">
                <legend className="px-1 text-xs font-medium text-ink-muted">
                  Choose which is right
                </legend>
                {finding.recommendationReason && (
                  <p className="mb-2 text-xs text-ink-subtle">{finding.recommendationReason}</p>
                )}
                <div className="space-y-2">
                  {alternatives.map((alternative, index) => (
                    <label key={alternative.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name={`conflict-${finding.candidate.id}`}
                        checked={chosenId === alternative.id}
                        onChange={() => {
                          setChosenId(alternative.id);
                          setValue(alternative.value);
                        }}
                        className="mt-1"
                      />
                      <span className="min-w-0">
                        <span className="block text-ink">{alternative.value}</span>
                        <span className="block text-xs text-ink-subtle">
                          {alternative.sourceUrl} ({alternative.locator})
                          {index === 0 ? " · Pegasus would pick this" : ""}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {finding.candidate.excerpt && finding.candidate.excerpt !== chosen.value && (
              <blockquote className="mt-3 border-l-2 border-line pl-3 text-xs italic text-ink-subtle">
                {finding.candidate.excerpt}
              </blockquote>
            )}

            <p className="mt-2 text-xs text-ink-muted">{finding.reason}</p>
            <Provenance candidate={chosen} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button size="sm" onClick={() => decide("edit")} disabled={pending}>
                <Check className="h-4 w-4" aria-hidden />
                Save my version
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setValue(chosen.value);
                }}
                disabled={pending}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={() => decide("confirm")} disabled={pending}>
                <Check className="h-4 w-4" aria-hidden />
                {alternatives.length > 1 ? "Use this one" : "Confirm"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)} disabled={pending}>
                <Pencil className="h-4 w-4" aria-hidden />
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => decide("reject")} disabled={pending}>
                <X className="h-4 w-4" aria-hidden />
                Not right
              </Button>
            </>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
