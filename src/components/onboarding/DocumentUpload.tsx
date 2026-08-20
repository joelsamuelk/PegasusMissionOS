"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button, Card, CardBody } from "@/components/shared/ui";
import { useToast } from "@/components/shared/Toast";
import { uploadOnboardingDocument } from "@/server/actions/onboarding";

/**
 * Document upload.
 *
 * Two things on this form are deliberate rather than decorative.
 *
 * The **kind** is asked for rather than guessed, because it decides how much
 * authority the contents carry and which extractors run. Guessing "accounts"
 * from a filename and then reading an income figure out of a brochure is a
 * cheap mistake with an expensive consequence.
 *
 * The **personal data** checkbox exists because documents are the most likely
 * route for beneficiary information to enter the product. Declaring it is how
 * a person tells Pegasus to keep it out of contexts it would otherwise reach.
 */

const KINDS = [
  { value: "annual_report", label: "Annual report" },
  { value: "impact_report", label: "Impact report" },
  { value: "accounts", label: "Accounts" },
  { value: "strategy", label: "Strategy" },
  { value: "evaluation", label: "Evaluation" },
  { value: "policy", label: "Policy" },
  { value: "governance", label: "Governance document" },
  { value: "other", label: "Something else" },
];

export function DocumentUpload() {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [fileName, setFileName] = useState<string>("");

  const submit = (form: FormData) => {
    startTransition(async () => {
      const result = await uploadOnboardingDocument(form);
      notify(
        result.message ?? (result.ok ? "Uploaded." : "That did not work."),
        result.ok ? "success" : "error",
      );
      if (result.ok) {
        formRef.current?.reset();
        setFileName("");
        router.refresh();
      }
    });
  };

  const field =
    "mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink " +
    "focus:border-accent focus:outline-none";

  return (
    <Card>
      <CardBody>
        <form ref={formRef} action={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="doc-file" className="text-sm font-medium text-ink">
                File
              </label>
              <input
                id="doc-file"
                name="file"
                type="file"
                accept=".pdf,.docx,.xlsx,.csv,.txt"
                onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
                className={field}
                required
              />
              <p className="mt-1.5 text-xs text-ink-subtle">
                PDF, Word, Excel, CSV or plain text, up to 25MB. Scanned documents cannot be read.
              </p>
            </div>

            <div>
              <label htmlFor="doc-kind" className="text-sm font-medium text-ink">
                What is it?
              </label>
              <select id="doc-kind" name="kind" className={field} defaultValue="annual_report">
                {KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="doc-title" className="text-sm font-medium text-ink">
              Title <span className="font-normal text-ink-subtle">(optional)</span>
            </label>
            <input
              id="doc-title"
              name="title"
              placeholder={fileName || "Annual report 2026"}
              className={field}
            />
          </div>

          <label className="flex items-start gap-2.5 text-sm text-ink">
            <input type="checkbox" name="containsPersonalData" className="mt-1" />
            <span>
              This document names or describes individuals.
              <span className="block text-xs text-ink-subtle">
                Pegasus will keep it out of any context sent to an AI provider.
              </span>
            </span>
          </label>

          <Button type="submit" disabled={pending}>
            <Upload className="h-4 w-4" aria-hidden />
            {pending ? "Reading" : "Upload and read"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
