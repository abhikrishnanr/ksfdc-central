import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getCentralDbPool } from '../../../../../lib/db';
import { normalizeAuthorityMode } from '../../../../../lib/authority-mode';
import { createRazorpayOrder, ensureCentralPaymentTables, getRazorpayKeyId, razorpayEnabled, writePaymentAudit } from '../../../../../lib/razorpay';
import { authorityUnavailablePayload, getBookingAuthorityDecision } from '../../../../../lib/booking-authority';

export const dynamic = 'force-dynamic';

type OrderPayload = {
  holdId?: string;
  showId?: string;
  channel?: string;
};

export async function POST(request: NextRequest) {
  await ensureCentralPaymentTables();
  const payload = await request.json().catch(() => ({})) as OrderPayload;
  const holdId = payload.holdId?.trim();
  const showId = payload.showId?.trim();
  const channel = payload.channel === 'PUBLIC' ? 'PUBLIC' : 'PUBLIC';

  if (!holdId || !showId) {
    return NextResponse.json({ success: false, error: 'holdId and showId are required.' }, { status: 400 });
  }
  if (!razorpayEnabled()) {
    return NextResponse.json({ success: false, error: 'RAZORPAY_NOT_CONFIGURED' }, { status: 503 });
  }

  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();

    const [[hold]] = await connection.query<RowDataPacket[]>(
      `SELECT h.id, h.show_id AS showId, h.status, h.expires_at AS expiresAt, h.customer_name AS customerName,
              s.theatre_id AS theatreId, s.authority_mode AS authorityMode, s.status AS showStatus
       FROM central_seat_holds h
       JOIN shows s ON s.id = h.show_id
       WHERE h.id = ? AND h.show_id = ?
       FOR UPDATE`,
      [holdId, showId]
    );
    if (!hold) {
      await connection.rollback();
      return NextResponse.json({ success: false, error: 'Hold not found.' }, { status: 404 });
    }
    if (String(hold.status) !== 'ACTIVE' || new Date(hold.expiresAt).getTime() <= Date.now()) {
      await connection.rollback();
      return NextResponse.json({ success: false, error: 'Hold is not active or has expired.' }, { status: 409 });
    }
    const decision = await getBookingAuthorityDecision({
      showId,
      theatreId: String(hold.theatreId),
      authorityMode: hold.authorityMode,
      status: hold.showStatus
    });
    const authorityMode = normalizeAuthorityMode(decision?.authorityMode ?? hold.authorityMode);
    if (!decision || !decision.publicBookingAllowed) {
      await connection.rollback();
      return NextResponse.json(authorityUnavailablePayload(decision), { status: authorityMode === 'LOCAL_AUTHORITY_ONLINE' ? 503 : 409 });
    }
    if (String(hold.showStatus) !== 'OPEN' || (!decision.centralCanHold && !decision.mustForwardToLocal)) {
      await connection.rollback();
      return NextResponse.json(authorityUnavailablePayload(decision), { status: 409 });
    }

    const [items] = await connection.query<RowDataPacket[]>('SELECT amount FROM central_seat_hold_items WHERE hold_id = ? FOR UPDATE', [holdId]);
    const amount = items.reduce((sum, item) => sum + Number(item.amount), 0);
    if (amount <= 0) {
      await connection.rollback();
      return NextResponse.json({ success: false, error: 'Hold has no payable seats.' }, { status: 409 });
    }

    const [[existingPayment]] = await connection.query<RowDataPacket[]>(
      `SELECT id, provider_order_id AS orderId, amount, currency, status
       FROM payments
       WHERE hold_id = ? AND provider = 'RAZORPAY' AND status IN ('CREATED','PENDING')
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [holdId]
    );
    if (existingPayment?.orderId) {
      await connection.commit();
      return NextResponse.json({
        success: true,
        keyId: getRazorpayKeyId(),
        orderId: String(existingPayment.orderId),
        amount: Math.round(Number(existingPayment.amount) * 100),
        displayAmount: Number(existingPayment.amount),
        currency: String(existingPayment.currency ?? 'INR'),
        holdId,
        showId,
        channel,
        paymentId: String(existingPayment.id),
        reused: true
      });
    }

    await connection.commit();

    const amountPaise = Math.round(amount * 100);
    const order = await createRazorpayOrder({
      amountPaise,
      receipt: `hold-${holdId}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40),
      notes: { holdId, showId, channel, authorityMode }
    });
    const paymentId = `PAY_${randomUUID()}`;
    await getCentralDbPool().query(
      `INSERT INTO payments
         (id, booking_id, hold_id, show_id, provider, payment_mode, provider_reference, provider_order_id,
          amount, currency, status, authority_mode_at_order, channel)
       VALUES (?, NULL, ?, ?, 'RAZORPAY', 'RAZORPAY', ?, ?, ?, 'INR', 'CREATED', ?, ?)`,
      [paymentId, holdId, showId, String(order.id), String(order.id), amount, authorityMode, channel]
    );
    await writePaymentAudit({
      paymentId,
      holdId,
      showId,
      action: 'RAZORPAY_ORDER_CREATED',
      provider: 'RAZORPAY',
      providerOrderId: String(order.id),
      status: 'CREATED',
      metadata: { authorityMode, amount }
    });

    return NextResponse.json({
      success: true,
      keyId: getRazorpayKeyId(),
      orderId: String(order.id),
      amount: amountPaise,
      displayAmount: amount,
      currency: 'INR',
      holdId,
      showId,
      channel,
      paymentId
    });
  } catch (error) {
    try { await connection.rollback(); } catch {}
    await writePaymentAudit({ holdId, showId, action: 'RAZORPAY_ORDER_FAILED', provider: 'RAZORPAY', status: 'FAILED', metadata: { error: error instanceof Error ? error.message : String(error) } });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to create Razorpay order.' }, { status: 500 });
  } finally {
    connection.release();
  }
}
