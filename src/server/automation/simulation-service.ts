import { simulateAutomation, type SimulationOutcome } from "@/lib/automation/simulate";
import { grantFacts, indicatorFacts, programmeFacts } from "@/lib/automation/facts";
import type { Automation, DomainEvent, DomainEventKind } from "@/types/domain";
import type { RequestContext } from "@/server/context/request-context";
import type { MissionRepository } from "@/server/data";
import { datedObligations } from "./scheduler";
import { grantReportFactsWithEvidence } from "./facts-service";

/**
 * Testing an automation against the organisation as it stands.
 *
 * The brief asks for this before an automation is enabled, and the reason is
 * the reason simulation exists at all: nobody can predict what a rule will do
 * to their own data by reading it. What the brief does not say, and what
 * matters more, is what a simulation must refuse to claim.
 *
 * **A `changed` trigger cannot be simulated against current state.** There is
 * no "before". A simulation that ran a change rule over today's records would
 * report "would trigger on 0 records", which reads as *this rule is safe* and
 * means *this question was not asked*. Those are opposite conclusions, so the
 * simulation returns a caveat rather than a zero.
 */

export interface OrganisationSimulation extends SimulationOutcome {
  /** Where the simulation could not answer, said plainly. */
  caveats: string[];
}

/**
 * Build the events an automation would have seen, from current records.
 *
 * Synthesised rather than replayed from `domain_events`, because the event log
 * starts empty and an organisation enabling their first automation would
 * otherwise be told it would do nothing.
 */
export async function synthesiseEvents(
  ctx: RequestContext,
  repo: MissionRepository,
  kind: DomainEventKind,
): Promise<{ events: DomainEvent[]; caveats: string[] }> {
  const now = ctx.now();
  const caveats: string[] = [];
  const events: DomainEvent[] = [];

  const push = (
    subject: DomainEvent["subject"],
    facts: Record<string, string | number | boolean | null>,
  ) => {
    events.push({
      id: `sim-${subject.type}-${subject.id}`,
      organisationId: ctx.organisationId,
      kind,
      subject,
      occurredAt: now.toISOString(),
      facts,
    });
  };

  switch (kind) {
    case "date.approaching":
    case "deadline.passed":
    case "report.due_soon":
    case "requirement.due_soon": {
      for (const obligation of await datedObligations(ctx, repo)) {
        const enriched =
          obligation.subject.type === "grant_report"
            ? await grantReportFactsWithEvidence(ctx, repo, obligation.subject.id)
            : {};
        push(obligation.subject, {
          ...(obligation.facts as Record<string, string | number | boolean | null>),
          ...(enriched as Record<string, string | number | boolean | null>),
        });
      }
      break;
    }

    case "grant.state_changed":
    case "grant.health_changed": {
      for (const grant of await repo.grants.list(ctx)) {
        const [deliverables, reports] = await Promise.all([
          repo.grants.deliverables(ctx, grant.id),
          repo.grants.reports(ctx, grant.id),
        ]);
        push(
          { type: "grant", id: grant.id, label: grant.title },
          grantFacts({
            grant,
            deliverables,
            reports,
            linkedEvidenceCount: 0,
            now,
          }) as Record<string, string | number | boolean | null>,
        );
      }
      caveats.push(
        "This trigger fires on a change, and a simulation over current records has no previous value to compare against. Conditions using `changed` are reported as undecidable rather than as not matching: the question was not asked, which is not the same as the answer being no.",
      );
      break;
    }

    case "indicator.updated": {
      for (const indicator of await repo.programmes.allIndicators(ctx)) {
        push(
          { type: "indicator", id: indicator.id, label: indicator.name },
          indicatorFacts(indicator, now) as Record<string, string | number | boolean | null>,
        );
      }
      break;
    }

    case "record.created":
    case "record.changed": {
      for (const programme of await repo.programmes.list(ctx)) {
        const [indicators, outcomes] = await Promise.all([
          repo.programmes.indicatorsForProgramme(ctx, programme.id),
          repo.programmes.outcomes(ctx, programme.id),
        ]);
        push(
          { type: "programme", id: programme.id, label: programme.name },
          programmeFacts({ programme, indicators, outcomes, now }) as Record<
            string,
            string | number | boolean | null
          >,
        );
      }
      caveats.push(
        "Simulated over programmes only. A record trigger with no entity type would see every record in the organisation, which a simulation cannot enumerate cheaply.",
      );
      break;
    }

    default:
      caveats.push(
        `No records can be synthesised for ${kind}, so this simulation reports nothing rather than reporting zero. Enable the automation and watch its run log instead.`,
      );
  }

  return { events, caveats };
}

export async function simulateAgainstOrganisation(
  ctx: RequestContext,
  repo: MissionRepository,
  automation: Automation,
): Promise<OrganisationSimulation> {
  const { events, caveats } = await synthesiseEvents(ctx, repo, automation.trigger.kind);
  const outcome = simulateAutomation({
    automation: { ...automation, status: "active" },
    events,
    now: ctx.now(),
  });

  if (events.length === 0 && caveats.length === 0) {
    caveats.push(
      "There are no records this trigger could apply to, so nothing was tested. That is a statement about the data, not about the rule.",
    );
  }

  return { ...outcome, caveats };
}
