import { addMoney, floorAtZero, ratio, subtractMoney, sumMoney, zero } from "./money";
import { quality } from "./quality";
import type {
  AllocationMethod,
  CostLevel,
  CostNode,
  CostRollup,
  CostRollupNode,
  CurrencyCode,
  DataQuality,
  FinancialAllocation,
  Money,
  Period,
} from "./types";
import { periodContains } from "./period";

/**
 * The cost hierarchy (§3).
 *
 *   Organisation → Strategic Priority → Programme → Workstream → Activity
 *                → Output → Outcome
 *
 * Costs roll *up*: a node's total is its own allocations plus everything
 * beneath it. An allocation lands on the most specific node it names, so
 * attributing a cost to an activity still counts toward the programme without
 * being double-counted.
 */

/** Most specific first. An allocation attaches to the first target it names. */
const TARGET_PRECEDENCE: Array<{ field: keyof FinancialAllocation; level: CostLevel }> = [
  { field: "outcomeId", level: "outcome" },
  { field: "activityId", level: "activity" },
  { field: "workstreamId", level: "workstream" },
  { field: "programmeId", level: "programme" },
  { field: "strategicPriorityId", level: "strategic_priority" },
];

const APPORTIONED_METHODS: AllocationMethod[] = ["shared_cost", "proportional"];

export interface CostRollupInput {
  period: Period;
  currency: CurrencyCode;
  nodes: CostNode[];
  allocations: FinancialAllocation[];
  /**
   * All expenditure in the period, allocated or not. Supplying it is what
   * makes `coverage` meaningful — without it, an organisation that has
   * allocated 30% of its costs looks fully allocated.
   */
  totalExpenditure?: Money;
  /** Restrict to allocations whose `effectiveDate` falls inside the period. */
  filterByPeriod?: boolean;
}

/** The node an allocation attaches to, or null if it names nothing in the tree. */
export function resolveNodeId(
  allocation: FinancialAllocation,
  nodeIds: ReadonlySet<string>,
): string | null {
  for (const { field } of TARGET_PRECEDENCE) {
    const value = allocation[field];
    if (typeof value === "string" && nodeIds.has(value)) return value;
  }
  return null;
}

export function rollUpCosts(input: CostRollupInput): CostRollup {
  const { currency, period } = input;
  const nodeIds = new Set(input.nodes.map((n) => n.id));

  const inPeriod =
    input.filterByPeriod === false
      ? input.allocations
      : input.allocations.filter((a) => periodContains(period, a.effectiveDate));

  const direct = new Map<string, Money>();
  const apportioned = new Map<string, Money>();
  const methodWeight = new Map<string, Map<AllocationMethod, number>>();
  const confidenceWeight = new Map<string, { weighted: number; total: number }>();
  const counts = new Map<string, number>();
  let offHierarchy = zero(currency);

  for (const allocation of inPeriod) {
    if (allocation.amount.currency !== currency) continue;
    const nodeId = resolveNodeId(allocation, nodeIds);
    if (!nodeId) {
      offHierarchy = addMoney(offHierarchy, allocation.amount);
      continue;
    }

    direct.set(nodeId, addMoney(direct.get(nodeId) ?? zero(currency), allocation.amount));
    if (APPORTIONED_METHODS.includes(allocation.allocationMethod)) {
      apportioned.set(nodeId, addMoney(apportioned.get(nodeId) ?? zero(currency), allocation.amount));
    }

    const magnitude = Math.abs(allocation.amount.minorUnits);
    const methods = methodWeight.get(nodeId) ?? new Map<AllocationMethod, number>();
    methods.set(allocation.allocationMethod, (methods.get(allocation.allocationMethod) ?? 0) + magnitude);
    methodWeight.set(nodeId, methods);

    const conf = confidenceWeight.get(nodeId) ?? { weighted: 0, total: 0 };
    conf.weighted += (allocation.confidence ?? 0) * magnitude;
    conf.total += magnitude;
    confidenceWeight.set(nodeId, conf);

    counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
  }

  const childIds = new Map<string, string[]>();
  for (const node of input.nodes) {
    if (!node.parentId) continue;
    childIds.set(node.parentId, [...(childIds.get(node.parentId) ?? []), node.id]);
  }

  const byId: Record<string, CostRollupNode> = {};
  for (const node of input.nodes) {
    const conf = confidenceWeight.get(node.id);
    const methods = [...(methodWeight.get(node.id) ?? new Map<AllocationMethod, number>()).entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([method]) => method);
    byId[node.id] = {
      node,
      directCost: direct.get(node.id) ?? zero(currency),
      apportionedCost: apportioned.get(node.id) ?? zero(currency),
      totalCost: zero(currency),
      methods,
      allocationConfidence: conf && conf.total > 0 ? Math.round((conf.weighted / conf.total) * 100) / 100 : 0,
      allocationCount: counts.get(node.id) ?? 0,
      childIds: childIds.get(node.id) ?? [],
    };
  }

  // Roll up bottom-first. A visited set keeps a malformed tree from looping.
  const resolving = new Set<string>();
  const resolved = new Set<string>();
  const total = (id: string): Money => {
    const entry = byId[id];
    if (!entry) return zero(currency);
    if (resolved.has(id)) return entry.totalCost;
    if (resolving.has(id)) return entry.directCost; // cycle: stop descending
    resolving.add(id);
    let sum = entry.directCost;
    for (const childId of entry.childIds) sum = addMoney(sum, total(childId));
    entry.totalCost = sum;
    resolving.delete(id);
    resolved.add(id);
    return sum;
  };
  for (const node of input.nodes) total(node.id);

  const allocatedToHierarchy = sumMoney(
    input.nodes.map((n) => byId[n.id]?.directCost ?? zero(currency)),
    currency,
  );
  const totalAllocated = addMoney(allocatedToHierarchy, offHierarchy);
  const totalExpenditure = input.totalExpenditure ?? totalAllocated;
  const unallocated = floorAtZero(subtractMoney(totalExpenditure, totalAllocated));

  return {
    period,
    currency,
    nodes: orderDepthFirst(input.nodes, byId),
    byId,
    unallocated,
    offHierarchy,
    totalExpenditure,
    coverage: allocationCoverage(totalAllocated, totalExpenditure, inPeriod),
  };
}

