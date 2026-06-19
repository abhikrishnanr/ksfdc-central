import { RowDataPacket } from 'mysql2';
import { notFound } from 'next/navigation';
import { getCentralDbPool } from '../../../lib/db';
import { ensureCentralPaymentTables } from '../../../lib/razorpay';
import { ensureCentralSyncInbox } from '../../../lib/sync';
import ShareableTicketCard, { type ShareableTicketSeatGroup } from '../../../components/template/ShareableTicketCard';
import { createTicketVerificationToken } from '../../../lib/ticket-verification';
import { getBookingShow } from '../../../lib/central-data';

export const dynamic = 'force-dynamic';

export default async function CentralTicketPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  await ensureCentralPaymentTables();
  await ensureCentralSyncInbox();
  const [[booking]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT b.id, b.show_id AS showId, s.theatre_id AS theatreId, b.channel, b.status, b.total_amount AS totalAmount, b.created_at AS createdAt,
            m.id AS movieId, m.title AS movieTitle, m.poster_url AS moviePosterUrl, t.name AS theatreName, sc.name AS screenName, s.show_time AS showTime,
            p.provider, p.payment_mode AS paymentMode, p.provider_reference AS paymentReference,
            p.provider_payment_id AS razorpayPaymentId, p.provider_order_id AS razorpayOrderId,
            p.counter_code AS counterCode
     FROM central_bookings b
     JOIN shows s ON s.id = b.show_id
     JOIN movies m ON m.id = s.movie_id
     JOIN theatres t ON t.id = s.theatre_id
     JOIN screens sc ON sc.id = s.screen_id
     LEFT JOIN payments p ON p.booking_id = b.id
     WHERE b.id = ?
     LIMIT 1`,
    [bookingId]
  );
  if (!booking) notFound();

  const [items] = await getCentralDbPool().query<RowDataPacket[]>(
    'SELECT seat_id AS seatId, MAX(zone) AS zone, MAX(amount) AS amount FROM central_booking_items WHERE booking_id = ? GROUP BY seat_id ORDER BY zone ASC, seat_id ASC',
    [bookingId]
  );
  const groups = new Map<string, { zone: string; seats: string[]; amount: number }>();
  for (const item of items) {
    const zone = String(item.zone);
    const group = groups.get(zone) ?? { zone, seats: [], amount: 0 };
    if (!group.seats.includes(String(item.seatId))) group.seats.push(String(item.seatId));
    group.amount += Number(item.amount ?? 0);
    groups.set(zone, group);
  }
  const showId = String(booking.showId);
  const token = createTicketVerificationToken(String(booking.id), showId);
  const baseUrl = process.env.NEXT_PUBLIC_CENTRAL_APP_URL?.replace(/\/$/, '') ?? '';
  const verificationUrl = `${baseUrl}/ticket/${String(booking.id)}?verify=${token}`;
  const ticket = {
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
    issuedAt: new Date(booking.createdAt).toISOString(),
    status: String(booking.status),
    totalAmount: Number(booking.totalAmount ?? 0),
    paymentMode: booking.paymentMode ? String(booking.paymentMode) : null,
    counterCode: booking.counterCode ? String(booking.counterCode) : null,
    verificationUrl,
    verificationToken: token,
    groups: Array.from(groups.values()) as ShareableTicketSeatGroup[]
  };
  const { data: seatLayout } = await getBookingShow(showId);

  return <ShareableTicketCard ticket={ticket} seatLayout={seatLayout} />;
}
