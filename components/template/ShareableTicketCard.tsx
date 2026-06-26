'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LayoutGrid, ScanLine, X } from 'lucide-react';
import type { BookingShowDetail } from '../../lib/central-data';
import { formatShowDateTimeWithDaypart } from '../../lib/show-time';
import TicketSeatLayoutModal from './TicketSeatLayoutModal';

export type ShareableTicketSeatGroup = {
  zone: string;
  seats: string[];
  amount: number;
};

export type ShareableTicket = {
  bookingId: string;
  ticketNumber: string;
  showId: string;
  theatreId: string;
  theatreName: string;
  screenName: string;
  movieTitle: string;
  movieId: string;
  moviePosterUrl: string | null;
  showTime: string;
  issuedAt: string;
  status: string;
  totalAmount: number;
  paymentMode: string | null;
  counterCode: string | null;
  verificationUrl: string;
  verificationToken: string;
  groups: ShareableTicketSeatGroup[];
};

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

function statusLabel(value: string) {
  return value === 'CONFIRMED' ? 'Confirmed' : value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const renderedWidth = image.naturalWidth * scale;
  const renderedHeight = image.naturalHeight * scale;
  ctx.drawImage(image, x - (renderedWidth - width) / 2, y - (renderedHeight - height) / 2, renderedWidth, renderedHeight);
}

