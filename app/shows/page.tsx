export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getPublicShowtimes, type PublicShowtimeSummary } from '../../lib/central-data';
import { EmptyState, PageHeader } from '../../components/premium-ui';
import { midnightShowNote } from '../../lib/show-time';

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function dateTabs(day: number, city?: string, movie?: string, theatre?: string) {
  return [0, 1, 2].map((offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const params = new URLSearchParams();
    if (offset) params.set('day', String(offset));
    if (city) params.set('city', city);
    if (movie) params.set('movie', movie);
    if (theatre) params.set('theatre', theatre);
    return {
      offset,
      active: offset === day,
      label: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : 'Day after',
      dateLabel: new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(date),
      href: `/shows${params.toString() ? `?${params.toString()}` : ''}`
    };
  });
}

function groupShows(shows: PublicShowtimeSummary[]) {
  const movieMap = new Map<string, PublicShowtimeSummary[]>();
  for (const show of shows) movieMap.set(show.movieId, [...(movieMap.get(show.movieId) ?? []), show]);
  return Array.from(movieMap.entries()).map(([movieId, movieShows]) => {
    const theatreMap = new Map<string, PublicShowtimeSummary[]>();
    for (const show of movieShows) theatreMap.set(show.theatreId, [...(theatreMap.get(show.theatreId) ?? []), show]);
    return {
      movieId,
      movie: movieShows[0],
      theatres: Array.from(theatreMap.entries()).map(([theatreId, theatreShows]) => ({ theatreId, theatre: theatreShows[0], shows: theatreShows }))
    };
  });
}

function money(value: number | null) {
  if (value == null) return 'Price varies';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default async function ShowsPage({ searchParams }: { searchParams?: Promise<{ movie?: string; theatre?: string; city?: string; day?: string }> }) {
  const params = await searchParams;
  const day = Math.max(0, Math.min(2, Number(params?.day ?? 0) || 0));
  const { dbStatus, data: shows } = await getPublicShowtimes({ dayOffset: day, city: params?.city, movieId: params?.movie, theatreId: params?.theatre });
  const grouped = groupShows(shows);

  return (
    <section className="public-listing-page">
      <PageHeader eyebrow="Showtimes" title="Choose your showtime" description={dbStatus.ok ? 'Browse movies, theatres, and available seats for your selected date.' : 'Showtimes are temporarily unavailable.'} />
      <nav className="date-tab-bar" aria-label="Show date">
        {dateTabs(day, params?.city, params?.movie, params?.theatre).map((tab) => (
          <Link className={tab.active ? 'active' : ''} key={tab.offset} href={tab.href}>
            <strong>{tab.label}</strong>
            <span>{tab.dateLabel}</span>
          </Link>
        ))}
      </nav>
      {!grouped.length ? <EmptyState title="No shows available"><p>Try another date or city.</p></EmptyState> : null}
      <div className="movie-show-groups">
        {grouped.map((group) => (
          <section className="movie-show-section" key={group.movieId}>
            <div
              className="movie-show-poster"
              style={group.movie.moviePosterUrl ? { backgroundImage: `url("${group.movie.moviePosterUrl}")` } : undefined}
              aria-label={`${group.movie.movieTitle} poster`}
            />
            <div className="movie-show-content">
              <div>
                <p className="eyebrow">{[group.movie.language, group.movie.certificate, group.movie.durationMinutes ? `${group.movie.durationMinutes} min` : null].filter(Boolean).join(' - ')}</p>
                <h2>{group.movie.movieTitle}</h2>
                <div className="public-chip-row">
                  {group.movie.genres.slice(0, 4).map((genre) => <span className="public-chip" key={genre}>{genre}</span>)}
                  {group.movie.formats.slice(0, 3).map((format) => <span className="public-chip strong" key={format}>{format}</span>)}
                </div>
              </div>
              <div className="theatre-show-list">
                {group.theatres.map((theatreGroup) => (
                  <article className="theatre-show-card dark" key={theatreGroup.theatreId}>
                    <div>
                      <h3>{theatreGroup.theatre.theatreName}</h3>
                      <p>{theatreGroup.theatre.city} - from {money(theatreGroup.shows.reduce<number | null>((lowest, show) => show.priceStartsAt == null ? lowest : lowest == null ? show.priceStartsAt : Math.min(lowest, show.priceStartsAt), null))}</p>
                    </div>
                    <div className="showtime-strip">
                      {theatreGroup.shows.map((show) => {
                        const canBook = show.bookingEnabled !== false && show.status === 'OPEN' && show.availableSeats > 0;
                        return canBook ? (
                          <Link className="showtime-chip dark" href={`/book/${show.showId}`} key={show.showId}>
                            {formatTime(show.showTime)}
                            {midnightShowNote(show.showTime) ? <em>Midnight show</em> : null}
                            <small>{show.formats[0] ?? '2D'} - {show.availableSeats} seats</small>
                          </Link>
                        ) : (
                          <span className="showtime-chip dark disabled" key={show.showId}>
                            {formatTime(show.showTime)}
                            {midnightShowNote(show.showTime) ? <em>Midnight show</em> : null}
                            <small>{show.reason === 'BOOKING_CUTOFF_REACHED' ? 'Booking closed' : 'Temporarily unavailable'}</small>
                          </span>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
