"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Save } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button, ButtonLink } from "@/components/shared/ui";
import { ProgressMeter } from "@/components/shared/misc";
import { useToast } from "@/components/shared/Toast";

interface Field {
  label: string;
  value: string;
  type?: "text" | "textarea";
}

interface Step {
  eyebrow: string;
  title: string;
  description: string;
  fields: Field[];
}

const STEPS: Step[] = [
  {
    eyebrow: "Step 1 of 8",
    title: "Organisation identity",
    description: "Tell us who you are. This anchors your workspace and funding fit.",
    fields: [
      { label: "Organisation name", value: "Northstar Community Foundation" },
      { label: "Organisation type", value: "Charity" },
      { label: "Charity number", value: "1184023" },
      { label: "Operating regions", value: "West Yorkshire, Leeds, Bradford" },
    ],
  },
  {
    eyebrow: "Step 2 of 8",
    title: "Mission and communities",
    description: "What you exist to do, and who you serve.",
    fields: [
      {
        label: "Mission statement",
        value:
          "We help young people aged 14 to 25 in West Yorkshire build the confidence, skills and support they need to thrive in work and in life.",
        type: "textarea",
      },
      { label: "Communities served", value: "Young people aged 14 to 25, care-experienced young people" },
    ],
  },
  {
    eyebrow: "Step 3 of 8",
    title: "Programmes",
    description: "The programmes you deliver. You can add outcomes and indicators later.",
    fields: [
      { label: "Programme", value: "Youth Futures" },
      { label: "Programme", value: "Digital Bridge" },
      { label: "Programme", value: "Steady (wellbeing, in planning)" },
    ],
  },
  {
    eyebrow: "Step 4 of 8",
    title: "Funding priorities",
    description: "What you are seeking funding for, and your typical requirement.",
    fields: [
      { label: "Typical funding requirement", value: "£25,000 to £150,000 per programme" },
      { label: "Preferred funding types", value: "Project, Core, Unrestricted" },
    ],
  },
  {
    eyebrow: "Step 5 of 8",
    title: "Governance and readiness",
    description: "Governance details funders often ask about.",
    fields: [
      { label: "Safeguarding status", value: "Up to date, reviewed February 2026" },
      { label: "Data protection status", value: "ICO registered" },
      { label: "Financial year end", value: "31 March" },
    ],
  },
  {
    eyebrow: "Step 6 of 8",
    title: "Existing documents",
    description: "Upload key documents so AI can ground drafts in your real evidence.",
    fields: [
      { label: "Annual accounts", value: "northstar-accounts-2024-25.pdf" },
      { label: "Safeguarding policy", value: "safeguarding-policy-2026.pdf" },
    ],
  },
  {
    eyebrow: "Step 7 of 8",
    title: "Team invitation",
    description: "Invite the people who will work in your workspace.",
    fields: [
      { label: "Invite by email", value: "james@northstarcf.org.uk (Funding Lead)" },
      { label: "Invite by email", value: "priya@northstarcf.org.uk (Programme Lead)" },
    ],
  },
];

export function OnboardingFlow() {
  const { notify } = useToast();
  const [step, setStep] = useState(0);
  const isReview = step === STEPS.length;
  const total = STEPS.length + 1;
  const progress = Math.round(((step + 1) / total) * 100);

  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link href="/">
          <Wordmark showProduct />
        </Link>
        <button
          onClick={() => notify("Progress saved. You can continue later.")}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
        >
          <Save className="h-3.5 w-3.5" /> Save and continue later
        </button>
      </header>

      <div className="mx-auto max-w-3xl px-6 pb-16">
        <ProgressMeter className="mb-8" value={progress} />

        {!isReview ? (
          <div>
            <div className="eyebrow mb-3">{STEPS[step]!.eyebrow}</div>
            <h1 className="text-heading-lg font-semibold tracking-tight text-ink">
              {STEPS[step]!.title}
            </h1>
            <p className="mt-2 text-sm text-ink-muted">{STEPS[step]!.description}</p>

            <div className="mt-6 flex flex-col gap-4">
              {STEPS[step]!.fields.map((f, i) => (
                <label key={i} className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink">{f.label}</span>
                  {f.type === "textarea" ? (
                    <textarea
                      defaultValue={f.value}
                      rows={3}
                      className="w-full resize-y rounded border border-line-strong bg-surface p-3 text-sm text-ink outline-none focus:shadow-focus"
                    />
                  ) : (
                    <input
                      defaultValue={f.value}
                      className="h-10 rounded border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:shadow-focus"
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <ReviewStep />
        )}

        <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {!isReview ? (
            <Button onClick={() => setStep((s) => s + 1)}>
              {step === STEPS.length - 1 ? "Review workspace" : "Continue"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <ButtonLink href="/dashboard" variant="primary" size="lg">
              Enter the Command Centre
              <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewStep() {
  const nextSteps = [
    "Run a fit assessment on your saved opportunities",
    "Draft your first application answer with AI",
    "Add outcome indicators to Youth Futures",
    "Link evidence to your active grants",
  ];
  return (
    <div>
      <div className="eyebrow mb-3">Step 8 of 8</div>
      <h1 className="text-heading-lg font-semibold tracking-tight text-ink">
        Your workspace is ready
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        Here is a summary. You can refine everything from inside the workspace.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="surface-card p-5">
          <div className="eyebrow">Profile completeness</div>
          <div className="mt-2 font-serif text-display font-medium text-ink">82%</div>
          <ProgressMeter className="mt-2" value={82} tone="success" />
          <p className="mt-2 text-xs text-ink-muted">
            Strong start. A few governance fields could be reviewed.
          </p>
        </div>
        <div className="surface-card p-5">
          <div className="eyebrow">Funding readiness</div>
          <div className="mt-2 text-title font-semibold text-success">Ready to apply</div>
          <p className="mt-2 text-sm text-ink-muted">
            You have the core documents and profile needed to begin applications.
          </p>
        </div>
      </div>

      <div className="mt-4 surface-card p-5">
        <div className="eyebrow mb-3">Recommended next steps</div>
        <ul className="flex flex-col gap-2">
          {nextSteps.map((s) => (
            <li key={s} className="flex items-start gap-2 text-sm text-ink">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
