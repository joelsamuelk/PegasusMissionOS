/**
 * Runtime configuration. Determines whether the app runs against a live
 * Supabase project or the in-memory mock store, and which AI provider is used.
 */

export const appConfig = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  },
  /** True when no Supabase project is configured: use the seeded mock store. */
  get isMockData(): boolean {
    return !this.supabase.url || !this.supabase.anonKey;
  },
  ai: {
    provider: (process.env.AI_PROVIDER ?? "mock") as "mock" | "anthropic",
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
  },
} as const;

/** Resolve the effective AI provider, falling back to mock when unconfigured. */
export function resolveAiProvider(): "mock" | "anthropic" {
  if (appConfig.ai.provider === "anthropic" && appConfig.ai.hasAnthropicKey) {
    return "anthropic";
  }
  return "mock";
}
