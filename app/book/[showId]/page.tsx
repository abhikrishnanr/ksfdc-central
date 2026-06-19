export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getAuthorityAwareBookingShow, getCentralBookingUnavailableMessage, getTodaysShows } from '../../../lib/central-data';
import { ErrorState, PageHeader, StatusBadge } from '../../../components/premium-ui';
import { formatPublicError, getPublicShowStatus } from '../../../lib/public-copy';
import BookingSeatPicker from './BookingSeatPicker';
import ShowtimeStrip from '../../../components/template/ShowtimeStrip';
import { MoonStar } from 'lucide-react';
import { isMidnightShow } from '../../../lib/show-time';

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

export default async function CentralBookingPage({ params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params;
  const [{ dbStatus, data: show }, todayShows] = await Promise.all([
    getAuthorityAwareBookingShow(showId),
    getTodaysShows()
  ]);

  if (!show) {
    return (
      <section className="grid">
        <PageHeader eyebrow="Booking unavailable" title={`Book Show ${showId}`} description={dbStatus.message} />
        <ErrorState title="Show unavailable">
          <p>Central database is unavailable or not seeded.</p>
          <Link className="action-button" href="/shows">Back to shows</Link>
        </ErrorState>
      </section>
    );
  }

  const availableSeats = show.rows.reduce(
    (total, row) => total + row.cells.filter((cell) => cell.kind === 'SEAT' && cell.status === 'AVAILABLE').length,
    0
  );
  const publicStatus = getPublicShowStatus({ ...show, availableSeats });
  const unavailableMessage = formatPublicError(getCentralBookingUnavailableMessage(show.reason));
  const relatedShowtimes = todayShows.data.filter((item) => item.movieId === show.movieId && item.theatreId === show.theatreId);

  return (
    <section className="public-booking-page">
      <section className="public-booking-topbar">
        <Link className="action-button" href={`/movies/${show.movieId}`}>Back</Link>
        <div>
          <strong>{show.movieTitle}</strong>
          <span>{show.theatreName} - {show.screenName} - {formatTime(show.showTime)}</span>
        </div>
        <StatusBadge tone={publicStatus.tone}>{publicStatus.label}</StatusBadge>
      </section>

      {isMidnightShow(show.showTime) ? (
        <section className="midnight-show-banner" role="note">
          <MoonStar />
          <div><strong>11:59 PM MIDNIGHT SHOW</strong><span>Starts late tonight and continues after midnight. Please confirm the show date before choosing seats.</span></div>
        </section>
      ) : null}

      {show.bookingEnabled === false ? (
        <section className="booking-unavailable-panel" role="status" aria-live="polite">
          <p className="eyebrow">Booking unavailable</p>
          <h2>{unavailableMessage}</h2>
          <p>Please choose another showtime or try again shortly.</p>
          <Link className="action-button primary" href="/shows">View other shows</Link>
        </section>
      ) : null}

      {relatedShowtimes.length ? (
        <section className="same-day-showtimes">
          <p className="public-eyebrow">Same-day showtimes</p>
          <ShowtimeStrip showtimes={relatedShowtimes.map((item) => ({
            showId: item.showId,
            theatreId: item.theatreId,
            theatreName: item.theatreName,
            city: '',
            screenName: item.screenName,
            showTime: item.showTime,
            authorityMode: item.authorityMode,
            status: item.status,
            bookingEnabled: item.showId === show.showId ? show.bookingEnabled : undefined,
            priceStartsAt: null
          }))} />
        </section>
      ) : null}

      {show.bookingEnabled === false ? null : <BookingSeatPicker show={show} />}
    </section>
  );
}
