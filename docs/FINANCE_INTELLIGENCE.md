# Finance Intelligence — Impact Economics & Funding Need Intelligence

**Status:** Design + calculation core implemented (`src/lib/finance-intelligence/`).
**Companions:** [`PEGASUS_TARGET_ARCHITECTURE.md`](./PEGASUS_TARGET_ARCHITECTURE.md), [`PEGASUS_IMPLEMENTATION_PLAN.md`](./PEGASUS_IMPLEMENTATION_PLAN.md), [`ORGANISATION_INTELLIGENCE.md`](./ORGANISATION_INTELLIGENCE.md)

> Record → Understand → Anticipate → Act.

---

## 1. What this closes

Finance, Funding, Programmes, Impact and Reports are not five modules that happen to share a database. They are one loop, and the loop only closes if money can be traced to delivery and delivery can be traced back into the next funding requirement:

```text
FINANCIAL DATA → POSITION → FORECAST → FUNDING NEED → FUNDING INTELLIGENCE
   → OPPORTUNITY → APPLICATION → GRANT → FINANCIAL ALLOCATION
   → PROGRAMME DELIVERY → OUTPUTS → OUTCOMES → IMPACT ECONOMICS
   → REPORTING → LEARNING → NEXT FORECAST
```

Two capabilities carry the halves of that loop that did not previously exist:

| Capability | Question it answers |
|---|---|
| **Impact Economics** | What did the money buy, and how do we know? |
| **Funding Need Intelligence** | What will we need funding for next, how much, and when? |

The join between them is the `FinancialAllocation` on the way up, and the `FundingNeed` on the way round.

### What already exists and is reused, not replaced

| Existing | Reuse |
|---|---|
| `VerificationState` | Every allocation and need carries one. `needs_review` already means exactly what a calculated figure needs to mean. |
| Deterministic `assessFit()` | Untouched. Need matching *layers on top of it* (§14 below) rather than replacing the 8-factor scorer. |
| `FitFactor` / `FactorStatus` / `FitCategory` | Need-match factors are ordinary `FitFactor`s, so the existing explanation UI renders them unchanged. |
| `FundingOpportunity`, `Grant`, `Programme`, `Outcome`, `Indicator` | Inputs. No parallel programme or grant model is introduced. |
| `AIProvenance`, audit ledger | Where AI explains a figure, it does so through the existing provenance contract — and it may not change the figure. |
| `RequestContext` + `MissionRepository` (Phase 1A) | The persistence route when these entities land in the data layer. |

### Deliberately avoided

- A second programme model. Cost nodes reference programme/workstream/activity/outcome ids; they do not own them.
- A finance-specific provenance system. `Statement` reuses the `EntityReference` shape the Phase 2 Mission Graph will adopt.
- AI anywhere in the calculation path. Every number in this slice is produced by a pure function.

---

## 2. Never calculate impact economics from raw transactions

A bank line does not know which programme it belongs to. The moment a cost-per-participant figure is computed by joining transactions to programmes on a category string, the figure becomes unfalsifiable — nobody can say afterwards *how* the money was attributed.

So there is an explicit layer:

```text
Financial Transaction → Financial Allocation → Grant / Programme / Activity
   → Output → Outcome → Impact
```

```ts
interface FinancialAllocation {
  id: string
  organisationId: string
  transactionId?: string
  budgetLineId?: string
  programmeId?: string
  grantId?: string
  activityId?: string
  amount: Money
  allocationMethod: "direct" | "proportional" | "shared_cost" | "manual" | "suggested" | "unknown"
  allocationBasis?: AllocationBasis
  confidence?: number
  verificationState: VerificationState
  createdBy?: string
  verifiedBy?: string
  verifiedAt?: string
}
```

Two additions to the brief's shape, both load-bearing:

- **`allocationBasis` is a union, not free text** (`direct | headcount | programme_expenditure | staff_time | participant_volume | equal | custom_percentage | unallocated`). The basis drives the confidence table and the comparability check in trend analysis; a free string cannot.
- **`effectiveDate`** — roll-ups are period-scoped, and the transaction is not always in scope when the allocation is read.

### Confidence is in the method, and never promotes

