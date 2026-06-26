export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MetricTile, PageHeader, PremiumCard, StatusBadge } from '../../../../../../components/premium-ui';
import { requireCentralRole } from '../../../../../../lib/auth';
import { listAdminManagementData } from '../../../../../../lib/admin-management';
import { ManagementNav } from '../../../_module';

export default async function TheatreScreensPage({ params }: { params: Promise<{ theatreId: string }> }) {
  const { theatreId } = await params;
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
  const data = await listAdminManagementData(session.theatreId);
  const theatre = (data.theatres as Array<Record<string, unknown>>).find((row) => String(row.id) === theatreId);
  if (!theatre) notFound();
  const screens = (data.screens as Array<Record<string, unknown>>).filter((screen) => String(screen.theatreId) === theatreId);
  return (
    <section className="grid" style={{ gap: 22 }}>
      <PageHeader eyebrow="Screens" title={`${String(theatre.name)} screens`} description="Screen list for this theatre." />
      <ManagementNav />
      <section className="grid two">
        {screens.map((screen) => (
          <PremiumCard key={String(screen.id)}>
            <div className="meta-row" style={{ justifyContent: 'space-between' }}>
              <div><p className="eyebrow">{String(screen.code ?? screen.id)}</p><h2>{String(screen.name)}</h2></div>
              <StatusBadge tone={String(screen.status) === 'ACTIVE' ? 'good' : 'warn'}>{String(screen.status)}</StatusBadge>
            </div>
            <div className="metric-strip" style={{ marginTop: 16 }}>
              <MetricTile label="Seats" value={String(screen.activeSeatCount ?? screen.capacity ?? 0)} />
              <MetricTile label="Layout" value={`v${String(screen.activeLayoutVersion ?? '-')}`} />
            </div>
            <div className="meta-row" style={{ marginTop: 16 }}>
              <Link className="action-button primary" href={`/admin/theatre-management/screens/${encodeURIComponent(String(screen.id))}`}>View</Link>
              <Link className="action-button" href={`/admin/theatre-management/screens/${encodeURIComponent(String(screen.id))}/edit`}>Edit</Link>
            </div>
          </PremiumCard>
        ))}
      </section>
    </section>
  );
}
