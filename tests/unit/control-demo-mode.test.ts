import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_MODE_COOKIE, demoCookieOptions, isDemoCookie } from "@/lib/control-plane/demo-mode";
import { createControlRequestContext } from "@/server/control-plane/context";
import { summariseCommandCentre, formatPounds } from "@/server/control-plane/command-centre";
import type { InternalTask, ProspectOrganisation, SalesOpportunity } from "@/server/control-plane/types";

describe("demonstration mode is deliberate and temporary", () => {
  it("is off unless the session cookie says otherwise", () => {
    expect(isDemoCookie(undefined)).toBe(false);
    expect(isDemoCookie("")).toBe(false);
    expect(isDemoCookie("off")).toBe(false);
    expect(isDemoCookie("true")).toBe(false);
    expect(isDemoCookie("on")).toBe(true);
  });

  it("cannot outlive the browser session", () => {
    // No maxAge and no expires is what makes it a session cookie. If either is
    // ever added, a demonstration could still be running days later.
    expect(demoCookieOptions).not.toHaveProperty("maxAge");
    expect(demoCookieOptions).not.toHaveProperty("expires");
    expect(demoCookieOptions.name).toBe(DEMO_MODE_COOKIE);
    expect(demoCookieOptions.httpOnly).toBe(true);
    expect(demoCookieOptions.sameSite).toBe("lax");
  });

  it("defaults a constructed context to real data", () => {
    const ctx = createControlRequestContext({ internalUserId: "u", role: "sales", requestId: "r" });
    expect(ctx.demoMode).toBe(false);
  });
});

describe("demonstration content stays behind the flag", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(path)) files.push(path);
    }
  };
  walk("src");

  it("is imported only by components under control-plane/demo", () => {
    const offenders = files.filter(
      (path) =>
        !path.includes(join("components", "control-plane", "demo")) &&
        path !== join("src", "lib", "commercial", "demo-data.ts") &&
        readFileSync(path, "utf8").includes("commercial/demo-data"),
    );
    expect(offenders, `demo data imported outside the demo components:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("is reached only through a demoMode check", () => {
    const offenders = files.filter((path) => {
      const source = readFileSync(path, "utf8");
      return /from "@\/components\/control-plane\/demo\//.test(source) && !source.includes("demoMode");
    });
    expect(offenders, `demo component rendered without a demoMode check:\n${offenders.join("\n")}`).toEqual([]);
  });
});

const prospect = (status: ProspectOrganisation["status"]): ProspectOrganisation => ({ id: crypto.randomUUID(), name: "Org", focusAreas: [], sizeIndicators: [], publicFinancialIndicators: [], publicProgrammeIndicators: [], status, source: "discovery:pilot", createdAt: "2026-08-19T10:00:00Z", updatedAt: "2026-08-19T10:00:00Z" });
const opportunity = (over: Partial<SalesOpportunity>): SalesOpportunity => ({ id: crypto.randomUUID(), prospectOrganisationId: "p", stage: "qualified", createdAt: "2026-08-19T10:00:00Z", updatedAt: "2026-08-19T10:00:00Z", ...over });
const task = (over: Partial<InternalTask>): InternalTask => ({ id: crypto.randomUUID(), title: "t", priority: "medium", status: "open", source: "manual", relatedEntity: { type: "prospect", id: "p" }, createdAt: "2026-08-19T10:00:00Z", updatedAt: "2026-08-19T10:00:00Z", ...over });
const now = new Date("2026-08-19T10:00:00Z");

describe("command centre summary", () => {
  it("distinguishes a pipeline nothing values from a pipeline worth nothing", () => {
    const unvalued = summariseCommandCentre({ prospects: [], opportunities: [opportunity({})], tasks: [], now });
    expect(unvalued.pipelineValue).toBeNull();
    expect(formatPounds(unvalued.pipelineValue)).toBe("Not recorded");
    const valued = summariseCommandCentre({ prospects: [], opportunities: [opportunity({ expectedValue: 0 })], tasks: [], now });
    expect(valued.pipelineValue).toBe(0);
    expect(formatPounds(valued.pipelineValue)).toBe("£0");
  });

  it("counts only open opportunities into the pipeline", () => {
    const summary = summariseCommandCentre({ prospects: [], now, tasks: [], opportunities: [opportunity({ stage: "proposal", expectedValue: 10_000, probability: 50 }), opportunity({ stage: "won", expectedValue: 90_000 }), opportunity({ stage: "lost", expectedValue: 70_000 })] });
    expect(summary).toMatchObject({ pipelineValue: 10_000, weightedPipelineValue: 5_000, openOpportunities: 1, proposalsOpen: 1, clientsWon: 1 });
  });

  it("counts prospects awaiting research and overdue tasks", () => {
    const summary = summariseCommandCentre({ prospects: [prospect("discovered"), prospect("discovered"), prospect("researched")], opportunities: [], now, tasks: [task({ dueAt: "2026-08-18T10:00:00Z" }), task({ dueAt: "2026-08-20T10:00:00Z" }), task({ status: "completed", dueAt: "2026-01-01T10:00:00Z" })] });
    expect(summary).toMatchObject({ prospects: 3, awaitingResearch: 2, openTasks: 2, overdueTasks: 1 });
  });
});

describe("a demonstration never reaches real records", () => {
  it("hands a demonstration session the sandbox, not the configured repository", async () => {
    const { getControlRepository, resetControlSandbox } = await import("@/server/control-plane");
    const demo = createControlRequestContext({ internalUserId: "u", role: "super_admin", requestId: "r", demoMode: true });
    const repo = await getControlRepository(demo);
    const before = (await repo.prospects.list(demo)).length;
    await repo.prospects.create(demo, { id: crypto.randomUUID(), name: "Sandbox Only Ltd", focusAreas: [], sizeIndicators: [], publicFinancialIndicators: [], publicProgrammeIndicators: [], status: "discovered", source: "demo", createdAt: "2026-08-19T10:00:00Z", updatedAt: "2026-08-19T10:00:00Z" });
    expect((await repo.prospects.list(demo))).toHaveLength(before + 1);

    // Leaving the demonstration discards everything it wrote.
    resetControlSandbox();
    const after = await getControlRepository(demo);
    expect((await after.prospects.list(demo)).map((p) => p.name)).not.toContain("Sandbox Only Ltd");
  });

  it("refuses to build a repository without a context to route on", async () => {
    const { getControlRepository } = await import("@/server/control-plane");
    // The context is a required parameter: a call site that forgets it cannot
    // compile, so no code path can silently reach real records while demoing.
    expect(getControlRepository.length).toBe(1);
  });
});
