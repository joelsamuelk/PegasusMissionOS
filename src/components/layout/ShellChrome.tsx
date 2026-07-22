"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Menu, X } from "lucide-react";
import type { MemberRole, Notification, Organisation, User } from "@/types/domain";
import { ROLE_LABELS } from "@/lib/permissions";
import { NAV_ITEMS } from "@/components/navigation/nav-items";
import { Wordmark } from "@/components/brand/Wordmark";
import { CommandBar } from "@/components/ai/CommandBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/formatting";

interface ShellProps {
  organisation: Organisation;
  user: User;
  role: MemberRole;
  notifications: Notification[];
  children: React.ReactNode;
}

export function ShellChrome({
  organisation,
  user,
  role,
  notifications,
  children,
}: ShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-paper">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <SidebarContent
          organisation={organisation}
          user={user}
          role={role}
          pathname={pathname}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-line bg-surface">
            <div className="flex justify-end p-2">
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="rounded p-1.5 text-ink-subtle hover:bg-surface-sunken"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent
              organisation={organisation}
              user={user}
              role={role}
              pathname={pathname}
            />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur-md sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="rounded p-1.5 text-ink hover:bg-surface-sunken lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <CommandBar />
          </div>
          <NotificationsBell notifications={notifications} />
          <div className="hidden items-center gap-2 sm:flex">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-medium text-ink-inverse"
              title={user.name}
            >
              {user.avatarInitials}
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  organisation,
  user,
  role,
  pathname,
}: {
  organisation: Organisation;
  user: User;
  role: MemberRole;
  pathname: string;
}) {
  return (
    <>
      <div className="flex h-14 items-center border-b border-line px-5">
        <Link href="/dashboard" aria-label="Pegasus Mission OS">
          <Wordmark showProduct />
        </Link>
      </div>

      <div className="border-b border-line px-5 py-3">
        <div className="text-sm font-medium text-ink">{organisation.name}</div>
        {organisation.isDemo && (
          <StatusBadge tone="accent" label="Demonstration workspace" className="mt-1.5" />
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavGroup label="Operate" pathname={pathname} group="operate" />
        <NavGroup label="Organisation" pathname={pathname} group="organisation" />
      </nav>

      <div className="border-t border-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-sunken text-xs font-medium text-ink">
            {user.avatarInitials}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink">{user.name}</div>
            <div className="truncate text-xs text-ink-subtle">{ROLE_LABELS[role]}</div>
          </div>
        </div>
      </div>
    </>
  );
}

function NavGroup({
  label,
  pathname,
  group,
}: {
  label: string;
  pathname: string;
  group: "operate" | "organisation";
}) {
  const items = NAV_ITEMS.filter((i) => i.group === group);
  return (
    <div className="mb-5">
      <div className="eyebrow mb-2 px-2">{label}</div>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded px-2 py-2 text-sm transition-colors",
                  active
                    ? "bg-surface-sunken font-medium text-ink"
                    : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
                )}
              >
                <Icon
                  className={cn("h-4 w-4", active ? "text-accent" : "text-ink-subtle")}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NotificationsBell({ notifications }: { notifications: Notification[] }) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications, ${unread} unread`}
        className="relative rounded p-1.5 text-ink hover:bg-surface-sunken"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[0.6rem] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-md border border-line bg-surface shadow-elev-3">
            <div className="border-b border-line px-4 py-2.5">
              <div className="text-sm font-medium text-ink">Notifications</div>
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {notifications.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-ink-subtle">
                  You are all caught up.
                </li>
              )}
              {notifications.map((n) => (
                <li key={n.id} className="border-b border-line last:border-0">
                  <Link
                    href={n.href ?? "#"}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 hover:bg-surface-sunken"
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && (
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                      )}
                      <div className={cn(!n.read ? "" : "pl-3.5")}>
                        <div className="text-sm font-medium text-ink">{n.title}</div>
                        <div className="text-xs text-ink-muted">{n.body}</div>
                        <div className="mt-1 text-[0.7rem] text-ink-subtle">
                          {timeAgo(n.createdAt, new Date("2026-07-21T10:00:00Z"))}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
