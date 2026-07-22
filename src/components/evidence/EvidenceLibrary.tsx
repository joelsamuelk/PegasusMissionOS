"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search, Upload } from "lucide-react";
import type { EvidenceItem, EvidenceType } from "@/types/domain";
import { humanise } from "@/lib/formatting";
import { addEvidence } from "@/server/actions/mutations";
import { Button } from "@/components/shared/ui";
import { Modal } from "@/components/shared/Modal";
import { VerificationBadge } from "@/components/shared/misc";
import { TYPE_ICON } from "./EvidenceReference";
import { useToast } from "@/components/shared/Toast";
import { cn } from "@/lib/utils";

const TYPES: EvidenceType[] = [
  "document",
  "statistic",
  "testimonial",
  "case_study",
  "image",
  "attendance",
  "survey",
  "evaluation",
  "financial",
  "policy",
  "external_reference",
];

export function EvidenceLibrary({ items }: { items: EvidenceItem[] }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(
    () =>
      items.filter((e) => {
        if (type !== "all" && e.type !== type) return false;
        if (search) {
          const s = search.toLowerCase();
          return (
            e.title.toLowerCase().includes(s) ||
            e.description.toLowerCase().includes(s) ||
            e.tags.join(" ").toLowerCase().includes(s)
          );
        }
        return true;
      }),
    [items, search, type],
  );

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search evidence"
              className="h-9 w-full rounded border border-line-strong bg-surface pl-8 pr-3 text-sm text-ink outline-none focus:shadow-focus"
              aria-label="Search evidence"
            />
          </div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-9 rounded border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none focus:shadow-focus"
            aria-label="Filter by type"
          >
            <option value="all">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {humanise(t)}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add evidence
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => {
          const Icon = TYPE_ICON[item.type];
          return (
            <div key={item.id} className="surface-card flex flex-col p-4 shadow-elev-1">
              <div className="flex items-start justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded bg-surface-sunken text-ink-subtle">
                  <Icon className="h-4 w-4" />
                </span>
                <VerificationBadge state={item.verification} />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-ink">{item.title}</h3>
              {item.statValue && (
                <div className="mt-1 font-serif text-heading font-medium text-accent">
                  {item.statValue}
                </div>
              )}
              <p className="mt-1 line-clamp-3 flex-1 text-xs text-ink-muted">
                {item.quote ? `"${item.quote}"` : item.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                {item.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-surface-sunken px-2 py-0.5 text-[0.7rem] text-ink-subtle"
                  >
                    {t}
                  </span>
                ))}
              </div>
              {item.fileName && (
                <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-2 text-xs text-ink-subtle">
                  <Upload className="h-3 w-3" /> {item.fileName}
                  {item.fileSizeKb ? ` · ${Math.round(item.fileSizeKb)} KB` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AddEvidenceModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function AddEvidenceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EvidenceType>("document");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  function submit() {
    if (!title.trim()) {
      notify("Give the evidence a title.", "error");
      return;
    }
    start(async () => {
      await addEvidence({
        title,
        type,
        description,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      notify("Evidence added to the library.");
      setTitle("");
      setDescription("");
      setTags("");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add evidence"
      description="Add a document, statistic, testimonial or other evidence. In this demonstration, file contents are represented by a description."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Add evidence
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-10 w-full rounded border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:shadow-focus"
          />
        </Field>
        <Field label="Type">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as EvidenceType)}
            className="h-10 w-full rounded border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:shadow-focus"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {humanise(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full resize-y rounded border border-line-strong bg-surface p-3 text-sm text-ink outline-none focus:shadow-focus"
          />
        </Field>
        <Field label="Tags (comma separated)">
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="youth-futures, outcome"
            className="h-10 w-full rounded border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:shadow-focus"
          />
        </Field>
        <div className={cn("flex items-center gap-2 rounded border border-dashed border-line-strong px-3 py-6 text-sm text-ink-subtle")}>
          <Upload className="h-4 w-4" />
          File upload uses Supabase Storage with signed URLs when configured. In mock
          mode, the description stands in for the file.
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
