import { randomUUID } from 'crypto';
import { RowDataPacket } from 'mysql2';
import { getCentralDbPool } from './db';
import { normalizeAuthorityMode } from './authority-mode';
import { ensureCentralMirrorEventsTable, getNextCentralMirrorSequence } from './sync';
import { LocalTheatreApiError, confirmLocalHold } from './local-theatre-client';
import { authorityUnavailablePayload, getBookingAuthorityDecision, PUBLIC_LOCAL_UNAVAILABLE_MESSAGE } from './booking-authority';

type HoldItem = RowDataPacket & {
  seatId: string;
  zone: string;
  amount: number;
};

export type PaymentConfirmationInput = {
  paymentRowId: string;
  holdId: string;
  showId?: string;
  customerName?: string | null;
  idempotencyKey: string;
  paymentMode: string;
  paymentProvider: string;
  paymentRef: string;
  providerOrderId?: string | null;
  providerSignature?: string | null;
  publicUserId?: string | null;
  customerEmail?: string | null;
};

function returningToCentralResult() {
  return {
    ok: false as const,
    status: 409,
    body: {
      error: 'Booking is temporarily paused while theatre sync is completing.',
      reason: 'RETURNING_TO_CENTRAL',
      message: 'Booking is temporarily paused while theatre sync is completing.'
    }
  };
}

