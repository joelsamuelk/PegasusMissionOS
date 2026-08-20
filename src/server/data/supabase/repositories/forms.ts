import {
  answersDueForErasure,
  assessSpam,
  checkPublishable,
  retainUntil,
  validateSubmission,
} from "@/lib/forms";
import { can } from "@/lib/permissions";
import type {
  ClaimValue,
  ConsentRecord,
  ConsentState,
  EntityReference,
  FieldValidation,
  Form,
  FormField,
  FormFieldOption,
  FormMapping,
  FormSection,
  FormSubmission,
  FormVersion,
  SubmissionAnswer,
} from "@/types/domain";
import type { FormRepository } from "../../types";
import { auditFrom, numberFrom, optionalNumberFrom, type Row } from "../mapping";
import type { Deps, Query } from "../query";

export function mapForm(row: Row): Form {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    name: String(row.name),
    purpose: row.purpose as Form["purpose"],
    ...(row.description ? { description: String(row.description) } : {}),
    ...(row.subject_type && row.subject_id
      ? {
          subject: {
            type: row.subject_type as EntityReference["type"],
            id: String(row.subject_id),
          },
        }
      : {}),
    ...(row.current_version_id ? { currentVersionId: String(row.current_version_id) } : {}),
    access: row.access as Form["access"],
    ...(row.slug ? { slug: String(row.slug) } : {}),
    status: row.status as Form["status"],
    // Shown after submission. Never generated.
    ...(row.confirmation_message
      ? { confirmationMessage: String(row.confirmation_message) }
      : {}),
    // A form that cannot say why it is entitled to ask is a form that should
    // not be asking, which is why this gates publication rather than sitting
    // in settings.
    ...(row.lawful_basis ? { lawfulBasis: row.lawful_basis as ConsentState } : {}),
    ...(row.retention_days != null
      ? { retentionDays: optionalNumberFrom(row.retention_days) }
      : {}),
    ...(row.rate_limit_per_hour != null
      ? { rateLimitPerHour: optionalNumberFrom(row.rate_limit_per_hour) }
      : {}),
    audit: auditFrom(row),
  };
}

export function mapVersion(row: Row): FormVersion {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    formId: String(row.form_id),
    versionNumber: numberFrom(row.version_number),
    status: row.status as FormVersion["status"],
    sections: (row.sections ?? []) as FormSection[],
    ...(row.published_at ? { publishedAt: String(row.published_at) } : {}),
    ...(row.published_by ? { publishedBy: String(row.published_by) } : {}),
    ...(row.retired_at ? { retiredAt: String(row.retired_at) } : {}),
    audit: auditFrom(row),
  };
}

export function mapField(row: Row): FormField {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    versionId: String(row.version_id),
    sectionKey: String(row.section_key),
    key: String(row.key),
    label: String(row.label),
    ...(row.help ? { help: String(row.help) } : {}),
    type: row.type as FormField["type"],
    required: Boolean(row.required),
    order: numberFrom(row.order),
    ...(row.options ? { options: row.options as FormFieldOption[] } : {}),
    ...(row.validation ? { validation: row.validation as FieldValidation } : {}),
    // Required on every field. There is no default and no unclassified state,
    // which is why the column is not nullable.
    sensitivity: row.sensitivity as FormField["sensitivity"],
    // The same typed condition tree the automation engine uses. A second
    // condition language would be a second thing to get wrong.
    ...(row.visible_when ? { visibleWhen: row.visible_when } : {}),
    ...(row.required_when ? { requiredWhen: row.required_when } : {}),
    ...(row.consent_purpose ? { consentPurpose: String(row.consent_purpose) } : {}),
  };
}

function mapMapping(row: Row): FormMapping {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    formId: String(row.form_id),
    fieldKey: String(row.field_key),
    target: row.target as FormMapping["target"],
    ...(row.predicate ? { predicate: String(row.predicate) } : {}),
    ...(row.target_type && row.target_id
      ? {
          targetRef: {
            type: row.target_type as EntityReference["type"],
            id: String(row.target_id),
          },
        }
      : {}),
    // A form answer is an assertion by whoever filled it in, and an assertion
    // is not the same as a correction.
    requiresReview: Boolean(row.requires_review),
    audit: auditFrom(row),
  };
}

