export default function TrackSkeletonGrid({ count = 4, rows = false }) {
  return <div className={`skeleton-grid ${rows ? "skeleton-rows" : ""}`} role="status" aria-label="Loading music">
    {Array.from({ length: count }, (_, index) => <div className="track-skeleton" key={index} aria-hidden="true"><span className="skeleton-art"/><span className="skeleton-line skeleton-title"/><span className="skeleton-line skeleton-subtitle"/><span className="skeleton-actions"/></div>)}
    <span className="sr-only">Loading music…</span>
  </div>;
}
