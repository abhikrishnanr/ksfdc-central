export const dynamic = 'force-dynamic';

import { RowDataPacket } from 'mysql2';
import { PageHeader } from '../../../components/premium-ui';
import TicketHistoryTabs, { type TicketHistoryItem } from '../../../components/template/TicketHistoryTabs';
import { getCentralDbPool } from '../../../lib/db';
import { getPublicSession } from '../../../lib/public-auth';
import PublicEmailLoginPanel from '../PublicEmailLoginPanel';

export default async function ProfileTicketsPage() {
  const session = await getPublicSession();
  if (!session) {
    return (
      <main className="grid" style={{ gap: 24 }}>
        <PageHeader eyebrow="My tickets" title="Sign in to view tickets" description="Verify your email to see bookings linked to your account." />
        <PublicEmailLoginPanel />
      </main>
    );
  }

  const [tickets] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT b.id, b.status, b.total_amount AS totalAmount, b.created_at AS bookedAt,
            m.title AS movieTitle, m.poster_url AS moviePosterUrl, t.name AS theatreName, sc.name AS screenName, s.show_time AS showTime,
            COUNT(DISTINCT i.seat_id) AS seatCount
     FROM central_bookings b
     JOIN shows s ON s.id = b.show_id
     JOIN movies m ON m.id = s.movie_id
     JOIN theatres t ON t.id = s.theatre_id
     JOIN screens sc ON sc.id = s.screen_id
     LEFT JOIN central_booking_items i ON i.booking_id = b.id
     WHERE b.public_user_id = ? OR b.customer_email = ?
     GROUP BY b.id, b.status, b.total_amount, b.created_at, m.title, m.poster_url, t.name, sc.name, s.show_time
     ORDER BY s.show_time DESC, b.created_at DESC`,
    [session.userId, session.email]
  );
  const history = tickets.map((ticket) => ({
    id: String(ticket.id),
    status: String(ticket.status),
    totalAmount: Number(ticket.totalAmount ?? 0),
    bookedAt: new Date(ticket.bookedAt).toISOString(),
    movieTitle: String(ticket.movieTitle),
    moviePosterUrl: ticket.moviePosterUrl ? String(ticket.moviePosterUrl) : null,
    theatreName: String(ticket.theatreName),
    screenName: String(ticket.screenName),
    showTime: new Date(ticket.showTime).toISOString(),
    seatCount: Number(ticket.seatCount ?? 0)
  })) satisfies TicketHistoryItem[];

  return (
    <main className="ticket-history-page">
      <PageHeader eyebrow="My tickets" title="Your cinema moments" description={`Upcoming visits and past bookings for ${session.email}.`} />
      <TicketHistoryTabs tickets={history} referenceTime={new Date().toISOString()} />
    </main>
  );
}
