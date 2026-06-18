'use client';

import { Building2, CalendarDays, Clapperboard, MapPin, Search, Ticket } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export type QuickBookMovie = { id: string; title: string };
export type QuickBookTheatre = { id: string; name: string; city: string };

function todayInput(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export default function QuickBookCard({ movies, theatres }: { movies: QuickBookMovie[]; theatres: QuickBookTheatre[] }) {
  const router = useRouter();
  const [city, setCity] = useState('');
  const [theatreId, setTheatreId] = useState('');
  const [movieId, setMovieId] = useState('');
  const [date, setDate] = useState(todayInput(0));
  const cities = useMemo(() => Array.from(new Set(theatres.map((theatre) => theatre.city))).sort(), [theatres]);
  const filteredTheatres = city ? theatres.filter((theatre) => theatre.city === city) : theatres;

  function findShows() {
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    if (theatreId) params.set('theatre', theatreId);
    if (movieId) params.set('movie', movieId);
    const diffDays = Math.max(0, Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000));
    if (diffDays > 0) params.set('day', String(Math.min(diffDays, 2)));
    router.push(`/shows${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <section className="quick-book-card">
      <h2><span><Ticket size={20} /></span> Quick Book</h2>
      <label><span><MapPin size={19} /></span><select value={city} onChange={(event) => { setCity(event.target.value); setTheatreId(''); }} aria-label="Select city"><option value="">Select City / Location</option>{cities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label><span><Building2 size={19} /></span><select value={theatreId} onChange={(event) => setTheatreId(event.target.value)} aria-label="Select theatre"><option value="">Select Theatre</option>{filteredTheatres.map((theatre) => <option key={theatre.id} value={theatre.id}>{theatre.name}</option>)}</select></label>
      <label><span><Clapperboard size={19} /></span><select value={movieId} onChange={(event) => setMovieId(event.target.value)} aria-label="Select movie"><option value="">Select Movie</option>{movies.map((movie) => <option key={movie.id} value={movie.id}>{movie.title}</option>)}</select></label>
      <label><span><CalendarDays size={19} /></span><input aria-label="Select show date" type="date" value={date} min={todayInput(0)} max={todayInput(2)} onChange={(event) => setDate(event.target.value)} /></label>
      <button className="gold-button wide" type="button" onClick={findShows}><Search size={18} /> Find Shows</button>
    </section>
  );
}
