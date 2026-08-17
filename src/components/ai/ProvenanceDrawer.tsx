"use client";

import { useState } from "react";
import { FileSearch, ShieldQuestion } from "lucide-react";
import type { EntityReference, GroundingRecord } from "@/types/domain";
import { Modal } from "@/components/shared/Modal";
import { StatusBadge } from "@/components/shared/StatusBadge";

/**
 * Private provenance panel for AI output.
 *
 * Shows what the generation **actually drew on**, what it was offered and did
 * not use, assumptions made, and what could not be verified. Never included in
 * an exported application or report unless the user explicitly adds it.
 *
 * The "not drawn on" list is deliberate. Previously this panel listed
 * everything available as though it had been used, which made the panel a
 * reassurance rather than a check (audit S2).
 */
export function ProvenanceButton({ provenance }: { provenance: GroundingRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-info hover:underline"
      >
        <FileSearch className="h-3.5 w-3.5" />
        View provenance
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Provenance"
        description="What this AI draft was based on. Private to your team and never exported unless you add it."
      >
        <div className="flex flex-col gap-4 text-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
            <StatusBadge
              tone={provenance.usedFallback ? "warning" : "info"}
              label={provenance.usedFallback ? "Offline fallback" : "Live generation"}
            />
            <span className="text-xs text-ink-subtle">
              {provenance.model} · prompt {provenance.promptVersion}
            </span>
          </div>

          {provenance.usedFallback && provenance.fallbackReason && (
            <p className="rounded border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
              This draft came from the deterministic fallback, not the live model.{" "}
              {provenance.fallbackReason}
            </p>
          )}

          <ReferenceList label="Data actually used" refs={provenance.used} />
          <ReferenceList
            label="Available but not drawn on"
            refs={provenance.unused}
            emptyLabel="Everything available was used."
            muted
          />
          <ProvenanceList label="Assumptions made" items={provenance.assumptions} tone="warning" />
          <ProvenanceList
            label="Could not be verified"
            items={provenance.couldNotVerify}
            tone="critical"
            emptyLabel="Everything referenced was drawn from your data."
          />
        </div>
      </Modal>
    </>
  );
}

function ReferenceList({
  label,
  refs,
  emptyLabel = "None recorded.",
  muted = false,
}: {
  label: string;
  refs: EntityReference[];
  emptyLabel?: string;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{label}</div>
      {refs.length === 0 ? (
        <p className="text-xs text-ink-subtle">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {refs.map((ref) => (
            <li
              key={`${ref.type}:${ref.id}`}
              className={`flex items-start gap-2 text-sm ${muted ? "text-ink-subtle" : "text-ink-muted"}`}
            >
              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-current" />
              <span>
                {ref.label ?? ref.id}
                <span className="ml-1.5 text-xs text-ink-subtle">
                  {ref.type.replace(/_/g, " ")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProvenanceList({
  label,
  items,
  tone,
  emptyLabel = "None recorded.",
}: {
  label: string;
  items: string[];
  tone?: "warning" | "critical";
  emptyLabel?: string;
}) {
  return (
    <div>
      <div className="eyebrow mb-1.5 flex items-center gap-1.5">
        {tone && <ShieldQuestion className="h-3.5 w-3.5" />}
        {label}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-ink-subtle">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item, i) => (
            <li
              key={i}
              className={`flex items-start gap-2 text-sm ${
                tone === "critical"
                  ? "text-critical"
                  : tone === "warning"
                    ? "text-warning"
                    : "text-ink-muted"
              }`}
            >
              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-current" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
