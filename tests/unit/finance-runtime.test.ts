import { beforeEach, describe, expect, it } from "vitest";
import {
  MATERIAL_THRESHOLD_MINOR_UNITS,
  classifyTransaction,
  computeFinancePosition,
  describeClassification,
  detectColumn,
  detectDateAmbiguity,
  detectDuplicates,
  isMaterial,
  parseAmountMinorUnits,
  parseStatementCsv,
  parseStatementDate,
  classifyRows,
} from "@/lib/finance";
import { loadFinancePosition } from "@/server/finance/position-service";
import type { FinancialTransaction } from "@/types/domain";
import { createTwoTenantHarness, type TwoTenantHarness } from "../fixtures/two-tenant";

/**
 * MG-8 — the finance runtime.
 *
 * The phase's governing constraint is what it must *not* touch:
 * `lib/finance-intelligence` holds 4,809 lines of tested calculation and this
 * phase gives it inputs and a surface rather than revising it. Every figure
 * asserted below comes out of that engine.
 *
 * The two properties worth testing hardest:
 *
 * **Money never touches a float.** `parseFloat("1234.56") * 100` is
 * `123455.99999999999`, and a ledger built on that does not reconcile. The
 * parser goes from text to integer minor units directly.
 *
 * **Nothing is guessed silently.** An unreadable row is reported by number, an
 * unrecognised column by name, an ambiguous date format as ambiguous, and a
 * figure that cannot be calculated as a reason rather than a zero.
 */

const NOW = new Date("2026-07-21T10:00:00Z");

describe("statement parsing", () => {
  /**
   * The failure this prevents is invisible until a reconciliation is out by a
   * penny and nobody can find where.
   */
  it("parses money to integer minor units without a float", () => {
    expect(parseAmountMinorUnits("1234.56")).toBe(123_456);
    expect(parseAmountMinorUnits("£1,234.56")).toBe(123_456);
    expect(parseAmountMinorUnits("(250.00)")).toBe(-25_000);
    expect(parseAmountMinorUnits("250.00 DR")).toBe(-25_000);
    expect(parseAmountMinorUnits("250.00 CR")).toBe(25_000);
    expect(parseAmountMinorUnits("-1,000")).toBe(-100_000);
    expect(parseAmountMinorUnits("0.07")).toBe(7);
    expect(parseAmountMinorUnits("not money")).toBeNull();
    expect(parseAmountMinorUnits("")).toBeNull();
  });

  it("recognises the column names UK banks actually use", () => {
    expect(detectColumn("Transaction Date")).toBe("date");
    expect(detectColumn("Money Out")).toBe("debit");
    expect(detectColumn("Paid In")).toBe("credit");
    expect(detectColumn("Narrative")).toBe("description");
    expect(detectColumn("Running Balance")).toBe("balance");
    expect(detectColumn("Some Bank Specific Thing")).toBe("unknown");
  });

  it("reads dates day-first and reports when that could be wrong", () => {
    expect(parseStatementDate("2026-03-04")).toBe("2026-03-04");
    expect(parseStatementDate("04/03/2026")).toBe("2026-03-04");
    expect(parseStatementDate("4 March 2026")).toBe("2026-03-04");
    expect(parseStatementDate("not a date")).toBeNull();

    // Every day twelve or below: genuinely ambiguous, and only the person who
    // downloaded the file knows.
    expect(detectDateAmbiguity(["04/03/2026", "11/05/2026"])).toBe(true);
    expect(detectDateAmbiguity(["24/03/2026", "11/05/2026"])).toBe(false);
  });

  const CSV = [
    "Date,Description,Money In,Money Out,Balance",
    "28/07/2026,Core salaries July,,3100.00,4200.00",
    "12/07/2026,Individual donations,1800.00,,7300.00",
    "not a date,Broken row,,50.00,",
    "05/07/2026,Office rent,,780.00,5500.00",
    "05/07/2026,Zero line,,0.00,5500.00",
  ].join("\n");

  it("normalises rows and reports the ones it could not read, by number", () => {
    const parsed = parseStatementCsv(CSV);

    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]!.direction).toBe("expenditure");
    expect(parsed.rows[0]!.amount.minorUnits).toBe(310_000);
    expect(parsed.rows[1]!.direction).toBe("income");

    // An import that silently skipped rows would reconcile to the wrong total
    // and nobody would know which rows.
    expect(parsed.problems.map((p) => p.rowNumber)).toEqual([4, 6]);
    expect(parsed.problems[0]!.reason).toMatch(/not a date/);
    expect(parsed.problems[1]!.reason).toMatch(/zero/i);
  });

  it("refuses a file with no date or no amount column, saying what it saw", () => {
    const parsed = parseStatementCsv("Thing,Other\nfoo,bar");
    expect(parsed.rows).toEqual([]);
    expect(parsed.problems[0]!.reason).toMatch(/No date column was found/);
    expect(parsed.problems[0]!.reason).toMatch(/Thing, Other/);
  });

  it("refuses a row where both money in and money out are populated", () => {
    const parsed = parseStatementCsv(
      "Date,Description,Money In,Money Out\n05/07/2026,Confusing,10.00,20.00",
    );
    expect(parsed.rows).toEqual([]);
    expect(parsed.problems[0]!.reason).toMatch(/Both the money in and money out/);
  });

  it("names the columns it could not identify", () => {
    const parsed = parseStatementCsv(
      "Date,Description,Amount,Sort Code Thing\n05/07/2026,A payment,-10.00,x",
    );
    expect(parsed.unrecognisedColumns).toEqual(["Sort Code Thing"]);
  });
});

