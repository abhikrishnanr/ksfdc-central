export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ActionButton, MetricTile, PageHeader, PremiumCard, StatusBadge } from '../../../../components/premium-ui';
import { requireCentralRole } from '../../../../lib/auth';
import { listAdminManagementData } from '../../../../lib/admin-management';
import { ManagementNav } from '../_module';

export default async function ManagementMoviesPage() {
  await requireCentralRole(['SUPER_ADMIN']);
  const data = await listAdminManagementData();
  const movies = data.movies as Array<Record<string, unknown>>;
  return (
    <section className="grid" style={{ gap: 22 }}>
      <PageHeader eyebrow="Theatre management" title="Movies" description="Movie catalogue records used by show scheduling." actions={<ActionButton href="/admin/theatre-management/movies/new" variant="primary">New movie</ActionButton>} />
      <ManagementNav />
      <section className="grid auto">
        <MetricTile label="Movies" value={movies.length} />
        <MetricTile label="Active" value={movies.filter((movie) => String(movie.status) === 'ACTIVE').length} />
        <MetricTile label="Scheduled shows" value={movies.reduce((sum, movie) => sum + Number(movie.showCount ?? 0), 0)} />
      </section>
      <section className="grid two">
        {movies.map((movie) => (
          <PremiumCard key={String(movie.id)}>
            <div className="meta-row" style={{ justifyContent: 'space-between' }}>
              <div><p className="eyebrow">{String(movie.id)}</p><h2>{String(movie.title)}</h2><p>{String(movie.language ?? '-')}</p></div>
              <StatusBadge tone={String(movie.status) === 'ACTIVE' ? 'good' : 'warn'}>{String(movie.status)}</StatusBadge>
            </div>
            <div className="meta-row" style={{ marginTop: 16 }}>
              <Link className="action-button primary" href={`/admin/theatre-management/movies/${encodeURIComponent(String(movie.id))}`}>View</Link>
              <Link className="action-button" href={`/admin/theatre-management/movies/${encodeURIComponent(String(movie.id))}/edit`}>Edit</Link>
            </div>
          </PremiumCard>
        ))}
      </section>
    </section>
  );
}
