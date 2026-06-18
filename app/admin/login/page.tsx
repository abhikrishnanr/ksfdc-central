import { Building2, ChartNoAxesCombined, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { loginCentralUser } from '../../../lib/auth';

async function loginAction(formData: FormData) {
  'use server';
  const result = await loginCentralUser(String(formData.get('username') ?? ''), String(formData.get('password') ?? ''));
  if (result.ok && result.role !== 'AGENT_CLIENT') redirect('/admin');
  redirect('/admin/login?error=1');
}

export default async function CentralLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <section className="role-login-page theatre-role-login">
      <div className="role-login-welcome">
        <span className="role-login-icon"><Building2 size={34} /></span>
        <p className="eyebrow">Theatre official portal</p>
        <h1>Welcome, theatre team</h1>
        <p>Manage show authority, reconciliation, reports, and theatre synchronization from the central console.</p>
        <div className="role-login-features"><span><ShieldCheck /> Protected official access</span><span><ChartNoAxesCombined /> Live operational visibility</span></div>
      </div>
      <form action={loginAction} className="role-login-form">
        <div><p className="eyebrow">Role: Theatre official</p><h2>Sign in to operations</h2><p>Use the account assigned to your theatre or central team.</p></div>
        {error ? <div className="role-login-error">Invalid official username or password.</div> : null}
        <label>Username<input name="username" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="action-button primary" type="submit"><ShieldCheck size={18} /> Sign in as official</button>
        {process.env.NODE_ENV !== 'production' ? <small>Development account: superadmin / ChangeMe@123</small> : null}
      </form>
    </section>
  );
}
