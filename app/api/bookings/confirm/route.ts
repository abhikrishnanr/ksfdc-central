import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getCentralDbPool } from '../../../../lib/db';
import { ensureCentralMirrorEventsTable, getNextCentralMirrorSequence } from '../../../../lib/sync';
import { LocalTheatreApiError, LOCAL_THEATRE_ERROR_MESSAGES, confirmLocalHold } from '../../../../lib/local-theatre-client';
import { normalizeAuthorityMode } from '../../../../lib/authority-mode';
import { allowSimulatedPaymentFallback } from '../../../../lib/razorpay';
import { getPublicSession } from '../../../../lib/public-auth';
import { authorityUnavailablePayload, getBookingAuthorityDecision } from '../../../../lib/booking-authority';

interface ConfirmPayload {
  holdId?: string;
  showId?: string;
  customerName?: string;
  simulatePayment?: boolean;
}

type HoldItem = RowDataPacket & {
  seatId: string;
  zone: string;
  amount: number;
};

function localApiResponse(error: LocalTheatreApiError) {
  if (error.code !== 'SEAT_NOT_AVAILABLE') {
    return NextResponse.json(authorityUnavailablePayload(null), { status: error.status >= 500 ? 503 : 409 });
  }
  return NextResponse.json({ error: LOCAL_THEATRE_ERROR_MESSAGES[error.code] ?? error.message, code: error.code }, { status: error.status === 500 ? 502 : error.status });
}

function returningToCentralResponse() {
  const message = 'Booking is temporarily paused while theatre sync is completing.';
  return NextResponse.json({ error: message, reason: 'RETURNING_TO_CENTRAL', message }, { status: 409 });
}

