import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { cookies, headers } from 'next/headers';
import { RowDataPacket } from 'mysql2';
import { getCentralDbPool } from './db';
import { sendPublicLoginOtp } from './email/ses';

export type PublicOtpPurpose = 'BOOKING_LOGIN';

export interface PublicSession {
  sessionId: string;
  userId: string;
  email: string;
  displayName: string | null;
}

const COOKIE_NAME = 'ksfdc_public_session';
let publicAuthTablesInitPromise: Promise<void> | null = null;

function authSecret() {
  return process.env.AUTH_COOKIE_SECRET ?? 'dev-central-auth-cookie-secret-change-me';
}

function sign(value: string) {
  return createHmac('sha256', authSecret()).update(value).digest('base64url');
}

function encodeCookie(sessionId: string) {
  return `${sessionId}.${sign(sessionId)}`;
}

function decodeCookie(value?: string) {
  if (!value) return null;
  const [sessionId, signature] = value.split('.');
  if (!sessionId || !signature) return null;
  const expected = sign(sessionId);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  return sessionId;
}

function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidPublicEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 190;
}

export function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'•'.repeat(Math.max(2, Math.min(5, local.length - visible.length)))}@${domain}`;
}

export function publicOtpEnabled() {
  return String(process.env.PUBLIC_OTP_ENABLED ?? 'false').toLowerCase() === 'true';
}

function otpExpiryMinutes() {
  const value = Number(process.env.PUBLIC_OTP_EXPIRY_MIN ?? 5);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 30) : 5;
}

function maxAttempts() {
  const value = Number(process.env.PUBLIC_OTP_MAX_ATTEMPTS ?? 5);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 20) : 5;
}

function resendCooldownSeconds() {
  const value = Number(process.env.PUBLIC_OTP_RESEND_COOLDOWN_SEC ?? 30);
  return Number.isFinite(value) && value >= 0 ? Math.min(value, 300) : 30;
}

function hashOtp(email: string, purpose: PublicOtpPurpose, otp: string) {
  return createHmac('sha256', authSecret()).update(`${purpose}:${email}:${otp}`).digest('base64url');
}

async function requestIp() {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
}

async function addColumnIfMissing(tableName: string, columnName: string, definition: string) {
  const [[row]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  if (Number(row.cnt) === 0) {
    await getCentralDbPool().query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function addIndexIfMissing(tableName: string, indexName: string, definition: string) {
  const [[row]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  if (Number(row.cnt) === 0) {
    await getCentralDbPool().query(`ALTER TABLE ${tableName} ADD INDEX ${indexName} (${definition})`);
  }
}

export function ensurePublicAuthTables() {
  if (!publicAuthTablesInitPromise) {
    publicAuthTablesInitPromise = initializePublicAuthTables().catch((error: unknown) => {
      publicAuthTablesInitPromise = null;
      throw error;
    });
  }
  return publicAuthTablesInitPromise;
}

async function initializePublicAuthTables() {
  const pool = getCentralDbPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public_users (
      id VARCHAR(80) PRIMARY KEY,
      email VARCHAR(190) NOT NULL UNIQUE,
      display_name VARCHAR(120) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public_sessions (
      id VARCHAR(100) PRIMARY KEY,
      public_user_id VARCHAR(80) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TIMESTAMP NULL,
      INDEX idx_public_sessions_user (public_user_id, expires_at),
      CONSTRAINT fk_public_sessions_user FOREIGN KEY (public_user_id) REFERENCES public_users(id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public_email_otps (
      id VARCHAR(100) PRIMARY KEY,
      email VARCHAR(190) NOT NULL,
      purpose VARCHAR(40) NOT NULL,
      otp_hash VARCHAR(255) NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 5,
      expires_at TIMESTAMP NOT NULL,
      sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      verified_at TIMESTAMP NULL,
      request_ip VARCHAR(80) NULL,
      INDEX idx_public_email_otps_email_purpose (email, purpose, expires_at),
      INDEX idx_public_email_otps_sent (sent_at)
    )
  `);
  await addColumnIfMissing('central_bookings', 'customer_email', 'VARCHAR(190) NULL');
  await addColumnIfMissing('central_bookings', 'public_user_id', 'VARCHAR(80) NULL');
  await addIndexIfMissing('central_bookings', 'idx_bookings_public_user', 'public_user_id, created_at');
  await addIndexIfMissing('central_bookings', 'idx_bookings_customer_email', 'customer_email, created_at');
}

