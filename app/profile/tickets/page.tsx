export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { RowDataPacket } from 'mysql2';
import { EmptyState, PageHeader, PremiumCard, StatusBadge } from '../../../components/premium-ui';
import { getCentralDbPool } from '../../../lib/db';
import { getPublicSession } from '../../../lib/public-auth';
import PublicEmailLoginPanel from '../PublicEmailLoginPanel';

function formatTime(value: unknown) {
  return value ? new Date(value as string | Date).toLocaleString('en-IN') : 'Not recorded';
}

function money(value: unknown) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value ?? 0));
}

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
            COUNT(i.seat_id) AS seatCount
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

  return (
    <main className="grid" style={{ gap: 24 }}>
      <PageHeader eyebrow="My tickets" title="Booked tickets" description={`Tickets linked to ${session.email}.`} />
      {!tickets.length ? <EmptyState title="No tickets yet"><p>Your confirmed tickets will appear here after payment.</p></EmptyState> : null}
      <div className="grid">
        {tickets.map((ticket) => (
          <PremiumCard key={String(ticket.id)}>
            <div className="meta-row" style={{ justifyContent: 'space-between' }}>
              <div
                className="ticket-list-poster"
                style={ticket.moviePosterUrl ? { backgroundImage: `url("${String(ticket.moviePosterUrl)}")` } : undefined}
                aria-label={`${String(ticket.movieTitle)} poster`}
              />
              <div>
                <p className="eyebrow">{formatTime(ticket.showTime)}</p>
                <h2>{String(ticket.movieTitle)}</h2>
                <p>{String(ticket.theatreName)} - {String(ticket.screenName)} - {Number(ticket.seatCount)} ticket(s)</p>
              </div>
              <StatusBadge tone={String(ticket.status) === 'CONFIRMED' ? 'good' : 'warn'}>{String(ticket.status)}</StatusBadge>
            </div>
            <div className="meta-row" style={{ marginTop: 16 }}>
              <StatusBadge tone="violet">{money(ticket.totalAmount)}</StatusBadge>
              <Link className="action-button primary" href={`/profile/tickets/${String(ticket.id)}`}>Open ticket</Link>
            </div>
          </PremiumCard>
        ))}
      </div>
    </main>
  );
}
