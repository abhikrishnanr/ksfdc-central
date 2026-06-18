import { NextRequest, NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getCentralDbPool } from './db';
import { isKsfDcTimestampFresh, verifyKsfDcSignature } from './security/hmac';

type MysqlDuplicateError = Error & { code?: string; errno?: number };

let syncSecurityTablesInitPromise: Promise<void> | null = null;

function reject(error: string, status = 401) {
  return NextResponse.json({ success: false, error }, { status });
}

function envList(...names: string[]) {
  return names
    .flatMap((name) => (process.env[name] ?? '').split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function syncSharedSecret() {
  return process.env.CENTRAL_SYNC_SHARED_SECRET?.trim()
    || process.env.LOCAL_THEATRE_SHARED_SECRET?.trim()
    || process.env.LOCAL_SHARED_SECRET?.trim()
    || process.env.KSFDC_HMAC_SECRET?.trim()
    || process.env.CENTRAL_HEARTBEAT_SECRET?.trim()
    || '';
}

function allowedClientIds() {
  return envList('CENTRAL_SYNC_ALLOWED_CLIENT_IDS', 'LOCAL_ALLOWED_CLIENT_IDS', 'KSFDC_CLIENT_ID');
}

function isDuplicateRequestIdError(error: unknown) {
  const mysqlError = error as MysqlDuplicateError;
  return mysqlError.code === 'ER_DUP_ENTRY' || mysqlError.errno === 1062;
}

async function initializeSyncSecurityTables() {
  await getCentralDbPool().query(`
    CREATE TABLE IF NOT EXISTS central_sync_api_request_log (
      request_id VARCHAR(100) PRIMARY KEY,
      client_id VARCHAR(100) NOT NULL,
      method VARCHAR(10) NOT NULL,
      path VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_central_sync_api_request_log_created (created_at),
      INDEX idx_central_sync_api_request_log_client (client_id, created_at)
    )
  `);
}

export function ensureCentralSyncSecurityTables() {
  if (!syncSecurityTablesInitPromise) {
    syncSecurityTablesInitPromise = initializeSyncSecurityTables().catch((error: unknown) => {
      syncSecurityTablesInitPromise = null;
      throw error;
    });
  }

  return syncSecurityTablesInitPromise;
}

export async function verifyCentralSyncRequest(request: NextRequest, body: string) {
  const secret = syncSharedSecret();
  if (!secret) return reject('CENTRAL_SYNC_SHARED_SECRET_NOT_CONFIGURED', 500);

  const clientId = request.headers.get('x-ksfdc-client-id');
  const timestamp = request.headers.get('x-ksfdc-timestamp');
  const requestId = request.headers.get('x-ksfdc-request-id');
  const signature = request.headers.get('x-ksfdc-signature');

  if (!clientId || !timestamp || !requestId || !signature) return reject('Missing HMAC credentials');

  const allowed = allowedClientIds();
  if (allowed.length > 0 && !allowed.includes(clientId)) return reject('Client id not allowed', 403);
  if (!isKsfDcTimestampFresh(timestamp)) return reject('Stale HMAC timestamp');

  const path = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (!verifyKsfDcSignature({ method: request.method, path, timestamp, body, signature, secret })) {
    return reject('Invalid HMAC signature');
  }

  await ensureCentralSyncSecurityTables();
  await getCentralDbPool().query('DELETE FROM central_sync_api_request_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)');
  try {
    await getCentralDbPool().query(
      'INSERT INTO central_sync_api_request_log (request_id, client_id, method, path) VALUES (?, ?, ?, ?)',
      [requestId, clientId, request.method, path.slice(0, 255)]
    );
  } catch (error) {
    if (isDuplicateRequestIdError(error)) return reject('Duplicate request id', 409);
    throw error;
  }

  return null;
}

export async function getAcceptedLocalSequence(theatreId: string) {
  const [[row]] = await getCentralDbPool().query<RowDataPacket[]>(
    'SELECT COALESCE(MAX(source_sequence_no), 0) AS sequenceNo FROM central_sync_inbox WHERE theatre_id = ?',
    [theatreId]
  );
  return Number(row?.sequenceNo ?? 0);
}
