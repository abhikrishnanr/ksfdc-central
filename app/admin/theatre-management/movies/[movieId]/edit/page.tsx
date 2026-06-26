export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { PageHeader, PremiumCard } from '../../../../../../components/premium-ui';
import AdminSubmitButton from '../../../../../../components/template/AdminSubmitButton';
import PosterFileInput from '../../../../../../components/template/PosterFileInput';
import { requireCentralRole } from '../../../../../../lib/auth';
import { listAdminManagementData } from '../../../../../../lib/admin-management';
import { updateMovieAction } from '../../../../movie-management/actions';
import { AdminField, ManagementNav } from '../../../_module';

export default async function EditMoviePage({ params, searchParams }: { params: Promise<{ movieId: string }>; searchParams?: Promise<{ movieError?: string }> }) {
  const { movieId } = await params;
  const query = await searchParams;
  await requireCentralRole(['SUPER_ADMIN']);
  const data = await listAdminManagementData();
  const movie = (data.movies as Array<Record<string, unknown>>).find((row) => String(row.id) === movieId);
  if (!movie) notFound();
  return (
    <section className="grid" style={{ gap: 22 }}>
      <PageHeader eyebrow="Edit movie" title={String(movie.title)} description="This update targets the existing movie primary key only." />
      <ManagementNav />
      {query?.movieError ? <PremiumCard><div role="alert" className="admin-error-banner">{query.movieError}</div></PremiumCard> : null}
      <PremiumCard>
        <form className="admin-form admin-form-wide" action={updateMovieAction}>
          <input type="hidden" name="returnTo" value={`/admin/theatre-management/movies/${encodeURIComponent(movieId)}/edit`} />
          <input type="hidden" name="id" value={movieId} />
          <AdminField label="Title" name="title" defaultValue={String(movie.title)} required />
          <AdminField label="Language" name="language" defaultValue={String(movie.language ?? '')} />
          <AdminField label="Duration minutes" name="durationMinutes" defaultValue={String(movie.durationMinutes ?? '')} type="number" />
          <AdminField label="Certificate" name="certificate" defaultValue={String(movie.certificate ?? '')} />
          <PosterFileInput currentPosterUrl={movie.posterUrl ? String(movie.posterUrl) : null} label="Replace poster" />
          <label className="admin-field"><span>Status</span><select name="status" defaultValue={String(movie.status)}><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option><option value="ARCHIVED">Archived</option></select></label>
          <AdminSubmitButton pendingLabel="Updating...">Update movie</AdminSubmitButton>
        </form>
      </PremiumCard>
    </section>
  );
}
