import { cn } from "@/lib/utils";

/**
 * Pegasus wordmark rendered as text. No fabricated logo asset is used.
 * The mark pairs a precise geometric glyph with the Pegasus name.
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
    size === "lg" ? "text-lg" : size === "sm" ? "text-[0.9rem]" : "text-base";
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <PegasusGlyph
        className={cn(
          "text-ink",
          size === "lg" ? "h-7 w-7" : size === "sm" ? "h-5 w-5" : "h-6 w-6",
        )}
      />
      <span className="inline-flex flex-col leading-none">
        <span className={cn("font-semibold tracking-tight text-ink", nameSize)}>
          Pegasus
        </span>
        {showProduct && (
          <span className="eyebrow mt-1 text-[0.6rem] tracking-[0.16em]">Mission OS</span>
        )}
      </span>
    </span>
  );
}

/** A restrained, architectural mark: a rising angular form within a frame. */
export function PegasusGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden="true"
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="2" />
      <path d="M6 18 L12 6 L18 18" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M8.5 13 L15.5 13" strokeLinecap="round" />
    </svg>
  );
}
