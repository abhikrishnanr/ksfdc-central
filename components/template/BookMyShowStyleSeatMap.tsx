'use client';

import { Maximize2, Minimize2, Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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

function rowHasSeats(row: { cells: SeatCell[] }) {
  return row.cells.some((cell) => cell.kind === 'SEAT');
}

function amountForZone(show: BookingShowDetail, zone: string) {
  return show.zoneRates.find((rate) => rate.zone === zone)?.amount ?? null;
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
  const [fullscreen, setFullscreen] = useState(false);
  const shellRef = useRef<HTMLElement>(null);

  function fullscreenTarget() {
    return shellRef.current?.closest('.public-seat-selection-layout') as HTMLElement | null ?? shellRef.current;
  }

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === fullscreenTarget());
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!fullscreen || document.fullscreenElement) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [fullscreen]);

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (fullscreen) {
      setFullscreen(false);
      return;
    }
    try {
      const target = fullscreenTarget();
      await target?.requestFullscreen();
      if (document.fullscreenElement !== target) setFullscreen(true);
    } catch {
      setFullscreen(true);
    }
  }

  function hallContent(miniature = false) {
    let activeZone = '';
    return (
      <div className={`unified-seat-hall${miniature ? ' is-minimap' : ''}`}>
        {show.rows.map((row, rowIndex) => {
          const hasSeats = rowHasSeats(row);
          const zone = hasSeats ? rowZone(row) : activeZone;
          const zoneChanged = Boolean(hasSeats && zone !== activeZone);
          if (hasSeats) activeZone = zone;
          const amount = amountForZone(show, zone);
          return (
            <section className={`unified-seat-zone${row.isPathway || !hasSeats ? ' is-pathway-zone' : ''}`} key={row.rowKey ?? row.rowLabel ?? `row-${rowIndex}`}>
              {zoneChanged ? (
                <div className="unified-zone-heading">
                  <strong>{zone}</strong>
                  {amount == null ? null : <span>INR {amount}</span>}
                </div>
              ) : null}
              {!hasSeats || row.isPathway ? (
                <div className="seat-row public pathway-row" aria-label="Aisle pathway" />
              ) : (
                <div className="seat-row public">
                  {row.rowLabel ? <strong className="row-label public">{row.rowLabel}</strong> : <span className="row-label public empty" aria-hidden="true" />}
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
              )}
            </section>
          );
        })}
        <div className="unified-screen">
          <span>{show.screenSideLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <section className={`bms-seat-map-shell unified-seat-shell${fullscreen ? ' is-fullscreen' : ''}`} ref={shellRef}>
      <div className="seat-legend public-dark unified-seat-legend" aria-label="Seat status legend">
        {Object.entries(STATUS_STYLES).map(([status, config]) => <span className={`seat-legend-item ${config.className}`} key={status}>{config.label}</span>)}
      </div>
      <TransformWrapper
        minScale={0.3}
        maxScale={2.4}
        centerOnInit
        centerZoomedOut
        limitToBounds={false}
        wheel={{ step: 0.006 }}
        panning={{ velocityDisabled: true, excluded: scale > 1 ? [] : ['button'] }}
        pinch={{ step: 3 }}
        doubleClick={{ mode: 'toggle', step: 0.35, excluded: ['button'] }}
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
              <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomOut(0.1)}><Minus size={17} /></button>
              <span>{Math.round(scale * 100)}%</span>
              <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomIn(0.1)}><Plus size={17} /></button>
              <button type="button" aria-label="Fit whole hall" title="Fit whole hall" onClick={() => centerView(Math.max(0.3, Math.min(0.92, (window.innerWidth - 32) / 1080)), 180)}><Maximize2 size={16} /></button>
              <button className="seat-fullscreen-button" type="button" aria-label={fullscreen ? 'Exit fullscreen seat map' : 'Open fullscreen seat map'} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={() => void toggleFullscreen()}>
                {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                <small>{fullscreen ? 'Exit' : 'Fullscreen'}</small>
              </button>
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
    </section>
  );
}
