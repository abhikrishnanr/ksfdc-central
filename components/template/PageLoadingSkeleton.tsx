export default function PageLoadingSkeleton({ booking = false }: { booking?: boolean }) {
  return (
    <section className={`route-skeleton${booking ? ' booking' : ''}`} aria-label="Loading page" aria-busy="true">
      <div className="skeleton-line short" />
      <div className="skeleton-line title" />
      <div className="skeleton-line medium" />
      <div className="skeleton-grid">
        {Array.from({ length: booking ? 1 : 6 }, (_, index) => <div className="skeleton-panel" key={index} />)}
      </div>
    </section>
  );
}
