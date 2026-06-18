'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';

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

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function statusLabel(value: string) {
  return value === 'CONFIRMED' ? 'Confirmed' : value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

export default function ShareableTicketCard({ ticket }: { ticket: ShareableTicket }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);
  const qrPayload = useMemo(() => JSON.stringify({
    bookingId: ticket.bookingId,
    ticketNumber: ticket.ticketNumber,
    showId: ticket.showId,
    theatreId: ticket.theatreId,
    verificationUrl: ticket.verificationUrl,
    verificationToken: ticket.verificationToken
  }), [ticket]);

  useEffect(() => {
    QRCode.toDataURL(qrPayload, { margin: 1, width: 240 }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
  }, [qrPayload]);

  async function downloadTicket() {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1500;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#07090d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#111827');
    gradient.addColorStop(0.55, '#07111f');
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(28, 28, canvas.width - 56, canvas.height - 56);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 42px Arial';
    ctx.fillText(ticket.movieTitle, 48, 88, 780);
    ctx.font = '400 26px Arial';
    ctx.fillText(`${ticket.theatreName} - ${ticket.screenName}`, 48, 132, 780);
    ctx.fillText(formatTime(ticket.showTime), 48, 170, 780);
    ctx.fillStyle = '#34d399';
    ctx.font = '700 34px Arial';
    ctx.fillText(statusLabel(ticket.status), 48, 230);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 28px Arial';
    ctx.fillText(`Ticket ${ticket.ticketNumber}`, 48, 290, 780);
    ctx.font = '400 24px Arial';
    ctx.fillText(`Booking ${ticket.bookingId}`, 48, 330, 780);
    let y = 400;
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
      text: `${ticket.movieTitle} - ${ticket.theatreName} - ${formatTime(ticket.showTime)}`,
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
            <p>Admit one</p>
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
            <span>Show time</span><strong>{formatTime(ticket.showTime)}</strong>
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
            {qrDataUrl ? <img src={qrDataUrl} alt="Ticket verification QR code" /> : <span className="qr-placeholder">QR</span>}
            <div>
              <span>Booking ID</span>
              <strong>{ticket.bookingId}</strong>
              <span>{money(ticket.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="ticket-actions no-print">
        <button type="button" className="action-button primary" onClick={downloadTicket}>Download ticket</button>
        <button type="button" className="action-button" onClick={shareTicket}>Share ticket</button>
        <button type="button" className="action-button" onClick={() => window.print()}>Print</button>
      </div>
    </section>
  );
}
