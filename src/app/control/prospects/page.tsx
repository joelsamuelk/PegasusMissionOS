import Link from "next/link";
import { canControl } from "@/lib/control-plane/permissions";
import { resolveControlRequestContext } from "@/server/control-plane/context";
import { getControlRepository } from "@/server/control-plane";
import { createProspectAction } from "@/server/actions/control-prospects";

const field = "rounded-md border border-line bg-surface px-3 py-2 text-sm";
export default async function ProspectsPage() {
  const ctx = await resolveControlRequestContext(); const repo = await getControlRepository();
  if (!canControl(ctx.role, "prospect:view")) throw new Error("Prospect access required.");
  const prospects = await repo.prospects.list(ctx);
  return <div className="space-y-6"><div><p className="eyebrow">Grow</p><h1 className="mt-2 text-3xl font-semibold">Prospects</h1><p className="mt-2 text-sm text-ink-muted">One identity from discovery through customer conversion.</p></div>
    {canControl(ctx.role, "prospect:create") && <form action={createProspectAction} className="surface-card grid gap-3 p-4 md:grid-cols-5"><input required name="name" placeholder="Organisation name" className={field}/><input name="website" type="url" placeholder="https://…" className={field}/><input name="country" placeholder="Country" className={field}/><input name="organisationType" placeholder="Organisation type" className={field}/><button className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white">Add prospect</button></form>}
    <div className="surface-card overflow-hidden"><table className="w-full text-left text-sm"><thead className="bg-surface-sunken text-xs text-ink-muted"><tr><th className="p-4">Organisation</th><th>Status</th><th>Focus</th><th>Source</th></tr></thead><tbody>{prospects.map((p)=><tr key={p.id} className="border-t border-line"><td className="p-4"><Link className="font-semibold hover:underline" href={`/control/prospects/${p.id}`}>{p.name}</Link><div className="text-xs text-ink-muted">{p.website ?? "No website recorded"}</div></td><td>{p.status}</td><td>{p.focusAreas.join(", ") || "Not researched"}</td><td>{p.source}</td></tr>)}</tbody></table></div>
  </div>;
}
