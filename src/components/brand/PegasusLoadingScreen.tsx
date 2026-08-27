import { PegasusGlyph } from "@/components/brand/Wordmark";

/** Full-page route fallback shared by public, customer and Control surfaces. */
export function PegasusLoadingScreen() {
  return (
    <main
      className="brand-wash flex min-h-screen items-center justify-center bg-paper p-6"
      role="status"
      aria-live="polite"
      aria-label="Loading Pegasus"
    >
      <div className="flex flex-col items-center">
        <div className="pegasus-loader-mark flex h-24 w-24 items-center justify-center rounded-[1.75rem] bg-navy shadow-lg sm:h-28 sm:w-28">
          <PegasusGlyph className="h-14 w-auto text-accent sm:h-16" />
        </div>
        <span className="mt-5 font-heading text-lg font-semibold tracking-tight text-ink">
          Pegasus
        </span>
        <span className="sr-only">Loading</span>
      </div>
    </main>
  );
}
