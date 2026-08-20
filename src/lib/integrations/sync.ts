import type {
  ConflictBehaviour,
  EntityReference,
  ExternalIdentity,
  IntegrationMapping,
  SyncSemantics,
  VerificationState,
} from "@/types/domain";

/**
 * What a sync is allowed to change.
 *
 * The brief's hardest line in this phase: *never silently overwrite
 * conflicting human-approved information.* Everything below exists to make
 * that a property of the engine rather than a setting somebody might have off.
 *
 * The rule, stated once: **a value a person verified is never overwritten by a
 * sync, whatever the conflict behaviour says.** `external_wins` is a real
 * policy an organisation may choose, and it governs disagreements between two
 * machine-supplied values. It does not govern a value a human stood behind,
 * because that is not what anybody means when they choose it.
 */

export type ChangeDecision =
  | { action: "create"; reason: string }
  | { action: "update"; reason: string }
  | { action: "skip"; reason: string }
  | { action: "conflict"; reason: string };

export interface ChangeInput {
  /** What Pegasus currently holds. Absent means the field is empty. */
  currentValue?: string;
  /** How much the current value is trusted. */
  currentVerification: VerificationState;
  /** What the provider says. */
  externalValue: string;
  semantics: SyncSemantics;
  /** Whether the field is mapped as writable, for outbound. */
  mapping?: IntegrationMapping;
}

/**
 * Verification states a sync may not overwrite.
 *
 * `verified` is somebody having checked. `provided` is the organisation having
 * entered it deliberately. Both are human acts; a sync that replaced either
 * with a CRM's value would be telling the organisation their own record was
 * wrong without asking.
 *
 * `ai_extracted`, `needs_review` and `outdated` are all machine or stale
 * states, and a fresher value from a connected system is a genuine
 * improvement on them.
 */
const HUMAN_APPROVED: VerificationState[] = ["verified", "provided"];

export function isHumanApproved(verification: VerificationState): boolean {
  return HUMAN_APPROVED.includes(verification);
}

export function decideChange(input: ChangeInput): ChangeDecision {
  const { currentValue, currentVerification, externalValue, semantics } = input;

  if (!externalValue.trim()) {
    return {
      action: "skip",
      reason:
        "The provider sent an empty value. Blanking a field because a remote system has nothing in it is a deletion disguised as an update.",
    };
  }

  if (currentValue === undefined || currentValue.trim() === "") {
    return { action: "create", reason: "Pegasus holds nothing for this field." };
  }

  if (currentValue === externalValue) {
    return { action: "skip", reason: "Both sides agree." };
  }

  /**
   * The line the brief draws.
   *
   * Checked **before** the conflict behaviour, so no configuration can get
   * past it. An organisation choosing `external_wins` is saying which machine
   * to believe, not authorising a CRM to correct their own verified records.
   */
  if (isHumanApproved(currentVerification)) {
    return {
      action: "conflict",
      reason: `Pegasus holds "${currentValue}", ${currentVerification === "verified" ? "verified by somebody here" : "entered here deliberately"}. The provider says "${externalValue}". A sync does not overrule a person.`,
    };
  }

  return applyConflictBehaviour(semantics.conflictBehaviour, currentValue, externalValue);
}

function applyConflictBehaviour(
  behaviour: ConflictBehaviour,
  currentValue: string,
  externalValue: string,
): ChangeDecision {
  switch (behaviour) {
    case "external_wins":
      return {
        action: "update",
        reason: `This connection is configured so the provider wins. "${currentValue}" becomes "${externalValue}".`,
      };
    case "pegasus_wins":
      return {
        action: "skip",
        reason: `This connection is configured so Pegasus wins. "${currentValue}" is kept.`,
      };
    case "newest_wins":
      // Deliberately not implemented as a timestamp comparison. Two systems'
      // clocks and two notions of "modified" are not comparable, and a
      // resolution that looks precise and is not is worse than a refusal.
      return {
        action: "conflict",
        reason:
          "This connection is set to let the newest value win, and Pegasus cannot compare timestamps across two systems reliably enough to act on it. The disagreement is recorded for a person.",
      };
    case "refuse":
    default:
      return {
        action: "conflict",
        reason: `Pegasus holds "${currentValue}" and the provider says "${externalValue}". This connection refuses to choose.`,
      };
  }
}

