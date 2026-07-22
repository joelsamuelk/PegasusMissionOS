"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/shared/ui";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production this would be reported to an error service.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-critical-soft text-critical">
        <TriangleAlert className="h-6 w-6" />
      </span>
      <h1 className="text-heading font-semibold text-ink">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        This view could not be loaded. You can try again. If the problem continues, return to
        the Command Centre.
      </p>
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="secondary" onClick={() => (window.location.href = "/dashboard")}>
          Go to Command Centre
        </Button>
      </div>
    </div>
  );
}
