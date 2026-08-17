import { cn } from "@/lib/utils";

/**
 * Pegasus wordmark. The glyph is the Pegasus Studio mark — a coral arc with a
 * rising dot — set alongside the Pegasus name in the brand display face.
 */
export function Wordmark({
  className,
  showProduct = false,
  size = "md",
}: {
  className?: string;
  showProduct?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const nameSize =
    size === "lg" ? "text-xl" : size === "sm" ? "text-[0.95rem]" : "text-[1.0625rem]";
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <PegasusGlyph
        className={cn(
          "text-accent",
          size === "lg" ? "h-7 w-auto" : size === "sm" ? "h-5 w-auto" : "h-6 w-auto",
        )}
      />
      <span className="inline-flex flex-col leading-none">
        <span
          className={cn(
            "font-heading font-semibold tracking-tight text-ink",
            nameSize,
          )}
        >
          Pegasus
        </span>
        {showProduct && (
          <span className="eyebrow mt-1 text-[0.6rem] tracking-[0.16em]">Mission OS</span>
        )}
      </span>
    </span>
  );
}

/**
 * The Pegasus mark: a sweeping arc beneath a rising dot, in brand coral.
 * Drawn in `currentColor` so it can be tinted by context.
 */
export function PegasusGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 264 200"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M28 66 Q130 196 232 66"
        stroke="currentColor"
        strokeWidth="34"
        strokeLinecap="round"
      />
      <circle cx="236" cy="30" r="18" fill="currentColor" />
    </svg>
  );
}

/**
 * The mark used as a large decorative motif, as on the studio site: oversized,
 * low-opacity and non-interactive. Positioning is supplied by the caller.
 */
export function BrandMotif({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 190"
      fill="none"
      aria-hidden="true"
      className={cn("pointer-events-none absolute text-accent", className)}
    >
      <path
        d="M28 66 Q130 196 232 66"
        stroke="currentColor"
        strokeWidth="34"
        strokeLinecap="round"
      />
      <circle cx="236" cy="30" r="18" fill="currentColor" />
    </svg>
  );
}
