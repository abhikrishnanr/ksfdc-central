'use client';

import Image from 'next/image';
import Link from 'next/link';
import { CalendarDays, Clock3, Play, Star, Ticket } from 'lucide-react';
import { useState } from 'react';
import type { CentralMovieDetail } from '../../lib/central-data';

function youtubeId(url?: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
    const embedPart = parsed.pathname.split('/').filter(Boolean).find((part, index, parts) => parts[index - 1] === 'embed');
    return embedPart ?? null;
  } catch {
    return null;
  }
}

function releaseDateLabel(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function MovieHero({ movie }: { movie: CentralMovieDetail }) {
  const [playTrailer, setPlayTrailer] = useState(false);
  const trailerId = youtubeId(movie.trailerUrl);
  const trailerUrl = trailerId ? `https://www.youtube.com/embed/${trailerId}?autoplay=1&controls=1&rel=0&playsinline=1` : null;
  const releaseDate = releaseDateLabel(movie.releaseDate);
  const backdropStyle = movie.posterUrl
    ? { backgroundImage: `linear-gradient(90deg, rgba(5,9,14,0.98), rgba(5,9,14,0.86), rgba(5,9,14,0.96)), url("${movie.posterUrl}")` }
    : undefined;

  return (
    <section className="movie-detail-hero">
      <div className="movie-detail-backdrop redesigned" style={backdropStyle}>
        <div className="movie-detail-poster-wrap">
          <div className="movie-detail-poster" aria-label={`${movie.title} poster`}>
            {movie.posterUrl ? (
              <Image
                src={movie.posterUrl}
                alt={`${movie.title} poster`}
                width={480}
                height={720}
                sizes="(max-width: 760px) 46vw, 240px"
                priority
              />
            ) : null}
          </div>
        </div>

        <div className="movie-detail-title">
          <p className="public-eyebrow">Now showing</p>
          <h1>{movie.title}</h1>
          <div className="movie-detail-meta-row">
            <span><Star size={16} />{movie.certificate ?? 'UA'}</span>
            <span><Clock3 size={16} />{movie.durationMinutes ? `${movie.durationMinutes} min` : 'Runtime soon'}</span>
            {releaseDate ? <span><CalendarDays size={16} />{releaseDate}</span> : null}
          </div>
          <p className="movie-detail-synopsis">{movie.synopsis ?? 'Synopsis will be updated soon.'}</p>
          <div className="public-chip-row">
            {[movie.language, ...movie.genres, ...movie.formats].filter(Boolean).map((item) => (
              <span className="public-chip strong" key={item}>{item}</span>
            ))}
          </div>
          <div className="movie-detail-actions">
            <Link className="action-button primary" href={`/movies/${movie.id}/book`}><Ticket size={18} /> Book tickets</Link>
            {movie.trailerUrl ? <a className="action-button" href="#movie-trailer">Watch trailer</a> : null}
          </div>
        </div>

        <aside className="movie-trailer-card" id="movie-trailer">
          <div className="movie-trailer-frame">
            {playTrailer && trailerUrl ? (
              <iframe
                title={`${movie.title} trailer`}
                src={trailerUrl}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <button
                type="button"
                className="movie-trailer-placeholder"
                onClick={() => setPlayTrailer(true)}
                disabled={!trailerUrl}
                style={movie.posterUrl ? { backgroundImage: `linear-gradient(180deg, rgba(5,9,14,0.28), rgba(5,9,14,0.82)), url("${movie.posterUrl}")` } : undefined}
              >
                <span><Play size={28} fill="currentColor" /></span>
                <strong>{trailerUrl ? 'Play trailer' : 'Trailer coming soon'}</strong>
                <small>Click to load the video</small>
              </button>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