export function mapSubmission(row: Row): FormSubmission {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    formId: String(row.form_id),
    // The exact version answered. Never the current one.
    versionId: String(row.version_id),
    status: row.status as FormSubmission["status"],
    source: row.source as FormSubmission["source"],
    submittedAt: String(row.submitted_at),
    ...(row.submitted_by ? { submittedBy: String(row.submitted_by) } : {}),
    // Deliberately not an IP address: an IP is personal data under UK GDPR
    // and keeping one for spam control needs its own lawful basis.
    ...(row.source_token ? { sourceToken: String(row.source_token) } : {}),
    ...(row.reviewed_by ? { reviewedBy: String(row.reviewed_by) } : {}),
    ...(row.reviewed_at ? { reviewedAt: String(row.reviewed_at) } : {}),
    ...(row.review_note ? { reviewNote: String(row.review_note) } : {}),
    ...(row.retain_until ? { retainUntil: String(row.retain_until) } : {}),
  };
}

function mapAnswer(row: Row): SubmissionAnswer {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    submissionId: String(row.submission_id),
    fieldKey: String(row.field_key),
    // Denormalised so an answer stays readable when the field is retired.
    fieldLabel: String(row.field_label),
    fieldType: row.field_type as SubmissionAnswer["fieldType"],
    sensitivity: row.sensitivity as SubmissionAnswer["sensitivity"],
    value: row.value as ClaimValue,
    ...(row.redacted != null ? { redacted: Boolean(row.redacted) } : {}),
    ...(row.redacted_at ? { redactedAt: String(row.redacted_at) } : {}),
  };
}

function mapConsent(row: Row): ConsentRecord {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    submissionId: String(row.submission_id),
    fieldKey: String(row.field_key),
    // Verbatim from the version answered, so the wording somebody actually
    // agreed to can always be recovered.
    purpose: String(row.purpose),
    granted: Boolean(row.granted),
    recordedAt: String(row.recorded_at),
    versionId: String(row.version_id),
    // Set where consent was later withdrawn. Never deleted.
    ...(row.withdrawn_at ? { withdrawnAt: String(row.withdrawn_at) } : {}),
  };
}

