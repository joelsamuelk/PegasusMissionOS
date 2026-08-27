"use client";

import { useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { ask, type AskResult } from "@/server/actions/intelligence";
import { UNKNOWN_REASON_LABELS } from "@/lib/intelligence";
import { hrefForEntity } from "@/lib/entity-links";
import Link from "next/link";
import { Button, Card, CardBody, Pill } from "@/components/shared/ui";

/**
 * Ask Mission OS.
 *
 * The answer is rendered in the same order the type declares it: the
 * deterministic statements first, then the findings, then what could not be
 * answered. Narration, where a model produced any, sits at the top and is
 * labelled — it is a reading of the answer below it, not the answer.
 */
export function AskMissionOs({
  suggestions,
}: {
  suggestions: { id: string; label: string }[];
}) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setQuestion(trimmed);
    setLoading(true);
    setResult(null);
    setResult(await ask(trimmed));
    setLoading(false);
  }

  const brief = result?.brief;
  const answer = result?.answer;

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(question);
        }}
        className="flex items-center gap-2 rounded-full border border-line-strong bg-surface px-4 py-1.5"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about funding, delivery, evidence or money"
          className="h-8 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
          aria-label="Ask Mission OS a question"
        />
        <Button type="submit" size="icon" variant="blue" disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
          <span className="sr-only">Ask</span>
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {suggestions.slice(0, 6).map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            onClick={() => void run(suggestion.label)}
            className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-muted transition-colors hover:border-blue hover:text-blue"
          >
            {suggestion.label}
          </button>
        ))}
      </div>

      {result && !result.ok && (
        <p className="text-sm text-critical">{result.error}</p>
      )}

      {brief && answer && (
        <Card>
          <CardBody className="space-y-5">
            <div>
              <p className="eyebrow mb-1">Answer</p>
              <h3 className="font-heading text-base font-semibold text-ink">{brief.headline}</h3>
            </div>

            {brief.narrative && (
              <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
                <p className="eyebrow mb-1.5">
                  Narrated by {brief.model}
                  {brief.usedFallback ? " (fallback)" : ""}
                </p>
                <p className="whitespace-pre-wrap text-sm text-ink-muted">{brief.narrative}</p>
              </div>
            )}

            <StatementGroup title="Facts" statements={brief.facts} />
            <StatementGroup title="Calculations" statements={brief.calculations} />
            <StatementGroup title="Inferences" statements={brief.inferences} />

            {brief.unknowns.length > 0 && (
              <div>
                <p className="eyebrow mb-2">What cannot be answered</p>
                <ul className="space-y-2">
                  {brief.unknowns.map((unknown, index) => (
                    <li key={index} className="text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill className="border-warning/30 text-warning">
                          {UNKNOWN_REASON_LABELS[unknown.reason]}
                        </Pill>
                        <span className="text-ink">{unknown.question}</span>
                      </div>
                      {unknown.resolvedBy && (
                        <p className="mt-0.5 text-xs text-ink-subtle">{unknown.resolvedBy}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {brief.sources.length > 0 && (
              <p className="text-xs text-ink-subtle">
                <span className="eyebrow mr-1.5">Sources</span>
                {brief.sources.slice(0, 10).map((source, index) => {
                  const href = hrefForEntity(source.type, source.id);
                  const label = source.label ?? `${source.type.replace(/_/g, " ")} ${source.id}`;
                  return (
                    <span key={`${source.type}:${source.id}`}>
                      {index > 0 && ", "}
                      {href ? (
                        <Link href={href} className="text-info hover:underline">
                          {label}
                        </Link>
                      ) : (
                        label
                      )}
                    </span>
                  );
                })}
              </p>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function StatementGroup({
  title,
  statements,
}: {
  title: string;
  statements: { id: string; text: string; workings?: string }[];
}) {
  if (statements.length === 0) return null;
  return (
    <div>
      <p className="eyebrow mb-2">{title}</p>
      <ul className="space-y-2">
        {statements.slice(0, 8).map((statement) => (
          <li key={statement.id} className="text-sm text-ink">
            {statement.text}
            {statement.workings && (
              <p className="mt-0.5 text-xs text-ink-subtle">{statement.workings}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
