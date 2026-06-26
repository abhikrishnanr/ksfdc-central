'use server';

import { revalidatePath } from 'next/cache';
import { requireCentralRole } from '../../../lib/auth';
import {
  cancelShow,
  createScreenWithSeatMap,
  createShow,
  createTheatre,
  updateScreenSeatMap,
  updateShowSchedule,
  updateTheatre
} from '../../../lib/admin-management';

function record(formData: FormData) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) output[key] = typeof value === 'string' ? value : value.name;
  return output;
}

async function session() {
  return requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
}

export async function createTheatreAction(formData: FormData) {
  const admin = await session();
  await createTheatre(admin, record(formData));
  revalidatePath('/admin/theatre-management');
}

export async function updateTheatreAction(formData: FormData) {
  const admin = await session();
  await updateTheatre(admin, record(formData));
  revalidatePath('/admin/theatre-management');
}

export async function createScreenAction(formData: FormData) {
  const admin = await session();
  await createScreenWithSeatMap(admin, record(formData));
  revalidatePath('/admin/theatre-management');
  revalidatePath('/admin/seat-layouts');
}

export async function createSeatMapVersionAction(formData: FormData) {
  const admin = await session();
  await updateScreenSeatMap(admin, record(formData));
  revalidatePath('/admin/theatre-management');
  revalidatePath('/admin/seat-layouts');
}

export async function createShowAction(formData: FormData) {
  const admin = await session();
  await createShow(admin, record(formData));
  revalidatePath('/admin/theatre-management');
  revalidatePath('/shows');
}

export async function updateShowAction(formData: FormData) {
  const admin = await session();
  await updateShowSchedule(admin, record(formData));
  revalidatePath('/admin/theatre-management');
  revalidatePath('/shows');
}

export async function cancelShowAction(formData: FormData) {
  const admin = await session();
  await cancelShow(admin, record(formData));
  revalidatePath('/admin/theatre-management');
  revalidatePath('/shows');
}
