import { OutreachWorkbench } from "@/components/control-plane/OutreachWorkbench";
export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const query = await searchParams;
  return <OutreachWorkbench initialId={query.account} />;
}
