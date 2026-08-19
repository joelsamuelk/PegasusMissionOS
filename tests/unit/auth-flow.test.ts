import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { magicLinkSchema, safeNextPath } from "@/lib/validation/auth";

describe("magic-link authentication", () => {
  it("normalises and validates work email input", () => {
    expect(magicLinkSchema.parse({ email: "  JOEL@example.com " })).toEqual({
      email: "JOEL@example.com",
    });
    expect(magicLinkSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("allows only local post-authentication destinations", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/funding?view=active")).toBe("/funding?view=active");
    expect(safeNextPath("https://attacker.example")).toBe("/dashboard");
    expect(safeNextPath("//attacker.example")).toBe("/dashboard");
    expect(safeNextPath("/\\attacker.example")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
  });
});

describe("shared magic-link template", () => {
  it("uses the request-specific callback instead of a hardcoded app host", () => {
    const template = readFileSync(
      join(process.cwd(), "supabase/templates/magic_link.html"),
      "utf8",
    );
    expect(template).toContain("{{ .RedirectTo }}");
    expect(template).not.toContain("app.pegasus-studio.co/auth/confirm");
  });
});
