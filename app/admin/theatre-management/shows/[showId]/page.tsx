export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { ActionButton, MetricTile, PageHeader, PremiumCard, StatusBadge } from '../../../../../components/premium-ui';
import { requireCentralRole } from '../../../../../lib/auth';
import { listAdminManagementData, SCHEDULING_AUTHORITY_LABELS } from '../../../../../lib/admin-management';
import { formatShowDateTimeWithDaypart } from '../../../../../lib/show-time';
import { ManagementNav } from '../../_module';

export default async function ShowDetailPage({ params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params;
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
  const data = await listAdminManagementData(session.theatreId);
  const show = (data.shows as Array<Record<string, unknown>>).find((row) => String(row.id) === showId);
  if (!show) notFound();
  return (
    <section className="grid" style={{ gap: 22 }}>
      <PageHeader eyebrow="Show detail" title={String(show.movieTitle)} description={formatShowDateTimeWithDaypart(show.showTime as Date | string)} actions={<ActionButton href={`/admin/theatre-management/shows/${encodeURIComponent(showId)}/edit`} variant="primary">Edit show</ActionButton>} />
      <ManagementNav />
      <PremiumCard>
        <div className="meta-row">
          <StatusBadge tone="info">{SCHEDULING_AUTHORITY_LABELS[String(show.authorityMode) as keyof typeof SCHEDULING_AUTHORITY_LABELS] ?? String(show.authorityMode)}</StatusBadge>
          <StatusBadge tone={String(show.status) === 'OPEN' ? 'good' : 'warn'}>{String(show.status)}</StatusBadge>
        </div>
        <div className="metric-strip" style={{ marginTop: 16 }}>
          <MetricTile label="Theatre" value={String(show.theatreName)} />
          <MetricTile label="Screen" value={String(show.screenName)} />
          <MetricTile label="Bookings" value={String(show.bookingCount ?? 0)} />
          <MetricTile label="Tickets" value={String(show.ticketCount ?? 0)} />
        </div>
      </PremiumCard>
    </section>
  );
}
