export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { ActionButton, MetricTile, PageHeader, PremiumCard, StatusBadge } from '../../../../../components/premium-ui';
import { requireCentralRole } from '../../../../../lib/auth';
import { listAdminManagementData } from '../../../../../lib/admin-management';
import { ManagementNav } from '../../_module';

export default async function ScreenDetailPage({ params }: { params: Promise<{ screenId: string }> }) {
  const { screenId } = await params;
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
  const data = await listAdminManagementData(session.theatreId);
  const screen = (data.screens as Array<Record<string, unknown>>).find((row) => String(row.id) === screenId);
  if (!screen) notFound();
  return (
    <section className="grid" style={{ gap: 22 }}>
      <PageHeader eyebrow="Screen detail" title={String(screen.name)} description={`${String(screen.theatreName)} - ${String(screen.code ?? screen.id)}`} actions={<ActionButton href={`/admin/theatre-management/screens/${encodeURIComponent(screenId)}/edit`} variant="primary">Edit screen</ActionButton>} />
      <ManagementNav />
      <PremiumCard>
        <StatusBadge tone={String(screen.status) === 'ACTIVE' ? 'good' : 'warn'}>{String(screen.status)}</StatusBadge>
        <div className="metric-strip" style={{ marginTop: 16 }}>
          <MetricTile label="Capacity" value={String(screen.activeSeatCount ?? screen.capacity ?? 0)} />
          <MetricTile label="Layout version" value={String(screen.activeLayoutVersion ?? '-')} />
          <MetricTile label="Layout ID" value={String(screen.activeLayoutId ?? '-')} />
        </div>
      </PremiumCard>
    </section>
  );
}
