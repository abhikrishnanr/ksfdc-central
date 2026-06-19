'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CalendarDays, Clock3, History, MapPin, Ticket, UsersRound } from 'lucide-react';

export type TicketHistoryItem = {
  id: string;
  status: string;
  totalAmount: number;
  bookedAt: string;
  movieTitle: string;
  moviePosterUrl: string | null;
  theatreName: string;
  screenName: string;
  showTime: string;
  seatCount: number;
};

function showDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function showTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function TicketCard({ ticket, past }: { ticket: TicketHistoryItem; past: boolean }) {
  return (
    <article className={`ticket-history-card${past ? ' past' : ''}`}>
      <div
        className="ticket-history-poster"
        style={ticket.moviePosterUrl ? { backgroundImage: `url("${ticket.moviePosterUrl}")` } : undefined}
        aria-label={`${ticket.movieTitle} poster`}
      />
      <div className="ticket-history-content">
        <div className="ticket-history-title">
          <div>
            <span className="ticket-history-kicker">{past ? 'Past show' : 'Upcoming show'}</span>
            <h2>{ticket.movieTitle}</h2>
          </div>
          <span className={`ticket-history-status ${ticket.status === 'CONFIRMED' ? 'confirmed' : ''}`}>{ticket.status.replaceAll('_', ' ')}</span>
        </div>
        <div className="ticket-history-meta">
          <span><CalendarDays />{showDate(ticket.showTime)}</span>
          <span><Clock3 />{showTime(ticket.showTime)}</span>
          <span><MapPin />{ticket.theatreName} - {ticket.screenName}</span>
          <span><UsersRound />{ticket.seatCount} {ticket.seatCount === 1 ? 'seat' : 'seats'}</span>
        </div>
        <div className="ticket-history-footer">
          <strong>{money(ticket.totalAmount)}</strong>
          <Link className="action-button primary" href={`/profile/tickets/${ticket.id}`} prefetch>
            <Ticket size={18} /> View ticket
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function TicketHistoryTabs({ tickets, referenceTime }: { tickets: TicketHistoryItem[]; referenceTime: string }) {
  const { upcoming, past } = useMemo(() => {
    const now = new Date(referenceTime).getTime();
    return {
      upcoming: tickets.filter((ticket) => new Date(ticket.showTime).getTime() >= now),
      past: tickets.filter((ticket) => new Date(ticket.showTime).getTime() < now)
    };
  }, [referenceTime, tickets]);
  const [active, setActive] = useState<'upcoming' | 'past'>(upcoming.length ? 'upcoming' : 'past');
  const visible = active === 'upcoming' ? upcoming : past;

  return (
    <section className="ticket-history">
      <div className="ticket-history-tabs" role="tablist" aria-label="Ticket history">
        <button type="button" role="tab" aria-selected={active === 'upcoming'} className={active === 'upcoming' ? 'active' : ''} onClick={() => setActive('upcoming')}>
          <CalendarDays /><span>Upcoming</span><b>{upcoming.length}</b>
        </button>
        <button type="button" role="tab" aria-selected={active === 'past'} className={active === 'past' ? 'active' : ''} onClick={() => setActive('past')}>
          <History /><span>Past</span><b>{past.length}</b>
        </button>
      </div>
      <div className="ticket-history-list" role="tabpanel">
        {visible.map((ticket) => <TicketCard ticket={ticket} past={active === 'past'} key={ticket.id} />)}
        {!visible.length ? (
          <div className="ticket-history-empty">
            {active === 'upcoming' ? <CalendarDays /> : <History />}
            <h2>No {active} tickets</h2>
            <p>{active === 'upcoming' ? 'Your next cinema visit will appear here.' : 'Completed shows will move here automatically.'}</p>
            {active === 'upcoming' ? <Link className="action-button primary" href="/shows">Browse showtimes</Link> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
