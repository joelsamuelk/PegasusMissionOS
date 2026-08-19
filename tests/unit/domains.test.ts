import { describe, expect, it } from "vitest";
import {
  createDomainConfig,
  createDomainUrls,
  domainPaths,
  resolveSurface,
  type DomainConfig,
} from "@/lib/domains";
import { createRequestContext } from "@/server/context/request-context";
import { createControlRequestContext } from "@/server/control-plane/context";

const config: DomainConfig = {
  studioUrl: "https://www.example.test",
  missionMarketingUrl: "https://mission.example.test",
  missionAppUrl: "https://app.example.test",
  controlPlaneUrl: "https://control.example.test",
  previewUrl: "https://branch-preview.example.dev",
  legacyUrl: "https://legacy.example.test",
};

describe("Mission OS domain architecture", () => {
  it.each([
    ["mission.example.test", "marketing"],
    ["app.example.test", "customer_app"],
    ["control.example.test", "control_plane"],
    ["branch-preview.example.dev", "preview"],
    ["legacy.example.test", "preview"],
    ["localhost:3000", "preview"],
    ["mission.localhost:3000", "marketing"],
    ["app.localhost:3000", "customer_app"],
    ["control.localhost:3000", "control_plane"],
    ["attacker.example", "unknown"],
    [null, "unknown"],
  ] as const)("resolves %s to %s", (host, expected) => {
    const localConfig = createDomainConfig({ NODE_ENV: "development" });
    expect(resolveSurface(host, host?.includes("localhost") ? localConfig : config)).toBe(expected);
  });

  it("builds cross-host destinations from configuration", () => {
    const urls = createDomainUrls(config);
    expect(urls.marketing("/product")).toBe("https://mission.example.test/product");
    expect(urls.app("/login")).toBe("https://app.example.test/login");
    expect(urls.control("/organisations/org-1")).toBe(
      "https://control.example.test/organisations/org-1",
    );
    expect(urls.studio()).toBe("https://www.example.test/");
    expect(domainPaths.app("dashboard")).toBe("/dashboard");
    expect(domainPaths.marketing("/product")).toBe("/product");
  });

  it("rejects unsafe or ambiguous URL configuration", () => {
    expect(() =>
      createDomainConfig({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "javascript:alert(1)",
      }),
    ).toThrow(/http or https/);
    expect(() =>
      createDomainConfig({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.example.test/unexpected-path",
      }),
    ).toThrow(/must be an origin/);
  });

  it("uses production defaults when deployment URL variables are empty", () => {
    expect(
      createDomainConfig({
        NODE_ENV: "production",
        NEXT_PUBLIC_STUDIO_URL: " ",
        NEXT_PUBLIC_MARKETING_URL: "",
        NEXT_PUBLIC_APP_URL: "",
        NEXT_PUBLIC_CONTROL_URL: "",
        NEXT_PUBLIC_PREVIEW_URL: "",
        NEXT_PUBLIC_LEGACY_URL: " ",
      }),
    ).toEqual({
      studioUrl: "https://www.pegasus-studio.co",
      missionMarketingUrl: "https://mission.pegasus-studio.co",
      missionAppUrl: "https://app.pegasus-studio.co",
      controlPlaneUrl: "https://control.pegasus-studio.co",
      previewUrl: undefined,
      legacyUrl: undefined,
    });
  });

  it("does not derive tenant or internal privileges from a host", () => {
    const tenant = createRequestContext({
      organisationId: "org-a",
      userId: "user-a",
      role: "contributor",
    });
    const internal = createControlRequestContext({
      internalUserId: "internal-a",
      role: "support",
      requestId: "request-a",
    });

    expect(resolveSurface("control.example.test", config)).toBe("control_plane");
    expect(tenant).toMatchObject({ organisationId: "org-a", role: "contributor" });
    expect(internal).not.toHaveProperty("organisationId");
    expect(resolveSurface("app.example.test", config)).toBe("customer_app");
    expect(internal.role).toBe("support");
  });
});
