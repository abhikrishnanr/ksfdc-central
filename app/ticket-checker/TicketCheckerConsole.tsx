'use client';

import { CalendarDays, Camera, Check, CircleAlert, ImageUp, LayoutGrid, LogOut, ScanLine, Sheet, StopCircle, TicketCheck, Volume2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BookingShowDetail } from '../../lib/central-data';
import TicketSeatLayoutModal from './TicketSeatLayoutModal';

type Theatre = { id: string; code: string; name: string; city: string };
type Show = { id: string; movieId: string; movieTitle: string; theatreId: string; theatreName: string; screenId: string; screenName: string; showTime: string; status: string };
type Ticket = { bookingId: string; showId: string; theatreId: string; theatreName: string; movieTitle: string; screenName: string; showTime: string; status: string; channel: string; totalAmount: number; groups: { zone: string; seats: string[] }[] };
type ValidationResult = { success: boolean; outcome: 'VALID' | 'ALREADY_ADMITTED' | 'INVALID'; reason?: string | null; message: string; ticket?: Ticket; attendanceMarked?: boolean; admittedAt?: string };
let statusAudioContext: AudioContext | null = null;

function localDateValue() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function formatShowTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

function prepareStatusAudio() {
  try {
    statusAudioContext ??= new AudioContext();
    if (statusAudioContext.state === 'suspended') void statusAudioContext.resume();
  } catch { /* Audio cues are optional on restricted browsers. */ }
}

function playStatusTone(outcome: ValidationResult['outcome']) {
  try {
    prepareStatusAudio();
    const context = statusAudioContext;
    if (!context) return;
    const frequencies = outcome === 'VALID' ? [523, 659, 784] : outcome === 'ALREADY_ADMITTED' ? [440, 440] : [330, 247];
    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.13;
      oscillator.type = outcome === 'VALID' ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.13, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.17);
    });
  } catch { /* Audio cues are optional on restricted browsers. */ }
}

function announce(result: ValidationResult) {
  playStatusTone(result.outcome);
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  let text = 'Invalid ticket.';
  if (result.outcome === 'VALID' && result.ticket) {
    const seats = result.ticket.groups.map((group) => `${group.zone}, seats ${group.seats.join(', ')}`).join('. ');
    text = `Ticket valid. ${seats}.`;
  } else if (result.outcome === 'ALREADY_ADMITTED' && result.ticket) {
    text = `Ticket already checked. ${result.ticket.groups.map((group) => `${group.zone}, seats ${group.seats.join(', ')}`).join('. ')}.`;
  } else if (result.reason === 'OTHER_SHOW' || result.reason === 'OTHER_THEATRE') text = result.message;
  const speech = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  speech.voice = voices.find((voice) => voice.lang.toLowerCase() === 'en-in')
    ?? voices.find((voice) => voice.lang.toLowerCase().endsWith('-in'))
    ?? voices.find((voice) => /india/i.test(`${voice.name} ${voice.voiceURI}`))
    ?? null;
  speech.lang = speech.voice?.lang ?? 'en-IN';
  speech.rate = 0.88;
  speech.pitch = 1;
  window.speechSynthesis.speak(speech);
}

