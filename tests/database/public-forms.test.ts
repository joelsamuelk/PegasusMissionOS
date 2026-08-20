import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asAnon,
  createDatabase,
  dropDatabase,
  expectFailure,
  ORG_A,
  postgresAvailable,
  query,
  run,
  TWO_TENANTS,
} from "./harness";

/**
 * The anonymous surface.
 *
 * The one path in the product where the caller is a member of nothing, and
 * therefore the one place where a mistake is a mistake in public. Everything
 * here is checked as the `anon` role, with no application code in between,
 * because what protects this path is migration 0029 rather than a code review.
 */

const DB = "pegasus_public_forms_test";
const available = postgresAvailable();

const VERSION = "00000000-0000-0000-0000-0000000000c1";
const OPEN_FORM = "00000000-0000-0000-0000-0000000000b1";

const FIXTURES = `
  insert into forms (id, organisation_id, name, purpose, access, slug, status, retention_days)
  values ('${OPEN_FORM}','${ORG_A}','Feedback','feedback','public','feedback','open',30);

  insert into form_versions (id, organisation_id, form_id, version_number, status, sections)
  values ('${VERSION}','${ORG_A}','${OPEN_FORM}',1,'published','[]');
  update forms set current_version_id='${VERSION}' where id='${OPEN_FORM}';

  insert into form_fields
    (organisation_id, version_id, section_key, key, label, type, required, "order", sensitivity, consent_purpose)
  values
    ('${ORG_A}','${VERSION}','s1','health','Health conditions','textarea',false,1,'special_category',null),
    ('${ORG_A}','${VERSION}','s1','ok','Agree','consent',false,2,'internal','We may contact you about this');

  -- Neither of these was put on the internet by anybody.
  insert into forms (id, organisation_id, name, purpose, access, slug, status)
  values ('00000000-0000-0000-0000-0000000000b2','${ORG_A}','Draft','feedback','public','draft-form','draft'),
         ('00000000-0000-0000-0000-0000000000b3','${ORG_A}','Closed','feedback','public','closed-form','closed'),
         ('00000000-0000-0000-0000-0000000000b4','${ORG_A}','Internal','feedback','internal','internal-form','open');
`;

describe.skipIf(!available)("the public form surface", () => {
  beforeAll(() => {
    createDatabase(DB);
    run(DB, TWO_TENANTS);
    run(DB, FIXTURES);
  }, 180_000);

  afterAll(() => dropDatabase(DB));

  it("shows only the form somebody deliberately published", () => {
    const rows = query(DB, asAnon("select slug from forms order by slug;"));
    expect(rows.map((r) => r[0])).toEqual(["feedback"]);
  });

  it("shows that form's fields", () => {
    const rows = query(DB, asAnon("select key from form_fields order by key;"));
    expect(rows.map((r) => r[0])).toEqual(["health", "ok"]);
  });

  it("shows no submissions, answers, consent or organisations", () => {
    // A respondent may write an answer and may never read one back, including
    // their own -- there is no way to prove who they are, so "their own" is not
    // a set this database can compute.
    for (const table of [
      "form_submissions",
      "submission_answers",
      "consent_records",
      "organisations",
      "people",
      "grants",
    ]) {
      const rows = query(DB, asAnon(`select count(*) from ${table};`));
      expect(rows[0]?.[0], `${table} was visible to anon`).toBe("0");
    }
  });

  it("accepts a submission to the published form", () => {
    const rows = query(
      DB,
      asAnon(
        `select public_form_submit('feedback','awaiting_review','token',
           '[{"fieldKey":"health","value":{"type":"text","text":"detail"}}]'::jsonb) is not null;`,
      ),
    );
    expect(rows[0]?.[0]).toBe("t");
  });

  it("refuses a submission to a draft, closed or internal form", () => {
    for (const slug of ["draft-form", "closed-form", "internal-form"]) {
      const rows = query(
        DB,
        asAnon(
          `select coalesce(public_form_submit('${slug}','awaiting_review',null,'[]'::jsonb)::text,'refused');`,
        ),
      );
      expect(rows[0]?.[0], `${slug} accepted a submission`).toBe("refused");
    }
  });

  it("refuses to create a submission in any state a person has decided", () => {
    // Nothing reached from the internet may write an accepted submission,
    // because an accepted submission is one somebody reviewed.
    for (const status of ["accepted", "rejected", "received"]) {
      const error = expectFailure(
        DB,
        asAnon(`select public_form_submit('feedback','${status}',null,'[]'::jsonb);`),
      );
      expect(error).toMatch(/may not be created as/);
    }
  });

  // The next three tests share one committed submission. Every other test in
  // this file rolls back, so this is the only state that outlives its own
  // `it`, and reordering them breaks the two that read it.
  it("classifies answers from the field definition, not the payload", () => {
    // The submission below claims its health answer is `public`. The stored
    // row must say `special_category`, because the field does. This is the
    // property that makes the definer function safer than an insert policy:
    // the caller never gets to state the classification.
    run(
      DB,
      asAnon(
        `select public_form_submit('feedback','awaiting_review','token',
           '[{"fieldKey":"health","value":{"type":"text","text":"detail"},"sensitivity":"public"},
             {"fieldKey":"ok","value":{"type":"boolean","boolean":true}}]'::jsonb);`,
      ).replace("rollback;", "commit;"),
    );
    const rows = query(
      DB,
      "select field_key, sensitivity from submission_answers order by field_key;",
    );
    expect(rows).toEqual([
      ["health", "special_category"],
      ["ok", "internal"],
    ]);
  });

  it("records consent with the wording from the version answered", () => {
    const rows = query(DB, "select granted, purpose from consent_records;");
    expect(rows[0]).toEqual(["t", "We may contact you about this"]);
  });

  it("stamps the retention date from the form's own policy", () => {
    const rows = query(
      DB,
      "select status, source, retain_until is not null from form_submissions;",
    );
    expect(rows[0]).toEqual(["awaiting_review", "public", "t"]);
  });

  it("drops an answer to a field the version does not have", () => {
    // There is nothing to label it with and nothing to classify it by, so it
    // is dropped rather than stored unclassified.
    const before = query(DB, "select count(*) from submission_answers;")[0]?.[0];
    run(
      DB,
      asAnon(
        `select public_form_submit('feedback','awaiting_review',null,
           '[{"fieldKey":"not_a_field","value":{"type":"text","text":"x"}}]'::jsonb);`,
      ).replace("rollback;", "commit;"),
    );
    const after = query(DB, "select count(*) from submission_answers;")[0]?.[0];
    expect(after).toBe(before);
  });

  it("refuses a direct insert, so the function is the only way in", () => {
    const error = expectFailure(
      DB,
      asAnon(
        `insert into form_submissions (organisation_id, form_id, version_id, status, source, submitted_at)
         values ('${ORG_A}','${OPEN_FORM}','${VERSION}','accepted','public', now());`,
      ),
    );
    expect(error).toMatch(/row-level security|permission denied/i);
  });
});
