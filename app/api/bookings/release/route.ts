import { NextRequest, NextResponse } from 'next/server';
import { getCentralDbPool } from '../../../../lib/db';
import { releaseLocalHold } from '../../../../lib/local-theatre-client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({})) as { holdId?: string; showId?: string };
  const holdId = payload.holdId?.trim();
  const showId = payload.showId?.trim();
  if (!holdId) return NextResponse.json({ success: false, error: 'holdId is required.' }, { status: 400 });

  await getCentralDbPool().query("UPDATE central_seat_holds SET status = 'CANCELLED' WHERE id = ? AND status = 'ACTIVE'", [holdId]);
  if ((holdId.startsWith('HOLD-') || holdId.startsWith('HOLD_LOCAL_')) && showId) {
    try {
      await releaseLocalHold(holdId, showId);
    } catch {
      // Hold expiry still protects seats if the local tunnel is unavailable during checkout cancel.
    }
  }
  await getCentralDbPool().query("UPDATE payments SET status = 'CANCELLED' WHERE hold_id = ? AND booking_id IS NULL AND status IN ('CREATED','PENDING')", [holdId]);
  return NextResponse.json({ success: true, holdId });
}
