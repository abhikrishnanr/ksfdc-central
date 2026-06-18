'use client';

import Link from 'next/link';
import { useState } from 'react';

export type MovieCardMovie = {
  id: string;
  title: string;
  language?: string | null;
  durationMinutes?: number | null;
  certificate?: string | null;
  posterUrl?: string | null;
  trailerUrl?: string | null;
  synopsis?: string | null;
  genres?: string[];
  formats?: string[];
  activeShowCount?: number;
};

export default function MovieCard({ movie }: { movie: MovieCardMovie }) {
  const [posterFailed, setPosterFailed] = useState(false);
  const hasPoster = Boolean(movie.posterUrl && !posterFailed);

  return (
    <article className="public-movie-card">
      <div className="public-movie-poster">
        {hasPoster ? (
          <img src={movie.posterUrl ?? ''} alt={`${movie.title} poster`} onError={() => setPosterFailed(true)} />
        ) : (
          <div className="public-movie-poster-fallback">
            <div>
              <p>KSFDC</p>
              <h3>{movie.title}</h3>
            </div>
          </div>
        )}
        {movie.certificate ? <span className="public-certificate">{movie.certificate}</span> : null}
      </div>
      <div className="public-movie-card-body">
        <div>
          <h2>{movie.title}</h2>
          <p>
            {[movie.language, movie.durationMinutes ? `${movie.durationMinutes} min` : null].filter(Boolean).join(' - ')}
          </p>
        </div>
        {movie.genres?.length ? (
          <div className="public-chip-row">
            {movie.genres.slice(0, 4).map((genre) => <span className="public-chip" key={genre}>{genre}</span>)}
          </div>
        ) : null}
        {movie.formats?.length ? (
          <div className="public-chip-row">
            {movie.formats.slice(0, 3).map((format) => <span className="public-chip strong" key={format}>{format}</span>)}
          </div>
        ) : null}
        {movie.synopsis ? <p>{movie.synopsis}</p> : null}
        <div className="meta-row">
          <Link className="action-button primary" href={`/movies/${movie.id}`}>Book tickets</Link>
        </div>
      </div>
    </article>
  );
}
