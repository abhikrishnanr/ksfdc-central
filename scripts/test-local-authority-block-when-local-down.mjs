import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

loadEnvFile(path.join(appDir, '.env.local'));
loadEnvFile(path.join(appDir, '.env'));

function createPool() {
  if (process.env.DATABASE_URL?.trim()) return mysql.createPool(process.env.DATABASE_URL.trim());
  return mysql.createPool({
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE ?? 'ksfdc_central',
    waitForConnections: true,
    connectionLimit: 4
  });
}

async function main() {
  const baseUrl = (process.env.CENTRAL_TEST_BASE_URL ?? process.env.NEXT_PUBLIC_CENTRAL_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const requestedShowId = process.env.TEST_SHOW_ID;
  const pool = createPool();
  let originalHeartbeat = null;
  let restoreTheatreId = null;

  try {
    const [[show]] = await pool.query(
      `SELECT s.id AS showId, s.theatre_id AS theatreId, s.layout_id AS layoutId
       FROM shows s
       WHERE (? IS NULL OR s.id = ?)
         AND s.authority_mode = 'LOCAL_AUTHORITY_ONLINE'
         AND s.status = 'OPEN'
       ORDER BY s.show_time
       LIMIT 1`,
      [requestedShowId ?? null, requestedShowId ?? null]
    );

    if (!show) throw new Error('No OPEN LOCAL_AUTHORITY_ONLINE show found. Set TEST_SHOW_ID to a seeded local-authority show.');
    restoreTheatreId = show.theatreId;

    const [[seat]] = await pool.query(
      `SELECT sls.seat_id AS seatId
       FROM seat_layout_seats sls
       LEFT JOIN central_confirmed_seats c ON c.show_id = ? AND c.seat_id = sls.seat_id
       WHERE sls.layout_id = ?
         AND sls.item_type = 'SEAT'
         AND sls.is_blocked = 0
         AND c.seat_id IS NULL
       ORDER BY sls.row_label, sls.display_order
       LIMIT 1`,
      [show.showId, show.layoutId]
    );

    if (!seat) throw new Error(`No available seat found for ${show.showId}.`);

    const [[heartbeat]] = await pool.query(
      `SELECT status, last_seen_at AS lastSeenAt, trusted_for_admin_sync AS trustedForAdminSync
       FROM theatre_heartbeats
       WHERE theatre_id = ?
       LIMIT 1`,
      [show.theatreId]
    );
    originalHeartbeat = heartbeat ?? null;

    await pool.query(
      `INSERT INTO theatre_heartbeats (theatre_id, authority_mode, status, trusted_for_admin_sync, last_seen_at)
       VALUES (?, 'LOCAL_AUTHORITY_ONLINE', 'ONLINE', 1, DATE_SUB(NOW(), INTERVAL 10 MINUTE))
       ON DUPLICATE KEY UPDATE
         authority_mode = 'LOCAL_AUTHORITY_ONLINE',
         status = 'ONLINE',
         trusted_for_admin_sync = 1,
         last_seen_at = DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
      [show.theatreId]
    );

    const [[before]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM central_seat_holds WHERE show_id = ?) AS holds,
         (SELECT COUNT(*) FROM central_bookings WHERE show_id = ?) AS bookings,
         (SELECT COUNT(*) FROM central_confirmed_seats WHERE show_id = ? AND seat_id = ?) AS confirmedSeat`,
      [show.showId, show.showId, show.showId, seat.seatId]
    );

    const seatsResponse = await fetch(`${baseUrl}/api/shows/${encodeURIComponent(show.showId)}/seats`, { cache: 'no-store' });
    const seatsBody = await seatsResponse.json().catch(() => ({}));

    const response = await fetch(`${baseUrl}/api/bookings/hold`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `authority-down-test-${Date.now()}`
      },
      body: JSON.stringify({ showId: show.showId, seatIds: [seat.seatId], customerName: 'authority-test@example.test' })
    });
    const body = await response.json().catch(() => ({}));

    const [[after]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM central_seat_holds WHERE show_id = ?) AS holds,
         (SELECT COUNT(*) FROM central_bookings WHERE show_id = ?) AS bookings,
         (SELECT COUNT(*) FROM central_confirmed_seats WHERE show_id = ? AND seat_id = ?) AS confirmedSeat`,
      [show.showId, show.showId, show.showId, seat.seatId]
    );

    const holdRejected = !response.ok && (response.status === 409 || response.status === 503) && body.error === 'SHOW_TEMPORARILY_UNAVAILABLE';
    const seatsBlocked = seatsResponse.ok && seatsBody.bookingEnabled === false;
    const noCentralWrite = Number(after.holds) === Number(before.holds)
      && Number(after.bookings) === Number(before.bookings)
      && Number(after.confirmedSeat) === Number(before.confirmedSeat);

    console.log(JSON.stringify({
      success: seatsBlocked && holdRejected && noCentralWrite,
      showId: show.showId,
      theatreId: show.theatreId,
      seatId: seat.seatId,
      seatsStatus: seatsResponse.status,
      seatsBookingEnabled: seatsBody.bookingEnabled,
      seatsUnavailableMessage: seatsBody.unavailableMessage,
      holdStatus: response.status,
      holdBody: body,
      noCentralWrite,
      before,
      after
    }, null, 2));

    if (!seatsBlocked) throw new Error(`Expected seat status to be blocked, received HTTP ${seatsResponse.status} bookingEnabled=${seatsBody.bookingEnabled}.`);
    if (!holdRejected) throw new Error(`Expected SHOW_TEMPORARILY_UNAVAILABLE, received HTTP ${response.status}.`);
    if (!noCentralWrite) throw new Error('Central hold/booking/confirmed-seat count changed while local authority was stale.');
  } finally {
    if (originalHeartbeat) {
      await pool.query(
        `UPDATE theatre_heartbeats
         SET status = ?, trusted_for_admin_sync = ?, last_seen_at = ?
         WHERE theatre_id = ?`,
        [originalHeartbeat.status, originalHeartbeat.trustedForAdminSync, originalHeartbeat.lastSeenAt, restoreTheatreId]
      ).catch(() => undefined);
    } else if (restoreTheatreId) {
      await pool.query('DELETE FROM theatre_heartbeats WHERE theatre_id = ?', [restoreTheatreId]).catch(() => undefined);
    }
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
