export const dynamic = 'force-dynamic';

import { ActionButton, MetricTile, PageHeader, PremiumCard, StatusBadge } from '../../../components/premium-ui';
import AdminSubmitButton from '../../../components/template/AdminSubmitButton';
import PosterFileInput from '../../../components/template/PosterFileInput';
import { requireCentralRole } from '../../../lib/auth';
import { listAdminManagementData } from '../../../lib/admin-management';
import { createMovieAction, deleteMovieAction, updateMovieAction } from './actions';

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

export default async function MovieManagementPage({
  searchParams
}: {
  searchParams?: Promise<{ movieError?: string }>;
}) {
  const params = await searchParams;
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

      {params?.movieError ? (
        <PremiumCard>
          <div role="alert" className="admin-error-banner">
            {params.movieError}
          </div>
        </PremiumCard>
      ) : null}

      <section className="grid auto">
        <MetricTile label="Movies" value={movies.length} />
        <MetricTile label="Active" value={movies.filter((movie) => String(movie.status) === 'ACTIVE').length} />
        <MetricTile label="Archived / disabled" value={movies.filter((movie) => String(movie.status) !== 'ACTIVE').length} />
      </section>

      <PremiumCard>
        <p className="eyebrow">Create movie</p>
        <h2>New movie details</h2>
        <form className="admin-form admin-form-wide" action={createMovieAction}>
          <input type="hidden" name="returnTo" value="/admin/movie-management" />
          <Field label="Movie ID" name="id" />
          <Field label="Title" name="title" required />
          <Field label="Language" name="language" />
          <Field label="Duration minutes" name="durationMinutes" type="number" />
          <Field label="Certificate" name="certificate" />
          <Field label="Release date" name="releaseDate" type="date" />
          <PosterFileInput />
          <Field label="Trailer URL" name="trailerUrl" />
          <Field label="Genres comma separated" name="genres" />
          <Field label="Formats comma separated" name="formats" />
          <Field label="Languages comma separated" name="languages" />
          <label className="admin-field"><span>Status</span><select name="status"><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option><option value="ARCHIVED">Archived</option></select></label>
          <label className="admin-field wide"><span>Synopsis</span><textarea name="synopsis" rows={4} /></label>
          <AdminSubmitButton pendingLabel="Creating...">Create movie</AdminSubmitButton>
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
            <form className="admin-form compact" action={updateMovieAction}>
              <input type="hidden" name="returnTo" value="/admin/movie-management" />
              <input type="hidden" name="id" value={String(movie.id)} />
              <Field label="Title" name="title" defaultValue={String(movie.title)} required />
              <Field label="Language" name="language" defaultValue={String(movie.language ?? '')} />
              <Field label="Duration minutes" name="durationMinutes" defaultValue={String(movie.durationMinutes ?? '')} type="number" />
              <Field label="Certificate" name="certificate" defaultValue={String(movie.certificate ?? '')} />
              <PosterFileInput currentPosterUrl={movie.posterUrl ? String(movie.posterUrl) : null} label="Replace poster" />
              <label className="admin-field"><span>Status</span><select name="status" defaultValue={String(movie.status)}><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option><option value="ARCHIVED">Archived</option></select></label>
              <AdminSubmitButton variant="default" pendingLabel="Updating...">Update movie</AdminSubmitButton>
            </form>
            {Number(movie.showCount ?? 0) === 0 ? (
              <form action={deleteMovieAction} className="admin-form compact danger-form">
                <input type="hidden" name="returnTo" value="/admin/movie-management" />
                <input type="hidden" name="id" value={String(movie.id)} />
                <AdminSubmitButton variant="warn" pendingLabel="Deleting...">Delete movie</AdminSubmitButton>
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
