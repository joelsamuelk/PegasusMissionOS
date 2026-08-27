export function MetricCard({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <article className="surface-card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p><p className="mt-2 text-2xl font-semibold text-ink">{value}</p>{note ? <p className="mt-1 text-xs text-ink-muted">{note}</p> : null}</article>;
}