export async function confirmCentralHoldAfterPayment(input: PaymentConfirmationInput) {
  await ensureCentralMirrorEventsTable();
  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();

    const [[payment]] = await connection.query<RowDataPacket[]>(
      'SELECT id, booking_id AS bookingId FROM payments WHERE id = ? FOR UPDATE',
      [input.paymentRowId]
    );
    if (payment?.bookingId) {
      const [[booking]] = await connection.query<RowDataPacket[]>(
        'SELECT id, total_amount AS totalAmount FROM central_bookings WHERE id = ? LIMIT 1',
        [payment.bookingId]
      );
      await connection.commit();
      return { ok: true as const, bookingId: String(booking.id), totalAmount: Number(booking.totalAmount), idempotent: true, forwardedToLocal: false };
    }

    const [[existingBooking]] = await connection.query<RowDataPacket[]>(
      'SELECT id, total_amount AS totalAmount FROM central_bookings WHERE idempotency_key = ? FOR UPDATE',
      [input.idempotencyKey]
    );
    if (existingBooking) {
      await connection.query(
        `UPDATE payments
         SET booking_id = ?, status = 'CAPTURED', provider_payment_id = ?, provider_order_id = COALESCE(?, provider_order_id),
             provider_signature = COALESCE(?, provider_signature), provider_reference = ?
         WHERE id = ?`,
        [existingBooking.id, input.paymentRef, input.providerOrderId ?? null, input.providerSignature ?? null, input.paymentRef, input.paymentRowId]
      );
      await connection.commit();
      return { ok: true as const, bookingId: String(existingBooking.id), totalAmount: Number(existingBooking.totalAmount), idempotent: true, forwardedToLocal: false };
    }

    const [[hold]] = await connection.query<RowDataPacket[]>(
      `SELECT h.id, h.show_id AS showId, h.status, h.expires_at AS expiresAt, h.customer_name AS customerName,
              s.theatre_id AS theatreId, s.authority_mode AS authorityMode, s.status AS showStatus
       FROM central_seat_holds h
       JOIN shows s ON s.id = h.show_id
       WHERE h.id = ?
       FOR UPDATE`,
      [input.holdId]
    );
    if (!hold) {
      await connection.rollback();
      return { ok: false as const, status: 404, body: { error: 'Hold not found.' } };
    }
    if (input.showId && input.showId !== String(hold.showId)) {
      await connection.rollback();
      return { ok: false as const, status: 409, body: { error: 'Hold does not belong to this show.' } };
    }
    const decision = await getBookingAuthorityDecision({
      showId: String(hold.showId),
      theatreId: String(hold.theatreId),
      authorityMode: hold.authorityMode,
      status: hold.showStatus
    });
    const authorityMode = normalizeAuthorityMode(decision?.authorityMode ?? hold.authorityMode);
    if (authorityMode === 'RETURNING_TO_CENTRAL') {
      await connection.rollback();
      return returningToCentralResult();
    }
    if (String(hold.showStatus) !== 'OPEN' || authorityMode !== 'CENTRAL_AUTHORITY' || !decision?.centralCanConfirm) {
      await connection.rollback();
      return { ok: false as const, status: 409, body: { error: 'Central confirmation is allowed only while this show is under CENTRAL_AUTHORITY.' } };
    }
    if (String(hold.status) === 'CONFIRMED') {
      const [[booking]] = await connection.query<RowDataPacket[]>('SELECT id, total_amount AS totalAmount FROM central_bookings WHERE hold_id = ? LIMIT 1', [input.holdId]);
      if (booking) {
        await connection.query('UPDATE payments SET booking_id = ?, status = ? WHERE id = ?', [booking.id, 'CAPTURED', input.paymentRowId]);
        await connection.commit();
        return { ok: true as const, bookingId: String(booking.id), totalAmount: Number(booking.totalAmount), idempotent: true, forwardedToLocal: false };
      }
    }
    if (String(hold.status) !== 'ACTIVE' || new Date(hold.expiresAt).getTime() <= Date.now()) {
      await connection.rollback();
      return { ok: false as const, status: 409, body: { error: 'Hold is not active or has expired.' } };
    }

    const [items] = await connection.query<HoldItem[]>('SELECT seat_id AS seatId, zone, amount FROM central_seat_hold_items WHERE hold_id = ? FOR UPDATE', [input.holdId]);
    if (!items.length) {
      await connection.rollback();
      return { ok: false as const, status: 409, body: { error: 'Hold has no seats.' } };
    }

    const seatIds = items.map((item) => item.seatId);
    const [soldRows] = await connection.query<RowDataPacket[]>('SELECT seat_id AS seatId FROM central_confirmed_seats WHERE show_id = ? AND seat_id IN (?) FOR UPDATE', [hold.showId, seatIds]);
    if (soldRows.length) {
      await connection.rollback();
      return { ok: false as const, status: 409, body: { error: 'SEAT_NOT_AVAILABLE', seats: soldRows.map((row) => row.seatId) } };
    }

    const bookingId = `BOOKING_${randomUUID()}`;
    const totalAmount = items.reduce((sum, item) => sum + Number(item.amount), 0);
    await connection.query(
      'INSERT INTO central_bookings (id, show_id, hold_id, idempotency_key, customer_name, customer_email, public_user_id, channel, status, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [bookingId, hold.showId, input.holdId, input.idempotencyKey, input.customerName ?? hold.customerName ?? null, input.customerEmail ?? null, input.publicUserId ?? null, 'PUBLIC', 'CONFIRMED', totalAmount]
    );
    for (const item of items) {
      await connection.query('INSERT INTO central_booking_items (booking_id, show_id, seat_id, zone, amount) VALUES (?, ?, ?, ?, ?)', [bookingId, hold.showId, item.seatId, item.zone, item.amount]);
      await connection.query('INSERT INTO central_confirmed_seats (show_id, seat_id, booking_id, channel, amount) VALUES (?, ?, ?, ?, ?)', [hold.showId, item.seatId, bookingId, 'PUBLIC', item.amount]);
    }
    await connection.query("UPDATE central_seat_holds SET status = 'CONFIRMED' WHERE id = ?", [input.holdId]);
    await connection.query(
      `UPDATE payments
       SET booking_id = ?, status = 'CAPTURED', payment_mode = ?, provider = ?, provider_reference = ?,
           provider_payment_id = ?, provider_order_id = COALESCE(?, provider_order_id), provider_signature = COALESCE(?, provider_signature)
       WHERE id = ?`,
      [bookingId, input.paymentMode, input.paymentProvider, input.paymentRef, input.paymentRef, input.providerOrderId ?? null, input.providerSignature ?? null, input.paymentRowId]
    );

    const mirrorPayload = {
      bookingId,
      showId: String(hold.showId),
      amount: totalAmount,
      channel: 'KSFDC_PUBLIC',
      paymentMode: input.paymentMode,
      paymentProvider: input.paymentProvider,
      paymentRef: input.paymentRef,
      razorpayOrderId: input.providerOrderId ?? null,
      issuedAt: new Date().toISOString(),
      seats: items.map((item) => String(item.seatId))
    };
    await connection.query(
      `INSERT INTO central_mirror_events (event_id, sequence_no, theatre_id, show_id, event_type, payload)
       VALUES (?, ?, ?, ?, 'CENTRAL_BOOKING_CONFIRMED', ?)`,
      [randomUUID(), await getNextCentralMirrorSequence(connection), String(hold.theatreId), String(hold.showId), JSON.stringify(mirrorPayload)]
    );

    await connection.commit();
    return { ok: true as const, bookingId, totalAmount, idempotent: false, forwardedToLocal: false };
  } catch (error) {
    await connection.rollback();
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ER_DUP_ENTRY') {
      return { ok: false as const, status: 409, body: { error: 'SEAT_NOT_AVAILABLE' } };
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function confirmForwardedLocalHoldAfterPayment(input: PaymentConfirmationInput) {
  await ensureCentralMirrorEventsTable();

  const [[payment]] = await getCentralDbPool().query<RowDataPacket[]>('SELECT booking_id AS bookingId FROM payments WHERE id = ? LIMIT 1', [input.paymentRowId]);
  if (payment?.bookingId) {
    const [[booking]] = await getCentralDbPool().query<RowDataPacket[]>('SELECT id, total_amount AS totalAmount FROM central_bookings WHERE id = ? LIMIT 1', [payment.bookingId]);
    if (booking) return { ok: true as const, bookingId: String(booking.id), totalAmount: Number(booking.totalAmount), idempotent: true, forwardedToLocal: true };
  }

  const [[hold]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT h.id, h.show_id AS showId, h.status, h.expires_at AS expiresAt, h.customer_name AS customerName,
            s.theatre_id AS theatreId, s.authority_mode AS authorityMode, s.status AS showStatus
     FROM central_seat_holds h
     JOIN shows s ON s.id = h.show_id
     WHERE h.id = ?
     LIMIT 1`,
    [input.holdId]
  );
  if (!hold) return { ok: false as const, status: 404, body: { error: 'Hold not found.' } };
  if (input.showId && input.showId !== String(hold.showId)) return { ok: false as const, status: 409, body: { error: 'Hold does not belong to this show.' } };

  const decision = await getBookingAuthorityDecision({
    showId: String(hold.showId),
    theatreId: String(hold.theatreId),
    authorityMode: hold.authorityMode,
    status: hold.showStatus
  });
  const authorityMode = normalizeAuthorityMode(decision?.authorityMode ?? hold.authorityMode);
  if (authorityMode === 'RETURNING_TO_CENTRAL') return returningToCentralResult();
  if (authorityMode !== 'LOCAL_AUTHORITY_ONLINE' || String(hold.showStatus) !== 'OPEN' || !decision?.publicBookingAllowed) {
    return { ok: false as const, status: authorityMode === 'LOCAL_AUTHORITY_ONLINE' ? 503 : 409, body: authorityUnavailablePayload(decision) };
  }
  if (String(hold.status) === 'CONFIRMED') {
    const [[booking]] = await getCentralDbPool().query<RowDataPacket[]>('SELECT id, total_amount AS totalAmount FROM central_bookings WHERE hold_id = ? LIMIT 1', [input.holdId]);
    if (booking) {
      await getCentralDbPool().query('UPDATE payments SET booking_id = ?, status = ? WHERE id = ?', [booking.id, 'CAPTURED', input.paymentRowId]);
      return { ok: true as const, bookingId: String(booking.id), totalAmount: Number(booking.totalAmount), idempotent: true, forwardedToLocal: true };
    }
  }
  if (String(hold.status) !== 'ACTIVE' || new Date(hold.expiresAt).getTime() <= Date.now()) {
    return { ok: false as const, status: 409, body: { error: 'Hold is not active or has expired.' } };
  }

  const [items] = await getCentralDbPool().query<HoldItem[]>('SELECT seat_id AS seatId, zone, amount FROM central_seat_hold_items WHERE hold_id = ?', [input.holdId]);
  if (!items.length) return { ok: false as const, status: 409, body: { error: 'Hold has no mirrored seats.' } };

  try {
    const local = await confirmLocalHold(input.holdId, String(hold.showId), input.paymentRef, {
      paymentMode: input.paymentMode,
      paymentProvider: input.paymentProvider,
      paymentRef: input.paymentRef,
      razorpayOrderId: input.providerOrderId ?? undefined
    });

    const connection = await getCentralDbPool().getConnection();
    try {
      await connection.beginTransaction();
      const [[existingBooking]] = await connection.query<RowDataPacket[]>('SELECT id, total_amount AS totalAmount FROM central_bookings WHERE hold_id = ? FOR UPDATE', [input.holdId]);
      if (existingBooking) {
        await connection.query('UPDATE payments SET booking_id = ?, status = ? WHERE id = ?', [existingBooking.id, 'CAPTURED', input.paymentRowId]);
        await connection.commit();
        return { ok: true as const, bookingId: String(existingBooking.id), totalAmount: Number(existingBooking.totalAmount), idempotent: true, forwardedToLocal: true };
      }

      const totalAmount = items.reduce((sum, item) => sum + Number(item.amount), 0);
      await connection.query(
        'INSERT INTO central_bookings (id, show_id, hold_id, idempotency_key, customer_name, customer_email, public_user_id, channel, status, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [local.bookingId, String(hold.showId), input.holdId, input.idempotencyKey, input.customerName ?? hold.customerName ?? null, input.customerEmail ?? null, input.publicUserId ?? null, 'PUBLIC', 'CONFIRMED', totalAmount]
      );
      for (const item of items) {
        await connection.query('INSERT INTO central_booking_items (booking_id, show_id, seat_id, zone, amount) VALUES (?, ?, ?, ?, ?)', [local.bookingId, String(hold.showId), item.seatId, item.zone, item.amount]);
        await connection.query(
          'INSERT INTO central_confirmed_seats (show_id, seat_id, booking_id, channel, amount) VALUES (?, ?, ?, ?, ?)',
          [String(hold.showId), item.seatId, local.bookingId, 'PUBLIC', item.amount]
        );
      }
      await connection.query("UPDATE central_seat_holds SET status = 'CONFIRMED' WHERE id = ?", [input.holdId]);
      await connection.query(
        `UPDATE payments
         SET booking_id = ?, status = 'CAPTURED', payment_mode = ?, provider = ?, provider_reference = ?,
             provider_payment_id = ?, provider_order_id = COALESCE(?, provider_order_id), provider_signature = COALESCE(?, provider_signature)
         WHERE id = ?`,
        [local.bookingId, input.paymentMode, input.paymentProvider, input.paymentRef, input.paymentRef, input.providerOrderId ?? null, input.providerSignature ?? null, input.paymentRowId]
      );
      const mirrorPayload = {
        localBookingId: local.bookingId,
        bookingId: local.bookingId,
        showId: String(hold.showId),
        amount: totalAmount,
        channel: 'LOCAL_THEATRE_API',
        paymentMode: input.paymentMode,
        paymentProvider: input.paymentProvider,
        paymentRef: input.paymentRef,
        razorpayOrderId: input.providerOrderId ?? null,
        issuedAt: new Date().toISOString(),
        seats: items.map((item) => String(item.seatId))
      };
      await connection.query(
        `INSERT INTO central_mirror_events (event_id, sequence_no, theatre_id, show_id, event_type, payload)
         VALUES (?, ?, ?, ?, 'LOCAL_BOOKING_CONFIRMED_MIRROR', ?)`,
        [randomUUID(), await getNextCentralMirrorSequence(connection), String(hold.theatreId), String(hold.showId), JSON.stringify(mirrorPayload)]
      );
      await connection.commit();
      return { ok: true as const, bookingId: local.bookingId, totalAmount, idempotent: Boolean(local.idempotent), forwardedToLocal: true };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof LocalTheatreApiError) {
      if (error.code === 'SEAT_NOT_AVAILABLE') {
        return { ok: false as const, status: 409, body: { error: 'SEAT_NOT_AVAILABLE', code: error.code } };
      }
      return { ok: false as const, status: error.status >= 500 ? 503 : 409, body: { success: false, error: 'SHOW_TEMPORARILY_UNAVAILABLE', message: PUBLIC_LOCAL_UNAVAILABLE_MESSAGE, code: error.code } };
    }
    return { ok: false as const, status: 503, body: { success: false, error: 'SHOW_TEMPORARILY_UNAVAILABLE', message: PUBLIC_LOCAL_UNAVAILABLE_MESSAGE } };
  }
}
