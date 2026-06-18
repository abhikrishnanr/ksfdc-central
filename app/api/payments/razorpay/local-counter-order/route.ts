import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyCentralSyncRequest } from '../../../../../lib/sync-security';
import { createLocalCounterQr, ensureCentralPaymentTables, razorpayEnabled, writePaymentAudit } from '../../../../../lib/razorpay';
import { getCentralDbPool } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

type LocalCounterPayload = {
  theatreId?: string;
  counterCode?: string;
  holdId?: string;
  showId?: string;
  amount?: number;
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const rejected = await verifyCentralSyncRequest(request, rawBody);
  if (rejected) return rejected;

  await ensureCentralPaymentTables();
  const payload = JSON.parse(rawBody || '{}') as LocalCounterPayload;
  const theatreId = payload.theatreId?.trim();
  const counterCode = payload.counterCode?.trim();
  const holdId = payload.holdId?.trim();
  const showId = payload.showId?.trim();
  const amount = Number(payload.amount ?? 0);

  if (!theatreId || !counterCode || !holdId || !showId || amount <= 0) {
    return NextResponse.json({ success: false, error: 'theatreId, counterCode, holdId, showId, and amount are required.' }, { status: 400 });
  }
  if (!razorpayEnabled()) {
    return NextResponse.json({
      success: true,
      qrAvailable: false,
      message: 'Razorpay QR is not available in this test account. Use manual digital collection for now.'
    });
  }

  const amountPaise = Math.round(amount * 100);
  const paymentId = `PAY_${randomUUID()}`;
  const qr = await createLocalCounterQr({ amountPaise, theatreId, counterCode, holdId, showId });
  await getCentralDbPool().query(
    `INSERT INTO payments
       (id, booking_id, hold_id, show_id, provider, payment_mode, provider_reference, provider_order_id,
        amount, currency, status, authority_mode_at_order, channel, counter_code)
     VALUES (?, NULL, ?, ?, 'RAZORPAY', 'RAZORPAY_QR', ?, ?, ?, 'INR', ?, 'LOCAL_COUNTER', 'COUNTER', ?)`,
    [
      paymentId,
      holdId,
      showId,
      qr.available ? qr.qrId : null,
      qr.available ? qr.qrId : null,
      amount,
      qr.available ? 'PENDING' : 'FAILED',
      counterCode
    ]
  );
  await writePaymentAudit({
    paymentId,
    holdId,
    showId,
    action: qr.available ? 'RAZORPAY_LOCAL_QR_CREATED' : 'RAZORPAY_LOCAL_QR_UNAVAILABLE',
    provider: 'RAZORPAY',
    providerOrderId: qr.available ? qr.qrId : null,
    status: qr.available ? 'PENDING' : 'FAILED',
    metadata: { theatreId, counterCode, amount, message: qr.available ? null : qr.message }
  });

  if (!qr.available) {
    return NextResponse.json({ success: true, qrAvailable: false, message: qr.message });
  }
  return NextResponse.json({
    success: true,
    qrAvailable: true,
    paymentId,
    qrId: qr.qrId,
    imageUrl: qr.imageUrl,
    amount,
    currency: 'INR',
    status: qr.status
  });
}
