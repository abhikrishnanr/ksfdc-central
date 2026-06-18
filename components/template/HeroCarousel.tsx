import Link from 'next/link';
import type { CentralMovieSummary, PublicShowtimeSummary } from '../../lib/central-data';

export default function HeroCarousel({ movie, show }: { movie: CentralMovieSummary | null; show?: PublicShowtimeSummary | null }) {
  if (!movie) return null;
  const href = show ? `/book/${show.showId}` : `/movies/${movie.id}/book`;

  return (
    <section
      className="ksfdc-hero-carousel"
      style={movie.posterUrl ? { backgroundImage: `linear-gradient(90deg, rgba(4,8,14,0.98), rgba(4,8,14,0.45), rgba(4,8,14,0.92)), url("${movie.posterUrl}")` } : undefined}
    >
      <button className="hero-arrow left" type="button" aria-label="Previous featured movie">‹</button>
      <div className="hero-movie-copy">
        <p>In cinemas now</p>
        <h1>{movie.title}</h1>
        <span>{[movie.language, movie.certificate, movie.durationMinutes ? `${movie.durationMinutes} min` : null].filter(Boolean).join(' - ')}</span>
        <Link className="gold-button" href={href}>Book tickets</Link>
      </div>
      <button className="hero-arrow right" type="button" aria-label="Next featured movie">›</button>
      <div className="hero-dots" aria-hidden="true">
        <span className="active" />
        <span />
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
