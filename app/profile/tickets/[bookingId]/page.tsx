export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { createHash } from 'crypto';
import { notFound, redirect } from 'next/navigation';
import { RowDataPacket } from 'mysql2';
import { PageHeader } from '../../../../components/premium-ui';
import ShareableTicketCard, { type ShareableTicketSeatGroup } from '../../../../components/template/ShareableTicketCard';
import { getCentralDbPool } from '../../../../lib/db';
import { getBookingShow } from '../../../../lib/central-data';
import { getPublicSession } from '../../../../lib/public-auth';
import { ensureCentralSyncInbox } from '../../../../lib/sync';

function formatTime(value: unknown) {
  return value ? new Date(value as string | Date).toLocaleString('en-IN') : 'Not recorded';
}

function ticketToken(bookingId: string, showId: string) {
  return createHash('sha256').update(`${bookingId}:${showId}:${process.env.TICKET_VERIFY_SECRET ?? 'dev-ticket-verify-secret'}`).digest('hex').slice(0, 24);
}

function groupItems(items: RowDataPacket[]) {
  const groups = new Map<string, { zone: string; seats: string[]; amount: number }>();
  for (const item of items) {
    const zone = String(item.zone);
    const group = groups.get(zone) ?? { zone, seats: [], amount: 0 };
    if (!group.seats.includes(String(item.seatId))) group.seats.push(String(item.seatId));
    group.amount += Number(item.amount ?? 0);
    groups.set(zone, group);
  }
  return Array.from(groups.values());
}

export default async function ProfileTicketDetailPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const session = await getPublicSession();
  if (!session) redirect('/profile');
  const { bookingId } = await params;
  await ensureCentralSyncInbox();

  const [[booking]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT b.id, b.show_id AS showId, s.theatre_id AS theatreId, b.status, b.total_amount AS totalAmount, b.created_at AS bookedAt,
            m.id AS movieId, m.title AS movieTitle, m.poster_url AS moviePosterUrl, t.name AS theatreName, sc.name AS screenName, s.show_time AS showTime,
            p.payment_mode AS paymentMode, p.counter_code AS counterCode
     FROM central_bookings b
     JOIN shows s ON s.id = b.show_id
     JOIN movies m ON m.id = s.movie_id
     JOIN theatres t ON t.id = s.theatre_id
     JOIN screens sc ON sc.id = s.screen_id
     LEFT JOIN payments p ON p.booking_id = b.id
     WHERE b.id = ? AND (b.public_user_id = ? OR b.customer_email = ?)
     LIMIT 1`,
    [bookingId, session.userId, session.email]
  );
  if (!booking) notFound();

  const [items] = await getCentralDbPool().query<RowDataPacket[]>(
    'SELECT seat_id AS seatId, MAX(zone) AS zone, MAX(amount) AS amount FROM central_booking_items WHERE booking_id = ? GROUP BY seat_id ORDER BY zone, seat_id',
    [bookingId]
  );
  const groups = groupItems(items);
  const showId = String(booking.showId);
  const token = ticketToken(String(booking.id), showId);
  const baseUrl = process.env.NEXT_PUBLIC_CENTRAL_APP_URL?.replace(/\/$/, '') ?? '';
  const { data: seatLayout } = await getBookingShow(showId);

  return (
    <main className="grid" style={{ gap: 24 }}>
      <div className="no-print">
        <PageHeader
          eyebrow="Ticket confirmed"
          title={String(booking.movieTitle)}
          description={`${String(booking.theatreName)} - ${String(booking.screenName)} - ${formatTime(booking.showTime)}`}
        />
      </div>
      <ShareableTicketCard seatLayout={seatLayout} ticket={{
        bookingId: String(booking.id),
        ticketNumber: `TKT-${String(booking.id).replace(/^BOOKING_/, '').slice(0, 12).toUpperCase()}`,
        showId,
        theatreId: String(booking.theatreId),
        theatreName: String(booking.theatreName),
        screenName: String(booking.screenName),
        movieTitle: String(booking.movieTitle),
        movieId: String(booking.movieId),
        moviePosterUrl: booking.moviePosterUrl ? String(booking.moviePosterUrl) : null,
        showTime: new Date(booking.showTime).toISOString(),
        issuedAt: new Date(booking.bookedAt).toISOString(),
        status: String(booking.status),
        totalAmount: Number(booking.totalAmount ?? 0),
        paymentMode: booking.paymentMode ? String(booking.paymentMode) : null,
        counterCode: booking.counterCode ? String(booking.counterCode) : null,
        verificationUrl: `${baseUrl}/ticket/${String(booking.id)}?verify=${token}`,
        verificationToken: token,
        groups: groups as ShareableTicketSeatGroup[]
      }} />
      <Link className="action-button no-print" href="/profile/tickets">Back to tickets</Link>
    </main>
  );
}
