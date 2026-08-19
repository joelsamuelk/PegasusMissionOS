"use server";

import { headers } from "next/headers";
import { enquirySchema, type EnquiryState, type Enquiry } from "@/lib/validation/enquiry";
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
 * Resend is the primary delivery channel. A webhook remains available for
 * deployments that route enquiries through an automation platform instead.
 * Missing configuration is an error: the form must never tell a visitor their
 * message was received when it was only written to a transient server log.
 */
async function deliver(enquiry: Enquiry): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  const webhook = process.env.ENQUIRY_WEBHOOK_URL;
  const payload = { ...enquiry, receivedAt: new Date().toISOString() };

  if (resendKey) {
    const recipient = process.env.ENQUIRY_EMAIL_TO ?? "joel@pegasus-studio.co";
    const sender =
      process.env.ENQUIRY_EMAIL_FROM ?? "Pegasus Mission OS <hello@pegasus-studio.co>";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: [recipient],
        reply_to: enquiry.email,
        subject: `Mission OS enquiry: ${enquiry.topic}`,
        text: enquiryText(enquiry, payload.receivedAt),
        html: enquiryHtml(enquiry, payload.receivedAt),
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend responded ${response.status}`);
    }
    return;
  }

  if (webhook) {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Enquiry webhook responded ${response.status}`);
    }
    return;
  }

  throw new Error("Enquiry delivery is not configured");
}

function enquiryText(enquiry: Enquiry, receivedAt: string): string {
  return [
    "New Mission OS website enquiry",
    "",
    `Name: ${enquiry.name}`,
    `Email: ${enquiry.email}`,
    `Organisation: ${enquiry.organisation}`,
    `Topic: ${enquiry.topic}`,
    `Received: ${receivedAt}`,
    "",
    enquiry.message,
  ].join("\n");
}

function enquiryHtml(enquiry: Enquiry, receivedAt: string): string {
  const e = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  return `<div style="font-family:Arial,sans-serif;color:#14213d;max-width:640px"><h1 style="font-size:22px">New Mission OS website enquiry</h1><table style="border-collapse:collapse;width:100%;font-size:14px"><tr><td style="padding:8px 0;color:#6b7280">Name</td><td style="padding:8px 0;font-weight:700">${e(enquiry.name)}</td></tr><tr><td style="padding:8px 0;color:#6b7280">Email</td><td style="padding:8px 0"><a href="mailto:${e(enquiry.email)}">${e(enquiry.email)}</a></td></tr><tr><td style="padding:8px 0;color:#6b7280">Organisation</td><td style="padding:8px 0">${e(enquiry.organisation)}</td></tr><tr><td style="padding:8px 0;color:#6b7280">Topic</td><td style="padding:8px 0">${e(enquiry.topic)}</td></tr><tr><td style="padding:8px 0;color:#6b7280">Received</td><td style="padding:8px 0">${e(receivedAt)}</td></tr></table><div style="margin-top:20px;padding:18px;border-left:3px solid #ff5757;background:#fff0ef;white-space:pre-wrap;line-height:1.6">${e(enquiry.message)}</div></div>`;
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
        "You have sent several enquiries recently. Please try again later, or email joel@pegasus-studio.co.",
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
        "We could not send that just now. Please try again, or email joel@pegasus-studio.co.",
    };
  }

  return {
    status: "success",
    message: "Thank you. We will be in touch shortly.",
  };
}
