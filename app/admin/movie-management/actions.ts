'use server';

import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
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

function redirectWithMovieError(formData: FormData, error: unknown): never {
  unstable_rethrow(error);
  const message = error instanceof Error ? error.message : 'Unable to save movie.';
  const returnTo = String(formData.get('returnTo') ?? '/admin/movie-management');
  const separator = returnTo.includes('?') ? '&' : '?';
  redirect(`${returnTo}${separator}movieError=${encodeURIComponent(message)}`);
}

export async function createMovieAction(formData: FormData) {
  let uploadedPosterPath: string | null = null;
  try {
    const session = await requireCentralRole(['SUPER_ADMIN']);
    const prepared = await moviePayload(formData);
    const payload = prepared.payload;
    uploadedPosterPath = prepared.uploadedPosterPath;
    const result = await createMovie(session, payload);
    refreshMovieRoutes(result.id);
  } catch (error) {
    await removeStoredPoster(uploadedPosterPath);
    redirectWithMovieError(formData, error);
  }
}

export async function updateMovieAction(formData: FormData) {
  let uploadedPosterPath: string | null = null;
  try {
    const session = await requireCentralRole(['SUPER_ADMIN']);
    const prepared = await moviePayload(formData);
    const payload = prepared.payload;
    uploadedPosterPath = prepared.uploadedPosterPath;
    const result = await updateMovie(session, payload);
    refreshMovieRoutes(result.id);
  } catch (error) {
    await removeStoredPoster(uploadedPosterPath);
    redirectWithMovieError(formData, error);
  }
}

export async function deleteMovieAction(formData: FormData) {
  try {
    const session = await requireCentralRole(['SUPER_ADMIN']);
    await deleteMovie(session, String(formData.get('id') ?? ''));
    refreshMovieRoutes();
  } catch (error) {
    redirectWithMovieError(formData, error);
  }
}
