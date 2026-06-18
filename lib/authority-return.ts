import { RowDataPacket } from 'mysql2/promise';
import { normalizeAuthorityMode } from './authority-mode';
import { getCentralDbPool } from './db';
import { getLocalAuthoritySyncStatus, LocalAuthoritySyncStatus, LocalTheatreApiError } from './local-theatre-client';
import { ensureCentralHeartbeatTables, ensureCentralSyncInbox, getTheatreHealth } from './sync';

export type AuthorityBlockingReason =
  | 'SHOW_NOT_FOUND'
  | 'THEATRE_ID_MISMATCH'
  | 'SHOW_NOT_IN_RETURNABLE_MODE'
  | 'LOCAL_NOT_REACHABLE'
  | 'PENDING_SYNC_EVENTS'
  | 'FAILED_SYNC_EVENTS'
  | 'LOCAL_SEQUENCE_NOT_ACKED'
  | 'CENTRAL_MIRROR_MISSING_LOCAL_SEATS'
  | 'CENTRAL_MIRROR_BOOKING_MISMATCH'
  | 'LOCAL_AUTHORITY_NOT_PAUSED';

export type AuthorityReturnStatus = {
  showId: string;
  theatreId: string | null;
  authorityMode: string | null;
  localReachable: boolean;
  pendingSync: number;
  failedSync: number;
  lastLocalSequence: number;
  lastSyncedSequence: number;
  canReturnToCentral: boolean;
  blockingReasons: AuthorityBlockingReason[];
  localAuthorityMode: string | null;
  missingMirrorSeats: string[];
  mismatchedMirrorSeats: string[];
};

const RETURNABLE_CENTRAL_MODES = new Set([
  'LOCAL_AUTHORITY_ONLINE',
  'LOCAL_AUTHORITY_OFFLINE',
  'LOCAL_SYNCING',
  'RETURNING_TO_CENTRAL',
  'CENTRAL_AUTHORITY'
]);

const LOCAL_PAUSED_MODES = new Set([
  'RETURNING_TO_CENTRAL',
  'LOCAL_SYNCING',
  'CENTRAL_AUTHORITY'
]);

function uniqueReasons(reasons: AuthorityBlockingReason[]) {
  return Array.from(new Set(reasons));
}

async function getCentralAcceptedSequence(theatreId: string, showId: string) {
  await ensureCentralSyncInbox();
  const [[row]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT COALESCE(MAX(source_sequence_no), 0) AS lastSyncedSequence
     FROM central_sync_inbox
     WHERE theatre_id = ?
       AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.showId')) = ?`,
    [theatreId, showId]
  );
  return Number(row.lastSyncedSequence ?? 0);
}

async function getCentralShow(showId: string) {
  const [[show]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT id AS showId, theatre_id AS theatreId, authority_mode AS authorityMode, status
     FROM shows
     WHERE id = ?
     LIMIT 1`,
    [showId]
  );
  return show ?? null;
}

async function getHeartbeatFallback(theatreId: string) {
  await ensureCentralHeartbeatTables();
  const [[row]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT authority_mode AS authorityMode, pending_local_events AS pendingSync, failed_local_events AS failedSync,
            last_local_sequence AS lastLocalSequence
     FROM theatre_heartbeats
     WHERE theatre_id = ?
     LIMIT 1`,
    [theatreId]
  );
  return row ?? null;
}

