import { can, type Capability } from "@/lib/permissions";
import { resolveRequestContext, type RequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";

/**
 * Server-side authorisation for mutating actions.
 *
 * The capability model has existed and been unit-tested since the first slice,
 * but until now only the relationship actions consulted it — the architecture
 * audit (§4.5) called the rest decorative, and it was right. This is the shared
 * gate that closes that.
 *
 * Two design rules, both learned from the relationship slice:
 *
 * 1. **A refusal is returned, not swallowed.** An action that silently does
 *    nothing is indistinguishable from one that worked, which is the worst
 *    possible outcome for a user who thinks they just approved a report.
 * 2. **Authorisation is not tenant scoping.** This decides whether the role may
 *    perform the action at all; the repository independently decides which
 *    records the request can reach. Both must hold.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

function refusalMessage(capability: Capability): string {
  return `Your role does not have permission to ${capability.replace(/[:_]/g, " ")}.`;
}

export type Authorisation =
  | { ok: true; ctx: RequestContext }
  | { ok: false; result: ActionResult };

/**
 * Resolve the request context and check one capability.
 *
 * Returns a discriminated union rather than throwing, so a caller cannot
 * accidentally proceed on a failed check: there is no context to use unless
 * `ok` is true.
 */
export async function authorise(capability: Capability): Promise<Authorisation> {
  const ctx = await resolveRequestContext();
  if (!can(ctx.role, capability)) {
    return { ok: false, result: { ok: false, message: refusalMessage(capability) } };
  }
  return { ok: true, ctx };
}

/**
 * Pick the capability an action needs based on what it is about to do.
 *
 * Approving is a different capability from editing, and the distinction is
 * load-bearing rather than decorative: `trustee_reviewer` holds
 * `applications:approve` and `reports:approve` but neither `:manage`. A trustee
 * is meant to be able to approve a report without being able to rewrite it, and
 * collapsing the two would silently hand them edit rights.
 */
export function capabilityForTransition(
  isApproval: boolean,
  manage: Capability,
  approve: Capability,
): Capability {
  return isApproval ? approve : manage;
}

export const ok: ActionResult = { ok: true };

/**
 * Gate for the AI entry points: capability **and** the organisation's setting.
 *
 * The Settings page has always offered an "AI assistance" switch, and until now
 * nothing read it — the value was stored, displayed and written, and generation
 * ran regardless. A control that appears to disable something and does not is
 * worse than no control, because a workspace that deliberately turned AI off
 * believed it had.
 *
 * Checked here rather than inside the provider so that no generation is
 * attempted, no context is assembled from organisation data, and nothing
 * reaches a model when the answer is no.
 */
export async function authoriseAi(): Promise<Authorisation> {
  const auth = await authorise("ai:use");
  if (!auth.ok) return auth;

  const organisation = await getRepository().organisations.get(auth.ctx);
  if (!organisation?.aiEnabled) {
    return {
      ok: false,
      result: {
        ok: false,
        message: "AI assistance is turned off for this workspace. Enable it in Settings.",
      },
    };
  }
  return auth;
}
