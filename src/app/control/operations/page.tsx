import { saveFeatureFlagAction } from "@/server/actions/control-operations";
import { getControlRepository } from "@/server/control-plane";
import { resolveControlRequestContext } from "@/server/control-plane/context";
import { enterDemoModeAction } from "@/server/actions/control-demo";
export default async function Page() {
  const c = await resolveControlRequestContext(),
    r = await getControlRepository(c),
    [flags, traces, system] = await Promise.all([
      r.operations.flags(c),
      r.operations.traces(c),
      r.operations.system(c),
    ]);
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Configure</p>
        <h1 className="mt-2 text-3xl font-semibold">Operations safety</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Flags fail disabled, AI traces exclude prompts/content, and unobserved adapters
          report unknown.
        </p>
      </header>
      <section className="surface-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Demonstration mode</h2>
            <p className="mt-1 max-w-2xl text-xs text-ink-muted">
              Shows curated example content and sends every write to a throwaway sandbox,
              so nothing you press reaches real records. It never turns itself on, ends
              when you close the browser, and shows a banner on every page while it is
              running.
            </p>
          </div>
          {c.demoMode ? (
            <span className="rounded-full bg-warning px-3 py-1.5 text-xs font-bold uppercase text-white">
              Running
            </span>
          ) : (
            <form action={enterDemoModeAction}>
              <button className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white">
                Enter demonstration
              </button>
            </form>
          )}
        </div>
      </section>
      <section className="surface-card p-5">
        <h2 className="font-semibold">Feature flags</h2>
        <form action={saveFeatureFlagAction} className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            className="rounded border p-2"
            name="key"
            placeholder="flag_key"
            required
          />
          <input
            className="rounded border p-2"
            name="description"
            placeholder="Description"
          />
          <select className="rounded border p-2" name="status">
            <option>draft</option>
            <option>active</option>
          </select>
          <label className="p-2">
            <input type="checkbox" name="enabledByDefault" /> Enabled by default
          </label>
          <input
            className="rounded border p-2 md:col-span-2"
            name="reason"
            placeholder="Required change reason"
            required
          />
          <button className="rounded bg-navy px-4 py-2 font-semibold text-white md:col-span-2">
            Save flag
          </button>
        </form>
        {flags.map((x) => (
          <p key={x.id} className="mt-2 text-sm">
            {x.key} · {x.status} · default {String(x.enabledByDefault)}
          </p>
        ))}
      </section>
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="surface-card p-5">
          <h2 className="font-semibold">AI operations</h2>
          <p className="mt-2 text-sm text-ink-muted">
            {traces.length} redacted traces. No prompts, answers or evidence content are
            stored.
          </p>
        </div>
        <div className="surface-card p-5">
          <h2 className="font-semibold">System components</h2>
          {system.map((x) => (
            <p key={x.id} className="mt-2 text-sm">
              <strong>
                {x.componentKey}: {x.state}
              </strong>{" "}
              · {x.detail}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
