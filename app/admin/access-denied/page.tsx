import { ActionButton, ErrorState, PageHeader } from '../../../components/premium-ui';

export default function AccessDeniedPage() {
  return (
    <main className="grid">
      <PageHeader
        eyebrow="Central security"
        title="Access denied"
        description="This account does not have the role required for the requested central admin screen."
      />
      <ErrorState title="Permission required">
        <p>Use an authorised central administrator session to continue.</p>
        <div className="meta-row">
          <ActionButton href="/admin" variant="primary">Admin home</ActionButton>
          <ActionButton href="/admin/login">Switch account</ActionButton>
        </div>
      </ErrorState>
    </main>
  );
}
