import { requireControlCapability } from "@/lib/control-plane/permissions";
import { resolveOrganisationIdentity } from "@/lib/commercial/discovery";
import { createInternalAuditEvent } from "./audit";
import type { ControlRequestContext } from "./context";
import type { ControlRepository } from "./repository";
import { createProspect } from "./prospect-service";
import type { KnownOrganisation } from "./discovery-service";

export interface CsvImportSummary {
  created: number;
  duplicates: number;
  rejected: number;
}

/** RFC 4180 enough for a spreadsheet export: quoted fields, doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  const endField = () => {
    row.push(field.trim());
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  };
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (quoted) {
      if (character !== '"') field += character;
      else if (text[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") endField();
    else if (character === "\n") endRow();
    else if (character !== "\r") field += character;
  }
  endRow();
  return rows;
}

const HEADER_ALIASES: Record<
  string,
  "name" | "website" | "country" | "organisationType"
> = {
  name: "name",
  organisation: "name",
  organization: "name",
  "organisation name": "name",
  website: "website",
  url: "website",
  domain: "website",
  country: "country",
  type: "organisationType",
  "organisation type": "organisationType",
};

/**
 * Import prospects from a CSV upload.
 *
 * The import is deliberately unforgiving in one direction only: a row that
 * cannot become a prospect is counted and skipped rather than aborting the
 * file, but nothing is coerced — a row without a name is not invented.
 */
export async function importProspectCsv(
  ctx: ControlRequestContext,
  repo: ControlRepository,
  text: string,
): Promise<CsvImportSummary> {
  requireControlCapability(ctx.role, "prospect:create");
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header) throw new Error("The CSV file was empty.");
  const columns = header.map((cell) => HEADER_ALIASES[cell.toLowerCase()]);
  if (!columns.includes("name")) throw new Error("The CSV file needs a 'name' column.");

  const existing: KnownOrganisation[] = (await repo.prospects.list(ctx)).map(
    (prospect) => ({
      name: prospect.name,
      website: prospect.website,
      registrationIdentifier: prospect.registrationIdentifier,
    }),
  );
  let created = 0,
    duplicates = 0,
    rejected = 0;
  for (const row of rows) {
    const input: Record<string, string> = {};
    columns.forEach((column, index) => {
      if (column && row[index]) input[column] = row[index]!;
    });
    if (!input.name) {
      rejected++;
      continue;
    }
    if (resolveOrganisationIdentity(input as { name: string }, existing) !== "distinct") {
      duplicates++;
      continue;
    }
    try {
      await createProspect(ctx, repo, {
        name: input.name,
        website: input.website,
        country: input.country,
        organisationType: input.organisationType,
        source: "csv_import",
      });
    } catch {
      rejected++;
      continue;
    }
    existing.push({ name: input.name, website: input.website });
    created++;
  }
  await repo.audit.append(
    ctx,
    createInternalAuditEvent(ctx, {
      action: "prospect.csv_import",
      targetType: "prospect_organisation",
      targetId: "csv_import",
      after: { created, duplicates, rejected, rows: rows.length },
    }),
  );
  return { created, duplicates, rejected };
}
