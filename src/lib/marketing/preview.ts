import { assessFit, FIT_CATEGORY_LABELS } from "@/lib/logic/fit";
import { computeGrantHealth } from "@/lib/logic/grant-health";
import {
  dashboardMetrics,
  upcomingDeadlines,
  weeklyPriorities,
} from "@/features/dashboard/selectors";
import { createDemoContext } from "@/server/context/request-context";
import { getDemoRepository } from "@/server/data";
import { buildRelationshipView } from "@/server/services/relationships";
import { countWords } from "@/lib/utils";
import type { Claim, EvidenceItem, FitAssessment, Indicator } from "@/types/domain";

/**
 * Real product data for the marketing site's previews.
 *
 * The rule this file exists to enforce: **no figure on the public site is
 * written by hand.** Every number, name and label in a product preview is read
 * from the seeded Northstar workspace through `MissionRepository` and run
 * through the same deterministic functions the application runs — `assessFit`,
 * `grantHealth`, `buildRelationshipView`, the dashboard selectors.
 *
 * Three things follow, and all three are the point:
 *
 * 1. No invented customer data can reach the site. If it renders, it is seeded.
 * 2. A preview cannot drift from the product, because it *is* the product's
 *    data. When the fit algorithm changes, the marketing site changes with it.
 * 3. Marketing prose never restates a figure a component also renders, so
 *    there is nothing to keep in sync by hand.
 *
 * This goes through the repository rather than importing `@/features/store`,
 * which `tests/unit/data-boundary.test.ts` would fail the build over — the
 * marketing site is a caller like any other and gets no exemption from tenant
 * scoping.
 *
 * It binds explicitly to the **demo** context and the **demo** repository
 * rather than to `resolveRequestContext()`/`getRepository()`, and that is a
 * correctness requirement rather than a convenience. A public marketing page
 * has no session and no tenant: resolving the live context would throw once
 * Supabase auth is the active path, and resolving the live repository would
 * point an anonymous page at a production database. The previews are of the
 * demo workspace by definition, so they say so in the types.
 *
 * Everything here resolves at build time: the demo context is deterministic
 * and its clock is pinned, so the page stays static and the seeded reads cost
 * nothing per request.
 */

export interface CommandCentrePreview {
  organisationName: string;
  metrics: {
    pipelineValue: number;
    pipelineCount: number;
    inProgressCount: number;
    activeGrantsCount: number;
    securedThisYear: number;
    reportsDue: number;
    outcomesAwaitingEvidence: number;
  };
  priorities: { title: string; detail: string; tone: string }[];
  deadlines: { label: string; sublabel: string; deadline?: string | null }[];
  now: Date;
}

export interface FundingPreview {
  opportunityTitle: string;
  funderName: string;
  minAward: number;
  maxAward: number;
  deadline: string;
  durationMonths?: number;
  priorityThemes: readonly string[];
  eligibleOrgTypes: readonly string[];
  eligibleLocations: readonly string[];
  organisationType: string;
  operatingRegions: readonly string[];
  fit: Omit<FitAssessment, "id" | "generatedAt">;
  /**
   * The human label for `fit.category`, resolved on the server. The product
   * explorer is a client island, and importing `FIT_CATEGORY_LABELS` there
   * would drag the whole fit engine — `assessFit` included — into the browser
   * bundle to render one word.
   */
  categoryLabel: string;
  evidenceCount: number;
}

export interface RelationshipPreview {
  name: string;
  headline: string;
  healthState: string;
  healthReason: string;
  sections: {
    title: string;
    lines: { label: string; value: string }[];
  }[];
  discussionPoints: { label: string; value: string }[];
  missing: string[];
}

export interface ProvenancePreview {
  claim: Claim;
  /** The evidence item the claim's first source points at, when resolvable. */
  evidence: EvidenceItem | null;
  /** Claims this one stands on, for the derivation chain. */
  supportChain: Claim[];
  /** A second, deliberately weaker claim: a forecast standing on an assumption. */
  forecast: Claim | null;
  forecastSupport: Claim[];
  programmeName: string;
  grantTitle: string;
  indicators: Indicator[];
}

