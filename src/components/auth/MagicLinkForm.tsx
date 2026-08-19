"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Mail } from "lucide-react";
import { requestMagicLink } from "@/server/actions/auth";
import { initialMagicLinkState } from "@/lib/validation/auth";
import { Button } from "@/components/shared/ui";
import { cn } from "@/lib/utils";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="mt-1 w-full" disabled={pending}>
      {pending ? "Sending secure link…" : "Email me a sign-in link"}
      {!pending && <Mail className="h-4 w-4" />}
    </Button>
  );
}

export function MagicLinkForm() {
  const [state, formAction] = useActionState(requestMagicLink, initialMagicLinkState);

  if (state.status === "success") {
    return (
      <div
        role="status"
        className="mt-6 rounded-lg border border-success/30 bg-success-soft p-5 text-center"
      >
        <CheckCircle2 className="mx-auto h-7 w-7 text-success" />
        <h2 className="mt-3 font-heading text-title font-semibold text-ink">
          Check your inbox
        </h2>
        <p className="mt-1.5 text-sm text-ink-muted">{state.message}</p>
        <p className="mt-3 text-xs text-ink-subtle">
          The link expires shortly and can only be used once.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-critical/30 bg-critical-soft px-3.5 py-3 text-sm text-critical"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {state.message}
        </p>
      )}

      <label htmlFor="email" className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Work email</span>
        <input
          id="email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          autoFocus
          aria-invalid={Boolean(state.errors?.email)}
          aria-describedby={state.errors?.email ? "email-error" : undefined}
          placeholder="you@yourorganisation.org.uk"
          className={cn(
            "h-11 rounded border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:shadow-focus",
            state.errors?.email && "border-critical",
          )}
        />
        {state.errors?.email && (
          <span id="email-error" className="text-xs text-critical">
            {state.errors.email}
          </span>
        )}
      </label>

      <SubmitButton />
    </form>
  );
}
