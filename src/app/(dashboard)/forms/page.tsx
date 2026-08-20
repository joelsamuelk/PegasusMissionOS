import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody, Pill, SectionTitle } from "@/components/shared/ui";
import { EmptyState } from "@/components/shared/misc";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SENSITIVITY_LABELS, peakSensitivity } from "@/lib/forms";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";

export const metadata: Metadata = { title: "Forms" };

/**
 * Forms.
 *
 * The list leads with what each form collects and how sensitive it is, before
 * how many responses it has had. A form is a decision about what an
 * organisation asks people, and the response count is the least important
 * thing about it.
 */
export default async function FormsPage() {
  const ctx = await resolveRequestContext();
  const repo = getRepository();

  const forms = await repo.forms.list(ctx);
  const submissions = await repo.forms.submissions(ctx);

  const detail = await Promise.all(
    forms.map(async (form) => ({
      form,
      fields: form.currentVersionId ? await repo.forms.fields(ctx, form.currentVersionId) : [],
      mappings: await repo.forms.mappings(ctx, form.id),
      responses: submissions.filter((submission) => submission.formId === form.id),
    })),
  );

  const awaiting = submissions.filter((submission) => submission.status === "awaiting_review");

  return (
    <div>
      <PageHeader
        eyebrow="Forms"
        title="What you ask people, and what their answers become"
        description="A submission is not a form record. Every answer is mapped to something in the Mission Graph, or it is reported as going nowhere."
      />

      {awaiting.length > 0 && (
        <section className="mb-8">
          <SectionTitle>Waiting for review</SectionTitle>
          <Card>
            <CardBody>
              <ul className="space-y-2">
                {awaiting.slice(0, 10).map((submission) => {
                  const form = forms.find((candidate) => candidate.id === submission.formId);
                  return (
                    <li key={submission.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <Link
                        href={`/forms/${submission.formId}`}
                        className="text-info hover:underline"
                      >
                        {form?.name ?? "A form"}
                      </Link>
                      <span className="text-xs text-ink-subtle">
                        {submission.source} response, {submission.submittedAt.slice(0, 10)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>Forms</SectionTitle>
        {detail.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No forms yet"
            description="A form collects information once and turns it into records, rather than into a spreadsheet somebody later re-types."
          />
        ) : (
          <div className="space-y-3">
            {detail.map(({ form, fields, mappings, responses }) => {
              const peak = peakSensitivity(fields);
              const unmapped = fields.filter(
                (field) => !mappings.some((mapping) => mapping.fieldKey === field.key),
              );

              return (
                <Card key={form.id}>
                  <CardBody className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <StatusBadge
                            tone={form.status === "open" ? "success" : "neutral"}
                            label={form.status}
                          />
                          <Pill>{form.purpose.replace(/_/g, " ")}</Pill>
                          <Pill>{form.access}</Pill>
                          {peak !== "public" && peak !== "internal" && (
                            <Pill className="border-warning/35 text-warning">
                              <ShieldCheck className="h-3 w-3" />
                              {SENSITIVITY_LABELS[peak]}
                            </Pill>
                          )}
                        </div>
                        <Link
                          href={`/forms/${form.id}`}
                          className="font-heading text-base font-semibold text-ink hover:text-info"
                        >
                          {form.name}
                        </Link>
                        {form.description && (
                          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
                            {form.description}
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-ink-subtle">
                        {responses.length} response{responses.length === 1 ? "" : "s"}
                      </p>
                    </div>

                    <div className="rounded-lg bg-surface-sunken px-3 py-2.5 text-xs text-ink-muted">
                      <p>
                        <span className="eyebrow mr-1.5">Becomes</span>
                        {mappings.length === 0
                          ? "nothing. No answer on this form is mapped, so responses go nowhere."
                          : [...new Set(mappings.map((mapping) => mapping.target))]
                              .map((target) => target.replace(/_/g, " "))
                              .join(", ")}
                      </p>
                      {unmapped.length > 0 && mappings.length > 0 && (
                        <p className="mt-1">
                          {unmapped.length} question{unmapped.length === 1 ? "" : "s"} are asked
                          and mapped to nothing: {unmapped.map((f) => f.label).join(", ")}.
                        </p>
                      )}
                      {form.retentionDays && (
                        <p className="mt-1">
                          Answers are erased {form.retentionDays} days after they arrive.
                        </p>
                      )}
                      {form.lawfulBasis && (
                        <p className="mt-1">
                          Lawful basis: {form.lawfulBasis.basis.replace(/_/g, " ")}
                          {form.lawfulBasis.jurisdiction
                            ? ` (${form.lawfulBasis.jurisdiction})`
                            : ""}
                          .
                        </p>
                      )}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
