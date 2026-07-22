import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/shared/ui";

export const metadata: Metadata = { title: "Create a workspace" };

export default function SignupPage() {
  return (
    <div>
      <h1 className="text-heading font-semibold tracking-tight text-ink">
        Create your workspace
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Set up Pegasus Mission OS for your organisation.
      </p>

      <form className="mt-6 flex flex-col gap-4" action="/onboarding">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Organisation name</span>
          <input
            name="org"
            placeholder="e.g. Northstar Community Foundation"
            className="h-10 rounded border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:shadow-focus"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Your name</span>
          <input
            name="name"
            placeholder="Your full name"
            className="h-10 rounded border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:shadow-focus"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Work email</span>
          <input
            type="email"
            name="email"
            placeholder="you@organisation.org.uk"
            className="h-10 rounded border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:shadow-focus"
          />
        </label>
        <ButtonLink href="/onboarding" size="lg" className="mt-1">
          Begin onboarding
        </ButtonLink>
      </form>

      <p className="mt-4 text-xs text-ink-subtle">
        In this demonstration, creating a workspace opens the onboarding flow. No
        account is created and no data is stored.
      </p>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Already have a workspace?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