/**
 * Whether a record needs reading at all.
 *
 * A content hash on `ExternalIdentity` means an unchanged record costs one
 * comparison rather than a field-by-field diff, which matters against a
 * provider limited to 300 requests a minute.
 */
export function hasChanged(identity: ExternalIdentity | undefined, contentHash: string): boolean {
  return identity?.contentHash !== contentHash;
}

/**
 * A stable hash of a payload.
 *
 * Deliberately simple and deliberately not cryptographic: this answers "did
 * this record change?", not "is this record authentic". Key order is
 * normalised so a provider reordering its JSON does not look like an edit.
 */
export function contentHashOf(payload: Record<string, unknown>): string {
  const normalised = Object.keys(payload)
    .sort()
    .map((key) => `${key}=${JSON.stringify(payload[key])}`)
    .join("&");

  let hash = 2_166_136_261;
  for (let i = 0; i < normalised.length; i += 1) {
    hash ^= normalised.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface DeletionDecision {
  action: "ignore" | "archive" | "flag";
  reason: string;
}

/**
 * What a deletion on the other side means here.
 *
 * Never a deletion here by default. A CRM record removed by somebody tidying
 * up should not silently remove a person from a grant report, and the
 * organisation should find out from a flag rather than from a report that no
 * longer adds up.
 */
export function decideDeletion(semantics: SyncSemantics, entity: EntityReference): DeletionDecision {
  switch (semantics.deletionBehaviour) {
    case "archive":
      return {
        action: "archive",
        reason: `The provider reports this record as deleted, and this connection archives on deletion. The ${entity.type.replace(/_/g, " ")} is archived here and its history is kept.`,
      };
    case "flag":
      return {
        action: "flag",
        reason: `The provider reports this record as deleted. It is flagged rather than removed, because a record deleted in a CRM may still be cited in a published report.`,
      };
    case "ignore":
    default:
      return {
        action: "ignore",
        reason: "This connection does not act on deletions in the provider.",
      };
  }
}

/**
 * Whether data is stale enough to say so.
 *
 * A figure that has not been refreshed for a day is not wrong; it is old, and
 * a screen that presents it identically to a fresh one is the problem. This is
 * what a surface asks before rendering a synced number.
 */
export function isStale(lastSyncedAt: string | undefined, semantics: SyncSemantics, now: Date): boolean {
  if (!lastSyncedAt) return true;
  const last = Date.parse(lastSyncedAt);
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last > semantics.freshnessMinutes * 60_000;
}

/**
 * Whether repeated failures mean the connection needs a person.
 *
 * A connection that has failed three times running is not having a bad day;
 * something has changed, and continuing to retry it silently means the
 * organisation believes they are synced when they have not been for a week.
 */
export function needsAttention(
  consecutiveFailures: number,
  semantics: SyncSemantics,
): boolean {
  return consecutiveFailures >= semantics.failureThreshold;
}

/**
 * A one-line description of what a connection will and will not do.
 *
 * Rendered wherever a connection is shown. An organisation connecting their
 * CRM should be able to read what is about to happen in one sentence, because
 * the alternative is six settings nobody reads and a surprise.
 */
export function describeSemantics(semantics: SyncSemantics): string {
  const direction =
    semantics.direction === "inbound"
      ? "Pegasus reads from this system and writes nothing back"
      : semantics.direction === "outbound"
        ? "Pegasus writes to this system and reads nothing"
        : "records move in both directions";

  const conflict =
    semantics.conflictBehaviour === "refuse"
      ? "Where the two disagree, nothing changes and somebody is asked"
      : semantics.conflictBehaviour === "external_wins"
        ? "Where the two disagree, the other system wins, except on values a person here verified"
        : semantics.conflictBehaviour === "pegasus_wins"
          ? "Where the two disagree, Pegasus keeps its own value"
          : "Where the two disagree, nothing changes and somebody is asked, because timestamps across two systems cannot be compared reliably";

  const deletion =
    semantics.deletionBehaviour === "ignore"
      ? "Deletions there are ignored here"
      : semantics.deletionBehaviour === "archive"
        ? "A record deleted there is archived here"
        : "A record deleted there is flagged here, not removed";

  return `${direction}. ${conflict}. ${deletion}. Data older than ${semantics.freshnessMinutes} minutes is shown as out of date.`;
}
