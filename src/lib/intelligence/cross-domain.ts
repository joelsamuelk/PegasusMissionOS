import { differenceInCalendarDays, parseISO } from "date-fns";
import type { EntityReference } from "@/types/domain";
import type { MissionSnapshot } from "./snapshot";
import { ATTENTION_THRESHOLDS, rankAttention } from "./attention";
import {
  SEVERITY_WEIGHT,
  type AttentionCategory,
  type AttentionItem,
  type AttentionSeverity,
  type CompositeAttentionItem,
} from "./types";

/**
 * Cross-domain reasoning.
 *
 * This file is the phase's acceptance test in code. The brief is explicit: if
 * Mission Intelligence "simply summarises each module separately, the phase is
 * incomplete". So the unit of output here is not a summary of finance plus a
 * summary of grants — it is an item that **does not exist in any single
 * domain** and only appears when several agree.
 *
 * Each rule is deterministic and named. A composite carries the single-domain
 * items it was built from, so a reader can always decompose it back into the
 * facts that produced it, and a test can assert that removing any one
 * component makes the composite disappear.
 *
 * Two design decisions worth stating:
 *
 * 1. **A composite outranks its parts.** Its score is the highest component
 *    score plus a combination bonus, so a Command Centre sorted by score puts
 *    the connected problem above the three loose ends that compose it. Without
 *    that, the combination is discoverable only by a reader who already made
 *    the connection, which is the work the product exists to do.
 * 2. **Components are absorbed, not duplicated.** `applyCrossDomain` removes
 *    the components from the flat list. A triage list that shows the
 *    combination and then repeats its three parts below has made the page
 *    longer without making the organisation better informed.
 */

const COMBINATION_BONUS = 25;

function compose(input: {
  rule: string;
  category: AttentionCategory;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  subject: EntityReference;
  components: AttentionItem[];
  extraSources?: EntityReference[];
  action?: { label: string; href?: string };
  dueInDays?: number;
}): CompositeAttentionItem {
  const { components } = input;
  const sources = new Map<string, EntityReference>();
  for (const source of [...components.flatMap((c) => c.sources), ...(input.extraSources ?? [])]) {
    sources.set(`${source.type}:${source.id}`, source);
  }
  const componentPeak = Math.max(0, ...components.map((c) => c.score));

  return {
    id: `${input.rule}:${input.subject.id}`,
    rule: input.rule,
    category: input.category,
    kind: "risk",
    severity: input.severity,
    title: input.title,
    detail: input.detail,
    subject: input.subject,
    components,
    contributingCategories: [...new Set(components.map((c) => c.category))],
    // Every component's signals, kept whole. The composite explains itself by
    // showing the separate findings, not by asserting a new one.
    signals: components.flatMap((c) => c.signals),
    score: Math.max(SEVERITY_WEIGHT[input.severity], componentPeak) + COMBINATION_BONUS,
    dueInDays: input.dueInDays,
    sources: [...sources.values()],
    action: input.action,
  };
}

function daysUntil(date: string | undefined, now: Date): number | undefined {
  if (!date) return undefined;
  try {
    return differenceInCalendarDays(parseISO(date), now);
  } catch {
    return undefined;
  }
}

export interface CrossDomainRule {
  name: string;
  /** What the rule looks for, in one sentence, for documentation and tests. */
  describes: string;
  evaluate(snapshot: MissionSnapshot, items: AttentionItem[]): CompositeAttentionItem[];
}

const byId = (items: AttentionItem[]) => new Map(items.map((i) => [i.id, i]));

/**
 * Rule 1 — a grant ends, a programme depends on it, and the core cannot absorb it.
 *
 * The brief's first scenario. Each part is unremarkable on its own: grants
 * always end, programmes are always funded by something, and a thin
 * unrestricted reserve is a chronic condition in the sector. The combination
 * is the sentence a trustee needs: *this delivery stops on this date and there
 * is nothing behind it*.
 */
