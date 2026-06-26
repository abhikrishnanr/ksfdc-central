export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { PageHeader, PremiumCard } from '../../../../../../components/premium-ui';
import AdminSubmitButton from '../../../../../../components/template/AdminSubmitButton';
import { requireCentralRole } from '../../../../../../lib/auth';
import { listAdminManagementData } from '../../../../../../lib/admin-management';
import { updateTheatreAction } from '../../../actions';
import { AdminField, ManagementNav } from '../../../_module';

export default async function EditTheatrePage({ params }: { params: Promise<{ theatreId: string }> }) {
  const { theatreId } = await params;
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
  const data = await listAdminManagementData(session.theatreId);
  const theatre = (data.theatres as Array<Record<string, unknown>>).find((row) => String(row.id) === theatreId);
  if (!theatre) notFound();
  return (
    <section className="grid" style={{ gap: 22 }}>
      <PageHeader eyebrow="Edit theatre" title={String(theatre.name)} description="This update targets the existing theatre primary key only." />
      <ManagementNav />
      <PremiumCard>
        <form className="admin-form admin-form-wide" action={updateTheatreAction}>
          <input type="hidden" name="id" value={theatreId} />
          <AdminField label="Name" name="name" defaultValue={String(theatre.name)} required />
          <AdminField label="City" name="city" defaultValue={String(theatre.city)} required />
          <AdminField label="Phone" name="contactPhone" defaultValue={String(theatre.contactPhone ?? '')} />
          <AdminField label="Timezone" name="timezone" defaultValue={String(theatre.timezone ?? 'Asia/Kolkata')} />
          <label className="admin-field wide"><span>Address</span><textarea name="address" rows={3} defaultValue={String(theatre.address ?? '')} /></label>
          <label className="admin-inline"><input name="enabled" type="checkbox" defaultChecked={String(theatre.status) === 'ACTIVE'} /> Enabled</label>
          <AdminSubmitButton pendingLabel="Updating...">Update theatre</AdminSubmitButton>
        </form>
      </PremiumCard>
    </section>
  );
}