describe("duplicate detection flags rather than drops", () => {
  const existing: FinancialTransaction[] = [
    {
      id: "txn-existing",
      organisationId: "org-a",
      date: "2026-07-05",
      description: "Office rent",
      amount: { minorUnits: 78_000, currency: "GBP" },
      direction: "expenditure",
      restricted: false,
      source: "import",
      verificationState: "provided",
    },
  ];

  it("finds an exact match against an existing transaction", () => {
    const parsed = parseStatementCsv(
      "Date,Description,Amount\n05/07/2026,Office rent,-780.00",
    );
    const matches = detectDuplicates(parsed.rows, existing);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.confidence).toBe("exact");
    expect(matches[0]!.existingTransactionId).toBe("txn-existing");
  });

  /**
   * A charity paying the same rent on the same day of two consecutive months
   * produces identical rows that are both real. Dropping one would silently
   * lose it.
   */
  it("reports two identical rows in one file as likely, not certain", () => {
    const parsed = parseStatementCsv(
      "Date,Description,Amount\n06/07/2026,Petty cash,-20.00\n06/07/2026,Petty cash,-20.00",
    );
    const matches = detectDuplicates(parsed.rows, []);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.confidence).toBe("likely");
    expect(matches[0]!.reason).toMatch(/Both may be real/);
  });

  it("does not flag the same payment in different months", () => {
    const parsed = parseStatementCsv(
      "Date,Description,Amount\n05/07/2026,Office rent,-780.00\n05/08/2026,Office rent,-780.00",
    );
    expect(detectDuplicates(parsed.rows, [])).toEqual([]);
  });
});

