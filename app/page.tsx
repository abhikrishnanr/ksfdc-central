export const revalidate = 30;

import Link from 'next/link';
import { getHomeShowLinks, getMovies, getTheatres } from '../lib/central-data';
import HeroCarousel from '../components/template/HeroCarousel';
import QuickBookCard from '../components/template/QuickBookCard';
import NowShowingRail from '../components/template/NowShowingRail';
import TheatreNetworkCard from '../components/template/TheatreNetworkCard';
import NoticesCard from '../components/template/NoticesCard';
import { BadgeCheck, Headphones, MapPinned, Sparkles } from 'lucide-react';

export default async function HomePage({ searchParams }: { searchParams?: Promise<{ city?: string }> }) {
  const params = await searchParams;
  const city = params?.city && params.city !== 'Kerala' ? params.city : undefined;
  const [{ data: movies }, { data: showLinks }, { data: theatres }] = await Promise.all([
    getMovies(),
    getHomeShowLinks(city),
    getTheatres()
  ]);
  const featuredSlides = movies.slice(0, 5).map((movie) => ({
    movie,
    show: showLinks.find((show) => show.movieId === movie.id) ?? null
  }));

  return (
    <section className="ksfdc-home-grid">
      <div className="home-main-column">
        <HeroCarousel slides={featuredSlides} />
        <section className="feature-strip">
          <div><span><BadgeCheck /></span><strong>Official Portal</strong><small>Verified and secure</small></div>
          <div><span><MapPinned /></span><strong>Across Kerala</strong><small>Connected theatres</small></div>
          <div><span><Sparkles /></span><strong>Easy Booking</strong><small>Seats in a few taps</small></div>
          <div><span><Headphones /></span><strong>Guest Support</strong><small>Help when needed</small></div>
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
