"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestControlMagicLink } from "@/server/actions/control-auth";
type State = { status: "idle" | "success" | "error"; message?: string };
const initial: State = { status: "idle" };
function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="mt-1 rounded-lg bg-navy px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
    >
      {pending ? "Sending secure link…" : "Email me a sign-in link"}
    </button>
  );
}
export function ControlMagicLinkForm() {
  const [state, action] = useActionState(requestControlMagicLink, initial);
  if (state.status === "success")
    return (
      <div
        role="status"
        className="mt-6 rounded-lg bg-success-soft p-4 text-sm text-success"
      >
        <b>Check your inbox.</b>
        <p className="mt-1">{state.message}</p>
      </div>
    );
  return (
    <form action={action} className="mt-6 grid gap-3">
      <label className="grid gap-1.5 text-sm font-semibold">
        Work email
        <input
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          className="rounded-lg border bg-surface px-3 py-2.5 font-normal"
          placeholder="you@pegasus-studio.co"
        />
      </label>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-critical">
          {state.message}
        </p>
      ) : null}
      <Submit />
    </form>
  );
}