export interface ProductExplorerPreview {
  command: CommandCentrePreview;
  funding: {
    stage: string;
    title: string;
    funder: string;
    deadline: string;
    maxAward: number;
    probability: number;
    nextAction?: string;
  }[];
  application: {
    title: string;
    status: string;
    answers: { question: string; wordLimit?: number; status: string; words: number }[];
  } | null;
  programme: {
    name: string;
    summary: string;
    status: string;
    location: string;
    budget?: number;
    indicators: { name: string; current: number; target: number; unit: string }[];
  } | null;
  grant: {
    title: string;
    funder: string;
    awardValue: number;
    spentToDate: number;
    endDate: string;
    healthLabel: string;
    healthDetail: string;
    budgetUsedPercent: number;
    timeElapsedPercent: number;
  } | null;
}

/** Everything the marketing page needs, in one pass over the repository. */
export interface MarketingPreviewData {
  command: CommandCentrePreview;
  funding: FundingPreview;
  relationship: RelationshipPreview | null;
  provenance: ProvenancePreview | null;
  explorer: ProductExplorerPreview;
}

/** The seeded records the previews are built from. */
const OPPORTUNITY_ID = "opp-horizon";
const RELATIONSHIP_ORG_ID = "xorg-henderson";
const PARTICIPANTS_CLAIM_ID = "clm-participants-2025";
const GAP_CLAIM_ID = "clm-youth-gap-2027";
const PROGRAMME_ID = "prog-youth";
const GRANT_ID = "grant-henderson";
const APPLICATION_ID = "app-horizon";

