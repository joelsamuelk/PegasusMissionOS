import Link from "next/link";
import {
  createProcessOrganisationAction,
  listProcessOrganisations,
} from "@/server/actions/process-intelligence";

export default async function OrganisationsPage() {
  const organisations = await listProcessOrganisations();
  return (
    <div className="space-y-7">
      <header>
        <p className="eyebrow">Customers</p>
        <h1 className="mt-2 text-3xl font-semibold">Organisations</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Create an organisation, then start a secure Process Intelligence campaign.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="surface-card overflow-hidden">
          <div className="border-b border-line p-5">
            <h2 className="text-lg font-semibold">Organisations</h2>
          </div>
          {organisations.length ? (
            <div className="divide-y divide-line">
              {organisations.map((o) => (
                <Link
                  className="grid gap-2 p-4 hover:bg-paper sm:grid-cols-[1fr_auto]"
                  href={`/control/organisations/${o.id}/process-intelligence`}
                  key={o.id}
                >
                  <div>
                    <strong>{o.name}</strong>
                    <p className="text-xs text-ink-muted">
                      {o.legalName} · {o.type}
                    </p>
                  </div>
                  <span className="text-sm text-ink-muted">
                    {o.campaignCount} campaigns · {o.processCount} processes
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-ink-muted">
              No organisations yet. Create the first one.
            </p>
          )}
        </section>
        <section className="surface-card p-5">
          <h2 className="text-lg font-semibold">Create organisation</h2>
          <form action={createProcessOrganisationAction} className="mt-4 space-y-4">
            <label className="block text-sm font-semibold">
              Display name
              <input
                name="name"
                required
                minLength={2}
                className="mt-1 w-full rounded-lg border border-line p-3 font-normal"
                placeholder="HopeWorks Collective"
              />
            </label>
            <label className="block text-sm font-semibold">
              Legal name
              <input
                name="legalName"
                required
                minLength={2}
                className="mt-1 w-full rounded-lg border border-line p-3 font-normal"
                placeholder="HopeWorks Collective CIO"
              />
            </label>
            <label className="block text-sm font-semibold">
              Organisation type
              <select
                name="type"
                className="mt-1 w-full rounded-lg border border-line bg-white p-3 font-normal"
              >
                <option>Charity</option>
                <option>Social enterprise</option>
                <option>Nonprofit</option>
                <option>Foundation</option>
                <option>Company</option>
                <option>Other</option>
              </select>
            </label>
            <button className="w-full rounded-lg bg-navy px-4 py-3 text-sm font-semibold text-white">
              Create organisation
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
