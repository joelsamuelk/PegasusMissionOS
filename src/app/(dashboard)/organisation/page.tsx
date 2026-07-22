import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import type { Attested, VerificationState } from "@/types/domain";
import { humanise } from "@/lib/formatting";
import { q } from "@/features/store";
import { profileCompleteness } from "@/lib/logic/progress";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody } from "@/components/shared/ui";
import { ProgressMeter, VerificationBadge } from "@/components/shared/misc";

export const metadata: Metadata = { title: "Organisation" };

export default function OrganisationPage() {
  const org = q.organisation();
  const p = q.profile();
  const { score, missing } = profileCompleteness(p);

  return (
    <div>
      <PageHeader
        eyebrow="Organisation profile"
        title={org.name}
        description="Your organisational knowledge base. Pegasus Intelligence uses these approved fields to ground every draft. Each field shows its verification state."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <ProfileGroup title="Core identity">
            <Row label="Legal name" value={org.legalName} state="verified" />
            <Row label="Organisation type" value={humanise(org.type)} state="verified" />
            <Row label="Charity number" value={org.charityNumber ?? "-"} state="verified" />
            <Row label="Year founded" value={String(org.yearFounded ?? "-")} state="verified" />
            <Row label="Website" value={org.website ?? "-"} state="provided" />
            <Row label="Registered address" value={org.registeredAddress ?? "-"} state="provided" />
            <Row label="Operating regions" value={org.operatingRegions.join(", ")} state="verified" />
            <Row label="Organisation size" value={org.organisationSize ?? "-"} state="provided" />
            <Row label="Annual income band" value={org.annualIncomeBand ?? "-"} state="provided" />
          </ProfileGroup>

          <ProfileGroup title="Mission">
            <AttestedRow label="Mission statement" field={p.missionStatement} />
            <AttestedRow label="Vision" field={p.vision} />
            <AttestedRow label="Summary" field={p.summary} />
            <AttestedRow label="Core activities" field={p.coreActivities} />
            <AttestedRow label="Strategic priorities" field={p.strategicPriorities} />
            <AttestedRow label="Communities served" field={p.communitiesServed} />
            <AttestedRow label="Geographic reach" field={p.geographicReach} />
          </ProfileGroup>

          <ProfileGroup title="Governance">
            <AttestedRow label="Trustees" field={p.trustees} />
            <AttestedRow label="Key policies" field={p.keyPolicies} />
            <AttestedRow label="Safeguarding status" field={p.safeguardingStatus} />
            <AttestedRow label="Data protection status" field={p.dataProtectionStatus} />
            <AttestedRow label="Insurance status" field={p.insuranceStatus} />
            <AttestedRow label="Financial year end" field={p.financialYearEnd} />
            <AttestedRow label="Auditors" field={p.auditors} />
          </ProfileGroup>

          <ProfileGroup title="Funding profile">
            <AttestedRow label="Typical funding requirement" field={p.typicalFundingRequirement} />
            <AttestedRow label="Preferred funding types" field={p.preferredFundingTypes} />
            <AttestedRow label="Restricted needs" field={p.restrictedNeeds} />
            <AttestedRow label="Unrestricted needs" field={p.unrestrictedNeeds} />
            <AttestedRow label="Past funders" field={p.pastFunders} />
            <AttestedRow label="Match funding available" field={p.matchFundingAvailable} />
          </ProfileGroup>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardBody>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-ink-subtle" />
                <span className="eyebrow">Completeness</span>
              </div>
              <div className="mt-3 font-serif text-display font-medium text-ink">{score}%</div>
              <ProgressMeter className="mt-2" value={score} tone={score >= 80 ? "success" : "accent"} />
              <p className="mt-3 text-sm text-ink-muted">
                A more complete profile means stronger fit assessments and better AI drafts.
                This score is a guide, not a judgement.
              </p>
            </CardBody>
          </Card>

          {missing.length > 0 && (
            <Card>
              <div className="border-b border-line px-4 py-3">
                <h3 className="text-sm font-semibold text-ink">Suggested next steps</h3>
              </div>
              <ul className="divide-y divide-line">
                {missing.map((m) => (
                  <li key={m} className="px-4 py-2.5 text-sm text-ink-muted">
                    Review or add: {m}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="bg-surface-sunken">
            <CardBody>
              <div className="eyebrow mb-1.5">Trust states</div>
              <ul className="flex flex-col gap-2 text-xs text-ink-muted">
                <li>Verified: confirmed against an authoritative source.</li>
                <li>Provided by organisation: entered by your team.</li>
                <li>AI extracted: pulled from a document, pending review.</li>
                <li>Needs review: may be out of date.</li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ProfileGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-title font-semibold text-ink">{title}</h2>
      </div>
      <div className="divide-y divide-line">{children}</div>
    </Card>
  );
}

function Row({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: VerificationState;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="eyebrow mb-1">{label}</div>
        <div className="text-sm text-ink">{value}</div>
      </div>
      <VerificationBadge state={state} />
    </div>
  );
}

function AttestedRow({
  label,
  field,
}: {
  label: string;
  field: Attested<string | string[]>;
}) {
  const value = Array.isArray(field.value) ? field.value.join(", ") : field.value;
  return <Row label={label} value={value || "-"} state={field.verification} />;
}
