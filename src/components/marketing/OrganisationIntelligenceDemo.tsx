import { Building2, Globe, ShieldQuestion } from "lucide-react";
import { ORG_RESEARCH_SOURCES } from "@/lib/marketing/content";
import {
  AppFrame,
  PreviewCaption,
  Section,
  SectionHeader,
  StatusChip,
} from "@/components/marketing/primitives";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * Organisation Intelligence — shown as product vision, labelled as such.
 *
 * The extraction core behind this is real and tested: JSON-LD, OpenGraph and
 * labelled-pattern extraction with per-fact locators, authority ordering,
 * conflict detection, prompt-injection neutralisation and a rule that
 * confidence never promotes a fact to verified. What does not exist yet is the
 * crawler behind the `PageFetcher` port and this review UI, so the whole
 * section carries a single `Coming to onboarding` chip.
 *
 * The four-way outcome split is the honest part and the reason the section
 * earns its place: `could not be established publicly` is reported as its own
 * state rather than folded into `missing`. A profile that quietly turns an
 * absence into a gap in your organisation is worse than one that says the
 * internet simply does not have the answer.
 */
export function OrganisationIntelligenceDemo() {
  return (
    <Section id="organisation">
      <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-16">
        <div>
          <SectionHeader
            id="organisation"
            eyebrow="Organisation intelligence"
            title="Start with your organisation. Pegasus does the homework."
            lead="Every funding decision, application and report rests on the same handful of facts about who you are, who you serve and what you have already done. Today your team types them in. The plan is that Pegasus reads what is already public and brings it to you for confirmation."
            status="planned"
          />

          <div className="mt-8 flex flex-col gap-4">
            <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
              The extraction core is built and tested — structured data and labelled
              patterns are read with a locator for every fact, sources are ranked by
              authority, contradictions between two pages are raised rather than
              silently resolved, and a registration number is never inferred from a
              bare six-digit string.
            </p>
            <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
              The crawler and this review screen are not built. Confidence never
              promotes a fact: an extraction at 0.98 confidence is still
              &ldquo;AI extracted&rdquo; until a person confirms it.
            </p>
          </div>
        </div>

        <Reveal>
          <AppFrame path="/onboarding" label="Concept">
            <div className="p-5 sm:p-6">
              {/* Input */}
              <div className="rounded-lg border border-line bg-paper p-4">
                <div className="flex flex-col gap-3">
                  <Field
                    icon={Building2}
                    label="Organisation"
                    value="Northstar Community Foundation"
                  />
                  <Field icon={Globe} label="Website" value="northstarcf.org.uk" />
                  <Field
                    icon={ShieldQuestion}
                    label="Registration number"
                    value="1184023"
                  />
                </div>
                <div className="mt-4 inline-flex items-center rounded-full border border-blue/45 bg-blue px-4 py-2 text-[0.8125rem] font-medium text-white shadow-brand-blue">
                  Build my organisation profile
                </div>
              </div>

              {/* Research progress */}
              <div className="mt-4 rounded-lg border border-line bg-paper p-4">
                <div className="eyebrow">Reading public sources</div>
                <ul className="mt-3 flex flex-col gap-2">
                  {ORG_RESEARCH_SOURCES.map((source) => (
                    <li key={source.label} className="flex items-center gap-3">
                      <span
                        className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">
                        {source.label}
                      </span>
                      <span className="flex-shrink-0 rounded-full border border-line bg-surface px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.08em] text-ink-subtle">
                        {source.authority}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Outcome */}
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <Outcome value="92" label="facts discovered" />
                <Outcome value="74" label="verified from authoritative sources" tone="success" />
                <Outcome value="11" label="need your confirmation" tone="warning" />
                <Outcome value="7" label="not established publicly" tone="muted" />
              </div>

              <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-subtle">
                &ldquo;Not established publicly&rdquo; is its own outcome, separate
                from &ldquo;missing&rdquo;. Pegasus does not turn the absence of a
                published fact into a gap in your organisation.
              </p>
            </div>
          </AppFrame>
        </Reveal>
      </div>

      <PreviewCaption>
        <StatusChip status="planned" className="mr-2 align-middle" />
        An illustration of the designed onboarding flow, not a screen you can open
        today. The figures shown are illustrative of the four-way outcome split, not a
        measurement of any organisation.
      </PreviewCaption>
    </Section>
  );
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="mb-1 text-[0.7rem] font-medium text-ink-muted">{label}</div>
      <div className="flex items-center gap-2.5 rounded-md border border-line bg-surface px-3 py-2">
        <Icon className="h-3.5 w-3.5 flex-shrink-0 text-ink-subtle" aria-hidden />
        <span className="min-w-0 truncate text-[0.8125rem] text-ink">{value}</span>
      </div>
    </div>
  );
}

function Outcome({
  value,
  label,
  tone = "neutral",
}: {
  value: string;
  label: string;
  tone?: "neutral" | "success" | "warning" | "muted";
}) {
  const colour =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "muted"
          ? "text-ink-subtle"
          : "text-ink";
  return (
    <div className="rounded-lg border border-line bg-paper px-3 py-2.5">
      <div className={`font-heading text-[1.4rem] font-semibold leading-none ${colour}`}>
        {value}
      </div>
      <div className="mt-1 text-[0.7rem] leading-snug text-ink-muted">{label}</div>
    </div>
  );
}
