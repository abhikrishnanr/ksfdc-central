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
    pool = databaseUrl
      ? mysql.createPool(databaseUrl)
      : mysql.createPool({
          host: mysqlHost(process.env.MYSQL_HOST),
          port: mysqlPort(process.env.MYSQL_PORT),
          user: process.env.MYSQL_USER ?? 'root',
          password: process.env.MYSQL_PASSWORD ?? '',
          database: process.env.MYSQL_DATABASE ?? 'ksfdc_central',
          waitForConnections: true,
          connectionLimit: 10,
          enableKeepAlive: true,
          keepAliveInitialDelay: 0
        });
  }
  return pool;
}

export async function checkCentralDb() {
  try {
    await getCentralDbPool().query('SELECT 1');
    return { ok: true as const, message: 'Connected to central MySQL database.' };
  } catch (error) {
    return {
      ok: false as const,
      message: 'Central database is unavailable or not seeded.',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
