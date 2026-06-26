export const dynamic = 'force-dynamic';

import { ActionButton, MetricTile, PageHeader, PremiumCard, StatusBadge } from '../../../components/premium-ui';
import { requireCentralRole } from '../../../lib/auth';
import { listAdminManagementData } from '../../../lib/admin-management';
import { deleteMovieAction, upsertMovieAction } from './actions';

function tone(status: string) {
  if (status === 'ACTIVE') return 'good' as const;
  if (status === 'ARCHIVED') return 'warn' as const;
  if (status === 'DISABLED' || status === 'INACTIVE') return 'bad' as const;
  return 'neutral' as const;
}

function Field({ label, name, defaultValue, required = false, type = 'text' }: { label: string; name: string; defaultValue?: string | number | null; required?: boolean; type?: string }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <input name={name} type={type} required={required} defaultValue={defaultValue ?? ''} />
    </label>
  );
}

export default async function MovieManagementPage() {
  await requireCentralRole(['SUPER_ADMIN']);
  const data = await listAdminManagementData();
  const movies = data.movies as Array<Record<string, unknown>>;

  return (
    <section className="grid" style={{ gap: 24 }}>
      <PageHeader
        eyebrow="Movie catalogue"
        title="Database-backed movie management"
        description="Create, edit, disable, archive, and safely delete movies. Deletion is blocked when shows or bookings depend on the movie."
        actions={<ActionButton href="/admin/theatre-management" variant="primary">Scheduling</ActionButton>}
      />

      <section className="grid auto">
        <MetricTile label="Movies" value={movies.length} />
        <MetricTile label="Active" value={movies.filter((movie) => String(movie.status) === 'ACTIVE').length} />
        <MetricTile label="Archived / disabled" value={movies.filter((movie) => String(movie.status) !== 'ACTIVE').length} />
      </section>

      <PremiumCard>
        <p className="eyebrow">Create or edit</p>
        <h2>Movie details and poster metadata</h2>
        <form className="admin-form admin-form-wide" action={upsertMovieAction}>
          <Field label="Movie ID" name="id" />
          <Field label="Title" name="title" required />
          <Field label="Language" name="language" />
          <Field label="Duration minutes" name="durationMinutes" type="number" />
          <Field label="Certificate" name="certificate" />
          <Field label="Release date" name="releaseDate" type="date" />
          <Field label="Poster URL" name="posterUrl" />
          <Field label="Poster file name" name="posterFileName" />
          <Field label="Poster content type" name="posterContentType" />
          <Field label="Poster size bytes" name="posterSizeBytes" type="number" />
          <Field label="Trailer URL" name="trailerUrl" />
          <Field label="Genres comma separated" name="genres" />
          <Field label="Formats comma separated" name="formats" />
          <Field label="Languages comma separated" name="languages" />
          <label className="admin-field"><span>Status</span><select name="status"><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option><option value="ARCHIVED">Archived</option></select></label>
          <label className="admin-field wide"><span>Synopsis</span><textarea name="synopsis" rows={4} /></label>
          <button className="action-button primary" type="submit">Save movie</button>
        </form>
      </PremiumCard>

      <section className="grid two">
        {movies.map((movie) => (
          <PremiumCard key={String(movie.id)}>
            <div className="meta-row" style={{ justifyContent: 'space-between' }}>
              <div>
                <p className="eyebrow">{String(movie.id)}</p>
                <h2>{String(movie.title)}</h2>
              </div>
              <StatusBadge tone={tone(String(movie.status))}>{String(movie.status)}</StatusBadge>
            </div>
            <div className="metric-strip" style={{ marginTop: 16 }}>
              <MetricTile label="Language" value={String(movie.language ?? '-')} />
              <MetricTile label="Duration" value={movie.durationMinutes ? `${String(movie.durationMinutes)} min` : '-'} />
              <MetricTile label="Shows" value={String(movie.showCount ?? 0)} />
            </div>
            <form className="admin-form compact" action={upsertMovieAction}>
              <input type="hidden" name="id" value={String(movie.id)} />
              <Field label="Title" name="title" defaultValue={String(movie.title)} required />
              <Field label="Language" name="language" defaultValue={String(movie.language ?? '')} />
              <Field label="Duration minutes" name="durationMinutes" defaultValue={String(movie.durationMinutes ?? '')} type="number" />
              <Field label="Certificate" name="certificate" defaultValue={String(movie.certificate ?? '')} />
              <Field label="Poster URL" name="posterUrl" defaultValue={String(movie.posterUrl ?? '')} />
              <label className="admin-field"><span>Status</span><select name="status" defaultValue={String(movie.status)}><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option><option value="ARCHIVED">Archived</option></select></label>
              <button className="action-button" type="submit">Save</button>
            </form>
            {Number(movie.showCount ?? 0) === 0 ? (
              <form action={deleteMovieAction} className="admin-form compact danger-form">
                <input type="hidden" name="id" value={String(movie.id)} />
                <button className="action-button warn" type="submit">Delete movie</button>
              </form>
            ) : (
              <p className="muted-note">This movie has scheduled shows. Archive or disable it instead of deleting.</p>
            )}
          </PremiumCard>
        ))}
      </section>
    </section>
  );
}
