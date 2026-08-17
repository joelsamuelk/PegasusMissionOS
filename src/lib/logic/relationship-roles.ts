import type { KnownRelationshipRole, RelationshipRole } from "@/types/domain";

/**
 * The relationship role taxonomy.
 *
 * Roles are data, not schema. The known set below ships with labels and a
 * family for grouping; anything else a tenant needs is a plain string that
 * flows through the same code paths. Nothing here is a boolean column, and
 * nothing here gates behaviour by organisation *type* — a university that
 * funds, delivers and evaluates carries three roles on one relationship.
 */

export type RoleFamily =
  | "funding"
  | "fundraising"
  | "delivery"
  | "knowledge"
  | "governance"
  | "supply"
  | "community";

export interface RoleDescriptor {
  key: KnownRelationshipRole;
  label: string;
  family: RoleFamily;
}

export const RELATIONSHIP_ROLES: RoleDescriptor[] = [
  { key: "funder", label: "Funder", family: "funding" },
  { key: "prospective_funder", label: "Prospective funder", family: "funding" },
  { key: "donor", label: "Donor", family: "fundraising" },
  { key: "major_donor", label: "Major donor", family: "fundraising" },
  { key: "supporter", label: "Supporter", family: "fundraising" },
  { key: "corporate_partner", label: "Corporate partner", family: "delivery" },
  { key: "programme_partner", label: "Programme partner", family: "delivery" },
  { key: "delivery_partner", label: "Delivery partner", family: "delivery" },
  { key: "referral_partner", label: "Referral partner", family: "delivery" },
  { key: "research_partner", label: "Research partner", family: "knowledge" },
  { key: "evaluator", label: "Evaluator", family: "knowledge" },
  { key: "government_stakeholder", label: "Government stakeholder", family: "governance" },
  { key: "trustee_contact", label: "Trustee contact", family: "governance" },
  { key: "supplier", label: "Supplier", family: "supply" },
  { key: "volunteer", label: "Volunteer", family: "community" },
  { key: "community_representative", label: "Community representative", family: "community" },
  {
    key: "beneficiary_representative",
    label: "Beneficiary representative",
    family: "community",
  },
];

const BY_KEY = new Map(RELATIONSHIP_ROLES.map((r) => [r.key as string, r]));

/** Display label for any role, known or tenant-defined. */
export function roleLabel(role: RelationshipRole): string {
  const known = BY_KEY.get(role);
  if (known) return known.label;
  // Tenant-defined role: present it readably rather than raw.
  return role.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function roleFamily(role: RelationshipRole): RoleFamily | "custom" {
  return BY_KEY.get(role)?.family ?? "custom";
}

/** Roles that imply the relationship involves money coming in. */
const FUNDING_ROLES = new Set<string>([
  "funder",
  "prospective_funder",
  "donor",
  "major_donor",
  "corporate_partner",
]);

export function isFundingRole(role: RelationshipRole): boolean {
  return FUNDING_ROLES.has(role);
}

/** Roles that imply the relationship involves delivering the mission together. */
const DELIVERY_ROLES = new Set<string>([
  "programme_partner",
  "delivery_partner",
  "referral_partner",
  "research_partner",
  "evaluator",
  "corporate_partner",
]);

export function isDeliveryRole(role: RelationshipRole): boolean {
  return DELIVERY_ROLES.has(role);
}

/** Sort roles so the most consequential appear first in compact UI. */
const FAMILY_ORDER: Record<RoleFamily | "custom", number> = {
  funding: 0,
  fundraising: 1,
  delivery: 2,
  knowledge: 3,
  governance: 4,
  supply: 5,
  community: 6,
  custom: 7,
};

export function sortRoles(roles: RelationshipRole[]): RelationshipRole[] {
  return [...roles].sort(
    (a, b) => FAMILY_ORDER[roleFamily(a)] - FAMILY_ORDER[roleFamily(b)],
  );
}
