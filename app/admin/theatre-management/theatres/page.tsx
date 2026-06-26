export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ActionButton, EmptyState, MetricTile, PageHeader, PremiumCard, StatusBadge } from '../../../../components/premium-ui';
import { requireCentralRole } from '../../../../lib/auth';
import { listAdminManagementData } from '../../../../lib/admin-management';
import { ManagementNav } from '../_module';

export default async function TheatreListPage() {
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
  const data = await listAdminManagementData(session.theatreId);
  const theatres = data.theatres as Array<Record<string, unknown>>;
  return (
    <section className="grid" style={{ gap: 22 }}>
      <PageHeader eyebrow="Theatre management" title="Theatres" description="Paginated theatre registry entry point." actions={session.role === 'SUPER_ADMIN' ? <ActionButton href="/admin/theatre-management/theatres/new" variant="primary">New theatre</ActionButton> : null} />
      <ManagementNav />
      <section className="grid auto">
        <MetricTile label="Total theatres" value={theatres.length} />
        <MetricTile label="Active" value={theatres.filter((theatre) => String(theatre.status) === 'ACTIVE').length} />
        <MetricTile label="Screens" value={theatres.reduce((sum, theatre) => sum + Number(theatre.screenCount ?? 0), 0)} />
      </section>
      {!theatres.length ? <EmptyState title="No theatres"><p>No theatres match your scope.</p></EmptyState> : null}
      <section className="grid two">
        {theatres.map((theatre) => (
          <PremiumCard key={String(theatre.id)}>
            <div className="meta-row" style={{ justifyContent: 'space-between' }}>
              <div><p className="eyebrow">{String(theatre.code)}</p><h2>{String(theatre.name)}</h2><p>{String(theatre.city)}</p></div>
              <StatusBadge tone={String(theatre.status) === 'ACTIVE' ? 'good' : 'warn'}>{String(theatre.status)}</StatusBadge>
            </div>
            <div className="metric-strip" style={{ marginTop: 16 }}>
              <MetricTile label="Screens" value={String(theatre.screenCount ?? 0)} />
              <MetricTile label="Shows" value={String(theatre.showCount ?? 0)} />
            </div>
            <div className="meta-row" style={{ marginTop: 16 }}>
              <Link className="action-button primary" href={`/admin/theatre-management/theatres/${encodeURIComponent(String(theatre.id))}`}>View</Link>
              <Link className="action-button" href={`/admin/theatre-management/theatres/${encodeURIComponent(String(theatre.id))}/edit`}>Edit</Link>
              <Link className="action-button" href={`/admin/theatre-management/theatres/${encodeURIComponent(String(theatre.id))}/screens`}>Screens</Link>
            </div>
          </PremiumCard>
        ))}
      </section>
    </section>
  );
}
