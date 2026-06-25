export const revalidate = 30;

import { getMovieIdsWithUpcomingShows, getMovies } from '../../lib/central-data';
import { EmptyState, PageHeader } from '../../components/premium-ui';
import MovieCard from '../../components/template/MovieCard';

export default async function MoviesPage({ searchParams }: { searchParams?: Promise<{ city?: string }> }) {
  const params = await searchParams;
  const { dbStatus, data: movies } = await getMovies();
  const cityShows = params?.city && params.city !== 'Kerala' ? await getMovieIdsWithUpcomingShows(params.city) : null;
  const movieIds = cityShows ? new Set(cityShows.data) : null;
  const filteredMovies = movieIds ? movies.filter((movie) => movieIds.has(movie.id)) : movies;

  return (
    <section className="grid" style={{ gap: 24 }}>
      <PageHeader eyebrow="Film catalogue" title={params?.city ? `Movies in ${params.city}` : 'Movies'} description={dbStatus.ok ? 'Choose a movie and book tickets at partner theatres.' : dbStatus.message} />
      {!filteredMovies.length ? <EmptyState title="No movies found"><p>Try another city or check again later.</p></EmptyState> : null}
      <div className="movie-grid">
        {filteredMovies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} />
        ))}
      </div>
    </section>
  );
}
