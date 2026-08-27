import type { Metadata } from "next";
import { PublicIntake } from "@/components/process-intelligence/PublicIntake";
import { loadProcessIntake } from "@/server/actions/process-intelligence";
export const metadata: Metadata = {
  title: "Describe your work | Pegasus",
  robots: { index: false, follow: false },
};
export default async function IntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await loadProcessIntake(token);
  if (!result.ok)
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper p-6">
        <section className="surface-card max-w-lg p-8 text-center">
          <h1 className="text-2xl font-semibold">This intake link is not available</h1>
          <p className="mt-3 text-sm text-ink-muted">{result.error}</p>
        </section>
      </main>
    );
  return <PublicIntake token={token} campaign={result.campaign} />;
}
