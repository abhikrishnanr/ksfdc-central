export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ActionButton, PageHeader, StatusBadge } from '../../../components/premium-ui';
import { requireCentralRole } from '../../../lib/auth';
import { getReconciliationReport } from '../../../lib/reports';

function statusTone(status: string) {
  if (status === 'OK') return 'good';
  if (status === 'PENDING_SYNC') return 'warn';
  return 'bad';
}

export default async function ReconciliationPage() {
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN', 'FINANCE_VIEWER']);
  const rows = await getReconciliationReport(session.theatreId);

  return (
    <main className="grid" style={{ gap: 24 }}>
      <PageHeader
        eyebrow="Reconciliation"
        title="Central mirror confidence"
        description="Compare central confirmed seats with synced local sales before operational transitions."
        actions={<ActionButton href="/api/admin/reconciliation?format=csv" variant="primary">Export CSV</ActionButton>}
      />
      <section className="table-shell">
        <table>
          <thead>
            <tr>
              {['Show', 'Authority', 'Status', 'Central sold', 'Local synced', 'Conflicts', 'Missing mirror', 'Pending', 'Failed', 'Lag', 'Reasons'].map((heading) => (
                <th key={heading}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.showId}>
                <td><Link href={`/admin/reconciliation/${row.showId}`}>{row.showId}</Link><br /><small>{row.movieTitle}</small></td>
                <td>{row.authorityMode}</td>
                <td><StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge></td>
                <td>{row.centralSoldCount}</td>
                <td>{row.localSyncedSoldCount}</td>
                <td>{row.conflictCount}</td>
                <td>{row.missingMirrorCount}</td>
                <td>{row.pendingEvents}</td>
                <td>{row.failedEvents}</td>
                <td>{row.sequenceGap}</td>
                <td>{row.blockingReasons.join(', ') || 'None'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
