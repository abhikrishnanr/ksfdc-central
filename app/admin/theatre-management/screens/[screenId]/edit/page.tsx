export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { PageHeader, PremiumCard } from '../../../../../../components/premium-ui';
import AdminSubmitButton from '../../../../../../components/template/AdminSubmitButton';
import { requireCentralRole } from '../../../../../../lib/auth';
import { listAdminManagementData } from '../../../../../../lib/admin-management';
import { updateScreenAction } from '../../../actions';
import { AdminField, ManagementNav } from '../../../_module';

export default async function EditScreenPage({ params }: { params: Promise<{ screenId: string }> }) {
  const { screenId } = await params;
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
  const data = await listAdminManagementData(session.theatreId);
  const screen = (data.screens as Array<Record<string, unknown>>).find((row) => String(row.id) === screenId);
  if (!screen) notFound();
  return (
    <section className="grid" style={{ gap: 22 }}>
      <PageHeader eyebrow="Edit screen" title={String(screen.name)} description="This update targets the existing screen primary key only." />
      <ManagementNav />
      <PremiumCard>
        <form className="admin-form admin-form-wide" action={updateScreenAction}>
          <input type="hidden" name="id" value={screenId} />
          <AdminField label="Screen code" name="code" defaultValue={String(screen.code ?? '')} required />
          <AdminField label="Screen name" name="name" defaultValue={String(screen.name ?? '')} required />
          <label className="admin-inline"><input name="enabled" type="checkbox" defaultChecked={String(screen.status) === 'ACTIVE'} /> Enabled</label>
          <AdminSubmitButton pendingLabel="Updating...">Update screen</AdminSubmitButton>
        </form>
      </PremiumCard>
    </section>
  );
}
