export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { ActionButton, MetricTile, PageHeader, PremiumCard, StatusBadge } from '../../../../../components/premium-ui';
import { requireCentralRole } from '../../../../../lib/auth';
import { listAdminManagementData } from '../../../../../lib/admin-management';
import { ManagementNav } from '../../_module';

export default async function MovieDetailPage({ params }: { params: Promise<{ movieId: string }> }) {
  const { movieId } = await params;
  await requireCentralRole(['SUPER_ADMIN']);
  const data = await listAdminManagementData();
  const movie = (data.movies as Array<Record<string, unknown>>).find((row) => String(row.id) === movieId);
  if (!movie) notFound();
  return (
    <section className="grid" style={{ gap: 22 }}>
      <PageHeader eyebrow="Movie detail" title={String(movie.title)} description={String(movie.id)} actions={<ActionButton href={`/admin/theatre-management/movies/${encodeURIComponent(movieId)}/edit`} variant="primary">Edit movie</ActionButton>} />
      <ManagementNav />
      <PremiumCard>
        <StatusBadge tone={String(movie.status) === 'ACTIVE' ? 'good' : 'warn'}>{String(movie.status)}</StatusBadge>
        <div className="metric-strip" style={{ marginTop: 16 }}>
          <MetricTile label="Language" value={String(movie.language ?? '-')} />
          <MetricTile label="Duration" value={movie.durationMinutes ? `${String(movie.durationMinutes)} min` : '-'} />
          <MetricTile label="Shows" value={String(movie.showCount ?? 0)} />
        </div>
      </PremiumCard>
    </section>
  );
}
