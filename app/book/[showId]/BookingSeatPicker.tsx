'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, CreditCard, Frown, LoaderCircle, RadioTower, ShieldCheck, TicketCheck } from 'lucide-react';
import type { BookingShowDetail, SeatCell } from '../../../lib/central-data';
import BookMyShowStyleSeatMap from '../../../components/template/BookMyShowStyleSeatMap';
import BookingSummaryBar from '../../../components/template/BookingSummaryBar';
import SeatSelectionLayout from '../../../components/template/SeatSelectionLayout';

type AuthStep = 'READY' | 'EMAIL' | 'OTP';
type BookingProgressPhase = 'CONNECTING' | 'HOLDING' | 'HELD' | 'PAYMENT' | 'PAYMENT_SUCCESS' | 'CONFIRMING' | 'SUCCESS' | 'FAILED';

type SelectedZoneGroup = {
  zone: string;
  seats: string[];
  count: number;
  subtotal: number;
  unit: number;
};

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(Math.ceil(ms / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function groupSeats(selected: string[], seatMap: Map<string, SeatCell>) {
  const groups = new Map<string, SelectedZoneGroup>();

  for (const seatId of selected) {
    const seat = seatMap.get(seatId);
    const zone = seat?.zone ?? 'Standard';
    const amount = Number(seat?.price ?? 0);

    const group = groups.get(zone) ?? {
      zone,
      seats: [],
      count: 0,
      subtotal: 0,
      unit: amount
    };

    group.seats.push(seatId);
    group.count += 1;
    group.subtotal += amount;
    group.unit = amount;

    groups.set(zone, group);
  }

  return Array.from(groups.values());
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;

  if (name.length <= 2) return `${name[0] ?? ''}••@${domain}`;
  return `${name.slice(0, 2)}•••@${domain}`;
}

function EmailOtpModal({
  open,
  step,
  email,
  otp,
  maskedEmail,
  selectedGroups,
  count,
  total,
  pending,
  message,
  onEmailChange,
  onOtpChange,
  onSendOtp,
  onVerifyOtp,
  onClose,
  onResend
}: {
  open: boolean;
  step: AuthStep;
  email: string;
  otp: string;
  maskedEmail: string;
  selectedGroups: SelectedZoneGroup[];
  count: number;
  total: number;
  pending: boolean;
  message: string | null;
  onEmailChange: (value: string) => void;
  onOtpChange: (value: string) => void;
  onSendOtp: () => void;
  onVerifyOtp: () => void;
  onClose: () => void;
  onResend: () => void;
}) {
  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, pending, onClose]);

  if (!open) return null;

  const isEmailStep = step === 'EMAIL';
  const isOtpStep = step === 'OTP';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-xl">
      <button
        type="button"
        aria-label="Close verification popup"
        onClick={onClose}
        disabled={pending}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative z-[91] w-full max-w-[520px] overflow-hidden rounded-[28px] border border-white/15 bg-[#07111f] shadow-[0_28px_100px_rgba(0,0,0,0.7)]">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#f5b82e] via-[#22c55e] to-[#38bdf8]" />

        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#f5b82e]/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative p-6 sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.26em] text-[#f5b82e]">
                Email verification
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                {isEmailStep ? 'Verify your email to hold seats' : 'Enter your verification code'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {isEmailStep
                  ? 'Your seats will be held only after email verification. This keeps the booking fair for everyone.'
                  : `We sent a 6-digit code to ${maskedEmail || maskEmail(email)}.`}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-lg text-slate-300 transition hover:border-white/25 hover:bg-white/[0.08] disabled:opacity-50"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Selected seats
              </span>
              <span className="rounded-full bg-[#f5b82e]/15 px-3 py-1 text-xs font-semibold text-[#f5b82e]">
                {count} {count === 1 ? 'ticket' : 'tickets'}
              </span>
            </div>

            <div className="space-y-3">
              {selectedGroups.map((group) => (
                <div key={group.zone} className="rounded-xl bg-black/20 p-3">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <strong className="text-sm text-white">{group.zone}</strong>
                    <span className="text-sm font-semibold text-white">INR {group.subtotal}</span>
                  </div>
                  <div className="text-xs leading-5 text-slate-400">
                    {group.seats.join(', ')} · {group.count} × INR {group.unit}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
              <span className="text-sm text-slate-400">Total amount</span>
              <strong className="text-xl text-white">INR {total}</strong>
            </div>
          </div>

          {isEmailStep ? (
            <div className="grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-200">Email address</span>
                <input
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="h-13 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-[#f5b82e]/70 focus:ring-4 focus:ring-[#f5b82e]/10"
                />
                <span className="text-xs leading-5 text-slate-500">
                  We will send a one-time code to this email. Your selected seats are not held yet.
                </span>
              </label>

              <button
                type="button"
                disabled={pending || !email.trim()}
                onClick={onSendOtp}
                className="h-13 rounded-2xl bg-[#f5b82e] px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-black transition hover:bg-[#ffd36b] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? 'Sending code…' : 'Send verification code'}
              </button>
            </div>
          ) : null}

          {isOtpStep ? (
            <div className="grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-200">Verification code</span>
                <input
                  value={otp}
                  onChange={(event) => onOtpChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  className="h-14 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-center text-2xl font-semibold tracking-[0.45em] text-white outline-none transition placeholder:text-slate-600 focus:border-[#f5b82e]/70 focus:ring-4 focus:ring-[#f5b82e]/10"
                />
                <span className="text-xs leading-5 text-slate-500">
                  Code expires soon. Do not share this code with anyone.
                </span>
              </label>

              <button
                type="button"
                disabled={pending || otp.length !== 6}
                onClick={onVerifyOtp}
                className="h-13 rounded-2xl bg-[#f5b82e] px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-black transition hover:bg-[#ffd36b] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? 'Verifying…' : 'Verify and hold seats'}
              </button>

              <button
                type="button"
                disabled={pending}
                onClick={onResend}
                className="h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/25 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Resend code
              </button>
            </div>
          ) : null}

          {message ? (
            <div className="mt-5 rounded-2xl border border-[#f5b82e]/25 bg-[#f5b82e]/10 px-4 py-3 text-sm leading-6 text-[#ffe2a3]">
              {message}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BookingAlertModal({
  open,
  title,
  message,
  onClose
}: {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="booking-alert-backdrop" role="dialog" aria-modal="true" aria-labelledby="booking-alert-title">
      <button type="button" className="booking-alert-scrim" aria-label="Close message" onClick={onClose} />
      <section className="booking-alert-modal">
        <p className="eyebrow">Booking message</p>
        <h2 id="booking-alert-title">{title}</h2>
        <p>{message}</p>
        <button type="button" className="action-button primary" onClick={onClose}>OK</button>
      </section>
    </div>
  );
}

const PROGRESS_COPY: Record<BookingProgressPhase, { title: string; detail: string }> = {
  CONNECTING: { title: 'Connecting to the theatre', detail: 'Checking the live seat desk securely.' },
  HOLDING: { title: 'Holding your seats', detail: 'The theatre is locking your selection now.' },
  HELD: { title: 'Seats held', detail: 'Your seats are protected while payment opens.' },
  PAYMENT: { title: 'Going to payment', detail: 'Complete payment in the secure Razorpay window.' },
  PAYMENT_SUCCESS: { title: 'Payment successful', detail: 'Your payment is confirmed.' },
  CONFIRMING: { title: 'Sending confirmation to theatre', detail: 'Finalizing your ticket with the theatre.' },
  SUCCESS: { title: "Here's your ticket", detail: 'Your booking is confirmed. Opening it now.' },
  FAILED: { title: 'Payment did not complete', detail: 'No, no. Your ticket was not finalized.' }
};

function ProgressIcon({ phase }: { phase: BookingProgressPhase }) {
  const props = { size: 46, strokeWidth: 1.8 };
  if (phase === 'CONNECTING') return <RadioTower {...props} />;
  if (phase === 'HOLDING') return <ShieldCheck {...props} />;
  if (phase === 'HELD') return <BadgeCheck {...props} />;
  if (phase === 'PAYMENT') return <CreditCard {...props} />;
  if (phase === 'PAYMENT_SUCCESS') return <BadgeCheck {...props} />;
  if (phase === 'CONFIRMING') return <LoaderCircle {...props} />;
  if (phase === 'SUCCESS') return <TicketCheck {...props} />;
  return <Frown {...props} />;
}

function BookingProgressOverlay({
  phase,
  detail,
  onClose
}: {
  phase: BookingProgressPhase | null;
  detail?: string | null;
  onClose: () => void;
}) {
  if (!phase) return null;
  const celebratory = phase === 'PAYMENT_SUCCESS' || phase === 'SUCCESS';
  const failed = phase === 'FAILED';

  return (
    <div className="booking-progress-overlay" role="status" aria-live="assertive" aria-label={PROGRESS_COPY[phase].title}>
      <div className={`booking-progress-panel phase-${phase.toLowerCase()}`}>
        {celebratory ? <div className="booking-confetti" aria-hidden="true">{Array.from({ length: 20 }, (_, index) => <i key={index} style={{ '--particle': index } as React.CSSProperties} />)}</div> : null}
        <div className={`booking-progress-icon ${failed ? 'failure' : ''}`}><ProgressIcon phase={phase} /></div>
        <div className="booking-progress-copy">
          <span>{failed ? 'Booking paused' : 'Secure booking'}</span>
          <h2>{PROGRESS_COPY[phase].title}</h2>
          <p>{detail || PROGRESS_COPY[phase].detail}</p>
        </div>
        {!failed ? <div className="booking-progress-track"><span /></div> : null}
        {failed ? <button type="button" className="action-button primary" onClick={onClose}>Choose another option</button> : null}
      </div>
    </div>
  );
}

export default function BookingSeatPicker({ show }: { show: BookingShowDetail }) {
  const router = useRouter();

  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [authStep, setAuthStep] = useState<AuthStep>('READY');
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [progressPhase, setProgressPhase] = useState<BookingProgressPhase | null>(null);
  const [progressDetail, setProgressDetail] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  const seatMap = useMemo(
    () =>
      new Map(
        show.rows
          .flatMap((row) => row.cells)
          .filter((cell) => cell.kind === 'SEAT' && cell.seatId)
          .map((cell) => [cell.seatId as string, cell])
      ),
    [show.rows]
  );

  const selectedGroups = useMemo(() => groupSeats(selected, seatMap), [selected, seatMap]);
  const total = selectedGroups.reduce((sum, group) => sum + group.subtotal, 0);

  const holdRemainingMs = holdExpiresAt ? Math.max(new Date(holdExpiresAt).getTime() - now, 0) : 0;
  const holdRemainingLabel = holdExpiresAt ? formatRemaining(holdRemainingMs) : null;

  useEffect(() => {
    if (!holdExpiresAt) return undefined;

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [holdExpiresAt]);

  useEffect(() => {
    if (!holdExpiresAt || holdRemainingMs > 0) return;
    const timer = window.setTimeout(() => {
      setHoldExpiresAt(null);
      setSelected([]);
      setAuthStep('READY');
      setAuthModalOpen(false);
      setMessage(null);
      setAlert({ title: 'Seat hold expired', message: 'Your seat hold expired. Please select seats again.' });
      router.refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [holdExpiresAt, holdRemainingMs, router]);

  function closeAuthModal() {
    if (isPending) return;
    setAuthModalOpen(false);
    setAuthStep('READY');
    setOtp('');
  }

  function toggle(cell: SeatCell) {
    if (show.bookingEnabled === false) {
      setAlert({ title: 'Booking unavailable', message: 'Booking is temporarily unavailable for this show.' });
      return;
    }
    if (cell.kind !== 'SEAT' || !cell.seatId || cell.status !== 'AVAILABLE') {
      setAlert({ title: 'Seat unavailable', message: 'This seat is already booked or unavailable. Please choose another seat.' });
      return;
    }
    if (holdExpiresAt) {
      setAlert({ title: 'Seats already held', message: 'Your selected seats are already held. Please complete payment or wait for the hold to expire.' });
      return;
    }

    setMessage(null);

    setSelected((current) =>
      current.includes(cell.seatId as string)
        ? current.filter((seat) => seat !== cell.seatId)
        : [...current, cell.seatId as string]
    );
  }

  async function loadRazorpayCheckout() {
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return true;

    return new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  async function releaseHold(holdId: string) {
    await fetch('/api/bookings/release', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ holdId, showId: show.showId })
    }).catch(() => undefined);
  }

  async function startPayment() {
    setAuthModalOpen(false);
    setAuthStep('READY');
    setMessage('Seats are being held while payment starts.');
    setProgressDetail(null);
    setProgressPhase('CONNECTING');

    startTransition(async () => {
      const holdingTimer = window.setTimeout(() => setProgressPhase('HOLDING'), 450);
      const response = await fetch('/api/bookings/hold', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `hold-${show.showId}-${selected.join('-')}-${Date.now()}`
        },
        body: JSON.stringify({
          showId: show.showId,
          seatIds: selected,
          customerName: email || undefined
        })
      });

      const payload = await response.json();
      window.clearTimeout(holdingTimer);

      if (!response.ok) {
        if (payload.reason === 'PUBLIC_EMAIL_VERIFICATION_REQUIRED') {
          setAuthStep('EMAIL');
          setAuthModalOpen(true);
          setMessage('Please verify your email to continue.');
          setProgressPhase(null);
          return;
        }

        setMessage(null);
        setAlert({
          title: 'Seats unavailable',
          message: payload.message ?? payload.error ?? 'Your selected seats are no longer available. Please choose again.'
        });
        setProgressPhase(null);
        return;
      }

      setHoldExpiresAt(payload.expiresAt ?? null);
      setProgressPhase('HELD');

      const orderResponse = await fetch('/api/payments/razorpay/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          holdId: payload.holdId,
          showId: show.showId,
          channel: 'PUBLIC'
        })
      });

      const orderPayload = await orderResponse.json();

      if (!orderResponse.ok) {
        await releaseHold(payload.holdId);
        setHoldExpiresAt(null);
        setMessage(null);
        setAlert({
          title: 'Payment unavailable',
          message: orderPayload.message ?? orderPayload.error ?? 'Payment could not start. Your seats were released.'
        });
        setProgressDetail(orderPayload.message ?? orderPayload.error ?? 'Payment could not start.');
        setProgressPhase('FAILED');
        return;
      }

      const checkoutLoaded = await loadRazorpayCheckout();

      if (!checkoutLoaded) {
        await releaseHold(payload.holdId);
        setHoldExpiresAt(null);
        setMessage(null);
        setAlert({ title: 'Payment unavailable', message: 'Payment could not start. Please try again.' });
        setProgressDetail('The secure payment window could not load.');
        setProgressPhase('FAILED');
        return;
      }

      const RazorpayCheckout = (
        window as unknown as {
          Razorpay: new (options: Record<string, unknown>) => { open: () => void };
        }
      ).Razorpay;

      const checkout = new RazorpayCheckout({
        key: orderPayload.keyId,
        amount: orderPayload.amount,
        currency: orderPayload.currency,
        name: 'KSFDC Tickets',
        description: `${show.movieTitle} - ${selected.join(', ')}`,
        order_id: orderPayload.orderId,
        prefill: { email },
        notes: {
          holdId: payload.holdId,
          showId: show.showId
        },
        handler: async (razorpayResponse: Record<string, string>) => {
          setProgressPhase('PAYMENT_SUCCESS');
          await new Promise((resolve) => window.setTimeout(resolve, 650));
          setProgressPhase('CONFIRMING');
          const verifyResponse = await fetch('/api/payments/razorpay/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              holdId: payload.holdId,
              razorpay_order_id: razorpayResponse.razorpay_order_id,
              razorpay_payment_id: razorpayResponse.razorpay_payment_id,
              razorpay_signature: razorpayResponse.razorpay_signature
            })
          });

          const verifyPayload = await verifyResponse.json();

          if (!verifyResponse.ok) {
            setMessage(null);
            setAlert({
              title: 'Booking needs review',
              message: verifyPayload.message ?? verifyPayload.error ?? 'Payment confirmed, but your ticket needs support review.'
            });
            setProgressDetail(verifyPayload.message ?? verifyPayload.error ?? 'Payment succeeded, but theatre confirmation needs review.');
            setProgressPhase('FAILED');
            return;
          }

          setSelected([]);
          setHoldExpiresAt(null);
          setProgressDetail(null);
          setProgressPhase('SUCCESS');
          window.setTimeout(() => router.push(`/ticket/${verifyPayload.bookingId}`), 900);
        },
        modal: {
          ondismiss: async () => {
            await releaseHold(payload.holdId);
            setHoldExpiresAt(null);
            setMessage(null);
            setAlert({ title: 'Payment cancelled', message: 'Payment cancelled. Your seats were released.' });
            setProgressDetail('Payment was cancelled. Your held seats have been released.');
            setProgressPhase('FAILED');
          }
        }
      });

      setProgressPhase('PAYMENT');
      checkout.open();
    });
  }

  async function proceed() {
    if (show.bookingEnabled === false) {
      setAlert({ title: 'Booking unavailable', message: 'Booking is temporarily unavailable for this show.' });
      return;
    }

    if (!selected.length) {
      setAlert({ title: 'No seats selected', message: 'Select at least one available seat to continue.' });
      return;
    }

    if (holdExpiresAt) {
      setAlert({ title: 'Seats already held', message: 'Your seats are already held. Please complete payment.' });
      return;
    }

    setMessage(null);

    try {
      const response = await fetch('/api/public/auth/me');
      const payload = await response.json();

      if (payload.otpEnabled && !payload.authenticated) {
        setAuthStep('EMAIL');
        setAuthModalOpen(true);
        setMessage(null);
        return;
      }

      if (payload.user?.email) setEmail(payload.user.email);
      await startPayment();
    } catch {
      setAuthStep('EMAIL');
      setAuthModalOpen(true);
      setMessage(null);
    }
  }

  async function requestOtp() {
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setAlert({ title: 'Email required', message: 'Enter your email address to continue.' });
      return;
    }

    setMessage(null);

    startTransition(async () => {
      const response = await fetch('/api/public/auth/request-email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          purpose: 'BOOKING_LOGIN'
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage(null);
        setAlert({ title: 'Code not sent', message: payload.message ?? payload.error ?? 'We could not send the code. Please try again.' });
        return;
      }

      setMaskedEmail(payload.maskedEmail ?? maskEmail(cleanEmail));
      setAuthStep('OTP');
      setMessage(
        payload.emailSent === false
          ? 'Email sending is not configured on this server yet.'
          : `Enter the 6-digit code sent to ${payload.maskedEmail ?? maskEmail(cleanEmail)}.`
      );
    });
  }

  async function verifyOtp() {
    if (otp.length !== 6) {
      setAlert({ title: 'Invalid code', message: 'Enter the 6-digit code sent to your email.' });
      return;
    }

    setMessage(null);

    startTransition(async () => {
      const response = await fetch('/api/public/auth/verify-email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          otp,
          purpose: 'BOOKING_LOGIN'
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage(null);
        setAlert({ title: 'Verification failed', message: payload.message ?? payload.error ?? 'That code is incorrect. Please try again.' });
        return;
      }

      setMessage('Email verified. Holding your seats now.');
      setAuthModalOpen(false);
      setAuthStep('READY');
      await startPayment();
    });
  }

  return (
    <SeatSelectionLayout>
      <BookMyShowStyleSeatMap
        show={show}
        selected={selected}
        disabled={isPending || Boolean(holdExpiresAt)}
        holdActive={Boolean(holdExpiresAt)}
        onToggle={toggle}
      />

      <BookingSummaryBar
        groups={selectedGroups}
        count={selected.length}
        total={total}
        holdLabel={holdRemainingLabel}
        disabled={show.bookingEnabled === false || !selected.length || isPending}
        pending={isPending}
        message={message}
        onProceed={proceed}
      />

      <EmailOtpModal
        open={authModalOpen}
        step={authStep}
        email={email}
        otp={otp}
        maskedEmail={maskedEmail}
        selectedGroups={selectedGroups}
        count={selected.length}
        total={total}
        pending={isPending}
        message={message}
        onEmailChange={setEmail}
        onOtpChange={setOtp}
        onSendOtp={requestOtp}
        onVerifyOtp={verifyOtp}
        onClose={closeAuthModal}
        onResend={requestOtp}
      />

      <BookingAlertModal
        open={Boolean(alert)}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        onClose={() => setAlert(null)}
      />

      <BookingProgressOverlay
        phase={progressPhase}
        detail={progressDetail}
        onClose={() => { setProgressPhase(null); setProgressDetail(null); }}
      />
    </SeatSelectionLayout>
  );
}
