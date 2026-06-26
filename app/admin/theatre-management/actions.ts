'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireCentralRole } from '../../../lib/auth';
import {
  cancelShow,
  createScreenWithSeatMap,
  createShow,
  createTheatre,
  updateScreen,
  updateScreenSeatMap,
  updateShowSchedule,
  updateTheatre
} from '../../../lib/admin-management';

function record(formData: FormData) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    output[key] = typeof value === 'string' ? value.trim() : value.name;
  }
  return output;
}

function requiredString(payload: Record<string, unknown>, key: string) {
  const value = String(payload[key] ?? '').trim();
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

async function session() {
  return requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
}

function refreshManagement(paths: string[] = []) {
  revalidatePath('/admin/theatre-management');
  for (const path of paths) revalidatePath(path);
}

export async function createTheatreAction(formData: FormData) {
  const admin = await session();
  const payload = record(formData);
  requiredString(payload, 'code');
  requiredString(payload, 'name');
  requiredString(payload, 'city');
  await createTheatre(admin, payload);
  refreshManagement();
  redirect('/admin/theatre-management?tab=theatres');
}

export async function updateTheatreAction(formData: FormData) {
  const admin = await session();
  const payload = record(formData);
  requiredString(payload, 'id');
  await updateTheatre(admin, payload);
  refreshManagement();
  redirect('/admin/theatre-management?tab=theatres');
}

export async function createScreenAction(formData: FormData) {
  const admin = await session();
  const payload = record(formData);
  requiredString(payload, 'theatreId');
  requiredString(payload, 'code');
  requiredString(payload, 'name');
  requiredString(payload, 'seatMapJson');
  await createScreenWithSeatMap(admin, payload);
  refreshManagement(['/admin/seat-layouts']);
  redirect('/admin/theatre-management?tab=screens');
}

export async function createSeatMapVersionAction(formData: FormData) {
  const admin = await session();
  const payload = record(formData);
  requiredString(payload, 'screenId');
  requiredString(payload, 'seatMapJson');
  await updateScreenSeatMap(admin, payload);
  refreshManagement(['/admin/seat-layouts']);
  redirect('/admin/theatre-management?tab=screens');
}

export async function updateScreenAction(formData: FormData) {
  const admin = await session();
  const payload = record(formData);
  requiredString(payload, 'id');
  requiredString(payload, 'code');
  requiredString(payload, 'name');
  await updateScreen(admin, payload);
  refreshManagement(['/admin/seat-layouts']);
  redirect('/admin/theatre-management?tab=screens');
}

export async function createShowAction(formData: FormData) {
  const admin = await session();
  const payload = record(formData);
  requiredString(payload, 'theatreId');
  requiredString(payload, 'screenId');
  requiredString(payload, 'movieId');
  requiredString(payload, 'showDate');
  requiredString(payload, 'showTime');
  await createShow(admin, payload);
  refreshManagement(['/shows']);
  redirect('/admin/theatre-management?tab=scheduling');
}

export async function updateShowAction(formData: FormData) {
  const admin = await session();
  const payload = record(formData);
  const showId = requiredString(payload, 'showId');

  // Keep update semantics explicit. Never allow an edit submission to be treated
  // as a create request because an identifier was omitted or blank.
  payload.showId = showId;
  await updateShowSchedule(admin, payload);
  refreshManagement(['/shows']);
  redirect('/admin/theatre-management?tab=scheduling');
}

export async function cancelShowAction(formData: FormData) {
  const admin = await session();
  const payload = record(formData);
  requiredString(payload, 'showId');
  requiredString(payload, 'reason');
  await cancelShow(admin, payload);
  refreshManagement(['/shows']);
  redirect('/admin/theatre-management?tab=scheduling');
}
