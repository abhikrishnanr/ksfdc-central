import ShowtimeChip from './ShowtimeChip';
import type { CentralMovieShowtime } from '../../lib/central-data';

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export default function ShowtimeStrip({ showtimes }: { showtimes: CentralMovieShowtime[] }) {
  return (
    <div className="showtime-strip">
      {showtimes.map((show) => (
        <ShowtimeChip key={show.showId} href={`/book/${show.showId}`} label={formatTime(show.showTime)} status={show.status === 'OPEN' ? undefined : 'Unavailable'} />
      ))}
    </div>
  );
}
