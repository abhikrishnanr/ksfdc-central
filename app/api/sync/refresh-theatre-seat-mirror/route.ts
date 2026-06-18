import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { getCentralDbPool } from '../../../../lib/db';
import { getLocalShowSeats, requestLocalTheatreApi } from '../../../../lib/local-theatre-client';

export const dynamic = 'force-dynamic';

async function ensureCentralOutbox() {
  await getCentralDbPool().query(`
    CREATE TABLE IF NOT EXISTS central_sync_outbox (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_id CHAR(36) NOT NULL UNIQUE,
      sequence_no BIGINT NOT NULL UNIQUE,
      event_type ENUM('CENTRAL_BOOKING_CONFIRMED') NOT NULL,
      payload JSON NOT NULL,
      status ENUM('PENDING','FAILED','SENT') NOT NULL DEFAULT 'PENDING',
      retry_count INT NOT NULL DEFAULT 0,
      error_message TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

async function pushCentralOutboxToLocal() {
  await ensureCentralOutbox();
  const pool = getCentralDbPool();
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT event_id AS eventId, sequence_no AS sequenceNo, event_type AS eventType, payload, created_at AS createdAt
    FROM central_sync_outbox
    WHERE status IN ('PENDING','FAILED')
    ORDER BY sequence_no ASC
    LIMIT 100
  `);

  if (!rows.length) return { sent: 0, acceptedSequenceNo: null as number | null };

  const events = rows.map((row) => ({
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
  }));

  try {
    const payload = await requestLocalTheatreApi<{ acceptedSequenceNo?: number }>('/api/central/sync-receiver', {
      method: 'POST',
      body: { events }
    });
    const acceptedSequenceNo = Number(payload.acceptedSequenceNo ?? 0);
    await pool.query(
      `UPDATE central_sync_outbox
       SET status = CASE WHEN sequence_no <= ? THEN 'SENT' ELSE status END,
           error_message = CASE WHEN sequence_no <= ? THEN NULL ELSE error_message END
       WHERE sequence_no IN (?)`,
      [acceptedSequenceNo, acceptedSequenceNo, rows.map((row) => row.sequenceNo)]
    );
    return { sent: rows.length, acceptedSequenceNo };
  } catch {
    await pool.query(
      "UPDATE central_sync_outbox SET status = 'FAILED', retry_count = retry_count + 1, error_message = ? WHERE sequence_no IN (?)",
      ['Local receiver rejected sync request', rows.map((row) => row.sequenceNo)]
    );
    return { sent: rows.length, acceptedSequenceNo: null as number | null };
  }
}

async function pullLocalMirror() {
  const pool = getCentralDbPool();
  const [shows] = await pool.query<RowDataPacket[]>(`
    SELECT id, authority_mode AS authorityMode
    FROM shows
    WHERE DATE(show_time) = CURRENT_DATE()
      AND authority_mode IN ('LOCAL','LOCAL_AUTHORITY_ONLINE','LOCAL_AUTHORITY_OFFLINE')
  `);
  let mirroredSeats = 0;

  for (const show of shows) {
    try {
      const payload = await getLocalShowSeats(String(show.id));
      const soldSeats = (payload.rows ?? []).flatMap((row) => row.cells ?? []).filter((cell) => cell.kind === 'SEAT' && cell.seatId && cell.status === 'SOLD');
      for (const seat of soldSeats) {
        const bookingId = `LOCAL_MIRROR_${show.id}_${seat.seatId}`;
        await pool.query(
          `INSERT INTO central_bookings (id, show_id, idempotency_key, customer_name, channel, status, total_amount)
           VALUES (?, ?, ?, 'Local mirror refresh', 'COUNTER', 'CONFIRMED', ?)
           ON DUPLICATE KEY UPDATE total_amount = VALUES(total_amount)`,
          [bookingId, show.id, `mirror-${show.id}-${seat.seatId}`, Number(seat.rate ?? 0)]
        );
        await pool.query(
          `INSERT IGNORE INTO central_booking_items (booking_id, show_id, seat_id, zone, amount)
           VALUES (?, ?, ?, ?, ?)`,
          [bookingId, show.id, seat.seatId, seat.zone ?? 'SILVER', Number(seat.rate ?? 0)]
        );
        await pool.query(
          `INSERT IGNORE INTO central_confirmed_seats (show_id, seat_id, booking_id, channel, amount)
           VALUES (?, ?, ?, 'COUNTER', ?)`,
          [show.id, seat.seatId, bookingId, Number(seat.rate ?? 0)]
        );
        mirroredSeats += 1;
      }
    } catch {
      continue;
    }
  }
  return { showsChecked: shows.length, mirroredSeats };
}

async function getLatestLocalReceivedSequence() {
  const [[row]] = await getCentralDbPool().query<RowDataPacket[]>(
    'SELECT MAX(source_sequence_no) AS latestReceivedSequenceNo FROM central_sync_inbox'
  );
  return row?.latestReceivedSequenceNo == null ? null : Number(row.latestReceivedSequenceNo);
}

export async function POST() {
  const pushed = await pushCentralOutboxToLocal();
  const pulled = await pullLocalMirror();
  const latestReceivedSequenceNo = await getLatestLocalReceivedSequence();
  return NextResponse.json({ pushed, pulled, latestReceivedSequenceNo, refreshedAt: new Date().toISOString() });
}
