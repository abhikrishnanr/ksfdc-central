import { NextRequest, NextResponse } from 'next/server';
import { getCentralDbPool } from '../../../../../lib/db';
import { ensureCentralPaymentTables, verifyRazorpayWebhookSignature, writePaymentAudit } from '../../../../../lib/razorpay';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  await ensureCentralPaymentTables();
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';
  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ success: false, error: 'Invalid webhook signature.' }, { status: 400 });
  }

  const event = JSON.parse(rawBody) as {
    event?: string;
    payload?: {
      payment?: { entity?: { id?: string; order_id?: string; status?: string; error_description?: string } };
    };
  };
  const payment = event.payload?.payment?.entity;
  const paymentId = payment?.id;
  const orderId = payment?.order_id;
  if (!paymentId || !orderId) return NextResponse.json({ success: true, ignored: true });

  if (event.event === 'payment.captured') {
    await getCentralDbPool().query(
      `UPDATE payments
       SET provider_payment_id = ?, provider_reference = ?, status = CASE WHEN booking_id IS NULL THEN status ELSE 'CAPTURED' END
       WHERE provider_order_id = ? AND provider = 'RAZORPAY'`,
      [paymentId, paymentId, orderId]
    );
    await writePaymentAudit({ action: 'RAZORPAY_WEBHOOK_CAPTURED', provider: 'RAZORPAY', providerOrderId: orderId, providerPaymentId: paymentId, status: 'CAPTURED' });
  } else if (event.event === 'payment.failed') {
    await getCentralDbPool().query(
      `UPDATE payments
       SET provider_payment_id = ?, provider_reference = ?, status = 'FAILED'
       WHERE provider_order_id = ? AND provider = 'RAZORPAY' AND booking_id IS NULL`,
      [paymentId, paymentId, orderId]
    );
    await writePaymentAudit({ action: 'RAZORPAY_WEBHOOK_FAILED', provider: 'RAZORPAY', providerOrderId: orderId, providerPaymentId: paymentId, status: 'FAILED', metadata: { error: payment.error_description ?? null } });
  }

  return NextResponse.json({ success: true });
}
