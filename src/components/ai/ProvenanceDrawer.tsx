"use client";

import { useState } from "react";
import { FileSearch, ShieldQuestion } from "lucide-react";
import type { AIProvenance } from "@/types/domain";
import { Modal } from "@/components/shared/Modal";

/**
 * Private provenance panel for AI output. Shows the organisation data used,
 * assumptions made, and what could not be verified. This is never included in
 * an exported application or report unless the user explicitly adds it.
 */
export function ProvenanceButton({ provenance }: { provenance: AIProvenance }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
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
          <ProvenanceList label="Organisation profile fields used" items={provenance.profileFieldsUsed} />
          <ProvenanceList label="Documents and evidence used" items={provenance.documentsUsed} />
          <ProvenanceList label="Programme data used" items={provenance.programmeDataUsed} />
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
