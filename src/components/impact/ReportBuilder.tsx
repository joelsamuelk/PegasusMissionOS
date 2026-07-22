"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  FileDown,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import type {
  AIProvenance,
  EvidenceItem,
  ImpactReport,
  Indicator,
} from "@/types/domain";
import { indicatorProgress } from "@/lib/logic/progress";
import { generateReportSection } from "@/server/actions/ai";
import { saveReportSection, setReportStatus } from "@/server/actions/mutations";
import { Button } from "@/components/shared/ui";
import { EntityStatusBadge } from "@/components/shared/StatusBadge";
import { ProgressMeter } from "@/components/shared/misc";
import { ProvenanceButton } from "@/components/ai/ProvenanceDrawer";
import { useToast } from "@/components/shared/Toast";

interface SectionState {
  key: string;
  title: string;
  content: string;
  provenance?: AIProvenance;
}

/**
 * Impact report builder. Generates a first draft per section from real
 * programme and indicator data, keeps every section editable, and never claims
 * impact the data does not support. Export uses the browser's print to PDF.
 */
export function ReportBuilder({
  report,
  indicators,
  evidence,
}: {
  report: ImpactReport;
  indicators: Indicator[];
  evidence: EvidenceItem[];
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [sections, setSections] = useState<SectionState[]>(
    report.sections.map((s) => ({
      key: s.key,
      title: s.title,
      content: s.content,
      provenance: s.provenance,
    })),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function updateContent(key: string, content: string) {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, content } : s)));
  }

  function persist(key: string, content: string, provenance?: AIProvenance) {
    start(async () => {
      await saveReportSection(report.id, key, content, provenance);
    });
  }

  async function generate(key: string) {
    setBusy(key);
    const res = await generateReportSection(report.id, key);
    setBusy(null);
    if (!res.ok) {
      notify(res.error ?? "Generation failed", "error");
      return;
    }
    setSections((prev) =>
      prev.map((s) =>
        s.key === key ? { ...s, content: res.text, provenance: res.provenance } : s,
      ),
    );
    persist(key, res.text, res.provenance);
    notify("Draft generated. Review and edit before sharing.");
  }

  function generateAll() {
    start(async () => {
      for (const s of sections) {
        setBusy(s.key);
        const res = await generateReportSection(report.id, s.key);
        if (res.ok) {
          setSections((prev) =>
            prev.map((x) =>
              x.key === s.key ? { ...x, content: res.text, provenance: res.provenance } : x,
            ),
          );
          await saveReportSection(report.id, s.key, res.text, res.provenance);
        }
      }
      setBusy(null);
      notify("First draft generated for all sections.");
      router.refresh();
    });
  }

  function approve() {
    start(async () => {
      await setReportStatus(report.id, "approved");
      notify("Report approved.");
      router.refresh();
    });
  }

  return (
    <div>
      {/* Action bar */}
      <div className="mb-5 flex flex-col gap-3 rounded-md border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-center gap-3">
          <EntityStatusBadge status={report.status} />
          <span className="text-sm text-ink-muted">{report.reportingPeriod}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="accent" onClick={generateAll} disabled={pending || busy !== null}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate first draft
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <FileDown className="h-4 w-4" /> Export to PDF
          </Button>
          {report.status !== "approved" && (
            <Button variant="primary" onClick={approve} disabled={pending}>
              <Check className="h-4 w-4" /> Mark approved
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Sections */}
        <div className="flex flex-col gap-4">
          {sections.map((s) => (
            <div key={s.key} className="surface-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-title font-semibold text-ink">{s.title}</h3>
                <div className="flex items-center gap-2 print:hidden">
                  {s.provenance && <ProvenanceButton provenance={s.provenance} />}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => generate(s.key)}
                    disabled={busy !== null || pending}
                  >
                    {busy === s.key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5" />
                    )}
                    Generate
                  </Button>
                </div>
              </div>
              <textarea
                value={s.content}
                onChange={(e) => updateContent(s.key, e.target.value)}
                onBlur={() => persist(s.key, s.content, s.provenance)}
                rows={s.content ? Math.min(12, Math.max(4, s.content.split("\n").length + 1)) : 3}
                placeholder="Write this section, or generate a draft from your programme data."
                className="w-full resize-y rounded border border-line-strong bg-surface p-3 text-sm leading-relaxed text-ink outline-none focus:shadow-focus print:border-0 print:p-0"
              />
            </div>
          ))}
        </div>

        {/* Included data */}
        <div className="flex flex-col gap-5 print:hidden">
          <div className="surface-card">
            <div className="border-b border-line px-4 py-3">
              <h4 className="text-sm font-semibold text-ink">Included indicators</h4>
            </div>
            <ul className="divide-y divide-line p-1">
              {indicators.map((i) => (
                <li key={i.id} className="px-3 py-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink">{i.name}</span>
                    <span className="text-ink-subtle">
                      {i.currentValue}
                      {i.unit === "%" ? "%" : ` ${i.unit}`}
                    </span>
                  </div>
                  <ProgressMeter className="mt-1.5" value={indicatorProgress(i)} />
                </li>
              ))}
            </ul>
          </div>

          <div className="surface-card">
            <div className="border-b border-line px-4 py-3">
              <h4 className="text-sm font-semibold text-ink">Included evidence</h4>
            </div>
            <ul className="divide-y divide-line">
              {evidence.map((e) => (
                <li key={e.id} className="px-4 py-2.5">
                  <div className="text-sm font-medium text-ink">{e.title}</div>
                  <div className="text-xs text-ink-subtle">
                    {e.statValue ? `${e.statValue} ${e.statLabel ?? ""}` : e.type.replace(/_/g, " ")}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="rounded-md border border-info/25 bg-info-soft px-3 py-2.5 text-xs text-info">
            The assistant only reports what your indicators and approved evidence show. Where
            evidence is missing, it says so rather than inventing figures or quotes.
          </p>
        </div>
      </div>
    </div>
  );
}
