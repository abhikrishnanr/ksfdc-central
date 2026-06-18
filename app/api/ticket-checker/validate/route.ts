import { NextResponse } from 'next/server';
import { getTicketCheckerSession } from '../../../../lib/ticket-checker-auth';
import { validateAndAdmitTicket } from '../../../../lib/ticket-checker';

export async function POST(request: Request) {
  const session = await getTicketCheckerSession();
  if (!session) return NextResponse.json({ success: false, outcome: 'INVALID', reason: 'UNAUTHORIZED', message: 'Checker session expired.' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { rawValue?: unknown; theatreId?: unknown; showId?: unknown };
  const rawValue = String(body.rawValue ?? '').trim();
  const theatreId = String(body.theatreId ?? '').trim();
  const showId = String(body.showId ?? '').trim();
  if (!rawValue || !theatreId || !showId) return NextResponse.json({ success: false, outcome: 'INVALID', reason: 'MISSING_FIELDS', message: 'Ticket, theatre, and show are required.' }, { status: 400 });
  try {
    const result = await validateAndAdmitTicket({ rawValue, theatreId, showId, session });
    return NextResponse.json(result, { status: result.reason === 'THEATRE_ACCESS_DENIED' ? 403 : 200 });
  } catch (error) {
    console.error('[ticket-checker] validation failed', error);
    return NextResponse.json({ success: false, outcome: 'INVALID', reason: 'VALIDATION_ERROR', message: 'Ticket validation is temporarily unavailable.' }, { status: 500 });
  }
}

