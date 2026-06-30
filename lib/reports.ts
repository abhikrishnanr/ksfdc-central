import { RowDataPacket } from 'mysql2/promise';
import { getAuthorityReturnStatus } from './authority-return';
import { getCentralDbPool } from './db';
import { ensureCentralHeartbeatTables, ensureCentralMirrorEventsTable, ensureCentralSyncInbox } from './sync';

export type ReconciliationStatus =
  | 'OK'
  | 'PENDING_SYNC'
  | 'SEAT_CONFLICT'
  | 'MISSING_LOCAL_EVENT'
  | 'MISSING_CENTRAL_MIRROR'
  | 'SEQUENCE_GAP'
  | 'UNKNOWN';

type LocalEventSeat = {
  eventId: string;
  sequenceNo: number;
  bookingId: string;
  seatId: string;
  payload: Record<string, unknown>;
};

function asNumber(value: unknown) {
  return Number(value ?? 0);
}

function toIso(value: unknown) {
  return value ? new Date(value as string | Date).toISOString() : null;
}

function parseJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  try {
    return JSON.parse(String(value)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function eventSeats(row: RowDataPacket): LocalEventSeat[] {
  const payload = parseJson(row.payload);
  const seats = Array.isArray(payload.seats) ? payload.seats : [];
  const bookingId = String(payload.localBookingId ?? payload.bookingId ?? `LOCAL_MIRROR_${row.eventId}`);
  return seats
    .map((seat) => typeof seat === 'string' ? { seatId: seat } : seat as { seatId?: unknown })
    .filter((seat) => seat.seatId)
    .map((seat) => ({
      eventId: String(row.eventId),
      sequenceNo: Number(row.sequenceNo),
      bookingId,
      seatId: String(seat.seatId),
      payload
    }));
}

export async function getCentralSyncStatus(theatreId?: string | null) {
  await ensureCentralHeartbeatTables();
  await ensureCentralSyncInbox();
  const [rows] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT hb.theatre_id AS theatreId, hb.theatre_code AS theatreCode, hb.last_seen_at AS lastHeartbeatAt,
            TIMESTAMPDIFF(SECOND, hb.last_seen_at, NOW()) AS secondsSinceLastHeartbeat,
            hb.status, hb.pending_local_events AS pendingSyncEvents, hb.failed_local_events AS failedSyncEvents,
            hb.last_local_sequence AS lastLocalSequence, COALESCE(MAX(ci.source_sequence_no), 0) AS lastSyncedSequence,
            hb.trusted_for_admin_sync AS trustedHeartbeat
     FROM theatre_heartbeats hb
     LEFT JOIN central_sync_inbox ci ON ci.theatre_id = hb.theatre_id
     ${theatreId ? 'WHERE hb.theatre_id = ?' : ''}
     GROUP BY hb.theatre_id, hb.theatre_code, hb.last_seen_at, hb.status, hb.pending_local_events,
              hb.failed_local_events, hb.last_local_sequence, hb.trusted_for_admin_sync
     ORDER BY hb.last_seen_at DESC`,
    theatreId ? [theatreId] : []
  );

  return rows.map((row) => {
    const secondsSinceLastHeartbeat = row.secondsSinceLastHeartbeat == null ? null : Number(row.secondsSinceLastHeartbeat);
    const trustedHeartbeat = Boolean(row.trustedHeartbeat);
    const consideredOnline = String(row.status) === 'ONLINE' && secondsSinceLastHeartbeat !== null && secondsSinceLastHeartbeat <= 60;
    const lastLocalSequence = asNumber(row.lastLocalSequence);
    const lastSyncedSequence = asNumber(row.lastSyncedSequence);
    const syncLag = Math.max(lastLocalSequence - lastSyncedSequence, 0);
    const blockingIssues: string[] = [];
    if (!trustedHeartbeat) blockingIssues.push('UNTRUSTED_HEARTBEAT');
    if (!consideredOnline) blockingIssues.push('THEATRE_OFFLINE_OR_STALE');
    if (asNumber(row.pendingSyncEvents) > 0) blockingIssues.push('PENDING_SYNC');
    if (asNumber(row.failedSyncEvents) > 0) blockingIssues.push('FAILED_SYNC');
    if (syncLag > 0) blockingIssues.push('SEQUENCE_LAG');

    return {
      theatreId: String(row.theatreId),
      theatreCode: row.theatreCode ? String(row.theatreCode) : null,
      lastHeartbeatAt: toIso(row.lastHeartbeatAt),
      secondsSinceLastHeartbeat,
      consideredOnline,
      pendingSyncEvents: asNumber(row.pendingSyncEvents),
      failedSyncEvents: asNumber(row.failedSyncEvents),
      lastLocalSequence,
      lastSyncedSequence,
      syncLag,
      trustedHeartbeat,
      blockingIssues
    };
  });
}

export async function getCentralRevenueReport(theatreId?: string | null) {
  await ensureCentralSyncInbox();
  const paymentScope = theatreId ? ' AND EXISTS (SELECT 1 FROM shows scoped_show WHERE scoped_show.id = p.show_id AND scoped_show.theatre_id = ?)' : '';
  const bookingScope = theatreId ? ' AND s.theatre_id = ?' : '';
  const paymentParams = theatreId ? [theatreId] : [];
  const bookingParams = theatreId ? [theatreId] : [];
  const [paymentRows, channelRows, showRows, theatreRows] = await Promise.all([
    getCentralDbPool().query<RowDataPacket[]>(
      `SELECT provider, payment_mode AS paymentMode, channel, status, COUNT(*) AS payments, COALESCE(SUM(amount), 0) AS amount
       FROM payments p
       WHERE DATE(p.created_at) = CURRENT_DATE()${paymentScope}
       GROUP BY provider, payment_mode, channel, status
       ORDER BY channel, payment_mode, status`,
      paymentParams
    ).then(([rows]) => rows).catch(() => [] as RowDataPacket[]),
    getCentralDbPool().query<RowDataPacket[]>(
      `SELECT channel, COUNT(*) AS bookings, COALESCE(SUM(total_amount), 0) AS revenue
       FROM central_bookings b
       JOIN shows s ON s.id = b.show_id
       WHERE DATE(b.created_at) = CURRENT_DATE() AND b.status = 'CONFIRMED'${bookingScope}
       GROUP BY channel`,
      bookingParams
    ).then(([rows]) => rows),
    getCentralDbPool().query<RowDataPacket[]>(
      `SELECT b.show_id AS showId, m.title AS movieTitle, COUNT(*) AS bookings, COALESCE(SUM(b.total_amount), 0) AS revenue
       FROM central_bookings b
       JOIN shows s ON s.id = b.show_id
       JOIN movies m ON m.id = s.movie_id
       WHERE DATE(b.created_at) = CURRENT_DATE() AND b.status = 'CONFIRMED'${bookingScope}
       GROUP BY b.show_id, m.title
       ORDER BY b.show_id`,
      bookingParams
    ).then(([rows]) => rows),
    getCentralDbPool().query<RowDataPacket[]>(
      `SELECT s.theatre_id AS theatreId, t.name AS theatreName, COUNT(*) AS bookings, COALESCE(SUM(b.total_amount), 0) AS revenue
       FROM central_bookings b
       JOIN shows s ON s.id = b.show_id
       JOIN theatres t ON t.id = s.theatre_id
       WHERE DATE(b.created_at) = CURRENT_DATE() AND b.status = 'CONFIRMED'${bookingScope}
       GROUP BY s.theatre_id, t.name
       ORDER BY s.theatre_id`,
      bookingParams
    ).then(([rows]) => rows)
  ]);

  const byChannel = {
    CENTRAL: { bookings: 0, revenue: 0 },
    LOCAL_SYNCED: { bookings: 0, revenue: 0 },
    AGENT: { bookings: 0, revenue: 0 }
  };
  for (const row of channelRows) {
    const channel = String(row.channel);
    const key = channel === 'COUNTER' ? 'LOCAL_SYNCED' : channel === 'AGENT' ? 'AGENT' : 'CENTRAL';
    byChannel[key].bookings += asNumber(row.bookings);
    byChannel[key].revenue += asNumber(row.revenue);
  }

  return {
    byChannel,
    byPaymentMode: paymentRows.map((row) => ({
      provider: String(row.provider ?? 'UNKNOWN'),
      paymentMode: String(row.paymentMode ?? 'UNKNOWN'),
      channel: String(row.channel ?? 'UNKNOWN'),
      status: String(row.status ?? 'UNKNOWN'),
      payments: asNumber(row.payments),
      amount: asNumber(row.amount)
    })),
    pendingOrFailedRazorpay: paymentRows
      .filter((row) => String(row.provider) === 'RAZORPAY' && !['CAPTURED', 'SUCCESS', 'COLLECTED'].includes(String(row.status)))
      .map((row) => ({
        paymentMode: String(row.paymentMode ?? 'RAZORPAY'),
        status: String(row.status ?? 'UNKNOWN'),
        payments: asNumber(row.payments),
        amount: asNumber(row.amount)
      })),
    showWise: showRows.map((row) => ({ showId: String(row.showId), movieTitle: String(row.movieTitle), bookings: asNumber(row.bookings), revenue: asNumber(row.revenue) })),
    theatreWise: theatreRows.map((row) => ({ theatreId: String(row.theatreId), theatreName: String(row.theatreName), bookings: asNumber(row.bookings), revenue: asNumber(row.revenue) }))
  };
}

export async function getReconciliationDetail(showId: string, theatreIdScope?: string | null) {
  await ensureCentralHeartbeatTables();
  await ensureCentralSyncInbox();
  await ensureCentralMirrorEventsTable();
  const [[show]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT s.id AS showId, s.theatre_id AS theatreId, s.authority_mode AS authorityMode, m.title AS movieTitle
     FROM shows s JOIN movies m ON m.id = s.movie_id
     WHERE s.id = ?${theatreIdScope ? ' AND s.theatre_id = ?' : ''} LIMIT 1`,
    theatreIdScope ? [showId, theatreIdScope] : [showId]
  );
  if (!show) {
    return {
      showId,
      theatreId: null,
      authorityMode: null,
      movieTitle: null,
      status: 'UNKNOWN' as ReconciliationStatus,
      centralSoldSeats: [],
      localSyncedSoldSeats: [],
      conflicts: [],
      missingSeats: [],
      missingLocalEvents: [],
      duplicateAttempts: [],
      sequenceGaps: [],
      pendingEvents: 0,
      failedEvents: 0,
      blockingReasons: ['SHOW_NOT_FOUND']
    };
  }

  const theatreId = String(show.theatreId);
  const [centralSeats, localEventRows, conflictRows, heartbeatRows, syncedSequenceRows] = await Promise.all([
    getCentralDbPool().query<RowDataPacket[]>(
      `SELECT seat_id AS seatId, booking_id AS bookingId, channel, amount
       FROM central_confirmed_seats
       WHERE show_id = ?
       ORDER BY seat_id`,
      [showId]
    ).then(([rows]) => rows),
    getCentralDbPool().query<RowDataPacket[]>(
      `SELECT event_id AS eventId, sequence_no AS sequenceNo, payload
       FROM central_received_local_events
       WHERE theatre_id = ? AND show_id = ? AND event_type = 'BOOKING_CREATED'
       ORDER BY sequence_no`,
      [theatreId, showId]
    ).then(([rows]) => rows),
    getCentralDbPool().query<RowDataPacket[]>(
      `SELECT event_id AS eventId, source_sequence_no AS sequenceNo, show_id AS showId, seat_id AS seatId,
              existing_booking_id AS existingBookingId, incoming_booking_id AS incomingBookingId,
              conflict_type AS conflictType, error_message AS errorMessage, created_at AS createdAt
       FROM central_sync_conflicts
       WHERE show_id = ?
       ORDER BY created_at DESC`,
      [showId]
    ).then(([rows]) => rows),
    getCentralDbPool().query<RowDataPacket[]>(
      `SELECT pending_local_events AS pendingEvents, failed_local_events AS failedEvents, last_local_sequence AS lastLocalSequence
       FROM theatre_heartbeats
       WHERE theatre_id = ? AND trusted_for_admin_sync = 1
       ORDER BY last_seen_at DESC
       LIMIT 1`,
      [theatreId]
    ).then(([rows]) => rows),
    getCentralDbPool().query<RowDataPacket[]>(
      'SELECT COALESCE(MAX(source_sequence_no), 0) AS lastSyncedSequence FROM central_sync_inbox WHERE theatre_id = ?',
      [theatreId]
    ).then(([rows]) => rows)
  ]);
  const [heartbeat] = heartbeatRows;
  const [syncedSequence] = syncedSequenceRows;

  const centralBySeat = new Map(centralSeats.map((seat) => [String(seat.seatId), String(seat.bookingId)]));
  const centralByBooking = new Set(centralSeats.map((seat) => String(seat.bookingId)));
  const eventSeatRows = localEventRows.flatMap(eventSeats);
  const localSyncedSoldSeats = eventSeatRows.map((seat) => ({
    eventId: seat.eventId,
    sequenceNo: seat.sequenceNo,
    seatId: seat.seatId,
    bookingId: seat.bookingId
  }));
  const missingSeats = eventSeatRows
    .filter((seat) => centralBySeat.get(seat.seatId) !== seat.bookingId)
    .map((seat) => ({ seatId: seat.seatId, bookingId: seat.bookingId, eventId: seat.eventId }));
  const duplicateAttempts = centralSeats
    .filter((seat) => String(seat.channel) === 'COUNTER' && !centralByBooking.has(String(seat.bookingId)))
    .map((seat) => ({ seatId: String(seat.seatId), bookingId: String(seat.bookingId) }));
  const localEventBookingIds = new Set(eventSeatRows.map((seat) => seat.bookingId));
  const missingLocalEvents = centralSeats
    .filter((seat) => String(seat.channel) === 'COUNTER' && !localEventBookingIds.has(String(seat.bookingId)))
    .map((seat) => ({ seatId: String(seat.seatId), bookingId: String(seat.bookingId) }));
  const lastLocalSequence = asNumber(heartbeat?.lastLocalSequence);
  const lastSyncedSequence = asNumber(syncedSequence?.lastSyncedSequence);
  const sequenceGaps = lastLocalSequence > lastSyncedSequence
    ? [{ lastLocalSequence, lastSyncedSequence, gap: lastLocalSequence - lastSyncedSequence }]
    : [];
  const pendingEvents = asNumber(heartbeat?.pendingEvents);
  const failedEvents = asNumber(heartbeat?.failedEvents);
  const conflicts = conflictRows.map((row) => ({
    eventId: String(row.eventId),
    sequenceNo: asNumber(row.sequenceNo),
    showId: String(row.showId),
    seatId: String(row.seatId),
    existingBookingId: row.existingBookingId ? String(row.existingBookingId) : null,
    incomingBookingId: row.incomingBookingId ? String(row.incomingBookingId) : null,
    conflictType: String(row.conflictType),
    errorMessage: row.errorMessage ? String(row.errorMessage) : null,
    createdAt: toIso(row.createdAt)
  }));

  const blockingReasons: string[] = [];
  let status: ReconciliationStatus = 'OK';
  if (conflicts.length) {
    status = 'SEAT_CONFLICT';
    blockingReasons.push('SEAT_CONFLICT');
  } else if (pendingEvents > 0 || failedEvents > 0) {
    status = 'PENDING_SYNC';
    if (pendingEvents > 0) blockingReasons.push('PENDING_SYNC');
    if (failedEvents > 0) blockingReasons.push('FAILED_SYNC');
  } else if (missingSeats.length) {
    status = 'MISSING_CENTRAL_MIRROR';
    blockingReasons.push('MISSING_CENTRAL_MIRROR');
  } else if (missingLocalEvents.length) {
    status = 'MISSING_LOCAL_EVENT';
    blockingReasons.push('MISSING_LOCAL_EVENT');
  } else if (sequenceGaps.length) {
    status = 'SEQUENCE_GAP';
    blockingReasons.push('SEQUENCE_GAP');
  }

  let returnStatus = null;
  if (String(show.authorityMode) === 'RETURNING_TO_CENTRAL') {
    returnStatus = await getAuthorityReturnStatus(showId, theatreId);
    if (!returnStatus.canReturnToCentral) blockingReasons.push(...returnStatus.blockingReasons);
  }

  return {
    showId,
    theatreId,
    authorityMode: String(show.authorityMode),
    movieTitle: String(show.movieTitle),
    status,
    centralSoldSeats: centralSeats.map((seat) => ({ seatId: String(seat.seatId), bookingId: String(seat.bookingId), channel: String(seat.channel), amount: asNumber(seat.amount) })),
    localSyncedSoldSeats,
    conflicts,
    missingSeats,
    missingLocalEvents,
    duplicateAttempts,
    sequenceGaps,
    pendingEvents,
    failedEvents,
    lastLocalSequence,
    lastSyncedSequence,
    blockingReasons,
    returnStatus
  };
}

export async function getReconciliationReport(theatreId?: string | null) {
  const [shows] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT id AS showId FROM shows WHERE DATE(show_time) = CURRENT_DATE()${theatreId ? ' AND theatre_id = ?' : ''} ORDER BY show_time`,
    theatreId ? [theatreId] : []
  );
  const details = await Promise.all(shows.map((show) => getReconciliationDetail(String(show.showId), theatreId)));
  return details.map((detail) => ({
    showId: detail.showId,
    theatreId: detail.theatreId,
    authorityMode: detail.authorityMode,
    movieTitle: detail.movieTitle,
    status: detail.status,
    centralSoldCount: detail.centralSoldSeats.length,
    localSyncedSoldCount: detail.localSyncedSoldSeats.length,
    conflictCount: detail.conflicts.length,
    missingMirrorCount: detail.missingSeats.length,
    missingLocalEventCount: detail.missingLocalEvents.length,
    pendingEvents: detail.pendingEvents,
    failedEvents: detail.failedEvents,
    sequenceGap: detail.sequenceGaps[0]?.gap ?? 0,
    blockingReasons: detail.blockingReasons
  }));
}

export function reconciliationCsv(rows: Awaited<ReturnType<typeof getReconciliationReport>>) {
  const header = ['showId', 'theatreId', 'authorityMode', 'status', 'centralSoldCount', 'localSyncedSoldCount', 'conflictCount', 'missingMirrorCount', 'missingLocalEventCount', 'pendingEvents', 'failedEvents', 'sequenceGap', 'blockingReasons'];
  const escape = (value: unknown) => `"${String(Array.isArray(value) ? value.join('|') : value ?? '').replace(/"/g, '""')}"`;
  return [header.join(','), ...rows.map((row) => header.map((key) => escape(row[key as keyof typeof row])).join(','))].join('\n');
}
