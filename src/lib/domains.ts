export type ProductSurface =
  | "marketing"
  | "customer_app"
  | "control_plane"
  | "preview"
  | "unknown";

export interface DomainConfig {
  studioUrl: string;
  missionMarketingUrl: string;
  missionAppUrl: string;
  controlPlaneUrl: string;
  previewUrl?: string;
  vercelProductionUrl?: string;
  legacyUrl?: string;
}

const PRODUCTION_DEFAULTS = {
  studioUrl: "https://www.pegasus-studio.co",
  missionMarketingUrl: "https://mission.pegasus-studio.co",
  missionAppUrl: "https://app.pegasus-studio.co",
  controlPlaneUrl: "https://control.pegasus-studio.co",
} as const;

function normaliseOrigin(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use http or https.`);
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`${name} must be an origin without credentials, path, query, or hash.`);
  }
  return url.origin;
}

function optionalOrigin(value: string | undefined, name: string): string | undefined {
  const configured = value?.trim();
  return configured ? normaliseOrigin(configured, name) : undefined;
}

function originOrDefault(value: string | undefined, fallback: string, name: string): string {
  return normaliseOrigin(value?.trim() || fallback, name);
}

function productionOrigin(
  value: string | undefined,
  fallback: string,
  name: string,
  production: boolean,
): string {
  const origin = originOrDefault(value, fallback, name);
  if (production && new URL(origin).hostname.endsWith("localhost")) {
    throw new Error(`${name} must not use localhost in production.`);
  }
  return origin;
}

export function createDomainConfig(
  env: Record<string, string | undefined> = process.env,
): DomainConfig {
  const production = env.NODE_ENV === "production";
  const vercelPreview = env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined;
  const vercelProduction = env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined;
  return {
    studioUrl: originOrDefault(
      env.NEXT_PUBLIC_STUDIO_URL,
      PRODUCTION_DEFAULTS.studioUrl,
      "NEXT_PUBLIC_STUDIO_URL",
    ),
    missionMarketingUrl: originOrDefault(
      env.NEXT_PUBLIC_MARKETING_URL,
      production ? PRODUCTION_DEFAULTS.missionMarketingUrl : "http://mission.localhost:3000",
      "NEXT_PUBLIC_MARKETING_URL",
    ),
    missionAppUrl: productionOrigin(
      env.NEXT_PUBLIC_APP_URL,
      production ? PRODUCTION_DEFAULTS.missionAppUrl : "http://app.localhost:3000",
      "NEXT_PUBLIC_APP_URL",
      production,
    ),
    controlPlaneUrl: originOrDefault(
      env.NEXT_PUBLIC_CONTROL_URL,
      production ? PRODUCTION_DEFAULTS.controlPlaneUrl : "http://control.localhost:3000",
      "NEXT_PUBLIC_CONTROL_URL",
    ),
    previewUrl: optionalOrigin(
      env.NEXT_PUBLIC_PREVIEW_URL ?? vercelPreview,
      "NEXT_PUBLIC_PREVIEW_URL",
    ),
    vercelProductionUrl: optionalOrigin(
      vercelProduction,
      "VERCEL_PROJECT_PRODUCTION_URL",
    ),
    legacyUrl: optionalOrigin(env.NEXT_PUBLIC_LEGACY_URL, "NEXT_PUBLIC_LEGACY_URL"),
  };
}

export const domainConfig = createDomainConfig();

function hostnameOf(origin: string | undefined): string | undefined {
  return origin ? new URL(origin).hostname.toLowerCase() : undefined;
}

/** Resolve presentation only. This value must never be used as authorisation. */
export function resolveSurface(host: string | null, config: DomainConfig): ProductSurface {
  if (!host) return "unknown";
  const hostname = host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");

  if (hostname === hostnameOf(config.missionMarketingUrl)) return "marketing";
  if (hostname === hostnameOf(config.missionAppUrl)) return "customer_app";
  if (hostname === hostnameOf(config.controlPlaneUrl)) return "control_plane";
  if (
    hostname === hostnameOf(config.previewUrl) ||
    hostname === hostnameOf(config.vercelProductionUrl) ||
    hostname === hostnameOf(config.legacyUrl)
  ) {
    return "preview";
  }

  // Plain localhost retains the existing all-in-one demo. The named aliases
  // above exercise production-like host separation without local DNS.
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return "preview";
  }
  return "unknown";
}

function withPath(origin: string, path = "/"): string {
  return new URL(path.startsWith("/") ? path : `/${path}`, `${origin}/`).toString();
}

export function createDomainUrls(config: DomainConfig) {
  return {
    studio: (path = "/") => withPath(config.studioUrl, path),
    marketing: (path = "/") => withPath(config.missionMarketingUrl, path),
    app: (path = "/") => withPath(config.missionAppUrl, path),
    control: (path = "/") => withPath(config.controlPlaneUrl, path),
  } as const;
}

export const domainUrls = createDomainUrls(domainConfig);

/**
 * Browser navigation paths. Middleware keeps these on a combined preview and
 * moves them to the configured host when the current surface is separated.
 */
export const domainPaths = {
  marketing: (path = "/") => (path.startsWith("/") ? path : `/${path}`),
  app: (path = "/") => (path.startsWith("/") ? path : `/${path}`),
  control: (path = "/control") => (path.startsWith("/") ? path : `/${path}`),
} as const;
