import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, Info } from "lucide-react";
import { ButtonLink } from "@/components/shared/ui";
import { MagicLinkForm } from "@/components/auth/MagicLinkForm";
import { appConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Sign in" };

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link: "That sign-in link is invalid or has expired. Request a new one below.",
  no_membership:
    "Your email is verified, but it does not have access to an active Pegasus workspace.",
  not_configured: "Email sign-in is not configured for this deployment.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  return (
    <div>
      <h1 className="text-heading font-semibold tracking-tight text-ink">Sign in</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        {appConfig.isMockData
          ? "Explore the demonstration workspace without an account."
          : "Enter your work email and we will send you a secure sign-in link."}
      </p>

      {errorMessage && (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-md border border-critical/30 bg-critical-soft px-3.5 py-3 text-sm text-critical"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {errorMessage}
        </p>
      )}

      {appConfig.isMockData ? (
        <>
          <div className="mt-5 flex items-start gap-2.5 rounded-md border border-info/25 bg-info-soft p-3 text-sm text-info">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              No credentials are required. The workspace contains fictional sample data.
            </span>
          </div>
          <ButtonLink href="/dashboard" size="lg" className="mt-6 w-full">
            Continue to demonstration
          </ButtonLink>
        </>
      ) : (
        <MagicLinkForm />
      )}

      <p className="mt-6 text-center text-sm text-ink-muted">
        Need access?{" "}
        <Link
          href="mailto:hello@pegasus-studio.co"
          className="font-medium text-info hover:underline"
        >
          Contact Pegasus Studio
        </Link>
      </p>
    </div>
  );
}
