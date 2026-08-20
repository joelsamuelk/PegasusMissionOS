import type {
  Attested,
  Organisation,
  OrganisationMember,
  OrganisationProfile,
  User,
  VerificationState,
} from "@/types/domain";
import type { OrganisationRepository } from "../../types";
import { arrayFrom, auditFrom, optionalNumberFrom, optionalStringFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";

function mapOrganisation(row: Row): Organisation {
  return {
    id: String(row.id),
    name: String(row.name),
    legalName: String(row.legal_name),
    type: row.type as Organisation["type"],
    ...(row.charity_number ? { charityNumber: String(row.charity_number) } : {}),
    ...(row.company_number ? { companyNumber: String(row.company_number) } : {}),
    ...(row.year_founded != null ? { yearFounded: optionalNumberFrom(row.year_founded) } : {}),
    ...(row.website ? { website: String(row.website) } : {}),
    ...(row.registered_address ? { registeredAddress: String(row.registered_address) } : {}),
    operatingRegions: arrayFrom(row.operating_regions),
    ...(row.organisation_size ? { organisationSize: String(row.organisation_size) } : {}),
    ...(row.annual_income_band ? { annualIncomeBand: String(row.annual_income_band) } : {}),
    isDemo: Boolean(row.is_demo),
    aiEnabled: Boolean(row.ai_enabled),
    audit: auditFrom(row),
  };
}

function mapMember(row: Row): OrganisationMember {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    userId: String(row.user_id),
    role: row.role as OrganisationMember["role"],
    status: row.status as OrganisationMember["status"],
    ...(row.invited_at ? { invitedAt: String(row.invited_at) } : {}),
    ...(row.joined_at ? { joinedAt: String(row.joined_at) } : {}),
  };
}

function mapUser(row: Row): User {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    ...(row.job_title ? { jobTitle: String(row.job_title) } : {}),
    avatarInitials: String(row.avatar_initials ?? ""),
  };
}

/**
 * Read one attested profile field.
 *
 * The value lives in a jsonb column and the claim id, where the field has
 * migrated onto a claim, in its own column. A field with no claim id still
 * reads from its inline value -- which is what makes the migration field by
 * field and reversible, rather than a single cutover.
 */
function attested<T>(row: Row, column: string, fallback: T): Attested<T> {
  const stored = row[column] as Partial<Attested<T>> | null;
  const claimId = row[`${column}_claim_id`];
  return {
    value: (stored?.value ?? fallback) as T,
    verification: (stored?.verification ?? "needs_review") as VerificationState,
    ...(stored?.source ? { source: stored.source } : {}),
    ...(stored?.lastVerifiedAt ? { lastVerifiedAt: stored.lastVerifiedAt } : {}),
    ...(claimId ? { claimId: String(claimId) } : {}),
  };
}

function mapProfile(row: Row): OrganisationProfile {
  const text = (column: string) => attested(row, column, "");
  const list = (column: string) => attested<string[]>(row, column, []);
  return {
    organisationId: String(row.organisation_id),
    missionStatement: text("mission_statement"),
    vision: text("vision"),
    summary: text("summary"),
    coreActivities: list("core_activities"),
    strategicPriorities: list("strategic_priorities"),
    communitiesServed: list("communities_served"),
    geographicReach: text("geographic_reach"),
    trustees: list("trustees"),
    keyPolicies: list("key_policies"),
    safeguardingStatus: text("safeguarding_status"),
    dataProtectionStatus: text("data_protection_status"),
    insuranceStatus: text("insurance_status"),
    financialYearEnd: text("financial_year_end"),
    auditors: text("auditors"),
    typicalFundingRequirement: text("typical_funding_requirement"),
    preferredFundingTypes: list("preferred_funding_types"),
    restrictedNeeds: text("restricted_needs"),
    unrestrictedNeeds: text("unrestricted_needs"),
    pastFunders: list("past_funders"),
    matchFundingAvailable: text("match_funding_available"),
  };
}

export function createOrganisationRepository(q: Query, deps: Deps): OrganisationRepository {
  /** User ids holding an active membership of the context organisation. */
  async function activeMemberIds(ctx: Parameters<OrganisationRepository["users"]>[0]) {
    const rows = await q.many(ctx, "organisation_members", { status: "active" });
    return rows.map((r) => String(r.user_id));
  }

  return {
    async get(ctx) {
      // `organisations` is scoped by its own primary key, not by an
      // `organisation_id` column, so this is the one read that cannot use the
      // shared tenant filter.
      const { data, error } = await q.raw
        .from("organisations")
        .select("*")
        .eq("id", ctx.organisationId)
        .maybeSingle();
      if (error) throw new Error(`Could not read organisations: ${error.message}`);
      return data ? mapOrganisation(data as Row) : null;
    },

    async profile(ctx) {
      const row = await q.maybeOne(ctx, "organisation_profiles", {});
      return row ? mapProfile(row) : null;
    },

    async members(ctx) {
      const rows = await q.many(ctx, "organisation_members", {});
      return rows.map(mapMember);
    },

    async users(ctx) {
      const ids = await activeMemberIds(ctx);
      if (ids.length === 0) return [];
      // `users` carries no `organisation_id`: a user can belong to several
      // organisations. Membership is the scope, which is why the id list is
      // resolved first rather than filtering the table.
      const { data, error } = await q.raw.from("users").select("*").in("id", ids);
      if (error) throw new Error(`Could not read users: ${error.message}`);
      return ((data ?? []) as Row[]).map(mapUser);
    },

    async user(ctx, userId) {
      const ids = await activeMemberIds(ctx);
      if (!ids.includes(userId)) return null;
      const { data, error } = await q.raw
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw new Error(`Could not read users: ${error.message}`);
      return data ? mapUser(data as Row) : null;
    },

    async currentUser(ctx) {
      return this.user(ctx, ctx.userId);
    },

    async currentMember(ctx) {
      const row = await q.maybeOne(ctx, "organisation_members", { user_id: ctx.userId });
      return row ? mapMember(row) : null;
    },

    async setAiEnabled(ctx, enabled) {
      const { error } = await q.raw
        .from("organisations")
        .update({ ai_enabled: enabled, updated_at: ctx.now().toISOString() })
        .eq("id", ctx.organisationId);
      if (error) throw new Error(`Could not update organisations: ${error.message}`);
      await deps.audit.record(ctx, {
        action: "organisation.ai_setting.changed",
        entityType: "organisation",
        entityId: ctx.organisationId,
        summary: `AI assistance ${enabled ? "enabled" : "disabled"} for the workspace`,
      });
    },
  };
}
