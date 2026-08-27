import { assembleClaim } from "@/lib/fundraising/gift-aid";
import type {
  Appeal,
  Campaign,
  CurrencyCode,
  Donation,
  GiftAidClaim,
  GiftAidDeclaration,
  RecurringCommitment,
  SupporterProfile,
} from "@/types/domain";
import type { FundraisingRepository } from "../../types";
import { arrayFrom, auditFrom, numberFrom, optionalNumberFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";

function mapCampaign(row: Row): Campaign {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    name: String(row.name),
    ...(row.description ? { description: String(row.description) } : {}),
    ...(row.target_minor_units != null
      ? { targetMinorUnits: numberFrom(row.target_minor_units) }
      : {}),
    currency: String(row.currency) as CurrencyCode,
    startsOn: String(row.starts_on),
    ...(row.ends_on ? { endsOn: String(row.ends_on) } : {}),
    ...(row.fund_id ? { fundId: String(row.fund_id) } : {}),
    ...(row.programme_id ? { programmeId: String(row.programme_id) } : {}),
    // Direct cost, so net income is computable rather than assumed.
    ...(row.cost_minor_units != null ? { costMinorUnits: numberFrom(row.cost_minor_units) } : {}),
    status: row.status as Campaign["status"],
    audit: auditFrom(row),
  };
}

function mapAppeal(row: Row): Appeal {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    campaignId: String(row.campaign_id),
    name: String(row.name),
    channel: row.channel as Appeal["channel"],
    ...(row.sent_on ? { sentOn: String(row.sent_on) } : {}),
    // Needed for a response rate that means anything.
    ...(row.audience_size != null ? { audienceSize: optionalNumberFrom(row.audience_size) } : {}),
    ...(row.cost_minor_units != null ? { costMinorUnits: numberFrom(row.cost_minor_units) } : {}),
    audit: auditFrom(row),
  };
}

function mapDonation(row: Row): Donation {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    // Required. A donation without a transaction would be a pledge.
    transactionId: String(row.transaction_id),
    ...(row.person_id ? { personId: String(row.person_id) } : {}),
    ...(row.external_organisation_id
      ? { externalOrganisationId: String(row.external_organisation_id) }
      : {}),
    kind: row.kind as Donation["kind"],
    channel: row.channel as Donation["channel"],
    receivedOn: String(row.received_on),
    ...(row.campaign_id ? { campaignId: String(row.campaign_id) } : {}),
    ...(row.appeal_id ? { appealId: String(row.appeal_id) } : {}),
    ...(row.recurring_commitment_id
      ? { recurringCommitmentId: String(row.recurring_commitment_id) }
      : {}),
    // Anonymous to the public, not to the organisation: `personId` may still
    // be set, because a charity must be able to identify its donors for due
    // diligence and for Gift Aid.
    anonymous: Boolean(row.anonymous),
    restricted: Boolean(row.restricted),
    ...(row.restriction_purpose ? { restrictionPurpose: String(row.restriction_purpose) } : {}),
    ...(row.gift_aid_declaration_id
      ? { giftAidDeclarationId: String(row.gift_aid_declaration_id) }
      : {}),
    giftAidClaimed: Boolean(row.gift_aid_claimed),
    // HMRC's benefit rules disqualify a gift above set limits, so the value is
    // recorded rather than assumed nil.
    ...(row.benefit_value_minor_units != null
      ? { benefitValueMinorUnits: numberFrom(row.benefit_value_minor_units) }
      : {}),
    ...(row.note ? { note: String(row.note) } : {}),
    ...(row.thanked_at ? { thankedAt: String(row.thanked_at) } : {}),
    audit: auditFrom(row),
  };
}

function mapRecurring(row: Row): RecurringCommitment {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    ...(row.person_id ? { personId: String(row.person_id) } : {}),
    ...(row.external_organisation_id
      ? { externalOrganisationId: String(row.external_organisation_id) }
      : {}),
    amountMinorUnits: numberFrom(row.amount_minor_units),
    currency: String(row.currency) as CurrencyCode,
    frequency: row.frequency as RecurringCommitment["frequency"],
    channel: row.channel as RecurringCommitment["channel"],
    startedOn: String(row.started_on),
    ...(row.ended_on ? { endedOn: String(row.ended_on) } : {}),
    ...(row.ended_reason ? { endedReason: String(row.ended_reason) } : {}),
    ...(row.campaign_id ? { campaignId: String(row.campaign_id) } : {}),
    status: row.status as RecurringCommitment["status"],
    audit: auditFrom(row),
  };
}

