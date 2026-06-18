export const dynamic = 'force-dynamic';

import { ActionButton, MetricTile, PageHeader, PremiumCard } from '../../components/premium-ui';
import { getPublicSession } from '../../lib/public-auth';
import PublicEmailLoginPanel from './PublicEmailLoginPanel';
import { MailCheck, TicketCheck, UserRound } from 'lucide-react';

export default async function ProfilePage() {
  const session = await getPublicSession();

  return (
    <main className="grid" style={{ gap: 24 }}>
      {session ? (
        <><PageHeader eyebrow="My account" title="Profile" description="Your verified account, bookings, and confirmed tickets." /><PremiumCard>
          <p className="eyebrow">Signed in</p>
          <h2>{session.email}</h2>
          <div className="metric-strip" style={{ marginTop: 16 }}>
            <MetricTile label="Account type" value="Email verified" />
            <MetricTile label="Ticket access" value="Enabled" />
          </div>
          <div className="meta-row" style={{ marginTop: 16 }}>
            <ActionButton href="/profile/tickets" variant="primary">View my tickets</ActionButton>
            <ActionButton href="/shows">Book another show</ActionButton>
          </div>
        </PremiumCard></>
      ) : <section className="role-login-page patron-role-login">
        <div className="role-login-welcome">
          <span className="role-login-icon"><UserRound size={34} /></span>
          <p className="eyebrow">Cinema patron</p>
          <h1>Welcome back to the movies</h1>
          <p>Sign in without a password to access your bookings, downloadable tickets, and seat details.</p>
          <div className="role-login-features"><span><MailCheck /> Secure email verification</span><span><TicketCheck /> Your tickets in one place</span></div>
        </div>
        <PublicEmailLoginPanel />
      </section>}
    </main>
  );
}
