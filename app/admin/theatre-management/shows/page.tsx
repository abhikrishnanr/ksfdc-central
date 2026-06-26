export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ActionButton, EmptyState, PageHeader, PremiumCard, StatusBadge } from '../../../../components/premium-ui';
import { requireCentralRole } from '../../../../lib/auth';
import { listAdminManagementData, SCHEDULING_AUTHORITY_LABELS } from '../../../../lib/admin-management';
import { formatShowDateTimeWithDaypart } from '../../../../lib/show-time';
import { ManagementNav } from '../_module';

export default async function ManagementShowsPage() {
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
  const data = await listAdminManagementData(session.theatreId);
  const shows = data.shows as Array<Record<string, unknown>>;
  return (
    <section className="grid" style={{ gap: 22 }}>
      <PageHeader eyebrow="Theatre management" title="Shows" description="Scheduled shows with booking status and sync state." actions={<ActionButton href="/admin/theatre-management/shows/new" variant="primary">Schedule show</ActionButton>} />
      <ManagementNav />
      {!shows.length ? <EmptyState title="No shows"><p>No scheduled shows match your scope.</p></EmptyState> : null}
      <section className="grid">
        {shows.map((show) => (
          <PremiumCard key={String(show.id)}>
            <div className="meta-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p className="eyebrow">{String(show.id)}</p>
                <h2>{String(show.movieTitle)}</h2>
                <p>{String(show.theatreName)} - {String(show.screenName)} - {formatShowDateTimeWithDaypart(show.showTime as Date | string)}</p>
              </div>
              <div className="meta-row">
                <StatusBadge tone="info">{SCHEDULING_AUTHORITY_LABELS[String(show.authorityMode) as keyof typeof SCHEDULING_AUTHORITY_LABELS] ?? String(show.authorityMode)}</StatusBadge>
                <StatusBadge tone={String(show.status) === 'OPEN' ? 'good' : 'warn'}>{String(show.status)}</StatusBadge>
              </div>
            </div>
            <div className="meta-row" style={{ marginTop: 16 }}>
              <Link className="action-button primary" href={`/admin/theatre-management/shows/${encodeURIComponent(String(show.id))}`}>View</Link>
              <Link className="action-button" href={`/admin/theatre-management/shows/${encodeURIComponent(String(show.id))}/edit`}>Edit</Link>
            </div>
          </PremiumCard>
        ))}
      </section>
    </section>
  );
}