export const grantEndingProgrammeDependency: CrossDomainRule = {
  name: "grant_ending_programme_dependency_low_runway",
  describes:
    "A grant ends within the horizon, a live programme depends on it, and unrestricted runway cannot absorb the loss.",
  evaluate(snapshot, items) {
    const index = byId(items);
    const runwayItem = index.get(`unrestricted_runway:${snapshot.organisationId}`);
    const out: CompositeAttentionItem[] = [];

    for (const grant of snapshot.grants) {
      if (grant.status !== "active") continue;
      const endingItem = index.get(`grant_ending:${grant.id}`);
      if (!endingItem) continue;

      const dependentProgrammeIds = snapshot.programmeGrants
        .filter((link) => link.grantId === grant.id)
        .map((link) => link.programmeId);
      const dependent = snapshot.programmes.filter(
        (p) => dependentProgrammeIds.includes(p.id) && p.status === "active",
      );
      if (dependent.length === 0) continue;

      // Does anything else fund these programmes past the end date?
      const alternatives = snapshot.programmeGrants.filter(
        (link) =>
          dependentProgrammeIds.includes(link.programmeId) &&
          link.grantId !== grant.id &&
          snapshot.grants.some(
            (g) =>
              g.id === link.grantId &&
              g.status === "active" &&
              parseISO(g.endDate).getTime() > parseISO(grant.endDate).getTime(),
          ),
      );

      const soleFunder = alternatives.length === 0;
      // Without a runway item the finance leg is unproven, and a rule that
      // fires on two of its three legs is a different, weaker rule. It is
      // still worth surfacing when the grant is the programme's only funding.
      if (!runwayItem && !soleFunder) continue;

      const components = [endingItem, ...(runwayItem ? [runwayItem] : [])];
      const days = endingItem.dueInDays;
      const names = dependent.map((p) => p.name).join(" and ");

      out.push(
        compose({
          rule: this.name,
          category: "grants",
          severity: runwayItem && soleFunder ? "critical" : "high",
          title: `${names} loses its funding when ${grant.title} ends`,
          detail: [
            `${grant.title} ends ${grant.endDate}${days !== undefined ? ` (${days} days)` : ""}.`,
            soleFunder
              ? `${names} has no other active grant running past that date.`
              : "Other funding continues, but not at the same level.",
            runwayItem
              ? `Unrestricted reserves cannot absorb the delivery: ${runwayItem.detail}`
              : "The unrestricted position has not been recorded, so the shortfall cannot be sized.",
          ].join(" "),
          subject: { type: "grant", id: grant.id, label: grant.title },
          components,
          extraSources: dependent.map((p) => ({
            type: "programme" as const,
            id: p.id,
            label: p.name,
          })),
          dueInDays: days,
          action: { label: "Plan continuation", href: `/grants/${grant.id}` },
        }),
      );
    }

    return out;
  },
};

/**
 * Rule 2 — a report is due, its evidence is incomplete, and its indicator is stale.
 *
 * The brief's second scenario. This is the failure that produces a report
 * written the week it is due out of numbers nobody has refreshed, and it is
 * only visible if reporting deadlines, evidence coverage and measurement
 * currency are read together.
 */
export const reportDueEvidenceIncomplete: CrossDomainRule = {
  name: "report_due_evidence_incomplete_indicator_stale",
  describes:
    "A funder report falls due while the indicators it depends on are unmeasured or the outcomes behind it are unevidenced.",
  evaluate(snapshot, items) {
    const index = byId(items);
    const out: CompositeAttentionItem[] = [];

    for (const report of snapshot.grantReports) {
      if (report.status === "submitted") continue;
      const dueItem = index.get(`grant_report_due:${report.id}`);
      if (!dueItem) continue;

      const grant = snapshot.grants.find((g) => g.id === report.grantId);
      if (!grant) continue;

      const programmeIds = snapshot.programmeGrants
        .filter((link) => link.grantId === grant.id)
        .map((link) => link.programmeId);
      const outcomes = snapshot.outcomes.filter((o) => programmeIds.includes(o.programmeId));
      const outcomeIds = new Set(outcomes.map((o) => o.id));
      const indicators = snapshot.indicators.filter((i) => outcomeIds.has(i.outcomeId));

      const staleItems = indicators
        .map((i) => index.get(`indicator_stale:${i.id}`))
        .filter((i): i is AttentionItem => Boolean(i));
      const unevidencedItems = outcomes
        .map((o) => index.get(`outcome_unevidenced:${o.id}`))
        .filter((i): i is AttentionItem => Boolean(i));

      if (staleItems.length === 0 && unevidencedItems.length === 0) continue;

      const components = [dueItem, ...staleItems, ...unevidencedItems];
      out.push(
        compose({
          rule: this.name,
          category: "reports",
          severity: dueItem.severity === "critical" ? "critical" : "high",
          title: `${report.title} is due and its evidence is not ready`,
          detail: [
            `${dueItem.title}.`,
            staleItems.length
              ? `${staleItems.length} indicator${staleItems.length === 1 ? " has" : "s have"} no recent measurement.`
              : "",
            unevidencedItems.length
              ? `${unevidencedItems.length} outcome${unevidencedItems.length === 1 ? "" : "s"} in this grant's programmes have no supporting evidence.`
              : "",
            "Drafting can begin, but the figures it needs do not yet exist.",
          ]
            .filter(Boolean)
            .join(" "),
          subject: { type: "grant_report", id: report.id, label: report.title },
          components,
          extraSources: [{ type: "grant", id: grant.id, label: grant.title }],
          dueInDays: dueItem.dueInDays,
          action: { label: "Open grant", href: `/grants/${grant.id}` },
        }),
      );
    }

    return out;
  },
};

