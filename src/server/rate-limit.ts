/**
 * Fixed-window rate limiting.
 *
 * Exists for the one deliberately public server action — the marketing contact
 * form — which has no session, no organisation and therefore no capability to
 * check. Authorisation cannot protect it, so something else must.
 *
 * **In-process and single-instance.** Counters live in module state, so a
 * deployment running several instances limits per instance rather than
 * globally, and a restart clears every window. That is honest for a form whose
 * failure mode is inbox noise rather than data loss, and it removes the excuse
 * for having no limit at all. Anything with a real abuse cost — auth endpoints,
 * AI generation once it is billable — needs a shared store instead, and should
 * not quietly inherit this.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** When the current window resets. */
  resetAt: Date;
}

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Survives hot reloads in development, exactly like the store does. Without
 * this the limiter resets on every edit and appears not to work.
 */
const globalRef = globalThis as unknown as { __pegasusRateLimit?: Map<string, Window> };
const windows: Map<string, Window> = (globalRef.__pegasusRateLimit ??= new Map());

/** Drop expired windows so an unbounded key space cannot grow the map forever. */
function evictExpired(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number; now?: Date },
): RateLimitResult {
  const now = (options.now ?? new Date()).getTime();

  // Cheap enough at this scale, and it keeps memory bounded by active keys
  // rather than by every key ever seen.
  if (windows.size > 512) evictExpired(now);

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + options.windowMs;
    windows.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: options.limit - 1, resetAt: new Date(resetAt) };
  }

  existing.count += 1;
  const remaining = Math.max(0, options.limit - existing.count);
  return {
    allowed: existing.count <= options.limit,
    remaining,
    resetAt: new Date(existing.resetAt),
  };
}

/** Reset all windows. Tests only. */
export function __resetRateLimits(): void {
  windows.clear();
}
