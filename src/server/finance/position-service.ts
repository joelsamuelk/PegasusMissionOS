import { computeFinancePosition, type FinancePosition } from "@/lib/finance";
import type { RequestContext } from "@/server/context/request-context";
import type { MissionRepository } from "@/server/data";

/**
 * Assembling the finance position.
 *
 * Nothing but reads and one call into `lib/finance`, which in turn calls into
 * `lib/finance-intelligence`. Three layers with one direction of dependency:
 * the engine knows nothing about storage, the runtime knows nothing about
 * requests, and this knows nothing about arithmetic.
 */
export async function loadFinancePosition(
  ctx: RequestContext,
  repo: MissionRepository,
): Promise<FinancePosition> {
  const [funds, transactions, allocations, budgets, grants, funders, programmes] =
    await Promise.all([
      repo.finance.funds(ctx),
      repo.finance.transactions(ctx),
      repo.finance.allocations(ctx),
      repo.finance.budgets(ctx),
      repo.grants.list(ctx),
      repo.funding.listFunders(ctx),
      repo.programmes.list(ctx),
    ]);

  const budgetLines = (
    await Promise.all(budgets.map((budget) => repo.finance.budgetLines(ctx, budget.id)))
  ).flat();

  const programmeGrants = (
    await Promise.all(
      programmes.map(async (programme) =>
        (await repo.programmes.grantsFor(ctx, programme.id)).map((grant) => ({
          programmeId: programme.id,
          grantId: grant.id,
        })),
      ),
    )
  ).flat();

  return computeFinancePosition({
    organisationId: ctx.organisationId,
    // Currency comes from the funds actually held. Hardcoding GBP in a
    // formatter is the exact way the parked internationalisation decision gets
    // quietly reversed, and the finance model made currency data on purpose.
    currency: funds[0]?.currency ?? transactions[0]?.amount.currency ?? "GBP",
    funds,
    transactions,
    allocations,
    budgets,
    budgetLines,
    grants,
    funders,
    programmes,
    programmeGrants,
    now: ctx.now(),
  });
}
