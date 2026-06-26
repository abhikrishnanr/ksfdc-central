export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton, MetricTile, PageHeader, PremiumCard, StatusBadge } from '../../../../../components/premium-ui';
import { requireCentralRole } from '../../../../../lib/auth';
import { listAdminManagementData } from '../../../../../lib/admin-management';
import { ManagementNav } from '../../_module';

export default async function TheatreDetailPage({ params }: { params: Promise<{ theatreId: string }> }) {
  const { theatreId } = await params;
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
  const data = await listAdminManagementData(session.theatreId);
  const theatre = (data.theatres as Array<Record<string, unknown>>).find((row) => String(row.id) === theatreId);
  if (!theatre) notFound();
  return (
    <section className="grid" style={{ gap: 22 }}>
      <PageHeader eyebrow="Theatre detail" title={String(theatre.name)} description={`${String(theatre.code)} - ${String(theatre.city)}`} actions={<ActionButton href={`/admin/theatre-management/theatres/${encodeURIComponent(theatreId)}/edit`} variant="primary">Edit theatre</ActionButton>} />
      <ManagementNav />
      <PremiumCard>
        <div className="meta-row" style={{ justifyContent: 'space-between' }}>
          <StatusBadge tone={String(theatre.status) === 'ACTIVE' ? 'good' : 'warn'}>{String(theatre.status)}</StatusBadge>
          <Link className="action-button" href={`/admin/theatre-management/theatres/${encodeURIComponent(theatreId)}/screens`}>View screens</Link>
        </div>
        <div className="metric-strip" style={{ marginTop: 16 }}>
          <MetricTile label="Screens" value={String(theatre.screenCount ?? 0)} />
          <MetricTile label="Shows" value={String(theatre.showCount ?? 0)} />
          <MetricTile label="Timezone" value={String(theatre.timezone ?? 'Asia/Kolkata')} />
        </div>
        <p style={{ marginTop: 16 }}>{String(theatre.address ?? 'No address recorded.')}</p>
      </PremiumCard>
    </section>
  );
}
