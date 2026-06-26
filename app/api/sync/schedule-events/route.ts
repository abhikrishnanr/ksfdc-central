import { NextRequest, NextResponse } from 'next/server';
import { acknowledgeScheduleEvents, adminErrorPayload, readScheduleEvents } from '../../../../lib/admin-management';
import { verifyCentralSyncRequest } from '../../../../lib/sync-security';

export const dynamic = 'force-dynamic';

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export async function GET(request: NextRequest) {
  const securityError = await verifyCentralSyncRequest(request, '');
  if (securityError) return securityError;

  const theatreId = request.nextUrl.searchParams.get('theatreId');
  if (!theatreId) return NextResponse.json({ success: false, error: 'theatreId is required.' }, { status: 400 });

  try {
    const events = await readScheduleEvents({
      theatreId,
      afterId: numberParam(request.nextUrl.searchParams.get('afterSequence'), 0),
      limit: numberParam(request.nextUrl.searchParams.get('limit'), 100)
    });
    return NextResponse.json({
      success: true,
      events,
      latestSequence: events.reduce((max, event) => Math.max(max, event.sequenceNo), numberParam(request.nextUrl.searchParams.get('afterSequence'), 0)),
      hasMore: events.length >= numberParam(request.nextUrl.searchParams.get('limit'), 100)
    });
  } catch (error) {
    return NextResponse.json(adminErrorPayload(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const securityError = await verifyCentralSyncRequest(request, rawBody);
  if (securityError) return securityError;

  try {
    const body = rawBody ? JSON.parse(rawBody) : {};
    const theatreId = typeof body.theatreId === 'string' ? body.theatreId : null;
    const events = Array.isArray(body.events) ? body.events : [];
    if (!theatreId) return NextResponse.json({ success: false, error: 'theatreId is required.' }, { status: 400 });
    await acknowledgeScheduleEvents({ theatreId, events });
    return NextResponse.json({ success: true, acknowledged: events.length });
  } catch (error) {
    return NextResponse.json(adminErrorPayload(error), { status: 400 });
  }
}
