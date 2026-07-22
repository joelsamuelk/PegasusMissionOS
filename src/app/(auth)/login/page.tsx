import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { ButtonLink } from "@/components/shared/ui";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div>
      <h1 className="text-heading font-semibold tracking-tight text-ink">Sign in</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Welcome back. Enter your details to continue.
      </p>

      <div className="mt-5 flex items-start gap-2.5 rounded-md border border-info/25 bg-info-soft p-3 text-sm text-info">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>
          This is a demonstration. Authentication is not required. Continue to explore
          the seeded workspace.
        </span>
      </div>

      <form className="mt-6 flex flex-col gap-4" action="/dashboard">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Email</span>
          <input
            type="email"
            name="email"
            defaultValue="amara@northstarcf.org.uk"
            className="h-10 rounded border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:shadow-focus"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Password</span>
          <input
            type="password"
            name="password"
            defaultValue="demo-workspace"
            className="h-10 rounded border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:shadow-focus"
          />
        </label>
        <ButtonLink href="/dashboard" size="lg" className="mt-1">
          Continue to workspace
        </ButtonLink>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        New to Pegasus?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create a workspace
        </Link>
      </p>
    </div>
  );
}
