'use client';

import { useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import type { BookingShowDetail, SeatCell } from '../../lib/central-data';
import ZoneSeatGroup from './ZoneSeatGroup';

const STATUS_STYLES: Record<SeatCell['status'] | 'SELECTED', { label: string; short: string; className: string }> = {
  AVAILABLE: { label: 'Available', short: '', className: 'seat-available' },
  HELD: { label: 'Held for payment', short: 'H', className: 'seat-held' },
  SOLD: { label: 'Sold', short: 'S', className: 'seat-sold' },
  BLOCKED: { label: 'Unavailable', short: 'X', className: 'seat-blocked' },
  SELECTED: { label: 'Selected', short: 'OK', className: 'seat-selected' }
};

function rowZone(row: { cells: SeatCell[] }) {
  return row.cells.find((cell) => cell.kind === 'SEAT' && cell.zone)?.zone ?? 'STANDARD';
}

function groupedRows(show: BookingShowDetail) {
  return show.zoneRates.map((rate) => ({
    zone: rate.zone,
    amount: rate.amount,
    rows: show.rows.filter((row) => rowZone(row) === rate.zone)
  })).filter((group) => group.rows.length > 0);
}

export { STATUS_STYLES };

export default function BookMyShowStyleSeatMap({
  show,
  selected,
  disabled,
  holdActive,
  onToggle
}: {
  show: BookingShowDetail;
  selected: string[];
  disabled: boolean;
  holdActive: boolean;
  onToggle: (cell: SeatCell) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const zoomPercent = useMemo(() => Math.round(zoom * 100), [zoom]);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);

  function clampZoom(value: number) {
    return Math.min(1.65, Math.max(0.68, Number(value.toFixed(2))));
  }

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active = Array.from(pointers.current.values());

    if (active.length >= 2) {
      const distance = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y);
      if (pinchDistance.current) setZoom((value) => clampZoom(value * (distance / pinchDistance.current!)));
      pinchDistance.current = distance;
      return;
    }

    if (stageRef.current && event.pointerType === 'touch') {
      stageRef.current.scrollLeft -= event.clientX - previous.x;
      stageRef.current.scrollTop -= event.clientY - previous.y;
    }
  }

  function pointerUp(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchDistance.current = null;
  }

  return (
    <div className="bms-seat-map-shell">
      <div className="seat-map-toolbar" aria-label="Seat map zoom controls">
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => setZoom((value) => clampZoom(value - 0.1))}><Minus size={17} /></button>
        <span>{zoomPercent}%</span>
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => setZoom((value) => clampZoom(value + 0.1))}><Plus size={17} /></button>
        <button type="button" aria-label="Reset seat map zoom" title="Fit seats" onClick={() => setZoom(1)}><Maximize2 size={16} /></button>
      </div>
      <div className="screen-banner public-dark">{show.screenSideLabel}</div>
      <div className="seat-legend public-dark">
        {Object.entries(STATUS_STYLES).map(([status, config]) => <span className={`seat-legend-item ${config.className}`} key={status}>{config.label}</span>)}
      </div>
      {groupedRows(show).map((group) => (
        <ZoneSeatGroup key={group.zone} name={group.zone} price={group.amount}>
          <div
            className="seat-map-stage public"
            ref={stageRef}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
          >
            <div className="seat-map compact" style={{ zoom }}>
              {group.rows.map((row) => (
                <div className="seat-row public" key={row.rowLabel}>
                  <strong className="row-label public">{row.rowLabel}</strong>
                  {row.cells.map((cell) => {
                    if (cell.kind !== 'SEAT') {
                      return <span className="aisle-gap public" key={cell.cellId} title={cell.kind} aria-label="aisle gap" />;
                    }
                    const isSelected = Boolean(cell.seatId && selected.includes(cell.seatId));
                    const status = isSelected ? 'SELECTED' : cell.status;
                    return (
                      <button
                        className={`seat-button public ${STATUS_STYLES[status].className}`}
                        key={cell.cellId}
                        type="button"
                        disabled={disabled || show.bookingEnabled === false}
                        onClick={() => onToggle(cell)}
                        title={`${cell.seatId} - ${cell.zone} - INR ${cell.price ?? 0} - ${STATUS_STYLES[status].label}${cell.accessibility ? ` - ${cell.accessibility}` : ''}`}
                        aria-pressed={isSelected}
                        aria-disabled={cell.status !== 'AVAILABLE' || holdActive}
                      >
                        {cell.seatNumber}
                        {cell.accessibility ? <small>WC</small> : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </ZoneSeatGroup>
      ))}
    </div>
  );
}
