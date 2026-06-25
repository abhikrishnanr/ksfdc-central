import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

function mysqlHost(value: string | undefined) {
  const configured = value?.trim() || '127.0.0.1';
  try {
    return configured.includes('://') ? new URL(configured).hostname : configured.split('/')[0];
  } catch {
    return configured.replace(/^https?:\/\//i, '').split('/')[0];
  }
}

function mysqlPort(value: string | undefined) {
  const configured = Number(value ?? 3306);
  return Number.isInteger(configured) && configured > 0 && configured <= 65535 ? configured : 3306;
}

export function getCentralDbPool() {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    const connectionDefaults = {
      timezone: '+05:30',
      waitForConnections: true,
      connectionLimit: 10,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    } as const;
    pool = databaseUrl
      ? mysql.createPool({ uri: databaseUrl, ...connectionDefaults })
      : mysql.createPool({
          host: mysqlHost(process.env.MYSQL_HOST),
          port: mysqlPort(process.env.MYSQL_PORT),
          user: process.env.MYSQL_USER ?? 'root',
          password: process.env.MYSQL_PASSWORD ?? '',
          database: process.env.MYSQL_DATABASE ?? 'ksfdc_central',
          ...connectionDefaults
        });
  }
  return pool;
}

type CentralDbStatus =
  | { ok: true; message: string }
  | { ok: false; message: string; error: string };

// Many page renders call several data loaders that each independently verify
// connectivity before running their real query (see `safe()` in central-data.ts).
// That's a sensible safety check, but doing a fresh `SELECT 1` round trip for
// every single loader on every request adds up fast and is a big part of why
// pages feel slow to leave their loading state. The DB's health doesn't change
// meaningfully within a few hundred milliseconds, so we memoize the result for
// a very short window and let concurrent/rapid checks share one round trip.
// This never touches booking, payment, or sync logic - it only short-circuits
// the connectivity probe itself.
const HEALTH_CHECK_TTL_MS = 1500;
let cachedStatus: CentralDbStatus | null = null;
let cachedAt = 0;
let inFlight: Promise<CentralDbStatus> | null = null;

async function probeCentralDb(): Promise<CentralDbStatus> {
  try {
    await getCentralDbPool().query('SELECT 1');
    return { ok: true, message: 'Connected to central MySQL database.' };
  } catch (error) {
    return {
      ok: false,
      message: 'Central database is unavailable or not seeded.',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function checkCentralDb(): Promise<CentralDbStatus> {
  const now = Date.now();
  if (cachedStatus && now - cachedAt < HEALTH_CHECK_TTL_MS) {
    return cachedStatus;
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = probeCentralDb().then((status) => {
    cachedStatus = status;
    cachedAt = Date.now();
    inFlight = null;
    return status;
  });
  return inFlight;
}