export async function requestPublicEmailOtp(input: { email: unknown; purpose?: unknown }) {
  await ensurePublicAuthTables();
  const email = normalizeEmail(input.email);
  const purpose = String(input.purpose ?? 'BOOKING_LOGIN') as PublicOtpPurpose;
  if (purpose !== 'BOOKING_LOGIN' || !isValidPublicEmail(email)) {
    return { ok: false as const, status: 400, body: { success: false, error: 'Enter a valid email address.' } };
  }

  const cooldown = resendCooldownSeconds();
  const [[recent]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT TIMESTAMPDIFF(SECOND, sent_at, NOW()) AS ageSeconds
     FROM public_email_otps
     WHERE email = ? AND purpose = ? AND verified_at IS NULL
     ORDER BY sent_at DESC
     LIMIT 1`,
    [email, purpose]
  );
  if (recent && Number(recent.ageSeconds) < cooldown) {
    return {
      ok: false as const,
      status: 429,
      body: {
        success: false,
        error: `Please wait ${cooldown - Number(recent.ageSeconds)} seconds before requesting another code.`
      }
    };
  }

  const otp = String(randomInt(100000, 1000000));
  const id = `OTP_${randomBytes(18).toString('base64url')}`;
  await getCentralDbPool().query(
    `INSERT INTO public_email_otps (id, email, purpose, otp_hash, max_attempts, expires_at, request_ip)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)`,
    [id, email, purpose, hashOtp(email, purpose, otp), maxAttempts(), otpExpiryMinutes(), await requestIp()]
  );

  const emailResult = await sendPublicLoginOtp(email, otp);
  if (!emailResult.sent && process.env.NODE_ENV === 'production') {
    return { ok: false as const, status: 503, body: { success: false, error: 'Verification email is unavailable right now. Please try again later.' } };
  }

  return {
    ok: true as const,
    status: 200,
    body: {
      success: true,
      maskedEmail: maskEmail(email),
      expiresInMinutes: otpExpiryMinutes(),
      emailSent: emailResult.sent
    }
  };
}

async function createPublicSession(userId: string, email: string, displayName: string | null) {
  const sessionId = `PUBSESS_${randomBytes(32).toString('base64url')}`;
  await getCentralDbPool().query(
    'INSERT INTO public_sessions (id, public_user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))',
    [sessionId, userId]
  );
  (await cookies()).set(COOKIE_NAME, encodeCookie(sessionId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60
  });
  return { sessionId, userId, email, displayName };
}

export async function verifyPublicEmailOtp(input: { email: unknown; otp: unknown; purpose?: unknown }) {
  await ensurePublicAuthTables();
  const email = normalizeEmail(input.email);
  const otp = String(input.otp ?? '').trim();
  const purpose = String(input.purpose ?? 'BOOKING_LOGIN') as PublicOtpPurpose;
  if (purpose !== 'BOOKING_LOGIN' || !isValidPublicEmail(email) || !/^\d{6}$/.test(otp)) {
    return { ok: false as const, status: 400, body: { success: false, error: 'Enter the 6-digit code sent to your email.' } };
  }

  const [[row]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT id, otp_hash AS otpHash, attempts, max_attempts AS maxAttempts, expires_at AS expiresAt
     FROM public_email_otps
     WHERE email = ? AND purpose = ? AND verified_at IS NULL
     ORDER BY sent_at DESC
     LIMIT 1`,
    [email, purpose]
  );
  if (!row) {
    return { ok: false as const, status: 404, body: { success: false, error: 'Code expired. Request a new code.' } };
  }
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    return { ok: false as const, status: 409, body: { success: false, error: 'Code expired. Request a new code.' } };
  }
  if (Number(row.attempts) >= Number(row.maxAttempts)) {
    return { ok: false as const, status: 429, body: { success: false, error: 'Too many attempts. Request a new code.' } };
  }

  const expected = Buffer.from(String(row.otpHash));
  const actual = Buffer.from(hashOtp(email, purpose, otp));
  const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!valid) {
    await getCentralDbPool().query('UPDATE public_email_otps SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    return { ok: false as const, status: 401, body: { success: false, error: 'That code is incorrect. Please try again.' } };
  }

  await getCentralDbPool().query('UPDATE public_email_otps SET verified_at = NOW() WHERE id = ?', [row.id]);
  await getCentralDbPool().query(
    `INSERT INTO public_users (id, email)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE email = VALUES(email)`,
    [`PUB_${createHmac('sha1', authSecret()).update(email).digest('hex').slice(0, 24)}`, email]
  );
  const [[user]] = await getCentralDbPool().query<RowDataPacket[]>('SELECT id, email, display_name AS displayName FROM public_users WHERE email = ? LIMIT 1', [email]);
  const session = await createPublicSession(String(user.id), String(user.email), user.displayName ? String(user.displayName) : null);
  return {
    ok: true as const,
    status: 200,
    body: {
      success: true,
      user: { id: session.userId, email: session.email, displayName: session.displayName }
    }
  };
}

export async function getPublicSession(): Promise<PublicSession | null> {
  await ensurePublicAuthTables();
  const sessionId = decodeCookie((await cookies()).get(COOKIE_NAME)?.value);
  if (!sessionId) return null;
  const [[session]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT s.id AS sessionId, u.id AS userId, u.email, u.display_name AS displayName
     FROM public_sessions s
     JOIN public_users u ON u.id = s.public_user_id
     WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > NOW()
     LIMIT 1`,
    [sessionId]
  );
  return session ? {
    sessionId: String(session.sessionId),
    userId: String(session.userId),
    email: String(session.email),
    displayName: session.displayName ? String(session.displayName) : null
  } : null;
}

export async function logoutPublicUser() {
  const sessionId = decodeCookie((await cookies()).get(COOKIE_NAME)?.value);
  if (sessionId) {
    await getCentralDbPool().query('UPDATE public_sessions SET revoked_at = NOW() WHERE id = ?', [sessionId]);
  }
  (await cookies()).delete(COOKIE_NAME);
}
