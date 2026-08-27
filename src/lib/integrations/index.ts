/**
 * The integration hub.
 *
 * Mission OS becoming the intelligence layer around an organisation's existing
 * systems before becoming the system of record for everything. Three rules,
 * all enforced by types rather than by discipline:
 *
 * 1. **No provider identifier enters a core entity.** The mapping lives in
 *    `ExternalIdentity`, keyed by `(connectionId, externalId)`, which is also
 *    the idempotency key.
 * 2. **Nothing silently overwrites a human.** A value somebody verified is
 *    never replaced by a sync, whatever the conflict behaviour says.
 * 3. **A capability claim needs a source.** Every provider descriptor records
 *    where its capabilities came from, and an unverified provider can do
 *    nothing at all.
 */

export {
  BEACON,
  INTEGRATIONS,
  defaultSemantics,
  findIntegration,
  integrationsByCategory,
  permitted,
} from "./registry";

export {
  contentHashOf,
  decideChange,
  decideDeletion,
  describeSemantics,
  hasChanged,
  isHumanApproved,
  isStale,
  needsAttention,
  type ChangeDecision,
  type ChangeInput,
  type DeletionDecision,
} from "./sync";
