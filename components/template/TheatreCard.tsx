import Link from 'next/link';
import type { CentralTheatreSummary } from '../../lib/central-data';

export default function TheatreCard({ theatre }: { theatre: CentralTheatreSummary }) {
  return (
    <article className="premium-card grid gap-4">
      <div>
        <p className="eyebrow">{theatre.city}</p>
        <h2>{theatre.name}</h2>
        <p>{theatre.screenCount} screen(s) - {theatre.activeShowCount} upcoming show(s)</p>
      </div>
      <div className="meta-row">
        {theatre.priceStartsAt != null ? <span className="status-badge status-violet">From INR {theatre.priceStartsAt}</span> : null}
        <Link className="action-button primary" href={`/theatres/${theatre.id}`}>View shows</Link>
      </div>
    </article>
  );
}