export function createFormRepository(q: Query, deps: Deps): FormRepository {
  type Ctx = Parameters<FormRepository["list"]>[0];

  async function fieldsFor(ctx: Ctx, versionId: string): Promise<FormField[]> {
    const rows = await q.many(ctx, "form_fields", { version_id: versionId }, {
      order: { column: "order" },
    });
    return rows.map(mapField);
  }

  return {
    async list(ctx) {
      const rows = await q.many(ctx, "forms", {}, { liveOnly: true });
      return rows.map(mapForm);
    },

    async get(ctx, id) {
      const row = await q.maybeOne(ctx, "forms", { id });
      return row ? mapForm(row) : null;
    },

    async getBySlug(ctx, slug) {
      const row = await q.maybeOne(ctx, "forms", { slug, status: "open" });
      return row ? mapForm(row) : null;
    },

    async versions(ctx, formId) {
      const rows = await q.many(ctx, "form_versions", { form_id: formId }, {
        order: { column: "version_number" },
      });
      return rows.map(mapVersion);
    },

    async getVersion(ctx, versionId) {
      const row = await q.maybeOne(ctx, "form_versions", { id: versionId });
      return row ? mapVersion(row) : null;
    },

    async fields(ctx, versionId) {
      return fieldsFor(ctx, versionId);
    },

    async mappings(ctx, formId) {
      const rows = await q.many(ctx, "form_mappings", { form_id: formId });
      return rows.map(mapMapping);
    },

    async saveDraft(ctx, input) {
      const formColumns = {
        name: input.form.name,
        purpose: input.form.purpose,
        description: input.form.description,
        subjectType: input.form.subject?.type,
        subjectId: input.form.subject?.id,
        access: input.form.access,
        slug: input.form.slug,
        status: input.form.status,
        confirmationMessage: input.form.confirmationMessage,
        lawfulBasis: input.form.lawfulBasis,
        retentionDays: input.form.retentionDays,
        rateLimitPerHour: input.form.rateLimitPerHour,
      };

      let formId = input.form.id;
      const existing = formId ? await q.maybeOne(ctx, "forms", { id: formId }) : null;
      if (existing && formId) {
        await q.update(ctx, "forms", formId, formColumns);
      } else {
        const row = await q.insert(ctx, "forms", {
          ...(formId ? { id: formId } : {}),
          ...formColumns,
        });
        formId = String(row.id);
      }

      // A new draft version every time, never an edit to a published one.
      // Editing a published version would make every submission that answered
      // it unreadable.
      const previous = await q.many(ctx, "form_versions", { form_id: formId });
      const versionRow = await q.insert(
        ctx,
        "form_versions",
        {
          formId,
          versionNumber: previous.length + 1,
          status: "draft",
          sections: input.sections,
        },
        { audit: false },
      );
      const versionId = String(versionRow.id);

      for (const field of input.fields) {
        await q.insert(
          ctx,
          "form_fields",
          {
            versionId,
            sectionKey: field.sectionKey,
            key: field.key,
            label: field.label,
            help: field.help,
            type: field.type,
            required: field.required,
            order: field.order,
            options: field.options,
            validation: field.validation,
            sensitivity: field.sensitivity,
            visibleWhen: field.visibleWhen,
            requiredWhen: field.requiredWhen,
            consentPurpose: field.consentPurpose,
          },
          { audit: false },
        );
      }

      // Mappings belong to the form rather than the version, so a redraft
      // replaces them rather than accumulating a set per version.
      await q.remove(ctx, "form_mappings", { form_id: formId });
      for (const mapping of input.mappings) {
        await q.insert(
          ctx,
          "form_mappings",
          {
            formId,
            fieldKey: mapping.fieldKey,
            target: mapping.target,
            predicate: mapping.predicate,
            targetType: mapping.targetRef?.type,
            targetId: mapping.targetRef?.id,
            requiresReview: mapping.requiresReview,
          },
          { audit: false },
        );
      }

      return { formId: String(formId), versionId };
    },

    async publish(ctx, versionId) {
      const versionRow = await q.maybeOne(ctx, "form_versions", { id: versionId });
      if (!versionRow) {
        return { ok: false, problems: [{ code: "not_found", message: "No such version." }] };
      }
      const formRow = await q.maybeOne(ctx, "forms", { id: String(versionRow.form_id) });
      if (!formRow) {
        return { ok: false, problems: [{ code: "not_found", message: "No such form." }] };
      }
      const form = mapForm(formRow);
      const version = mapVersion(versionRow);

      // The refusals are not warnings. A form collecting special category data
      // with no lawful basis and no retention period is not a form with a gap
      // in its settings; it is a form that should not exist.
      const problems = checkPublishable(form, await fieldsFor(ctx, versionId));
      if (problems.length > 0) return { ok: false, problems };

      const now = ctx.now().toISOString();
      await q.update(
        ctx,
        "form_versions",
        versionId,
        { status: "published", publishedAt: now, publishedBy: ctx.userId },
        { audit: false },
      );
      await q.update(ctx, "forms", form.id, { currentVersionId: versionId });

      for (const other of await q.many(ctx, "form_versions", { form_id: form.id })) {
        if (String(other.id) === versionId || other.status !== "published") continue;
        await q.update(
          ctx,
          "form_versions",
          String(other.id),
          { status: "retired", retiredAt: now },
          { audit: false },
        );
      }

      await deps.audit.record(ctx, {
        action: "form.published",
        entityType: "task",
        entityId: form.id,
        summary: `Published version ${version.versionNumber} of '${form.name}'`,
      });

      return { ok: true, problems: [] };
    },

    async submit(ctx, init) {
      const formRow = await q.maybeOne(ctx, "forms", { id: init.formId });
      if (!formRow || formRow.status !== "open") {
        return { ok: false, message: "That form is not accepting responses." };
      }
      const form = mapForm(formRow);
      if (!form.currentVersionId) {
        return { ok: false, message: "That form has no published version." };
      }
      const versionId = form.currentVersionId;
      const fields = await fieldsFor(ctx, versionId);

      const now = ctx.now();
      const problems = validateSubmission({ fields, values: init.values, now });
      if (problems.length > 0) return { ok: false, problems };

      const spam = assessSpam({
        fields,
        values: init.values,
        honeypotValue: init.honeypotValue,
        secondsOnPage: init.secondsOnPage,
      });

      const fieldByKey = new Map(fields.map((field) => [field.key, field]));
      const submissionRow = await q.insert(
        ctx,
        "form_submissions",
        {
          formId: form.id,
          versionId,
          // Suspected spam is stored and flagged, never discarded. A false
          // positive costs a person who needed help; a false negative costs
          // somebody thirty seconds.
          status: spam.suspected ? "spam" : "awaiting_review",
          source: init.source,
          submittedAt: now.toISOString(),
          submittedBy: init.source === "internal" ? ctx.userId : undefined,
          sourceToken: init.sourceToken,
          retainUntil: retainUntil(form, now),
        },
        { audit: false },
      );
      const submissionId = String(submissionRow.id);

      for (const [key, value] of Object.entries(init.values)) {
        if (value === undefined) continue;
        const field = fieldByKey.get(key);
        if (!field) continue;
        await q.insert(
          ctx,
          "submission_answers",
          {
            submissionId,
            fieldKey: key,
            fieldLabel: field.label,
            fieldType: field.type,
            // Carried from the field, never decided here. Classifying at write
            // time would let two answers to the same question be classified
            // differently.
            sensitivity: field.sensitivity,
            value,
            redacted: false,
          },
          { audit: false },
        );

        if (field.type === "consent" && value.type === "boolean") {
          await q.insert(
            ctx,
            "consent_records",
            {
              submissionId,
              versionId,
              fieldKey: key,
              purpose: field.consentPurpose ?? field.label,
              granted: value.boolean,
              recordedAt: now.toISOString(),
            },
            { audit: false },
          );
        }
      }

      return { ok: true, submissionId, spamScore: spam.score };
    },

    async submissions(ctx, formId) {
      const rows = await q.many(ctx, "form_submissions", formId ? { form_id: formId } : {}, {
        order: { column: "submitted_at", ascending: false },
      });
      return rows.map(mapSubmission);
    },

    async getSubmission(ctx, id) {
      const row = await q.maybeOne(ctx, "form_submissions", { id });
      return row ? mapSubmission(row) : null;
    },

    async answers(ctx, submissionId) {
      // A role without `beneficiary_data:view` receives the submission without
      // its special category answers, rather than an error. Refusing the whole
      // submission would make an ordinary review impossible; returning the
      // answers would defeat the classification.
      const mayReadSpecial = can(ctx.role, "beneficiary_data:view");
      const rows = await q.many(ctx, "submission_answers", { submission_id: submissionId });
      return rows
        .map(mapAnswer)
        .filter((answer) => mayReadSpecial || answer.sensitivity !== "special_category");
    },

    async consent(ctx, submissionId) {
      const rows = await q.many(ctx, "consent_records", { submission_id: submissionId });
      return rows.map(mapConsent);
    },

    async reviewSubmission(ctx, submissionId, status, note) {
      await q.update(
        ctx,
        "form_submissions",
        submissionId,
        {
          status,
          reviewedBy: ctx.userId,
          reviewedAt: ctx.now().toISOString(),
          // An unexplained rejection is not auditable.
          reviewNote: note,
        },
        { audit: false },
      );
    },

    async withdrawConsent(ctx, consentId) {
      // Withdrawal is recorded, never deleted: the fact that consent was given
      // and later withdrawn is itself the record.
      await q.update(
        ctx,
        "consent_records",
        consentId,
        { withdrawnAt: ctx.now().toISOString() },
        { audit: false },
      );
    },

    async redactExpired(ctx) {
      const submissions = (await q.many(ctx, "form_submissions", {})).map(mapSubmission);
      const due = answersDueForErasure(submissions, ctx.now());
      if (due.length === 0) return { submissions: 0, answers: 0 };

      const rows = await q.whereIn(ctx, "submission_answers", "submission_id", due);
      let erased = 0;
      for (const row of rows) {
        if (row.redacted) continue;
        await q.update(
          ctx,
          "submission_answers",
          String(row.id),
          {
            value: { type: "text", text: "" },
            redacted: true,
            redactedAt: ctx.now().toISOString(),
          },
          { audit: false },
        );
        erased += 1;
      }

      await deps.audit.record(ctx, {
        action: "form.answers.redacted",
        entityType: "task",
        entityId: due[0]!,
        summary: `Erased ${erased} answers across ${due.length} submissions whose retention period expired`,
      });

      // The submission rows stay. "Somebody submitted this on this date and
      // the answers were deleted under our retention policy" is a true and
      // useful statement, and deleting the row would make the erasure itself
      // unprovable.
      return { submissions: due.length, answers: erased };
    },
  };
}
