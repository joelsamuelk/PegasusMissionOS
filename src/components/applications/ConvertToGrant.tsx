"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Landmark, Loader2 } from "lucide-react";
import { convertApplicationToGrant } from "@/server/actions/mutations";
import { Button } from "@/components/shared/ui";
import { ConfirmDialog } from "@/components/shared/Modal";
import { useToast } from "@/components/shared/Toast";

/**
 * Convert a successful application into an active grant. Confirmed before it
 * runs, since it creates a new tracked record.
 */
export function ConvertToGrant({
  applicationId,
  status,
}: {
  applicationId: string;
  status: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { notify } = useToast();

  if (status === "successful") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-success">
        <Landmark className="h-4 w-4" /> Converted to grant
      </span>
    );
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
        Mark successful and create grant
        <ArrowRight className="h-4 w-4" />
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Create a grant from this application?"
        description="This marks the application successful and creates an active grant with a reporting schedule. You can adjust the grant details afterwards."
        confirmLabel="Create grant"
        onConfirm={() =>
          start(async () => {
            const result = await convertApplicationToGrant(applicationId);
            if (!result.ok) {
              notify(result.message ?? "That conversion was not permitted.", "error");
              return;
            }
            notify("Grant created. Track deliverables, payments and reports from the grant page.");
            if (result.grantId) router.push(`/grants/${result.grantId}`);
            else router.refresh();
          })
        }
      />
    </>
  );
}
