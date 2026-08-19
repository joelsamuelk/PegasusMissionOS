"use client";
import { useState } from "react";
const reasons = [
  "weak_evidence",
  "wrong_icp",
  "wrong_timing",
  "wrong_size",
  "no_credible_problem",
  "weak_pegasus_differentiation",
  "poor_buyer_access",
  "already_known",
  "not_strategically_interesting",
  "duplicate",
  "other",
];
export function PilotDisposition({ accountId }: { accountId: string }) {
  const [choice, setChoice] = useState<string>(),
    [showReject, setShowReject] = useState(false);
  if (choice)
    return (
      <div className="rounded-lg bg-success-soft p-3 text-xs text-success">
        <b>Founder decision recorded:</b> {choice.replaceAll("_", " ")}
        <button onClick={() => setChoice(undefined)} className="ml-2 underline">
          Change
        </button>
      </div>
    );
  return (
    <div className="border-t p-4">
      <p className="text-[10px] font-bold uppercase text-ink-subtle">
        Founder disposition required
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={() => setChoice("worth_contacting_now")}
          className="rounded-lg bg-success px-3 py-2 text-xs font-bold text-white"
        >
          Worth contacting now
        </button>
        <button
          onClick={() => setChoice("nurture")}
          className="rounded-lg border px-3 py-2 text-xs font-bold"
        >
          Nurture
        </button>
        <button
          onClick={() => setChoice("needs_more_research")}
          className="rounded-lg border px-3 py-2 text-xs font-bold"
        >
          Need more research
        </button>
        <button
          onClick={() => setShowReject(true)}
          className="rounded-lg border px-3 py-2 text-xs font-bold text-critical"
        >
          Reject
        </button>
      </div>
      {showReject && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            if (form.getAll("reason").length) setChoice("reject");
          }}
          className="mt-3 rounded-lg bg-critical-soft p-3"
        >
          <p className="text-xs font-bold text-critical">Select at least one reason</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {reasons.map((r) => (
              <label key={r} className="text-xs">
                <input type="checkbox" name="reason" value={r} className="mr-1" />
                {r.replaceAll("_", " ")}
              </label>
            ))}
          </div>
          <textarea
            name="note"
            className="mt-3 w-full rounded border bg-surface p-2 text-xs"
            placeholder="Optional founder note"
          />
          <button className="mt-2 rounded bg-critical px-3 py-1.5 text-xs font-bold text-white">
            Record rejection
          </button>
        </form>
      )}
      <input type="hidden" value={accountId} />
    </div>
  );
}
