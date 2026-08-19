import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimits, rateLimit } from "@/server/rate-limit";

/**
 * The clock is injected, so the window behaviour is asserted directly rather
 * than by sleeping. A rate limiter tested with real time is either slow or
 * flaky, and usually both.
 */
const START = new Date("2026-08-17T10:00:00Z");
const at = (msFromStart: number) => new Date(START.getTime() + msFromStart);

const OPTIONS = { limit: 3, windowMs: 60_000 };

describe("fixed-window rate limit", () => {
  beforeEach(() => {
    __resetRateLimits();
  });

  it("allows requests up to the limit", () => {
    for (let i = 1; i <= 3; i++) {
      const result = rateLimit("k", { ...OPTIONS, now: at(0) });
      expect(result.allowed, `request ${i}`).toBe(true);
    }
  });

  it("refuses the request after the limit", () => {
    for (let i = 0; i < 3; i++) rateLimit("k", { ...OPTIONS, now: at(0) });
    expect(rateLimit("k", { ...OPTIONS, now: at(0) }).allowed).toBe(false);
  });

  it("reports how many requests remain", () => {
    expect(rateLimit("k", { ...OPTIONS, now: at(0) }).remaining).toBe(2);
    expect(rateLimit("k", { ...OPTIONS, now: at(0) }).remaining).toBe(1);
    expect(rateLimit("k", { ...OPTIONS, now: at(0) }).remaining).toBe(0);
  });

  it("never reports negative remaining once over the limit", () => {
    for (let i = 0; i < 6; i++) rateLimit("k", { ...OPTIONS, now: at(0) });
    expect(rateLimit("k", { ...OPTIONS, now: at(0) }).remaining).toBe(0);
  });

  it("keeps separate counters per key", () => {
    for (let i = 0; i < 3; i++) rateLimit("a", { ...OPTIONS, now: at(0) });
    expect(rateLimit("a", { ...OPTIONS, now: at(0) }).allowed).toBe(false);
    // A second caller is unaffected by the first one's flood.
    expect(rateLimit("b", { ...OPTIONS, now: at(0) }).allowed).toBe(true);
  });

  it("opens a fresh window once the old one expires", () => {
    for (let i = 0; i < 3; i++) rateLimit("k", { ...OPTIONS, now: at(0) });
    expect(rateLimit("k", { ...OPTIONS, now: at(59_000) }).allowed).toBe(false);
    expect(rateLimit("k", { ...OPTIONS, now: at(60_001) }).allowed).toBe(true);
  });

  it("reports when the window resets", () => {
    const result = rateLimit("k", { ...OPTIONS, now: at(0) });
    expect(result.resetAt.getTime()).toBe(at(60_000).getTime());
  });
});