export default function TicketCheckerConsole({ session, theatres }: { session: { displayName: string; username: string }; theatres: Theatre[] }) {
  const [theatreId, setTheatreId] = useState(theatres[0]?.id ?? '');
  const [date, setDate] = useState(localDateValue());
  const [shows, setShows] = useState<Show[]>([]);
  const [movieId, setMovieId] = useState('');
  const [showId, setShowId] = useState('');
  const [loadingShows, setLoadingShows] = useState(true);
  const [started, setStarted] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [imageScanning, setImageScanning] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [layout, setLayout] = useState<{ show: BookingShowDetail; ticketSeats: string[] } | null>(null);
  const scannerRef = useRef<{ start: (...args: unknown[]) => Promise<unknown>; stop: () => Promise<unknown>; clear: () => void; isScanning?: boolean } | null>(null);
  const cameraStartingRef = useRef(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);
  const selectedShow = shows.find((show) => show.id === showId) ?? null;
  const movies = useMemo(() => Array.from(new Map(shows.map((show) => [show.movieId, { id: show.movieId, title: show.movieTitle }])).values()), [shows]);
  const movieShows = shows.filter((show) => show.movieId === movieId);

  useEffect(() => {
    if (!theatreId || !date) return;
    const controller = new AbortController();
    fetch(`/api/ticket-checker/shows?theatreId=${encodeURIComponent(theatreId)}&date=${encodeURIComponent(date)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        const nextShows = payload.success ? payload.shows as Show[] : [];
        setShows(nextShows);
        setMovieId(nextShows[0]?.movieId ?? '');
        setShowId('');
      })
      .catch((error) => { if (error.name !== 'AbortError') setShows([]); })
      .finally(() => setLoadingShows(false));
    return () => controller.abort();
  }, [date, theatreId]);

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      if (scanner.isScanning) {
        try { await scanner.stop(); } catch { /* Camera may already be stopped. */ }
      }
      try { scanner.clear(); } catch { /* Reader may already be cleared. */ }
    }
    setCameraActive(false);
  }, []);

  const validateTicket = useCallback(async (rawValue: string) => {
    if (!theatreId || !showId || processingRef.current) return;
    prepareStatusAudio();
    processingRef.current = true;
    setValidating(true);
    setResult(null);
    await stopCamera();
    try {
      const response = await fetch('/api/ticket-checker/validate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rawValue, theatreId, showId })
      });
      const payload = await response.json() as ValidationResult;
      setResult(payload);
      announce(payload);
      setManualValue('');
    } catch {
      const failure: ValidationResult = { success: false, outcome: 'INVALID', reason: 'NETWORK_ERROR', message: 'Could not contact the validation service.' };
      setResult(failure);
      announce(failure);
    } finally {
      setValidating(false);
      processingRef.current = false;
    }
  }, [showId, stopCamera, theatreId]);

  const startCamera = useCallback(async () => {
    if (cameraStartingRef.current || cameraActive) return;
    prepareStatusAudio();
    cameraStartingRef.current = true;
    setCameraError('');
    setResult(null);
    await stopCamera();
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access requires HTTPS or localhost.');
      }
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('ticket-checker-camera');
      scannerRef.current = scanner as unknown as typeof scannerRef.current;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 12, qrbox: (width: number, height: number) => { const size = Math.floor(Math.min(width, height) * 0.72); return { width: size, height: size }; }, aspectRatio: 1 },
        (decodedText: string) => { void validateTicket(decodedText); },
        () => undefined
      );
      setCameraActive(true);
    } catch (error) {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner?.isScanning) {
        try { await scanner.stop(); } catch { /* Startup may have stopped already. */ }
      }
      try { scanner?.clear(); } catch { /* Reader may not have mounted. */ }
      setCameraActive(false);
      const message = error instanceof Error && error.message.includes('HTTPS')
        ? error.message
        : 'Camera could not start. Allow camera access in the browser, close other camera apps, and try again.';
      setCameraError(`${message} You can also enter the booking ID manually.`);
    } finally {
      cameraStartingRef.current = false;
    }
  }, [cameraActive, stopCamera, validateTicket]);

  useEffect(() => () => { void stopCamera(); }, [stopCamera]);

  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

  async function scanTicketImage(file: File | undefined) {
    if (!file || imageScanning || processingRef.current) return;
    prepareStatusAudio();
    await stopCamera();
    setCameraError('');
    setResult(null);
    setImageScanning(true);
    setImagePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    let scanner: { scanFile: (imageFile: File, showImage?: boolean) => Promise<string>; clear: () => void } | null = null;
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      scanner = new Html5Qrcode('ticket-checker-camera');
      const decodedText = await scanner.scanFile(file, true);
      await validateTicket(decodedText);
    } catch {
      setCameraError('No readable ticket QR was found in that image. Try a sharper image with the full QR visible.');
    } finally {
      try { scanner?.clear(); } catch { /* File scanner may already be clear. */ }
      setImageScanning(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }

  async function viewSeats() {
    if (!result?.ticket) return;
    const response = await fetch(`/api/ticket-checker/seat-layout?showId=${encodeURIComponent(result.ticket.showId)}&bookingId=${encodeURIComponent(result.ticket.bookingId)}`);
    const payload = await response.json();
    if (payload.success) setLayout({ show: payload.show, ticketSeats: payload.ticketSeats });
  }

  function resetChecking() {
    void stopCamera();
    setStarted(false);
    setResult(null);
    setManualValue('');
  }

  return (
    <section className="ticket-checker-page">
      <header className="checker-topbar">
        <div className="checker-title"><span><TicketCheck /></span><div><strong>Gate Ticket Checker</strong><small>{session.displayName}</small></div></div>
        <nav>
          <Link href="/ticket-checker/attendance"><Sheet size={18} /> Attendance</Link>
          <form action="/ticket-checker/logout" method="post"><button type="submit"><LogOut size={18} /> Logout</button></form>
        </nav>
      </header>

      {!started ? (
        <section className="checker-setup-panel">
          <div className="checker-setup-heading"><div className="checker-step-number">1</div><div><p className="eyebrow">Admission setup</p><h1>Select the show</h1><p>Ticket attendance will be recorded against this exact theatre and show.</p></div></div>
          <div className="checker-selector-grid">
            <label>Theatre<select value={theatreId} onChange={(event) => { setLoadingShows(true); setTheatreId(event.target.value); }}>{theatres.map((theatre) => <option value={theatre.id} key={theatre.id}>{theatre.name} · {theatre.city}</option>)}</select></label>
            <label>Show date<span className="checker-input-icon"><CalendarDays size={18} /><input type="date" value={date} onChange={(event) => { setLoadingShows(true); setDate(event.target.value); }} /></span></label>
            <label>Movie<select value={movieId} onChange={(event) => { setMovieId(event.target.value); setShowId(''); }} disabled={loadingShows || !movies.length}><option value="">{loadingShows ? 'Loading movies…' : 'Select movie'}</option>{movies.map((movie) => <option value={movie.id} key={movie.id}>{movie.title}</option>)}</select></label>
            <label>Show<select value={showId} onChange={(event) => setShowId(event.target.value)} disabled={!movieId}><option value="">Select show time</option>{movieShows.map((show) => <option value={show.id} key={show.id}>{formatShowTime(show.showTime)} · {show.screenName} · {show.status}</option>)}</select></label>
          </div>
          {!loadingShows && theatreId && !shows.length ? <div className="checker-inline-error">No shows found for this theatre and date.</div> : null}
          <button className="checker-start-button" type="button" disabled={!showId} onClick={() => setStarted(true)}><ScanLine size={24} /> Start ticket checking</button>
        </section>
      ) : (
        <section className="checker-live-workspace">
          <div className="checker-show-strip">
            <div><p className="eyebrow">Now checking</p><h1>{selectedShow?.movieTitle}</h1><p>{selectedShow?.theatreName} · {selectedShow?.screenName} · {selectedShow ? formatShowTime(selectedShow.showTime) : ''}</p></div>
            <button type="button" onClick={resetChecking}>Change show</button>
          </div>
          <div className="checker-live-grid">
            <section className="checker-scanner-panel">
              <div className="checker-panel-heading"><div><p className="eyebrow">Live scanner</p><h2>Scan ticket QR</h2></div><Volume2 size={21} aria-label="Audio announcements enabled" /></div>
              <div className={`checker-camera${cameraActive ? ' is-active' : ''}`}>
                <div id="ticket-checker-camera" className="checker-camera-reader" />
                {!cameraActive ? <div className="checker-camera-placeholder"><Camera size={54} /><strong>Camera ready</strong><span>Point the phone at the ticket QR</span></div> : null}
              </div>
              {cameraError ? <div className="checker-inline-error">{cameraError}</div> : null}
              <button className="checker-camera-button" type="button" onClick={cameraActive ? stopCamera : startCamera}>{cameraActive ? <><StopCircle /> Stop camera</> : <><Camera /> Open camera scanner</>}</button>
              <input ref={imageInputRef} className="checker-file-input" type="file" accept="image/*" onChange={(event) => void scanTicketImage(event.target.files?.[0])} />
              <button className="checker-image-button" type="button" disabled={imageScanning || validating} onClick={() => imageInputRef.current?.click()}><ImageUp /> {imageScanning ? 'Reading ticket image…' : 'Browse ticket image'}</button>
              {imagePreview ? <div className="checker-image-preview"><img src={imagePreview} alt="Selected ticket image" /><span>Selected ticket image</span></div> : null}
              <div className="checker-manual-entry"><span>or enter booking ID / QR text</span><div><input value={manualValue} onChange={(event) => setManualValue(event.target.value)} placeholder="BOOKING_… or LOCAL-…" onKeyDown={(event) => { if (event.key === 'Enter') void validateTicket(manualValue); }} /><button type="button" disabled={!manualValue.trim() || validating} onClick={() => void validateTicket(manualValue)}>Check</button></div></div>
            </section>
            <section className={`checker-result-panel${validating || result ? ' has-result' : ''}`} aria-live="assertive">
              {validating ? <div className="checker-result-empty is-loading"><ScanLine size={58} /><h2>Checking ticket…</h2><p>Confirming booking and attendance.</p></div> : result ? (
                <div className={`checker-result-card is-${result.outcome.toLowerCase()}`}>
                  <div className="checker-result-icon">{result.outcome === 'VALID' ? <Check /> : <CircleAlert />}</div>
                  <p className="eyebrow">{result.outcome === 'VALID' ? 'Admission approved' : result.outcome === 'ALREADY_ADMITTED' ? 'Duplicate scan' : 'Admission stopped'}</p>
                  <h2>{result.outcome === 'VALID' ? 'VALID TICKET' : result.outcome === 'ALREADY_ADMITTED' ? 'ALREADY CHECKED' : 'INVALID TICKET'}</h2>
                  <p className="checker-result-message">{result.message}</p>
                  {result.ticket ? <>
                    <div className="checker-ticket-context"><strong>{result.ticket.movieTitle}</strong><span>{result.ticket.theatreName}</span><span>{result.ticket.screenName} · {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(result.ticket.showTime))}</span><small>{result.ticket.bookingId}</small></div>
                    <div className="checker-seat-callout">{result.ticket.groups.map((group) => <div key={group.zone}><span>{group.zone}</span><strong>{group.seats.join(', ')}</strong></div>)}</div>
                    <button className="checker-layout-button" type="button" onClick={viewSeats}><LayoutGrid size={20} /> View seats in layout</button>
                  </> : null}
                  <button className="checker-next-button" type="button" onClick={() => { setResult(null); void startCamera(); }}><ScanLine size={19} /> Scan next ticket</button>
                </div>
              ) : <div className="checker-result-empty"><TicketCheck size={68} /><h2>Waiting for a ticket</h2><p>The validation result, zone, and seat numbers will appear here.</p></div>}
            </section>
          </div>
        </section>
      )}
      {layout ? <TicketSeatLayoutModal show={layout.show} ticketSeats={layout.ticketSeats} onClose={() => setLayout(null)} /> : null}
    </section>
  );
}
