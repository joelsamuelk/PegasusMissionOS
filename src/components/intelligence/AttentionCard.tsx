import Link from "next/link";
import { ChevronRight, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { hrefForEntity } from "@/lib/entity-links";
import {
  ATTENTION_CATEGORY_LABELS,
  isComposite,
  type AttentionItem,
  type AttentionSeverity,
} from "@/lib/intelligence";
import { Card, CardBody, Pill } from "@/components/shared/ui";
import { StatusBadge, type Tone } from "@/components/shared/StatusBadge";

const SEVERITY_TONE: Record<AttentionSeverity, Tone> = {
  critical: "critical",
  high: "warning",
  medium: "info",
  low: "neutral",
};

const SEVERITY_LABEL: Record<AttentionSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/**
 * One attention item, with its reasoning visible rather than available.
 *
 * The signals are rendered inline and not behind a disclosure. A ranked list
 * whose ranking is one click away is a ranking most people will take on trust,
 * and the product's whole claim is that it does not ask for that.
 */
export function AttentionCard({ item }: { item: AttentionItem }) {
  const composite = isComposite(item);

  return (
    <Card className={cn(composite && "border-blue/35")}>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={SEVERITY_TONE[item.severity]} label={SEVERITY_LABEL[item.severity]} />
          <Pill>{ATTENTION_CATEGORY_LABELS[item.category]}</Pill>
          {composite && (
            <Pill className="border-blue/35 text-blue">
              <Layers className="h-3 w-3" />
              {item.contributingCategories
                .map((c) => ATTENTION_CATEGORY_LABELS[c])
                .join(" + ")}
            </Pill>
          )}
          {item.dueInDays !== undefined && (
            <span className="text-xs text-ink-subtle">
              {item.dueInDays < 0
                ? `${-item.dueInDays} days overdue`
                : `due in ${item.dueInDays} days`}
            </span>
          )}
        </div>

        <div>
          <h3 className="font-heading text-base font-semibold text-ink">{item.title}</h3>
          <p className="mt-1 text-sm text-ink-muted">{item.detail}</p>
        </div>

        {item.signals.length > 0 && (
          <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
            <p className="eyebrow mb-1.5">Why this is here</p>
            <ul className="space-y-1">
              {item.signals.map((signal, index) => (
                <li key={`${signal.code}:${index}`} className="text-xs text-ink-muted">
                  <span className="font-medium text-ink">{signal.label}.</span> {signal.detail}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <SourceList sources={item.sources} />
          {item.action?.href && (
            <Link
              href={item.action.href}
              className="inline-flex items-center gap-1 text-sm font-medium text-info hover:underline"
            >
              {item.action.label}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * The records an item rests on.
 *
 * Rendered as links wherever the entity has a page, because a citation you
 * cannot follow is a citation you cannot check.
 */
export function SourceList({
  sources,
  limit = 6,
}: {
  sources: AttentionItem["sources"];
  limit?: number;
}) {
  if (sources.length === 0) return null;
  const shown = sources.slice(0, limit);

  return (
    <p className="text-xs text-ink-subtle">
      <span className="eyebrow mr-1.5">Based on</span>
      {shown.map((source, index) => {
        const href = hrefForEntity(source.type, source.id);
        const label = source.label ?? `${source.type.replace(/_/g, " ")} ${source.id}`;
        return (
          <span key={`${source.type}:${source.id}`}>
            {index > 0 && ", "}
            {href ? (
              <Link href={href} className="text-info hover:underline">
                {label}
              </Link>
            ) : (
              label
            )}
          </span>
        );
      })}
      {sources.length > shown.length && ` and ${sources.length - shown.length} more`}
    </p>
  );
}
