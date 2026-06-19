import { NextRequest, NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getCentralDbPool } from '../../../../../lib/db';
import { normalizeAuthorityMode } from '../../../../../lib/authority-mode';
import { ensureCentralPaymentTables, verifyRazorpayCheckoutSignature, writePaymentAudit } from '../../../../../lib/razorpay';
import { confirmCentralHoldAfterPayment, confirmForwardedLocalHoldAfterPayment } from '../../../../../lib/payment-confirmation';
import { getPublicSession } from '../../../../../lib/public-auth';
import { sendTicketConfirmationEmail } from '../../../../../lib/email/ses';
import { getBookingAuthorityDecision } from '../../../../../lib/booking-authority';

export const dynamic = 'force-dynamic';

type VerifyPayload = {
  holdId?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

async function sendTicketEmailIfPossible(bookingId: string, email: string) {
  try {
    const [[booking]] = await getCentralDbPool().query<RowDataPacket[]>(
      `SELECT b.id, b.total_amount AS totalAmount, m.title AS movieTitle, t.name AS theatreName,
              sc.name AS screenName, s.show_time AS showTime
       FROM central_bookings b
       JOIN shows s ON s.id = b.show_id
       JOIN movies m ON m.id = s.movie_id
       JOIN theatres t ON t.id = s.theatre_id
       JOIN screens sc ON sc.id = s.screen_id
       WHERE b.id = ?
       LIMIT 1`,
      [bookingId]
    );
    if (!booking) return;
    const [items] = await getCentralDbPool().query<RowDataPacket[]>(
      'SELECT seat_id AS seatId, zone, amount FROM central_booking_items WHERE booking_id = ? ORDER BY zone, seat_id',
      [bookingId]
    );
    const grouped = new Map<string, { zone: string; seats: string[]; amount: number }>();
    for (const item of items) {
      const zone = String(item.zone);
      const group = grouped.get(zone) ?? { zone, seats: [], amount: 0 };
      group.seats.push(String(item.seatId));
      group.amount += Number(item.amount ?? 0);
      grouped.set(zone, group);
    }
    await sendTicketConfirmationEmail({
      email,
      bookingId,
      movieTitle: String(booking.movieTitle),
      theatreName: String(booking.theatreName),
      screenName: String(booking.screenName),
      showTime: new Date(booking.showTime).toLocaleString('en-IN'),
      seatsByZone: Array.from(grouped.values()),
      totalAmount: Number(booking.totalAmount ?? 0),
      ticketUrl: process.env.NEXT_PUBLIC_CENTRAL_APP_URL ? `${process.env.NEXT_PUBLIC_CENTRAL_APP_URL.replace(/\/$/, '')}/ticket/${bookingId}` : undefined
    });
  } catch (error) {
    console.warn('[public-ticket-email] ticket confirmation email failed', error);
  }
}

export async function POST(request: NextRequest) {
  await ensureCentralPaymentTables();
  const payload = await request.json().catch(() => ({})) as VerifyPayload;
  const publicSession = await getPublicSession();
  const holdId = payload.holdId?.trim();
  const orderId = payload.razorpay_order_id?.trim();
  const paymentRef = payload.razorpay_payment_id?.trim();
  const signature = payload.razorpay_signature?.trim();

  if (!holdId || !orderId || !paymentRef || !signature) {
    return NextResponse.json({ success: false, error: 'holdId, razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.' }, { status: 400 });
  }

  const [[payment]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT id, booking_id AS bookingId, hold_id AS holdId, show_id AS showId, status, provider_order_id AS orderId
     FROM payments
     WHERE hold_id = ? AND provider_order_id = ? AND provider = 'RAZORPAY'
     ORDER BY created_at DESC
     LIMIT 1`,
    [holdId, orderId]
  );
  if (!payment) {
    return NextResponse.json({ success: false, error: 'Razorpay order is not mapped to this hold.' }, { status: 404 });
  }

  if (payment.bookingId) {
    const [[booking]] = await getCentralDbPool().query<RowDataPacket[]>('SELECT id, total_amount AS totalAmount FROM central_bookings WHERE id = ? LIMIT 1', [payment.bookingId]);
    if (booking) {
      return NextResponse.json({ success: true, bookingId: String(booking.id), totalAmount: Number(booking.totalAmount), idempotent: true });
    }
  }

  if (!verifyRazorpayCheckoutSignature({ orderId, paymentId: paymentRef, signature })) {
    await getCentralDbPool().query(
      `UPDATE payments
       SET status = 'FAILED', provider_payment_id = ?, provider_signature = ?
       WHERE id = ?`,
      [paymentRef, signature, payment.id]
    );
    await writePaymentAudit({ paymentId: String(payment.id), holdId, showId: String(payment.showId), action: 'RAZORPAY_SIGNATURE_FAILED', provider: 'RAZORPAY', providerOrderId: orderId, providerPaymentId: paymentRef, status: 'FAILED' });
    return NextResponse.json({ success: false, error: 'Invalid Razorpay payment signature.' }, { status: 400 });
  }

  await getCentralDbPool().query(
    `UPDATE payments
     SET status = 'CAPTURED', provider_payment_id = ?, provider_signature = ?, provider_reference = ?
     WHERE id = ?`,
    [paymentRef, signature, paymentRef, payment.id]
  );
  await writePaymentAudit({ paymentId: String(payment.id), holdId, showId: String(payment.showId), action: 'RAZORPAY_PAYMENT_CAPTURED', provider: 'RAZORPAY', providerOrderId: orderId, providerPaymentId: paymentRef, status: 'CAPTURED' });

  const [[hold]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT h.show_id AS showId, h.customer_name AS customerName, s.theatre_id AS theatreId,
            s.authority_mode AS authorityMode, s.status AS showStatus
     FROM central_seat_holds h
     JOIN shows s ON s.id = h.show_id
     WHERE h.id = ?
     LIMIT 1`,
    [holdId]
  );
  if (!hold) {
    await getCentralDbPool().query("UPDATE payments SET status = 'NEEDS_MANUAL_REVIEW' WHERE id = ?", [payment.id]);
    return NextResponse.json({ success: false, error: 'Payment captured, but hold was not found. Manual review required.' }, { status: 409 });
  }

  const decision = await getBookingAuthorityDecision({
    showId: String(hold.showId),
    theatreId: String(hold.theatreId),
    authorityMode: hold.authorityMode,
    status: hold.showStatus,
    allowExistingHoldAfterCutoff: true
  });
  const authorityMode = normalizeAuthorityMode(decision?.authorityMode ?? hold.authorityMode);

  if (!decision?.publicBookingAllowed) {
    await getCentralDbPool().query("UPDATE payments SET status = 'NEEDS_MANUAL_REVIEW' WHERE id = ?", [payment.id]);
    await writePaymentAudit({
      paymentId: String(payment.id),
      holdId,
      showId: String(hold.showId),
      action: 'RAZORPAY_CAPTURED_MANUAL_REVIEW',
      provider: 'RAZORPAY',
      providerOrderId: orderId,
      providerPaymentId: paymentRef,
      status: 'NEEDS_MANUAL_REVIEW',
      metadata: { authorityMode, authorityDecision: decision }
    });
    return NextResponse.json({
      success: false,
      status: 'NEEDS_MANUAL_REVIEW',
      message: 'Payment was received, but the theatre could not confirm your seats. Our team will review this booking.'
    }, { status: 409 });
  }

  const common = {
    paymentRowId: String(payment.id),
    holdId,
    showId: String(hold.showId),
    customerName: hold.customerName ? String(hold.customerName) : null,
    idempotencyKey: `razorpay-${orderId}`,
    paymentMode: 'RAZORPAY',
    paymentProvider: 'RAZORPAY',
    paymentRef,
    providerOrderId: orderId,
    providerSignature: signature,
    publicUserId: publicSession?.userId ?? null,
    customerEmail: publicSession?.email ?? null
  };
  const result = authorityMode === 'LOCAL_AUTHORITY_ONLINE'
    ? await confirmForwardedLocalHoldAfterPayment(common)
    : await confirmCentralHoldAfterPayment(common);

  if (!result.ok) {
    if (result.body.error !== 'SEAT_NOT_AVAILABLE') {
      await getCentralDbPool().query("UPDATE payments SET status = 'NEEDS_MANUAL_REVIEW' WHERE id = ?", [payment.id]);
    }
    await writePaymentAudit({ paymentId: String(payment.id), holdId, showId: String(hold.showId), action: 'RAZORPAY_CONFIRM_FAILED', provider: 'RAZORPAY', providerOrderId: orderId, providerPaymentId: paymentRef, status: 'NEEDS_MANUAL_REVIEW', metadata: result.body });
    return NextResponse.json({ success: false, ...result.body }, { status: result.status });
  }

  await writePaymentAudit({ paymentId: String(payment.id), holdId, showId: String(hold.showId), action: 'RAZORPAY_BOOKING_CONFIRMED', provider: 'RAZORPAY', providerOrderId: orderId, providerPaymentId: paymentRef, status: 'CAPTURED', metadata: { bookingId: result.bookingId, forwardedToLocal: result.forwardedToLocal } });
  if (publicSession?.email) {
    await sendTicketEmailIfPossible(result.bookingId, publicSession.email);
  }
  return NextResponse.json({ success: true, ...result });
}