/**
 * Rule 3 — a major funder, a relationship going quiet, and a renewal approaching.
 *
 * The brief's third scenario, and the one with the shortest window to act.
 * Concentration says the funder matters, relationship health says nobody has
 * spoken to them, and the grant end date says there is a decision coming.
 */
export const majorFunderRelationshipDeclining: CrossDomainRule = {
  name: "major_funder_relationship_declining_renewal_approaching",
  describes:
    "A funder providing a significant share of income has a relationship needing attention and an award approaching its end.",
  evaluate(snapshot, items) {
    const index = byId(items);
    const out: CompositeAttentionItem[] = [];

    const activeTotal = snapshot.grants
      .filter((g) => g.status === "active")
      .reduce((sum, g) => sum + g.awardValue, 0);

    for (const funder of snapshot.funders) {
      const concentrationItem = index.get(`funder_concentration:${funder.id}`);
      const relationship = snapshot.relationships.find(
        (r) =>
          r.externalOrganisationId !== undefined &&
          r.externalOrganisationId === funder.externalOrganisationId,
      );
      const healthItem = relationship
        ? index.get(`relationship_health:${relationship.id}`)
        : undefined;
      if (!healthItem) continue;

      const endingGrants = snapshot.grants.filter(
        (g) => g.funderId === funder.id && index.has(`grant_ending:${g.id}`),
      );
      const endingItems = endingGrants
        .map((g) => index.get(`grant_ending:${g.id}`))
        .filter((i): i is AttentionItem => Boolean(i));
      if (endingItems.length === 0) continue;

      // A funder with no material share is a relationship matter, not a
      // cross-domain risk. Requiring the concentration leg is what keeps this
      // rule from firing on every small grant that happens to be ending.
      const material =
        concentrationItem !== undefined ||
        (activeTotal > 0 &&
          endingGrants.reduce((sum, g) => sum + g.awardValue, 0) >=
            activeTotal * (ATTENTION_THRESHOLDS.funderShareHigh / 100));
      if (!material) continue;

      const components = [
        ...(concentrationItem ? [concentrationItem] : []),
        healthItem,
        ...endingItems,
      ];
      const soonest = Math.min(...endingItems.map((i) => i.dueInDays ?? Number.POSITIVE_INFINITY));

      out.push(
        compose({
          rule: this.name,
          category: "relationships",
          severity: concentrationItem ? "critical" : "high",
          title: `${funder.name} is a major funder, is going quiet, and has an award ending`,
          detail: [
            concentrationItem
              ? `${concentrationItem.title}.`
              : `${funder.name} funds a significant share of active delivery.`,
            healthItem.detail,
            `${endingItems.length} award${endingItems.length === 1 ? "" : "s"} from this funder end within ${ATTENTION_THRESHOLDS.grantEndingDays} days.`,
          ].join(" "),
          subject: { type: "funder", id: funder.id, label: funder.name },
          components,
          extraSources: endingGrants.map((g) => ({
            type: "grant" as const,
            id: g.id,
            label: g.title,
          })),
          dueInDays: Number.isFinite(soonest) ? soonest : undefined,
          action: relationship?.externalOrganisationId
            ? {
                label: "Open relationship",
                href: `/relationships/${relationship.externalOrganisationId}`,
              }
            : undefined,
        }),
      );
    }

    return out;
  },
};

