'use client';

import { useState, useTransition } from 'react';

export default function PublicEmailLoginPanel() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [step, setStep] = useState<'EMAIL' | 'OTP'>('EMAIL');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function requestCode() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch('/api/public/auth/request-email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'BOOKING_LOGIN' })
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error ?? 'We could not send the code. Please try again.');
        return;
      }
      setMaskedEmail(payload.maskedEmail ?? email);
      setStep('OTP');
      setMessage(payload.emailSent === false ? 'Email sending is not configured on this server yet.' : `Enter the 6-digit code sent to ${payload.maskedEmail ?? email}.`);
    });
  }

  function verifyCode() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch('/api/public/auth/verify-email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, otp, purpose: 'BOOKING_LOGIN' })
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error ?? 'That code is incorrect. Please try again.');
        return;
      }
      window.location.reload();
    });
  }

  return (
    <section className="role-login-form">
      <div><p className="eyebrow">Role: Cinema patron</p><h2>Access your tickets</h2><p>We&apos;ll verify your email with a one-time code.</p></div>
      {step === 'EMAIL' ? (
        <>
          <p>Enter your email and we&apos;ll send a one-time code.</p>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@example.com" autoComplete="email" />
          <button type="button" className="action-button primary" disabled={isPending || !email} onClick={requestCode}>Send code</button>
        </>
      ) : (
        <>
          <p>Enter the 6-digit code sent to {maskedEmail || email}. Code expires in 5 minutes.</p>
          <input value={otp} onChange={(event) => setOtp(event.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" />
          <div className="meta-row">
            <button type="button" className="action-button primary" disabled={isPending || otp.length !== 6} onClick={verifyCode}>Verify</button>
            <button type="button" className="action-button" disabled={isPending} onClick={requestCode}>Resend code</button>
          </div>
        </>
      )}
      {message ? <p aria-live="polite">{message}</p> : null}
    </section>
  );
}
