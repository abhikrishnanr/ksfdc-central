import { redirect } from 'next/navigation';
import { ErrorState, PageHeader, PremiumCard, StatusBadge } from '../../../components/premium-ui';
import { loginCentralUser } from '../../../lib/auth';

async function loginAction(formData: FormData) {
  'use server';
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');
  const result = await loginCentralUser(username, password);
  if (result.ok && result.role !== 'AGENT_CLIENT') redirect('/admin');
  redirect('/admin/login?error=1');
}

export default async function CentralLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="grid two" style={{ alignItems: 'start' }}>
      <PageHeader
        eyebrow="Central control"
        title="Admin sign in"
        description="Secure access for authority control, reconciliation, reports, and theatre synchronization."
        actions={<StatusBadge tone="info">Central console</StatusBadge>}
      />

      <PremiumCard className="flat">
        <div className="grid">
          <div>
            <p className="eyebrow">Credentials</p>
            <h2>Open command center</h2>
          </div>
          {error ? <ErrorState title="Invalid credentials"><p>Check the central admin username and password.</p></ErrorState> : null}
          <form action={loginAction} className="grid">
            <label>Username <input name="username" autoComplete="username" required /></label>
            <label>Password <input name="password" type="password" autoComplete="current-password" required /></label>
            <button className="action-button primary" type="submit">Sign in</button>
          </form>
          <p>Seed user: superadmin / ChangeMe@123</p>
        </div>
      </PremiumCard>
    </main>
  );
}
