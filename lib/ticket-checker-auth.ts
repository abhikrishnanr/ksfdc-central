import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { RowDataPacket } from 'mysql2';
import { getCentralDbPool } from './db';

export interface TicketCheckerSession {
  sessionId: string;
  userId: string;
  username: string;
  displayName: string;
  theatreId: string | null;
}

const COOKIE_NAME = 'ksfdc_ticket_checker_session';
const DEFAULT_PASSWORD_HASH = '$2b$10$JrYpRSUApTKeBwqHlNGEAeGcyPPP6MRJ7egLLJz96bIwN98hrQlwG';
let initPromise: Promise<void> | null = null;

function authSecret() {
  return process.env.AUTH_COOKIE_SECRET ?? 'dev-central-auth-cookie-secret-change-me';
}

function sign(value: string) {
  return createHmac('sha256', authSecret()).update(`ticket-checker:${value}`).digest('base64url');
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
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer) ? sessionId : null;
}

export function ensureTicketCheckerTables() {
  if (!initPromise) {
    initPromise = initializeTables().catch((error: unknown) => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}

async function initializeTables() {
  const pool = getCentralDbPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_checker_users (
      id VARCHAR(80) PRIMARY KEY,
      username VARCHAR(80) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(120) NOT NULL,
      theatre_id VARCHAR(80) NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ticket_checker_theatre (theatre_id, is_active)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_checker_sessions (
      id VARCHAR(100) PRIMARY KEY,
      user_id VARCHAR(80) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TIMESTAMP NULL,
      INDEX idx_ticket_checker_sessions_user (user_id, expires_at),
      CONSTRAINT fk_ticket_checker_session_user FOREIGN KEY (user_id) REFERENCES ticket_checker_users(id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_attendance (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      booking_id VARCHAR(100) NOT NULL,
      show_id VARCHAR(100) NOT NULL,
      theatre_id VARCHAR(100) NOT NULL,
      checker_user_id VARCHAR(80) NOT NULL,
      admission_source VARCHAR(30) NOT NULL DEFAULT 'QR',
      admitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_ticket_attendance_booking (booking_id),
      INDEX idx_ticket_attendance_show (show_id, admitted_at),
      INDEX idx_ticket_attendance_theatre (theatre_id, admitted_at)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_scan_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      checker_user_id VARCHAR(80) NOT NULL,
      booking_id VARCHAR(100) NULL,
      selected_theatre_id VARCHAR(100) NULL,
      selected_show_id VARCHAR(100) NULL,
      result VARCHAR(50) NOT NULL,
      reason VARCHAR(80) NULL,
      metadata JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ticket_scan_logs_show (selected_show_id, created_at),
      INDEX idx_ticket_scan_logs_checker (checker_user_id, created_at)
    )
  `);
  await pool.query(
    `INSERT INTO ticket_checker_users (id, username, password_hash, display_name, theatre_id, is_active)
     VALUES ('TICKET_CHECKER_DEFAULT', 'ticketchecker', ?, 'Ticket Checker', NULL, TRUE)
     ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), is_active = TRUE`,
    [DEFAULT_PASSWORD_HASH]
  );
}

export async function loginTicketChecker(username: string, password: string) {
  await ensureTicketCheckerTables();
  const [[user]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT id, username, password_hash AS passwordHash, display_name AS displayName, theatre_id AS theatreId
     FROM ticket_checker_users WHERE username = ? AND is_active = TRUE LIMIT 1`,
    [username.trim()]
  );
  if (!user || !(await bcrypt.compare(password, String(user.passwordHash)))) return { ok: false as const };
  const sessionId = `TCSESS_${randomBytes(30).toString('base64url')}`;
  await getCentralDbPool().query(
    'INSERT INTO ticket_checker_sessions (id, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 12 HOUR))',
    [sessionId, user.id]
  );
  (await cookies()).set(COOKIE_NAME, encodeCookie(sessionId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 12 * 60 * 60
  });
  return { ok: true as const };
}

export async function getTicketCheckerSession(): Promise<TicketCheckerSession | null> {
  await ensureTicketCheckerTables();
  const sessionId = decodeCookie((await cookies()).get(COOKIE_NAME)?.value);
  if (!sessionId) return null;
  const [[session]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT s.id AS sessionId, u.id AS userId, u.username, u.display_name AS displayName, u.theatre_id AS theatreId
     FROM ticket_checker_sessions s
     JOIN ticket_checker_users u ON u.id = s.user_id
     WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > NOW() AND u.is_active = TRUE
     LIMIT 1`,
    [sessionId]
  );
  return session ? session as TicketCheckerSession : null;
}

export async function requireTicketCheckerSession() {
  const session = await getTicketCheckerSession();
  if (!session) redirect('/ticket-checker/login');
  return session;
}

export async function logoutTicketChecker() {
  const store = await cookies();
  const sessionId = decodeCookie(store.get(COOKIE_NAME)?.value);
  if (sessionId) await getCentralDbPool().query('UPDATE ticket_checker_sessions SET revoked_at = NOW() WHERE id = ?', [sessionId]);
  store.delete(COOKIE_NAME);
}

