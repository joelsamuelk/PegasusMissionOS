import { CircleDashed, Compass, FlaskConical } from "lucide-react";
import { appConfig } from "@/lib/config";
import { STATUS_LABEL, type ProductStatus } from "@/lib/marketing/content";
import { cn } from "@/lib/utils";

/**
 * Shared marketing furniture.
 *
 * All server components. The marketing site ships five client islands in total
 * and none of them is here: everything in this file renders to HTML and adds
 * nothing to the bundle.
 */

// --- Section shell -------------------------------------------------------

/**
 * Every section is a labelled landmark with exactly one `<h2>`, so the page
 * reads as an outline in a screen reader rather than as a wall of divs. The
 * heading id is derived from the section id, which is also the nav target.
 */
export function Section({
  id,
  children,
  className,
  tone = "paper",
  bordered = false,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  tone?: "paper" | "surface" | "navy";
  bordered?: boolean;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={cn(
        "scroll-mt-24",
        tone === "surface" && "bg-surface",
        tone === "navy" && "bg-navy",
        bordered && "border-y border-line",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:py-28">
        {children}
      </div>
    </section>
  );
}

export function SectionHeader({
  id,
  eyebrow,
  title,
  lead,
  status,
  align = "left",
  invert = false,
  className,
}: {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  status?: ProductStatus;
  align?: "left" | "center";
  invert?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        align === "center" && "mx-auto max-w-3xl text-center",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "eyebrow",
            invert && "text-white/55",
            align === "center" && "mx-auto",
          )}
        >
          {eyebrow}
        </span>
        {status && <StatusChip status={status} invert={invert} />}
      </div>
      <h2
        id={`${id}-heading`}
        className={cn(
          "mt-4 max-w-3xl text-balance font-heading text-[1.75rem] font-semibold leading-[1.12] tracking-[-0.025em] sm:text-[2.15rem] lg:text-[2.5rem]",
          invert ? "text-white" : "text-ink",
          align === "center" && "mx-auto",
        )}
      >
        {title}
      </h2>
      {lead && (
        <p
          className={cn(
            "mt-5 max-w-2xl text-[1.0625rem] leading-relaxed",
            invert ? "text-white/70" : "text-ink-muted",
            align === "center" && "mx-auto",
          )}
        >
          {lead}
        </p>
      )}
    </div>
  );
}

// --- Honesty label -------------------------------------------------------

const STATUS_ICON: Record<ProductStatus, React.ComponentType<{ className?: string }>> = {
  demo: FlaskConical,
  in_development: CircleDashed,
  planned: Compass,
};

/**
 * The only mechanism on the site for qualifying a capability claim.
 *
 * Three states, five instances across the whole page, each attached to the
 * artefact it qualifies rather than sprinkled over a grid — see
 * `docs/MARKETING_SITE_ARCHITECTURE.md` §9.4. Each carries an icon and a word,
 * so the distinction never rests on colour alone.
 */
export function StatusChip({
  status,
  invert = false,
  className,
}: {
  status: ProductStatus;
  invert?: boolean;
  className?: string;
}) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em]",
        invert
          ? "border-white/20 bg-white/10 text-white/80"
          : status === "demo"
            ? "border-info/25 bg-info-soft text-info"
            : status === "in_development"
              ? "border-warning/30 bg-warning-soft text-warning"
              : "border-line-strong bg-surface-sunken text-ink-muted",
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

// --- Product preview chrome ---------------------------------------------

/**
 * Application chrome around an HTML product recreation.
 *
 * Replaces the bitmap screenshots the site used to lean on. A recreation is
 * responsive, readable at 375px, themable and legible to a screen reader; a
 * 1600px PNG is none of those, and it goes stale silently.
 *
 * The address is configuration, never a literal, so the site can be pointed at
 * a different application host without editing components.
 */
export function AppFrame({
  children,
  path = "",
  label,
  className,
  compact = false,
}: {
  children: React.ReactNode;
  path?: string;
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  const host = appConfig.appUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-line bg-surface shadow-elev-3",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b border-line bg-surface-sunken px-4",
          compact ? "py-2.5" : "py-3",
        )}
      >
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" aria-hidden />
        <span className="ml-3 hidden min-w-0 truncate rounded-full bg-surface px-3 py-1 text-[0.7rem] text-ink-subtle sm:block">
          {host}
          {path}
        </span>
        {label && (
          <span className="ml-auto truncate text-[0.7rem] font-medium text-ink-subtle">
            {label}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/** The application's left rail, at preview scale. Decorative. */
export function AppRail({
  items,
  active,
}: {
  items: readonly string[];
  active: string;
}) {
  return (
    <div
      className="hidden w-40 flex-shrink-0 border-r border-line bg-surface-sunken/60 p-3 lg:block"
      aria-hidden
    >
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <li
            key={item}
            className={cn(
              "truncate rounded-md px-2.5 py-1.5 text-[0.75rem]",
              item === active
                ? "bg-surface font-semibold text-ink shadow-elev-1"
                : "text-ink-subtle",
            )}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Small preview parts -------------------------------------------------

export function MiniMetric({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "warning" | "success";
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="eyebrow text-[0.6rem]">{label}</div>
      <div className="mt-2 font-heading text-[1.35rem] font-semibold leading-none tracking-tight text-ink">
        {value}
      </div>
      {hint && (
        <div
          className={cn(
            "mt-1.5 text-[0.7rem] leading-snug",
            tone === "warning"
              ? "text-warning"
              : tone === "success"
                ? "text-success"
                : "text-ink-muted",
          )}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

export function KeyValue({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5 sm:flex-row sm:gap-3", className)}>
      <dt className="min-w-[9.5rem] flex-shrink-0 text-[0.8125rem] text-ink-subtle">
        {label}
      </dt>
      <dd className="text-[0.8125rem] text-ink">{children}</dd>
    </div>
  );
}

/** A labelled step in a chain, used by the funding, lifecycle and impact rails. */
export function ChainStep({
  label,
  index,
  total,
  emphasis = false,
}: {
  label: string;
  index: number;
  total: number;
  emphasis?: boolean;
}) {
  return (
    <li className="flex min-w-0 items-center gap-2">
      <span
        className={cn(
          "whitespace-nowrap rounded-full border px-3 py-1.5 text-[0.75rem] font-medium",
          emphasis
            ? "border-accent/35 bg-accent-soft text-accent-ink"
            : "border-line bg-surface text-ink-muted",
        )}
      >
        {label}
      </span>
      {index < total - 1 && (
        <span className="h-px w-4 flex-shrink-0 bg-line-strong sm:w-6" aria-hidden />
      )}
    </li>
  );
}

/** Small caption used beneath previews to name the data they are drawn from. */
export function PreviewCaption({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 text-xs leading-relaxed text-ink-subtle">{children}</p>
  );
}
