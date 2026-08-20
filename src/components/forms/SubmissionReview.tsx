"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, EyeOff, Loader2 } from "lucide-react";
import type { SubmissionDetail } from "@/server/actions/forms";
import { applySubmission, rejectSubmission } from "@/server/actions/forms";
import { SENSITIVITY_LABELS, describeAggregate } from "@/lib/forms";
import { renderClaimValue } from "@/lib/knowledge";
import { Button, Card, CardBody, Pill } from "@/components/shared/ui";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";

/**
 * Reviewing what a submission would change.
 *
 * *Submission → candidate update → review where required → Mission Graph.*
 * This is the third arrow, and the screen is built around one property: a
 * reviewer must be able to accept some changes and not others. Anything that
 * forced all-or-nothing would push somebody into approving a change they did
 * not want in order to get the three they did.
 */
export function SubmissionReview({ detail }: { detail: SubmissionDetail }) {
  const { submission, answers, consent, projection, answersWithheld } = detail;
  const [accepted, setAccepted] = useState<Set<string>>(
    () =>
      new Set(
        (projection?.changes ?? [])
          .filter((change) => !change.requiresReview)
          .map((change) => change.mappingId),
      ),
  );
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { notify } = useToast();

  const toggle = (id: string) =>
    setAccepted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const decided = submission.status === "accepted" || submission.status === "rejected";

  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            tone={
              submission.status === "accepted"
                ? "success"
                : submission.status === "rejected"
                  ? "critical"
                  : submission.status === "spam"
                    ? "warning"
                    : "info"
            }
            label={submission.status.replace(/_/g, " ")}
          />
          <span className="text-xs text-ink-subtle">
            {submission.source} response, {submission.submittedAt.slice(0, 10)}
          </span>
          {submission.retainUntil && (
            <Pill>erased after {submission.retainUntil.slice(0, 10)}</Pill>
          )}
        </div>

        {answersWithheld && (
          <p className="flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
            <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This submission contains special category answers your role cannot read. They are
            not shown here and are not part of any change below.
          </p>
        )}

        <div>
          <p className="eyebrow mb-2">Answers</p>
          <ul className="space-y-2">
            {answers.map((answer) => (
              <li key={answer.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink">{answer.fieldLabel}</span>
                  {answer.sensitivity !== "internal" && answer.sensitivity !== "public" && (
                    <Pill className="border-warning/30 text-warning">
                      {SENSITIVITY_LABELS[answer.sensitivity]}
                    </Pill>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {answer.redacted ? "Erased under the retention policy." : renderClaimValue(answer.value)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {consent.length > 0 && (
          <div>
            <p className="eyebrow mb-2">Consent</p>
            <ul className="space-y-1">
              {consent.map((record) => (
                <li key={record.id} className="text-xs text-ink-muted">
                  <span className={record.granted ? "text-success" : "text-ink-subtle"}>
                    {record.granted ? "Given" : "Not given"}
                  </span>
                  {record.withdrawnAt ? " and later withdrawn" : ""}: {record.purpose}
                </li>
              ))}
            </ul>
          </div>
        )}

        {projection && (
          <>
            <div>
              <p className="eyebrow mb-2">What this would change</p>
              <p className="mb-3 text-xs text-ink-subtle">{projection.summary}</p>
              {projection.changes.length === 0 && projection.aggregates.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Nothing. No answer on this form is mapped to a record.
                </p>
              ) : (
                <ul className="space-y-2">
                  {projection.changes.map((change) => (
                    <li key={change.mappingId} className="text-sm">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={accepted.has(change.mappingId)}
                          onChange={() => toggle(change.mappingId)}
                          disabled={decided || pending}
                        />
                        <span>
                          <span className="text-ink">{change.summary}</span>
                          {change.existingValue && (
                            <span className="mt-0.5 flex items-start gap-1 text-xs text-warning">
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                              Replaces a value already recorded: {change.existingValue}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                  {projection.aggregates.map((aggregate) => (
                    <li key={aggregate.mapping.id} className="text-sm">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={accepted.has(aggregate.mapping.id)}
                          onChange={() => toggle(aggregate.mapping.id)}
                          disabled={decided || pending || aggregate.value === null}
                        />
                        <span>
                          <span className="text-ink">
                            Measure {aggregate.target?.label ?? aggregate.fieldKey}
                          </span>
                          <span className="mt-0.5 block text-xs text-ink-subtle">
                            {describeAggregate(aggregate)}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {projection.withheld.length > 0 && (
              <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
                <p className="eyebrow mb-1.5">Deliberately not applied</p>
                <ul className="space-y-1">
                  {projection.withheld.map((item, index) => (
                    <li key={index} className="text-xs text-ink-muted">
                      {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {projection.unmapped.length > 0 && (
              <p className="text-xs text-ink-subtle">
                {projection.unmapped.length} answer
                {projection.unmapped.length === 1 ? "" : "s"} on this form
                {projection.unmapped.length === 1 ? " has" : " have"} no mapping and go nowhere:{" "}
                {projection.unmapped.map((item) => item.label).join(", ")}.
              </p>
            )}
          </>
        )}

        {!decided && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button
              variant="blue"
              size="sm"
              disabled={pending || accepted.size === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await applySubmission(submission.id, [...accepted]);
                  if (!result.ok) notify(result.message ?? "That could not be applied.", "error");
                  else {
                    notify(`Applied ${result.applied?.length ?? 0} changes.`);
                    router.refresh();
                  }
                })
              }
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Apply {accepted.size} change{accepted.size === 1 ? "" : "s"}
            </Button>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why are you rejecting this?"
              className="h-8 flex-1 rounded-full border border-line-strong bg-surface px-3 text-xs text-ink outline-none placeholder:text-ink-subtle"
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await rejectSubmission(submission.id, note);
                  if (!result.ok) notify(result.message ?? "That could not be rejected.", "error");
                  else router.refresh();
                })
              }
            >
              Reject
            </Button>
          </div>
        )}

        {submission.reviewNote && (
          <p className="text-xs text-ink-subtle">Rejected: {submission.reviewNote}</p>
        )}
      </CardBody>
    </Card>
  );
}
