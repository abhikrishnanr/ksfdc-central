import ShowtimeChip from './ShowtimeChip';
import type { CentralMovieShowtime } from '../../lib/central-data';
import { midnightShowNote } from '../../lib/show-time';

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

export default function ShowtimeStrip({ showtimes }: { showtimes: CentralMovieShowtime[] }) {
  return (
    <div className="showtime-strip">
      {showtimes.map((show) => (
        <ShowtimeChip
          key={show.showId}
          href={`/book/${show.showId}`}
          label={formatTime(show.showTime)}
          note={midnightShowNote(show.showTime) ? 'Midnight show' : null}
          status={show.status === 'OPEN' && show.bookingEnabled !== false ? undefined : show.reason === 'BOOKING_CUTOFF_REACHED' ? 'Booking closed' : 'Temporarily unavailable'}
        />
      ))}
    </div>
  );
}