| Basis | Confidence | Why |
|---|---|---|
| Direct | 1.00 | Nothing is estimated |
| Staff time | 0.80 | Recorded, but self-reported |
| Programme expenditure | 0.75 | A real driver, one step removed |
| Headcount | 0.70 | Proxy for effort |
| Participant volume | 0.60 | Ignores intensity |
| Custom percentage | 0.55 | A human judgement, often historical |
| Equal allocation | 0.35 | A convention chosen *because* there is no driver |
| Unallocated | 0.00 | — |

Confidence 1.0 still produces `needs_review`. Only `verifyAllocation()` produces `verified`, and only with an actor and a timestamp — the same rule Organisation Intelligence applies to extraction. A human edit produces `provided` and flips the method to `manual`, so the roll-up stops crediting a basis that no longer explains the number.

### Suggestion is deterministic

`suggestAllocation()` uses rules, not a model: a transaction tied to a grant that funds exactly one programme is `direct`; a transaction whose text names exactly one programme is `suggested` at 0.5; anything ambiguous stays **unallocated with a stated reason**. Guessing here silently corrupts every unit cost above it.

---

## 3. Money is an integer

`Money` is `{ minorUnits: number; currency: CurrencyCode }`. Shared costs split three ways, roll up two levels and then divide by a participant count; in floating point that produces totals which do not reconcile to the accounts, and reconciliation is the only reason anyone trusts these figures.

`splitMoney` uses largest-remainder allocation, so £72,000 apportioned 42/35/23 is £30,240 / £25,200 / £16,560 and sums to exactly £72,000. Mixing currencies throws rather than coercing.

---

## 4. Cost hierarchy

```text
Organisation → Strategic Priority → Programme → Workstream → Activity → Output → Outcome
```

An allocation attaches to the **most specific** node it names, and totals roll upward, so attributing a cost to an activity still counts toward the programme without double-counting. Every node reports:

- `directCost` — allocated to this node alone
- `apportionedCost` — how much of that was estimated rather than attributed
- `totalCost` — including all descendants
- `allocationConfidence` — value-weighted mean across contributing allocations
- `methods` — which allocation methods built the number

Three quantities are reported that most systems quietly drop: **unallocated** expenditure (in the period, never attributed), **off-hierarchy** expenditure (allocated to a target outside this tree), and `coverage`. Without them, an organisation that has allocated 30% of its costs looks fully allocated.

---

## 5. Every calculation shows its work

A `UnitCost` cannot be constructed without a `Methodology`:

```text
numerator · denominator · period · allocation methods · included costs
excluded costs · financial data quality · delivery data quality
assumptions · boundaries
```

There is no code path that produces a bare number.

### Withheld, not caveated

Where the denominator is missing, zero, or built on thin data, `state` is `"withheld"` with a `reason` and a `requires` list. A figure on screen with a warning beside it is read as a figure. Cost-per-outcome requires at least **moderate** outcome-data quality; the other unit costs require **low**. Withholding is per metric: cost per participant still publishes while cost per outcome does not.

```text
YOUTH FUTURES 2026

Budget £450,000 · Actual £420,000 · Variance −£30,000

Participants 1,200 · Completions 984 · Employment outcomes 472

Cost / participant  £350      Financial allocation  High
Cost / completion   £427      Participant data      High
Cost / outcome      £890      Outcome completeness  Moderate
```

---

## 6. Outputs, outcomes and SROI are different things

The denominator carries a `kind` (`participant | output | completion | outcome`), and each metric ships `boundaries` — what it is *not*:

> Cost per recorded outcome counts outcomes recorded, not outcomes caused. **This is not a social return on investment.** It places no value on the outcome and models no deadweight, attribution, displacement or drop-off.

`socialReturnOnInvestment()` exists, and refuses. It returns `supported: false` plus what a real SROI would require (valuation approach and proxies, deadweight/attribution/displacement/drop-off, discount rate and benefit period, stakeholder involvement). Formal SROI frameworks may be supported later; relabelling a division as one is not a shortcut to that.

A regression test asserts no unit-cost label matches `/sroi|social return|return on investment|value of|roi/i`.

---

## 7. Shared costs

```text
Finance Team £72,000
Allocation method: Programme expenditure

Youth Futures      42%    £30,240
Community Health   35%    £25,200
Skills Lab         23%    £16,560
```

Weights are supplied as **drivers** (headcount in people, expenditure in pounds, staff time in hours), not as percentages, so the basis stays inspectable and the percentages are derived. The driver is deliberately **prior-period** programme expenditure: apportioning this period's shared costs on this period's expenditure is circular.

