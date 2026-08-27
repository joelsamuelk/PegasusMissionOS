"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FlaskConical, Loader2, Send } from "lucide-react";
import type { Automation, AutomationFailure, AutomationRun, AutomationStep } from "@/types/domain";
import { ACTION_CATALOGUE } from "@/lib/automation";
import {
  approveRun,
  setAutomationStatus,
  simulateAutomationAction,
  type SimulationResult,
} from "@/server/actions/automations";
import { Button, Card, CardBody, Pill } from "@/components/shared/ui";
import { StatusBadge, type Tone } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";

const STATUS_TONE: Record<Automation["status"], Tone> = {
  active: "success",
  draft: "neutral",
  paused: "warning",
};

/**
 * The automation list.
 *
 * Every card answers three questions before anything else: what fires it, what
 * it would do, and whether it can act without a person. The third is a badge
 * rather than a setting buried in a panel, because "does this thing email my
 * funders" is the only question that matters before somebody switches a rule
 * on.
 */
export function AutomationList({
  automations,
  runs,
  steps,
  failures,
}: {
  automations: Automation[];
  runs: AutomationRun[];
  steps: Record<string, AutomationStep[]>;
  failures: Record<string, AutomationFailure[]>;
}) {
  const [simulations, setSimulations] = useState<Record<string, SimulationResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { notify } = useToast();

  async function simulate(id: string) {
    setBusy(id);
    const result = await simulateAutomationAction(id);
    setSimulations((current) => ({ ...current, [id]: result }));
    setBusy(null);
  }

  function toggle(automation: Automation) {
    const next = automation.status === "active" ? "paused" : "active";
    startTransition(async () => {
      const result = await setAutomationStatus(automation.id, next);
      if (!result.ok) notify(result.message ?? "That could not be changed.", "error");
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {automations.map((automation) => {
        const simulation = simulations[automation.id];
        const automationRuns = runs.filter((run) => run.automationId === automation.id);
        const waiting = automationRuns.filter((run) => run.outcome === "awaiting_approval");

        return (
          <Card key={automation.id}>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <StatusBadge tone={STATUS_TONE[automation.status]} label={automation.status} />
                    {automation.requiresApproval && (
                      <Pill className="border-warning/35 text-warning">
                        <AlertTriangle className="h-3 w-3" />
                        Needs a person
                      </Pill>
                    )}
                  </div>
                  <h3 className="font-heading text-base font-semibold text-ink">
                    {automation.name}
                  </h3>
                  {automation.description && (
                    <p className="mt-1 max-w-2xl text-sm text-ink-muted">
                      {automation.description}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void simulate(automation.id)}
                    disabled={busy === automation.id}
                  >
                    {busy === automation.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FlaskConical className="h-3.5 w-3.5" />
                    )}
                    Test against this organisation
                  </Button>
                  <Button
                    size="sm"
                    variant={automation.status === "active" ? "subtle" : "blue"}
                    onClick={() => toggle(automation)}
                    disabled={pending}
                  >
                    {automation.status === "active" ? "Pause" : "Switch on"}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg bg-surface-sunken px-3 py-2.5 text-xs text-ink-muted">
                <p>
                  <span className="eyebrow mr-1.5">When</span>
                  {automation.trigger.kind.replace(/[._]/g, " ")}
                  {automation.trigger.entityType
                    ? ` on a ${automation.trigger.entityType.replace(/_/g, " ")}`
                    : ""}
                  {automation.trigger.daysBefore
                    ? `, ${automation.trigger.daysBefore} days before`
                    : ""}
                </p>
                <p className="mt-1">
                  <span className="eyebrow mr-1.5">Then</span>
                  {automation.actions
                    .map((action) => ACTION_CATALOGUE[action.kind]?.label ?? action.kind)
                    .join(", ")}
                </p>
              </div>

              {simulation?.lines && (
                <div className="rounded-lg border border-blue/25 bg-blue/5 px-3 py-2.5">
                  <p className="eyebrow mb-1.5">If this ran now</p>
                  <ul className="space-y-1">
                    {simulation.lines.map((line, index) => (
                      <li key={index} className="text-xs text-ink-muted">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {simulation && !simulation.ok && (
                <p className="text-xs text-critical">{simulation.error}</p>
              )}

              {waiting.length > 0 && (
                <div className="rounded-lg border border-warning/35 bg-warning-soft px-3 py-2.5">
                  <p className="eyebrow mb-2">Waiting for a person</p>
                  <ul className="space-y-2">
                    {waiting.map((run) => (
                      <li key={run.id} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-ink">
                          {run.subject.label ?? `${run.subject.type} ${run.subject.id}`}
                        </span>
                        <span className="text-ink-subtle">
                          {(steps[run.id] ?? [])
                            .map((step) => ACTION_CATALOGUE[step.action]?.label ?? step.action)
                            .join(", ")}
                        </span>
                        <Button
                          size="sm"
                          variant="blue"
                          onClick={() =>
                            startTransition(async () => {
                              const result = await approveRun(run.id);
                              if (!result.ok) {
                                notify(result.message ?? "Could not approve.", "error");
                              } else router.refresh();
                            })
                          }
                          disabled={pending}
                        >
                          <Send className="h-3 w-3" />
                          Approve
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <RunLog runs={automationRuns.slice(0, 5)} steps={steps} failures={failures} />
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * The run log.
 *
 * Shows runs that did nothing alongside runs that did something, because "why
 * did nothing happen?" is the more common question and a log of successes
 * cannot answer it. The condition's own explanation is rendered verbatim.
 */
function RunLog({
  runs,
  steps,
  failures,
}: {
  runs: AutomationRun[];
  steps: Record<string, AutomationStep[]>;
  failures: Record<string, AutomationFailure[]>;
}) {
  if (runs.length === 0) {
    return <p className="text-xs text-ink-subtle">This automation has not run yet.</p>;
  }

  const tone = (outcome: AutomationRun["outcome"]): Tone =>
    outcome === "completed"
      ? "success"
      : outcome === "failed"
        ? "critical"
        : outcome === "undecidable"
          ? "warning"
          : "neutral";

  return (
    <div>
      <p className="eyebrow mb-2">Recent runs</p>
      <ul className="space-y-2">
        {runs.map((run) => (
          <li key={run.id} className="text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={tone(run.outcome)} label={run.outcome.replace(/_/g, " ")} />
              <span className="text-ink">
                {run.subject.label ?? `${run.subject.type.replace(/_/g, " ")} ${run.subject.id}`}
              </span>
              <span className="text-ink-subtle">
                {run.startedAt.slice(0, 16).replace("T", " ")}
              </span>
            </div>
            <p className="mt-0.5 text-ink-subtle">{run.explanation}</p>
            {(steps[run.id] ?? [])
              .filter((step) => step.detail)
              .map((step) => (
                <p key={step.id} className="mt-0.5 text-ink-subtle">
                  {step.status === "executed" ? (
                    <CheckCircle2 className="mr-1 inline h-3 w-3 text-success" />
                  ) : (
                    <AlertTriangle className="mr-1 inline h-3 w-3 text-warning" />
                  )}
                  {step.detail}
                </p>
              ))}
            {(failures[run.id] ?? []).map((failure) => (
              <p key={failure.id} className="mt-0.5 text-critical">
                {failure.message}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
