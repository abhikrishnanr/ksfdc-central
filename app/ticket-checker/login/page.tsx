import { ScanLine, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { loginTicketChecker } from '../../../lib/ticket-checker-auth';

async function loginAction(formData: FormData) {
  'use server';
  const result = await loginTicketChecker(String(formData.get('username') ?? ''), String(formData.get('password') ?? ''));
  if (result.ok) redirect('/ticket-checker');
  redirect('/ticket-checker/login?error=1');
}

export default async function TicketCheckerLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; loggedOut?: string }> }) {
  const params = await searchParams;
  return (
    <section className="checker-login-page">
      <div className="checker-login-intro">
        <span className="checker-brand-icon"><ScanLine size={34} /></span>
        <p className="eyebrow">Gate operations</p>
        <h1>Ticket validation</h1>
        <p>Scan tickets, confirm the correct show, and maintain live attendance.</p>
        <div className="checker-security-note"><ShieldCheck size={18} /> Checker-only secure access</div>
      </div>
      <form action={loginAction} className="checker-login-form">
        <div><p className="eyebrow">Role: Ticket checker</p><h2>Welcome to the gate</h2><p>Sign in to begin admission for the selected theatre and show.</p></div>
        {params.error ? <div className="checker-inline-error">Invalid checker username or password.</div> : null}
        {params.loggedOut ? <div className="checker-inline-success">Signed out successfully.</div> : null}
        <label>Username<input name="username" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="checker-primary-button" type="submit"><ScanLine size={19} /> Sign in</button>
        {process.env.NODE_ENV !== 'production' ? <small>Development account: ticketchecker / ChangeMe@123</small> : null}
      </form>
    </section>
  );
}
