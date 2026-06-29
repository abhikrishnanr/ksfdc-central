'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';
import type { BookingShowDetail } from '../../lib/central-data';
import BookMyShowStyleSeatMap from './BookMyShowStyleSeatMap';

type TicketSeatGroup = { zone: string; seats: string[] };

export default function TicketSeatLayoutModal({
  show,
  ticketSeats,
  ticketGroups,
  onClose
}: {
  show: BookingShowDetail;
  ticketSeats: string[];
  ticketGroups: TicketSeatGroup[];
  onClose: () => void;
}) {
  const selectedSeatKeys = ticketGroups.flatMap((group) => group.seats.map((seat) => `${group.zone}::${seat}`));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="checker-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="checker-seat-modal" role="dialog" aria-modal="true" aria-labelledby="ticket-seat-layout-title">
        <header>
          <div><p className="eyebrow">Your seats</p><h2 id="ticket-seat-layout-title">{show.movieTitle}</h2><p>{show.screenName} - {ticketSeats.join(', ')}</p></div>
          <button className="checker-icon-button" type="button" onClick={onClose} aria-label="Close seat layout"><X /></button>
        </header>
        <BookMyShowStyleSeatMap
          show={show}
          selected={ticketSeats}
          selectedSeatKeys={selectedSeatKeys}
          disabled
          holdActive={false}
          onToggle={() => undefined}
        />
      </section>
    </div>
  );
}
