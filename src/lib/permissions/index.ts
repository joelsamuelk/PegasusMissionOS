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
  ],
  programme_lead: [
    "read",
    "ai:use",
    "programmes:manage",
    "outcomes:manage",
    "evidence:manage",
    "reports:manage",
  ],
  finance_contributor: [
    "read",
    "finance:manage",
    "grants:manage",
    "reports:manage",
  ],
  trustee_reviewer: ["read", "applications:review", "applications:approve", "reports:approve"],
  contributor: ["read", "ai:use", "evidence:manage"],
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
