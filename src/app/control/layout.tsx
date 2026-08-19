import type { Metadata } from "next";
import { ControlPlaneShell } from "@/components/control-plane/ControlPlaneShell";
import { resolveControlRequestContext } from "@/server/control-plane/context";
import { getControlRepository } from "@/server/control-plane";

export const metadata: Metadata = {
  title: "Control Plane | Pegasus",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ControlLayout({ children }: { children: React.ReactNode }) {
  try {
    const ctx = await resolveControlRequestContext();
    const user = await (await getControlRepository()).users.current(ctx);
    if (!user) throw new Error("Internal identity is unavailable.");
    return (
      <ControlPlaneShell userName={user.name} roleLabel={user.role.replaceAll("_", " ")}>
        {children}
      </ControlPlaneShell>
    );
  } catch {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper p-6">
        <section className="surface-card max-w-lg p-8 text-center">
          <p className="eyebrow">Pegasus Control Plane</p>
          <h1 className="mt-3 text-2xl font-semibold">Internal access required</h1>
          <p className="mt-3 text-sm text-ink-muted">
            Sign in with an active Pegasus internal account. Mission OS tenant membership does not grant access to this surface.
          </p>
        </section>
      </main>
    );
  }
}
