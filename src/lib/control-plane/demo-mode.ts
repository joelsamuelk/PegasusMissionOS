/**
 * Demonstration mode.
 *
 * The Control Plane ships with curated example accounts, metrics and
 * recommendations that make a live demonstration legible before real pipeline
 * exists. That content is useful in a demonstration and dishonest anywhere
 * else: an operator looking at their own Control Plane must never be shown an
 * invented pipeline figure and have to work out which numbers are real.
 *
 * Three rules keep it from ever being mistaken for real data:
 *
 * 1. **It is never the default.** Nothing in configuration or the database can
 *    switch it on. It is entered deliberately, by a signed-in operator.
 * 2. **It cannot outlive the browser session.** The cookie carries no expiry,
 *    so closing the browser ends it. There is no state to forget to unset.
 * 3. **It is impossible to miss.** Every page carries a banner while it is on,
 *    with one click to leave.
 *
 * It also swaps the repository for a throwaway sandbox, so a button pressed
 * during a demonstration cannot reach real records.
 */
export const DEMO_MODE_COOKIE = "pegasus_control_demo";
const ON = "on";

/** Session cookie: no maxAge and no expires, so it dies with the browser. */
export const demoCookieOptions = {
  name: DEMO_MODE_COOKIE,
  value: ON,
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

export function isDemoCookie(value: string | undefined): boolean {
  return value === ON;
}