function mapSupporter(row: Row): SupporterProfile {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    ...(row.person_id ? { personId: String(row.person_id) } : {}),
    ...(row.external_organisation_id
      ? { externalOrganisationId: String(row.external_organisation_id) }
      : {}),
    ...(row.steward_id ? { stewardId: String(row.steward_id) } : {}),
    stage: row.stage as SupporterProfile["stage"],
    // Set by a human, overriding the derived stage. Requires a reason, which
    // is why it is stored as a whole object rather than a bare stage column.
    ...(row.stage_override
      ? { stageOverride: row.stage_override as SupporterProfile["stageOverride"] }
      : {}),
    // Never inferred.
    ...(row.recognition_preference
      ? {
          recognitionPreference:
            row.recognition_preference as SupporterProfile["recognitionPreference"],
        }
      : {}),
    doNotSolicit: Boolean(row.do_not_solicit),
    ...(row.do_not_solicit_reason
      ? { doNotSolicitReason: String(row.do_not_solicit_reason) }
      : {}),
    ...(row.notes ? { notes: String(row.notes) } : {}),
    audit: auditFrom(row),
  };
}

function mapDeclaration(row: Row): GiftAidDeclaration {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    // Gift Aid applies to individuals only. A company cannot make one.
    personId: String(row.person_id),
    fullName: String(row.full_name),
    addressLine: String(row.address_line),
    postcode: String(row.postcode),
    taxpayerConfirmed: Boolean(row.taxpayer_confirmed),
    declaredOn: String(row.declared_on),
    scope: row.scope as GiftAidDeclaration["scope"],
    ...(row.donation_id ? { donationId: String(row.donation_id) } : {}),
    ...(row.cancelled_on ? { cancelledOn: String(row.cancelled_on) } : {}),
    ...(row.cancelled_reason ? { cancelledReason: String(row.cancelled_reason) } : {}),
    audit: auditFrom(row),
  };
}

function mapClaim(row: Row): GiftAidClaim {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    donationIds: arrayFrom(row.donation_ids),
    // Computed, never entered.
    claimableMinorUnits: numberFrom(row.claimable_minor_units),
    currency: String(row.currency) as CurrencyCode,
    status: row.status as GiftAidClaim["status"],
    // Filled in by whoever filed it with HMRC. Pegasus never files.
    ...(row.hmrc_reference ? { hmrcReference: String(row.hmrc_reference) } : {}),
    ...(row.filed_by ? { filedBy: String(row.filed_by) } : {}),
    ...(row.filed_on ? { filedOn: String(row.filed_on) } : {}),
    audit: auditFrom(row),
  };
}

