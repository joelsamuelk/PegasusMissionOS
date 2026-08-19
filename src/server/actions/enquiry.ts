"use server";

import { headers } from "next/headers";
import {
  enquirySchema,
  type EnquiryState,
  type Enquiry,
} from "@/lib/validation/enquiry";
import { rateLimit } from "@/server/rate-limit";

/**
 * `@public-action` — deliberately unauthenticated.
 *
 * This is the marketing site's contact form: the caller is a visitor with no
 * account, no organisation and no role, so there is no capability to check and
 * `authorise()` does not apply. It is the only action in the product like this.
 *
 * Being public means it needs a *different* protection rather than none: input
 * validation, a honeypot, and a per-client rate limit.
 */

/** Five enquiries an hour is far above genuine use and far below flooding. */
const ENQUIRY_LIMIT = 5;
const ENQUIRY_WINDOW_MS = 60 * 60 * 1000;

/**
 * Identify the caller for rate limiting.
 *
 * Proxy headers are spoofable, so this is a speed bump rather than an identity:
 * it stops casual repeat submission, not a determined attacker with a proxy
 * pool. Treated as such deliberately — the cost of abuse here is inbox noise.
 */
async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return `enquiry:${ip}`;
}

/**
 * Deliver a validated enquiry.
 *
 * When `ENQUIRY_WEBHOOK_URL` is set the enquiry is POSTed there (Zapier, Make,
 * a Slack/Teams incoming webhook, or your own endpoint). When it is not set
 * there is no delivery channel configured, so the enquiry is recorded in the
 * server log only — see `.env.example`.
 */
async function deliver(enquiry: Enquiry): Promise<void> {
  const webhook = process.env.ENQUIRY_WEBHOOK_URL;
  const payload = { ...enquiry, receivedAt: new Date().toISOString() };

  if (!webhook) {
    console.info("[enquiry] no ENQUIRY_WEBHOOK_URL configured; logging only", payload);
    return;
  }

  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Enquiry webhook responded ${response.status}`);
  }
}

export async function submitEnquiry(
  _prevState: EnquiryState,
  formData: FormData,
): Promise<EnquiryState> {
  // Honeypot: a hidden field real people never fill in. Report success so a
  // bot gains no signal from the difference.
  if (typeof formData.get("website") === "string" && formData.get("website") !== "") {
    return { status: "success", message: "Thank you. We will be in touch shortly." };
  }

  // Checked before validation and before any outbound call, so a flood costs
  // nothing beyond a map lookup.
  const limit = rateLimit(await clientKey(), {
    limit: ENQUIRY_LIMIT,
    windowMs: ENQUIRY_WINDOW_MS,
  });
  if (!limit.allowed) {
    return {
      status: "error",
      message:
        "You have sent several enquiries recently. Please try again later, or email hello@pegasus-studio.co.",
    };
  }

  const parsed = enquirySchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    organisation: formData.get("organisation"),
    topic: formData.get("topic"),
    message: formData.get("message"),
  });

  if (!parsed.success) {
    const errors: EnquiryState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof Enquiry | undefined;
      if (field && !errors[field]) errors[field] = issue.message;
    }
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      errors,
    };
  }

  try {
    await deliver(parsed.data);
  } catch (error) {
    console.error("[enquiry] delivery failed", error);
    return {
      status: "error",
      message:
        "We could not send that just now. Please try again, or email hello@pegasus-studio.co.",
    };
  }

  return {
    status: "success",
    message: "Thank you. We will be in touch shortly.",
  };
}
