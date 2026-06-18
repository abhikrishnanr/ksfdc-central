export const dynamic = 'force-dynamic';

import { EmptyState, MetricTile, PageHeader, PremiumCard, StatusBadge } from '../../../../components/premium-ui';
import { requireCentralRole } from '../../../../lib/auth';
import { getReconciliationDetail } from '../../../../lib/reports';

export default async function ReconciliationDetailPage({ params }: { params: Promise<{ showId: string }> }) {
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN', 'FINANCE_VIEWER']);
  const { showId } = await params;
  const detail = await getReconciliationDetail(showId, session.theatreId);

  return (
    <main className="grid" style={{ gap: 24 }}>
      <PageHeader
        eyebrow="Seat mirror audit"
        title={`Reconciliation detail: ${showId}`}
        description="Compare central sold seats, local synced seats, sequence blockers, and conflict records before authority return."
        actions={<StatusBadge tone={detail.blockingReasons.length ? 'warn' : 'good'}>{detail.blockingReasons.length ? 'Blocked' : 'Clean'}</StatusBadge>}
      />
      <PremiumCard>
        <div className="metric-strip">
          <MetricTile label="Authority" value={detail.authorityMode} />
          <MetricTile label="Status" value={detail.status} />
          <MetricTile label="Pending / failed" value={`${detail.pendingEvents} / ${detail.failedEvents}`} />
          <MetricTile label="Blocking reasons" value={detail.blockingReasons.join(', ') || 'None'} />
        </div>
      </PremiumCard>

      <section className="grid two">
        <PremiumCard>
          <p className="eyebrow">Conflicts</p>
          <h2>Seat ownership conflicts</h2>
          {detail.conflicts.length ? (
            <div className="table-shell" style={{ marginTop: 16 }}>
              <table>
                <thead><tr><th>Seat</th><th>Existing</th><th>Incoming</th><th>Event</th></tr></thead>
                <tbody>
                  {detail.conflicts.map((conflict) => (
                    <tr key={`${conflict.eventId}-${conflict.seatId}`}>
                      <td>{conflict.seatId}</td>
                      <td>{conflict.existingBookingId}</td>
                      <td>{conflict.incomingBookingId}</td>
                      <td>{conflict.eventId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No conflicts"><p>Central and local booking ownership is aligned.</p></EmptyState>}
        </PremiumCard>

        <PremiumCard>
          <p className="eyebrow">Mirror gaps</p>
          <h2>Missing central mirror seats</h2>
          {detail.missingSeats.length ? (
            <div className="grid" style={{ marginTop: 16 }}>
              {detail.missingSeats.map((seat) => (
                <div className="metric-tile" key={`${seat.eventId}-${seat.seatId}`}>
                  <strong>{seat.seatId}</strong>
                  <span>Booking {seat.bookingId} / event {seat.eventId}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState title="No missing seats"><p>Every synced local sale has a central mirror row.</p></EmptyState>}
        </PremiumCard>
      </section>

      <section className="grid two">
        <PremiumCard>
          <p className="eyebrow">Central sold seats</p>
          <h2>Central booking mirror</h2>
          <p>{detail.centralSoldSeats.map((seat) => `${seat.seatId}:${seat.bookingId}`).join(', ') || 'None'}</p>
        </PremiumCard>
        <PremiumCard>
          <p className="eyebrow">Local synced sold seats</p>
          <h2>Local sales received</h2>
          <p>{detail.localSyncedSoldSeats.map((seat) => `${seat.seatId}:${seat.bookingId}`).join(', ') || 'None'}</p>
        </PremiumCard>
      </section>
    </main>
  );
}
