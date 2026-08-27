import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionTitle } from "@/components/shared/ui";
import { EmptyState } from "@/components/shared/misc";
import { Inbox } from "lucide-react";
import { SubmissionReview } from "@/components/forms/SubmissionReview";
import { loadSubmission } from "@/server/actions/forms";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ctx = await resolveRequestContext();
  const form = await getRepository().forms.get(ctx, id);
  return { title: form?.name ?? "Form" };
}

/**
 * One form and its responses.
 *
 * Every response is shown with what it would change, whether or not anybody
 * has reviewed it, because the interesting question about a submission is
 * never "what did they say" on its own.
 */
export default async function FormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await resolveRequestContext();
  const repo = getRepository();

  const form = await repo.forms.get(ctx, id);
  if (!form) notFound();

  const submissions = await repo.forms.submissions(ctx, id);
  const details = await Promise.all(
    submissions.slice(0, 20).map((submission) => loadSubmission(submission.id)),
  );

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Forms", href: "/forms" }, { label: form.name }]}
        eyebrow={form.purpose.replace(/_/g, " ")}
        title={form.name}
        description={form.description}
      />

      <SectionTitle>Responses</SectionTitle>
      {details.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No responses yet"
          description="Responses appear here with what each one would change, before anything changes."
        />
      ) : (
        <div className="space-y-4">
          {details.map((result) =>
            result.ok && result.detail ? (
              <SubmissionReview key={result.detail.submission.id} detail={result.detail} />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
