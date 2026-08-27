"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy, Loader2 } from "lucide-react";
import type { FinancialImport, TransactionCandidateRecord } from "@/server/data/types";
import { postTransactions } from "@/server/actions/finance";
import { formatMoney } from "@/lib/finance-intelligence/money";
import { Button, Card, CardBody, Pill } from "@/components/shared/ui";
import { StatusBadge, type Tone } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";

const CONFIDENCE_TONE: Record<TransactionCandidateRecord["confidence"], Tone> = {
  certain: "success",
  probable: "info",
  possible: "warning",
};

/**
 * Reviewing an imported statement.
 *
 * Rows that need a person are unticked by default and rows that do not are
 * ticked, so the default action is the safe one and the work is visible. Every
 * suggestion shows the evidence that produced it: a reviewer approving forty
 * transactions is otherwise approving forty assertions.
 */
export function ImportReview({
  record,
  candidates,
}: {
  record: FinancialImport;
  candidates: TransactionCandidateRecord[];
}) {
  const pendingRows = candidates.filter((candidate) => !candidate.postedTransactionId);
  const [accepted, setAccepted] = useState<Set<number>>(
    () =>
      new Set(
        pendingRows
          .filter((candidate) => !candidate.requiresApproval)
          .map((candidate) => candidate.rowNumber),
      ),
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { notify } = useToast();

  const toggle = (rowNumber: number) =>
    setAccepted((current) => {
      const next = new Set(current);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              tone={record.status === "posted" ? "success" : "info"}
              label={record.status.replace(/_/g, " ")}
            />
            <span className="text-xs text-ink-subtle">
              {record.rowCount} rows read, {record.postedCount} posted.
            </span>
          </div>

          <p className="text-xs text-ink-muted">
            Columns read as:{" "}
            {record.detectedColumns
              .map((column) => `${column.header} → ${column.detected}`)
              .join(", ")}
          </p>

          {record.dateFormatAmbiguous && (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Every date in this file has a day of twelve or below, so day/month and
              month/day cannot be told apart. Dates were read as day first. Check a few
              before posting.
            </p>
          )}

          {record.problems.length > 0 && (
            <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
              <p className="eyebrow mb-1.5">
                {record.problems.length} row{record.problems.length === 1 ? "" : "s"} could not
                be read
              </p>
              <ul className="space-y-1">
                {record.problems.slice(0, 8).map((problem, index) => (
                  <li key={index} className="text-xs text-ink-muted">
                    Row {problem.rowNumber}: {problem.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <ul className="space-y-3">
            {candidates.map((candidate) => (
              <li key={candidate.id} className="border-b border-line pb-3 last:border-0">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={accepted.has(candidate.rowNumber)}
                    onChange={() => toggle(candidate.rowNumber)}
                    disabled={pending || Boolean(candidate.postedTransactionId)}
                  />
                  <span className="flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-ink">{candidate.description}</span>
                      <span className="text-sm font-medium text-ink">
                        {candidate.direction === "expenditure" ? "-" : "+"}
                        {formatMoney(candidate.amount)}
                      </span>
                      <span className="text-xs text-ink-subtle">{candidate.date}</span>
                      <StatusBadge
                        tone={CONFIDENCE_TONE[candidate.confidence]}
                        label={candidate.confidence}
                      />
                      {candidate.suggestedCategory && <Pill>{candidate.suggestedCategory}</Pill>}
                      {candidate.duplicateReason && (
                        <Pill className="border-warning/35 text-warning">
                          <Copy className="h-3 w-3" />
                          possible duplicate
                        </Pill>
                      )}
                      {candidate.postedTransactionId && (
                        <Pill className="border-success/30 text-success">posted</Pill>
                      )}
                    </span>
                    <span className="mt-1 block space-y-0.5">
                      {candidate.evidence.map((item, index) => (
                        <span key={index} className="block text-xs text-ink-subtle">
                          {item.detail}
                        </span>
                      ))}
                      {candidate.duplicateReason && (
                        <span className="block text-xs text-warning">
                          {candidate.duplicateReason}
                        </span>
                      )}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {record.status !== "posted" && (
            <Button
              variant="blue"
              size="sm"
              disabled={pending || accepted.size === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await postTransactions(record.id, [...accepted]);
                  if (!result.ok) notify(result.message ?? "Nothing was posted.", "error");
                  else {
                    notify(`Posted ${result.posted} transactions.`);
                    router.refresh();
                  }
                })
              }
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Post {accepted.size} transaction{accepted.size === 1 ? "" : "s"}
            </Button>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
