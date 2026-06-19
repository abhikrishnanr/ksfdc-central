import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getCentralDbPool } from '../../../../lib/db';
import { LocalTheatreApiError, LOCAL_THEATRE_ERROR_MESSAGES, holdSeatsInLocal } from '../../../../lib/local-theatre-client';
import { normalizeAuthorityMode } from '../../../../lib/authority-mode';
import { getPublicSession, publicOtpEnabled } from '../../../../lib/public-auth';
import { authorityUnavailablePayload, getBookingAuthorityDecision } from '../../../../lib/booking-authority';
import { ensureCentralSeatItemKeys } from '../../../../lib/sync';

interface HoldPayload {
  showId?: string;
  seatIds?: string[];
  customerName?: string;
}

type CentralSeatMirrorRow = RowDataPacket & {
  seatId: string;
  zone: string;
  amount: number;
  isBlocked: boolean | number;
  itemType: string;
};

function localApiResponse(error: LocalTheatreApiError) {
  if (error.code !== 'SEAT_NOT_AVAILABLE' && error.code !== 'NO_SEATS_SELECTED') {
    return NextResponse.json(authorityUnavailablePayload(null), { status: error.status >= 500 ? 503 : 409 });
  }
  return NextResponse.json({ error: LOCAL_THEATRE_ERROR_MESSAGES[error.code] ?? error.message, code: error.code }, { status: error.status === 500 ? 502 : error.status });
}

function publicHoldSeconds() {
  const value = Number(process.env.PUBLIC_SEAT_HOLD_SECONDS ?? process.env.SEAT_HOLD_SECONDS ?? 600);
  if (!Number.isFinite(value) || value < 20) return 600;
  return Math.min(Math.floor(value), 15 * 60);
}

async function getSeatMirrorRows(showId: string, layoutId: string, seatIds: string[]) {
  const [seatRows] = await getCentralDbPool().query<CentralSeatMirrorRow[]>(`
    SELECT sls.seat_id AS seatId, sls.zone_code AS zone, sp.amount, sls.is_blocked AS isBlocked, sls.item_type AS itemType
    FROM seat_layout_seats sls
    JOIN show_pricing sp ON sp.show_id = ? AND sp.zone_code = sls.zone_code
    WHERE sls.layout_id = ? AND sls.item_type IN ('SEAT','BLOCKED') AND sls.seat_id IN (?)
  `, [showId, layoutId, seatIds]);

  return seatRows;
}

