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

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows?.[0]?.count ?? 0) > 0;
}

async function ensurePosterMetadataColumn(connection) {
  if (await columnExists(connection, 'movies', 'poster_metadata')) return true;
  try {
    await connection.query('ALTER TABLE movies ADD COLUMN poster_metadata JSON NULL');
    console.log('[db:fresh] added movies.poster_metadata');
    return true;
  } catch (error) {
    console.warn(`[db:fresh] movies.poster_metadata unavailable; updating poster_url only (${error.code ?? error.message})`);
    return false;
  }
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
  const hasPosterMetadata = await ensurePosterMetadataColumn(connection);
  for (const movie of movies) {
    const formats = normalizeArray(movie.show_details?.formats_available);
    const languages = normalizeArray(movie.show_details?.languages_available);
    const metadataColumn = hasPosterMetadata ? ', poster_metadata' : '';
    const metadataValue = hasPosterMetadata ? ', ?' : '';
    const metadataUpdate = hasPosterMetadata ? ', poster_metadata = VALUES(poster_metadata)' : '';
    const values = [
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
      JSON.stringify(languages)
    ];
    if (hasPosterMetadata) values.push(JSON.stringify(posterMetadata(movie.poster_url)));
    await connection.execute(
      `INSERT INTO movies (
         id, title, language, duration_minutes, certificate, release_date, poster_url,
         youtube_trailer_url, synopsis, genre_json, cast_json, crew_json, formats_json,
         languages_json${metadataColumn}, status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${metadataValue}, 'ACTIVE')
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
         languages_json = VALUES(languages_json)${metadataUpdate},
         status = 'ACTIVE'`,
      values
    );
  }
  console.log(`[db:fresh] seeded ${movies.length} catalogue movies with local poster paths`);
}

async function seedLocalPosters(connection) {
  const hasPosterMetadata = await ensurePosterMetadataColumn(connection);
  const posters = [
    ['drishyam_3_2026', '/seed/movie-posters/Drishyam_3_poster.jpg'],
    ['athiradi_2026', '/seed/movie-posters/Athiradi.jpg'],
    ['mollywood_times_2026', '/seed/movie-posters/mollywood-times_.jpg'],
    ['secret_of_kalinga_2026', '/seed/movie-posters/secret_of_kalinga.jpg'],
    ['varavu_2026', '/seed/movie-posters/varavu.jpg']
  ];

  for (const [movieId, posterUrl] of posters) {
    if (hasPosterMetadata) {
      await connection.execute(
        `UPDATE movies
         SET poster_url = ?,
             poster_metadata = ?
         WHERE id = ?`,
        [posterUrl, JSON.stringify(posterMetadata(posterUrl)), movieId]
      );
    } else {
      await connection.execute(
        `UPDATE movies
         SET poster_url = ?
         WHERE id = ?`,
        [posterUrl, movieId]
      );
    }
  }
  console.log(`[db:seed:posters] updated ${posters.length} movie poster URLs to local seed files`);
}

async function main() {
  const connection = await mysql.createConnection(connectionConfig());
  try {
    if (process.argv.includes('--posters-only')) {
      await seedLocalPosters(connection);
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
