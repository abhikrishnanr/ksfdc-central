import { NextRequest, NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getCentralDbPool } from '../../../../lib/db';
import { ensureCentralMirrorEventsTable } from '../../../../lib/sync';
import { verifyCentralSyncRequest } from '../../../../lib/sync-security';

export const dynamic = 'force-dynamic';

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;
const MAX_WAIT_MS = 25000;

function clampNumber(value: unknown, defaultValue: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  await ensureCentralMirrorEventsTable();
  const securityError = await verifyCentralSyncRequest(request, '');
  if (securityError) return securityError;

  const theatreId = request.nextUrl.searchParams.get('theatreId');
  const afterSequence = Number(request.nextUrl.searchParams.get('afterSequence') ?? 0);
  const limit = clampNumber(request.nextUrl.searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const waitMs = clampNumber(request.nextUrl.searchParams.get('waitMs'), 0, 0, MAX_WAIT_MS);

  if (!theatreId) {
    return NextResponse.json({ success: false, error: 'theatreId is required.' }, { status: 400 });
  }

  const normalizedAfterSequence = Number.isFinite(afterSequence) ? afterSequence : 0;
  const startedAt = Date.now();
  let rows: RowDataPacket[] = [];

  do {
    [rows] = await getCentralDbPool().query<RowDataPacket[]>(
      `SELECT event_id AS eventId, sequence_no AS sequenceNo, theatre_id AS theatreId,
              show_id AS showId, event_type AS eventType, payload
       FROM central_mirror_events
       WHERE theatre_id = ? AND sequence_no > ?
       ORDER BY sequence_no ASC
       LIMIT ?`,
      [theatreId, normalizedAfterSequence, limit]
    );
    if (rows.length || waitMs === 0 || Date.now() - startedAt >= waitMs) break;
    await sleep(500);
  } while (true);

  const events = rows.map((row) => ({
    eventId: String(row.eventId),
    sequenceNo: Number(row.sequenceNo),
    theatreId: String(row.theatreId),
    showId: String(row.showId),
    eventType: String(row.eventType),
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
  }));

  return NextResponse.json({
    success: true,
    events,
    latestSequence: events.reduce((max, event) => Math.max(max, event.sequenceNo), normalizedAfterSequence),
    hasMore: events.length === limit
  });
}
