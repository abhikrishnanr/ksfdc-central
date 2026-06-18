export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getAuthorityAwareBookingShow, getCentralBookingUnavailableMessage, getTodaysShows } from '../../../lib/central-data';
import { ErrorState, PageHeader, StatusBadge } from '../../../components/premium-ui';
import { formatPublicError, getPublicShowStatus } from '../../../lib/public-copy';
import BookingSeatPicker from './BookingSeatPicker';
import ShowtimeStrip from '../../../components/template/ShowtimeStrip';

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', dateStyle: 'medium' }).format(new Date(value));
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

      <section className="movie-booking-hero public">
        <div
          className="movie-booking-poster"
          style={show.moviePosterUrl ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.45)), url("${show.moviePosterUrl}")` } : undefined}
          aria-label={`${show.movieTitle} poster`}
        />
        <div className="page-header">
          <p className="eyebrow">Choose your seats</p>
          <h1>{show.movieTitle}</h1>
          <p>{show.theatreName} - {show.screenName} - {formatTime(show.showTime)}</p>
          <div className="meta-row">
            <StatusBadge tone={publicStatus.tone}>{publicStatus.label}</StatusBadge>
            {show.language ? <StatusBadge tone="neutral">{show.language}</StatusBadge> : null}
            {show.certificate ? <StatusBadge tone="neutral">{show.certificate}</StatusBadge> : null}
            {show.durationMinutes ? <StatusBadge tone="neutral">{show.durationMinutes} min</StatusBadge> : null}
            {show.formats.map((format) => <StatusBadge tone="violet" key={format}>{format}</StatusBadge>)}
            <Link className="action-button" href="/shows">All shows</Link>
          </div>
        </div>
      </section>

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
            priceStartsAt: null
          }))} />
        </section>
      ) : null}

      {show.bookingEnabled === false ? null : <BookingSeatPicker show={show} />}
    </section>
  );
}
