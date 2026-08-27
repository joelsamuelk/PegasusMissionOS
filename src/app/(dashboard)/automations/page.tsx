import type { Metadata } from "next";
import { Workflow } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody, SectionTitle } from "@/components/shared/ui";
import { EmptyState } from "@/components/shared/misc";
import { AutomationList } from "@/components/automation/AutomationList";
import { RunSchedulerButton } from "@/components/automation/RunSchedulerButton";
import { ACTION_CATALOGUE } from "@/lib/automation";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
import type { AutomationFailure, AutomationStep } from "@/types/domain";

export const metadata: Metadata = { title: "Automations" };

/**
 * Mission Automations.
 *
 * The page leads with what the engine may do rather than with the rules,
 * because the acceptance test for this phase is about what was *not* built:
 * automating routine operations without creating opaque autonomous agents. A
 * reader who cannot see the boundary has to take it on trust, which is the
 * thing the product exists to avoid asking for.
 */
export default async function AutomationsPage() {
  const ctx = await resolveRequestContext();
  const repo = getRepository();

  const automations = await repo.automation.list(ctx);
  const runs = await repo.automation.runs(ctx);

  const steps: Record<string, AutomationStep[]> = {};
  const failures: Record<string, AutomationFailure[]> = {};
  for (const run of runs.slice(0, 40)) {
    steps[run.id] = await repo.automation.steps(ctx, run.id);
    const runFailures = await repo.automation.failures(ctx, run.id);
    if (runFailures.length > 0) failures[run.id] = runFailures;
  }

  const external = Object.values(ACTION_CATALOGUE).filter(
    (descriptor) => descriptor.externallyVisible,
  );

  return (
    <div>
      <PageHeader
        eyebrow="Automations"
        title="Rules that run without you, and the limits on them"
        description="Every automation is an event, a condition and an action from a closed list. Nothing here writes a field, and nothing that a third party could see happens without a person."
        actions={<RunSchedulerButton />}
      />

      <section className="mb-8">
        <SectionTitle>What an automation is allowed to do</SectionTitle>
        <Card>
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.values(ACTION_CATALOGUE).map((descriptor) => (
                <div key={descriptor.kind}>
                  <p className="text-sm font-medium text-ink">{descriptor.label}</p>
                  <p className="mt-0.5 text-xs text-ink-subtle">{descriptor.description}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {descriptor.requiresApproval && (
                      <span className="rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-[0.65rem] text-warning">
                        needs approval
                      </span>
                    )}
                    {descriptor.usesModel && (
                      <span className="rounded-full border border-line bg-surface-sunken px-2 py-0.5 text-[0.65rem] text-ink-subtle">
                        uses AI
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-ink-subtle">
              {external.length} of these {external.length === 1 ? "action" : "actions"} can
              produce something a third party would see, and{" "}
              {external.length === 1 ? "it requires" : "all of them require"} a person before
              anything happens. Nothing in Pegasus can send a message on its own.
            </p>
          </CardBody>
        </Card>
      </section>

      <section>
        <SectionTitle>Automations</SectionTitle>
        {automations.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title="No automations yet"
            description="An automation reacts to something happening in your organisation and takes one of a fixed set of actions."
          />
        ) : (
          <AutomationList
            automations={automations}
            runs={runs}
            steps={steps}
            failures={failures}
          />
        )}
      </section>
    </div>
  );
}
