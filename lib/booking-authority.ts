import { RowDataPacket } from 'mysql2';
import { normalizeAuthorityMode } from './authority-mode';
import { getCentralDbPool } from './db';
import { getLocalHealth } from './local-theatre-client';
import type { AuthorityMode } from './types';

export const PUBLIC_LOCAL_UNAVAILABLE_MESSAGE = 'Booking is temporarily unavailable for this show. Please try again shortly.';
export const PUBLIC_ONLINE_UNAVAILABLE_MESSAGE = 'Online booking is temporarily unavailable for this show.';
export const PUBLIC_SYNCING_MESSAGE = 'Booking is temporarily paused while the theatre is syncing.';
export const PUBLIC_SALES_CLOSED_MESSAGE = 'Booking is closed for this show.';

export type BookingAuthorityDecision = {
  showId: string;
  theatreId: string;
  authorityMode: AuthorityMode;
  localHeartbeatFresh: boolean;
  localReachable: boolean;
  centralCanHold: boolean;
  centralCanConfirm: boolean;
  mustForwardToLocal: boolean;
  publicBookingAllowed: boolean;
  publicMessage: string | null;
  officialReason: string | null;
};

type ShowAuthorityInput = {
  showId: string;
  theatreId?: string;
  authorityMode?: unknown;
  status?: unknown;
};

type ShowAuthorityRow = RowDataPacket & {
  showId: string;
  theatreId: string;
  authorityMode: string;
  status: string;
};

type HeartbeatRow = RowDataPacket & {
  theatreId: string;
  status: string;
  lastSeenAt: Date | string;
  ageSeconds: number;
  trustedForAdminSync: number | boolean;
};

function heartbeatStaleSeconds() {
  return readPositiveIntegerEnv(['LOCAL_HEARTBEAT_STALE_SECONDS', 'LOCAL_HEARTBEAT_STALE_AFTER_SECONDS'], 30, 5);
}

function readPositiveIntegerEnv(names: string[], fallback: number, minimum: number) {
  for (const name of names) {
    const raw = process.env[name]?.trim();
    if (!raw) continue;

    const configured = Number(raw);
    if (Number.isFinite(configured) && configured > 0) {
      return Math.max(minimum, Math.floor(configured));
    }
  }

  return fallback;
}

function localHealthCheckTimeoutMs() {
  return readPositiveIntegerEnv(
    ['LOCAL_HEALTH_CHECK_TIMEOUT_MS', 'LOCAL_TUNNEL_TIMEOUT_MS', 'LOCAL_SEAT_STATUS_TIMEOUT_MS'],
    7000,
    1500
  );
}

function baseDecision(input: { showId: string; theatreId: string; authorityMode: AuthorityMode }): BookingAuthorityDecision {
  return {
    showId: input.showId,
    theatreId: input.theatreId,
    authorityMode: input.authorityMode,
    localHeartbeatFresh: false,
    localReachable: false,
    centralCanHold: false,
    centralCanConfirm: false,
    mustForwardToLocal: false,
    publicBookingAllowed: false,
    publicMessage: PUBLIC_LOCAL_UNAVAILABLE_MESSAGE,
    officialReason: null
  };
}

async function resolveShow(input: ShowAuthorityInput): Promise<ShowAuthorityRow | null> {
  const [[show]] = await getCentralDbPool().query<ShowAuthorityRow[]>(
    `SELECT s.id AS showId, s.theatre_id AS theatreId,
            COALESCE(st.authority_mode, s.authority_mode) AS authorityMode,
            s.status
     FROM shows s
     LEFT JOIN show_authority_state st ON st.show_id = s.id
     WHERE s.id = ?
     LIMIT 1`,
    [input.showId]
  );

  if (show) return show;

  if (input.theatreId && input.authorityMode && input.status) {
    return {
      showId: input.showId,
      theatreId: input.theatreId,
      authorityMode: String(input.authorityMode),
      status: String(input.status)
    } as ShowAuthorityRow;
  }

  return null;
}

async function getTrustedHeartbeat(theatreId: string) {
  const [[heartbeat]] = await getCentralDbPool().query<HeartbeatRow[]>(
    `SELECT theatre_id AS theatreId, status, last_seen_at AS lastSeenAt,
            TIMESTAMPDIFF(SECOND, last_seen_at, NOW()) AS ageSeconds,
            trusted_for_admin_sync AS trustedForAdminSync
     FROM theatre_heartbeats
     WHERE theatre_id = ? AND trusted_for_admin_sync = 1
     LIMIT 1`,
    [theatreId]
  );

  if (!heartbeat) {
    return { row: null, fresh: false, reason: 'NO_TRUSTED_HEARTBEAT' };
  }

  const ageSeconds = Number(heartbeat.ageSeconds);
  const fresh = Number.isFinite(ageSeconds)
    && String(heartbeat.status) === 'ONLINE'
    && ageSeconds >= 0
    && ageSeconds <= heartbeatStaleSeconds();

  return {
    row: heartbeat,
    fresh,
    reason: fresh ? null : String(heartbeat.status) !== 'ONLINE' ? 'HEARTBEAT_OFFLINE' : 'HEARTBEAT_STALE'
  };
}

