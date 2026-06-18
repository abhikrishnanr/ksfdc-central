import { NextRequest, NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getCentralDbPool } from '../../../../lib/db';
import { ensureCentralHeartbeatTables } from '../../../../lib/sync';
import { getAcceptedLocalSequence } from '../../../../lib/sync-security';

export const dynamic = 'force-dynamic';

type HeartbeatPayload = {
  theatreId?: string;
  theatreCode?: string;
  localAppUrl?: string;
  localApiUrl?: string;
  authorityMode?: string;
  lastLocalSequence?: number;
  lastAckSequence?: number;
  lastCentralMirrorSequence?: number;
  pendingLocalEvents?: number;
  failedLocalEvents?: number;
  status?: string;
  localTime?: string;
};

function firstConfiguredSecret() {
  return process.env.CENTRAL_HEARTBEAT_SECRET?.trim()
    || process.env.LOCAL_THEATRE_SHARED_SECRET?.trim()
    || process.env.LOCAL_SHARED_SECRET?.trim()
    || process.env.KSFDC_HMAC_SECRET?.trim()
    || process.env.AUTHORITY_SHARED_SECRET?.trim()
    || '';
}

function getHeartbeatSecret(request: NextRequest) {
  return request.headers.get('x-heartbeat-secret')?.trim()
    || request.headers.get('x-authority-secret')?.trim()
    || '';
}

function normalizeStatus(status: unknown) {
  return status === 'OFFLINE' ? 'OFFLINE' : 'ONLINE';
}

async function resolveTheatreIdentity(payload: HeartbeatPayload) {
  const theatreId = payload.theatreId?.trim();
  const theatreCode = payload.theatreCode?.trim();

  if (theatreId && theatreCode) return { theatreId, theatreCode };

  if (theatreId || theatreCode) {
    const [rows] = await getCentralDbPool().query<RowDataPacket[]>(
      `SELECT id, code
       FROM theatres
       WHERE id = ? OR code = ?
       LIMIT 1`,
      [theatreId ?? '', theatreCode ?? '']
    );
    const row = rows[0];
    if (row) {
      return {
        theatreId: theatreId ?? String(row.id),
        theatreCode: theatreCode ?? String(row.code)
      };
    }
  }

  return { theatreId, theatreCode };
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Heartbeat endpoint is available. Use POST.',
    method: 'POST'
  });
}

export async function POST(request: NextRequest) {
  const configuredSecret = firstConfiguredSecret();
  if (!configuredSecret) {
    return NextResponse.json(
      { success: false, error: 'CENTRAL_HEARTBEAT_SECRET_NOT_CONFIGURED' },
      { status: 500 }
    );
  }

  const requestSecret = getHeartbeatSecret(request);
  if (requestSecret !== configuredSecret) {
    return NextResponse.json(
      { success: false, error: 'INVALID_HEARTBEAT_SECRET' },
      { status: 401 }
    );
  }

  const payload = await request.json().catch(() => ({})) as HeartbeatPayload;
  const { theatreId, theatreCode } = await resolveTheatreIdentity(payload);

  if (!theatreId && !theatreCode) {
    return NextResponse.json(
      { success: false, error: 'theatreId or theatreCode is required.' },
      { status: 400 }
    );
  }

  await ensureCentralHeartbeatTables();

  const resolvedTheatreId = theatreId ?? theatreCode ?? 'UNKNOWN';
  const status = normalizeStatus(payload.status);
  const heartbeatAt = new Date().toISOString();
  const localLatestSequence = Number(payload.lastLocalSequence ?? 0);
  const localAckSequence = Number(payload.lastAckSequence ?? 0);

  await getCentralDbPool().query(
    `INSERT INTO theatre_heartbeats (
       theatre_id, theatre_code, local_app_url, local_api_url, authority_mode,
       last_local_sequence, last_central_mirror_sequence, pending_local_events,
       failed_local_events, trusted_for_admin_sync, status, last_seen_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())
     ON DUPLICATE KEY UPDATE
       theatre_code = VALUES(theatre_code),
       local_app_url = VALUES(local_app_url),
       local_api_url = VALUES(local_api_url),
       authority_mode = VALUES(authority_mode),
       last_local_sequence = VALUES(last_local_sequence),
       last_central_mirror_sequence = VALUES(last_central_mirror_sequence),
       pending_local_events = VALUES(pending_local_events),
       failed_local_events = VALUES(failed_local_events),
       trusted_for_admin_sync = 1,
       status = VALUES(status),
       last_seen_at = NOW()`,
    [
      resolvedTheatreId,
      theatreCode ?? null,
      payload.localAppUrl ?? null,
      payload.localApiUrl ?? payload.localAppUrl ?? null,
      payload.authorityMode ?? 'UNKNOWN',
      localLatestSequence,
      Number(payload.lastCentralMirrorSequence ?? 0),
      Number(payload.pendingLocalEvents ?? 0),
      Number(payload.failedLocalEvents ?? 0),
      status
    ]
  );

  await getCentralDbPool().query(
    `UPDATE show_authority_state st
     JOIN shows s ON s.id = st.show_id
     SET st.local_heartbeat_at = NOW(),
         st.pending_sync_events = 0,
         st.failed_sync_events = 0
     WHERE s.theatre_id = ?`,
    [resolvedTheatreId]
  );

  const [[mirrorRow]] = await getCentralDbPool().query<RowDataPacket[]>(
    'SELECT COALESCE(MAX(sequence_no), 0) AS latestCentralMirrorSequence FROM central_mirror_events WHERE theatre_id = ?',
    [resolvedTheatreId]
  );
  const latestCentralMirrorSequence = Number(mirrorRow?.latestCentralMirrorSequence ?? 0);
  const acceptedLocalSequence = await getAcceptedLocalSequence(resolvedTheatreId);

  return NextResponse.json({
    success: true,
    ok: true,
    theatreId: resolvedTheatreId,
    theatreCode: theatreCode ?? null,
    heartbeatAt,
    dbUpdated: true,
    acceptedLocalSequence,
    latestCentralMirrorSequence,
    shouldPush: acceptedLocalSequence < localLatestSequence || Number(payload.pendingLocalEvents ?? 0) > 0,
    shouldPull: latestCentralMirrorSequence > Number(payload.lastCentralMirrorSequence ?? 0),
    localAckSequence
  });
}