`unallocatedShare` lets a genuinely organisational portion be held back rather than forced onto delivery. Every resulting allocation carries the basis and a note that travels with any figure it touches.

---

## 8. Restricted programme subsidy

```text
Youth Futures 2026
Programme cost            £420,000
Restricted funding        £370,000
Unrestricted contribution  £50,000   → 11.9%
```

Over-funding is reported as `overFunded`, not as a negative subsidy.

**Structural** subsidy has a high bar, because "this happens every year" is a much stronger claim than "this happened". `detectStructuralSubsidy` requires ≥3 consecutive periods, each materially subsidised and each at ≥ moderate data quality. Otherwise `detected: false` with the reason. The quoted range is rounded to the nearest £5k so it reads as the estimate it is:

> Youth Futures has required approximately £40k–£55k of unrestricted organisational funding in each of the last 3 periods.

---

## 9. Comparison and trends

Comparison refuses more often than it reports. `compareUnitCost` will not compare different metrics, a withheld figure, different currencies, or periods differing in length by more than 25%. Where it does compare, it attaches caveats for changed allocation methods, changed cost inclusions, a changed denominator definition or a change in delivery-data quality — each of which can move the number without anything operational changing.

Observations are observations:

> Programme expenditure increased 21%, but participant reach increased 4%.

Each carries `possibleFactors` (cohort mix, delivery intensity, cost inflation, set-up costs, a change in counting), an `invitation` to investigate, and the constant caveat that this is an association and not a demonstrated cause. Nothing in this module concludes that a programme became inefficient — a test asserts observation text never contains that language.

---

## 10. Reporting

Impact Economics feeds report sections — programme investment, cost per participant, funding allocation, expenditure by outcome, unrestricted contribution, value-for-money narrative — and the investment chain:

```text
£420,000 invested → 1,200 participants → 984 completions → 472 recorded employment outcomes
```

AI may explain these figures. It may not produce or alter them: the numbers arrive already computed, with methodology attached, and generation receives them as data.

---

## 11. Funding need

```text
expected cost − confirmed funding − committed unrestricted contribution = potential funding gap
```

The arithmetic is trivial; the trust model is not. A `FundingNeed` carries `derivedFrom`, `assumptions`, a structured `confidence` (level, score, **basis**, **limitations**) and an `origin` of `manual | calculated | suggested`.

A calculated need is always `needs_review`, and its limitations always include *"This is a calculated funding requirement, not an approved one."* `approveFundingNeed()` is the only route to `verified`, and it requires an actor and a timestamp. There is no path from "Pegasus calculated this" to "the organisation has agreed this" that does not pass through a person.

Confidence is scored from the cost basis (prior-year actuals > budget > forecast > estimate), the number of high-materiality assumptions, the horizon, and whether any source records are linked. Priority is scored from the gap's share of the requirement *and* how soon it starts — a 74% gap in seven months is critical; a 5% gap in twenty-nine months is not.

---

## 12. Runway, cliffs and forecast

**Programme funding runway** exists because organisation-wide cash runway hides the failure that actually happens: nine months of cash, and a programme whose funding stops in four.

```text
Youth Futures
Annual operating cost £420,000 · Funded until 31 March 2027
Confirmed after £110,000 · Expected requirement £420,000
Potential gap £310,000 · Runway 7 months          → WARNING
```

Runway thresholds are set against fundraising lead times, not accounting convention — a competitive grant takes roughly three months to prepare and three to six to decide, so `warning` starts at nine months, not three.

**Grant expiry** reads end dates forward. Grants expiring within the horizon are grouped by programme *and quarter*: two grants ending five weeks apart are one cliff to a fundraiser; grants a year apart are two problems.

```text
FUNDING CLIFF — Youth Futures
£270,000 expires 31 March 2027 · Programme expected to continue: Yes
Replacement secured £60,000 · Potential gap £210,000
```

Where continuity has **not** been recorded, no gap is asserted — the output is a fact about the expiry and a statement that continuity is unknown.

**Forecast** buckets 12–36 months into calendar quarters, spreading multi-period amounts by overlapping days (exact to the penny) and *dropping* the portion beyond the horizon rather than compressing it into the last bucket.

The rule that shapes the whole module: **confirmed and scenario pounds are never added together.** `secured` means confirmed only; `gap` is measured against confirmed income; `gapAfterExpected` sits beside it as the optimistic read, never instead of it.

