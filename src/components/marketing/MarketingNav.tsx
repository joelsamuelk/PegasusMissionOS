"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { NAV_LINKS } from "@/lib/marketing/content";
import { Wordmark } from "@/components/brand/Wordmark";
import { ButtonLink } from "@/components/shared/ui";
import { domainPaths } from "@/lib/domains";

/**
 * The marketing site's only above-the-fold client island.
 *
 * The desktop nav is plain links and would work as a server component; the
 * mobile sheet is what needs JavaScript, and splitting the two would mean two
 * copies of the link list drifting apart. The whole nav is ~2kB of behaviour.
 *
 * The sheet is a real modal: `aria-modal`, focus moved into it on open and
 * restored to the trigger on close, focus trapped while it is open, Escape to
 * dismiss, and body scroll locked. A menu that a keyboard user can tab out of
 * behind is worse than no menu, because they cannot tell they have left it.
 *
 * Links are root-relative now that the site has two routes (`/` and
 * `/product`), so `NavLink` below routes `/product` through `next/link` and
 * leaves `/#trust` as a plain anchor — the browser scrolls it in-document when
 * you are already on `/`, and navigates then scrolls when you are not.
 */
export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Captured now rather than read in cleanup: by the time this effect tears
    // down the trigger may have unmounted, and focus would go to <body>.
    const trigger = triggerRef.current;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Move focus into the sheet so the next Tab stays inside it.
    sheetRef.current?.querySelector<HTMLElement>("a, button")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled])",
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      (previouslyFocused ?? trigger)?.focus?.();
    };
  }, [open, close]);

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-5 py-3.5 sm:px-8">
        <Link href="/" className="rounded-md" aria-label="Pegasus Mission OS, home">
          <Wordmark showProduct />
        </Link>

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-7 text-sm text-ink-muted">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <NavLink
                  href={link.href}
                  className="rounded transition-colors hover:text-ink"
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={domainPaths.app("/login")}
            className="hidden rounded text-sm font-medium text-ink-muted transition-colors hover:text-ink sm:block"
          >
            Sign in
          </Link>
          <ButtonLink
            href="/#contact"
            size="sm"
            variant="blue"
            className="hidden sm:inline-flex"
          >
            Get early access
          </ButtonLink>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls="marketing-menu"
            aria-label="Open menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-strong text-ink lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={close}
            className="absolute inset-0 h-full w-full cursor-default bg-ink/25 backdrop-blur-sm"
          />
          <div
            id="marketing-menu"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            className="absolute inset-x-0 top-0 max-h-full overflow-y-auto border-b border-line bg-paper px-5 pb-8 pt-3.5 shadow-elev-3 sm:px-8"
          >
            <div className="flex items-center justify-between">
              <Wordmark showProduct />
              <button
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-strong text-ink"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <nav aria-label="Primary, mobile" className="mt-6">
              <ul className="flex flex-col">
                {NAV_LINKS.map((link) => (
                  <li key={link.href} className="border-b border-line last:border-0">
                    <NavLink
                      href={link.href}
                      onClick={close}
                      className="block py-3.5 font-heading text-lg font-semibold text-ink"
                    >
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="mt-7 flex flex-col gap-3">
              <ButtonLink
                href="/#contact"
                size="lg"
                variant="blue"
                onClick={close}
                className="w-full"
              >
                Get early access
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
              <ButtonLink
                href={domainPaths.app("/login")}
                size="lg"
                variant="secondary"
                onClick={close}
                className="w-full"
              >
                Sign in
              </ButtonLink>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

/**
 * A nav link that knows whether it is a route change or a scroll.
 *
 * `next/link` on a same-page fragment would make the client router handle a
 * scroll the browser already does correctly; a plain anchor on `/product`
 * would throw away the prefetch and do a full document load. Splitting on the
 * hash gets both right.
 */
function NavLink({
  href,
  onClick,
  className,
  children,
}: {
  href: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  if (href.includes("#")) {
    return (
      <a href={href} onClick={onClick} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}
