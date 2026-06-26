export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { PageHeader, PremiumCard } from '../../../../../../components/premium-ui';
import AdminSubmitButton from '../../../../../../components/template/AdminSubmitButton';
import { requireCentralRole } from '../../../../../../lib/auth';
import { listAdminManagementData, SCHEDULING_AUTHORITY_LABELS, SHOW_SCHEDULING_AUTHORITY_MODES } from '../../../../../../lib/admin-management';
import { updateShowAction } from '../../../actions';
import { AdminField, ManagementNav } from '../../../_module';

function dateValue(value: unknown) {
  const date = new Date(String(value ?? ''));
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function timeValue(value: unknown) {
  const date = new Date(String(value ?? ''));
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export default async function EditShowPage({ params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params;
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
  const data = await listAdminManagementData(session.theatreId);
  const show = (data.shows as Array<Record<string, unknown>>).find((row) => String(row.id) === showId);
  if (!show) notFound();
  const hasBookings = Number(show.bookingCount ?? 0) > 0 || Number(show.ticketCount ?? 0) > 0;
  return (
    <section className="grid" style={{ gap: 22 }}>
      <PageHeader eyebrow="Edit show" title={String(show.movieTitle)} description="This update targets the existing show primary key only." />
      <ManagementNav />
      <PremiumCard>
        <form className="admin-form admin-form-wide" action={updateShowAction}>
          <input type="hidden" name="showId" value={showId} />
          <AdminField label="New date" name="showDate" type="date" defaultValue={dateValue(show.showTime)} required />
          <AdminField label="New start time" name="showTime" type="time" defaultValue={timeValue(show.showTime)} required />
          <AdminField label="Cleaning buffer" name="cleaningBufferMinutes" type="number" defaultValue={Number(show.cleaningBufferMinutes ?? 20)} />
          <label className="admin-field"><span>Authority</span><select name="authorityMode" defaultValue={String(show.authorityMode)}>{SHOW_SCHEDULING_AUTHORITY_MODES.map((mode) => <option key={mode} value={mode}>{SCHEDULING_AUTHORITY_LABELS[mode]}</option>)}</select></label>
          <label className="admin-field wide"><span>Reason</span><textarea name="reason" rows={3} required={hasBookings} /></label>
          {hasBookings ? <label className="admin-inline"><input type="checkbox" name="confirmReschedule" required /> Confirm notification and rescheduling of affected bookings</label> : null}
          <AdminSubmitButton pendingLabel="Updating...">Update show</AdminSubmitButton>
        </form>
      </PremiumCard>
    </section>
  );
}
