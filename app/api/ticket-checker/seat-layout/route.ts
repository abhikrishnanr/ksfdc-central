import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getTicketCheckerSession } from '../../../../lib/ticket-checker-auth';
import { getBookingShow } from '../../../../lib/central-data';
import { getCentralDbPool } from '../../../../lib/db';

export async function GET(request: Request) {
  const session = await getTicketCheckerSession();
  if (!session) return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
  const url = new URL(request.url);
  const showId = url.searchParams.get('showId')?.trim() ?? '';
  const bookingId = url.searchParams.get('bookingId')?.trim() ?? '';
  if (!showId || !bookingId) return NextResponse.json({ success: false, error: 'showId and bookingId are required.' }, { status: 400 });
  const [[booking]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT b.id, s.theatre_id AS theatreId FROM central_bookings b JOIN shows s ON s.id = b.show_id WHERE b.id = ? AND b.show_id = ? LIMIT 1`,
    [bookingId, showId]
  );
  if (!booking || (session.theatreId && session.theatreId !== String(booking.theatreId))) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 });
  const showResult = await getBookingShow(showId);
  const show = showResult.data;
  if (!show) return NextResponse.json({ success: false, error: 'SHOW_NOT_FOUND' }, { status: 404 });
  const [items] = await getCentralDbPool().query<RowDataPacket[]>('SELECT seat_id AS seatId FROM central_booking_items WHERE booking_id = ?', [bookingId]);
  return NextResponse.json({ success: true, show, ticketSeats: items.map((item) => String(item.seatId)) });
}
