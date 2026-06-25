// This page only reads catalogue data (synopsis, cast, crew) which is now
// cached in lib/central-data.ts. Seat availability and booking happen on the
// dedicated /book/[showId] route, which stays fully dynamic. Revalidating
// every 30s lets Next.js serve this page instantly from cache instead of
// blocking on a fresh render for every visit.
export const revalidate = 30;

import { notFound } from 'next/navigation';
import Link from 'next/link';
import MovieDetailLayout from '../../../components/template/MovieDetailLayout';
import MovieHero from '../../../components/template/MovieHero';
import { PremiumCard } from '../../../components/premium-ui';
import { getMovieDetail } from '../../../lib/central-data';

export default async function MovieDetailPage({ params }: { params: Promise<{ movieId: string }> }) {
  const { movieId } = await params;
  const { data: movie } = await getMovieDetail(movieId);
  if (!movie) notFound();

  return (
    <MovieDetailLayout>
      <MovieHero movie={movie} />

      <section className="public-content-grid">
        <PremiumCard className="public-info-card">
          <p className="public-eyebrow">Synopsis</p>
          <h2>About the movie</h2>
          <p>{movie.synopsis ?? 'Synopsis will be updated soon.'}</p>
        </PremiumCard>

        <PremiumCard className="public-info-card">
          <p className="public-eyebrow">Cast and crew</p>
          <h2>People</h2>
          <div className="people-grid">
            {movie.cast.slice(0, 8).map((member) => (
              <div className="person-pill" key={`${member.name}-${member.characterName ?? ''}`}>
                <strong>{member.name}</strong>
                <span>{[member.characterName, member.role].filter(Boolean).join(' - ')}</span>
              </div>
            ))}
            {movie.crew.director ? (
              <div className="person-pill">
                <strong>{movie.crew.director.name}</strong>
                <span>Director</span>
              </div>
            ) : null}
            {movie.crew.musicDirectors.map((name) => (
              <div className="person-pill" key={name}>
                <strong>{name}</strong>
                <span>Music</span>
              </div>
            ))}
          </div>
        </PremiumCard>
      </section>
      <div className="movie-detail-book-bar">
        <Link className="action-button primary" href={`/movies/${movie.id}/book`}>Book tickets</Link>
      </div>
    </MovieDetailLayout>
  );
}
