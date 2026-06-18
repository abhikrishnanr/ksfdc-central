import { NextRequest, NextResponse } from 'next/server';
import { getCentralDbPool } from '../../../../lib/db';
import { ensureCentralHeartbeatTables } from '../../../../lib/sync';

export const dynamic = 'force-dynamic';

type HeartbeatPayload = {
  theatreId?: string;
  localAppUrl?: string;
  authorityMode?: string;
  lastLocalSequence?: number;
  lastCentralMirrorSequence?: number;
  pendingLocalEvents?: number;
  failedLocalEvents?: number;
  status?: string;
};

export async function POST(request: NextRequest) {
  await ensureCentralHeartbeatTables();
  const payload = await request.json().catch(() => ({})) as HeartbeatPayload;

  if (!payload.theatreId) {
    return NextResponse.json({ success: false, error: 'theatreId is required.' }, { status: 400 });
  }

  const status = payload.status === 'OFFLINE' ? 'OFFLINE' : 'ONLINE';

  await getCentralDbPool().query(
    `INSERT INTO theatre_heartbeats (
       theatre_id, local_app_url, authority_mode, last_local_sequence,
       last_central_mirror_sequence, pending_local_events, failed_local_events, trusted_for_admin_sync, status, last_seen_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, NOW())
     ON DUPLICATE KEY UPDATE
       local_app_url = VALUES(local_app_url),
       authority_mode = VALUES(authority_mode),
       last_local_sequence = VALUES(last_local_sequence),
       last_central_mirror_sequence = VALUES(last_central_mirror_sequence),
       pending_local_events = IF(trusted_for_admin_sync = 0, VALUES(pending_local_events), pending_local_events),
       failed_local_events = IF(trusted_for_admin_sync = 0, VALUES(failed_local_events), failed_local_events),
       status = VALUES(status),
       last_seen_at = NOW()`,
    [
      payload.theatreId,
      payload.localAppUrl ?? null,
      payload.authorityMode ?? 'UNKNOWN',
      Number(payload.lastLocalSequence ?? 0),
      Number(payload.lastCentralMirrorSequence ?? 0),
      Number(payload.pendingLocalEvents ?? 0),
      Number(payload.failedLocalEvents ?? 0),
      status
    ]
  );

  return NextResponse.json({ success: true, theatreId: payload.theatreId, status, receivedAt: new Date().toISOString() });
}
