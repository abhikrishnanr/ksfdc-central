import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getCentralDbPool } from './db';

let centralHeartbeatTablesInitPromise: Promise<void> | null = null;
let centralMirrorEventsTableInitPromise: Promise<void> | null = null;
let centralSyncInboxInitPromise: Promise<void> | null = null;

async function addColumnIfMissing(tableName: string, columnName: string, definition: string) {
  const pool = getCentralDbPool();
  const [[row]] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  if (Number(row.cnt) === 0) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function addIndexIfMissing(tableName: string, indexName: string, definition: string) {
  const pool = getCentralDbPool();
  const [[row]] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  if (Number(row.cnt) === 0) {
    await pool.query(`ALTER TABLE ${tableName} ADD ${definition}`);
  }
}

async function dropIndexIfExists(tableName: string, indexName: string) {
  const pool = getCentralDbPool();
  const [[row]] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  if (Number(row.cnt) > 0) {
    await pool.query(`ALTER TABLE ${tableName} DROP INDEX ${indexName}`);
  }
}

async function ensureHeartbeatTheatreKey() {
  const pool = getCentralDbPool();
  const [[uniqueTheatreKey]] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'theatre_heartbeats'
       AND COLUMN_NAME = 'theatre_id'
       AND NON_UNIQUE = 0`,
  );
  if (Number(uniqueTheatreKey.cnt) > 0) return;

  await addColumnIfMissing(
    'theatre_heartbeats',
    'heartbeat_row_id',
    'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE FIRST',
  );
  await pool.query(
    `DELETE older
     FROM theatre_heartbeats older
     INNER JOIN theatre_heartbeats newer
       ON newer.theatre_id = older.theatre_id
      AND (
        newer.last_seen_at > older.last_seen_at
        OR (newer.last_seen_at = older.last_seen_at AND newer.heartbeat_row_id > older.heartbeat_row_id)
      )`,
  );
  await addIndexIfMissing(
    'theatre_heartbeats',
    'uq_theatre_heartbeats_theatre',
    'UNIQUE KEY uq_theatre_heartbeats_theatre (theatre_id)',
  );
}

async function initializeCentralHeartbeatTables() {
  await getCentralDbPool().query(`
    CREATE TABLE IF NOT EXISTS theatre_heartbeats (
      theatre_id VARCHAR(100) PRIMARY KEY,
      theatre_code VARCHAR(20) NULL,
      local_app_url VARCHAR(255) NULL,
      local_api_url VARCHAR(255) NULL,
      authority_mode VARCHAR(50) NOT NULL,
      last_local_sequence BIGINT NOT NULL DEFAULT 0,
      last_central_mirror_sequence BIGINT NOT NULL DEFAULT 0,
      pending_local_events INT NOT NULL DEFAULT 0,
      failed_local_events INT NOT NULL DEFAULT 0,
      trusted_for_admin_sync TINYINT(1) NOT NULL DEFAULT 0,
      status ENUM('ONLINE','OFFLINE') NOT NULL DEFAULT 'ONLINE',
      last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await addColumnIfMissing('theatre_heartbeats', 'theatre_code', 'VARCHAR(20) NULL');
  await addColumnIfMissing('theatre_heartbeats', 'local_api_url', 'VARCHAR(255) NULL');
  await addColumnIfMissing('theatre_heartbeats', 'failed_local_events', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing('theatre_heartbeats', 'trusted_for_admin_sync', 'TINYINT(1) NOT NULL DEFAULT 0');
  await ensureHeartbeatTheatreKey();
}

export function ensureCentralHeartbeatTables() {
  if (!centralHeartbeatTablesInitPromise) {
    centralHeartbeatTablesInitPromise = initializeCentralHeartbeatTables().catch((error: unknown) => {
      centralHeartbeatTablesInitPromise = null;
      throw error;
    });
  }

  return centralHeartbeatTablesInitPromise;
}


export type TheatreHealthStatus = 'ONLINE' | 'STALE' | 'OFFLINE';

export interface TheatreHealth {
  theatreId: string;
  status: TheatreHealthStatus;
  storedStatus: string;
  lastSeenAt: string | null;
  ageSeconds: number | null;
}


async function readTheatreHealth(theatreId: string, queryable: Pick<PoolConnection, 'query'>): Promise<TheatreHealth> {
  const [[row]] = await queryable.query<RowDataPacket[]>(
    `SELECT status, last_seen_at AS lastSeenAt, TIMESTAMPDIFF(SECOND, last_seen_at, NOW()) AS ageSeconds
     FROM theatre_heartbeats
     WHERE theatre_id = ?
     ORDER BY last_seen_at DESC
     LIMIT 1`,
    [theatreId]
  );

  if (!row) {
    return { theatreId, status: 'OFFLINE', storedStatus: 'OFFLINE', lastSeenAt: null, ageSeconds: null };
  }

  const ageSeconds = Number(row.ageSeconds ?? 0);
  const storedStatus = String(row.status);
  const status: TheatreHealthStatus = storedStatus === 'OFFLINE' || ageSeconds > 60 ? 'OFFLINE' : ageSeconds > 30 ? 'STALE' : 'ONLINE';

  return {
    theatreId,
    status,
    storedStatus,
    lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
    ageSeconds
  };
}

export async function getTheatreHealthWithConnection(connection: PoolConnection, theatreId: string): Promise<TheatreHealth> {
  return readTheatreHealth(theatreId, connection);
}

export async function getTheatreHealth(theatreId: string): Promise<TheatreHealth> {
  await ensureCentralHeartbeatTables();
  return readTheatreHealth(theatreId, getCentralDbPool());
}

export function ensureCentralMirrorEventsTable() {
  if (!centralMirrorEventsTableInitPromise) {
    centralMirrorEventsTableInitPromise = initializeCentralMirrorEventsTable().catch((error: unknown) => {
      centralMirrorEventsTableInitPromise = null;
      throw error;
    });
  }
  return centralMirrorEventsTableInitPromise;
}

async function initializeCentralMirrorEventsTable() {
  await getCentralDbPool().query(`
    CREATE TABLE IF NOT EXISTS central_mirror_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_id VARCHAR(100) NOT NULL UNIQUE,
      sequence_no BIGINT NOT NULL,
      theatre_id VARCHAR(100) NOT NULL,
      show_id VARCHAR(100) NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      payload JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_central_mirror_sequence (sequence_no),
      INDEX idx_central_mirror_theatre_sequence (theatre_id, sequence_no)
    )
  `);
}

export function ensureCentralSyncInbox() {
  if (!centralSyncInboxInitPromise) {
    centralSyncInboxInitPromise = initializeCentralSyncInbox().catch((error: unknown) => {
      centralSyncInboxInitPromise = null;
      throw error;
    });
  }
  return centralSyncInboxInitPromise;
}

async function initializeCentralSyncInbox() {
  await getCentralDbPool().query(`
    CREATE TABLE IF NOT EXISTS central_sync_inbox (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_id VARCHAR(100) NOT NULL UNIQUE,
      theatre_id VARCHAR(100) NOT NULL DEFAULT 'UNKNOWN',
      source_sequence_no BIGINT NOT NULL,
      event_type ENUM('BOOKING_CREATED','BOOKING_CANCELLED','PAYMENT_RECORDED','SHIFT_CLOSED','TICKET_REPRINTED') NOT NULL,
      payload JSON NOT NULL,
      received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_central_sync_theatre_sequence (theatre_id, source_sequence_no),
      INDEX idx_central_sync_inbox_theatre_received (theatre_id, received_at)
    )
  `);
  await addColumnIfMissing('central_sync_inbox', 'theatre_id', "VARCHAR(100) NOT NULL DEFAULT 'UNKNOWN'");
  await getCentralDbPool().query("ALTER TABLE central_sync_inbox MODIFY COLUMN event_type ENUM('BOOKING_CREATED','BOOKING_CANCELLED','PAYMENT_RECORDED','SHIFT_CLOSED','TICKET_REPRINTED') NOT NULL");
  await dropIndexIfExists('central_sync_inbox', 'uniq_source_sequence');
  await addIndexIfMissing('central_sync_inbox', 'uq_central_sync_theatre_sequence', 'UNIQUE KEY uq_central_sync_theatre_sequence (theatre_id, source_sequence_no)');
  await addIndexIfMissing('central_sync_inbox', 'idx_central_sync_inbox_theatre_received', 'INDEX idx_central_sync_inbox_theatre_received (theatre_id, received_at)');
  await getCentralDbPool().query(`
    CREATE OR REPLACE VIEW central_received_local_events AS
    SELECT
      event_id,
      theatre_id,
      JSON_UNQUOTE(JSON_EXTRACT(payload, '$.showId')) AS show_id,
      source_sequence_no AS sequence_no,
      event_type,
      payload,
      received_at
    FROM central_sync_inbox
  `);
  await getCentralDbPool().query(`
    CREATE TABLE IF NOT EXISTS central_sync_conflicts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_id VARCHAR(100) NOT NULL,
      theatre_id VARCHAR(100) NOT NULL,
      source_sequence_no BIGINT NOT NULL,
      show_id VARCHAR(100) NOT NULL,
      seat_id VARCHAR(30) NOT NULL,
      existing_booking_id VARCHAR(100) NULL,
      incoming_booking_id VARCHAR(100) NULL,
      conflict_type VARCHAR(50) NOT NULL DEFAULT 'SEAT_CONFLICT',
      error_message TEXT NULL,
      payload JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_central_sync_conflict_event_seat (event_id, seat_id),
      INDEX idx_central_sync_conflicts_show_created (show_id, created_at),
      INDEX idx_central_sync_conflicts_theatre_sequence (theatre_id, source_sequence_no)
    )
  `);
}

export async function getNextCentralMirrorSequence(connection: PoolConnection) {
  const [[sequenceRow]] = await connection.query<RowDataPacket[]>('SELECT COALESCE(MAX(sequence_no), 0) AS maxSequence FROM central_mirror_events FOR UPDATE');
  return Number(sequenceRow.maxSequence) + 1;
}
