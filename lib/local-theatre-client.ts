import { buildKsfDcHmacHeaders } from './security/hmac';

export const LOCAL_THEATRE_ERROR_MESSAGES: Record<string, string> = {
  SERVICE_AUTH_NOT_CONFIGURED: 'Local theatre service authentication is not configured.',
  LOCAL_THEATRE_REQUEST_FAILED: 'Local theatre service could not complete the request.',
  SHOW_NOT_OPEN: 'This show is not open for booking at the local theatre.',
  SHOW_NOT_FOUND: 'Show or seat layout not found at the local theatre.',
  LOCAL_AUTHORITY_NOT_ACTIVE: 'Local theatre booking is not active for this show.',
  LOCAL_AUTHORITY_REQUIRED: 'Local theatre booking is not active for this show.',
  SEAT_NOT_AVAILABLE: 'One or more selected seats are unavailable at the local theatre.',
  NO_SEATS_SELECTED: 'Select at least one seat before continuing.',
  HOLD_NOT_FOUND: 'The local theatre hold was not found.',
  HOLD_NOT_ACTIVE: 'The local theatre hold is not active or has expired.',
  HOLD_ALREADY_CONFIRMED: 'The local theatre hold was already confirmed.',
  RETURNING_TO_CENTRAL: 'Booking is temporarily paused while theatre sync is completing.'
};

export type LocalTheatreApiErrorPayload = {
  success?: false;
  error?: string;
  message?: string;
};

export type LocalTheatreHealth = {
  success: true;
  theatreId: string;
  status: string;
  authorityModes: Array<{ authorityMode: string; count: number }>;
  localTime: string;
  pendingSync: number;
  failedSync: number;
  dbStatus: unknown;
};

export type LocalTheatreShowSeats = {
  success: true;
  bookingEnabled: boolean;
  authorityMode: string;
  show: {
    showId: string;
    movieTitle: string;
    theatreId: string;
    screenName: string;
    showTime: string;
    authorityMode: string;
    status: string;
  };
  screenSideLabel?: string;
  zoneRates: Array<{ zone: string; amount: number }>;
  rows: Array<{
    rowLabel: string;
    cells: Array<{
      kind: string;
      cellId: string;
      seatId?: string;
      rowLabel?: string;
      seatNumber?: number | string;
      zone?: string;
      rate?: number;
      status?: 'AVAILABLE' | 'HELD' | 'SOLD' | 'BLOCKED';
    }>;
  }>;
};

export type LocalHoldResponse = {
  success: true;
  holdId: string;
  showId: string;
  seatIds: string[];
  expiresAt: string;
};

export type LocalConfirmResponse = {
  success: true;
  bookingId: string;
  totalAmount: number;
  idempotent?: boolean;
};

export type LocalReleaseResponse = {
  success: true;
  holdId: string;
  released: boolean;
};

export type LocalAuthoritySyncStatus = {
  success: true;
  showId: string;
  theatreId: string;
  authorityMode: string;
  status: string;
  pendingLocalEvents: number;
  failedLocalEvents: number;
  lastLocalSequence: number;
  lastAckSequenceNo: number;
  lastCentralMirrorSequence?: number;
  lastPushSyncAt?: string | null;
  lastPullSyncAt?: string | null;
  confirmedSeats: Array<{
    seatId: string;
    bookingId: string;
    channel: string;
    amount: number;
  }>;
};

export type LocalAuthorityAction = 'STATUS' | 'BEGIN' | 'COMPLETE';

export class LocalTheatreApiError extends Error {
  status: number;
  code: string;

  constructor(code: string, status: number) {
    super(LOCAL_THEATRE_ERROR_MESSAGES[code] ?? 'Local theatre service could not complete the request.');
    this.name = 'LocalTheatreApiError';
    this.status = status;
    this.code = code;
  }
}

function allowInsecureDevHmac() {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_INSECURE_DEV_HMAC === 'true';
}

function firstNonEmptyEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return undefined;
}

function localSharedSecret() {
  const configured = firstNonEmptyEnv('LOCAL_THEATRE_SHARED_SECRET', 'LOCAL_SHARED_SECRET', 'KSFDC_HMAC_SECRET');
  if (configured) return configured;

  throw new LocalTheatreApiError('SERVICE_AUTH_NOT_CONFIGURED', 500);
}

