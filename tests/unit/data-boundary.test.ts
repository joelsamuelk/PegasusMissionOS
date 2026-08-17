import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The data boundary, asserted rather than documented.
 *
 * Production Invariant 1: no tenant-owned data is accessible without tenant
 * scope. That holds only while every caller goes through `MissionRepository`,
 * which requires a `RequestContext`. A page that reaches into the seeded store
 * directly bypasses tenant scoping entirely, and the failure is silent — the
 * demo has one organisation, so nothing looks wrong until a second tenant
 * exists.
 *
 * This test is the executable form of the Slice A acceptance criterion. It
 * exists because the previous statement of that rule was a sentence in a
 * document, and a sentence does not fail a build.
 */

const SRC = join(process.cwd(), "src");

/** The only directory permitted to import the storage implementation. */
const DATA_LAYER = join("src", "server", "data");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("data boundary", () => {
  const files = sourceFiles(SRC);

  it("finds source files to check", () => {
    // Guards against the walker silently returning nothing, which would make
    // every assertion below vacuously true.
    expect(files.length).toBeGreaterThan(50);
  });

  it("only the data layer imports the seeded store", () => {
    const offenders = files
      .filter((file) => /from\s+["']@\/features\/store["']/.test(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file))
      .filter((file) => !file.startsWith(DATA_LAYER + sep));

    expect(offenders).toEqual([]);
  });

  /**
   * Invariant 3 / audit S2. `AIProvenance` listed everything offered to a model
   * as though it had been used. It was replaced rather than patched, so the
   * meaningful assertion is that the type is gone — a reintroduction would be a
   * quiet return to unfalsifiable provenance.
   */
  it("the fabricated-provenance type has no remaining definition or writer", () => {
    // Matched in code positions only. Prose explaining what replaced it and why
    // is worth keeping; a type annotation, import or declaration is not.
    const inCode = (line: string) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) {
        return false;
      }
      return /\bAIProvenance\b/.test(line);
    };

    const offenders = files
      .filter((file) => readFileSync(file, "utf8").split("\n").some(inCode))
      .map((file) => relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });

  /**
   * Invariant 2. The capability model was complete and unit-tested for three
   * slices while no action consulted it — the failure mode is a new action
   * being written without a gate, not the gate being wrong. A grep is the only
   * thing that catches that, so it runs in the build.
   */
  it("every server action authorises before mutating", () => {
    const actionFiles = files.filter(
      (file) =>
        relative(process.cwd(), file).startsWith(join("src", "server", "actions")) &&
        !file.endsWith("authorise.ts"),
    );
    expect(actionFiles.length).toBeGreaterThan(2);

    const offenders: string[] = [];
    for (const file of actionFiles) {
      const source = readFileSync(file, "utf8");
      if (!/^\s*"use server";/m.test(source)) continue;

      // A deliberately unauthenticated action must say so in the file, with a
      // reason. An allowlist here would let the next public action slip in
      // silently; requiring the marker makes it the author's explicit choice.
      if (/@public-action/.test(source)) continue;

      // Exported async functions in a "use server" module are the action surface.
      const exported = [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1]!);
      const gates =
        // `authorise(...)` and the AI variant `authoriseAi()`.
        (source.match(/\bauthorise(Ai)?\(/g) ?? []).length +
        // The relationship actions predate the shared helper and inline `can()`.
        (source.match(/\bcan\(/g) ?? []).length;

      if (exported.length > gates) {
        offenders.push(
          `${relative(process.cwd(), file)}: ${exported.length} actions, ${gates} authorisation checks`,
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  it("no module pins its own clock instead of using the request context", () => {
    // Seven copies of this constant existed across pages and components before
    // Slice A. Each one computed deadline urgency against an instant unrelated
    // to the request, and `ctx.now()` could not override them.
    const offenders = files
      .filter((file) => /new Date\(\s*["']2026-07-21T10:00:00Z["']\s*\)/.test(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file))
      // The demo clock itself is defined once, in the context resolver.
      .filter((file) => file !== join("src", "server", "context", "request-context.ts"));

    expect(offenders).toEqual([]);
  });
});
