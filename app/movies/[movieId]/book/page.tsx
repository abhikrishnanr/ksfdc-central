export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '../../../../components/premium-ui';
import { getMovieDetail, getPublicShowtimes, type PublicShowtimeSummary } from '../../../../lib/central-data';
import { getPublicShowStatus } from '../../../../lib/public-copy';

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function dateTabs(movieId: string, day: number, city?: string) {
  return [0, 1, 2].map((offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const params = new URLSearchParams();
    if (offset) params.set('day', String(offset));
    if (city) params.set('city', city);
    return {
      offset,
      active: day === offset,
      label: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : 'Day after',
      dateLabel: new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(date),
      href: `/movies/${movieId}/book${params.toString() ? `?${params.toString()}` : ''}`
    };
  });
}

function groupByTheatre(showtimes: PublicShowtimeSummary[]) {
  const groups = new Map<string, PublicShowtimeSummary[]>();
  for (const show of showtimes) groups.set(show.theatreId, [...(groups.get(show.theatreId) ?? []), show]);
  return Array.from(groups.entries()).map(([theatreId, shows]) => ({ theatreId, theatre: shows[0], shows }));
}

function money(value: number | null) {
  if (value == null) return 'Price varies';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default async function MovieBookingPage({ params, searchParams }: { params: Promise<{ movieId: string }>; searchParams?: Promise<{ city?: string; day?: string }> }) {
  const { movieId } = await params;
  const query = await searchParams;
  const day = Math.max(0, Math.min(2, Number(query?.day ?? 0) || 0));
  const { data: movie } = await getMovieDetail(movieId);
  if (!movie) notFound();
  const { data: showtimes } = await getPublicShowtimes({ movieId, city: query?.city, dayOffset: day });
  const theatres = groupByTheatre(showtimes);

  return (
    <section className="movie-booking-page">
      <header className="movie-booking-mini">
        <div
          className="mini-poster"
          style={movie.posterUrl ? { backgroundImage: `url("${movie.posterUrl}")` } : undefined}
          aria-label={`${movie.title} poster`}
        />
        <div>
          <p className="eyebrow">Choose your showtime</p>
          <h1>{movie.title}</h1>
          <p>{[movie.language, movie.certificate, movie.durationMinutes ? `${movie.durationMinutes} min` : null].filter(Boolean).join(' - ')}</p>
        </div>
      </header>
      <nav className="date-tab-bar" aria-label="Show date">
        {dateTabs(movie.id, day, query?.city).map((tab) => (
          <Link className={tab.active ? 'active' : ''} key={tab.offset} href={tab.href}>
            <strong>{tab.label}</strong>
            <span>{tab.dateLabel}</span>
          </Link>
        ))}
      </nav>
      {!theatres.length ? <EmptyState title="No shows available"><p>Try another date or city.</p></EmptyState> : null}
      <div className="theatre-show-list">
        {theatres.map((group) => (
          <article className="theatre-show-card dark" key={group.theatreId}>
            <div>
              <h3>{group.theatre.theatreName}</h3>
              <p>{group.theatre.city} - from {money(group.shows.reduce<number | null>((lowest, show) => show.priceStartsAt == null ? lowest : lowest == null ? show.priceStartsAt : Math.min(lowest, show.priceStartsAt), null))}</p>
            </div>
            <div className="showtime-strip">
              {group.shows.map((show) => {
                const status = getPublicShowStatus(show);
                const canBook = show.status === 'OPEN' && show.availableSeats > 0;
                return canBook ? (
                  <Link className="showtime-chip dark" href={`/book/${show.showId}`} key={show.showId}>
                    {formatTime(show.showTime)}
                    <small>{show.formats[0] ?? '2D'} - {show.availableSeats} seats</small>
                  </Link>
                ) : (
                  <span className="showtime-chip dark disabled" key={show.showId}>
                    {formatTime(show.showTime)}
                    <small>{status.label}</small>
                  </span>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
