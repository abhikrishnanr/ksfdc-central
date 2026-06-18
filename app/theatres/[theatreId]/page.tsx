export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState, PageHeader } from '../../../components/premium-ui';
import { getTheatreDetail } from '../../../lib/central-data';

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function money(value: number | null) {
  if (value == null) return 'Price varies';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default async function TheatreDetailPage({ params }: { params: Promise<{ theatreId: string }> }) {
  const { theatreId } = await params;
  const { data: theatre } = await getTheatreDetail(theatreId);
  if (!theatre) notFound();

  return (
    <section className="public-listing-page">
      <PageHeader
        eyebrow={theatre.city}
        title={theatre.name}
        description={`${theatre.screenCount} screen(s) with upcoming shows.`}
      />
      {!theatre.showtimes.length ? <EmptyState title="No shows today"><p>Showtimes for this theatre will appear here.</p></EmptyState> : null}
      <div className="public-theatre-show-list">
        {theatre.showtimes.map((show) => {
          const canBook = show.bookingEnabled !== false && show.status === 'OPEN' && show.availableSeats > 0;
          return (
            <article className="public-show-row" key={show.showId}>
              <div>
                <h2>{show.movieTitle}</h2>
                <p>{[show.language, show.durationMinutes ? `${show.durationMinutes} min` : null, show.certificate].filter(Boolean).join(' - ')}</p>
                <p>{show.screenName} - {formatTime(show.showTime)} - from {money(show.priceStartsAt)}</p>
              </div>
              {canBook ? (
                <Link className="showtime-chip dark" href={`/book/${show.showId}`}>
                  {formatTime(show.showTime)}
                  <small>Book - {show.availableSeats} seats</small>
                </Link>
              ) : (
                <span className="showtime-chip dark disabled" aria-disabled="true">
                  {formatTime(show.showTime)}
                  <small>Temporarily unavailable</small>
                </span>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
