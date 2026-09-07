import type { Metadata } from "next";
import { PublicIntake } from "@/components/process-intelligence/PublicIntake";
import {
  loadProcessIntake,
  type IntakeUnavailable,
} from "@/server/actions/process-intelligence";
export const metadata: Metadata = {
  title: "Describe your work | Pegasus",
  robots: { index: false, follow: false },
};
const onDate = (value?: string) =>
  value
    ? ` on ${new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value))}`
    : "";
// A participant can act on a closed campaign — they know who to ask, and when
// it closed. They cannot act on "invalid, expired, or closed", which was the
// only thing this page used to say.
function explain(u: IntakeUnavailable): { title: string; detail: string } {
  const campaign = u.campaignName ? `“${u.campaignName}”` : "This campaign";
  const owner = u.organisationName ?? "the team who sent it to you";
  switch (u.reason) {
    case "expired":
      return {
        title: "This campaign has closed",
        detail: `${campaign} stopped accepting responses${onDate(u.closesAt)}. Contact ${owner} if you still need to submit — they can reopen it.`,
      };
    case "not_open":
      return {
        title: "This campaign has not opened yet",
        detail: `${campaign} opens${onDate(u.opensAt)}. Your link will work from then, so keep hold of it.`,
      };
    case "closed":
      return {
        title: "This campaign is not accepting responses",
        detail: `${campaign} has been paused by ${owner}. Contact them to find out when it reopens.`,
      };
    case "revoked":
      return {
        title: "This link has been withdrawn",
        detail: `${campaign} is still running, but this particular link was cancelled. Contact ${owner} for a new one.`,
      };
    case "unavailable":
      return {
        title: "We cannot open this link right now",
        detail:
          "Something went wrong at our end rather than with your link. Please try again in a few minutes.",
      };
    default:
      return {
        title: "This intake link is not recognised",
        detail:
          "Check that you copied the whole link. It ends in a long run of letters and numbers, which some email apps cut short.",
      };
  }
}
export default async function IntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await loadProcessIntake(token);
  if (!result.ok) {
    const { title, detail } = explain(result.unavailable);
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper p-6">
        <section className="surface-card max-w-lg p-8 text-center">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-3 text-sm text-ink-muted">{detail}</p>
        </section>
      </main>
    );
  }
  return <PublicIntake token={token} campaign={result.campaign} />;
}
