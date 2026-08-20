import type { Claim, ImpactReport } from "@/types/domain";
import { buildReportExport, type ReportExportDocument } from "./index";

/**
 * Rendering, behind a port.
 *
 * The build spec's provider-independence rule applies here as much as it does
 * to email and AI: *do not couple the report domain to a rendering
 * implementation*. So a renderer takes a `ReportExportDocument` — already
 * neutral, already carrying every claim and source — and returns bytes or
 * text. It never touches the domain model, never reads a repository, and
 * never decides what a report says.
 *
 * Three renderers ship: HTML, Markdown and plain text. All three are pure
 * functions with no dependencies, which is why they can ship.
 *
 * **PDF and DOCX do not ship, and are not stubbed to return something
 * plausible.** Both need a binary library; declaring the port and refusing
 * clearly is honest, and returning an HTML file with a `.pdf` name is the kind
 * of thing that is discovered by a funder rather than by a test. `renderReport`
 * throws `RendererUnavailableError` for an unregistered format, naming what
 * would be needed.
 */

export type ReportFormat = "html" | "markdown" | "text" | "pdf" | "docx";

export interface RenderedReport {
  format: ReportFormat;
  /** Text formats return a string; binary formats return bytes. */
  content: string | Uint8Array;
  mediaType: string;
  fileName: string;
}

export interface ReportRenderer {
  readonly format: ReportFormat;
  readonly mediaType: string;
  render(document: ReportExportDocument): RenderedReport;
}

export class RendererUnavailableError extends Error {
  readonly format: ReportFormat;

  constructor(format: ReportFormat, requires: string) {
    super(
      `No renderer is registered for ${format}. It requires ${requires}. ` +
        `Rather than return a differently-formatted file under a ${format} name, ` +
        `Pegasus refuses: a funder discovering the substitution is a worse outcome ` +
        `than an export that did not run.`,
    );
    this.name = "RendererUnavailableError";
    this.format = format;
  }
}

const FORMAT_REQUIREMENTS: Record<ReportFormat, string> = {
  html: "nothing",
  markdown: "nothing",
  text: "nothing",
  pdf: "a PDF generation library behind a server-side port",
  docx: "an OOXML writer behind a server-side port",
};

function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "report"
  );
}

/**
 * Sections in order, with their citations rendered alongside.
 *
 * Citations are rendered *with* the section rather than collected into an
 * endnote, because a figure whose source is forty lines below it is a figure
 * most readers will take on trust.
 */
export const markdownRenderer: ReportRenderer = {
  format: "markdown",
  mediaType: "text/markdown",
  render(document) {
    const lines: string[] = [
      `# ${document.title}`,
      "",
      `**Reporting period:** ${document.reportingPeriod}  `,
      `**Status:** ${document.status.replace(/_/g, " ")}  `,
      `**Generated:** ${document.generatedAt}`,
      "",
    ];

    for (const section of document.sections) {
      lines.push(`## ${section.title}`, "");
      lines.push(section.content.trim() || "_This section has not been drafted._", "");
      if (section.claims.length > 0) {
        lines.push("**Figures cited in this section**", "");
        for (const claim of section.claims) {
          const sources = claim.sources
            .map((source) => `${source.ref.type}:${source.ref.id} (${source.authority})`)
            .join("; ");
          lines.push(`- ${claim.text}${sources ? ` (source: ${sources})` : ""}`);
        }
        lines.push("");
      }
    }

    return {
      format: "markdown",
      content: lines.join("\n"),
      mediaType: "text/markdown",
      fileName: `${slug(document.title)}.md`,
    };
  },
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const htmlRenderer: ReportRenderer = {
  format: "html",
  mediaType: "text/html",
  render(document) {
    const sections = document.sections
      .map((section) => {
        const body = section.content.trim()
          ? section.content
              .split(/\n{2,}/)
              .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
              .join("\n")
          : `<p class="undrafted">This section has not been drafted.</p>`;
        const citations = section.claims.length
          ? `<aside class="citations"><h3>Figures cited</h3><ul>${section.claims
              .map(
                (claim) =>
                  `<li>${escapeHtml(claim.text)}${
                    claim.sources.length
                      ? ` <span class="source">${escapeHtml(
                          claim.sources
                            .map((source) => `${source.ref.type}:${source.ref.id}`)
                            .join("; "),
                        )}</span>`
                      : ""
                  }</li>`,
              )
              .join("")}</ul></aside>`
          : "";
        return `<section><h2>${escapeHtml(section.title)}</h2>${body}${citations}</section>`;
      })
      .join("\n");

    return {
      format: "html",
      content: `<article class="pegasus-report"><header><h1>${escapeHtml(
        document.title,
      )}</h1><p class="meta">${escapeHtml(document.reportingPeriod)} · ${escapeHtml(
        document.status.replace(/_/g, " "),
      )} · generated ${escapeHtml(document.generatedAt)}</p></header>${sections}</article>`,
      mediaType: "text/html",
      fileName: `${slug(document.title)}.html`,
    };
  },
};

export const textRenderer: ReportRenderer = {
  format: "text",
  mediaType: "text/plain",
  render(document) {
    const lines: string[] = [
      document.title.toUpperCase(),
      `${document.reportingPeriod} | ${document.status.replace(/_/g, " ")} | ${document.generatedAt}`,
      "",
    ];
    for (const section of document.sections) {
      lines.push(section.title, "-".repeat(section.title.length));
      lines.push(section.content.trim() || "[not drafted]", "");
      for (const claim of section.claims) lines.push(`  cited: ${claim.text}`);
      if (section.claims.length) lines.push("");
    }
    return {
      format: "text",
      content: lines.join("\n"),
      mediaType: "text/plain",
      fileName: `${slug(document.title)}.txt`,
    };
  },
};

const RENDERERS = new Map<ReportFormat, ReportRenderer>([
  ["markdown", markdownRenderer],
  ["html", htmlRenderer],
  ["text", textRenderer],
]);

export function availableFormats(): ReportFormat[] {
  return [...RENDERERS.keys()];
}

/** Register a renderer, e.g. a PDF adapter supplied by the server runtime. */
export function registerRenderer(renderer: ReportRenderer): void {
  RENDERERS.set(renderer.format, renderer);
}

export function renderReport(
  report: ImpactReport,
  claims: Claim[],
  format: ReportFormat,
  generatedAt: Date,
): RenderedReport {
  const renderer = RENDERERS.get(format);
  if (!renderer) throw new RendererUnavailableError(format, FORMAT_REQUIREMENTS[format]);
  return renderer.render(buildReportExport(report, claims, generatedAt));
}
