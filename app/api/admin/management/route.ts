import { NextRequest, NextResponse } from 'next/server';
import {
  adminErrorPayload,
  cancelShow,
  createMovie,
  createScreenWithSeatMap,
  createShow,
  createTheatre,
  deleteMovie,
  deleteTheatre,
  ensureAdminManagementSchema,
  listAdminManagementData,
  mutationResult,
  requireAdminApi,
  updateMovie,
  updateScreen,
  updateScreenSeatMap,
  updateShowSchedule,
  updateTheatre,
  validateSeatMapJson
} from '../../../../lib/admin-management';

export const dynamic = 'force-dynamic';

function responseFor(payload: ReturnType<typeof adminErrorPayload>, status = 200) {
  return NextResponse.json(payload, { status: payload.success ? status : payload.error === 'UNAUTHENTICATED' ? 401 : payload.error === 'FORBIDDEN' ? 403 : payload.error === 'NOT_FOUND' ? 404 : payload.error.includes('REQUIRED') || payload.error.includes('OVERLAP') || payload.error.includes('PROTECTED') || payload.error.includes('LOCAL_THEATRE') ? 409 : 400 });
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdminApi(['SUPER_ADMIN', 'THEATRE_ADMIN', 'FINANCE_VIEWER']);
    const data = await listAdminManagementData(session.theatreId);
    if (request.nextUrl.searchParams.get('kind') === 'seat-map-preview') {
      const json = request.nextUrl.searchParams.get('json');
      return NextResponse.json({ success: true, preview: validateSeatMapJson(json ?? '{}') });
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return responseFor(adminErrorPayload(error));
  }
}

export async function POST(request: NextRequest) {
  await ensureAdminManagementSchema();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'INVALID_JSON', message: 'Request body must be JSON.' }, { status: 400 });
  }

  try {
    const session = await requireAdminApi(['SUPER_ADMIN', 'THEATRE_ADMIN']);
    const action = String(body.action ?? '').trim();
    const payload = (body.payload && typeof body.payload === 'object' ? body.payload : body) as Record<string, unknown>;

    if (action === 'THEATRE_CREATE') return responseFor(await mutationResult(() => createTheatre(session, payload)), 201);
    if (action === 'THEATRE_UPDATE') return responseFor(await mutationResult(() => updateTheatre(session, payload)));
    if (action === 'THEATRE_DELETE') return responseFor(await mutationResult(async () => { await deleteTheatre(session, String(payload.id ?? '')); return { id: String(payload.id ?? '') }; }));
    if (action === 'SCREEN_CREATE') return responseFor(await mutationResult(() => createScreenWithSeatMap(session, payload)), 201);
    if (action === 'SCREEN_UPDATE') return responseFor(await mutationResult(() => updateScreen(session, payload)));
    if (action === 'SCREEN_SEAT_MAP_VERSION') return responseFor(await mutationResult(() => updateScreenSeatMap(session, payload)));
    if (action === 'MOVIE_CREATE') return responseFor(await mutationResult(() => createMovie(session, payload)), 201);
    if (action === 'MOVIE_UPDATE') return responseFor(await mutationResult(() => updateMovie(session, payload)));
    if (action === 'MOVIE_DELETE') return responseFor(await mutationResult(async () => { await deleteMovie(session, String(payload.id ?? '')); return { id: String(payload.id ?? '') }; }));
    if (action === 'SHOW_CREATE') return responseFor(await mutationResult(() => createShow(session, payload)), 201);
    if (action === 'SHOW_UPDATE') return responseFor(await mutationResult(() => updateShowSchedule(session, payload)));
    if (action === 'SHOW_CANCEL') return responseFor(await mutationResult(() => cancelShow(session, payload)));
    if (action === 'SEAT_MAP_VALIDATE') return NextResponse.json({ success: true, preview: validateSeatMapJson(payload.seatMapJson) });

    return NextResponse.json({ success: false, error: 'UNKNOWN_ACTION', message: 'Unknown management action.' }, { status: 400 });
  } catch (error) {
    return responseFor(adminErrorPayload(error));
  }
}