describe("classification suggests and never asserts", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  const contextFor = async (harness: TwoTenantHarness) => ({
    funds: await harness.repo.finance.funds(harness.ctxA),
    grants: await harness.repo.grants.list(harness.ctxA),
    funderNames: (await harness.repo.funding.listFunders(harness.ctxA)).map((funder) => ({
      id: funder.id,
      name: funder.name,
    })),
    history: await harness.repo.finance.transactions(harness.ctxA),
  });

  it("matches a grant by name and carries the evidence", async () => {
    const candidate = classifyTransaction({
      description: "HENDERSON TR YOUTH FUTURES GRANT",
      amountMinorUnits: 4_750_000,
      direction: "income",
      context: await contextFor(h),
    });

    expect(candidate.grantId).toBe("grant-henderson");
    expect(candidate.evidence.some((item) => item.code === "grant_name")).toBe(true);
    // Material, so a person decides however certain the match is.
    expect(candidate.requiresApproval).toBe(true);
  });

  /**
   * A funder with several live grants cannot be resolved from a payment
   * description, and picking one would attach money to the wrong award.
   */
  it("refuses to pick between a funder's live grants, and says why", async () => {
    const context = await contextFor(h);
    const henderson = context.grants.filter((grant) => grant.funderId === "fnd-henderson");

    const candidate = classifyTransaction({
      description: "Payment from The Henderson Trust",
      amountMinorUnits: 100_000,
      direction: "income",
      // Two live grants from the same funder, both titled generically so the
      // title path finds nothing and the funder path is the one exercised.
      context: {
        ...context,
        grants: henderson.map((grant) => ({
          ...grant,
          title: "Programme grant",
          status: "active" as const,
        })),
      },
    });

    expect(candidate.grantId).toBeUndefined();
    expect(candidate.evidence.some((item) => item.code === "ambiguous_grant")).toBe(true);
  });

  /**
   * The defect this pins: a first version took the first grant whose title
   * matched and attached a 2026 payment to a 2022 pilot with a similar name.
   */
  it("does not attach new money to a closed grant with a similar name", async () => {
    const context = await contextFor(h);
    const closed = context.grants.filter((grant) => grant.status !== "active");
    expect(closed.length).toBeGreaterThan(0);

    const candidate = classifyTransaction({
      description: "HENDERSON TR YOUTH FUTURES",
      amountMinorUnits: 4_750_000,
      direction: "income",
      context,
    });

    expect(closed.map((grant) => grant.id)).not.toContain(candidate.grantId);
  });

  it("learns from the organisation's own past classification", async () => {
    const context = await contextFor(h);
    const candidate = classifyTransaction({
      description: "Mentoring coordinator, May 2026",
      amountMinorUnits: 40_000,
      direction: "expenditure",
      context,
    });

    expect(candidate.evidence.some((item) => item.code === "recurrence")).toBe(true);
    expect(candidate.confidence).toBe("certain");
  });

  /**
   * "Nothing matched" is a finding, and a reviewer needs to know they are the
   * first person to look at it.
   */
  it("says plainly when nothing matched", async () => {
    const candidate = classifyTransaction({
      description: "ZZQX 4471",
      amountMinorUnits: 1_200,
      direction: "expenditure",
      context: await contextFor(h),
    });

    expect(candidate.category).toBeUndefined();
    expect(candidate.evidence[0]!.code).toBe("no_match");
    expect(candidate.requiresApproval).toBe(true);
  });

  it("always needs a person above the materiality threshold", async () => {
    const context = await contextFor(h);
    expect(isMaterial(MATERIAL_THRESHOLD_MINOR_UNITS)).toBe(true);
    expect(isMaterial(MATERIAL_THRESHOLD_MINOR_UNITS - 1)).toBe(false);

    const small = classifyTransaction({
      description: "Mentoring coordinator, May 2026",
      amountMinorUnits: 1_000,
      direction: "expenditure",
      context,
    });
    const large = classifyTransaction({
      description: "Mentoring coordinator, May 2026",
      amountMinorUnits: MATERIAL_THRESHOLD_MINOR_UNITS,
      direction: "expenditure",
      context,
    });

    expect(small.requiresApproval).toBe(false);
    expect(large.requiresApproval).toBe(true);
  });

  it("summarises an import by what needs a person first", async () => {
    const parsed = parseStatementCsv(
      "Date,Description,Amount\n05/07/2026,ZZQX 4471,-12.00\n06/07/2026,Office rent,-780.00",
    );
    const rows = classifyRows(parsed.rows, await contextFor(h));
    const summary = describeClassification(rows);
    expect(summary).toMatch(/need a decision before they are posted/);
    expect(summary).toMatch(/matched nothing at all/);
  });
});

