'use client';

import { ArrowLeft, CalendarDays, Download, RefreshCw, TicketCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Theatre = { id: string; code: string; name: string; city: string };
type Show = { id: string; movieId: string; movieTitle: string; theatreId: string; theatreName: string; screenName: string; showTime: string; status: string };
type Entry = { bookingId: string; admittedAt: string; source: string; checkerName: string; channel: string; totalAmount: number; seats: { zone: string; seatId: string }[] };
type SheetData = { show: null | { id: string; theatreName: string; movieTitle: string; screenName: string; showTime: string }; admittedTickets: number; admittedSeats: number; entries: Entry[] };

function localDateValue() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }

export default function AttendanceSheet({ theatres }: { theatres: Theatre[] }) {
  const [theatreId, setTheatreId] = useState(theatres[0]?.id ?? '');
  const [date, setDate] = useState(localDateValue());
  const [shows, setShows] = useState<Show[]>([]);
  const [showId, setShowId] = useState('');
  const [data, setData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const selectedShow = useMemo(() => shows.find((show) => show.id === showId), [showId, shows]);

  useEffect(() => {
    if (!theatreId || !date) return;
    fetch(`/api/ticket-checker/shows?theatreId=${encodeURIComponent(theatreId)}&date=${encodeURIComponent(date)}`)
      .then((response) => response.json()).then((payload) => { setShows(payload.success ? payload.shows : []); setShowId(''); setData(null); });
  }, [date, theatreId]);

  async function loadSheet() {
    if (!showId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/ticket-checker/attendance?showId=${encodeURIComponent(showId)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (payload.success) setData(payload);
    } finally { setLoading(false); }
  }

  function downloadCsv() {
    if (!data) return;
    const rows = [['Booking ID', 'Admitted at', 'Channel', 'Checker', 'Zone and seats'], ...data.entries.map((entry) => [entry.bookingId, new Date(entry.admittedAt).toLocaleString('en-IN'), entry.channel, entry.checkerName, entry.seats.map((seat) => `${seat.zone}:${seat.seatId}`).join(' | ')])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `attendance-${showId}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  return (
    <section className="ticket-checker-page attendance-page">
      <header className="checker-topbar"><div className="checker-title"><span><TicketCheck /></span><div><strong>Ticket Attendance</strong><small>Live admission sheet</small></div></div><nav><Link href="/ticket-checker"><ArrowLeft size={18} /> Scanner</Link></nav></header>
      <section className="attendance-controls">
        <div><p className="eyebrow">Attendance register</p><h1>Show attendance</h1></div>
        <div className="checker-selector-grid">
          <label>Theatre<select value={theatreId} onChange={(event) => setTheatreId(event.target.value)}>{theatres.map((theatre) => <option value={theatre.id} key={theatre.id}>{theatre.name}</option>)}</select></label>
          <label>Date<span className="checker-input-icon"><CalendarDays size={18} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></span></label>
          <label>Show<select value={showId} onChange={(event) => { setShowId(event.target.value); setData(null); }}><option value="">Select show</option>{shows.map((show) => <option value={show.id} key={show.id}>{show.movieTitle} · {new Date(show.showTime).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</option>)}</select></label>
          <button className="checker-primary-button" type="button" disabled={!showId || loading} onClick={loadSheet}><RefreshCw size={18} /> {loading ? 'Loading…' : 'View attendance'}</button>
        </div>
      </section>
      {data ? <>
        <section className="attendance-summary"><div><span>Show</span><strong>{selectedShow?.movieTitle}</strong></div><div><span>Admitted tickets</span><strong>{data.admittedTickets}</strong></div><div><span>Admitted seats</span><strong>{data.admittedSeats}</strong></div><button type="button" onClick={downloadCsv}><Download size={18} /> Export CSV</button></section>
        <div className="attendance-table-wrap"><table className="attendance-table"><thead><tr><th>Admission time</th><th>Booking</th><th>Zone and seats</th><th>Channel</th><th>Checked by</th></tr></thead><tbody>{data.entries.length ? data.entries.map((entry) => <tr key={entry.bookingId}><td>{new Date(entry.admittedAt).toLocaleString('en-IN')}</td><td><strong>{entry.bookingId}</strong></td><td>{Array.from(new Map(entry.seats.map((seat) => [seat.zone, entry.seats.filter((item) => item.zone === seat.zone).map((item) => item.seatId)])).entries()).map(([zone, seats]) => <span className="attendance-seat-group" key={zone}><b>{zone}</b> {seats.join(', ')}</span>)}</td><td>{entry.channel}</td><td>{entry.checkerName}</td></tr>) : <tr><td colSpan={5} className="attendance-empty">No tickets admitted for this show yet.</td></tr>}</tbody></table></div>
      </> : <div className="checker-result-empty attendance-empty-state"><TicketCheck size={54} /><h2>Select a show</h2><p>Attendance appears here as tickets are validated.</p></div>}
    </section>
  );
}

