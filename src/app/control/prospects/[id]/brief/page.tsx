import { notFound, redirect } from "next/navigation";
import { requireControlCapability } from "@/lib/control-plane/permissions";
import { resolveControlRequestContext } from "@/server/control-plane/context";
import { getControlRepository } from "@/server/control-plane";
import { DemoAccountBrief } from "@/components/control-plane/demo/DemoAccountBrief";

export default async function AccountBriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await resolveControlRequestContext();
  if (ctx.demoMode) return <DemoAccountBrief params={params} />;

  // A real prospect's brief is its record: everything known about it, with the
  // provenance of each fact. There is no separate real brief to render.
  requireControlCapability(ctx.role, "prospect:view");
  const { id } = await params;
  if (!(await (await getControlRepository(ctx)).prospects.get(ctx, id))) notFound();
  redirect(`/control/prospects/${id}`);
}
