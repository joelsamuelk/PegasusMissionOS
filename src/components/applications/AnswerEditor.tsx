"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Library,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import type {
  AIProvenance,
  AnswerStatus,
  ApplicationAnswer,
  EvidenceItem,
} from "@/types/domain";
import type { AiFeature } from "@/lib/ai/prompts";
import { generateAnswer } from "@/server/actions/ai";
import { saveAnswer, setAnswerStatus } from "@/server/actions/mutations";
import { countWords, cn } from "@/lib/utils";
import { Button } from "@/components/shared/ui";
import { EntityStatusBadge } from "@/components/shared/StatusBadge";
import { ProvenanceButton } from "@/components/ai/ProvenanceDrawer";
import { useToast } from "@/components/shared/Toast";

const AI_ACTIONS: { feature: AiFeature; label: string; primary?: boolean }[] = [
  { feature: "draft_answer", label: "Create first draft", primary: true },
  { feature: "improve_clarity", label: "Improve clarity" },
  { feature: "make_specific", label: "Make more specific" },
  { feature: "strengthen_evidence", label: "Strengthen with evidence" },
  { feature: "shorten", label: "Shorten to word limit" },
  { feature: "review_criteria", label: "Review against criteria" },
];

const STATUS_OPTIONS: AnswerStatus[] = [
  "not_started",
  "drafting",
  "needs_evidence",
  "ready_for_review",
  "changes_requested",
  "approved",
];

/**
 * The flagship application answer editor. Question and guidance sit at the top,
 * with a live word count against the limit. AI actions generate a candidate the
 * user must explicitly accept before it becomes the active answer. Manual edits
 * autosave. A private provenance panel accompanies every AI draft.
 */