export async function loadMarketingPreview(): Promise<MarketingPreviewData> {
  const ctx = createDemoContext();
  const repo = getDemoRepository();
  const now = ctx.now();

  const [
    org,
    profile,
    metrics,
    priorities,
    deadlines,
    opportunity,
    evidence,
    relationshipView,
    participantsClaim,
    gapClaim,
    opportunities,
    funders,
    application,
    programme,
    grant,
  ] = await Promise.all([
    repo.organisations.get(ctx),
    repo.organisations.profile(ctx),
    dashboardMetrics(ctx, repo),
    weeklyPriorities(ctx, repo),
    upcomingDeadlines(ctx, repo),
    repo.funding.getOpportunity(ctx, OPPORTUNITY_ID),
    repo.evidence.list(ctx),
    buildRelationshipView(ctx, repo, RELATIONSHIP_ORG_ID),
    repo.claims.get(ctx, PARTICIPANTS_CLAIM_ID),
    repo.claims.get(ctx, GAP_CLAIM_ID),
    repo.funding.listOpportunities(ctx),
    repo.funding.listFunders(ctx),
    repo.applications.get(ctx, APPLICATION_ID),
    repo.programmes.get(ctx, PROGRAMME_ID),
    repo.grants.get(ctx, GRANT_ID),
  ]);

  if (!org || !profile || !opportunity) {
    throw new Error(
      "Marketing previews require the seeded demo workspace. The organisation, profile or reference opportunity is missing.",
    );
  }

  const funderName = (id: string) => funders.find((f) => f.id === id)?.name ?? "Funder";

  const command: CommandCentrePreview = {
    organisationName: org.name,
    metrics,
    priorities: priorities.slice(0, 3).map((p) => ({
      title: p.title,
      detail: p.detail,
      tone: p.tone,
    })),
    deadlines: deadlines.slice(0, 4).map((d) => ({
      label: d.label,
      sublabel: d.sublabel,
      deadline: d.deadline,
    })),
    now,
  };

  const fit = assessFit({
    opportunity,
    organisation: org,
    profile,
    evidenceCount: evidence.length,
  });

  const funding: FundingPreview = {
    opportunityTitle: opportunity.programmeName,
    funderName: funderName(opportunity.funderId),
    minAward: opportunity.minAward ?? 0,
    maxAward: opportunity.maxAward ?? 0,
    deadline: opportunity.deadline ?? "",
    durationMonths: opportunity.fundingDurationMonths,
    priorityThemes: opportunity.priorityThemes,
    eligibleOrgTypes: opportunity.eligibleOrgTypes,
    eligibleLocations: opportunity.eligibleLocations,
    organisationType: org.type,
    operatingRegions: org.operatingRegions,
    evidenceCount: evidence.length,
    fit,
    categoryLabel: FIT_CATEGORY_LABELS[fit.category],
  };

  const relationship: RelationshipPreview | null = relationshipView
    ? {
        name: relationshipView.organisation.name,
        headline: relationshipView.brief.headline,
        healthState: relationshipView.health.state,
        healthReason: relationshipView.health.reason,
        sections: relationshipView.brief.sections.map((s) => ({
          title: s.title,
          lines: s.lines.map((l) => ({ label: l.label, value: l.value })),
        })),
        discussionPoints: relationshipView.brief.discussionPoints.map((p) => ({
          label: p.label,
          value: p.value,
        })),
        missing: [...relationshipView.brief.missing],
      }
    : null;

  let provenance: ProvenancePreview | null = null;
  if (participantsClaim && programme && grant) {
    const [rawSupport, rawForecastSupport, indicators] = await Promise.all([
      repo.claims.supportChain(ctx, participantsClaim.id),
      gapClaim ? repo.claims.supportChain(ctx, gapClaim.id) : Promise.resolve([]),
      repo.programmes.indicatorsForProgramme(ctx, programme.id),
    ]);
    // `supportChain` traces from the claim inclusive — it is a derivation
    // trace, not a list of dependencies. "Stands on" means the rest of it.
    const supportChain = rawSupport.filter((c) => c.id !== participantsClaim.id);
    const forecastSupport = rawForecastSupport.filter((c) => c.id !== gapClaim?.id);
    const firstSource = participantsClaim.sources[0];
    const evidenceItem =
      firstSource && firstSource.ref.type === "evidence"
        ? (evidence.find((e) => e.id === firstSource.ref.id) ?? null)
        : null;

    provenance = {
      claim: participantsClaim,
      evidence: evidenceItem,
      supportChain,
      forecast: gapClaim,
      forecastSupport,
      programmeName: programme.name,
      grantTitle: grant.title,
      indicators,
    };
  }

  const answers = application ? await repo.applications.answers(ctx, application.id) : [];

  const programmeIndicators = programme
    ? await repo.programmes.indicatorsForProgramme(ctx, programme.id)
    : [];

  const grantExtras = grant
    ? await Promise.all([
        repo.grants.deliverables(ctx, grant.id),
        repo.grants.reports(ctx, grant.id),
        repo.evidence.forTarget(ctx, "grant", grant.id),
      ])
    : null;

  const explorer: ProductExplorerPreview = {
    command,
    funding: opportunities.slice(0, 5).map((o) => ({
      stage: o.stage,
      title: o.programmeName,
      funder: funderName(o.funderId),
      deadline: o.deadline ?? "",
      maxAward: o.maxAward ?? 0,
      probability: o.probability ?? 0,
      nextAction: o.nextAction,
    })),
    application: application
      ? {
          title: application.title,
          status: application.status,
          answers: [...answers]
            .sort((a, b) => a.order - b.order)
            .slice(0, 4)
            .map((a) => ({
              question: a.questionText,
              wordLimit: a.wordLimit,
              status: a.status,
              words: countWords(a.draft),
            })),
        }
      : null,
    programme: programme
      ? {
          name: programme.name,
          summary: programme.summary,
          status: programme.status,
          location: programme.location ?? "",
          budget: programme.budget,
          indicators: programmeIndicators.map((i) => ({
            name: i.name,
            current: i.currentValue,
            target: i.target,
            unit: i.unit,
          })),
        }
      : null,
    grant:
      grant && grantExtras
        ? (() => {
            const health = computeGrantHealth({
              grant,
              deliverables: grantExtras[0],
              reports: grantExtras[1],
              linkedEvidenceCount: grantExtras[2].length,
              now,
            });
            return {
              title: grant.title,
              funder: funderName(grant.funderId),
              awardValue: grant.awardValue,
              spentToDate: grant.spentToDate,
              endDate: grant.endDate,
              healthLabel: health.state,
              healthDetail: health.reasons[0] ?? "",
              budgetUsedPercent: health.budgetUsedPercent,
              timeElapsedPercent: health.timeElapsedPercent,
            };
          })()
        : null,
  };

  return { command, funding, relationship, provenance, explorer };
}
