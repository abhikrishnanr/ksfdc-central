import { PageHeader, PremiumCard } from '../../../../../components/premium-ui';
import AdminSubmitButton from '../../../../../components/template/AdminSubmitButton';
import { requireCentralRole } from '../../../../../lib/auth';
import { createTheatreAction } from '../../actions';
import { AdminField, ManagementNav } from '../../_module';

export default async function NewTheatrePage() {
  await requireCentralRole(['SUPER_ADMIN']);
  return (
    <section className="grid" style={{ gap: 22 }}>
      <PageHeader eyebrow="Create theatre" title="New theatre" description="Create a theatre master record. Screens are managed after the theatre exists." />
      <ManagementNav />
      <PremiumCard>
        <form className="admin-form admin-form-wide" action={createTheatreAction}>
          <AdminField label="Theatre ID" name="id" />
          <AdminField label="Code" name="code" required />
          <AdminField label="Name" name="name" required />
          <AdminField label="City" name="city" required />
          <AdminField label="Phone" name="contactPhone" />
          <AdminField label="Timezone" name="timezone" defaultValue="Asia/Kolkata" />
          <label className="admin-field wide"><span>Address</span><textarea name="address" rows={3} /></label>
          <AdminSubmitButton pendingLabel="Creating...">Create theatre</AdminSubmitButton>
        </form>
      </PremiumCard>
    </section>
  );
}
