export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getMovies, getPublicShowtimes, getTheatres } from '../lib/central-data';
import HeroCarousel from '../components/template/HeroCarousel';
import QuickBookCard from '../components/template/QuickBookCard';
import NowShowingRail from '../components/template/NowShowingRail';
import TheatreNetworkCard from '../components/template/TheatreNetworkCard';
import NoticesCard from '../components/template/NoticesCard';

export default async function HomePage({ searchParams }: { searchParams?: Promise<{ city?: string }> }) {
  const params = await searchParams;
  const city = params?.city;
  const { data: movies } = await getMovies();
  const { data: shows } = await getPublicShowtimes({ city });
  const { data: theatres } = await getTheatres();
  const featured = movies[0] ?? null;
  const featuredShow = featured ? shows.find((show) => show.movieId === featured.id) : null;

  return (
    <section className="ksfdc-home-grid">
      <div className="home-main-column">
        <HeroCarousel movie={featured} show={featuredShow} />
        <section className="feature-strip">
          <div><span>OK</span><strong>Official Portal</strong><small>Trusted & Secure</small></div>
          <div><span>IN</span><strong>Wide Network</strong><small>Theatres across Kerala</small></div>
          <div><span>5*</span><strong>Best Experience</strong><small>Easy Booking</small></div>
          <div><span>24</span><strong>Support</strong><small>Help & Assistance</small></div>
        </section>
        <NowShowingRail movies={movies.slice(0, 8)} />
        <section className="supporting-cinema-banner">
          <div className="film-reel-mark" aria-hidden="true" />
          <div>
            <h2>Supporting Cinema. <span>Celebrating Talent.</span></h2>
            <p>KSFDC is committed to the growth and promotion of quality cinema in Kerala.</p>
          </div>
          <Link className="outline-gold-button" href="/about">Know more about KSFDC</Link>
        </section>
      </div>
      <aside className="home-sidebar">
        <QuickBookCard
          movies={movies.map((movie) => ({ id: movie.id, title: movie.title }))}
          theatres={theatres.map((theatre) => ({ id: theatre.id, name: theatre.name, city: theatre.city }))}
        />
        <TheatreNetworkCard />
        <NoticesCard />
      </aside>
    </section>
  );
}
