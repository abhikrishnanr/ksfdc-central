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
    image.crossOrigin = 'anonymous';
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
    canvas.width = 1080;
    canvas.height = 1620;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const roundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
      ctx.fill();
    };

    const wrapText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 2) => {
      const words = text.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width <= maxWidth || !current) {
          current = test;
        } else {
          lines.push(current);
          current = word;
        }
        if (lines.length === maxLines) break;
      }
      if (current && lines.length < maxLines) lines.push(current);
      lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight, maxWidth));
      return y + Math.max(lines.length, 1) * lineHeight;
    };

    const drawTicketShell = () => {
      const x = 88;
      const y = 40;
      const width = 904;
      const height = 1540;
      const radius = 42;
      ctx.save();
      ctx.fillStyle = '#f8f4e9';
      ctx.shadowColor = 'rgba(0,0,0,0.46)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 24;
      roundedRect(x, y, width, height, radius);
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = '#c6a25c';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.roundRect(x + 1.5, y + 1.5, width - 3, height - 3, radius);
      ctx.stroke();
      ctx.restore();
    };

    const drawPunchHoles = () => {
      const punch = (cx: number, cy: number, r: number) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      };
      ctx.save();
      ctx.fillStyle = '#000000';
      for (let cx = ticketX + 74; cx <= ticketX + ticketW - 74; cx += 32) {
        punch(cx, ticketY, 9);
        punch(cx, ticketY + 1540, 9);
      }
      punch(ticketX, 412, 31);
      punch(ticketX + ticketW, 412, 31);
      punch(ticketX, 1206, 31);
      punch(ticketX + ticketW, 1206, 31);
      ctx.restore();
    };

    const drawPerforation = (y: number) => {
      ctx.save();
      ctx.setLineDash([6, 9]);
      ctx.strokeStyle = 'rgba(22, 54, 51, 0.52)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(105, y);
      ctx.lineTo(975, y);
      ctx.stroke();
      ctx.restore();
    };

    const posterHeight = 520;
    const ticketX = 88;
    const ticketY = 40;
    const ticketW = 904;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawTicketShell();

    const poster = ticket.moviePosterUrl
      ? await loadImage(`/api/public/movies/${encodeURIComponent(ticket.movieId)}/poster`)
      : null;
    if (poster) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(ticketX, ticketY, ticketW, posterHeight, 42);
      ctx.clip();
      drawCover(ctx, poster, ticketX, ticketY, ticketW, posterHeight);
      const posterShade = ctx.createLinearGradient(0, ticketY, 0, ticketY + posterHeight);
      posterShade.addColorStop(0, 'rgba(3,7,12,0.08)');
      posterShade.addColorStop(0.48, 'rgba(3,7,12,0.24)');
      posterShade.addColorStop(1, 'rgba(3,7,12,0.9)');
      ctx.fillStyle = posterShade;
      ctx.fillRect(ticketX, ticketY, ticketW, posterHeight);
      ctx.restore();
    }

    ctx.fillStyle = '#52d4c6';
    ctx.font = '900 34px Arial';
    ctx.fillText('KSFDC', 220, 124);
    ctx.fillStyle = '#f7fff8';
    ctx.font = '800 22px Arial';
    ctx.fillText('TICKETS', 222, 154);
    ctx.strokeStyle = '#f7fff8';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(168, 125, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i += 1) {
      const angle = i * Math.PI / 3;
      ctx.beginPath();
      ctx.arc(168 + Math.cos(angle) * 13, 125 + Math.sin(angle) * 13, 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#f8fafc';
    ctx.font = '500 19px Arial';
    ctx.fillText('Ticket No.', 786, 116);
    ctx.font = '900 28px Arial';
    ctx.fillText(ticket.ticketNumber, 700, 154, 238);

    ctx.fillStyle = '#f6f1e7';
    ctx.fillRect(ticketX, ticketY + posterHeight, ticketW, 640);
    ctx.fillStyle = 'rgba(6, 95, 89, 0.96)';
    ctx.fillRect(808, ticketY + posterHeight, 132, 128);

    ctx.fillStyle = '#075f5b';
    ctx.font = '900 24px Arial';
    ctx.fillText('MOVIE', 150, 612);
    ctx.fillStyle = '#091b1e';
    ctx.font = '900 56px Arial';
    const movieTitleBottom = wrapText(ticket.movieTitle, 150, 664, 620, 58, 2);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 28px Arial';
    ctx.fillText('ADMIT', 832, 610);
    ctx.font = '900 58px Arial';
    ctx.fillText(String(seatCount), 846, 680);
    ctx.font = '900 18px Arial';
    ctx.fillText(seatCount === 1 ? 'GUEST' : 'GUESTS', 834, 710);

    ctx.strokeStyle = 'rgba(9,27,30,0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(150, Math.max(movieTitleBottom + 8, 730));
    ctx.lineTo(805, Math.max(movieTitleBottom + 8, 730));
    ctx.stroke();

    const detailY = 792;
    const detailItems = [
      ['THEATRE', ticket.theatreName],
      ['SCREEN', ticket.screenName],
      ['DATE & TIME', formatShowDateTimeWithDaypart(ticket.showTime)]
    ];
    detailItems.forEach(([label, value], index) => {
      const x = 150 + index * 246;
      if (index > 0) {
        ctx.save();
        ctx.setLineDash([5, 7]);
        ctx.strokeStyle = 'rgba(9,27,30,0.28)';
        ctx.beginPath();
        ctx.moveTo(x - 28, detailY - 22);
        ctx.lineTo(x - 28, detailY + 66);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#075f5b';
      ctx.font = '900 17px Arial';
      ctx.fillText(label, x, detailY);
      ctx.fillStyle = '#101820';
      ctx.font = '700 24px Arial';
      wrapText(value, x, detailY + 32, 210, 27, 2);
    });

    ctx.fillStyle = '#075f5b';
    ctx.font = '900 28px Arial';
    ctx.fillText('SEATS', 150, 930);

    const tableX = 146;
    const tableY = 950;
    const tableW = 788;
    const rowH = 64;
    ctx.fillStyle = '#24211e';
    roundedRect(tableX, tableY, tableW, 56 + ticket.groups.length * rowH, 12);
    ctx.fillStyle = '#f8f4e9';
    ctx.fillRect(tableX + 1, tableY + 56, tableW - 2, ticket.groups.length * rowH - 1);
    ctx.strokeStyle = 'rgba(9,27,30,0.48)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tableX, tableY, tableW, 56 + ticket.groups.length * rowH);
    ctx.fillStyle = '#fff';
    ctx.font = '900 20px Arial';
    ctx.fillText('CATEGORY', tableX + 32, tableY + 36);
    ctx.fillText('SEAT NOS.', tableX + 352, tableY + 36);
    ctx.strokeStyle = 'rgba(9,27,30,0.42)';
    ctx.beginPath();
    ctx.moveTo(tableX + 320, tableY);
    ctx.lineTo(tableX + 320, tableY + 56 + ticket.groups.length * rowH);
    ctx.stroke();
    ticket.groups.forEach((group, index) => {
      const y = tableY + 56 + index * rowH;
      if (index > 0) {
        ctx.save();
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(9,27,30,0.32)';
        ctx.beginPath();
        ctx.moveTo(tableX, y);
        ctx.lineTo(tableX + tableW, y);
        ctx.stroke();
        ctx.restore();
      }
      const colors = ['#0f766e', '#eab308', '#e11d48', '#2563eb'];
      ctx.fillStyle = colors[index % colors.length];
      ctx.beginPath();
      ctx.arc(tableX + 46, y + 34, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.font = '800 24px Arial';
      ctx.fillText(group.zone, tableX + 76, y + 42, 225);
      ctx.font = '900 26px Arial';
      ctx.fillText(group.seats.join(', '), tableX + 352, y + 42, 395);
    });

    ctx.fillStyle = '#075f5b';
    ctx.font = '900 24px Arial';
    ctx.fillText('TOTAL AMOUNT', 150, 1294);
    ctx.fillStyle = '#121212';
    ctx.font = '900 64px Arial';
    ctx.fillText(money(ticket.totalAmount), 150, 1362);
    ctx.font = '800 24px Arial';
    ctx.fillText(`PAID VIA ${ticket.paymentMode?.replaceAll('_', ' ') ?? 'RECORDED'}`, 150, 1404, 420);

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#075f5b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(795, 1326, 78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '900 34px Arial';
    ctx.fillStyle = '#075f5b';
    ctx.fillText('KSFDC', 744, 1340);
    ctx.restore();

    drawPerforation(1218);
    ctx.fillStyle = '#053a3b';
    ctx.fillRect(ticketX, 1218, ticketW, 362);
    const footerGradient = ctx.createLinearGradient(0, 1218, 0, 1580);
    footerGradient.addColorStop(0, 'rgba(20, 184, 166, 0.18)');
    footerGradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
    ctx.fillStyle = footerGradient;
    ctx.fillRect(ticketX, 1218, ticketW, 362);

    ctx.strokeStyle = '#2dd4bf';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(150, 1288, 70, 88, 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(170, 1332);
    ctx.lineTo(188, 1350);
    ctx.lineTo(206, 1318);
    ctx.stroke();
    ctx.fillStyle = '#40e0d0';
    ctx.font = '900 24px Arial';
    ctx.fillText('SCAN TO VERIFY', 246, 1314);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '500 20px Arial';
    ctx.fillText('Show this QR code at', 246, 1350);
    ctx.fillText('the theatre entrance', 246, 1378);
    ctx.fillStyle = '#40e0d0';
    ctx.font = '900 18px Arial';
    ctx.fillText('BOOKING ID', 150, 1454);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 18px Arial';
    wrapText(ticket.bookingId, 150, 1488, 430, 24, 2);

    if (qrDataUrl) {
      const qrImage = new Image();
      qrImage.src = qrDataUrl;
      await new Promise((resolve) => { qrImage.onload = resolve; qrImage.onerror = resolve; });
      ctx.fillStyle = '#ffffff';
      roundedRect(624, 1238, 326, 326, 20);
      ctx.drawImage(qrImage, 644, 1258, 286, 286);
    }

    ctx.fillStyle = 'rgba(198, 162, 92, 0.85)';
    ctx.font = '700 18px Arial';
    ctx.fillText('www.ksfdc.in', 160, 1560);
    ctx.fillText('1800 309 3333', 416, 1560);

    drawPunchHoles();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.download = `${ticket.ticketNumber}.png`;
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
      {showSeatLayout && seatLayout ? <TicketSeatLayoutModal show={seatLayout} ticketSeats={ticketSeats} ticketGroups={ticket.groups} onClose={() => setShowSeatLayout(false)} /> : null}
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
