import type { Metadata } from "next";
import { ControlMagicLinkForm } from "@/components/auth/ControlMagicLinkForm";
export const metadata: Metadata = { title: "Internal sign in | Pegasus Control" };
const errors: Record<string, string> = {
  invalid_link: "That sign-in link is invalid or expired.",
  not_internal:
    "Your identity is verified, but it is not an active Pegasus internal account.",
  not_configured: "Internal sign-in is not configured.",
};
export default async function ControlLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <section className="surface-card w-full max-w-md p-8">
        <p className="eyebrow">Pegasus Control Plane</p>
        <h1 className="mt-3 text-2xl font-semibold">Internal sign in</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Use your active Pegasus internal account. Mission OS tenant membership does not
          grant access.
        </p>
        {error && errors[error] ? (
          <p
            role="alert"
            className="mt-5 rounded-lg bg-critical-soft p-3 text-sm text-critical"
          >
            {errors[error]}
          </p>
        ) : null}
        <ControlMagicLinkForm />
      </section>
    </main>
  );
}
