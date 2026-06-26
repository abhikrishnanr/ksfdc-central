import { PageHeader, PremiumCard } from '../../../components/premium-ui';

export default function TheatreManagementLoading() {
  return (
    <section className="grid" style={{ gap: 22 }} aria-busy="true">
      <PageHeader eyebrow="Theatre operations" title="Loading theatre management" description="Preparing theatres, screens, and show schedules." />
      <section className="grid auto">
        {Array.from({ length: 4 }, (_, index) => <PremiumCard key={index}><div className="skeleton-block tall" /></PremiumCard>)}
      </section>
      <PremiumCard><div className="skeleton-block list" /></PremiumCard>
    </section>
  );
}
