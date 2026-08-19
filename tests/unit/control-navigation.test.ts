import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Control navigation", () => {
  it("only links to implemented Control routes", () => {
    const shell = readFileSync(
      join(process.cwd(), "src/components/control-plane/ControlPlaneShell.tsx"),
      "utf8",
    );
    const routes = [...shell.matchAll(/"(\/control(?:\/[^"?#]*)?)"/g)].map(
      (match) => match[1]!,
    );
    const missing = routes.filter((route) => {
      if (route === "/control") return false;
      return !existsSync(join(process.cwd(), "src/app", route, "page.tsx"));
    });

    expect(missing).toEqual([]);
  });
});
