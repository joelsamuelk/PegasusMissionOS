"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, AlertCircle, Send } from "lucide-react";
import { submitEnquiry } from "@/server/actions/enquiry";
import { ENQUIRY_TOPICS, initialEnquiryState } from "@/lib/validation/enquiry";
import { Button } from "@/components/shared/ui";
import { cn } from "@/lib/utils";

const fieldClass =
  "w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-none";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="blue" size="lg" disabled={pending}>
      {pending ? "Sending…" : "Send enquiry"}
      {!pending && <Send className="h-4 w-4" />}
    </Button>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-xs text-critical">
      {message}
    </p>
  );
}

export function ContactForm() {
  const [state, formAction] = useActionState(submitEnquiry, initialEnquiryState);

  if (state.status === "success") {
    return (
      <div className="rounded-xl border border-success/30 bg-success-soft p-8 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
        <h3 className="mt-4 font-heading text-title font-semibold text-ink">
          Message received
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-critical/30 bg-critical-soft px-3.5 py-3 text-sm text-critical"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {state.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-ink">
            Your name
          </label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            required
            aria-invalid={Boolean(state.errors?.name)}
            aria-describedby={state.errors?.name ? "name-error" : undefined}
            className={cn(fieldClass, state.errors?.name && "border-critical")}
            placeholder="Amara Okafor"
          />
          <FieldError id="name-error" message={state.errors?.name} />
        </div>

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={Boolean(state.errors?.email)}
            aria-describedby={state.errors?.email ? "email-error" : undefined}
            className={cn(fieldClass, state.errors?.email && "border-critical")}
            placeholder="you@yourcharity.org.uk"
          />
          <FieldError id="email-error" message={state.errors?.email} />
        </div>
      </div>

      <div>
        <label
          htmlFor="organisation"
          className="mb-1.5 block text-sm font-medium text-ink"
        >
          Organisation
        </label>
        <input
          id="organisation"
          name="organisation"
          autoComplete="organization"
          required
          aria-invalid={Boolean(state.errors?.organisation)}
          aria-describedby={state.errors?.organisation ? "organisation-error" : undefined}
          className={cn(fieldClass, state.errors?.organisation && "border-critical")}
          placeholder="Northstar Community Foundation"
        />
        <FieldError id="organisation-error" message={state.errors?.organisation} />
      </div>

      <div>
        <label htmlFor="topic" className="mb-1.5 block text-sm font-medium text-ink">
          What would you like to talk about?
        </label>
        <select
          id="topic"
          name="topic"
          required
          defaultValue={ENQUIRY_TOPICS[0]}
          aria-invalid={Boolean(state.errors?.topic)}
          aria-describedby={state.errors?.topic ? "topic-error" : undefined}
          className={cn(fieldClass, state.errors?.topic && "border-critical")}
        >
          {ENQUIRY_TOPICS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <FieldError id="topic-error" message={state.errors?.topic} />
      </div>

      <div>
        <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-ink">
          A little context
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          required
          aria-invalid={Boolean(state.errors?.message)}
          aria-describedby={state.errors?.message ? "message-error" : undefined}
          className={cn(fieldClass, "resize-y", state.errors?.message && "border-critical")}
          placeholder="Tell us how your team runs funding and delivery today, and what you would like to change."
        />
        <FieldError id="message-error" message={state.errors?.message} />
      </div>

      {/* Honeypot: hidden from people, tempting to bots. */}
      <div className="hidden" aria-hidden>
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <SubmitButton />
        <p className="text-xs text-ink-subtle">
          We reply to every enquiry. No newsletter, no list.
        </p>
      </div>
    </form>
  );
}
