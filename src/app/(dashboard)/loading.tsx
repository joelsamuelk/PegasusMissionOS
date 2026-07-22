export default function DashboardLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="skeleton mb-3 h-3 w-24" />
        <div className="skeleton h-8 w-80 max-w-full" />
        <div className="skeleton mt-3 h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="surface-card h-28 p-4">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton mt-6 h-7 w-24" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="surface-card h-72 lg:col-span-2" />
        <div className="surface-card h-72" />
      </div>
    </div>
  );
}
