'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight, Ticket } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CentralMovieSummary } from '../../lib/central-data';

type HeroSlide = { movie: CentralMovieSummary; show?: { showId: string } | null };

export default function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  useEffect(() => {
    if (paused || count < 2) return;
    const timer = window.setInterval(() => setActive((index) => (index + 1) % count), 6500);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  if (!count) return null;
  const { movie, show } = slides[active];
  const bookingHref = show ? `/book/${show.showId}` : `/movies/${movie.id}/book`;
  const previous = () => setActive((index) => (index - 1 + count) % count);
  const next = () => setActive((index) => (index + 1) % count);

  return (
    <section
      className="ksfdc-hero-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured movies"
    >
      {movie.posterUrl ? (
        <Image
          className="hero-background-image"
          src={movie.posterUrl}
          alt=""
          fill
          priority
          sizes="(max-width: 820px) 100vw, calc(100vw - 420px)"
        />
      ) : null}
      <div className="hero-background-overlay" aria-hidden="true" />
      <Link className="hero-poster-link" href={`/movies/${movie.id}`} aria-label={`View ${movie.title} details`} />
      {count > 1 ? <button className="hero-arrow left" type="button" aria-label="Previous featured movie" onClick={previous}><ChevronLeft /></button> : null}
      <div className="hero-movie-copy">
        <p>In cinemas now</p>
        <h1>{movie.title}</h1>
        <span>{[movie.language, movie.certificate, movie.durationMinutes ? `${movie.durationMinutes} min` : null].filter(Boolean).join(' - ')}</span>
        <div className="hero-actions">
          <Link className="gold-button" href={bookingHref}><Ticket size={19} /> Book tickets <ArrowRight size={18} /></Link>
          <Link className="hero-details-link" href={`/movies/${movie.id}`}>Movie details</Link>
        </div>
      </div>
      {count > 1 ? <button className="hero-arrow right" type="button" aria-label="Next featured movie" onClick={next}><ChevronRight /></button> : null}
      {count > 1 ? <div className="hero-dots" aria-label="Featured movie slides">
        {slides.map((slide, index) => <button className={index === active ? 'active' : ''} type="button" key={slide.movie.id} onClick={() => setActive(index)} aria-label={`Show ${slide.movie.title}`} aria-current={index === active ? 'true' : undefined} />)}
      </div> : null}
    </section>
  );
}
