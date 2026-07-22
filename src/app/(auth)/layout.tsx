import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface p-10 lg:flex">
        <div className="absolute inset-0 grid-motif" aria-hidden />
        <Link href="/" className="relative">
          <Wordmark showProduct size="lg" />
        </Link>
        <div className="relative max-w-sm">
          <div className="eyebrow mb-4">Pegasus Mission OS</div>
          <p className="font-serif text-heading-lg font-medium leading-tight tracking-tight text-ink">
            Every mission deserves world-class technology.
          </p>
          <p className="mt-4 text-sm text-ink-muted">
            One intelligent place to discover funding, manage applications, run
            programmes and demonstrate impact.
          </p>
        </div>
        <div className="relative text-xs text-ink-subtle">
          The operating system for mission-driven organisations.
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark showProduct />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
