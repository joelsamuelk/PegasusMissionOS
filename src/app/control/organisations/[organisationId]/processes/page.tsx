import Link from "next/link";
import { listCapturedProcesses } from "@/server/actions/process-intelligence";
export default async function ProcessesPage({
  params,
}: {
  params: Promise<{ organisationId: string }>;
}) {
  const { organisationId } = await params;
  const processes = await listCapturedProcesses(organisationId);
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Process Intelligence</p>
        <h1 className="mt-2 text-3xl font-semibold">Captured processes</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Live participant submissions. AI fields remain empty until analysis completes.
        </p>
      </header>
      <form className="surface-card grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          "Department",
          "System",
          "Analysis",
          "Annual effort",
          "Participant",
          "Submitted",
        ].map((x) => (
          <select
            key={x}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
            aria-label={x}
          >
            <option>{x}: All</option>
          </select>
        ))}
      </form>
      <section className="surface-card overflow-x-auto">
        {processes.length ? (
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                {[
                  "Process",
                  "Department",
                  "Frequency",
                  "Annual effort",
                  "People",
                  "Systems",
                  "Analysis",
                  "Submitted",
                ].map((x) => (
                  <th key={x} className="px-4 py-3">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {processes.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <Link
                      className="font-semibold hover:text-blue"
                      href={`/control/processes/${p.id}`}
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{p.department ?? "Not provided"}</td>
                  <td className="px-4 py-3 capitalize">
                    {p.frequency.replaceAll("_", " ")}
                  </td>
                  <td className="px-4 py-3">≈ {p.annualHours}h</td>
                  <td className="px-4 py-3">{p.peopleCount}</td>
                  <td className="px-4 py-3 text-xs">
                    {p.systems.join(", ") || "None provided"}
                  </td>
                  <td className="px-4 py-3 capitalize">{p.analysisStatus}</td>
                  <td className="px-4 py-3">
                    {new Date(p.submittedAt).toLocaleDateString("en-GB")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-6 text-sm text-ink-muted">
            No processes have been submitted for this organisation yet.
          </p>
        )}
      </section>
    </div>
  );
}