/**
 * Rule 4 — a funder asked for an outcome the organisation cannot currently show.
 *
 * Not one of the brief's three scenarios, and it is the one the Mission Graph
 * makes newly possible. `ReportingRequirement` records what was promised as
 * edges into outcomes and indicators, so "what did we promise this funder, and
 * can we currently evidence it?" is a traversal rather than a reading exercise
 * over free text. Before MG-1 this rule could not have been written at all.
 */
export const promisedOutcomeUnprovable: CrossDomainRule = {
  name: "promised_outcome_not_currently_provable",
  describes:
    "A funder requirement names an outcome or indicator that is unmeasured, off track or unevidenced.",
  evaluate(snapshot, items) {
    const index = byId(items);
    const out: CompositeAttentionItem[] = [];

    for (const requirement of snapshot.requirements) {
      if (requirement.status === "met" || requirement.status === "waived") continue;
      const promised = snapshot.relations.filter(
        (r) =>
          r.kind === "requires" &&
          r.from.type === "reporting_requirement" &&
          r.from.id === requirement.id,
      );
      if (promised.length === 0) continue;

      const problems = promised
        .map((edge) =>
          edge.to.type === "indicator"
            ? (index.get(`indicator_stale:${edge.to.id}`) ??
              index.get(`indicator_off_track:${edge.to.id}`))
            : edge.to.type === "outcome"
              ? index.get(`outcome_unevidenced:${edge.to.id}`)
              : undefined,
        )
        .filter((i): i is AttentionItem => Boolean(i));
      if (problems.length === 0) continue;

      const dueItem = index.get(`requirement_due:${requirement.id}`);
      const components = [...(dueItem ? [dueItem] : []), ...problems];
      const days = daysUntil(requirement.dueDate, snapshot.now);

      out.push(
        compose({
          rule: this.name,
          category: "reports",
          severity: days !== undefined && days <= 30 ? "critical" : "high",
          title: `${requirement.title} asks for something we cannot currently show`,
          detail: `This funder requirement names ${promised.length} record${promised.length === 1 ? "" : "s"}, and ${problems.length} of them ${problems.length === 1 ? "is" : "are"} unmeasured, off track or unevidenced.`,
          subject: {
            type: "reporting_requirement",
            id: requirement.id,
            label: requirement.title,
          },
          components,
          extraSources: promised.map((edge) => edge.to),
          dueInDays: days,
          action: requirement.grantId
            ? { label: "Open grant", href: `/grants/${requirement.grantId}` }
            : undefined,
        }),
      );
    }

    return out;
  },
};

export const CROSS_DOMAIN_RULES: CrossDomainRule[] = [
  grantEndingProgrammeDependency,
  reportDueEvidenceIncomplete,
  majorFunderRelationshipDeclining,
  promisedOutcomeUnprovable,
];

export interface AttentionBoard {
  /** Composites first where they outrank, components absorbed into them. */
  items: AttentionItem[];
  composites: CompositeAttentionItem[];
  /** Every single-domain item, including absorbed ones, for domain views. */
  singleDomain: AttentionItem[];
}

/**
 * Run the detectors, then the combination rules, then absorb.
 *
 * Absorption is by identity, not by similarity: an item is removed from the
 * flat list only when a composite literally holds it in `components`. That
 * keeps the operation reversible and keeps a near-miss heuristic out of the
 * one place in the product whose job is to be trustworthy about priority.
 */
export function applyCrossDomain(
  snapshot: MissionSnapshot,
  singleDomain: AttentionItem[],
): AttentionBoard {
  const composites = CROSS_DOMAIN_RULES.flatMap((rule) => rule.evaluate(snapshot, singleDomain));
  const absorbed = new Set(composites.flatMap((c) => c.components.map((item) => item.id)));
  const remaining = singleDomain.filter((item) => !absorbed.has(item.id));

  return {
    items: rankAttention([...composites, ...remaining]),
    composites,
    singleDomain,
  };
}