/**
 * How much of the period's expenditure actually reached an allocation, and how
 * confidently. Both matter: 100% coverage by equal allocation is not the same
 * as 100% coverage by invoice.
 */
export function allocationCoverage(
  allocated: Money,
  totalExpenditure: Money,
  allocations: FinancialAllocation[],
): DataQuality {
  const reasons: string[] = [];
  const proportion = ratio(allocated, totalExpenditure);
  if (proportion === null) {
    return quality(0, ["No expenditure recorded for this period."]);
  }

  const covered = Math.min(1, Math.max(0, proportion));
  reasons.push(`${Math.round(covered * 100)}% of period expenditure is allocated.`);

  const weightTotal = allocations.reduce((sum, a) => sum + Math.abs(a.amount.minorUnits), 0);
  const confidenceMean =
    weightTotal > 0
      ? allocations.reduce((sum, a) => sum + (a.confidence ?? 0) * Math.abs(a.amount.minorUnits), 0) /
        weightTotal
      : 0;
  reasons.push(`Mean allocation confidence ${Math.round(confidenceMean * 100)}%, weighted by value.`);

  const verified = allocations.filter((a) => a.verificationState === "verified" || a.verificationState === "provided");
  const verifiedWeight = verified.reduce((sum, a) => sum + Math.abs(a.amount.minorUnits), 0);
  const verifiedShare = weightTotal > 0 ? verifiedWeight / weightTotal : 0;
  if (verifiedShare < 1) {
    reasons.push(`${Math.round((1 - verifiedShare) * 100)}% of allocated value has not been reviewed by a person.`);
  }

  // Coverage dominates; method confidence discounts it. Review status is
  // reported but does not reduce the score — an unreviewed invoice is still an
  // invoice.
  return quality(covered * (0.6 + 0.4 * confidenceMean), reasons);
}

/** Costs for one node including everything beneath it. */
export function costOf(rollup: CostRollup, nodeId: string): Money {
  return rollup.byId[nodeId]?.totalCost ?? zero(rollup.currency);
}

/** Direct children of a node with their totals, largest first. */
export function breakdownOf(rollup: CostRollup, nodeId: string): CostRollupNode[] {
  const entry = rollup.byId[nodeId];
  if (!entry) return [];
  return entry.childIds
    .map((id) => rollup.byId[id])
    .filter((n): n is CostRollupNode => Boolean(n))
    .sort((a, b) => b.totalCost.minorUnits - a.totalCost.minorUnits);
}

function orderDepthFirst(
  nodes: CostNode[],
  byId: Record<string, CostRollupNode>,
): CostRollupNode[] {
  const ordered: CostRollupNode[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    const entry = byId[id];
    if (!entry) return;
    seen.add(id);
    ordered.push(entry);
    for (const childId of entry.childIds) visit(childId);
  };
  for (const node of nodes) {
    if (!node.parentId || !byId[node.parentId]) visit(node.id);
  }
  // Anything unreachable (orphaned parent reference) still appears.
  for (const node of nodes) visit(node.id);
  return ordered;
}
