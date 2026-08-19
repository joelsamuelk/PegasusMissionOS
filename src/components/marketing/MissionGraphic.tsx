import {
  FileBarChart2,
  Library,
  HeartHandshake,
  Landmark,
  Layers,
  Target,
  TrendingUp,
} from "lucide-react";

/**
 * The hero graphic: seven domains on one shared core.
 *
 * The hero used to be text on the left and empty paper on the right, which
 * left the site's central claim, that the domains share one model, entirely to
 * a sentence. This draws it: seven labelled nodes on a ring, every one of them
 * joined to the same centre rather than to each other. The absence of
 * node-to-node edges is the argument. Integrations between modules would be a
 * mesh; this is a hub, because there is one record underneath.
 *
 * Inline SVG rather than an image file, for the same reasons the product
 * previews are HTML: it inherits the theme through Tailwind colour utilities,
 * stays sharp at any density, costs no extra request, and cannot go stale
 * against a palette change. It carries no `<img>`, so the hero `<h1>` remains
 * the LCP element.
 *
 * Decorative. The claim it illustrates is made in words directly beside it, so
 * the whole figure is hidden from assistive technology rather than given an
 * alt text that repeats the paragraph a screen reader has just read.
 */

/** Seven nodes, evenly spaced from -90° so `Funding` sits at twelve o'clock. */
const NODES = [
  { id: "funding", label: "Funding", icon: Target },
  { id: "finance", label: "Finance", icon: Landmark },
  { id: "relationships", label: "Relationships", icon: HeartHandshake },
  { id: "programmes", label: "Programmes", icon: Layers },
  { id: "evidence", label: "Evidence", icon: Library },
  { id: "impact", label: "Impact", icon: TrendingUp },
  { id: "reports", label: "Reports", icon: FileBarChart2 },
] as const;

const SIZE = 420;
const CENTRE = SIZE / 2;
const RADIUS = 150;
const NODE_R = 30;

function position(index: number) {
  const angle = (index / NODES.length) * 2 * Math.PI - Math.PI / 2;
  return {
    x: CENTRE + RADIUS * Math.cos(angle),
    y: CENTRE + RADIUS * Math.sin(angle),
  };
}

export function MissionGraphic({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={className}
      role="presentation"
      aria-hidden="true"
    >
      {/* Spokes first, so the nodes sit on top of where they terminate. */}
      <g className="stroke-line-strong" strokeWidth={1.5}>
        {NODES.map((node, i) => {
          const { x, y } = position(i);
          return <line key={node.id} x1={CENTRE} y1={CENTRE} x2={x} y2={y} />;
        })}
      </g>

      {/* The shared core. Two rings rather than one so it reads as a floor the
          spokes land on, not as an eighth domain. */}
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={58}
        className="fill-accent-soft stroke-accent/30"
        strokeWidth={1.5}
      />
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={44}
        className="fill-surface stroke-line"
        strokeWidth={1.5}
      />
      <text
        x={CENTRE}
        y={CENTRE - 4}
        textAnchor="middle"
        className="fill-ink font-heading text-[13px] font-semibold"
      >
        One
      </text>
      <text
        x={CENTRE}
        y={CENTRE + 12}
        textAnchor="middle"
        className="fill-ink font-heading text-[13px] font-semibold"
      >
        model
      </text>

      {NODES.map((node, i) => {
        const { x, y } = position(i);
        const Icon = node.icon;
        // Labels sit outside the ring, flipping side so none crosses the hub.
        const onLeft = x < CENTRE - 1;
        const onTop = y < CENTRE;
        return (
          <g
            key={node.id}
            className="node-pulse"
            style={{ animationDelay: `${i * 140}ms` }}
          >
            <circle
              cx={x}
              cy={y}
              r={NODE_R}
              className="fill-surface stroke-line-strong"
              strokeWidth={1.5}
            />
            <foreignObject x={x - 10} y={y - 10} width={20} height={20}>
              <Icon className="h-5 w-5 text-accent" aria-hidden />
            </foreignObject>
            <text
              x={x}
              y={onTop ? y - NODE_R - 9 : y + NODE_R + 18}
              textAnchor={onLeft && !onTop ? "end" : onLeft ? "middle" : "middle"}
              className="fill-ink-muted text-[12px] font-medium"
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
