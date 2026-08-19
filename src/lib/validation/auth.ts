import { z } from "zod";

export const magicLinkSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

export interface MagicLinkState {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: { email?: string };
}

export const initialMagicLinkState: MagicLinkState = { status: "idle" };

/** Only application-local absolute paths may be used after authentication. */
export function safeNextPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return "/dashboard";
  }
  return value;
}
