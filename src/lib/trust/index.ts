/**
 * The trust layer.
 *
 * MG-12's honest half: the things an organisation deciding whether to put real
 * operational and financial information into a product needs to be able to
 * check, rather than to be reassured about.
 *
 * The acceptance test for the phase is *credible for an organisation to trust
 * with real information, not merely impressive in a demonstration*, and the
 * difference between those two is almost entirely in what a product is willing
 * to say it has not done.
 */

export {
  AI_GUARANTEES,
  AI_REGISTER,
  consequentialUses,
  registerFor,
  type AiRisk,
  type AiUse,
} from "./ai-register";

export {
  RETENTION_RULES,
  gaps,
  planDeletion,
  type DeletionPlan,
  type RetentionBasis,
  type RetentionRule,
} from "./retention";

export {
  TRUST_STATEMENTS,
  unmetStatements,
  type TrustArea,
  type TrustStatement,
  type TrustStatus,
} from "./statements";
