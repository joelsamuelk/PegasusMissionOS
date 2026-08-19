import type { RenderedEmail } from "@/lib/email/types";

export interface SystemEmailRequest {
  to: string[];
  message: RenderedEmail;
  replyTo?: string;
  /** Required for consequential and outreach sends. */
  approvedByInternalUserId?: string;
  idempotencyKey: string;
}

export interface SystemEmailResult { providerMessageId: string; acceptedAt: string }

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

/** Safe default: rendering works, but no code can accidentally send. */
export function getSystemEmailProvider(): SystemEmailProvider {
  return { id: "none", async send() { throw new EmailDeliveryNotConfiguredError(); } };
}
