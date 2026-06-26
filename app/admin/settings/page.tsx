export const dynamic = 'force-dynamic';
import { ActionButton, MetricTile, PageHeader, PremiumCard, StatusBadge } from '../../../components/premium-ui';
import { requireCentralRole } from '../../../lib/auth';

export default async function SettingsPage() {
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
  return (
    <main className="grid">
      <PageHeader
        eyebrow="Authority policy"
        title="Theatre settings"
        description="Operational controls for local authority transfer, return-to-central readiness, and public booking posture."
        actions={<StatusBadge tone="warn">Guarded admin area</StatusBadge>}
      />
      <section className="grid two">
        <PremiumCard>
          <p className="eyebrow">Current scope</p>
          <h2>Configured by environment and database policy</h2>
          <div className="metric-strip" style={{ marginTop: 16 }}>
            <MetricTile label="Local counter exposure" value="LAN only" />
            <MetricTile label="Local port" value="3001" />
            <MetricTile label="Authority return" value="Verified sync" />
          </div>
        </PremiumCard>
        <PremiumCard>
          <p className="eyebrow">Fast paths</p>
          <h2>Admin operations</h2>
          <div className="meta-row" style={{ marginTop: 16 }}>
            <ActionButton href="/admin/sync-monitor" variant="primary">Sync monitor</ActionButton>
            <ActionButton href="/admin/theatre-management">Theatre scheduling</ActionButton>
            {session.role === 'SUPER_ADMIN' ? <ActionButton href="/admin/movie-management">Movies</ActionButton> : null}
            <ActionButton href="/admin/reconciliation">Reconciliation</ActionButton>
            <ActionButton href="/admin/seat-layouts">Seat layouts</ActionButton>
          </div>
        </PremiumCard>
      </section>
    </main>
  );
}