async function checkLocalHealth(theatreId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), localHealthCheckTimeoutMs());

  try {
    const health = await getLocalHealth(controller.signal);
    const dbStatus = typeof health.dbStatus === 'string'
      ? health.dbStatus
      : health.dbStatus && typeof health.dbStatus === 'object' && 'dbStatus' in health.dbStatus
        ? String((health.dbStatus as { dbStatus?: unknown }).dbStatus)
        : 'AVAILABLE';

    if (health.success !== true || health.status !== 'ONLINE') return { reachable: false, reason: 'LOCAL_HEALTH_NOT_ONLINE' };
    if (health.theatreId && String(health.theatreId) !== theatreId) return { reachable: false, reason: 'LOCAL_HEALTH_THEATRE_MISMATCH' };
    if (dbStatus === 'UNAVAILABLE') return { reachable: false, reason: 'LOCAL_DB_UNAVAILABLE' };
    return { reachable: true, reason: null };
  } catch {
    return { reachable: false, reason: 'LOCAL_HEALTH_UNREACHABLE' };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getBookingAuthorityDecision(input: ShowAuthorityInput): Promise<BookingAuthorityDecision | null> {
  const show = await resolveShow(input);
  if (!show) return null;

  const authorityMode = normalizeAuthorityMode(show.authorityMode);
  const status = String(show.status).toUpperCase();
  const decision = baseDecision({
    showId: String(show.showId),
    theatreId: String(show.theatreId),
    authorityMode
  });

  if (status !== 'OPEN') {
    decision.publicMessage = authorityMode === 'SALES_CLOSED' || status === 'SALES_CLOSED'
      ? PUBLIC_SALES_CLOSED_MESSAGE
      : PUBLIC_ONLINE_UNAVAILABLE_MESSAGE;
    decision.officialReason = status === 'SALES_CLOSED' ? 'SALES_CLOSED' : 'SHOW_NOT_OPEN';
    return decision;
  }

  if (authorityMode === 'CENTRAL_AUTHORITY') {
    return {
      ...decision,
      centralCanHold: true,
      centralCanConfirm: true,
      publicBookingAllowed: true,
      publicMessage: null,
      officialReason: null
    };
  }

  if (authorityMode === 'LOCAL_AUTHORITY_ONLINE') {
    const heartbeat = await getTrustedHeartbeat(decision.theatreId);
    decision.localHeartbeatFresh = heartbeat.fresh;

    if (!heartbeat.fresh) {
      decision.mustForwardToLocal = true;
      decision.publicMessage = PUBLIC_LOCAL_UNAVAILABLE_MESSAGE;
      decision.officialReason = heartbeat.reason;
      return decision;
    }

    const health = await checkLocalHealth(decision.theatreId);
    decision.localReachable = health.reachable;
    decision.mustForwardToLocal = true;
    decision.publicBookingAllowed = health.reachable;
    decision.publicMessage = health.reachable ? null : PUBLIC_LOCAL_UNAVAILABLE_MESSAGE;
    decision.officialReason = health.reason;
    return decision;
  }

  if (authorityMode === 'LOCAL_AUTHORITY_OFFLINE' || authorityMode === 'LOCAL_AUTHORITY_COUNTER_ONLY') {
    decision.publicMessage = PUBLIC_ONLINE_UNAVAILABLE_MESSAGE;
    decision.officialReason = authorityMode;
    return decision;
  }

  if (authorityMode === 'LOCAL_SYNCING' || authorityMode === 'RETURNING_TO_CENTRAL') {
    decision.publicMessage = PUBLIC_SYNCING_MESSAGE;
    decision.officialReason = authorityMode;
    return decision;
  }

  if (authorityMode === 'SALES_CLOSED') {
    decision.publicMessage = PUBLIC_SALES_CLOSED_MESSAGE;
    decision.officialReason = 'SALES_CLOSED';
    return decision;
  }

  decision.officialReason = 'UNKNOWN_AUTHORITY_MODE';
  return decision;
}

export function authorityUnavailablePayload(decision: BookingAuthorityDecision | null) {
  return {
    success: false,
    error: 'SHOW_TEMPORARILY_UNAVAILABLE',
    message: decision?.publicMessage ?? PUBLIC_LOCAL_UNAVAILABLE_MESSAGE
  };
}
