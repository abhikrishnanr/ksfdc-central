import type { CentralMovieShowtime } from '../../lib/central-data';
import ShowtimeStrip from './ShowtimeStrip';

function money(value: number | null) {
  if (value == null) return 'Price varies';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default function TheatreShowCard({ theatreName, city, showtimes }: { theatreName: string; city: string; showtimes: CentralMovieShowtime[] }) {
  const lowestPrice = showtimes.reduce<number | null>((lowest, show) => {
    if (show.priceStartsAt == null) return lowest;
    return lowest == null ? show.priceStartsAt : Math.min(lowest, show.priceStartsAt);
  }, null);

  return (
    <article className="theatre-show-card">
      <div>
        <h3>{theatreName}</h3>
        <p>{city} - starts at {money(lowestPrice)}</p>
      </div>
      <ShowtimeStrip showtimes={showtimes} />
    </article>
  );
}
