import type { Metadata } from "next";
import { Database, ShieldCheck, Sparkles } from "lucide-react";
import { q } from "@/features/store";
import { appConfig, resolveAiProvider } from "@/lib/config";
import { humanise } from "@/lib/formatting";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardBody } from "@/components/shared/ui";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AiSettingToggle } from "@/components/settings/AiSettingToggle";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  const org = q.organisation();
  const provider = resolveAiProvider();

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Workspace settings"
        description="Configure your workspace, AI assistance and data handling."
      />

      <div className="flex max-w-3xl flex-col gap-6">
        {/* AI settings */}
        <Card>
          <div className="flex items-center gap-2 border-b border-line px-5 py-4">
            <Sparkles className="h-4 w-4 text-accent" />
            <h2 className="text-title font-semibold text-ink">Pegasus Intelligence</h2>
          </div>
          <CardBody className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-ink">AI assistance</div>
                <p className="mt-1 text-sm text-ink-muted">
                  When enabled, Pegasus Intelligence can draft answers and reports using your
                  approved organisation data. Every output is editable and reviewable.
                </p>
              </div>
              <AiSettingToggle enabled={org.aiEnabled} />
            </div>

            <div className="rounded-md border border-info/25 bg-info-soft p-4 text-sm text-info">
              <div className="mb-1.5 flex items-center gap-1.5 font-medium">
                <ShieldCheck className="h-4 w-4" /> How your data is used
              </div>
              <ul className="flex list-disc flex-col gap-1 pl-5">
                <li>AI calls run only on the server. Keys are never exposed to the browser.</li>
                <li>Only approved profile fields and selected evidence are sent to the model.</li>
                <li>No detailed beneficiary records or special category data are collected.</li>
                <li>Every generation is recorded in the audit log with its provenance.</li>
              </ul>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Active provider</span>
              <StatusBadge
                tone={provider === "anthropic" ? "success" : "info"}
                label={provider === "anthropic" ? "Anthropic (live)" : "Deterministic mock"}
              />
            </div>
          </CardBody>
        </Card>

        {/* Environment */}
        <Card>
          <div className="flex items-center gap-2 border-b border-line px-5 py-4">
            <Database className="h-4 w-4 text-ink-subtle" />
            <h2 className="text-title font-semibold text-ink">Data and environment</h2>
          </div>
          <CardBody className="flex flex-col gap-3 text-sm">
            <Row
              label="Data source"
              value={
                <StatusBadge
                  tone={appConfig.isMockData ? "info" : "success"}
                  label={appConfig.isMockData ? "In-memory demonstration data" : "Supabase (live)"}
                />
              }
            />
            <Row label="Workspace" value={org.name} />
            <Row label="Organisation type" value={humanise(org.type)} />
            <Row label="Charity number" value={org.charityNumber ?? "-"} />
            <Row
              label="Demonstration workspace"
              value={<StatusBadge tone="accent" label={org.isDemo ? "Yes" : "No"} />}
            />
          </CardBody>
        </Card>

        <Card>
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-title font-semibold text-ink">Security and privacy</h2>
          </div>
          <CardBody className="text-sm text-ink-muted">
            Organisation data is isolated per workspace. With Supabase configured, access is
            enforced by Row Level Security so a member of one organisation can never read
            another organisation&apos;s records. See the security and privacy documentation for
            data boundaries, storage and known limitations.
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}
