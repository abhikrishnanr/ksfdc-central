import { PageHeader, PremiumCard } from '../../../components/premium-ui';

export default function MovieManagementLoading() {
  return (
    <section className="grid" style={{ gap: 22 }} aria-busy="true">
      <PageHeader eyebrow="Movie catalogue" title="Loading movies" description="Preparing the movie list and poster controls." />
      <section className="grid auto">
        {Array.from({ length: 3 }, (_, index) => <PremiumCard key={index}><div className="skeleton-block tall" /></PremiumCard>)}
      </section>
      <section className="grid two">
        {Array.from({ length: 4 }, (_, index) => <PremiumCard key={index}><div className="skeleton-block card" /></PremiumCard>)}
      </section>
    </section>
  );
}
