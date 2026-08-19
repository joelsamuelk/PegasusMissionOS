import { domainConfig } from "@/lib/domains";

function firstConfigured(...values: Array<string | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? "";
}

/**
 * Runtime configuration. Determines whether the app runs against a live
 * Supabase project or the in-memory mock store, and which AI provider is used.
 */

export const appConfig = {
  /**
   * Where the application runs. Used for absolute links into the product and
   * for the address shown on marketing product previews.
   */
  appUrl: domainConfig.missionAppUrl,
  /** Separate internal application origin. Never use `appUrl` as its auth boundary. */
  controlUrl: domainConfig.controlPlaneUrl,
  control: {
    /** Explicit opt-in: an unconfigured production deployment must fail closed. */
    mockEnabled: process.env.CONTROL_PLANE_MOCK === "true",
  },
  /**
   * Where the public marketing site runs. Kept separate from `appUrl` because
   * the two are different hosts in production, and metadata, canonicals and
   * the sitemap must point at the marketing origin rather than the app.
   */
  marketingUrl: domainConfig.missionMarketingUrl,
  /** The parent company. Linked from the marketing site and structured data. */
  studioUrl: domainConfig.studioUrl,
  supabase: {
    url: firstConfigured(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: firstConfigured(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  },
  /** True when no Supabase project is configured: use the seeded mock store. */
  get isMockData(): boolean {
    return !this.supabase.url || !this.supabase.anonKey;
  },
  ai: {
    provider: (process.env.AI_PROVIDER ?? "mock") as "mock" | "anthropic",
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    /**
     * Model tiers.
     *
     * Pegasus deliberately keeps AI on a short leash: fit, grant health,
     * relationship health, evidence strength and every finance figure are
     * deterministic. What is left for a model is constrained generation over
     * facts that were assembled for it — a low bar, so the routine tier is a
     * small model and most features use it.
     *
     * The high tier exists for the two features whose output a funder reads.
     * Both are configurable without a code change so the tradeoff can be tuned
     * against real usage rather than guessed at now.
     */
    routineModel: process.env.AI_MODEL_ROUTINE ?? "claude-haiku-4-5",
    fundingFacingModel: process.env.AI_MODEL_FUNDER_FACING ?? "claude-sonnet-5",
  },
} as const;

/** Resolve the effective AI provider, falling back to mock when unconfigured. */
export function resolveAiProvider(): "mock" | "anthropic" {
  if (appConfig.ai.provider === "anthropic" && appConfig.ai.hasAnthropicKey) {
    return "anthropic";
  }
  return "mock";
}
