/**
 * Finance Intelligence: Impact Economics and Funding Need Intelligence.
 *
 * The modules here are pure and dependency-free — no store, no network, no
 * model — so the whole calculation core is unit-testable and the numbers are
 * reproducible. See `docs/FINANCE_INTELLIGENCE.md` for the architecture and
 * for what is deliberately not built yet.
 *
 * The loop this closes (§26):
 *
 *   money → allocation → delivery → outputs → outcomes → impact economics
 *         → forecast → funding need → funding intelligence → opportunity
 *         → grant → allocation …
 */

export * from "./types";
export * from "./money";
export * from "./period";
export * from "./quality";
export * from "./statements";
export * from "./allocate";
export * from "./cost-rollup";
export * from "./unit-economics";
export * from "./subsidy";
export * from "./trends";
export * from "./funding-need";
export * from "./runway";
export * from "./cliffs";
export * from "./forecast";
export * from "./concentration";
export * from "./portfolio";
export * from "./need-matching";
export * from "./recommendations";
