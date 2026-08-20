import { assessSpam, validateSubmission } from "@/lib/forms";
import type { FormField } from "@/types/domain";
import type { PublicFormRepository } from "../../types";
import type { Row } from "../mapping";
import type { Deps, Query } from "../query";
import { mapField, mapForm, mapVersion } from "./forms";

/**
 * The public form path. The only unauthenticated surface in the product.
 *
 * There is no `RequestContext` here and there cannot be: a member of the
 * public has no session, no organisation and no role. So the scoping comes
 * from the database. Migration 0029 gives the `anon` role read access to
 * forms that are `public`, `open` and serving a published version, and to
 * nothing else -- not submissions, not answers, not the organisation.
 *
 * Writes do not go through this client's insert at all. `public_form_submit`
 * is a `security definer` function that resolves the form from the slug
 * itself and takes each answer's label, type and **sensitivity** from the
 * field definition rather than the payload, so a caller cannot mark special
 * category data as routine. Validation stays here, where the field types and
 * the conditional logic live; the function decides what may be written at all.
 */
export function createPublicFormRepository(q: Query, _deps: Deps): PublicFormRepository {
  async function selectAll(table: string, match: Record<string, unknown>): Promise<Row[]> {
    let query = (await q.client()).from(table).select("*");
    for (const [column, value] of Object.entries(match)) {
      query = query.eq(column, value);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    return (data ?? []) as unknown as Row[];
  }

  const repository: PublicFormRepository = {
    async resolveBySlug(slug) {
      // The same conditions the RLS policy applies. Restated because an
      // authenticated member also reaches this path, and for them the policy
      // is the permissive member one -- so without these the preview of a
      // draft form would work for staff and 404 for everybody else.
      const forms = await selectAll("forms", { slug, access: "public", status: "open" });
      const formRow = forms.find((row) => !row.archived_at && row.current_version_id);
      if (!formRow) return null;

      const versions = await selectAll("form_versions", {
        id: String(formRow.current_version_id),
        organisation_id: String(formRow.organisation_id),
        status: "published",
      });
      const versionRow = versions[0];
      return versionRow ? { form: mapForm(formRow), version: mapVersion(versionRow) } : null;
    },

    async fields(slug) {
      const resolved = await repository.resolveBySlug(slug);
      if (!resolved) return [];
      const rows = await selectAll("form_fields", {
        version_id: resolved.version.id,
        organisation_id: resolved.form.organisationId,
      });
      return rows
        .map(mapField)
        .sort((a: FormField, b: FormField) => a.order - b.order);
    },

    async submit(slug, init) {
      const resolved = await repository.resolveBySlug(slug);
      if (!resolved) return { ok: false, message: "That form is not available." };

      const fields = await repository.fields(slug);
      const now = new Date();
      const problems = validateSubmission({ fields, values: init.values, now });
      if (problems.length > 0) return { ok: false, problems };

      const spam = assessSpam({
        fields,
        values: init.values,
        honeypotValue: init.honeypotValue,
        secondsOnPage: init.secondsOnPage,
      });

      const answers = Object.entries(init.values)
        .filter(([, value]) => value !== undefined)
        .map(([fieldKey, value]) => ({ fieldKey, value }));

      const { data, error } = await (await q.client()).rpc("public_form_submit", {
        p_slug: slug,
        // Suspected spam is stored and flagged, never discarded. A false
        // positive costs a person who needed help; a false negative costs
        // somebody thirty seconds.
        p_status: spam.suspected ? "spam" : "awaiting_review",
        p_source_token: init.sourceToken ?? null,
        p_answers: answers,
      });
      if (error) throw new Error(`Could not record the submission: ${error.message}`);
      if (!data) return { ok: false, message: "That form is not available." };

      return { ok: true, submissionId: String(data), spamScore: spam.score };
    },
  };

  return repository;
}
