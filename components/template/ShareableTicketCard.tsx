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
    QRCode.toDataURL(qrPayload, { margin: 1, width: 520, errorCorrectionLevel: 'M' }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
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
    canvas.width = 720;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const roundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
      ctx.fill();
    };

    const seatsLine = ticket.groups.map((group) => `${group.zone}: ${group.seats.join(', ')}`).join('  |  ');
    const posterHeight = 380;
    const margin = 28;

    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    bg.addColorStop(0, '#071d1a');
    bg.addColorStop(0.48, '#0a101a');
    bg.addColorStop(1, '#111827');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const poster = ticket.moviePosterUrl
      ? await loadImage(`/api/public/movies/${encodeURIComponent(ticket.movieId)}/poster`)
      : null;
    if (poster) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(margin, margin, canvas.width - margin * 2, posterHeight, 24);
      ctx.clip();
      drawCover(ctx, poster, margin, margin, canvas.width - margin * 2, posterHeight);
      const posterShade = ctx.createLinearGradient(0, 100, 0, 558);
      posterShade.addColorStop(0, 'rgba(7,9,13,0.06)');
      posterShade.addColorStop(0.48, 'rgba(7,9,13,0.36)');
      posterShade.addColorStop(1, 'rgba(7,9,13,0.98)');
      ctx.fillStyle = posterShade;
      ctx.fillRect(margin, margin, canvas.width - margin * 2, posterHeight);
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(5, 9, 14, 0.92)';
    roundedRect(margin, 328, canvas.width - margin * 2, 724, 24);
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(margin + 1, 329, canvas.width - margin * 2 - 2, 722);

    ctx.fillStyle = '#2dd4bf';
    ctx.font = '800 20px Arial';
    ctx.fillText('KSFDC TICKETS', 54, 382);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 50px Arial';
    ctx.fillText(ticket.movieTitle, 54, 438, 500);
    ctx.font = '700 22px Arial';
    ctx.fillStyle = '#d8eee8';
    ctx.fillText(ticket.theatreName, 54, 482, 500);
    ctx.fillText(`${ticket.screenName} - ${formatShowDateTimeWithDaypart(ticket.showTime)}`, 54, 516, 580);

    ctx.fillStyle = '#f5b82e';
    roundedRect(504, 366, 126, 108, 20);
    ctx.fillStyle = '#111827';
    ctx.font = '900 24px Arial';
    ctx.fillText('ADMIT', 525, 405);
    ctx.font = '900 48px Arial';
    ctx.fillText(String(seatCount), 544, 456);

    ctx.fillStyle = '#34d399';
    ctx.font = '800 24px Arial';
    ctx.fillText(statusLabel(ticket.status), 54, 582);
    ctx.fillStyle = '#b7c6d7';
    ctx.font = '700 18px Arial';
    ctx.fillText(`Ticket ${ticket.ticketNumber}`, 54, 616, 420);
    ctx.fillText(`Booking ${ticket.bookingId}`, 54, 646, 500);

    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    roundedRect(54, 688, 612, 96, 18);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '900 20px Arial';
    ctx.fillText('SEATS', 78, 725);
    ctx.font = '800 24px Arial';
    ctx.fillText(seatsLine, 78, 760, 560);

    let y = 830;
    for (const group of ticket.groups) {
      ctx.fillStyle = 'rgba(45, 212, 191, 0.1)';
      roundedRect(54, y - 26, 390, 58, 16);
      ctx.fillStyle = '#2dd4bf';
      ctx.font = '800 17px Arial';
      ctx.fillText(group.zone, 76, y);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 22px Arial';
      ctx.fillText(group.seats.join(', '), 205, y, 210);
      y += 70;
    }

    ctx.fillStyle = '#f5b82e';
    ctx.font = '900 30px Arial';
    ctx.fillText(money(ticket.totalAmount), 54, 1010);
    ctx.fillStyle = '#d8eee8';
    ctx.font = '700 18px Arial';
    ctx.fillText(ticket.paymentMode?.replaceAll('_', ' ') ?? 'RECORDED', 54, 1038, 300);

    if (qrDataUrl) {
      const qrImage = new Image();
      qrImage.src = qrDataUrl;
      await new Promise((resolve) => { qrImage.onload = resolve; qrImage.onerror = resolve; });
      ctx.fillStyle = '#ffffff';
      roundedRect(494, 830, 150, 150, 18);
      ctx.drawImage(qrImage, 506, 842, 126, 126);
      ctx.fillStyle = '#d8eee8';
      ctx.font = '800 14px Arial';
      ctx.fillText('SCAN TO VERIFY', 504, 1010);
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob) return;
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.download = `${ticket.ticketNumber}.jpg`;
    link.href = objectUrl;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
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
