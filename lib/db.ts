import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

export function getCentralDbPool() {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    pool = databaseUrl
      ? mysql.createPool(databaseUrl)
      : mysql.createPool({
          host: process.env.MYSQL_HOST ?? '127.0.0.1',
          port: Number(process.env.MYSQL_PORT ?? 3306),
          user: process.env.MYSQL_USER ?? 'root',
          password: process.env.MYSQL_PASSWORD ?? '',
          database: process.env.MYSQL_DATABASE ?? 'ksfdc_central',
          waitForConnections: true,
          connectionLimit: 10
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
