export const dynamic = 'force-dynamic';
import { EmptyState, MetricTile, PageHeader, PremiumCard, StatusBadge } from '../../../components/premium-ui';
import { requireCentralRole } from '../../../lib/auth';
import { getAdminDashboard } from '../../../lib/central-data';

function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleString('en-IN') : 'Never';
}

function heartbeatTone(status: string) {
  if (status === 'ONLINE') return 'good';
  if (status === 'STALE') return 'warn';
  return 'bad';
}

export default async function TheatreDashboardPage() {
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
  const { data } = await getAdminDashboard(session.theatreId);

  return (
    <section className="grid" style={{ gap: 24 }}>
      <PageHeader
        eyebrow="Theatre network"
        title="Theatre dashboard"
        description="Heartbeat status is ONLINE within 30 seconds, STALE from 30-60 seconds, and OFFLINE after 60 seconds or explicit offline state."
        actions={<StatusBadge tone={data.theatreHeartbeats.length ? 'good' : 'warn'}>{data.theatreHeartbeats.length} theatre link(s)</StatusBadge>}
      />
      {data.theatreHeartbeats.length ? data.theatreHeartbeats.map((heartbeat) => (
        <PremiumCard key={heartbeat.theatreId}>
          <div className="meta-row" style={{ justifyContent: 'space-between' }}>
            <div>
              <p className="eyebrow">Local node</p>
              <h2>{heartbeat.theatreId}</h2>
            </div>
            <StatusBadge tone={heartbeatTone(heartbeat.localHeartbeatStatus)}>{heartbeat.localHeartbeatStatus}</StatusBadge>
          </div>
          <div className="metric-strip" style={{ marginTop: 16 }}>
            <MetricTile label="Last heartbeat" value={formatTime(heartbeat.lastSeenAt)} />
            <MetricTile label="Authority mode" value={heartbeat.authorityMode} />
            <MetricTile label="Pending / failed local sync" value={`${heartbeat.pendingLocalEvents} / ${heartbeat.failedLocalEvents}`} />
            <MetricTile label="Last local sequence" value={heartbeat.lastLocalSequence} />
            <MetricTile label="Central mirror sequence acked" value={heartbeat.lastCentralMirrorSequence} />
          </div>
          {heartbeat.localAppUrl ? <p style={{ marginTop: 16 }}>Local app URL: {heartbeat.localAppUrl}</p> : null}
        </PremiumCard>
      )) : <EmptyState title="No heartbeat"><p>No heartbeat received from local theatre.</p></EmptyState>}
    </section>
  );
}
