export const dynamic = 'force-dynamic';

import { PageHeader, PremiumCard } from '../../../../../components/premium-ui';
import AdminSubmitButton from '../../../../../components/template/AdminSubmitButton';
import { requireCentralRole } from '../../../../../lib/auth';
import { listAdminManagementData, SCHEDULING_AUTHORITY_LABELS, SHOW_SCHEDULING_AUTHORITY_MODES } from '../../../../../lib/admin-management';
import { createShowAction } from '../../actions';
import { AdminField, ManagementNav } from '../../_module';

export default async function NewShowPage() {
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
  const data = await listAdminManagementData(session.theatreId);
  const theatres = data.theatres as Array<Record<string, unknown>>;
  const screens = data.screens as Array<Record<string, unknown>>;
  const movies = (data.movies as Array<Record<string, unknown>>).filter((movie) => String(movie.status) === 'ACTIVE');
  return (
    <section className="grid" style={{ gap: 22 }}>
      <PageHeader eyebrow="Schedule show" title="New scheduled show" description="Creates a new show record only. Existing shows are edited from their edit page." />
      <ManagementNav />
      <PremiumCard>
        <form className="admin-form admin-form-wide" action={createShowAction}>
          <label className="admin-field"><span>Theatre</span><select name="theatreId" required>{theatres.map((theatre) => <option key={String(theatre.id)} value={String(theatre.id)}>{String(theatre.name)}</option>)}</select></label>
          <label className="admin-field"><span>Screen</span><select name="screenId" required>{screens.map((screen) => <option key={String(screen.id)} value={String(screen.id)}>{String(screen.theatreName)} - {String(screen.name)}</option>)}</select></label>
          <label className="admin-field"><span>Movie</span><select name="movieId" required>{movies.map((movie) => <option key={String(movie.id)} value={String(movie.id)}>{String(movie.title)}</option>)}</select></label>
          <AdminField label="Show ID" name="id" />
          <AdminField label="Date" name="showDate" type="date" required />
          <AdminField label="Start time" name="showTime" type="time" required />
          <AdminField label="Duration minutes" name="durationMinutes" type="number" />
          <AdminField label="Cleaning buffer" name="cleaningBufferMinutes" type="number" defaultValue={20} />
          <label className="admin-field"><span>Booking authority</span><select name="authorityMode" required>{SHOW_SCHEDULING_AUTHORITY_MODES.map((mode) => <option key={mode} value={mode}>{SCHEDULING_AUTHORITY_LABELS[mode]}</option>)}</select></label>
          <label className="admin-field"><span>Status</span><select name="status"><option value="OPEN">Open</option><option value="SCHEDULED">Scheduled</option></select></label>
          <label className="admin-field wide"><span>Prices, one per line: ZONE=AMOUNT</span><textarea name="prices" rows={4} required placeholder={'SILVER=160\nGOLD=220'} /></label>
          <AdminSubmitButton pendingLabel="Scheduling...">Create show</AdminSubmitButton>
        </form>
      </PremiumCard>
    </section>
  );
}
