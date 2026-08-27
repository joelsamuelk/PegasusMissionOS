"use client";

import { useState, useTransition } from "react";
import { Eye, Loader2 } from "lucide-react";
import type { ProjectedRecord } from "@/types/domain";
import { previewPortal } from "@/server/actions/portals";
import { Button, Card, CardBody, Pill } from "@/components/shared/ui";

/**
 * See exactly what a portal user sees.
 *
 * Not a debugging tool. An organisation cannot govern a sharing decision it
 * cannot inspect, and "what does this funder actually see?" should take one
 * click rather than signing in as somebody else. It runs the real access and
 * projection path, so anything shown here is genuinely what the portal serves.
 */
export function PortalPreview({ slug, email }: { slug: string; email: string }) {
  const [records, setRecords] = useState<ProjectedRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await previewPortal(slug, email);
            if (!result.ok) setError(result.error ?? "Could not preview.");
            else {
              setError(null);
              setRecords(result.records ?? []);
            }
          })
        }
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
        See exactly what they see
      </Button>

      {error && <p className="text-xs text-critical">{error}</p>}

      {records && (
        <Card>
          <CardBody className="space-y-4">
            <p className="eyebrow">
              {records.length} record{records.length === 1 ? "" : "s"} visible to {email}
            </p>
            {records.length === 0 && (
              <p className="text-sm text-ink-muted">
                Nothing. Either nothing has been shared, or access has been revoked.
              </p>
            )}
            {records.map((record) => (
              <div key={`${record.entity.type}:${record.entity.id}`}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Pill>{record.entity.type.replace(/_/g, " ")}</Pill>
                  <span className="text-xs text-ink-subtle">{record.viewKey}</span>
                </div>
                <dl className="space-y-0.5">
                  {record.fields.map((field) => (
                    <div key={field.name} className="flex gap-2 text-sm">
                      <dt className="min-w-32 text-ink-subtle">{field.label}</dt>
                      <dd className="text-ink">{field.value}</dd>
                    </div>
                  ))}
                </dl>
                {record.withheld.length > 0 && (
                  <p className="mt-1 text-xs text-ink-subtle">
                    Not shown: {record.withheld.join(", ")}.
                    {record.withheldNote ? ` ${record.withheldNote}` : ""}
                  </p>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
