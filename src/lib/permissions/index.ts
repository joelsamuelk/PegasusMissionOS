import type { MemberRole } from "@/types/domain";

/**
 * Permission model. Roles map to a set of capabilities. The first interface
 * does not expose every capability, but the model is complete so that server
 * actions and RLS can enforce it consistently.
 */

export type Capability =
  | "org:manage_settings"
  | "org:manage_billing"
  | "org:transfer_ownership"
  | "team:invite"
  | "team:manage_roles"
  | "profile:edit"
  | "funding:manage"
  | "applications:manage"
  | "applications:review"
  | "applications:approve"
  | "grants:manage"
  | "finance:manage"
  | "programmes:manage"
  | "outcomes:manage"
  | "evidence:manage"
  | "reports:manage"
  | "reports:approve"
  // Relationship layer. Unlike the capabilities above — which the architecture
  // audit correctly called decorative — these are enforced in the server
  // actions that ship with them.
  | "relationships:view"
  | "relationships:manage"
  | "communications:view"
  | "communications:send"
  | "commitments:manage"
  | "meetings:manage"
  // Donor records are the most sensitive personal data in the product, so they
  // carry their own capability rather than riding on `relationships:*`.
  | "donors:view"
  | "donors:manage"
  /**
   * Reading special category answers.
   *
   * MG-7. Article 9 data — health, ethnicity, religion, sexual life,
   * biometrics — carries its own capability rather than riding on `read`, for
   * the same reason donor records carry theirs: the most sensitive category
   * the product can hold should not be visible to everybody who can open a
   * programme page. Held by owner and administrator only.
   */
  | "beneficiary_data:view"
  /** Designing forms, which decides what the organisation asks people. */
  | "forms:manage"
  /** Reviewing what a submission would change in the graph. */
  | "forms:review"
  | "partnerships:manage"
  | "ai:use"
  | "read";

const ALL: Capability[] = [
  "org:manage_settings",
  "org:manage_billing",
  "org:transfer_ownership",
  "team:invite",
  "team:manage_roles",
  "profile:edit",
  "funding:manage",
  "applications:manage",
  "applications:review",
  "applications:approve",
  "grants:manage",
  "finance:manage",
  "programmes:manage",
  "outcomes:manage",
  "evidence:manage",
  "reports:manage",
  "reports:approve",
  "relationships:view",
  "relationships:manage",
  "communications:view",
  "communications:send",
  "commitments:manage",
  "meetings:manage",
  "donors:view",
  "donors:manage",
  "beneficiary_data:view",
  "forms:manage",
  "forms:review",
  "partnerships:manage",
  "ai:use",
  "read",
];

const ROLE_CAPABILITIES: Record<MemberRole, Capability[]> = {
  owner: ALL,
  administrator: ALL.filter(
    (c) => c !== "org:transfer_ownership" && c !== "org:manage_billing",
  ),
  funding_lead: [
    "read",
    "ai:use",
    "profile:edit",
    "funding:manage",
    "applications:manage",
    "applications:review",
    "grants:manage",
    "evidence:manage",
    "reports:manage",
    "relationships:view",
    "relationships:manage",
    "communications:view",
    "communications:send",
    "commitments:manage",
    "meetings:manage",
    "donors:view",
    "donors:manage",
    "partnerships:manage",
    "forms:manage",
    "forms:review",
  ],
  programme_lead: [
    "read",
    "ai:use",
    "programmes:manage",
    "outcomes:manage",
    "evidence:manage",
    "reports:manage",
    "relationships:view",
    "relationships:manage",
    "communications:view",
    "communications:send",
    "commitments:manage",
    "meetings:manage",
    "partnerships:manage",
    "forms:manage",
    "forms:review",
  ],
  finance_contributor: [
    "read",
    "finance:manage",
    "grants:manage",
    "reports:manage",
    "relationships:view",
    "commitments:manage",
  ],
  // Read and approve only, in the relationship layer as everywhere else.
  trustee_reviewer: [
    "read",
    "applications:review",
    "applications:approve",
    "reports:approve",
    "relationships:view",
    "communications:view",
  ],
  // Contributors can see relationships and record what happened, but cannot
  // restructure them or send anything externally.
  contributor: [
    "read",
    "ai:use",
    "evidence:manage",
    "relationships:view",
    "communications:view",
  ],
};

export function capabilitiesFor(role: MemberRole): Capability[] {
  return ROLE_CAPABILITIES[role];
}

export function can(role: MemberRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Organisation Owner",
  administrator: "Administrator",
  funding_lead: "Funding Lead",
  programme_lead: "Programme Lead",
  finance_contributor: "Finance Contributor",
  trustee_reviewer: "Trustee or Reviewer",
  contributor: "Contributor",
};
