export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ActionButton, EmptyState, MetricTile, PageHeader, PremiumCard, StatCard, StatusBadge } from '../../components/premium-ui';
import { requireCentralRole } from '../../lib/auth';
import { getAdminDashboard } from '../../lib/central-data';
import RefreshTheatreSeatMirrorButton from './RefreshTheatreSeatMirrorButton';

function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleString('en-IN') : 'Never';
}

function heartbeatTone(status: string) {
  if (status === 'ONLINE') return 'good';
  if (status === 'OFFLINE' || status === 'STALE') return 'bad';
  return 'warn';
}

export default async function AdminPage() {
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN', 'FINANCE_VIEWER']);
  const { dbStatus, data } = await getAdminDashboard(session.theatreId);

  return (
    <section className="grid" style={{ gap: 24 }}>
      <PageHeader
        eyebrow="Central admin"
        title={session.theatreId ? 'Theatre operations dashboard' : 'Authority, revenue, and sync command'}
        description={session.theatreId ? `${dbStatus.message} Signed in for ${session.theatreId}.` : dbStatus.message}
        actions={(
          <>
            <ActionButton href="/admin/sync-monitor" variant="primary">Sync monitor</ActionButton>
            <ActionButton href="/admin/reconciliation">Reconciliation</ActionButton>
            <ActionButton href="/admin/reports">Reports</ActionButton>
            <RefreshTheatreSeatMirrorButton />
          </>
        )}
      />

      <div className="grid auto">
        <StatCard label="Shows today" value={data.totalShowsToday} />
        <StatCard label="Bookings today" value={data.totalBookingsToday} tone="info" />
        <StatCard label="Revenue today" value={`INR ${data.totalCollection}`} tone="good" />
        <StatCard label="Failed sync" value={data.failedSyncEvents} tone={data.failedSyncEvents > 0 ? 'bad' : 'good'} />
        <StatCard label="Pending sync" value={data.pendingSyncEvents} tone={data.pendingSyncEvents > 0 ? 'warn' : 'good'} />
        <StatCard label="Local theatre" value={data.theatreHeartbeat?.localHeartbeatStatus ?? 'No heartbeat'} tone={data.theatreHeartbeat?.localHeartbeatStatus === 'ONLINE' ? 'good' : 'bad'} />
      </div>

      <div className="grid auto">
        <StatCard label="Central bookings" value={data.centralBookingsToday} />
        <StatCard label="Local synced bookings" value={data.localSyncedBookingsToday} />
        <StatCard label="Agent bookings" value={data.agentBookingsToday} />
        <StatCard label="Active agents" value={data.activeAgents} />
        <StatCard label="Central mirror sequence" value={data.latestCentralMirrorSequenceNo ?? 'none'} />
        <StatCard label="Latest local sequence" value={data.latestReceivedLocalSequenceNo ?? 'none'} />
      </div>

      <section className="grid two">
        <PremiumCard>
          <div className="meta-row" style={{ justifyContent: 'space-between' }}>
            <div>
              <p className="eyebrow">Authority by show</p>
              <h2>Show-wise state</h2>
            </div>
            <Link className="action-button" href="/admin/settings">Authority settings</Link>
          </div>
          <div className="grid" style={{ marginTop: 16 }}>
            {data.authorityByShow.length ? data.authorityByShow.map((show) => (
              <article className="metric-tile" key={show.showId}>
                <div className="meta-row">
                  <strong>{show.showId}</strong>
                  <StatusBadge tone={show.authorityMode.includes('LOCAL') ? 'warn' : 'good'}>{show.authorityMode}</StatusBadge>
                  <StatusBadge tone={show.failedSyncEvents > 0 ? 'bad' : show.pendingSyncEvents > 0 ? 'warn' : 'good'}>{show.failedSyncEvents} failed</StatusBadge>
                </div>
                <p>{show.movieTitle}</p>
                <p>Last heartbeat: {formatTime(show.localHeartbeatAt)} - Pending sync: {show.pendingSyncEvents}</p>
              </article>
            )) : <EmptyState title="No authority data"><p>Central database is unavailable or not seeded.</p></EmptyState>}
          </div>
        </PremiumCard>

        <PremiumCard>
          <p className="eyebrow">Theatre heartbeat visibility</p>
          <h2>Local theatre link</h2>
          <div className="grid" style={{ marginTop: 16 }}>
            {data.theatreHeartbeats.length ? data.theatreHeartbeats.map((heartbeat) => (
              <article className="metric-tile" key={heartbeat.theatreId}>
                <div className="meta-row">
                  <strong>{heartbeat.theatreId}</strong>
                  <StatusBadge tone={heartbeatTone(heartbeat.localHeartbeatStatus)}>{heartbeat.localHeartbeatStatus}</StatusBadge>
                </div>
                <p>Last seen: {formatTime(heartbeat.lastSeenAt)}</p>
                <div className="metric-strip">
                  <MetricTile label="Authority" value={heartbeat.authorityMode} />
                  <MetricTile label="Local seq" value={heartbeat.lastLocalSequence} />
                  <MetricTile label="Pending / failed" value={`${heartbeat.pendingLocalEvents} / ${heartbeat.failedLocalEvents}`} />
                </div>
              </article>
            )) : <EmptyState title="No heartbeat"><p>No heartbeat received from local theatre.</p></EmptyState>}
          </div>
        </PremiumCard>
      </section>
    </section>
  );
}
