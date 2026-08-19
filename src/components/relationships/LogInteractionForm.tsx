"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import type { Person } from "@/types/domain";
import { personName } from "@/lib/logic/relationship-brief";
import { logInteraction } from "@/server/actions/relationships";
import { Button } from "@/components/shared/ui";

const TYPES = [
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "call", label: "Call" },
  { value: "event", label: "Event" },
  { value: "introduction", label: "Introduction" },
  { value: "note", label: "Note" },
  { value: "visit", label: "Visit" },
] as const;

const FIELD =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-blue focus:outline-none";

/**
 * Record what happened.
 *
 * Deliberately short. A relationship page that demands twenty fields to log a
 * phone call does not get used, and an unlogged call is the thing this whole
 * layer exists to prevent.
 */
export function LogInteractionForm({
  externalOrganisationId,
  people,
  defaultDate,
}: {
  externalOrganisationId: string;
  people: Person[];
  /** Today, as YYYY-MM-DD, from the server clock. */
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <div className="px-5 py-4">
        {message && (
          <p
            role="status"
            className={message.ok ? "mb-3 text-sm text-success" : "mb-3 text-sm text-critical"}
          >
            {message.text}
          </p>
        )}
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Record an interaction
        </Button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3 px-5 py-4"
      action={(formData) =>
        start(async () => {
          const result = await logInteraction(formData);
          setMessage({ ok: result.ok, text: result.message ?? "" });
          if (result.ok) {
            formRef.current?.reset();
            setOpen(false);
          }
        })
      }
    >
      <input type="hidden" name="externalOrganisationId" value={externalOrganisationId} />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
          Type
          <select name="type" defaultValue="email" className={FIELD}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
          Direction
          <select name="direction" defaultValue="outbound" className={FIELD}>
            <option value="outbound">We contacted them</option>
            <option value="inbound">They contacted us</option>
            <option value="internal">Internal</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
          Date
          <input type="date" name="occurredAt" defaultValue={defaultDate} className={FIELD} />
        </label>
      </div>

      {people.length > 0 && (
        <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
          Who was involved
          <select name="personId" defaultValue="" className={FIELD}>
            <option value="">Not recorded</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {personName(p)}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
        Subject
        <input
          name="subject"
          required
          maxLength={200}
          placeholder="Pre-application call"
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
        What happened
        <textarea
          name="summary"
          rows={3}
          maxLength={2000}
          placeholder="What was discussed, and anything agreed."
          className={FIELD}
        />
      </label>

      {message && !message.ok && (
        <p role="alert" className="text-sm text-critical">
          {message.text}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="blue" disabled={pending}>
          {pending ? "Saving…" : "Save interaction"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      <p className="text-xs text-ink-subtle">
        Recorded against this relationship and shown on the timeline. Anything agreed here can
        be added as a commitment.
      </p>
    </form>
  );
}
