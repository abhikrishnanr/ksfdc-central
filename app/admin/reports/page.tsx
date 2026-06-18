export const dynamic = 'force-dynamic';

import { PageHeader, PremiumCard, StatCard, StatusBadge } from '../../../components/premium-ui';
import { requireCentralRole } from '../../../lib/auth';
import { getCentralRevenueReport } from '../../../lib/reports';

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
}

export default async function ReportsPage() {
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN', 'FINANCE_VIEWER']);
  const report = await getCentralRevenueReport(session.theatreId);

  return (
    <main className="grid" style={{ gap: 24 }}>
      <PageHeader eyebrow="Finance reports" title="Collections and payment health" description="Channel revenue, show performance, payment modes, and Razorpay exceptions." />

      <section className="grid auto">
        {Object.entries(report.byChannel).map(([channel, row]) => (
          <StatCard key={channel} label={channel} value={money(row.revenue)} detail={`${row.bookings} bookings`} tone="good" />
        ))}
      </section>

      <section className="grid two">
        <PremiumCard>
          <p className="eyebrow">Show-wise revenue</p>
          <h2>Performance</h2>
          <div className="grid">
            {report.showWise.map((row) => (
              <div className="metric-tile" key={row.showId}>
                <strong>{row.movieTitle}</strong>
                <span>{row.showId} - {row.bookings} bookings - {money(row.revenue)}</span>
              </div>
            ))}
          </div>
        </PremiumCard>
        <PremiumCard>
          <p className="eyebrow">Payment modes</p>
          <h2>Settlement view</h2>
          <div className="grid">
            {report.byPaymentMode.length ? report.byPaymentMode.map((row) => (
              <div className="metric-tile" key={`${row.channel}-${row.paymentMode}-${row.provider}-${row.status}`}>
                <div className="meta-row">
                  <strong>{money(row.amount)}</strong>
                  <StatusBadge tone={row.status === 'CAPTURED' || row.status === 'COLLECTED' ? 'good' : 'warn'}>{row.status}</StatusBadge>
                </div>
                <span>{row.channel} / {row.paymentMode} / {row.provider} - {row.payments} payments</span>
              </div>
            )) : <p>No payments recorded today.</p>}
          </div>
        </PremiumCard>
      </section>

      <PremiumCard>
        <p className="eyebrow">Razorpay exceptions</p>
        <h2>Pending or failed</h2>
        {report.pendingOrFailedRazorpay.length ? report.pendingOrFailedRazorpay.map((row) => (
          <p key={`${row.paymentMode}-${row.status}`}>{row.paymentMode} / {row.status}: {row.payments} payments, {money(row.amount)}</p>
        )) : <p>No pending or failed Razorpay payments today.</p>}
      </PremiumCard>
    </main>
  );
}
