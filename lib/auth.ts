import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { RowDataPacket } from 'mysql2';
import { getCentralDbPool } from './db';

export type CentralRole = 'SUPER_ADMIN' | 'THEATRE_ADMIN' | 'FINANCE_VIEWER' | 'AGENT_CLIENT';

export interface CentralSession {
  sessionId: string;
  userId: string;
  username: string;
  role: CentralRole;
  theatreId: string | null;
  forcePasswordChange: boolean;
}

const COOKIE_NAME = 'ksfdc_central_session';
const DEFAULT_PASSWORD = 'ChangeMe@123';
const DEFAULT_PASSWORD_HASH = '$2b$10$JrYpRSUApTKeBwqHlNGEAeGcyPPP6MRJ7egLLJz96bIwN98hrQlwG';
let centralAuthTablesInitPromise: Promise<void> | null = null;

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

export function ensureCentralAuthTables() {
  if (!centralAuthTablesInitPromise) {
    centralAuthTablesInitPromise = initializeCentralAuthTables().catch((error: unknown) => {
      centralAuthTablesInitPromise = null;
      throw error;
    });
  }
  return centralAuthTablesInitPromise;
}

async function initializeCentralAuthTables() {
  const pool = getCentralDbPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS central_users (
      id VARCHAR(50) PRIMARY KEY,
      username VARCHAR(80) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('SUPER_ADMIN','THEATRE_ADMIN','FINANCE_VIEWER','AGENT_CLIENT') NOT NULL,
      theatre_id VARCHAR(80) NULL,
      force_password_change BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS central_sessions (
      id VARCHAR(80) PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TIMESTAMP NULL,
      CONSTRAINT fk_central_sessions_user FOREIGN KEY (user_id) REFERENCES central_users(id)
    )
  `);
  const [[theatreColumn]] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'central_users' AND COLUMN_NAME = 'theatre_id'`
  );
  if (Number(theatreColumn.cnt) === 0) {
    await pool.query('ALTER TABLE central_users ADD COLUMN theatre_id VARCHAR(80) NULL');
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50) NULL,
      role VARCHAR(40) NULL,
      ip VARCHAR(80) NULL,
      user_agent VARCHAR(255) NULL,
      action VARCHAR(80) NOT NULL,
      entity_type VARCHAR(80) NULL,
      entity_id VARCHAR(80) NULL,
      metadata JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(
    `INSERT INTO central_users (id, username, password_hash, role, force_password_change)
     VALUES ('CENTRAL_SUPERADMIN', 'superadmin', ?, 'SUPER_ADMIN', TRUE)
     ON DUPLICATE KEY UPDATE password_hash = password_hash`,
    [DEFAULT_PASSWORD_HASH]
  );
}

async function requestInfo() {
  const h = await headers();
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null,
    userAgent: h.get('user-agent') ?? null
  };
}

export async function writeCentralAuditLog(input: { userId?: string | null; role?: string | null; action: string; entityType?: string | null; entityId?: string | null; metadata?: Record<string, unknown> }) {
  await ensureCentralAuthTables();
  const pool = getCentralDbPool();
  const { ip, userAgent } = await requestInfo();
  await pool.query(
    `INSERT INTO audit_logs (user_id, role, ip, user_agent, action, entity_type, entity_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.userId ?? null, input.role ?? null, ip, userAgent, input.action, input.entityType ?? null, input.entityId ?? null, JSON.stringify(input.metadata ?? {})]
  );
}

export async function loginCentralUser(username: string, password: string) {
  await ensureCentralAuthTables();
  const pool = getCentralDbPool();
  const [[user]] = await pool.query<RowDataPacket[]>(
    'SELECT id, username, password_hash AS passwordHash, role, theatre_id AS theatreId, force_password_change AS forcePasswordChange FROM central_users WHERE username = ? LIMIT 1',
    [username]
  );

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    await writeCentralAuditLog({ action: 'LOGIN_FAILURE', metadata: { username } });
    return { ok: false as const };
  }

  const sessionId = randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO central_sessions (id, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 8 HOUR))', [sessionId, user.id]);
  const store = await cookies();
  store.set(COOKIE_NAME, encodeCookie(sessionId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 8 * 60 * 60
  });
  await writeCentralAuditLog({ userId: user.id, role: user.role, action: 'LOGIN_SUCCESS' });
  return { ok: true as const, role: user.role as CentralRole };
}

export async function getCentralSession(): Promise<CentralSession | null> {
  await ensureCentralAuthTables();
  const sessionId = decodeCookie((await cookies()).get(COOKIE_NAME)?.value);
  if (!sessionId) return null;
  const pool = getCentralDbPool();
  const [[session]] = await pool.query<RowDataPacket[]>(
    `SELECT s.id AS sessionId, u.id AS userId, u.username, u.role, u.theatre_id AS theatreId, u.force_password_change AS forcePasswordChange
     FROM central_sessions s
     JOIN central_users u ON u.id = s.user_id
     WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > NOW()
     LIMIT 1`,
    [sessionId]
  );
  return session ? (session as CentralSession) : null;
}

export async function logoutCentralUser() {
  const sessionId = decodeCookie((await cookies()).get(COOKIE_NAME)?.value);
  const session = await getCentralSession();
  if (sessionId) {
    await getCentralDbPool().query('UPDATE central_sessions SET revoked_at = NOW() WHERE id = ?', [sessionId]);
  }
  (await cookies()).delete(COOKIE_NAME);
  await writeCentralAuditLog({ userId: session?.userId, role: session?.role, action: 'LOGOUT' });
}

export function centralRoleCanAccess(role: CentralRole, path: string) {
  if (role === 'SUPER_ADMIN') return true;
  if (role === 'THEATRE_ADMIN') return path === '/admin' || path.startsWith('/admin/theatre') || path.startsWith('/admin/settings');
  if (role === 'FINANCE_VIEWER') return path === '/admin' || path.startsWith('/admin/reports');
  return false;
}

export async function requireCentralRole(allowed: CentralRole[]) {
  const session = await getCentralSession();
  if (!session) redirect('/admin/login');
  if (!allowed.includes(session.role)) redirect('/admin/access-denied');
  return session;
}

export { DEFAULT_PASSWORD };
