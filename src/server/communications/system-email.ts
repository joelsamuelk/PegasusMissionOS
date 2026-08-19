import type { RenderedEmail } from "@/lib/email/types";

export interface SystemEmailRequest {
  to: string[];
  message: RenderedEmail;
  replyTo?: string;
  /** Required for consequential and outreach sends. */
  approvedByInternalUserId?: string;
  idempotencyKey: string;
}

export interface SystemEmailResult {
  providerMessageId: string;
  acceptedAt: string;
}

export interface SystemEmailProvider {
  readonly id: string;
  send(request: SystemEmailRequest): Promise<SystemEmailResult>;
}

export class EmailDeliveryNotConfiguredError extends Error {
  constructor() {
    super("System email delivery is not configured. The message was not sent.");
    this.name = "EmailDeliveryNotConfiguredError";
  }
}

export class ResendSystemEmailProvider implements SystemEmailProvider {
  readonly id = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly defaultReplyTo?: string,
  ) {}
  async send(request: SystemEmailRequest): Promise<SystemEmailResult> {
    if (!request.approvedByInternalUserId)
      throw new Error("A human approver is required for outreach delivery.");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": request.idempotencyKey,
      },
      body: JSON.stringify({
        from: this.from,
        to: request.to,
        subject: request.message.subject,
        html: request.message.html,
        text: request.message.text,
        reply_to: request.replyTo ?? this.defaultReplyTo,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!response.ok || !body.id)
      throw new Error(
        `Email provider rejected delivery (${response.status}): ${body.message ?? "unknown error"}`,
      );
    return { providerMessageId: body.id, acceptedAt: new Date().toISOString() };
  }
}

/** Safe default: rendering works, but no code can accidentally send. */
export function getSystemEmailProvider(): SystemEmailProvider {
  const provider =
    process.env.OUTREACH_EMAIL_PROVIDER ?? process.env.SYSTEM_EMAIL_PROVIDER ?? "none";
  const key = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.OUTREACH_EMAIL_FROM?.trim() ?? process.env.SYSTEM_EMAIL_FROM?.trim();
  const replyTo =
    process.env.OUTREACH_EMAIL_REPLY_TO?.trim() ??
    process.env.SYSTEM_EMAIL_REPLY_TO?.trim();
  if (provider === "resend" && key && from)
    return new ResendSystemEmailProvider(key, from, replyTo);
  return {
    id: "none",
    async send() {
      throw new EmailDeliveryNotConfiguredError();
    },
  };
}
