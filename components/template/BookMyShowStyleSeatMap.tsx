'use client';

import { useMemo, useState } from 'react';
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

  return (
    <div className="bms-seat-map-shell">
      <div className="seat-map-toolbar" aria-label="Seat map zoom controls">
        <button type="button" onClick={() => setZoom((value) => Math.max(0.72, Number((value - 0.1).toFixed(2))))}>-</button>
        <span>{zoomPercent}%</span>
        <button type="button" onClick={() => setZoom((value) => Math.min(1.45, Number((value + 0.1).toFixed(2))))}>+</button>
        <button type="button" onClick={() => setZoom(1)}>Fit</button>
      </div>
      <div className="screen-banner public-dark">{show.screenSideLabel}</div>
      <div className="seat-legend public-dark">
        {Object.entries(STATUS_STYLES).map(([status, config]) => <span className={`seat-legend-item ${config.className}`} key={status}>{config.label}</span>)}
      </div>
      {groupedRows(show).map((group) => (
        <ZoneSeatGroup key={group.zone} name={group.zone} price={group.amount}>
          <div className="seat-map-stage public">
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
