"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { runScheduler } from "@/server/actions/automations";
import { Button } from "@/components/shared/ui";
import { useToast } from "@/components/shared/Toast";

/**
 * Run the scheduler by hand.
 *
 * Exists because the scheduler is in-process: there is no worker, so something
 * has to tick it, and exposing that as a button is more honest than pretending
 * a background service exists. It is idempotent — the dedupe key means
 * pressing it twice produces the same reminders once — so the button carries
 * no risk beyond the wait.
 */
export function RunSchedulerButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { notify } = useToast();

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await runScheduler();
          if (!result.ok) {
            notify(result.message ?? "The scheduler could not run.", "error");
            return;
          }
          notify(
            `Checked ${result.scanned} dated obligations, scheduled ${result.scheduled} reminder${result.scheduled === 1 ? "" : "s"} and ran ${result.ran}.`,
            "info",
          );
          router.refresh();
        })
      }
    >
      <Clock className="h-3.5 w-3.5" />
      Run the scheduler
    </Button>
  );
}
