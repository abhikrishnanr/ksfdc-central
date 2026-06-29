const LOCAL_SEED_POSTERS: Record<string, string> = {
  drishyam_3_2026: '/seed/movie-posters/Drishyam_3_poster.jpg',
  athiradi_2026: '/seed/movie-posters/Athiradi.jpg',
  mollywood_times_2026: '/seed/movie-posters/mollywood-times_.jpg',
  secret_of_kalinga_2026: '/seed/movie-posters/secret_of_kalinga.jpg',
  varavu_2026: '/seed/movie-posters/varavu.jpg'
};

export function localSeedPosterForMovie(movieId: string | null | undefined) {
  return movieId ? LOCAL_SEED_POSTERS[movieId] ?? null : null;
}

export function preferredMoviePosterUrl(movieId: string | null | undefined, posterUrl: string | null | undefined) {
  return localSeedPosterForMovie(movieId) ?? posterUrl ?? null;
}
