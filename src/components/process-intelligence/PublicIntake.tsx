"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Mic, RotateCcw, Square } from "lucide-react";
import {
  submitProcessIntake,
  type IntakeCampaign,
} from "@/server/actions/process-intelligence";

type Draft = {
  name: string;
  narrative: string;
  frequency: string;
  duration: string;
  people: string;
  systems: string;
  friction: string;
  judgement: string;
  sensitive: string;
  magic: string;
};
const blank: Draft = {
  name: "",
  narrative: "",
  frequency: "weekly",
  duration: "",
  people: "1",
  systems: "",
  friction: "",
  judgement: "",
  sensitive: "none",
  magic: "",
};
const questions = [
  "process",
  "story",
  "frequency",
  "people",
  "friction",
  "safety",
  "review",
] as const;

export function PublicIntake({
  token,
  campaign,
}: {
  token: string;
  campaign: IntakeCampaign;
}) {
  const [started, setStarted] = useState(false),
    [step, setStep] = useState(0),
    [draft, setDraft] = useState(blank),
    [done, setDone] = useState(false);
  const [identity, setIdentity] = useState({
    firstName: campaign.participant?.firstName ?? "",
    lastName: "",
    email: "",
    department: campaign.participant?.department ?? "",
    team: campaign.participant?.team ?? "",
    jobTitle: campaign.participant?.jobTitle ?? "",
  });
  const [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState("");
  const [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [audio, setAudio] = useState<Blob | null>(null),
    [recordError, setRecordError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null),
    chunks = useRef<Blob[]>([]);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  const update = (key: keyof Draft, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const r = new MediaRecorder(stream);
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      r.onstop = () => {
        setAudio(new Blob(chunks.current, { type: r.mimeType }));
        stream.getTracks().forEach((t) => t.stop());
      };
      r.start();
      recorder.current = r;
      setSeconds(0);
      setRecording(true);
      setRecordError("");
    } catch {
      setRecordError("Microphone access was not available. You can type instead.");
    }
  }
  function stopRecording() {
    recorder.current?.stop();
    setRecording(false);
  }
  async function submit() {
    setSaving(true);
    setSaveError("");
    const result = await submitProcessIntake(token, identity, draft);
    setSaving(false);
    if (result.ok) setDone(true);
    else setSaveError(result.error ?? "We could not save this process.");
  }
  if (done)
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8f5ef] p-5">
        <section className="w-full max-w-xl rounded-3xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
            <Check />
          </div>
          <h1 className="mt-5 text-2xl font-semibold">Thank you.</h1>
          <p className="mt-3 text-ink-muted">
            You’ve helped us understand another part of how your organisation works.
          </p>
          <button
            onClick={() => {
              setDraft(blank);
              setStep(0);
              setDone(false);
            }}
            className="mt-7 w-full rounded-xl bg-navy px-5 py-3 font-semibold text-white"
          >
            Describe another process
          </button>
          <button className="mt-2 w-full px-5 py-3 text-sm font-semibold text-ink-muted">
            I’m finished
          </button>
        </section>
      </main>
    );
  if (!started)
    return (
      <main className="min-h-screen bg-[#f8f5ef] p-5">
        <div className="mx-auto flex min-h-[90vh] max-w-2xl items-center">
          <section>
            <div className="mb-8 font-heading text-lg font-semibold text-navy">
              Pegasus
            </div>
            <p className="eyebrow">
              {campaign.organisationName} · {campaign.campaignName}
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight sm:text-5xl">
              Help us understand how work really gets done.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-7 text-ink-muted">
              Talk us through one thing you regularly do. We’ll use it to find where
              technology could remove repetition and give people more time for work that
              matters.
            </p>
            <div className="mt-6 rounded-2xl border border-line bg-white p-4 text-sm">
              <strong>5–10 minutes per process.</strong> Submit as many processes as you
              like. Your contribution supports organisational discovery, not employee
              performance monitoring.
            </div>
            <button
              onClick={() => setStarted(true)}
              className="mt-7 rounded-xl bg-navy px-6 py-3 font-semibold text-white"
            >
              Describe a process <ArrowRight className="ml-2 inline h-4 w-4" />
            </button>
            <p className="mt-4 text-xs text-ink-muted">
              Secure invitation · {token.slice(0, 6)}••••
            </p>
          </section>
        </div>
      </main>
    );
  const q = questions[step];
  return (
    <main className="min-h-screen bg-[#f8f5ef] p-4 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between">
          <span className="font-heading font-semibold">Pegasus</span>
          <span className="text-xs text-ink-muted">One process at a time</span>
        </header>
        <div className="mt-5 h-1.5 overflow-hidden rounded bg-white">
          <div
            className="h-full rounded bg-coral transition-all"
            style={{ width: `${((step + 1) / questions.length) * 100}%` }}
          />
        </div>
        <section className="mt-10 rounded-3xl bg-white p-6 shadow-sm sm:p-9">
          {q === "process" && (
            <>
              {campaign.identificationRequired && !campaign.participant ? (
                <div className="mb-7 grid gap-3 rounded-xl bg-paper p-4 sm:grid-cols-2">
                  <p className="sm:col-span-2 text-sm font-semibold">
                    First, tell us who you are
                  </p>
                  {(
                    [
                      ["firstName", "First name"],
                      ["lastName", "Last name"],
                      ["email", "Work email"],
                      ["department", "Department"],
                      ["team", "Team"],
                      ["jobTitle", "Role / job title"],
                    ] as const
                  ).map(([key, label]) => (
                    <input
                      key={key}
                      type={key === "email" ? "email" : "text"}
                      required={
                        key === "firstName" || key === "email" || key === "department"
                      }
                      value={identity[key]}
                      onChange={(event) =>
                        setIdentity({ ...identity, [key]: event.target.value })
                      }
                      className="rounded-lg border border-line p-3"
                      placeholder={label}
                    />
                  ))}
                </div>
              ) : null}
              <p className="eyebrow">First, give it a name</p>
              <h1 className="mt-3 text-2xl font-semibold">
                What’s one thing you regularly do?
              </h1>
              <p className="mt-2 text-sm text-ink-muted">
                For example, “Preparing the monthly donor report”.
              </p>
              <input
                autoFocus
                value={draft.name}
                onChange={(e) => update("name", e.target.value)}
                className="mt-6 w-full rounded-xl border border-line p-4 text-lg"
                placeholder="Short process name"
              />
            </>
          )}
          {q === "story" && (
            <>
              <p className="eyebrow">Tell the story</p>
              <h1 className="mt-3 text-2xl font-semibold">
                Imagine you’re explaining it to a new colleague.
              </h1>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                What starts it? What happens next? Which tools and people are involved?
                Where do you wait, and what tends to go wrong?
              </p>
              <div className="mt-5 rounded-2xl border border-blue/20 bg-blue-soft p-5 text-center">
                {recording ? (
                  <>
                    <div className="mx-auto h-3 w-3 animate-pulse rounded-full bg-red-600" />
                    <strong className="mt-2 block">
                      Recording · {Math.floor(seconds / 60)}:
                      {String(seconds % 60).padStart(2, "0")}
                    </strong>
                    <button
                      onClick={stopRecording}
                      className="mt-4 rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-white"
                    >
                      <Square className="mr-2 inline h-4 w-4" />
                      Stop recording
                    </button>
                  </>
                ) : audio ? (
                  <>
                    <Check className="mx-auto text-green-700" />
                    <strong className="mt-2 block">Recording ready · {seconds}s</strong>
                    <div className="mt-3 flex justify-center gap-2">
                      <audio controls src={URL.createObjectURL(audio)} />
                      <button
                        aria-label="Retry recording"
                        onClick={() => {
                          setAudio(null);
                          setSeconds(0);
                        }}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="mt-3 text-xs text-ink-muted">
                      In production this uploads securely, then transcribes for your
                      review.
                    </p>
                  </>
                ) : (
                  <button
                    onClick={startRecording}
                    className="rounded-xl bg-navy px-6 py-3 font-semibold text-white"
                  >
                    <Mic className="mr-2 inline h-5 w-5" />
                    Describe by voice
                  </button>
                )}
                {recordError ? (
                  <p className="mt-3 text-sm text-red-700">{recordError}</p>
                ) : null}
              </div>
              <label className="mt-5 block text-sm font-semibold">Or type instead</label>
              <textarea
                value={draft.narrative}
                onChange={(e) => update("narrative", e.target.value)}
                rows={7}
                className="mt-2 w-full rounded-xl border border-line p-4"
                placeholder="Talk us through the process…"
              />
            </>
          )}
          {q === "frequency" && (
            <>
              <h1 className="text-2xl font-semibold">How often does this happen?</h1>
              <select
                value={draft.frequency}
                onChange={(e) => update("frequency", e.target.value)}
                className="mt-6 w-full rounded-xl border border-line p-4"
              >
                {[
                  "multiple times per day",
                  "daily",
                  "weekly",
                  "monthly",
                  "quarterly",
                  "annually",
                  "ad hoc",
                  "custom",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <label className="mt-6 block font-semibold">
                How long does one occurrence take?
              </label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  value={draft.duration}
                  onChange={(e) => update("duration", e.target.value)}
                  className="w-32 rounded-xl border border-line p-4"
                />
                <span>minutes</span>
              </div>
            </>
          )}
          {q === "people" && (
            <>
              <h1 className="text-2xl font-semibold">Who and what are involved?</h1>
              <label className="mt-6 block font-semibold">
                How many people normally take part?
              </label>
              <input
                type="number"
                min="1"
                value={draft.people}
                onChange={(e) => update("people", e.target.value)}
                className="mt-2 w-32 rounded-xl border border-line p-4"
              />
              <label className="mt-6 block font-semibold">Which systems or tools?</label>
              <input
                value={draft.systems}
                onChange={(e) => update("systems", e.target.value)}
                className="mt-2 w-full rounded-xl border border-line p-4"
                placeholder="e.g. Salesforce, Excel, Gmail"
              />
            </>
          )}
          {q === "friction" && (
            <>
              <h1 className="text-2xl font-semibold">
                Where does the work get difficult?
              </h1>
              <label className="mt-6 block font-semibold">
                What takes the most time or causes frustration?
              </label>
              <textarea
                value={draft.friction}
                onChange={(e) => update("friction", e.target.value)}
                rows={4}
                className="mt-2 w-full rounded-xl border border-line p-4"
              />
              <label className="mt-6 block font-semibold">
                Which parts genuinely require human judgement?
              </label>
              <textarea
                value={draft.judgement}
                onChange={(e) => update("judgement", e.target.value)}
                rows={3}
                className="mt-2 w-full rounded-xl border border-line p-4"
              />
            </>
          )}
          {q === "safety" && (
            <>
              <h1 className="text-2xl font-semibold">A final couple of questions</h1>
              <label className="mt-6 block font-semibold">
                Does this involve sensitive information?
              </label>
              <select
                value={draft.sensitive}
                onChange={(e) => update("sensitive", e.target.value)}
                className="mt-2 w-full rounded-xl border border-line p-4"
              >
                {[
                  "none",
                  "personal data",
                  "financial data",
                  "health data",
                  "safeguarding data",
                  "confidential organisational data",
                  "credentials/secrets",
                  "other",
                  "unsure",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <label className="mt-6 block font-semibold">
                If you could magically remove one part tomorrow, what would it be?
              </label>
              <textarea
                value={draft.magic}
                onChange={(e) => update("magic", e.target.value)}
                rows={3}
                className="mt-2 w-full rounded-xl border border-line p-4"
              />
            </>
          )}
          {q === "review" && (
            <>
              <p className="eyebrow">Here’s what we understood</p>
              <h1 className="mt-3 text-2xl font-semibold">Review your process</h1>
              <dl className="mt-6 divide-y divide-line rounded-xl border border-line">
                {Object.entries({
                  Process: draft.name,
                  Description:
                    draft.narrative || "Voice recording awaiting transcription",
                  Frequency: draft.frequency,
                  Duration: `${draft.duration || "Not provided"} minutes`,
                  People: draft.people,
                  Systems: draft.systems || "Not provided",
                  Friction: draft.friction || "Not provided",
                }).map(([k, v]) => (
                  <div className="p-4" key={k}>
                    <dt className="text-xs font-semibold uppercase text-ink-muted">
                      {k}
                    </dt>
                    <dd className="mt-1 text-sm">{v}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <div className="mt-8 flex items-center justify-between">
            <button
              disabled={step === 0}
              onClick={() => setStep((s) => s - 1)}
              className="px-3 py-2 text-sm font-semibold disabled:opacity-0"
            >
              <ArrowLeft className="mr-1 inline h-4 w-4" />
              Back
            </button>
            {q === "review" ? (
              <div className="text-right">
                {saveError ? (
                  <p className="mb-2 text-sm text-red-700">{saveError}</p>
                ) : null}
                <button
                  disabled={saving}
                  onClick={submit}
                  className="rounded-xl bg-navy px-6 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Submit process"}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={
                  (q === "process" && !draft.name) ||
                  (q === "story" && !draft.narrative && !audio)
                }
                className="rounded-xl bg-navy px-6 py-3 font-semibold text-white disabled:opacity-40"
              >
                Continue <ArrowRight className="ml-1 inline h-4 w-4" />
              </button>
            )}
          </div>
        </section>
        <p className="mt-5 text-center text-xs text-ink-muted">
          Your response is securely linked to this discovery campaign.
        </p>
      </div>
    </main>
  );
}
