import Image from "next/image";
import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden min-h-screen border-r border-line bg-surface p-6 lg:block xl:p-8">
        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-5">
          <Link href="/" className="relative w-fit">
            <Wordmark showProduct size="lg" />
          </Link>

          <div className="relative min-h-[30rem] overflow-hidden rounded-[2rem] bg-navy shadow-elev-2">
            <Image
              src="/photos/mission-collaboration-login.jpg"
              alt="Community and charity leaders working together around a shared programme plan"
              fill
              priority
              sizes="50vw"
              className="object-cover object-center"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-navy/95 via-navy/10 to-transparent"
              aria-hidden
            />
            <div
              className="absolute inset-0 bg-gradient-to-r from-navy/20 via-transparent to-transparent"
              aria-hidden
            />

            <div className="absolute left-6 top-6 rounded-full border border-white/25 bg-white/90 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink shadow-elev-1 backdrop-blur-sm xl:left-8 xl:top-8">
              Built for people doing meaningful work
            </div>

            <div className="absolute inset-x-0 bottom-0 p-7 xl:p-10">
              <div className="eyebrow mb-4 text-white/65">Pegasus Mission OS</div>
              <p className="max-w-lg font-heading text-heading-lg font-semibold leading-tight text-white xl:text-display">
                Every mission deserves world-class technology.
              </p>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-white/75">
                One intelligent place to discover funding, manage applications, run
                programmes and demonstrate impact.
              </p>
            </div>
          </div>

          <div className="text-xs text-ink-subtle">
            The operating system for mission-driven organisations.
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark showProduct />
          </div>
          <div className="relative mb-8 h-44 overflow-hidden rounded-2xl bg-navy shadow-elev-2 lg:hidden">
            <Image
              src="/photos/mission-collaboration-login.jpg"
              alt="Community and charity leaders working together around a shared programme plan"
              fill
              priority
              sizes="calc(100vw - 3rem)"
              className="object-cover object-center"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-navy/80 via-transparent to-transparent"
              aria-hidden
            />
            <p className="absolute inset-x-5 bottom-4 font-heading text-title font-semibold text-white">
              Technology in service of people and purpose.
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
