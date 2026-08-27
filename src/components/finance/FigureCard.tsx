import { HelpCircle } from "lucide-react";
import type { FinanceFigure } from "@/lib/finance";
import { Card, CardBody } from "@/components/shared/ui";

/**
 * One figure, or the reason there isn't one.
 *
 * The brief's constraint on this phase is absolute: *where a refusal fires,
 * the UI shows the reason. It never shows a blank, and it never shows a zero.*
 * This component cannot render a blank, because `FinanceFigure` is a union and
 * the unknown branch has no value to render — only a reason and a list of what
 * would produce one.
 *
 * The workings are shown, not hidden behind a tooltip. These are the numbers
 * that go into funder reports, and a figure a trustee cannot check is a figure
 * they have to take on trust.
 */
export function FigureCard({
  label,
  figure,
}: {
  label: string;
  figure: FinanceFigure;
}) {
  if (!figure.known) {
    return (
      <Card className="border-dashed">
        <CardBody>
          <p className="eyebrow">{label}</p>
          <p className="mt-1 flex items-start gap-1.5 font-heading text-base font-medium text-ink-subtle">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Not known
          </p>
          <p className="mt-1.5 text-xs text-ink-muted">{figure.reason}</p>
          {figure.requires.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {figure.requires.map((requirement, index) => (
                <li key={index} className="text-xs text-ink-subtle">
                  {requirement}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <p className="eyebrow">{label}</p>
        <p className="mt-1 font-heading text-2xl font-semibold text-ink">{figure.display}</p>
        <p className="mt-1.5 text-xs text-ink-subtle">{figure.workings}</p>
        {figure.caveat && <p className="mt-1 text-xs text-warning">{figure.caveat}</p>}
      </CardBody>
    </Card>
  );
}
