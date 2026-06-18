'use client';

import { Maximize2, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { MiniMap, TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import type { BookingShowDetail, SeatCell } from '../../lib/central-data';

const STATUS_STYLES: Record<SeatCell['status'] | 'SELECTED', { label: string; className: string }> = {
  AVAILABLE: { label: 'Available', className: 'seat-available' },
  HELD: { label: 'Held for payment', className: 'seat-held' },
  SOLD: { label: 'Sold', className: 'seat-sold' },
  BLOCKED: { label: 'Unavailable', className: 'seat-blocked' },
  SELECTED: { label: 'Selected', className: 'seat-selected' }
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
  const [scale, setScale] = useState(1);
  const groups = groupedRows(show);

  function hallContent(miniature = false) {
    return (
      <div className={`unified-seat-hall${miniature ? ' is-minimap' : ''}`}>
        {groups.map((group) => (
          <section className="unified-seat-zone" key={group.zone}>
            <div className="unified-zone-heading">
              <strong>{group.zone}</strong>
              <span>INR {group.amount}</span>
            </div>
            <div className="unified-zone-rows">
              {group.rows.map((row) => (
                <div className="seat-row public" key={row.rowLabel}>
                  <strong className="row-label public">{row.rowLabel}</strong>
                  {row.cells.map((cell) => {
                    if (cell.kind !== 'SEAT') {
                      return <span className="aisle-gap public" key={cell.cellId} aria-hidden="true" />;
                    }
                    const isSelected = Boolean(cell.seatId && selected.includes(cell.seatId));
                    const status = isSelected ? 'SELECTED' : cell.status;
                    if (miniature) return <span className={`minimap-seat ${STATUS_STYLES[status].className}`} key={cell.cellId} />;
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
          </section>
        ))}
        <div className="unified-screen">
          <span>{show.screenSideLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <section className="bms-seat-map-shell unified-seat-shell">
      <TransformWrapper
        minScale={0.3}
        maxScale={2.4}
        centerOnInit
        centerZoomedOut
        limitToBounds={false}
        wheel={{ step: 0.12 }}
        panning={{ velocityDisabled: false, excluded: ['button'] }}
        pinch={{ step: 5, excluded: ['button'] }}
        doubleClick={{ mode: 'toggle', step: 0.55, excluded: ['button'] }}
        onTransform={(_, nextState) => setScale(nextState.scale)}
        onInit={({ instance, setTransform }) => {
          requestAnimationFrame(() => {
            const wrapperWidth = instance.wrapperComponent?.clientWidth ?? 0;
            const contentWidth = instance.contentComponent?.scrollWidth ?? 0;
            if (!wrapperWidth || !contentWidth) return;
            const scale = Math.max(0.42, Math.min(0.92, (wrapperWidth - 28) / contentWidth));
            setScale(scale);
            setTransform(0, 12, scale, 0);
          });
        }}
      >
        {({ zoomIn, zoomOut, centerView }) => (
          <>
            <div className="seat-map-toolbar unified-seat-toolbar" aria-label="Seat map controls">
              <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomOut(0.16)}><Minus size={17} /></button>
              <span>{Math.round(scale * 100)}%</span>
              <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomIn(0.16)}><Plus size={17} /></button>
              <button type="button" aria-label="Fit whole hall" title="Fit whole hall" onClick={() => centerView(Math.max(0.3, Math.min(0.92, (window.innerWidth - 32) / 1080)), 180)}><Maximize2 size={16} /></button>
            </div>
            <div className="unified-seat-viewport">
              <TransformComponent wrapperClass="unified-transform-wrapper" contentClass="unified-transform-content">
                {hallContent()}
              </TransformComponent>
              <MiniMap
                width={150}
                height={104}
                borderColor="rgba(245, 184, 46, 0.85)"
                previewStyle={{ border: '2px solid #f5b82e', background: 'rgba(245, 184, 46, 0.12)' }}
                wrapperClassName="unified-seat-minimap"
                panning
              >
                {hallContent(true)}
              </MiniMap>
            </div>
          </>
        )}
      </TransformWrapper>
      <div className="seat-legend public-dark unified-seat-legend">
        {Object.entries(STATUS_STYLES).map(([status, config]) => <span className={`seat-legend-item ${config.className}`} key={status}>{config.label}</span>)}
      </div>
    </section>
  );
}
