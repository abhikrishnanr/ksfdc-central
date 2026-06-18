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

export default function MovieHero({ movie }: { movie: CentralMovieDetail }) {
  const trailerId = youtubeId(movie.trailerUrl);
  const embedUrl = trailerId ? `https://www.youtube.com/embed/${trailerId}?autoplay=1&mute=1&controls=1&rel=0&playsinline=1` : null;

  return (
    <section className="movie-detail-hero">
      <div
        className="movie-detail-backdrop"
        style={movie.posterUrl ? { backgroundImage: `linear-gradient(90deg, rgba(5,6,8,0.96), rgba(5,6,8,0.7), rgba(5,6,8,0.94)), url("${movie.posterUrl}")` } : undefined}
      >
        <div
          className="movie-detail-poster"
          style={movie.posterUrl ? { backgroundImage: `url("${movie.posterUrl}")` } : undefined}
          aria-label={`${movie.title} poster`}
        />
        <div className="movie-detail-title">
          <p className="public-eyebrow">Now showing</p>
          <h1>{movie.title}</h1>
          <p>{[movie.language, movie.durationMinutes ? `${movie.durationMinutes} min` : null, movie.certificate].filter(Boolean).join(' - ')}</p>
          <div className="public-chip-row">
            {movie.genres.map((genre) => <span className="public-chip" key={genre}>{genre}</span>)}
            {movie.formats.map((format) => <span className="public-chip strong" key={format}>{format}</span>)}
          </div>
        </div>
      </div>
      {embedUrl ? (
        <div className="movie-trailer-frame">
          <iframe
            title={`${movie.title} trailer`}
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      ) : null}
    </section>
  );
}
