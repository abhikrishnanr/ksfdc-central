import { NextRequest, NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getCentralDbPool } from '../../../../lib/db';
import { ensureCentralHeartbeatTables } from '../../../../lib/sync';

export const dynamic = 'force-dynamic';

const DEFAULT_THEATRE_ID = 'TH_TVM001';
const ONLINE_THRESHOLD_SECONDS = 60;

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }

  return undefined;
}

export async function GET(request: NextRequest) {
  await ensureCentralHeartbeatTables();

  const theatreId = firstNonEmpty(
    request.nextUrl.searchParams.get('theatreId'),
    process.env.THEATRE_ID,
    DEFAULT_THEATRE_ID
  ) ?? DEFAULT_THEATRE_ID;
  const theatreCode = firstNonEmpty(
    request.nextUrl.searchParams.get('theatreCode'),
    process.env.THEATRE_CODE,
    'TVM001'
  ) ?? 'TVM001';

  const [rows] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT theatre_id AS theatreId,
            theatre_code AS theatreCode,
            status,
            last_seen_at AS lastHeartbeatAt,
            TIMESTAMPDIFF(SECOND, last_seen_at, NOW()) AS secondsSinceLastHeartbeat
     FROM theatre_heartbeats
     WHERE theatre_id = ? OR theatre_code = ?
     ORDER BY last_seen_at DESC
     LIMIT 1`,
    [theatreId, theatreCode]
  );

  const row = rows[0];
  const secondsSinceLastHeartbeat = row?.secondsSinceLastHeartbeat == null
    ? null
    : Number(row.secondsSinceLastHeartbeat);
  const storedStatus = row?.status ? String(row.status) : 'OFFLINE';
  const consideredOnline = Boolean(
    row
    && storedStatus !== 'OFFLINE'
    && secondsSinceLastHeartbeat !== null
    && secondsSinceLastHeartbeat <= ONLINE_THRESHOLD_SECONDS
  );

  return NextResponse.json({
    success: true,
    theatreId: row?.theatreId ? String(row.theatreId) : theatreId,
    theatreCode: row?.theatreCode ? String(row.theatreCode) : theatreCode,
    lastHeartbeatAt: row?.lastHeartbeatAt ? new Date(row.lastHeartbeatAt).toISOString() : null,
    secondsSinceLastHeartbeat,
    consideredOnline,
    thresholdSeconds: ONLINE_THRESHOLD_SECONDS
  });
}
