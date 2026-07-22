import {
  BarChart3,
  FileText,
  Image,
  Quote,
  ShieldCheck,
  ClipboardList,
} from "lucide-react";
import type { EvidenceItem, EvidenceType } from "@/types/domain";
import { VerificationBadge } from "@/components/shared/misc";

const TYPE_ICON: Record<EvidenceType, React.ComponentType<{ className?: string }>> = {
  document: FileText,
  statistic: BarChart3,
  testimonial: Quote,
  case_study: FileText,
  image: Image,
  attendance: ClipboardList,
  survey: ClipboardList,
  evaluation: FileText,
  financial: BarChart3,
  policy: ShieldCheck,
  external_reference: FileText,
};

/** Compact reference to an evidence item, used across programmes and reports. */
export function EvidenceReference({ item }: { item: EvidenceItem }) {
  const Icon = TYPE_ICON[item.type];
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-surface-sunken text-ink-subtle">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{item.title}</div>
        <div className="text-xs text-ink-subtle">
          {item.statValue
            ? `${item.statValue} ${item.statLabel ?? ""}`
            : item.quote
              ? `"${item.quote}"`
              : item.description}
        </div>
      </div>
    </div>
  );
}

export function EvidenceReferenceList({
  evidence,
  emptyLabel = "No evidence linked.",
}: {
  evidence: EvidenceItem[];
  emptyLabel?: string;
}) {
  if (evidence.length === 0) {
    return <p className="text-sm text-ink-subtle">{emptyLabel}</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {evidence.map((item) => (
        <li key={item.id} className="flex items-start justify-between gap-2">
          <EvidenceReference item={item} />
          <VerificationBadge state={item.verification} />
        </li>
      ))}
    </ul>
  );
}

export { TYPE_ICON };