async function compareLocalSeatMirror(showId: string, localStatus: LocalAuthoritySyncStatus | null) {
  if (!localStatus) return { missingMirrorSeats: [] as string[], mismatchedMirrorSeats: [] as string[] };
  const localSeats = localStatus.confirmedSeats ?? [];
  if (!localSeats.length) return { missingMirrorSeats: [], mismatchedMirrorSeats: [] };

  const [centralSeats] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT seat_id AS seatId, booking_id AS bookingId
     FROM central_confirmed_seats
     WHERE show_id = ? AND seat_id IN (?)`,
    [showId, localSeats.map((seat) => seat.seatId)]
  );
  const centralBySeat = new Map(centralSeats.map((row) => [String(row.seatId), String(row.bookingId)]));
  const missingMirrorSeats: string[] = [];
  const mismatchedMirrorSeats: string[] = [];

  for (const seat of localSeats) {
    const mirroredBookingId = centralBySeat.get(seat.seatId);
    if (!mirroredBookingId) {
      missingMirrorSeats.push(seat.seatId);
    } else if (seat.bookingId && mirroredBookingId !== seat.bookingId) {
      mismatchedMirrorSeats.push(seat.seatId);
    }
  }

  return { missingMirrorSeats, mismatchedMirrorSeats };
}

export async function getAuthorityReturnStatus(showId: string, expectedTheatreId?: string): Promise<AuthorityReturnStatus> {
  const show = await getCentralShow(showId);
  if (!show) {
    return {
      showId,
      theatreId: expectedTheatreId ?? null,
      authorityMode: null,
      localReachable: false,
      pendingSync: 0,
      failedSync: 0,
      lastLocalSequence: 0,
      lastSyncedSequence: 0,
      canReturnToCentral: false,
      blockingReasons: ['SHOW_NOT_FOUND'],
      localAuthorityMode: null,
      missingMirrorSeats: [],
      mismatchedMirrorSeats: []
    };
  }

  const theatreId = String(show.theatreId);
  const authorityMode = normalizeAuthorityMode(show.authorityMode);
  const blockingReasons: AuthorityBlockingReason[] = [];
  if (expectedTheatreId && theatreId !== expectedTheatreId) blockingReasons.push('THEATRE_ID_MISMATCH');
  if (!RETURNABLE_CENTRAL_MODES.has(authorityMode)) blockingReasons.push('SHOW_NOT_IN_RETURNABLE_MODE');

  const lastSyncedSequence = await getCentralAcceptedSequence(theatreId, showId);
  let localStatus: LocalAuthoritySyncStatus | null = null;
  let localReachable = false;

  try {
    localStatus = await getLocalAuthoritySyncStatus(showId, theatreId, 'STATUS');
    localReachable = true;
  } catch (error) {
    if (!(error instanceof LocalTheatreApiError)) throw error;
  }

  let pendingSync = Number(localStatus?.pendingLocalEvents ?? 0);
  let failedSync = Number(localStatus?.failedLocalEvents ?? 0);
  let lastLocalSequence = Number(localStatus?.lastLocalSequence ?? 0);
  let localAuthorityMode = localStatus?.authorityMode ? normalizeAuthorityMode(localStatus.authorityMode) : null;

  if (!localStatus) {
    const fallback = await getHeartbeatFallback(theatreId);
    pendingSync = Number(fallback?.pendingSync ?? 0);
    failedSync = Number(fallback?.failedSync ?? 0);
    lastLocalSequence = Number(fallback?.lastLocalSequence ?? 0);
    localAuthorityMode = fallback?.authorityMode ? normalizeAuthorityMode(fallback.authorityMode) : null;
    const finalSyncCompletedBeforeDisconnect = pendingSync === 0
      && failedSync === 0
      && lastLocalSequence === lastSyncedSequence
      && Boolean(localAuthorityMode && LOCAL_PAUSED_MODES.has(localAuthorityMode));
    if (!finalSyncCompletedBeforeDisconnect) blockingReasons.push('LOCAL_NOT_REACHABLE');
  }

  const mirror = await compareLocalSeatMirror(showId, localStatus);
  if (pendingSync > 0) blockingReasons.push('PENDING_SYNC_EVENTS');
  if (failedSync > 0) blockingReasons.push('FAILED_SYNC_EVENTS');
  if (lastLocalSequence !== lastSyncedSequence) blockingReasons.push('LOCAL_SEQUENCE_NOT_ACKED');
  if (localReachable && (!localAuthorityMode || !LOCAL_PAUSED_MODES.has(localAuthorityMode))) blockingReasons.push('LOCAL_AUTHORITY_NOT_PAUSED');
  if (mirror.missingMirrorSeats.length > 0) blockingReasons.push('CENTRAL_MIRROR_MISSING_LOCAL_SEATS');
  if (mirror.mismatchedMirrorSeats.length > 0) blockingReasons.push('CENTRAL_MIRROR_BOOKING_MISMATCH');

  const reasons = uniqueReasons(blockingReasons);
  return {
    showId,
    theatreId,
    authorityMode,
    localReachable,
    pendingSync,
    failedSync,
    lastLocalSequence,
    lastSyncedSequence,
    canReturnToCentral: reasons.length === 0,
    blockingReasons: reasons,
    localAuthorityMode,
    missingMirrorSeats: mirror.missingMirrorSeats,
    mismatchedMirrorSeats: mirror.mismatchedMirrorSeats
  };
}

export async function returnShowToCentral(showId: string, theatreId: string) {
  const show = await getCentralShow(showId);
  if (!show) {
    return { switched: false, status: await getAuthorityReturnStatus(showId, theatreId) };
  }
  if (String(show.theatreId) !== theatreId) {
    return { switched: false, status: await getAuthorityReturnStatus(showId, theatreId) };
  }

  const pool = getCentralDbPool();
  await pool.query(
    `UPDATE shows
     SET authority_mode = 'RETURNING_TO_CENTRAL'
     WHERE id = ?
       AND theatre_id = ?
       AND authority_mode IN ('LOCAL_AUTHORITY_ONLINE','LOCAL_AUTHORITY_OFFLINE','LOCAL_SYNCING','RETURNING_TO_CENTRAL')`,
    [showId, theatreId]
  );
  await pool.query(
    `INSERT INTO show_authority_state (show_id, authority_mode, pending_sync_events, failed_sync_events)
     VALUES (?, 'RETURNING_TO_CENTRAL', 0, 0)
     ON DUPLICATE KEY UPDATE authority_mode = VALUES(authority_mode), updated_at = CURRENT_TIMESTAMP`,
    [showId]
  );

  try {
    await getLocalAuthoritySyncStatus(showId, theatreId, 'BEGIN');
  } catch (error) {
    if (!(error instanceof LocalTheatreApiError)) throw error;
  }

  const status = await getAuthorityReturnStatus(showId, theatreId);
  if (!status.canReturnToCentral) return { switched: false, status };

  await pool.query(
    `UPDATE shows
     SET authority_mode = 'CENTRAL_AUTHORITY'
     WHERE id = ? AND theatre_id = ? AND authority_mode = 'RETURNING_TO_CENTRAL'`,
    [showId, theatreId]
  );
  await pool.query(
    `INSERT INTO show_authority_state (show_id, authority_mode, pending_sync_events, failed_sync_events)
     VALUES (?, 'CENTRAL_AUTHORITY', 0, 0)
     ON DUPLICATE KEY UPDATE authority_mode = VALUES(authority_mode), pending_sync_events = 0, failed_sync_events = 0, updated_at = CURRENT_TIMESTAMP`,
    [showId]
  );

  try {
    await getLocalAuthoritySyncStatus(showId, theatreId, 'COMPLETE');
  } catch (error) {
    if (!(error instanceof LocalTheatreApiError)) throw error;
  }

  return { switched: true, status: await getAuthorityReturnStatus(showId, theatreId) };
}

export async function getAuthorityDebugStatus(showId: string) {
  const status = await getAuthorityReturnStatus(showId);
  const health = status.theatreId ? await getTheatreHealth(status.theatreId) : null;
  return {
    ...status,
    theatreHealth: health
  };
}
