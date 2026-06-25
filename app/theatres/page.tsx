// This page only reads the theatre directory (name, city, screen count),
// which is now cached in lib/central-data.ts. Live seat/show data lives on
// /theatres/[theatreId] and /book/[showId], which remain fully dynamic.
export const revalidate = 30;
import { EmptyState, PageHeader } from '../../components/premium-ui';
import { getTheatres } from '../../lib/central-data';
import TheatreCard from '../../components/template/TheatreCard';

export default async function TheatresPage({ searchParams }: { searchParams?: Promise<{ city?: string }> }) {
  const params = await searchParams;
  const { dbStatus, data: theatres } = await getTheatres();
  const filteredTheatres = params?.city ? theatres.filter((theatre) => theatre.city === params.city) : theatres;

  return (
    <section className="grid" style={{ gap: 24 }}>
      <PageHeader
        eyebrow="Partner theatres"
        title={params?.city ? `Theatres in ${params.city}` : 'Theatres'}
        description={dbStatus.ok ? 'Find shows by theatre, city, and screen.' : 'Theatre listings are temporarily unavailable.'}
      />
      {!filteredTheatres.length ? <EmptyState title="No theatres found"><p>Try another city or check again shortly.</p></EmptyState> : null}
      <div className="grid three">
        {filteredTheatres.map((theatre) => <TheatreCard theatre={theatre} key={theatre.id} />)}
      </div>
    </section>
  );
}