---

## 13. Funding need → Funding Intelligence

This is the join that makes the loop a loop. The question changes from *"what grants fit this organisation?"* to *"what could close this specific future gap?"*

`assessNeedMatch()` does **not** replace `assessFit()`. Organisation-level fit — eligibility, theme, geography, beneficiaries, evidence strength — stays exactly where it is. Need matching adds four factors the organisation-level scorer cannot express, because they are properties of the *gap*:

| Factor | Test |
|---|---|
| Funding type | Can this funding type meet a `core` / `programme` / `capital` need? |
| Amount | What share of the gap could the published award range cover? |
| Timing | Does a decision arrive before the money is needed, allowing a lead time? |
| Duration | Does the award period cover the need period, or leave a residual? |

```text
FUNDING NEED — Youth Futures · £310,000 required · April 2027 onward

Example Foundation · Potential award £100k–£250k
✓ Youth employment  ✓ UK delivery  ✓ Multi-year programme funding
✓ Organisation appears eligible  ✓ Deadline fits the funding timeline
Gap coverage: potentially up to 81%
Watch: requires partnership delivery
```

Coverage is always a **range**, always described as potential, and every match carries:

> An opportunity reduces a funding gap only once an award is secured.

The summary figure is named `bestCaseCoveragePercent` because that is what it is: what would happen if every strong match landed at its maximum, which will not happen.

---

## 14. Portfolio and concentration

A funding strategy is a scenario, and is modelled as one: the literal `status: "proposed_scenario"`, a `securedTotal` that counts only components backed by an actual award, and a disclaimer carried on the object. A tidy table of numbers adding up to the gap is the easiest thing in this system to mistake for money.

```text
Youth Futures funding gap £310,000 — PROPOSED SCENARIO
Core Foundation Grant      £150,000
Local Authority Contract    £80,000
Corporate Partnership       £50,000
Unrestricted Contribution   £30,000
                           --------
                           £310,000   Secured: £0
```

Scenarios warn when they under- or over-shoot the gap, when one unsecured component carries more than half of it, and when a component would deepen dependence:

> This opportunity could cover a large share of the gap, but would move Example Foundation from 31% to approximately 47% of expected income in scope.

Concentration is measured by largest-funder share and a Herfindahl index. It is **not** a veto: a committed long-term funder can be more stable than nine small grants. The output is the sentence a fundraiser needs before going to a board.

---

## 15. Core funding, strategy and Mission Control

Restricted and unrestricted positions are assessed separately and never netted, because the common NGO problem is not "we need another programme grant":

```text
FUNDING POSITION
Restricted programme funding: Strong
Unrestricted operating position: Needs attention · runway 3.4 months

Prioritise core/unrestricted funding opportunities over additional
restricted programme funding.
```

Strategic alignment (§22) answers which parts of the strategy are funded, and flags overcommitment only where planned investment exceeds confirmed funding *plus* uncommitted reserves — a funding gap alone is not overcommitment.

Mission Control's *Looking ahead* orders needs by **when the money is needed**, not by size: a £40k gap in four months outranks a £400k gap in two years.

---

## 16. FACT · CALCULATION · FORECAST · ASSUMPTION · RECOMMENDATION

The distinction is in the model, not in the UI copy:

```ts
interface Statement {
  id: string
  kind: "fact" | "calculation" | "forecast" | "assumption" | "recommendation"
  text: string
  derivedFrom: EntityReference[]   // records
  supportedBy?: string[]           // other statements
  workings?: string
  caveats?: string[]
}
```

Every recommendation is assembled from a chain and is the *last* link, never the first. `effectiveKind()` returns the weakest kind anywhere in a chain — a calculation resting on a forecast is not a calculation and must not be labelled as one.

`traceStatement()` walks the chain, cycle-safely, which is what makes §25 answerable:

```text
"Youth Futures has a £310k funding gap"
  → calculation: confirmed income covers 62% of the requirement
    → fact: £270,000 expires 31 March 2027        → grant records
    → fact: £110,000 confirmed after that date    → grant records
    → assumption: the programme continues at current scale
```

---

## 17. Implementation order

§27's ordering is a correctness constraint, not a preference: sophisticated impact economics on untrustworthy allocations produces confident wrong numbers, which is worse than no numbers.

