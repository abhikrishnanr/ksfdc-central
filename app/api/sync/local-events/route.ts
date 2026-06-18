import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getCentralDbPool } from '../../../../lib/db';
import { ensureCentralSyncInbox } from '../../../../lib/sync';
import { verifyCentralSyncRequest } from '../../../../lib/sync-security';
import { ensureCentralPaymentTables } from '../../../../lib/razorpay';

export const dynamic = 'force-dynamic';

type IncomingEvent = {
  eventId?: string;
  sequenceNo?: number;
  theatreId?: string;
  showId?: string | null;
  eventType?: string;
  payload?: {
    localBookingId?: string;
    bookingId?: string;
    showId?: string;
    counterId?: string;
    channel?: string;
    amount?: number;
    totalAmount?: number;
    paymentMode?: string;
    paymentProvider?: string;
    paymentStatus?: string;
    paymentRef?: string;
    razorpayOrderId?: string;
    seats?: Array<{ seatId?: string; zone?: string; amount?: number }>;
    issuedAt?: string;
    createdAt?: string;
  };
};

type EventResult = {
  eventId: string;
  sequenceNo: number;
  status: 'ACCEPTED' | 'FAILED';
  error?: string;
  seatId?: string;
};

type SeatConflictDetails = {
  showId: string;
  seatId: string;
  existingBookingId: string;
  incomingBookingId: string;
};

async function importBookingCreated(connection: PoolConnection, event: Required<Pick<IncomingEvent, 'eventId' | 'sequenceNo' | 'eventType'>> & IncomingEvent) {
  const payload = event.payload;
  const showId = payload?.showId ?? event.showId ?? null;
  if (!showId) throw new Error('INVALID_EVENT:showId is required');

  const seats = Array.isArray(payload?.seats) ? payload.seats.filter((seat) => seat.seatId) : [];
  if (!seats.length) throw new Error('INVALID_EVENT:at least one seat is required');

  const bookingId = payload?.localBookingId ?? payload?.bookingId ?? `LOCAL_MIRROR_${randomUUID()}`;
  const seatIds = seats.map((seat) => String(seat.seatId));
  const [soldRows] = await connection.query<RowDataPacket[]>(
    'SELECT seat_id AS seatId, booking_id AS bookingId FROM central_confirmed_seats WHERE show_id = ? AND seat_id IN (?) FOR UPDATE',
    [showId, seatIds]
  );

  const conflictingSeat = soldRows.find((row) => String(row.bookingId) !== bookingId);
  if (conflictingSeat) {
    throw new Error(`SEAT_CONFLICT:${showId}:${String(conflictingSeat.seatId)}:${String(conflictingSeat.bookingId)}:${bookingId}`);
  }

  const totalAmount = Number(payload?.amount ?? payload?.totalAmount ?? seats.reduce((sum, seat) => sum + Number(seat.amount ?? 0), 0));
  await connection.query(
    `INSERT INTO central_bookings (id, show_id, idempotency_key, customer_name, channel, status, total_amount)
     VALUES (?, ?, ?, ?, 'COUNTER', 'CONFIRMED', ?)
     ON DUPLICATE KEY UPDATE total_amount = VALUES(total_amount), status = 'CONFIRMED'`,
    [bookingId, showId, `local-event-${event.eventId}`, payload?.counterId ?? 'Local counter', totalAmount]
  );

  await connection.query(
    `INSERT IGNORE INTO central_booking_items (booking_id, show_id, seat_id, zone, amount)
     VALUES ?`,
    [seats.map((seat) => [bookingId, showId, seat.seatId, seat.zone ?? 'SILVER', Number(seat.amount ?? 0)])]
  );
  await connection.query(
    `INSERT IGNORE INTO central_confirmed_seats (show_id, seat_id, booking_id, channel, amount)
     VALUES ?`,
    [seats.map((seat) => [showId, seat.seatId, bookingId, 'COUNTER', Number(seat.amount ?? 0)])]
  );
  await connection.query(
    `INSERT INTO payments
       (id, booking_id, hold_id, show_id, provider, payment_mode, provider_reference, provider_order_id,
        provider_payment_id, amount, currency, status, authority_mode_at_order, channel, counter_code)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, 'LOCAL_SYNCED', 'COUNTER', ?)
     ON DUPLICATE KEY UPDATE
       provider = VALUES(provider), payment_mode = VALUES(payment_mode), provider_reference = VALUES(provider_reference),
       provider_order_id = VALUES(provider_order_id), provider_payment_id = VALUES(provider_payment_id),
       amount = VALUES(amount), status = VALUES(status), counter_code = VALUES(counter_code)`,
    [
      `PAY_LOCAL_${bookingId}`,
      bookingId,
      showId,
      String(payload?.paymentProvider ?? 'LOCAL_COUNTER'),
      String(payload?.paymentMode ?? 'CASH'),
      payload?.paymentRef ?? null,
      payload?.razorpayOrderId ?? null,
      payload?.paymentMode === 'RAZORPAY' || payload?.paymentMode === 'RAZORPAY_QR' ? payload?.paymentRef ?? null : null,
      totalAmount,
      String(payload?.paymentStatus ?? 'COLLECTED'),
      payload?.counterId ?? null
    ]
  );

  return true;
}

