export const dynamic = 'force-dynamic';

import { EmptyState, MetricTile, PageHeader, PremiumCard, StatusBadge } from '../../../components/premium-ui';
import { getSeatLayouts } from '../../../lib/central-data';

function cellClass(status: string) {
  if (status === 'BLOCKED') return 'seat-button seat-blocked';
  if (status === 'SOLD') return 'seat-button seat-sold';
  if (status === 'HELD') return 'seat-button seat-held';
  return 'seat-button seat-available';
}

export default async function SeatLayoutsAdminPage() {
  const { dbStatus, data: layouts } = await getSeatLayouts();

  return (
    <section className="grid" style={{ gap: 24 }}>
      <PageHeader
        eyebrow="Seating inventory"
        title="Seat layouts"
        description={dbStatus.message}
        actions={<StatusBadge tone={layouts.length ? 'good' : 'warn'}>{layouts.length} layout(s)</StatusBadge>}
      />
      {!layouts.length ? <EmptyState title="No layouts"><p>Central database is unavailable or not seeded.</p></EmptyState> : null}
      {layouts.map((layout) => (
        <PremiumCard key={layout.id}>
          <div className="meta-row" style={{ justifyContent: 'space-between' }}>
            <div>
              <p className="eyebrow">{layout.theatreName} / {layout.screenName}</p>
              <h2>{layout.name}</h2>
            </div>
            <StatusBadge tone="info">{layout.rows.length} rows</StatusBadge>
          </div>
          <div className="metric-strip" style={{ marginTop: 16 }}>
            <MetricTile label="Total seats" value={layout.totalSeats} />
            <MetricTile label="Gaps / aisles" value={layout.gapCount} />
            <MetricTile label="Rows" value={layout.rows.filter((row) => row.rowLabel).map((row) => row.rowLabel).join(', ') || 'Pathway-only draft'} />
          </div>
          <div className="meta-row" style={{ marginTop: 16 }}>
            {layout.zones.map((zone) => <StatusBadge key={zone.zone} tone="violet">{zone.zone}: INR {zone.amount}</StatusBadge>)}
          </div>
          <div className="seat-shell" style={{ marginTop: 18 }}>
            <div className="screen-banner">SCREEN THIS SIDE</div>
            <div className="seat-map">
              {layout.rows.map((row, rowIndex) => (
                <div className={`seat-row${row.isPathway || row.cells.length === 0 ? ' pathway-row' : ''}`} key={row.rowKey ?? row.rowLabel ?? `row-${rowIndex}`}>
                  {row.isPathway || row.cells.length === 0 ? null : <strong className="row-label">{row.rowLabel}</strong>}
                  {row.cells.map((cell) => (
                    <span
                      key={cell.cellId}
                      className={cell.kind === 'SEAT' || cell.kind === 'BLOCKED' ? cellClass(cell.status) : 'aisle-gap'}
                      title={`${cell.seatId ?? cell.kind} ${cell.zone ?? ''} ${cell.status}`}
                    >
                      {cell.kind === 'SEAT' || cell.kind === 'BLOCKED' ? cell.seatNumber : cell.kind === 'AISLE' ? '|' : '.'}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </PremiumCard>
      ))}
    </section>
  );
}