| Stage | Scope | State |
|---|---|---|
| **Foundation** | Transactions, classification, accounts, grants, programmes, budgets | ⏳ Model defined; ingestion and persistence not built |
| **Financial Intelligence** | Cash, income, expenditure, runway, restrictions, commitments, forecasting | 🟡 Runway and forecasting implemented; cash/income/expenditure need the foundation |
| **Allocation** | Transactions → grants → programmes → activities | ✅ **Implemented** |
| **Funding Need Intelligence** | Programme runway, grant expiry, future gaps, Funding Intelligence integration | ✅ **Implemented** |
| **Impact Economics** | Programme costs, output/outcome economics, shared costs, trends | ✅ **Implemented** |
| **Strategic Intelligence** | Funding by priority, investment by outcome, underfunded strategy, portfolio planning | ✅ **Implemented** |

The calculation core is deliberately built *before* the foundation it will consume, in the same shape as the Organisation Intelligence slice: pure functions against injected data, so the rules — especially the refusals — are settled and tested before real ledgers arrive.

### Modules

| Module | Responsibility |
|---|---|
| `types.ts` | Money, transactions, allocations, cost nodes, delivery measures, needs, certainty tiers |
| `money.ts` | Integer money, exact largest-remainder splitting, currency safety |
| `period.ts` | Quarters, financial years, overlap and whole-month arithmetic |
| `quality.ts` | Data-quality thresholds; `insufficient` as a refusal, not a grade |
| `statements.ts` | The five statement kinds, support chains, derivation tracing |
| `allocate.ts` | Direct and shared-cost allocation, deterministic suggestion, review transitions, validation |
| `cost-rollup.ts` | Hierarchy roll-up, apportioned/direct split, coverage |
| `unit-economics.ts` | Unit costs with mandatory methodology, withholding rules, SROI refusal, programme economics |
| `subsidy.ts` | Unrestricted subsidy and structural-pattern detection |
| `trends.ts` | Period comparison, comparability refusals, non-judgemental observations |
| `funding-need.ts` | Need derivation, approval, revision, strategic alignment |
| `runway.ts` | Programme funding runway, unrestricted runway |
| `cliffs.ts` | Grant expiry grouping and gap forecasting |
| `forecast.ts` | Quarterly forecast with four certainty tiers |
| `concentration.ts` | Funder concentration, projection, movement |
| `portfolio.ts` | Proposed funding scenarios |
| `need-matching.ts` | Need-aware opportunity matching over the existing fit assessment |
| `recommendations.ts` | Explainable recommendations, funding position, looking-ahead, executive summary |

### Deliberately not in this slice

Persistence and repository interfaces; transaction ingestion, bank feeds and accounting integrations; classification of raw transactions; the UI (Programme Economics view, forecast chart, Mission Control card); report section rendering; AI narrative explanation. Each depends on the foundation stage, and none of them changes a number.

---

## 18. Verification record

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | **228 passed**, of which **80 are Finance Intelligence** (36 impact economics, 44 funding need) |
| `npm run test:e2e` | 8/8 passed — no regression |
| `npm run build` | succeeds |
| Mutation test | Replacing largest-remainder splitting with naïve rounding, and disabling the delivery-quality withholding gate, fails **4** tests across both suites. Restoring returns 80/80. |

The fixture (`tests/fixtures/finance-fixture.ts`) encodes the brief's worked example, so the suite asserts against the specification rather than against whatever the code happens to produce: £420,000 of allocated cost from an eight-node hierarchy, 1,200 / 984 / 472 delivery, £350 / £427 / £890 unit costs, a 42/35/23 shared-cost split, 11.9% subsidy over a £40k–£55k three-year range, £510 → £427 at −16%, a 7-month runway, a £310k gap, 81% potential coverage and 31% → 47% concentration.

---

## 19. Three levels

| Level | Question | Example |
|---|---|---|
| 1 | What happened? | We spent £420,000 on Youth Futures. |
| 2 | What does it mean? | The programme supported 1,200 participants at an allocated cost of approximately £350 each — 7% of it apportioned shared cost. |
| 3 | What happens next? | £270,000 of programme funding expires next March, creating an estimated £310,000 requirement for the following year. Three opportunities may partially address it; the earliest deadline is 28 September 2026. |

Level 3 is only trustworthy because Level 1 kept its allocations, and Level 2 refused to publish the figures it could not defend.
