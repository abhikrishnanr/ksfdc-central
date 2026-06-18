import Link from 'next/link';
import { ArrowRight, Ticket } from 'lucide-react';
import type { CentralMovieSummary } from '../../lib/central-data';

function isNewMovie(releaseDate?: string | null) {
  if (!releaseDate) return false;
  const diff = Date.now() - new Date(`${releaseDate}T00:00:00`).getTime();
  return diff >= 0 && diff <= 1000 * 60 * 60 * 24 * 30;
}

export default function NowShowingRail({ movies }: { movies: CentralMovieSummary[] }) {
  return (
    <section className="now-showing-section">
      <div className="section-title-row"><h2>Now Showing</h2><Link href="/movies">View all <ArrowRight size={16} /></Link></div>
      <div className="now-showing-rail">
        {movies.map((movie) => (
          <article className="poster-movie-card" key={movie.id}>
            <Link href={`/movies/${movie.id}`}>
              <div className="poster-frame" style={movie.posterUrl ? { backgroundImage: `url("${movie.posterUrl}")` } : undefined}>{isNewMovie(movie.releaseDate) ? <span className="new-badge">New</span> : null}</div>
              <div className="poster-card-copy"><h3>{movie.title}</h3><p>{[movie.language, movie.genres[0]].filter(Boolean).join(' | ')}</p>{movie.certificate ? <span>{movie.certificate}</span> : null}</div>
            </Link>
            <Link className="book-now-outline" href={`/movies/${movie.id}/book`}><Ticket size={16} /> Book now</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
