import { normalizeAuthorityMode as normalizeSharedAuthorityMode } from './authority-mode';
import type { AuthorityMode } from './types';

export type OnlineBookingUnavailableReason =
  | 'SHOW_NOT_OPEN'
  | 'BOOKING_CUTOFF_REACHED'
  | 'LOCAL_AUTHORITY_COUNTER_ONLY'
  | 'LOCAL_AUTHORITY_OFFLINE'
  | 'LOCAL_AUTHORITY_UNREACHABLE'
  | 'SYNC_IN_PROGRESS'
  | 'SALES_CLOSED'
  | 'UNKNOWN';

export type BookableAuthorityMode = AuthorityMode | 'LOCAL_AUTHORITY_COUNTER_ONLY';

export type ShowBookingPolicyInput = {
  authorityMode?: unknown;
  authority_mode?: unknown;
  status?: unknown;
  bookingStatus?: unknown;
  booking_status?: unknown;
  showTime?: unknown;
  localReachable?: boolean;
};

export type ShowBookingPolicyResult = {
  bookingEnabled: boolean;
  authorityMode: BookableAuthorityMode;
  status: string;
  reason?: OnlineBookingUnavailableReason;
  message?: string;
};

const BOOKABLE_AUTHORITY_MODES = new Set<string>([
  'CENTRAL_AUTHORITY',
  'LOCAL_AUTHORITY_ONLINE'
]);

export const SHOW_BOOKING_GRACE_MINUTES = 15;

export function getShowBookingCutoff(showTime: unknown) {
  const date = showTime instanceof Date ? showTime : new Date(String(showTime ?? ''));
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(date.getTime() + SHOW_BOOKING_GRACE_MINUTES * 60 * 1000);
}

export function isShowBookingCutoffReached(showTime: unknown, now: Date | number = new Date()) {
  const cutoff = getShowBookingCutoff(showTime);
  const current = now instanceof Date ? now.getTime() : Number(now);
  return cutoff ? cutoff.getTime() <= current : false;
}

export function normalizeCentralAuthorityMode(value: unknown): BookableAuthorityMode {
  if (typeof value !== 'string') return 'CENTRAL_AUTHORITY';

  const normalized = value.trim().toUpperCase();
  if (normalized === 'CENTRAL') return 'CENTRAL_AUTHORITY';
  if (normalized === 'LOCAL') return 'LOCAL_AUTHORITY_ONLINE';
  if (normalized === 'LOCAL_AUTHORITY_COUNTER_ONLY') return 'LOCAL_AUTHORITY_COUNTER_ONLY';

  return normalizeSharedAuthorityMode(normalized) as BookableAuthorityMode;
}

function normalizeShowStatus(input: ShowBookingPolicyInput) {
  const rawStatus = input.bookingStatus ?? input.booking_status ?? input.status ?? 'OPEN';
  return typeof rawStatus === 'string' ? rawStatus.trim().toUpperCase() : String(rawStatus).trim().toUpperCase();
}

export function getOnlineBookingUnavailableReason(input: ShowBookingPolicyInput): OnlineBookingUnavailableReason | undefined {
  const authorityMode = normalizeCentralAuthorityMode(input.authorityMode ?? input.authority_mode);
  const status = normalizeShowStatus(input);

  if (status !== 'OPEN') return status === 'SALES_CLOSED' ? 'SALES_CLOSED' : 'SHOW_NOT_OPEN';
  if (input.showTime && isShowBookingCutoffReached(input.showTime)) return 'BOOKING_CUTOFF_REACHED';

  if (BOOKABLE_AUTHORITY_MODES.has(authorityMode)) {
    if (authorityMode === 'LOCAL_AUTHORITY_ONLINE' && input.localReachable === false) {
      return 'LOCAL_AUTHORITY_UNREACHABLE';
    }
    return undefined;
  }

  if (authorityMode === 'LOCAL_AUTHORITY_COUNTER_ONLY') return 'LOCAL_AUTHORITY_COUNTER_ONLY';
  if (authorityMode === 'LOCAL_AUTHORITY_OFFLINE') return 'LOCAL_AUTHORITY_OFFLINE';
  if (authorityMode === 'LOCAL_SYNCING' || authorityMode === 'RETURNING_TO_CENTRAL') return 'SYNC_IN_PROGRESS';
  if (authorityMode === 'SALES_CLOSED') return 'SALES_CLOSED';

  return 'UNKNOWN';
}

export function getOnlineBookingUnavailableMessage(reason?: OnlineBookingUnavailableReason) {
  if (reason === 'SHOW_NOT_OPEN') return 'Booking is not available for this show.';
  if (reason === 'BOOKING_CUTOFF_REACHED') return 'Online booking closed 15 minutes after this show started.';
  if (reason === 'LOCAL_AUTHORITY_COUNTER_ONLY') return 'This show is currently controlled by the local theatre counter.';
  if (reason === 'LOCAL_AUTHORITY_OFFLINE') return 'This show is currently controlled by the local theatre counter.';
  if (reason === 'LOCAL_AUTHORITY_UNREACHABLE') return 'Booking is temporarily unavailable for this show. Please try again shortly.';
  if (reason === 'SYNC_IN_PROGRESS') return 'Booking is temporarily paused while the theatre is syncing.';
  if (reason === 'SALES_CLOSED') return 'Booking is closed for this show.';
  return 'Booking is temporarily unavailable.';
}

export function canShowBeBookedOnline(input: ShowBookingPolicyInput): boolean {
  return getOnlineBookingUnavailableReason(input) === undefined;
}

export function resolveOnlineBookingPolicy(input: ShowBookingPolicyInput): ShowBookingPolicyResult {
  const authorityMode = normalizeCentralAuthorityMode(input.authorityMode ?? input.authority_mode);
  const status = normalizeShowStatus(input);
  const reason = getOnlineBookingUnavailableReason(input);

  return {
    bookingEnabled: reason === undefined,
    authorityMode,
    status,
    reason,
    message: getOnlineBookingUnavailableMessage(reason)
  };
}
