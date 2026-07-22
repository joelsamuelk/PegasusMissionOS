"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAiEnabled } from "@/server/actions/mutations";
import { useToast } from "@/components/shared/Toast";
import { cn } from "@/lib/utils";

export function AiSettingToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { notify } = useToast();

  function toggle() {
    const next = !on;
    setOn(next);
    start(async () => {
      await setAiEnabled(next);
      notify(next ? "AI assistance enabled." : "AI assistance disabled.");
      router.refresh();
    });
  }

  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={toggle}
      disabled={pending}
      className={cn(
        "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors",
        on ? "bg-accent" : "bg-line-strong",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          on ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