describe("the pipeline holds review between classify and post", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  const CSV = [
    "Date,Description,Amount",
    "05/07/2026,Office rent and utilities,-780.00",
    "12/07/2026,Individual donations,1800.00",
    "not a date,Broken,-1.00",
  ].join("\n");

  it("writes no transaction on import", async () => {
    const before = (await h.repo.finance.transactions(h.ctxA)).length;
    const record = await h.repo.finance.importStatement(h.ctxA, {
      fileName: "july.csv",
      csv: CSV,
    });

    expect(record.status).toBe("awaiting_review");
    expect(record.rowCount).toBe(2);
    expect(record.problems).toHaveLength(1);
    expect(record.postedCount).toBe(0);
    // An unreviewed import is not a ledger.
    expect((await h.repo.finance.transactions(h.ctxA)).length).toBe(before);
  });

  it("posts only the rows the reviewer accepted", async () => {
    const record = await h.repo.finance.importStatement(h.ctxA, { csv: CSV });
    const candidates = await h.repo.finance.candidates(h.ctxA, record.id);
    expect(candidates).toHaveLength(2);

    const before = (await h.repo.finance.transactions(h.ctxA)).length;
    const result = await h.repo.finance.postCandidates(h.ctxA, record.id, [
      candidates[0]!.rowNumber,
    ]);

    expect(result.posted).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toMatch(/Not accepted/);
    expect((await h.repo.finance.transactions(h.ctxA)).length).toBe(before + 1);
  });

  it("posts a transaction as provided, never as verified", async () => {
    const record = await h.repo.finance.importStatement(h.ctxA, { csv: CSV });
    const candidates = await h.repo.finance.candidates(h.ctxA, record.id);
    const { posted } = await h.repo.finance.postCandidates(
      h.ctxA,
      record.id,
      candidates.map((candidate) => candidate.rowNumber),
    );

    const transaction = await h.repo.finance.getTransaction(h.ctxA, posted[0]!);
    // A person confirmed a suggestion. Nobody reconciled it against a bank
    // statement line by line.
    expect(transaction?.verificationState).toBe("provided");
    expect(transaction?.source).toBe("import");
  });

  it("will not post the same candidate twice", async () => {
    const record = await h.repo.finance.importStatement(h.ctxA, { csv: CSV });
    const candidates = await h.repo.finance.candidates(h.ctxA, record.id);
    const rows = candidates.map((candidate) => candidate.rowNumber);

    await h.repo.finance.postCandidates(h.ctxA, record.id, rows);
    const second = await h.repo.finance.postCandidates(h.ctxA, record.id, rows);

    expect(second.posted).toEqual([]);
    expect(second.skipped.every((entry) => entry.reason === "Already posted.")).toBe(true);
  });

  it("keeps one tenant's imports out of another's", async () => {
    await h.repo.finance.importStatement(h.ctxA, { csv: CSV });
    expect(await h.repo.finance.imports(h.ctxB)).toEqual([]);

    const [record] = await h.repo.finance.imports(h.ctxA);
    expect(await h.repo.finance.getImport(h.ctxB, record!.id)).toBeNull();
    expect(await h.repo.finance.candidates(h.ctxB, record!.id)).toEqual([]);
    expect(await h.repo.finance.postCandidates(h.ctxB, record!.id, [2])).toEqual({
      posted: [],
      skipped: [],
    });
  });
});

describe("the Finance Command Centre explains every figure", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("shows its arithmetic on every figure it can produce", async () => {
    const position = await loadFinancePosition(h.ctxA, h.repo);

    for (const [name, figure] of Object.entries({
      cash: position.cash,
      unrestricted: position.unrestricted,
      runway: position.runway,
      concentration: position.concentration,
      unallocated: position.unallocated,
    })) {
      if (!figure.known) continue;
      expect(figure.workings, name).toBeTruthy();
      expect(figure.display, name).toBeTruthy();
    }
  });

  it("computes a runway the engine produced, not a number this layer invented", async () => {
    const position = await loadFinancePosition(h.ctxA, h.repo);
    expect(position.runway.known).toBe(true);
    if (!position.runway.known) return;
    // 3.4 months, not the 2.5 this asserted before MG-10. The difference is
    // the seeded spring appeal: donations become transactions in the general
    // fund and therefore move the runway, which is the fundraising acceptance
    // chain reaching finance without a second entry.
    expect(position.runway.number).toBeCloseTo(3.4, 1);
    expect(position.runway.workings).toMatch(/net monthly burn/);
    expect(position.runway.caveat).toMatch(/burn rate continues/);
  });

  /**
   * An opening reserve modelled as income makes the burn rate report that the
   * core covers itself. This is the most flattering possible error and only
   * surfaces when somebody trusts the runway figure.
   */
  it("keeps a balance brought forward out of the flow", async () => {
    const position = await loadFinancePosition(h.ctxA, h.repo);
    expect(position.unrestricted.known).toBe(true);
    if (!position.unrestricted.known) return;
    expect(position.unrestricted.workings).toMatch(/brought forward/);
    // With the reserve counted as income, income exceeds spend and the runway
    // reads "no net burn".
    expect(position.runway.known && position.runway.display).not.toBe("No net burn");
  });

  it("reads grant utilisation from allocations, not from the scalar", async () => {
    const position = await loadFinancePosition(h.ctxA, h.repo);
    const henderson = position.grantUtilisation.find(
      (entry) => entry.grantId === "grant-henderson",
    )!;

    expect(henderson.workings).toMatch(/naming its transaction and its method/);
    // The seeded `Grant.spentToDate` is not what this reports: allocations are.
    const grant = await h.repo.grants.get(h.ctxA, "grant-henderson");
    expect(henderson.allocated.minorUnits).not.toBe(Math.round(grant!.spentToDate * 100));
  });

  it("shows utilisation against elapsed time, because one without the other is not a finding", async () => {
    const position = await loadFinancePosition(h.ctxA, h.repo);
    for (const entry of position.grantUtilisation) {
      expect(entry.percentElapsed).toBeGreaterThanOrEqual(0);
      expect(typeof entry.percentUsed).toBe("number");
    }
  });
});

