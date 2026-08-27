"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Building2,
  ClipboardList,
  Command,
  Headphones,
  Mail,
  Search,
  Settings,
  Sparkles,
  Target,
  Users,
  SlidersHorizontal,
  SunMedium,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const groups = [
  { label: "Command", items: [["Command Centre", "/control", Command]] },
  {
    label: "Intelligence",
    items: [["Control Intelligence", "/control/intelligence", Sparkles]],
  },
  {
    label: "Grow",
    items: [
      ["Today", "/control/today", SunMedium],
      ["Prospects", "/control/prospects", Target],
      ["Discover", "/control/prospects/discover", Search],
      ["Research review", "/control/research", ShieldCheck],
      ["ICP profiles", "/control/icps", SlidersHorizontal],
      ["Pipeline", "/control/pipeline", Activity],
      ["Outreach", "/control/outreach", Mail],
      ["Growth intelligence", "/control/intelligence/growth", Sparkles],
      ["Calibration", "/control/intelligence/calibration", Target],
    ],
  },
  {
    label: "Customers",
    items: [
      ["Organisations", "/control/organisations", Building2],
      ["Conversions", "/control/conversions", Building2],
      ["Onboarding", "/control/onboarding", ClipboardList],
      ["Customer 360", "/control/customers", Users],
      ["Support", "/control/support", Headphones],
    ],
  },
  {
    label: "Operate",
    items: [
      ["Tasks", "/control/tasks", ClipboardList],
      ["Usage & Feedback", "/control/insights", Activity],
      ["Audit", "/control/audit", Activity],
    ],
  },
  {
    label: "Configure",
    items: [
      ["Team", "/control/team", Users],
      ["Settings", "/control/settings", Settings],
      ["Operations Safety", "/control/operations", Settings],
    ],
  },
] as const;

export function ControlPlaneShell({
  children,
  userName = "Pegasus internal user",
  roleLabel = "Internal",
}: {
  children: React.ReactNode;
  userName?: string;
  roleLabel?: string;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-line bg-navy text-white lg:block">
        <div className="sticky top-0 flex h-screen flex-col">
          <Link href="/control" className="border-b border-white/10 px-5 py-5">
            <div className="font-heading text-lg font-semibold">Pegasus</div>
            <div className="mt-0.5 text-xs uppercase tracking-[0.16em] text-white/55">
              Control Plane
            </div>
          </Link>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {groups.map((group) => (
              <div className="mb-5" key={group.label}>
                <div className="mb-1.5 px-3 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-white/40">
                  {group.label}
                </div>
                {group.items.map(([label, href, Icon]) => {
                  const active = pathname === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white",
                        active && "bg-white/12 font-semibold text-white",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="border-t border-white/10 px-5 py-4 text-xs text-white/50">
            Internal operations surface
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-line bg-paper/95 px-5 backdrop-blur sm:px-8">
          <Link href="/control" className="font-heading font-semibold lg:hidden">
            Pegasus Control
          </Link>
          <button className="flex max-w-xl flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm text-ink-muted">
            <Search className="h-4 w-4" />
            Search or run a command
            <kbd className="ml-auto hidden rounded border border-line px-1.5 py-0.5 text-[0.65rem] sm:block">
              ⌘ K
            </kbd>
          </button>
          <div
            title={`${userName}, ${roleLabel}`}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-soft text-xs font-bold"
          >
            {userName
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-5 sm:p-8">{children}</main>
      </div>
    </div>
  );
}

export function FoundationNotice() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-blue/20 bg-blue-soft p-4 text-sm text-ink">
      <Sparkles className="mt-0.5 h-4 w-4 flex-none text-blue" />
      <p>
        Foundation preview. Live operational data and actions are intentionally disabled
        until the internal authentication and persistence adapters are connected.
      </p>
    </div>
  );
}
