export const dynamic = 'force-dynamic';

import { ActionButton, MetricTile, PageHeader, PremiumCard } from '../../components/premium-ui';
import { getPublicSession } from '../../lib/public-auth';
import PublicEmailLoginPanel from './PublicEmailLoginPanel';

export default async function ProfilePage() {
  const session = await getPublicSession();

  return (
    <main className="grid" style={{ gap: 24 }}>
      <PageHeader
        eyebrow="My account"
        title="Profile"
        description="Use email verification to view upcoming bookings and confirmed tickets."
      />
      {session ? (
        <PremiumCard>
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
        </PremiumCard>
      ) : <PublicEmailLoginPanel />}
    </main>
  );
}
