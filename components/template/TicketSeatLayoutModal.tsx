'use client';

import { Minus, Plus, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import type { BookingShowDetail } from '../../lib/central-data';

export default function TicketSeatLayoutModal({ show, ticketSeats, onClose }: { show: BookingShowDetail; ticketSeats: string[]; onClose: () => void }) {
  const selected = new Set(ticketSeats);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => transformRef.current?.zoomToElement('.is-ticket-seat', 1.15, 280, 'easeOut'), 120);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', onKeyDown); };
  }, [onClose]);

  return (
    <div className="checker-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="checker-seat-modal" role="dialog" aria-modal="true" aria-labelledby="ticket-seat-layout-title">
        <header>
          <div><p className="eyebrow">Your seats</p><h2 id="ticket-seat-layout-title">{show.movieTitle}</h2><p>{show.screenName} - {ticketSeats.join(', ')}</p></div>
          <button className="checker-icon-button" type="button" onClick={onClose} aria-label="Close seat layout"><X /></button>
        </header>
        <TransformWrapper ref={transformRef} minScale={0.3} maxScale={2.5} initialScale={0.55} centerOnInit centerZoomedOut wheel={{ step: 0.08 }} pinch={{ step: 4 }}>
          {({ zoomIn, zoomOut, centerView }) => <>
            <div className="checker-seat-tools">
              <button type="button" onClick={() => zoomOut(0.15)} aria-label="Zoom out"><Minus size={18} /></button>
              <button type="button" onClick={() => centerView(0.7, 180)}>Fit hall</button>
              <button type="button" onClick={() => zoomIn(0.15)} aria-label="Zoom in"><Plus size={18} /></button>
            </div>
            <TransformComponent wrapperClass="checker-seat-transform" contentClass="checker-seat-transform-content">
              <div className="checker-hall-layout">
                {show.rows.map((row) => <div className="checker-hall-row" key={row.rowLabel}>
                  <strong>{row.rowLabel}</strong>
                  {row.cells.map((cell) => cell.kind === 'SEAT'
                    ? <span className={selected.has(String(cell.seatId)) ? 'is-ticket-seat' : cell.status === 'SOLD' ? 'is-sold' : ''} key={cell.cellId}>{cell.seatNumber}</span>
                    : <i style={{ width: Math.max(18, Number(cell.displayOrder) || 18) }} key={cell.cellId} />)}
                </div>)}
                <div className="checker-screen-line">SCREEN THIS SIDE</div>
              </div>
            </TransformComponent>
          </>}
        </TransformWrapper>
      </section>
    </div>
  );
}
