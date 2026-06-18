import { NextResponse } from 'next/server';
import { getTicketCheckerSession } from '../../../../lib/ticket-checker-auth';
import { getAttendanceSheet } from '../../../../lib/ticket-checker';

export async function GET(request: Request) {
  const session = await getTicketCheckerSession();
  if (!session) return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
  const showId = new URL(request.url).searchParams.get('showId')?.trim() ?? '';
  if (!showId) return NextResponse.json({ success: false, error: 'showId is required.' }, { status: 400 });
  const sheet = await getAttendanceSheet(showId, session.theatreId);
  return NextResponse.json({ success: true, ...sheet });
}