export function createFundraisingRepository(q: Query, deps: Deps): FundraisingRepository {
  return {
    async campaigns(ctx) {
      const rows = await q.many(ctx, "campaigns", {}, {
        order: { column: "starts_on", ascending: false },
        liveOnly: true,
      });
      return rows.map(mapCampaign);
    },

    async getCampaign(ctx, id) {
      const row = await q.maybeOne(ctx, "campaigns", { id });
      return row ? mapCampaign(row) : null;
    },

    async appeals(ctx, campaignId) {
      const rows = await q.many(ctx, "appeals", campaignId ? { campaign_id: campaignId } : {});
      return rows.map(mapAppeal);
    },

    async donations(ctx, options) {
      const rows = await q.many(
        ctx,
        "donations",
        {
          ...(options?.campaignId ? { campaign_id: options.campaignId } : {}),
          ...(options?.personId ? { person_id: options.personId } : {}),
        },
        { order: { column: "received_on", ascending: false }, liveOnly: true },
      );
      return rows.map(mapDonation);
    },

    async getDonation(ctx, id) {
      const row = await q.maybeOne(ctx, "donations", { id });
      return row ? mapDonation(row) : null;
    },

    async recurringCommitments(ctx) {
      const rows = await q.many(ctx, "recurring_commitments", {}, {
        order: { column: "started_on", ascending: false },
      });
      return rows.map(mapRecurring);
    },

    async recordDonation(ctx, init) {
      if (init.amountMinorUnits <= 0) {
        return { ok: false, message: "A donation must be a positive amount." };
      }
      if (init.personId && init.externalOrganisationId) {
        return { ok: false, message: "A gift comes from a person or an organisation, not both." };
      }
      if (init.personId && !(await q.maybeOne(ctx, "people", { id: init.personId }))) {
        return { ok: false, message: "That person is not in this organisation." };
      }
      if (
        init.externalOrganisationId &&
        !(await q.maybeOne(ctx, "external_organisations", { id: init.externalOrganisationId }))
      ) {
        return {
          ok: false,
          message: "That organisation is not in this organisation's records.",
        };
      }
      const fundRow = await q.maybeOne(ctx, "funds", { id: init.fundId });
      if (!fundRow) return { ok: false, message: "That fund could not be found." };
      // A restricted gift whose restriction is unstated cannot be honoured.
      if (init.restricted && !init.restrictionPurpose?.trim()) {
        return {
          ok: false,
          message:
            "A restricted gift needs its restriction stated. Otherwise it cannot be honoured.",
        };
      }

      // The money first, and only once.
      const transactionId = await deps.finance.recordTransaction(ctx, {
        date: init.receivedOn,
        description:
          init.description ??
          (init.anonymous ? "Anonymous donation" : `Donation (${init.channel})`),
        amount: { minorUnits: init.amountMinorUnits, currency: init.currency as CurrencyCode },
        direction: "income",
        category: "Donations received",
        restricted: init.restricted ?? false,
        fundId: String(fundRow.id),
        source: "manual",
        // Somebody entered it. Nobody has reconciled it against a bank line.
        verificationState: "provided",
      });

      const donationRow = await q.insert(ctx, "donations", {
        transactionId,
        personId: init.personId,
        externalOrganisationId: init.externalOrganisationId,
        kind: init.kind ?? "one_off",
        channel: init.channel,
        receivedOn: init.receivedOn,
        campaignId: init.campaignId,
        appealId: init.appealId,
        recurringCommitmentId: init.recurringCommitmentId,
        anonymous: init.anonymous ?? false,
        restricted: init.restricted ?? false,
        restrictionPurpose: init.restrictionPurpose,
        giftAidClaimed: false,
        benefitValueMinorUnits: init.benefitValueMinorUnits,
        note: init.note,
      });
      const donationId = String(donationRow.id);

      /**
       * Attribution, where the gift is restricted to something.
       *
       * A restricted gift that nothing attributes is money the organisation
       * has promised to spend on a thing and cannot show it spent on that
       * thing. An unrestricted gift is deliberately left unallocated: it is
       * core income, and forcing it onto a programme would be the
       * apportionment fiction MG-8 exists to avoid.
       */
      let allocationId: string | undefined;
      if (init.programmeId && init.restricted) {
        const allocated = await deps.finance.allocate(ctx, {
          transactionId,
          fundId: String(fundRow.id),
          programmeId: init.programmeId,
          amount: { minorUnits: init.amountMinorUnits, currency: init.currency as CurrencyCode },
          allocationMethod: "direct",
          allocationBasis: "direct",
          allocationNote: `Restricted gift: ${init.restrictionPurpose}`,
          restricted: true,
          effectiveDate: init.receivedOn,
          verificationState: "provided",
          createdBy: ctx.userId,
        });
        allocationId = allocated ?? undefined;
      }

      // A supporter profile, so the gift has somewhere to be stewarded from.
      // Created rather than required, because a first gift should not need
      // somebody to set up a record before it can be recorded.
      let supporterProfileId: string | undefined;
      const party = init.personId
        ? { person_id: init.personId }
        : init.externalOrganisationId
          ? { external_organisation_id: init.externalOrganisationId }
          : null;
      if (party) {
        const existing = await q.maybeOne(ctx, "supporter_profiles", party);
        if (existing) supporterProfileId = String(existing.id);
        else {
          const created = await q.insert(ctx, "supporter_profiles", {
            personId: init.personId,
            externalOrganisationId: init.externalOrganisationId,
            stage: init.externalOrganisationId ? "corporate" : "new",
            doNotSolicit: false,
          });
          supporterProfileId = String(created.id);
        }
      }

      await deps.audit.record(ctx, {
        action: "donation.recorded",
        entityType: "donation",
        entityId: donationId,
        summary: `Recorded a ${(init.amountMinorUnits / 100).toFixed(2)} donation${init.anonymous ? " (anonymous)" : ""} into ${String(fundRow.name)}`,
      });

      return { ok: true, donationId, transactionId, allocationId, supporterProfileId };
    },

    async markThanked(ctx, donationId) {
      await q.update(ctx, "donations", donationId, { thankedAt: ctx.now().toISOString() });
    },

    async supporterProfiles(ctx) {
      const rows = await q.many(ctx, "supporter_profiles", {});
      return rows.map(mapSupporter);
    },

    async getSupporterProfile(ctx, party) {
      if (!party.personId && !party.externalOrganisationId) return null;
      const row = await q.maybeOne(ctx, "supporter_profiles", {
        ...(party.personId ? { person_id: party.personId } : {}),
        ...(party.externalOrganisationId
          ? { external_organisation_id: party.externalOrganisationId }
          : {}),
      });
      return row ? mapSupporter(row) : null;
    },

    async saveSupporterProfile(ctx, input) {
      // Exactly one party. Identity stays canonical, and a profile attached to
      // both a person and an organisation would make "who is this supporter?"
      // unanswerable.
      if (Boolean(input.personId) === Boolean(input.externalOrganisationId)) return null;
      const columns = {
        personId: input.personId,
        externalOrganisationId: input.externalOrganisationId,
        stewardId: input.stewardId,
        stage: input.stage,
        stageOverride: input.stageOverride,
        recognitionPreference: input.recognitionPreference,
        doNotSolicit: input.doNotSolicit,
        doNotSolicitReason: input.doNotSolicitReason,
        notes: input.notes,
      };
      if (input.id) {
        const existing = await q.maybeOne(ctx, "supporter_profiles", { id: input.id });
        if (existing) {
          await q.update(ctx, "supporter_profiles", input.id, columns);
          return input.id;
        }
      }
      const row = await q.insert(ctx, "supporter_profiles", {
        ...(input.id ? { id: input.id } : {}),
        ...columns,
      });
      return String(row.id);
    },

    async giftAidDeclarations(ctx, personId) {
      const rows = await q.many(
        ctx,
        "gift_aid_declarations",
        personId ? { person_id: personId } : {},
        { order: { column: "declared_on", ascending: false } },
      );
      return rows.map(mapDeclaration);
    },

    async recordGiftAidDeclaration(ctx, input) {
      // HMRC requires the taxpayer confirmation, a name and an address. A
      // declaration missing any of them is not a declaration, and storing one
      // would put an invalid claim into a later assembly.
      if (!input.taxpayerConfirmed) return null;
      if (!input.fullName.trim() || !input.addressLine.trim() || !input.postcode.trim()) {
        return null;
      }
      if (!(await q.maybeOne(ctx, "people", { id: input.personId }))) return null;

      const row = await q.insert(ctx, "gift_aid_declarations", {
        personId: input.personId,
        fullName: input.fullName,
        addressLine: input.addressLine,
        postcode: input.postcode,
        taxpayerConfirmed: input.taxpayerConfirmed,
        declaredOn: input.declaredOn,
        scope: input.scope,
        donationId: input.donationId,
        cancelledOn: input.cancelledOn,
        cancelledReason: input.cancelledReason,
      });
      return String(row.id);
    },

    async assembleGiftAidClaim(ctx, periodStart, periodEnd) {
      const donations = (await q.many(ctx, "donations", {}))
        .map(mapDonation)
        .filter((d) => d.receivedOn >= periodStart && d.receivedOn <= periodEnd);
      const declarations = (await q.many(ctx, "gift_aid_declarations", {})).map(mapDeclaration);
      const transactions = await deps.finance.transactions(ctx);

      // Assembles and validates. It never files: Pegasus does not submit to
      // HMRC, and a submission that looked as though it had happened and had
      // not would be discovered by HMRC rather than by the charity.
      const assembly = assembleClaim(
        donations.map((donation) => ({
          donation,
          amountMinorUnits:
            transactions.find((t) => t.id === donation.transactionId)?.amount.minorUnits ?? 0,
          declaration: declarations.find(
            (candidate) =>
              candidate.id === donation.giftAidDeclarationId ||
              (candidate.scope === "enduring" && candidate.personId === donation.personId),
          ),
        })),
      );

      const row = await q.insert(ctx, "gift_aid_claims", {
        periodStart,
        periodEnd,
        donationIds: assembly.eligible.map((entry) => entry.donationId),
        claimableMinorUnits: assembly.totalClaimableMinorUnits,
        currency: "GBP",
        // Never `filed`. A person files it through HMRC's own service and
        // records the reference.
        status: assembly.eligible.length > 0 ? "ready" : "draft",
      });
      const claimId = String(row.id);

      await deps.audit.record(ctx, {
        action: "giftaid.claim.assembled",
        entityType: "donation",
        entityId: claimId,
        summary: `Assembled a Gift Aid claim: ${assembly.eligible.length} eligible gifts, ${assembly.refused.length} refused, ${(assembly.totalClaimableMinorUnits / 100).toFixed(2)} claimable. Not filed.`,
      });

      return {
        claimId,
        claimableMinorUnits: assembly.totalClaimableMinorUnits,
        refused: assembly.refused.length,
      };
    },

    async giftAidClaims(ctx) {
      const rows = await q.many(ctx, "gift_aid_claims", {}, {
        order: { column: "period_end", ascending: false },
      });
      return rows.map(mapClaim);
    },
  };
}