async function mirrorLocalHold(input: {
  holdId: string;
  showId: string;
  layoutId: string;
  seatIds: string[];
  idempotencyKey: string;
  customerName: string | null;
  expiresAt: string;
  seatRows?: CentralSeatMirrorRow[];
}) {
  const seatRows = input.seatRows ?? await getSeatMirrorRows(input.showId, input.layoutId, input.seatIds);
  if (seatRows.length !== input.seatIds.length || seatRows.some((seat) => Boolean(seat.isBlocked) || seat.itemType === 'BLOCKED')) {
    throw new Error('Unable to mirror local hold because one or more seats are not present in the central layout mirror.');
  }

  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO central_seat_holds (id, show_id, idempotency_key, customer_name, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at), status = IF(status = 'CONFIRMED', status, 'ACTIVE')`,
      [input.holdId, input.showId, input.idempotencyKey, input.customerName, new Date(input.expiresAt)]
    );
    await connection.query(
      `INSERT INTO central_seat_hold_items (hold_id, show_id, seat_id, zone, amount)
       VALUES ?
       ON DUPLICATE KEY UPDATE zone = VALUES(zone), amount = VALUES(amount)`,
      [seatRows.map((seat) => [input.holdId, input.showId, seat.seatId, seat.zone, seat.amount])]
    );
    await connection.commit();

    return seatRows.reduce((sum, seat) => sum + Number(seat.amount), 0);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function POST(request: NextRequest) {
  await ensureCentralSeatItemKeys();
  const payload = await request.json() as HoldPayload;
  const showId = payload.showId;
  const seatIds = [...new Set(payload.seatIds ?? [])];
  const idempotencyKey = request.headers.get('idempotency-key') ?? `hold-${randomUUID()}`;
  const configuredHoldSeconds = publicHoldSeconds();

  if (!showId || !seatIds.length) {
    return NextResponse.json({ error: 'showId and at least one seatId are required.' }, { status: 400 });
  }

  const [preDecision, publicSession] = await Promise.all([
    getBookingAuthorityDecision({ showId }),
    getPublicSession()
  ]);
  if (!preDecision) {
    return NextResponse.json({ error: 'Show not found.' }, { status: 404 });
  }
  if (!preDecision.publicBookingAllowed) {
    return NextResponse.json(authorityUnavailablePayload(preDecision), { status: preDecision.authorityMode === 'LOCAL_AUTHORITY_ONLINE' ? 503 : 409 });
  }
  const holdSeconds = Math.max(1, Math.min(configuredHoldSeconds, preDecision.bookingSecondsRemaining ?? configuredHoldSeconds));

  if (publicOtpEnabled() && !publicSession) {
    return NextResponse.json({
      error: 'Please verify your email to continue.',
      reason: 'PUBLIC_EMAIL_VERIFICATION_REQUIRED'
    }, { status: 401 });
  }
  const customerName = publicSession?.email ?? payload.customerName ?? null;

  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();

    const [[existing]] = await connection.query<RowDataPacket[]>('SELECT id, expires_at AS expiresAt FROM central_seat_holds WHERE show_id = ? AND idempotency_key = ? FOR UPDATE', [showId, idempotencyKey]);
    if (existing) {
      await connection.commit();
      return NextResponse.json({ holdId: existing.id, expiresAt: new Date(existing.expiresAt).toISOString(), idempotent: true });
    }

    const [[show]] = await connection.query<RowDataPacket[]>('SELECT id, theatre_id AS theatreId, layout_id AS layoutId, authority_mode AS authorityMode, status FROM shows WHERE id = ? FOR UPDATE', [showId]);
    if (!show) {
      await connection.rollback();
      return NextResponse.json({ error: 'Show not found.' }, { status: 404 });
    }
    const authorityUnchanged = preDecision.theatreId === String(show.theatreId)
      && preDecision.authorityMode === normalizeAuthorityMode(show.authorityMode);
    const decision = authorityUnchanged ? preDecision : await getBookingAuthorityDecision({
      showId,
      theatreId: String(show.theatreId),
      authorityMode: show.authorityMode,
      status: show.status
    });
    const authorityMode = normalizeAuthorityMode(decision?.authorityMode ?? show.authorityMode);
    if (!decision || show.status !== 'OPEN') {
      await connection.rollback();
      return NextResponse.json(authorityUnavailablePayload(decision), { status: 409 });
    }
    if (!decision.publicBookingAllowed) {
      await connection.rollback();
      return NextResponse.json(authorityUnavailablePayload(decision), { status: authorityMode === 'LOCAL_AUTHORITY_ONLINE' ? 503 : 409 });
    }

    if (decision.mustForwardToLocal) {
      await connection.rollback();
      try {
        const [localHold, seatRows] = await Promise.all([
          holdSeatsInLocal(showId, seatIds, 'CENTRAL_API', customerName ?? undefined, holdSeconds),
          getSeatMirrorRows(showId, String(show.layoutId), seatIds)
        ]);
        const totalAmount = await mirrorLocalHold({
          holdId: localHold.holdId,
          showId,
          layoutId: String(show.layoutId),
          seatIds: localHold.seatIds ?? seatIds,
          idempotencyKey,
          customerName,
          expiresAt: localHold.expiresAt,
          seatRows
        });
        return NextResponse.json({ holdId: localHold.holdId, expiresAt: localHold.expiresAt, expiresAtSeconds: holdSeconds, totalAmount, forwardedToLocal: true });
      } catch (error) {
        if (error instanceof LocalTheatreApiError) return localApiResponse(error);
        return NextResponse.json(authorityUnavailablePayload(decision), { status: 503 });
      }
    }

    if (!decision.centralCanHold || authorityMode !== 'CENTRAL_AUTHORITY') {
      await connection.rollback();
      return NextResponse.json(authorityUnavailablePayload(decision), { status: 409 });
    }

    const [seatRows] = await connection.query<CentralSeatMirrorRow[]>(`
      SELECT sls.seat_id AS seatId, sls.zone_code AS zone, sp.amount, sls.is_blocked AS isBlocked, sls.item_type AS itemType
      FROM seat_layout_seats sls
      JOIN show_pricing sp ON sp.show_id = ? AND sp.zone_code = sls.zone_code
      WHERE sls.layout_id = ? AND sls.item_type IN ('SEAT','BLOCKED') AND sls.seat_id IN (?)
      FOR UPDATE
    `, [showId, show.layoutId, seatIds]);

    if (seatRows.length !== seatIds.length || seatRows.some((seat) => Boolean(seat.isBlocked) || seat.itemType === 'BLOCKED')) {
      await connection.rollback();
      return NextResponse.json({ error: 'One or more selected seats are invalid or blocked.' }, { status: 409 });
    }

    const [soldRows] = await connection.query<RowDataPacket[]>('SELECT seat_id AS seatId FROM central_confirmed_seats WHERE show_id = ? AND seat_id IN (?) FOR UPDATE', [showId, seatIds]);
    if (soldRows.length) {
      await connection.rollback();
      return NextResponse.json({ error: 'SEAT_NOT_AVAILABLE', seats: soldRows.map((row) => row.seatId) }, { status: 409 });
    }

    const [heldRows] = await connection.query<RowDataPacket[]>(`
      SELECT hi.seat_id AS seatId
      FROM central_seat_hold_items hi
      JOIN central_seat_holds h ON h.id = hi.hold_id
      WHERE hi.show_id = ? AND hi.seat_id IN (?) AND h.status = 'ACTIVE' AND h.expires_at > NOW()
      FOR UPDATE
    `, [showId, seatIds]);
    if (heldRows.length) {
      await connection.rollback();
      return NextResponse.json({ error: 'SEAT_NOT_AVAILABLE', seats: heldRows.map((row) => row.seatId) }, { status: 409 });
    }

    const holdId = `HOLD_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + holdSeconds * 1000);
    await connection.query('INSERT INTO central_seat_holds (id, show_id, idempotency_key, customer_name, expires_at) VALUES (?, ?, ?, ?, ?)', [holdId, showId, idempotencyKey, customerName, expiresAt]);
    await connection.query(
      'INSERT INTO central_seat_hold_items (hold_id, show_id, seat_id, zone, amount) VALUES ?',
      [seatRows.map((seat) => [holdId, showId, seat.seatId, seat.zone, seat.amount])]
    );

    await connection.commit();
    return NextResponse.json({ holdId, expiresAt: expiresAt.toISOString(), expiresAtSeconds: holdSeconds, totalAmount: seatRows.reduce((sum, seat) => sum + Number(seat.amount), 0) });
  } catch (error) {
    await connection.rollback();
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to hold seats.' }, { status: 500 });
  } finally {
    connection.release();
  }
}
