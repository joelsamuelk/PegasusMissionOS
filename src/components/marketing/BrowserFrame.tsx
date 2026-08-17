import Image, { type StaticImageData } from "next/image";
import { cn } from "@/lib/utils";

/**
 * Wraps a product screenshot in light browser chrome so it reads as the real
 * application rather than as decoration.
 */
export function BrowserFrame({
  src,
  alt,
  label = "app.pegasus-studio.co",
  priority = false,
  className,
}: {
  src: StaticImageData;
  alt: string;
  label?: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-line bg-surface shadow-elev-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-line bg-surface-sunken px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="ml-3 hidden rounded-full bg-surface px-3 py-1 text-[0.7rem] text-ink-subtle sm:block">
          {label}
        </span>
      </div>
      <Image src={src} alt={alt} priority={priority} className="w-full" sizes="100vw" />
    </div>
  );
}
