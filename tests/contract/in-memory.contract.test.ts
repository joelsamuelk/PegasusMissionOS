import { createTwoTenantHarness } from "../fixtures/two-tenant";
import { describeRepositoryContract } from "./repository-contract";

/**
 * The in-memory adapter against the shared contract.
 *
 * This is the reference run: the adapter is the one that powers the demo and
 * every other test, so a contract failure here means the contract is wrong
 * rather than the adapter. When the Supabase adapter lands it gets its own
 * file calling `describeRepositoryContract("supabase", …)` with a harness that
 * seeds a real database, and the two must agree.
 */
describeRepositoryContract("in-memory", () => {
  const { repo, ctxA, ctxB } = createTwoTenantHarness();

  return {
    repo,
    ctxA,
    ctxB,
    fixtures: {
      opportunityId: "opp-horizon",
      applicationId: "app-horizon",
      answerId: "ans-h1",
      grantId: "grant-henderson",
      programmeId: "prog-youth",
      indicatorId: "ind-supported",
      evidenceId: "ev-eval-2025",
      reportId: "report-youth-2026",
      claimId: "clm-participants-2025",
    },
    foreign: {
      opportunityId: "opp-beacon-1",
      grantId: "grant-beacon-1",
      evidenceId: "ev-beacon-1",
      claimId: "clm-beacon-1",
    },
  };
});