export default function ShareableTicketCard({ ticket, seatLayout }: { ticket: ShareableTicket; seatLayout?: BookingShowDetail | null }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showSeatLayout, setShowSeatLayout] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const qrPayload = useMemo(() => JSON.stringify({
    bookingId: ticket.bookingId,
    ticketNumber: ticket.ticketNumber,
    showId: ticket.showId,
    theatreId: ticket.theatreId,
    verificationUrl: ticket.verificationUrl,
    verificationToken: ticket.verificationToken
  }), [ticket]);
  const ticketSeats = useMemo(() => Array.from(new Set(ticket.groups.flatMap((group) => group.seats))), [ticket.groups]);
  const seatCount = ticketSeats.length;

  useEffect(() => {
    QRCode.toDataURL(qrPayload, { margin: 1, width: 800, errorCorrectionLevel: 'M' }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
  }, [qrPayload]);

  useEffect(() => {
    if (!showQr) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setShowQr(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', close);
    };
  }, [showQr]);

  async function downloadTicket() {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1500;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#07090d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const poster = ticket.moviePosterUrl
      ? await loadImage(`/api/public/movies/${encodeURIComponent(ticket.movieId)}/poster`)
      : null;
    if (poster) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(28, 28, canvas.width - 56, 530, 18);
      ctx.clip();
      drawCover(ctx, poster, 28, 28, canvas.width - 56, 530);
      const posterShade = ctx.createLinearGradient(0, 100, 0, 558);
      posterShade.addColorStop(0, 'rgba(7,9,13,0.08)');
      posterShade.addColorStop(1, 'rgba(7,9,13,0.96)');
      ctx.fillStyle = posterShade;
      ctx.fillRect(28, 28, canvas.width - 56, 530);
      ctx.restore();
    }
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, poster ? 'rgba(17,24,39,0)' : '#111827');
    gradient.addColorStop(0.55, '#07111f');
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(28, poster ? 470 : 28, canvas.width - 56, poster ? canvas.height - 498 : canvas.height - 56);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 42px Arial';
    ctx.fillText(ticket.movieTitle, 48, poster ? 420 : 88, 780);
    ctx.font = '400 26px Arial';
    ctx.fillText(`${ticket.theatreName} - ${ticket.screenName}`, 48, poster ? 462 : 132, 780);
    ctx.fillText(formatShowDateTimeWithDaypart(ticket.showTime), 48, poster ? 500 : 170, 780);
    ctx.fillStyle = '#34d399';
    ctx.font = '700 34px Arial';
    ctx.fillText(statusLabel(ticket.status), 48, poster ? 565 : 230);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 28px Arial';
    ctx.fillText(`Ticket ${ticket.ticketNumber}`, 48, poster ? 625 : 290, 780);
    ctx.font = '400 24px Arial';
    ctx.fillText(`Booking ${ticket.bookingId}`, 48, poster ? 665 : 330, 780);
    let y = poster ? 735 : 400;
    for (const group of ticket.groups) {
      ctx.font = '700 28px Arial';
      ctx.fillText(group.zone, 48, y);
      ctx.font = '400 24px Arial';
      ctx.fillText(group.seats.join(', '), 48, y + 36, 780);
      y += 90;
    }
    ctx.font = '700 32px Arial';
    ctx.fillText(money(ticket.totalAmount), 48, 1110);
    if (qrDataUrl) {
      const qrImage = new Image();
      qrImage.src = qrDataUrl;
      await new Promise((resolve) => { qrImage.onload = resolve; qrImage.onerror = resolve; });
      ctx.drawImage(qrImage, 590, 1040, 240, 240);
    }
    const link = document.createElement('a');
    link.download = `${ticket.ticketNumber}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  async function shareTicket() {
    if (!navigator.share) {
      await downloadTicket();
      return;
    }
    await navigator.share({
      title: ticket.ticketNumber,
      text: `${ticket.movieTitle} - ${ticket.theatreName} - ${formatShowDateTimeWithDaypart(ticket.showTime)}`,
      url: ticket.verificationUrl
    }).catch(() => undefined);
  }

  return (
    <section className="share-ticket-wrap">
      <div className="share-ticket-card" ref={cardRef}>
        <div
          className="share-ticket-poster"
          style={ticket.moviePosterUrl ? { backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0), rgba(15,23,42,0.68)), url("${ticket.moviePosterUrl}")` } : undefined}
        >
          <div>
            <p>Admit {seatCount}</p>
            <h1>{ticket.movieTitle}</h1>
          </div>
        </div>
        <div className="share-ticket-body">
          <div className="ticket-id-row">
            <div>
              <span>Ticket number</span>
              <strong>{ticket.ticketNumber}</strong>
            </div>
            <strong className="ticket-status">{statusLabel(ticket.status)}</strong>
          </div>
          <div className="ticket-detail-grid">
            <span>Theatre</span><strong>{ticket.theatreName}</strong>
            <span>Screen</span><strong>{ticket.screenName}</strong>
            <span>Show time</span><strong>{formatShowDateTimeWithDaypart(ticket.showTime)}</strong>
            <span>Payment</span><strong>{ticket.paymentMode ?? 'Recorded'}</strong>
            {ticket.counterCode ? <><span>Counter</span><strong>{ticket.counterCode}</strong></> : null}
          </div>
          <div className="mini-seat-map">
            {ticket.groups.map((group) => (
              <div key={group.zone}>
                <strong>{group.zone}</strong>
                <span>{group.seats.join(', ')}</span>
              </div>
            ))}
          </div>
          <div className="ticket-qr-row">
            {qrDataUrl ? <button className="ticket-qr-button" type="button" onClick={() => setShowQr(true)} aria-label="Open ticket QR code full screen"><img src={qrDataUrl} alt="Ticket verification QR code" /><span><ScanLine size={16} /> Enlarge to scan</span></button> : <span className="qr-placeholder">QR</span>}
            <div>
              <span>Booking ID</span>
              <strong>{ticket.bookingId}</strong>
              <span>{money(ticket.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>
      <article className="central-thermal-ticket" aria-label={`Printable ticket ${ticket.ticketNumber}`}>
        <header className="thermal-ticket-heading">
          <p>KSFDC TICKETS</p>
          <h1>{ticket.theatreName}</h1>
        </header>
        <section className="thermal-admit-box">
          <span>ADMIT</span><strong>{seatCount}</strong><small>{seatCount === 1 ? 'GUEST' : 'GUESTS'}</small>
        </section>
        <section className="thermal-show-block">
          <p>NOW SHOWING</p><h2>{ticket.movieTitle}</h2>
          <div className="thermal-detail-grid">
            <span><small>SCREEN</small><strong>{ticket.screenName}</strong></span>
            <span><small>SHOW TIME</small><strong>{formatShowDateTimeWithDaypart(ticket.showTime)}</strong></span>
          </div>
        </section>
        <section className="thermal-seat-list">
          {ticket.groups.map((group) => <div className="thermal-seat-box" key={group.zone}>
            <span>ZONE</span><strong>{group.zone}</strong>
            <small>SEAT {group.seats.length === 1 ? 'NUMBER' : 'NUMBERS'}</small><b>{group.seats.join(', ')}</b>
          </div>)}
        </section>
        <section className="thermal-payment-row">
          <span><small>TOTAL</small><strong>{money(ticket.totalAmount)}</strong></span>
          <span><small>PAYMENT</small><strong>{ticket.paymentMode?.replaceAll('_', ' ') ?? 'RECORDED'}</strong></span>
        </section>
        <section className="thermal-qr-block">
          {qrDataUrl ? <img src={qrDataUrl} alt="Ticket verification QR code" /> : null}
          <small>SCAN TO VERIFY</small><strong>{ticket.bookingId}</strong>
        </section>
        <footer className="thermal-ticket-footer">
          <p>{ticket.counterCode ? `Counter ${ticket.counterCode} - ` : ''}Ticket {ticket.ticketNumber}</p>
          <p>Issued {formatDateTime(ticket.issuedAt)}</p><strong>THANK YOU. ENJOY THE SHOW!</strong>
        </footer>
      </article>
      <div className="ticket-actions no-print">
        <button type="button" className="action-button primary" onClick={downloadTicket}>Download ticket</button>
        <button type="button" className="action-button" onClick={shareTicket}>Share ticket</button>
        {seatLayout ? <button type="button" className="action-button" onClick={() => setShowSeatLayout(true)}><LayoutGrid size={18} /> View seats</button> : null}
        <button type="button" className="action-button" onClick={() => window.print()}>Print</button>
      </div>
      {showSeatLayout && seatLayout ? <TicketSeatLayoutModal show={seatLayout} ticketSeats={ticketSeats} onClose={() => setShowSeatLayout(false)} /> : null}
      {showQr && qrDataUrl ? (
        <div className="ticket-qr-modal" role="dialog" aria-modal="true" aria-label="Ticket QR code" onMouseDown={(event) => event.target === event.currentTarget && setShowQr(false)}>
          <div className="ticket-qr-modal-card">
            <button className="ticket-qr-close" type="button" onClick={() => setShowQr(false)} aria-label="Close QR code"><X /></button>
            <div className="ticket-qr-modal-heading"><ScanLine /><span>Present for ticket checking</span></div>
            <img src={qrDataUrl} alt="Full-screen ticket verification QR code" />
            <h2>{ticket.movieTitle}</h2>
            <p>{ticket.ticketNumber}</p>
            <strong>{ticket.groups.map((group) => `${group.zone}: ${group.seats.join(', ')}`).join(' | ')}</strong>
          </div>
        </div>
      ) : null}
    </section>
  );
}
