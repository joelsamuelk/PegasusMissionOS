/**
 * Mission Portals.
 *
 * One architecture, six audiences, and three rules that make external access
 * to tenant data survivable:
 *
 * 1. **A portal identity is not a `User`.** Separate model, separate id space,
 *    separate authentication path.
 * 2. **Access is granted, never inherited.** Seeing a grant does not mean
 *    seeing the evidence linked to it. Reaching a second record needs a second
 *    grant that somebody made.
 * 3. **A record is projected, never returned.** Field allowlists, so a field
 *    added to an entity next year is invisible to every portal until somebody
 *    adds it to a view.
 */

export {
  AUDIENCE_CAPABILITIES,
  capabilityPermitted,
  decideAccess,
  reachableRecords,
  type AccessDecision,
  type AccessInput,
  type AccessRefusal,
} from "./access";

export {
  PORTAL_VIEWS,
  findView,
  viewForEntity,
  viewsFor,
} from "./views";

export {
  looksInternal,
  projectRecord,
  projectThrough,
  type ProjectInput,
} from "./projection";