export function AnswerEditor({
  answer,
  evidence,
  defaultOpen = false,
}: {
  answer: ApplicationAnswer;
  evidence: EvidenceItem[];
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState(answer.draft);
  const [candidate, setCandidate] = useState<{
    text: string;
    provenance?: AIProvenance;
    model?: string;
    isReview?: boolean;
  } | null>(null);
  const [busy, setBusy] = useState<AiFeature | null>(null);
  const [savePending, startSave] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const words = countWords(text);
  const overLimit = answer.wordLimit ? words > answer.wordLimit : false;

  // Autosave manual edits (debounced).
  useEffect(() => {
    if (text === answer.draft) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      startSave(async () => {
        await saveAnswer(answer.id, text);
        setSavedAt("Saved");
        setTimeout(() => setSavedAt(null), 1500);
      });
    }, 900);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  async function runAi(feature: AiFeature) {
    setBusy(feature);
    setCandidate(null);
    const res = await generateAnswer(answer.id, feature);
    setBusy(null);
    if (!res.ok) {
      notify(res.error ?? "Generation failed", "error");
      return;
    }
    setCandidate({
      text: res.text,
      provenance: res.provenance,
      model: res.model,
      isReview: feature === "review_criteria",
    });
  }

  function acceptCandidate() {
    if (!candidate) return;
    setText(candidate.text);
    startSave(async () => {
      await saveAnswer(answer.id, candidate.text, candidate.provenance);
      notify("AI draft applied. Remember to review it before submitting.");
      router.refresh();
    });
    setCandidate(null);
  }

  function changeStatus(status: AnswerStatus) {
    startSave(async () => {
      await setAnswerStatus(answer.id, status);
      notify(status === "approved" ? "Answer approved." : "Status updated.");
      router.refresh();
    });
  }

  return (
    <div className="surface-card overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken/40"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-ink-subtle transition-transform",
            open && "rotate-180",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-1 text-sm font-medium text-ink">
            {answer.order}. {answer.questionText}
          </span>
        </span>
        <EntityStatusBadge status={answer.status} />
      </button>

      {open && (
        <div className="border-t border-line">
          <div className="grid gap-0 lg:grid-cols-[1fr_260px]">
            {/* Editor column */}
            <div className="border-b border-line p-4 lg:border-b-0 lg:border-r">
              {answer.guidance && (
                <p className="mb-3 rounded border border-line bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
                  <span className="font-medium text-ink">Funder guidance:</span>{" "}
                  {answer.guidance}
                </p>
              )}

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={7}
                placeholder="Write your answer, or use an AI action to create a first draft."
                className="w-full resize-y rounded border border-line-strong bg-surface p-3 text-sm leading-relaxed text-ink outline-none focus:shadow-focus"
              />

              <div className="mt-2 flex items-center justify-between text-xs">
                <span className={cn(overLimit ? "font-medium text-critical" : "text-ink-subtle")}>
                  {words} words
                  {answer.wordLimit ? ` of ${answer.wordLimit}` : ""}
                  {overLimit && " (over limit)"}
                </span>
                <span className="text-ink-subtle">
                  {savePending ? "Saving..." : savedAt ?? "Autosaves as you type"}
                </span>
              </div>

              {/* AI actions */}
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  <span className="eyebrow">AI actions</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {AI_ACTIONS.map((a) => (
                    <Button
                      key={a.feature}
                      size="sm"
                      variant={a.primary ? "accent" : "secondary"}
                      disabled={busy !== null || savePending}
                      onClick={() => runAi(a.feature)}
                    >
                      {busy === a.feature ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="h-3.5 w-3.5" />
                      )}
                      {a.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Candidate review */}
              {candidate && (
                <div className="mt-4 rounded-md border border-accent/30 bg-accent/5 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="eyebrow text-accent">
                      {candidate.isReview ? "AI review" : "AI draft to review"}
                    </span>
                    {candidate.provenance && (
                      <ProvenanceButton provenance={candidate.provenance} />
                    )}
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                    {candidate.text}
                  </div>
                  <div className="mt-3 flex items-center gap-2 border-t border-accent/20 pt-2.5">
                    {!candidate.isReview && (
                      <Button size="sm" variant="primary" onClick={acceptCandidate}>
                        <Check className="h-3.5 w-3.5" /> Use this draft
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setCandidate(null)}>
                      Discard
                    </Button>
                    {candidate.model && (
                      <span className="ml-auto text-xs text-ink-subtle">{candidate.model}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Approval controls */}
              <div className="mt-4 flex items-center gap-3 border-t border-line pt-3">
                <label className="text-xs font-medium text-ink-muted">Status</label>
                <select
                  value={answer.status}
                  disabled={savePending}
                  onChange={(e) => changeStatus(e.target.value as AnswerStatus)}
                  className="h-8 rounded border border-line-strong bg-surface px-2 text-sm text-ink outline-none focus:shadow-focus"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                {answer.status !== "approved" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={savePending}
                    onClick={() => changeStatus("approved")}
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                )}
              </div>
            </div>

            {/* Context sidebar */}
            <div className="p-4">
              <div className="mb-2 flex items-center gap-1.5">
                <Library className="h-3.5 w-3.5 text-ink-subtle" />
                <span className="eyebrow">Linked evidence</span>
              </div>
              {evidence.length === 0 ? (
                <p className="text-xs text-ink-subtle">
                  No evidence is linked. Link evidence to strengthen this answer with the
                  AI actions.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {evidence.map((e) => (
                    <li key={e.id} className="rounded border border-line bg-surface p-2">
                      <div className="text-xs font-medium text-ink">{e.title}</div>
                      <div className="mt-0.5 text-xs text-ink-subtle">
                        {e.statValue
                          ? `${e.statValue} ${e.statLabel ?? ""}`
                          : e.quote
                            ? `"${e.quote}"`
                            : e.description}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {answer.provenance && (
                <div className="mt-4 border-t border-line pt-3">
                  <div className="eyebrow mb-1.5">Last AI draft</div>
                  <ProvenanceButton provenance={answer.provenance} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
