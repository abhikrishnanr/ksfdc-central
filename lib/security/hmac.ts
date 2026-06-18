import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

export const KSFDC_HMAC_TIMESTAMP_WINDOW_MS = 2 * 60 * 1000;

export interface KsfDcSignedRequestInput {
  method: string;
  path: string;
  timestamp: string;
  body: string;
}

export interface KsfDcHmacHeaders {
  'X-KSFDC-Client-Id': string;
  'X-KSFDC-Timestamp': string;
  'X-KSFDC-Request-Id': string;
  'X-KSFDC-Signature': string;
}

export function createKsfDcCanonicalPayload(input: KsfDcSignedRequestInput) {
  return `${input.method.toUpperCase()}${input.path}${input.timestamp}${input.body}`;
}

export function signKsfDcRequest(input: KsfDcSignedRequestInput, secret: string) {
  return createHmac('sha256', secret).update(createKsfDcCanonicalPayload(input)).digest('hex');
}

export function buildKsfDcHmacHeaders(input: Omit<KsfDcSignedRequestInput, 'timestamp'> & { clientId: string; secret: string; requestId?: string; timestamp?: string }): KsfDcHmacHeaders {
  const timestamp = input.timestamp ?? new Date().toISOString();
  return {
    'X-KSFDC-Client-Id': input.clientId,
    'X-KSFDC-Timestamp': timestamp,
    'X-KSFDC-Request-Id': input.requestId ?? randomUUID(),
    'X-KSFDC-Signature': signKsfDcRequest({ method: input.method, path: input.path, timestamp, body: input.body }, input.secret)
  };
}

export function isKsfDcTimestampFresh(timestamp: string, now = new Date()) {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return false;
  return Math.abs(now.getTime() - parsed) <= KSFDC_HMAC_TIMESTAMP_WINDOW_MS;
}

export function verifyKsfDcSignature(input: KsfDcSignedRequestInput & { signature: string; secret: string }) {
  const expected = signKsfDcRequest(input, input.secret);
  const actualBuffer = Buffer.from(input.signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