describe("a refusal is never a blank and never a zero", () => {
  const empty = {
    organisationId: "org-empty",
    currency: "GBP",
    funds: [],
    transactions: [],
    allocations: [],
    budgets: [],
    budgetLines: [],
    grants: [],
    funders: [],
    programmes: [],
    programmeGrants: [],
    now: NOW,
  };

  it("says why each figure cannot be produced, and what would produce it", () => {
    const position = computeFinancePosition(empty);

    expect(position.cash.known).toBe(false);
    if (position.cash.known) return;
    expect(position.cash.reason).toMatch(/no transactions have been recorded/);
    expect(position.cash.requires.length).toBeGreaterThan(0);
  });

  /**
   * "This organisation holds no restricted fund" and "the restricted balance
   * is zero" are opposite statements about a charity.
   */
  it("distinguishes holding no fund from holding an empty one", () => {
    const position = computeFinancePosition(empty);
    expect(position.restricted.known).toBe(false);
    if (position.restricted.known) return;
    expect(position.restricted.reason).toMatch(/holds no restricted fund/);
  });

  it("refuses a burn rate from too short a ledger", () => {
    const position = computeFinancePosition({
      ...empty,
      funds: [
        {
          id: "f1",
          organisationId: "org-empty",
          name: "General",
          restriction: "unrestricted",
          currency: "GBP",
          status: "open",
          audit: { createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        },
      ],
      transactions: [
        {
          id: "t1",
          organisationId: "org-empty",
          date: "2026-07-01",
          description: "Rent",
          amount: { minorUnits: 50_000, currency: "GBP" },
          direction: "expenditure",
          restricted: false,
          fundId: "f1",
          source: "import",
          verificationState: "provided",
        },
      ],
    });

    expect(position.runway.known).toBe(false);
    if (position.runway.known) return;
    // A burn rate from a fortnight of ledger is arithmetic, not information.
    expect(position.runway.reason).toMatch(/not enough to establish a burn rate/);
  });

  it("refuses concentration with fewer than two active grants", () => {
    const position = computeFinancePosition(empty);
    expect(position.concentration.known).toBe(false);
    if (position.concentration.known) return;
    expect(position.concentration.reason).toMatch(/at least two active grants/);
  });

  it("collects every refusal so a screen cannot quietly omit one", () => {
    const position = computeFinancePosition(empty);
    expect(position.unanswered.length).toBeGreaterThanOrEqual(4);
    for (const entry of position.unanswered) {
      expect(entry.question).toBeTruthy();
      expect(entry.reason).toBeTruthy();
    }
  });
});

describe("a shared cost reconciles to the penny, through the persisted path", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  const importOneCost = async (harness: TwoTenantHarness, amount: string) => {
    const record = await harness.repo.finance.importStatement(harness.ctxA, {
      csv: `Date,Description,Amount\n05/07/2026,Finance team,${amount}`,
    });
    const candidates = await harness.repo.finance.candidates(harness.ctxA, record.id);
    const { posted } = await harness.repo.finance.postCandidates(harness.ctxA, record.id, [
      candidates[0]!.rowNumber,
    ]);
    return posted[0]!;
  };

  /**
   * The mutation the expansion plan names for this phase: *replace
   * largest-remainder splitting with naïve rounding*. The plan also says to
   * re-run it against the **persisted** path, which is what this test is for —
   * the engine's own suite proves the arithmetic, and this proves the
   * arithmetic is what the repository actually uses rather than a second copy.
   *
   * £72,000 split 42/35/23 is £30,240 / £25,200 / £16,560. Under naïve
   * rounding it reconciles to something that is not £72,000, and every roll-up
   * above it is wrong.
   */
  it("splits a shared cost with nothing left over", async () => {
    const transactionId = await importOneCost(h, "-72000.00");

    const result = await h.repo.finance.allocateShared(h.ctxA, {
      transactionId,
      label: "Finance team",
      basis: "programme_expenditure",
      targets: [
        { label: "Youth Futures", weight: 42, programmeId: "prog-youth" },
        { label: "Digital Bridge", weight: 35, programmeId: "prog-digital" },
        { label: "Wellbeing", weight: 23, programmeId: "prog-wellbeing" },
      ],
    });

    expect(result).not.toBeNull();
    const allocations = (await h.repo.finance.allocations(h.ctxA)).filter((allocation) =>
      result!.allocationIds.includes(allocation.id),
    );
    expect(allocations).toHaveLength(3);

    const total = allocations.reduce(
      (sum, allocation) => sum + allocation.amount.minorUnits,
      result!.unallocatedMinorUnits,
    );
    expect(total).toBe(7_200_000);
    expect(allocations.map((a) => a.amount.minorUnits).sort((a, b) => b - a)).toEqual([
      3_024_000, 2_520_000, 1_656_000,
    ]);
  });

  /**
   * An amount that does not divide cleanly is the case naïve rounding loses a
   * penny on, and the one a reconciliation notices six months later.
   */
  it("loses no penny on an amount that does not divide", async () => {
    const transactionId = await importOneCost(h, "-100.00");

    const result = await h.repo.finance.allocateShared(h.ctxA, {
      transactionId,
      label: "Shared licence",
      basis: "equal",
      targets: [
        { label: "Youth Futures", weight: 1, programmeId: "prog-youth" },
        { label: "Digital Bridge", weight: 1, programmeId: "prog-digital" },
        { label: "Wellbeing", weight: 1, programmeId: "prog-wellbeing" },
      ],
    });

    const allocations = (await h.repo.finance.allocations(h.ctxA)).filter((allocation) =>
      result!.allocationIds.includes(allocation.id),
    );
    const total = allocations.reduce((sum, a) => sum + a.amount.minorUnits, 0);
    expect(total).toBe(10_000);
    // 3334 / 3333 / 3333, not three times 3333 with a penny gone.
    expect(allocations.map((a) => a.amount.minorUnits).sort((a, b) => b - a)).toEqual([
      3_334, 3_333, 3_333,
    ]);
  });

  it("records a share held back as organisational rather than forcing it onto delivery", async () => {
    const transactionId = await importOneCost(h, "-1000.00");

    const result = await h.repo.finance.allocateShared(h.ctxA, {
      transactionId,
      label: "Chief executive time",
      basis: "staff_time",
      targets: [{ label: "Youth Futures", weight: 1, programmeId: "prog-youth" }],
      unallocatedShare: 0.3,
    });

    expect(result!.unallocatedMinorUnits).toBe(30_000);
    const allocations = (await h.repo.finance.allocations(h.ctxA)).filter((allocation) =>
      result!.allocationIds.includes(allocation.id),
    );
    expect(allocations.reduce((sum, a) => sum + a.amount.minorUnits, 0)).toBe(70_000);
  });

  it("carries the method and basis onto every allocation it writes", async () => {
    const transactionId = await importOneCost(h, "-500.00");
    const result = await h.repo.finance.allocateShared(h.ctxA, {
      transactionId,
      label: "Shared cost",
      basis: "headcount",
      targets: [
        { label: "Youth Futures", weight: 2, programmeId: "prog-youth" },
        { label: "Digital Bridge", weight: 1, programmeId: "prog-digital" },
      ],
    });

    const allocations = (await h.repo.finance.allocations(h.ctxA)).filter((allocation) =>
      result!.allocationIds.includes(allocation.id),
    );
    // A figure whose apportionment cannot be explained is what makes a unit
    // cost indefensible, so the method is on the record rather than in a note.
    for (const allocation of allocations) {
      expect(allocation.allocationMethod).toBe("shared_cost");
      expect(allocation.allocationBasis).toBe("headcount");
      expect(allocation.allocationNote).toBeTruthy();
    }
  });

  it("refuses to apportion across another tenant's programme", async () => {
    const transactionId = await importOneCost(h, "-100.00");
    expect(
      await h.repo.finance.allocateShared(h.ctxA, {
        transactionId,
        label: "Shared cost",
        basis: "equal",
        targets: [{ label: "Beacon", weight: 1, programmeId: "prog-beacon-1" }],
      }),
    ).toBeNull();
  });
});