async function writeCentralBookingMirror(input: {
  bookingId: string;
  holdId: string;
  showId: string;
  theatreId: string;
  idempotencyKey: string;
  customerName: string | null;
  items: HoldItem[];
  paymentProviderReference: string;
  publicUserId?: string | null;
  customerEmail?: string | null;
}) {
  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();

    const [[existingBooking]] = await connection.query<RowDataPacket[]>('SELECT id, total_amount AS totalAmount FROM central_bookings WHERE show_id = ? AND idempotency_key = ? FOR UPDATE', [input.showId, input.idempotencyKey]);
    if (existingBooking) {
      await connection.commit();
      return { bookingId: String(existingBooking.id), totalAmount: Number(existingBooking.totalAmount), idempotent: true };
    }

    const totalAmount = input.items.reduce((sum, item) => sum + Number(item.amount), 0);
    await connection.query('INSERT INTO central_bookings (id, show_id, hold_id, idempotency_key, customer_name, customer_email, public_user_id, channel, status, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [input.bookingId, input.showId, input.holdId, input.idempotencyKey, input.customerName, input.customerEmail ?? null, input.publicUserId ?? null, 'PUBLIC', 'CONFIRMED', totalAmount]);
    for (const item of input.items) {
      await connection.query('INSERT INTO central_booking_items (booking_id, show_id, seat_id, zone, amount) VALUES (?, ?, ?, ?, ?)', [input.bookingId, input.showId, item.seatId, item.zone, item.amount]);
      await connection.query('INSERT INTO central_confirmed_seats (show_id, seat_id, booking_id, channel, amount) VALUES (?, ?, ?, ?, ?)', [input.showId, item.seatId, input.bookingId, 'PUBLIC', item.amount]);
    }
    await connection.query('INSERT INTO payments (id, booking_id, provider, provider_reference, amount, status) VALUES (?, ?, ?, ?, ?, ?)', [`PAY_${randomUUID()}`, input.bookingId, 'LOCAL_THEATRE_API', input.paymentProviderReference, totalAmount, 'SUCCESS']);
    await connection.query("UPDATE central_seat_holds SET status = 'CONFIRMED' WHERE id = ?", [input.holdId]);
    const mirrorPayload = {
      localBookingId: input.bookingId,
      bookingId: input.bookingId,
      showId: input.showId,
      amount: totalAmount,
      channel: 'LOCAL_THEATRE_API',
      issuedAt: new Date().toISOString(),
      seats: input.items.map((item) => String(item.seatId))
    };
    await connection.query(
      `INSERT INTO central_mirror_events (event_id, sequence_no, theatre_id, show_id, event_type, payload)
       VALUES (?, ?, ?, ?, 'LOCAL_BOOKING_CONFIRMED_MIRROR', ?)`,
      [randomUUID(), await getNextCentralMirrorSequence(connection), input.theatreId, input.showId, JSON.stringify(mirrorPayload)]
    );

    await connection.commit();
    return { bookingId: input.bookingId, totalAmount, idempotent: false };
  } catch (error) {
    await connection.rollback();
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ER_DUP_ENTRY') {
      const [[existingBooking]] = await getCentralDbPool().query<RowDataPacket[]>('SELECT id, total_amount AS totalAmount FROM central_bookings WHERE show_id = ? AND idempotency_key = ? LIMIT 1', [input.showId, input.idempotencyKey]);
      if (existingBooking) return { bookingId: String(existingBooking.id), totalAmount: Number(existingBooking.totalAmount), idempotent: true };
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function confirmForwardedLocalBooking(
  holdId: string,
  explicitShowId: string | undefined,
  customerName: string | undefined,
  idempotencyKey: string,
  publicSession: Awaited<ReturnType<typeof getPublicSession>>
) {
  const [[hold]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT h.id, h.show_id AS showId, h.status, h.expires_at AS expiresAt, h.customer_name AS customerName,
            s.theatre_id AS theatreId, s.authority_mode AS authorityMode, s.status AS showStatus
     FROM central_seat_holds h
     JOIN shows s ON s.id = h.show_id
     WHERE h.id = ?
     LIMIT 1`,
    [holdId]
  );
  if (!hold) return NextResponse.json({ error: 'Hold not found.' }, { status: 404 });

  const showId = explicitShowId ?? String(hold.showId);
  const decision = await getBookingAuthorityDecision({
    showId,
    theatreId: String(hold.theatreId),
    authorityMode: hold.authorityMode,
    status: hold.showStatus
  });
  const authorityMode = normalizeAuthorityMode(decision?.authorityMode ?? hold.authorityMode);
  if (authorityMode === 'RETURNING_TO_CENTRAL') {
    return returningToCentralResponse();
  }
  if (showId !== String(hold.showId) || authorityMode !== 'LOCAL_AUTHORITY_ONLINE' || String(hold.showStatus) !== 'OPEN' || !decision?.publicBookingAllowed) {
    return NextResponse.json(authorityUnavailablePayload(decision), { status: authorityMode === 'LOCAL_AUTHORITY_ONLINE' ? 503 : 409 });
  }
  if (String(hold.status) === 'CONFIRMED') {
    const [[booking]] = await getCentralDbPool().query<RowDataPacket[]>('SELECT id, total_amount AS totalAmount FROM central_bookings WHERE hold_id = ? LIMIT 1', [holdId]);
    if (booking) return NextResponse.json({ bookingId: booking.id, totalAmount: Number(booking.totalAmount), idempotent: true, forwardedToLocal: true, simulatedPayment: true });
  }

  const [items] = await getCentralDbPool().query<HoldItem[]>('SELECT seat_id AS seatId, zone, amount FROM central_seat_hold_items WHERE hold_id = ?', [holdId]);
  if (!items.length) return NextResponse.json({ error: 'Hold has no mirrored seats.' }, { status: 409 });

  try {
    const payload = await confirmLocalHold(holdId, showId, idempotencyKey);
    const mirror = await writeCentralBookingMirror({
      bookingId: payload.bookingId,
      holdId,
      showId,
      theatreId: String(hold.theatreId),
      idempotencyKey,
      customerName: customerName ?? (hold.customerName ? String(hold.customerName) : null),
      items,
      paymentProviderReference: idempotencyKey,
      publicUserId: publicSession?.userId ?? null,
      customerEmail: publicSession?.email ?? null
    });
    return NextResponse.json({ bookingId: mirror.bookingId, totalAmount: mirror.totalAmount, idempotent: payload.idempotent || mirror.idempotent, forwardedToLocal: true, simulatedPayment: true });
  } catch (error) {
    if (error instanceof LocalTheatreApiError) return localApiResponse(error);
    return NextResponse.json(authorityUnavailablePayload(decision), { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  await ensureCentralMirrorEventsTable();
  const payload = await request.json() as ConfirmPayload;
  const publicSession = await getPublicSession();
  const idempotencyKey = request.headers.get('idempotency-key') ?? `confirm-${payload.holdId ?? randomUUID()}`;

  if (!payload.holdId) {
    return NextResponse.json({ error: 'holdId is required.' }, { status: 400 });
  }
  if (!allowSimulatedPaymentFallback()) {
    return NextResponse.json({ error: 'Simulated payment confirmation is disabled. Use Razorpay Checkout.' }, { status: 403 });
  }

  if (payload.holdId.startsWith('HOLD-') || payload.holdId.startsWith('HOLD_LOCAL_')) {
    return confirmForwardedLocalBooking(payload.holdId, payload.showId, payload.customerName, idempotencyKey, publicSession);
  }

  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();

    const [[existingBooking]] = await connection.query<RowDataPacket[]>('SELECT id, total_amount AS totalAmount FROM central_bookings WHERE idempotency_key = ? FOR UPDATE', [idempotencyKey]);
    if (existingBooking) {
      await connection.commit();
      return NextResponse.json({ bookingId: existingBooking.id, totalAmount: Number(existingBooking.totalAmount), idempotent: true });
    }

    const [[hold]] = await connection.query<RowDataPacket[]>('SELECT id, show_id AS showId, status, expires_at AS expiresAt, customer_name AS customerName FROM central_seat_holds WHERE id = ? FOR UPDATE', [payload.holdId]);
    if (!hold) {
      await connection.rollback();
      return NextResponse.json({ error: 'Hold not found.' }, { status: 404 });
    }
    if (hold.status === 'CONFIRMED') {
      const [[booking]] = await connection.query<RowDataPacket[]>('SELECT id, total_amount AS totalAmount FROM central_bookings WHERE hold_id = ? LIMIT 1', [payload.holdId]);
      await connection.commit();
      return NextResponse.json({ bookingId: booking?.id, totalAmount: Number(booking?.totalAmount ?? 0), idempotent: true });
    }
    if (hold.status !== 'ACTIVE' || new Date(hold.expiresAt).getTime() <= Date.now()) {
      await connection.rollback();
      return NextResponse.json({ error: 'Hold is not active or has expired.' }, { status: 409 });
    }

    const [[show]] = await connection.query<RowDataPacket[]>('SELECT id, theatre_id, authority_mode AS authorityMode, status FROM shows WHERE id = ? FOR UPDATE', [hold.showId]);
    const decision = show ? await getBookingAuthorityDecision({
      showId: String(hold.showId),
      theatreId: String(show.theatre_id),
      authorityMode: show.authorityMode,
      status: show.status
    }) : null;
    const authorityMode = normalizeAuthorityMode(decision?.authorityMode ?? show?.authorityMode);
    if (authorityMode === 'RETURNING_TO_CENTRAL') {
      await connection.rollback();
      return returningToCentralResponse();
    }
    if (!show || show.status !== 'OPEN' || authorityMode !== 'CENTRAL_AUTHORITY' || !decision?.centralCanConfirm) {
      await connection.rollback();
      return NextResponse.json({ error: 'Central confirmation is allowed only while this show is under CENTRAL_AUTHORITY.' }, { status: 409 });
    }
    const [items] = await connection.query<HoldItem[]>('SELECT seat_id AS seatId, zone, amount FROM central_seat_hold_items WHERE hold_id = ? FOR UPDATE', [payload.holdId]);
    if (!items.length) {
      await connection.rollback();
      return NextResponse.json({ error: 'Hold has no seats.' }, { status: 409 });
    }

    const seatIds = items.map((item) => item.seatId);
    const [soldRows] = await connection.query<RowDataPacket[]>('SELECT seat_id AS seatId FROM central_confirmed_seats WHERE show_id = ? AND seat_id IN (?) FOR UPDATE', [hold.showId, seatIds]);
    if (soldRows.length) {
      await connection.rollback();
      return NextResponse.json({ error: 'SEAT_NOT_AVAILABLE', seats: soldRows.map((row) => row.seatId) }, { status: 409 });
    }

    const bookingId = `BOOKING_${randomUUID()}`;
    const totalAmount = items.reduce((sum, item) => sum + Number(item.amount), 0);
    await connection.query('INSERT INTO central_bookings (id, show_id, hold_id, idempotency_key, customer_name, customer_email, public_user_id, channel, status, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [bookingId, hold.showId, payload.holdId, idempotencyKey, payload.customerName ?? hold.customerName ?? null, publicSession?.email ?? null, publicSession?.userId ?? null, 'PUBLIC', 'CONFIRMED', totalAmount]);
    for (const item of items) {
      await connection.query('INSERT INTO central_booking_items (booking_id, show_id, seat_id, zone, amount) VALUES (?, ?, ?, ?, ?)', [bookingId, hold.showId, item.seatId, item.zone, item.amount]);
      await connection.query('INSERT INTO central_confirmed_seats (show_id, seat_id, booking_id, channel, amount) VALUES (?, ?, ?, ?, ?)', [hold.showId, item.seatId, bookingId, 'PUBLIC', item.amount]);
    }
    await connection.query('INSERT INTO payments (id, booking_id, provider, provider_reference, amount, status) VALUES (?, ?, ?, ?, ?, ?)', [`PAY_${randomUUID()}`, bookingId, 'SIMULATED', payload.simulatePayment ? 'SIMULATED_SUCCESS' : 'MANUAL_SUCCESS', totalAmount, 'SUCCESS']);
    await connection.query("UPDATE central_seat_holds SET status = 'CONFIRMED' WHERE id = ?", [payload.holdId]);
    const mirrorPayload = {
      bookingId,
      showId: hold.showId,
      amount: totalAmount,
      channel: 'KSFDC_PUBLIC',
      issuedAt: new Date().toISOString(),
      seats: items.map((item) => String(item.seatId))
    };
    await connection.query(
      `INSERT INTO central_mirror_events (event_id, sequence_no, theatre_id, show_id, event_type, payload)
       VALUES (?, ?, ?, ?, 'CENTRAL_BOOKING_CONFIRMED', ?)`,
      [randomUUID(), await getNextCentralMirrorSequence(connection), 'TH_TVM001', hold.showId, JSON.stringify(mirrorPayload)]
    );

    await connection.commit();
    return NextResponse.json({ bookingId, totalAmount, simulatedPayment: true });
  } catch (error) {
    await connection.rollback();
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'SEAT_NOT_AVAILABLE' }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to confirm booking.' }, { status: 500 });
  } finally {
    connection.release();
  }
}
