export const dynamic = 'force-dynamic';

import { PageHeader, StatusBadge } from '../../../components/premium-ui';
import { requireCentralRole } from '../../../lib/auth';
import { getCentralSyncStatus } from '../../../lib/reports';

function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleString('en-IN') : 'Never';
}

export default async function SyncMonitorPage() {
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
  const rows = await getCentralSyncStatus(session.theatreId);

  return (
    <main className="grid" style={{ gap: 24 }}>
      <PageHeader eyebrow="Sync monitor" title="Central to local health" description="Heartbeat freshness, trusted counters, sequence lag, and blocking issues across theatre links." />
      <section className="table-shell">
        <table>
          <thead>
            <tr>
              {['Theatre', 'Heartbeat', 'Online', 'Pending', 'Failed', 'Local seq', 'Synced seq', 'Lag', 'Trusted', 'Issues'].map((heading) => (
                <th key={heading}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.theatreId}>
                <td>{row.theatreId}<br /><small>{row.theatreCode ?? ''}</small></td>
                <td>{formatTime(row.lastHeartbeatAt)}<br /><small>{row.secondsSinceLastHeartbeat ?? 'n/a'}s ago</small></td>
                <td><StatusBadge tone={row.consideredOnline ? 'good' : 'bad'}>{row.consideredOnline ? 'Online' : 'Offline'}</StatusBadge></td>
                <td>{row.pendingSyncEvents}</td>
                <td>{row.failedSyncEvents}</td>
                <td>{row.lastLocalSequence}</td>
                <td>{row.lastSyncedSequence}</td>
                <td>{row.syncLag}</td>
                <td><StatusBadge tone={row.trustedHeartbeat ? 'good' : 'bad'}>{row.trustedHeartbeat ? 'Trusted' : 'Untrusted'}</StatusBadge></td>
                <td>{row.blockingIssues.join(', ') || 'None'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
