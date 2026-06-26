'use server';

import { revalidatePath } from 'next/cache';
import { requireCentralRole } from '../../../lib/auth';
import { deleteMovie, upsertMovie } from '../../../lib/admin-management';

function record(formData: FormData) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) output[key] = typeof value === 'string' ? value : value.name;
  return output;
}

export async function upsertMovieAction(formData: FormData) {
  const session = await requireCentralRole(['SUPER_ADMIN']);
  await upsertMovie(session, record(formData));
  revalidatePath('/admin/movie-management');
  revalidatePath('/movies');
  revalidatePath('/');
}

export async function deleteMovieAction(formData: FormData) {
  const session = await requireCentralRole(['SUPER_ADMIN']);
  await deleteMovie(session, String(formData.get('id') ?? ''));
  revalidatePath('/admin/movie-management');
  revalidatePath('/movies');
  revalidatePath('/');
}