function localClientId() {
  const configured = firstNonEmptyEnv('LOCAL_THEATRE_CLIENT_ID', 'KSFDC_CLIENT_ID');
  if (configured) return configured;

  // Not secret: identifies the central caller for local HMAC replay logging.
  return 'central-app';
}

function localBaseUrl() {
  return (
    firstNonEmptyEnv('LOCAL_THEATRE_API_URL', 'LOCAL_THEATRE_API_BASE_URL', 'LOCAL_AUTHORITY_BASE_URL')
    ?? 'http://localhost:3001'
  ).replace(/\/$/, '');
}

function cloudflareAccessHeaders(): Record<string, string> {
  const clientId = firstNonEmptyEnv('CLOUDFLARE_ACCESS_CLIENT_ID');
  const clientSecret = firstNonEmptyEnv('CLOUDFLARE_ACCESS_CLIENT_SECRET');
  return clientId && clientSecret ? {
    'CF-Access-Client-Id': clientId,
    'CF-Access-Client-Secret': clientSecret
  } : {};
}

export async function requestLocalTheatreApi<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {}) {
  const method = init.method ?? 'GET';
  const body = init.body == null ? '' : JSON.stringify(init.body);
  const sharedSecret = localSharedSecret();
  const hmacHeaders = buildKsfDcHmacHeaders({
    clientId: localClientId(),
    secret: sharedSecret,
    method,
    path,
    body
  });

  const headers: Record<string, string> = {
    ...(body ? { 'content-type': 'application/json' } : {}),
    'x-authority-secret': sharedSecret,
    ...hmacHeaders,
    ...cloudflareAccessHeaders()
  };

  const response = await fetch(`${localBaseUrl()}${path}`, {
    method,
    cache: 'no-store',
    signal: init.signal,
    headers,
    ...(body ? { body } : {})
  });

  const payload = await response.json().catch(() => ({})) as T & LocalTheatreApiErrorPayload;
  if (!response.ok) {
    throw new LocalTheatreApiError(String(payload.error ?? 'LOCAL_THEATRE_REQUEST_FAILED'), response.status);
  }

  return payload as T;
}

export function getLocalHealth(signal?: AbortSignal) {
  return requestLocalTheatreApi<LocalTheatreHealth>('/api/local/health', { signal });
}

export function getLocalShowSeats(showId: string, signal?: AbortSignal) {
  return requestLocalTheatreApi<LocalTheatreShowSeats>(`/api/local/shows/${encodeURIComponent(showId)}/seats`, { signal });
}

export function holdSeatsInLocal(showId: string, seats: string[], channel: string, customerRef?: string, ttlSeconds = 600) {
  return requestLocalTheatreApi<LocalHoldResponse>('/api/local/hold', {
    method: 'POST',
    body: { showId, seatIds: seats, counterId: channel, customerRef, ttlSeconds }
  });
}

export function confirmLocalHold(holdId: string, showId: string, paymentRef: string, payment?: {
  paymentMode?: string;
  paymentProvider?: string;
  paymentRef?: string;
  razorpayOrderId?: string;
}) {
  return requestLocalTheatreApi<LocalConfirmResponse>('/api/local/confirm', {
    method: 'POST',
    body: { holdId, showId, paymentRef, idempotencyKey: paymentRef, ...payment }
  });
}

export function releaseLocalHold(holdId: string, showId: string) {
  return requestLocalTheatreApi<LocalReleaseResponse>('/api/local/release', {
    method: 'POST',
    body: { holdId, showId }
  });
}

export function getLocalAuthoritySyncStatus(showId: string, theatreId: string, action: LocalAuthorityAction = 'STATUS') {
  return requestLocalTheatreApi<LocalAuthoritySyncStatus>('/api/local/authority/return-to-central', {
    method: 'POST',
    body: { showId, theatreId, action }
  });
}

export function getLocalSyncStatus(showId: string) {
  return requestLocalTheatreApi<LocalAuthoritySyncStatus>(`/api/local/sync-status?showId=${encodeURIComponent(showId)}`);
}
