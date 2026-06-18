import { NextResponse } from 'next/server';
import { getTicketCheckerSession } from '../../../../lib/ticket-checker-auth';
import { getTicketCheckerShows } from '../../../../lib/ticket-checker';

export async function GET(request: Request) {
  const session = await getTicketCheckerSession();
  if (!session) return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
  const url = new URL(request.url);
  const theatreId = url.searchParams.get('theatreId')?.trim() ?? '';
  const date = url.searchParams.get('date')?.trim() ?? '';
  if (!theatreId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ success: false, error: 'theatreId and date are required.' }, { status: 400 });
  const shows = await getTicketCheckerShows({ theatreId, date, theatreScope: session.theatreId });
  return NextResponse.json({ success: true, shows });
}

