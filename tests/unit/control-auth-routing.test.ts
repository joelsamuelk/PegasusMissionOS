import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
describe("control authentication boundary", () => {
  const middleware = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8"),
    action = readFileSync(
      join(process.cwd(), "src/server/actions/control-auth.ts"),
      "utf8",
    ),
    callback = readFileSync(
      join(process.cwd(), "src/app/control-auth/confirm/route.ts"),
      "utf8",
    );
  it("refreshes auth cookies on the control surface", () =>
    expect(middleware).toContain("return finish(request, NextResponse.next(), surface)"));
  it("sends internal links back to the control origin", () => {
    expect(action).toContain("appConfig.controlUrl");
    expect(action).toContain("/control-auth/confirm");
    expect(action).toContain("next=/control");
  });
  it("checks internal identity rather than tenant membership", () => {
    expect(callback).toContain('.from("internal_users")');
    expect(callback).not.toContain("organisation_members");
    expect(callback).toContain('.eq("status", "active")');
  });
  it("fails closed and signs out non-internal identities", () =>
    expect(callback).toContain("await client.auth.signOut()"));
});
