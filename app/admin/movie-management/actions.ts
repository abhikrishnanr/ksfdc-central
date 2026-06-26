'use server';

import { revalidatePath } from 'next/cache';
import { requireCentralRole } from '../../../lib/auth';
import { createMovie, deleteMovie, updateMovie } from '../../../lib/admin-management';
import { removeStoredPoster, storeMoviePoster } from '../../../lib/poster-storage';

function record(formData: FormData) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;
    output[key] = value;
  }
  return output;
}

async function moviePayload(formData: FormData) {
  const payload = record(formData);
  const poster = await storeMoviePoster(formData.get('posterFile') instanceof File ? formData.get('posterFile') as File : null);
  if (poster) {
    payload.posterPath = poster.path;
    payload.posterFileName = poster.fileName;
    payload.posterContentType = poster.contentType;
    payload.posterSizeBytes = poster.sizeBytes;
  }
  return { payload, uploadedPosterPath: poster?.path ?? null };
}

function refreshMovieRoutes(movieId?: string | null) {
  revalidatePath('/admin/movie-management');
  revalidatePath('/admin/theatre-management');
  revalidatePath('/movies');
  revalidatePath('/');
  if (movieId) {
    revalidatePath(`/movies/${movieId}`);
    revalidatePath(`/movies/${movieId}/book`);
  }
}

export async function createMovieAction(formData: FormData) {
  const session = await requireCentralRole(['SUPER_ADMIN']);
  const { payload, uploadedPosterPath } = await moviePayload(formData);
  try {
    const result = await createMovie(session, payload);
    refreshMovieRoutes(result.id);
  } catch (error) {
    await removeStoredPoster(uploadedPosterPath);
    throw error;
  }
}

export async function updateMovieAction(formData: FormData) {
  const session = await requireCentralRole(['SUPER_ADMIN']);
  const { payload, uploadedPosterPath } = await moviePayload(formData);
  try {
    const result = await updateMovie(session, payload);
    refreshMovieRoutes(result.id);
  } catch (error) {
    await removeStoredPoster(uploadedPosterPath);
    throw error;
  }
}

export async function deleteMovieAction(formData: FormData) {
  const session = await requireCentralRole(['SUPER_ADMIN']);
  await deleteMovie(session, String(formData.get('id') ?? ''));
  refreshMovieRoutes();
}
