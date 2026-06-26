import { PageHeader, PremiumCard } from '../../../../../components/premium-ui';
import AdminSubmitButton from '../../../../../components/template/AdminSubmitButton';
import PosterFileInput from '../../../../../components/template/PosterFileInput';
import { requireCentralRole } from '../../../../../lib/auth';
import { createMovieAction } from '../../../movie-management/actions';
import { AdminField, ManagementNav } from '../../_module';

export default async function NewMoviePage() {
  await requireCentralRole(['SUPER_ADMIN']);
  return (
    <section className="grid" style={{ gap: 22 }}>
      <PageHeader eyebrow="Create movie" title="New movie" description="Poster is uploaded as a file and stored as a path." />
      <ManagementNav />
      <PremiumCard>
        <form className="admin-form admin-form-wide" action={createMovieAction}>
          <AdminField label="Movie ID" name="id" />
          <AdminField label="Title" name="title" required />
          <AdminField label="Language" name="language" />
          <AdminField label="Duration minutes" name="durationMinutes" type="number" />
          <AdminField label="Certificate" name="certificate" />
          <AdminField label="Release date" name="releaseDate" type="date" />
          <PosterFileInput />
          <AdminField label="Trailer URL" name="trailerUrl" />
          <AdminField label="Genres comma separated" name="genres" />
          <AdminField label="Formats comma separated" name="formats" />
          <AdminField label="Languages comma separated" name="languages" />
          <label className="admin-field"><span>Status</span><select name="status"><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option><option value="ARCHIVED">Archived</option></select></label>
          <label className="admin-field wide"><span>Synopsis</span><textarea name="synopsis" rows={4} /></label>
          <AdminSubmitButton pendingLabel="Creating...">Create movie</AdminSubmitButton>
        </form>
      </PremiumCard>
    </section>
  );
}