function parseSeatConflict(message: string): SeatConflictDetails | null {
  if (!message.startsWith('SEAT_CONFLICT:')) return null;
  const [, showId, seatId, existingBookingId, incomingBookingId] = message.split(':');
  if (!showId || !seatId) return null;
  return {
    showId,
    seatId,
    existingBookingId: existingBookingId ?? 'UNKNOWN',
    incomingBookingId: incomingBookingId ?? 'UNKNOWN'
  };
}

async function recordSyncConflict(connection: PoolConnection, theatreId: string, event: IncomingEvent, message: string) {
  const conflict = parseSeatConflict(message);
  if (!conflict || !event.eventId || !event.sequenceNo) return;
  await connection.query(
    `INSERT INTO central_sync_conflicts (
       event_id, theatre_id, source_sequence_no, show_id, seat_id,
       existing_booking_id, incoming_booking_id, conflict_type, error_message, payload
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, 'SEAT_CONFLICT', ?, ?)
     ON DUPLICATE KEY UPDATE error_message = VALUES(error_message), payload = VALUES(payload)`,
    [
      event.eventId,
      theatreId,
      event.sequenceNo,
      conflict.showId,
      conflict.seatId,
      conflict.existingBookingId,
      conflict.incomingBookingId,
      message,
      JSON.stringify(event.payload ?? {})
    ]
  );
}

export async function POST(request: NextRequest) {
  await ensureCentralSyncInbox();
  await ensureCentralPaymentTables();
  const rawBody = await request.text();
  const securityError = await verifyCentralSyncRequest(request, rawBody);
  if (securityError) return securityError;

  const body = rawBody ? JSON.parse(rawBody) : {};
  const theatreId = typeof body?.theatreId === 'string' && body.theatreId.trim() ? body.theatreId.trim() : null;
  if (!theatreId) {
    return NextResponse.json({ success: false, error: 'theatreId is required.' }, { status: 400 });
  }

  const events = Array.isArray(body?.events) ? body.events.map((event: IncomingEvent) => ({ ...event, theatreId })) as IncomingEvent[] : [];
  const connection = await getCentralDbPool().getConnection();
  let lastAcceptedSequenceNo = 0;
  const acceptedEventIds: string[] = [];
  const failedEvents: EventResult[] = [];
  const results: EventResult[] = [];

  try {
    for (const event of events) {
      if (!event.eventId || !event.sequenceNo || !event.eventType) {
        const failedEvent: EventResult = {
          eventId: event.eventId ?? 'UNKNOWN',
          sequenceNo: Number(event.sequenceNo ?? 0),
          status: 'FAILED',
          error: 'INVALID_EVENT:eventId, sequenceNo, and eventType are required'
        };
        failedEvents.push(failedEvent);
        results.push(failedEvent);
        continue;
      }

      await connection.beginTransaction();
      try {
        const [[existingInbox]] = await connection.query<RowDataPacket[]>(
          'SELECT source_sequence_no AS sourceSequenceNo FROM central_sync_inbox WHERE theatre_id = ? AND event_id = ? FOR UPDATE',
          [theatreId, event.eventId]
        );

        if (existingInbox) {
          await connection.commit();
          lastAcceptedSequenceNo = Math.max(lastAcceptedSequenceNo, Number(existingInbox.sourceSequenceNo));
          acceptedEventIds.push(event.eventId);
          results.push({ eventId: event.eventId, sequenceNo: Number(event.sequenceNo), status: 'ACCEPTED' });
          continue;
        }

        if (event.eventType === 'BOOKING_CREATED') {
          await importBookingCreated(connection, event as Required<Pick<IncomingEvent, 'eventId' | 'sequenceNo' | 'eventType'>> & IncomingEvent);
        }

        await connection.query(
          `INSERT INTO central_sync_inbox (event_id, theatre_id, source_sequence_no, event_type, payload)
           VALUES (?, ?, ?, ?, ?)`,
          [event.eventId, theatreId, event.sequenceNo, event.eventType, JSON.stringify(event.payload ?? {})]
        );

        await connection.commit();
        lastAcceptedSequenceNo = Math.max(lastAcceptedSequenceNo, Number(event.sequenceNo));
        acceptedEventIds.push(event.eventId);
        results.push({ eventId: event.eventId, sequenceNo: Number(event.sequenceNo), status: 'ACCEPTED' });
      } catch (error) {
        await connection.rollback();
        const message = error instanceof Error ? error.message : 'Unable to import event.';
        await recordSyncConflict(connection, theatreId, event, message);
        const failedEvent: EventResult = {
          eventId: event.eventId,
          sequenceNo: Number(event.sequenceNo),
          status: 'FAILED',
          error: message.startsWith('SEAT_CONFLICT:') ? 'SEAT_CONFLICT' : message
        };
        if (message.startsWith('SEAT_CONFLICT:')) failedEvent.seatId = message.split(':')[2];
        failedEvents.push(failedEvent);
        results.push(failedEvent);
      }
    }

    const status = failedEvents.length ? 207 : 200;
    return NextResponse.json({
      success: failedEvents.length === 0,
      acceptedSequenceNo: lastAcceptedSequenceNo,
      acceptedEventIds,
      failedEvents,
      results,
      acceptedAt: new Date().toISOString()
    }, { status });
  } finally {
    connection.release();
  }
}
