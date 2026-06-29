import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';

const root = process.cwd();

function mysqlHost(value) {
  const configured = value?.trim() || '127.0.0.1';
  try {
    return configured.includes('://') ? new URL(configured).hostname : configured.split('/')[0];
  } catch {
    return configured.replace(/^https?:\/\//i, '').split('/')[0];
  }
}

function mysqlPort(value) {
  const configured = Number(value ?? 3306);
  return Number.isInteger(configured) && configured > 0 && configured <= 65535 ? configured : 3306;
}

function connectionConfig() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) return { uri: databaseUrl, multipleStatements: true, timezone: '+05:30' };
  return {
    host: mysqlHost(process.env.MYSQL_HOST),
    port: mysqlPort(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE ?? 'ksfdc_central',
    multipleStatements: true,
    timezone: '+05:30'
  };
}

async function runSql(connection, relativePath) {
  const sql = await fs.readFile(path.join(root, relativePath), 'utf8');
  await connection.query(sql);
  console.log(`[db:fresh] applied ${relativePath}`);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function posterMetadata(posterUrl) {
  const fileName = String(posterUrl ?? '').split('/').filter(Boolean).pop() ?? null;
  return { storage: 'LOCAL_PATH', fileName };
}

async function seedMovieCatalogue(connection) {
  const raw = await fs.readFile(path.join(root, 'seed', 'movies.json'), 'utf8');
  const parsed = JSON.parse(raw);
  const movies = normalizeArray(parsed.data);
  for (const movie of movies) {
    const formats = normalizeArray(movie.show_details?.formats_available);
    const languages = normalizeArray(movie.show_details?.languages_available);
    await connection.execute(
      `INSERT INTO movies (
         id, title, language, duration_minutes, certificate, release_date, poster_url,
         youtube_trailer_url, synopsis, genre_json, cast_json, crew_json, formats_json,
         languages_json, poster_metadata, status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         language = VALUES(language),
         duration_minutes = VALUES(duration_minutes),
         certificate = VALUES(certificate),
         release_date = VALUES(release_date),
         poster_url = VALUES(poster_url),
         youtube_trailer_url = VALUES(youtube_trailer_url),
         synopsis = VALUES(synopsis),
         genre_json = VALUES(genre_json),
         cast_json = VALUES(cast_json),
         crew_json = VALUES(crew_json),
         formats_json = VALUES(formats_json),
         languages_json = VALUES(languages_json),
         poster_metadata = VALUES(poster_metadata),
         status = 'ACTIVE'`,
      [
        movie.movie_id,
        movie.title,
        movie.language ?? null,
        movie.runtime_minutes ?? null,
        movie.censor_rating ?? null,
        movie.release_date ?? null,
        movie.poster_url ?? null,
        movie.youtube_trailer_url ?? null,
        movie.synopsis ?? null,
        JSON.stringify(normalizeArray(movie.genre)),
        JSON.stringify(normalizeArray(movie.cast)),
        JSON.stringify(movie.crew ?? {}),
        JSON.stringify(formats),
        JSON.stringify(languages),
        JSON.stringify(posterMetadata(movie.poster_url))
      ]
    );
  }
  console.log(`[db:fresh] seeded ${movies.length} catalogue movies with local poster paths`);
}

async function main() {
  const connection = await mysql.createConnection(connectionConfig());
  try {
    if (process.argv.includes('--posters-only')) {
      await runSql(connection, 'sql/use-local-seed-posters.sql');
      console.log('[db:seed:posters] movie poster URLs updated to local seed files');
      return;
    }
    await runSql(connection, 'sql/reset-central.sql');
    await runSql(connection, 'sql/central_schema.sql');
    await runSql(connection, 'sql/seed-central.sql');
    await seedMovieCatalogue(connection);
    await runSql(connection, 'sql/use-local-seed-posters.sql');
    console.log('[db:fresh] central database reset and seeded successfully');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('[db:fresh] failed:', error);
  process.exitCode = 1;
});
