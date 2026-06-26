import { createHash, randomUUID } from 'crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getCentralDbPool } from './db';
import { getCentralSession, writeCentralAuditLog, type CentralRole, type CentralSession } from './auth';
import { ensureCentralHeartbeatTables } from './sync';
import type { AuthorityMode } from './types';

export const SHOW_SCHEDULING_AUTHORITY_MODES = [
  'LOCAL_AUTHORITY_ONLINE',
  'CENTRAL_AUTHORITY',
  'LOCAL_AUTHORITY_OFFLINE'
] as const;

export type SchedulingAuthorityMode = typeof SHOW_SCHEDULING_AUTHORITY_MODES[number];

export const SCHEDULING_AUTHORITY_LABELS: Record<SchedulingAuthorityMode, string> = {
  LOCAL_AUTHORITY_ONLINE: 'Both Centralised and Local Server Booking',
  CENTRAL_AUTHORITY: 'Centralised Booking Only',
  LOCAL_AUTHORITY_OFFLINE: 'Local Server Booking Only'
};

export type AdminOperationResult = { success: true; id?: string; message?: string } | { success: false; error: string; message: string; details?: unknown };

export class AdminManagementError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'AdminManagementError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Queryable = Pick<PoolConnection, 'query'>;
type SeatItemType = 'SEAT' | 'GAP' | 'AISLE' | 'BLOCKED';

export interface NormalizedSeatCell {
  seatId: string;
  rowLabel: string;
  rowSort: number;
  seatNumber: string | null;
  zoneCode: string | null;
  itemType: SeatItemType;
  displayOrder: number;
  gapWidth: number | null;
  isBlocked: boolean;
  accessibility: string | null;
}

export interface SeatMapValidationResult {
  name: string;
  screenSideLabel: string;
  seatCount: number;
  rows: Array<{ rowLabel: string; cells: NormalizedSeatCell[] }>;
  zones: string[];
  normalized: Record<string, unknown>;
  fingerprint: string;
}

export interface ShowImpactSummary {
  confirmedBookings: number;
  tickets: number;
  activeHolds: number;
  pendingPayments: number;
  localCounterSales: number;
  unsyncedLocalTransactions: number;
  hasBookingRecords: boolean;
}

let adminManagementSchemaPromise: Promise<void> | null = null;

function slug(value: unknown, fallback = 'ITEM') {
  const text = String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return text || fallback;
}

function stringValue(value: unknown, field: string, max = 190) {
  const text = String(value ?? '').trim();
  if (!text) throw new AdminManagementError('VALIDATION_ERROR', `${field} is required.`);
  if (text.length > max) throw new AdminManagementError('VALIDATION_ERROR', `${field} is too long.`);
  return text;
}

function optionalString(value: unknown, max = 500) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
}

function boolValue(value: unknown) {
  return value === true || value === 'true' || value === '1' || value === 'on';
}

function numberValue(value: unknown, field: string, fallback?: number) {
  if ((value == null || value === '') && fallback != null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new AdminManagementError('VALIDATION_ERROR', `${field} must be a number.`);
  return parsed;
}

function mysqlDateTime(value: Date) {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function serializeDateTime(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return mysqlDateTime(value);
  return String(value);
}

function parseLocalDateTime(dateValue: unknown, timeValue: unknown, field: string) {
  const date = stringValue(dateValue, `${field} date`, 20);
  const time = stringValue(timeValue, `${field} time`, 20);
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const parsed = new Date(`${date}T${normalizedTime}`);
  if (Number.isNaN(parsed.getTime())) throw new AdminManagementError('VALIDATION_ERROR', `${field} is invalid.`);
  return mysqlDateTime(parsed);
}

function parseMaybeDateTime(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new AdminManagementError('VALIDATION_ERROR', 'Date/time is invalid.');
  return mysqlDateTime(parsed);
}

async function columnExists(tableName: string, columnName: string) {
  const [[row]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(row.cnt) > 0;
}

async function addColumnIfMissing(tableName: string, columnName: string, definition: string) {
  if (!(await columnExists(tableName, columnName))) {
    await getCentralDbPool().query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function addIndexIfMissing(tableName: string, indexName: string, definition: string) {
  const [[row]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  if (Number(row.cnt) === 0) {
    await getCentralDbPool().query(`ALTER TABLE ${tableName} ADD ${definition}`);
  }
}

async function modifyColumnSafe(sql: string) {
  try {
    await getCentralDbPool().query(sql);
  } catch {
    // Older hosted MySQL variants can reject enum widening when existing data
    // already matches. The additive columns/tables still keep management safe.
  }
}

export async function ensureAdminManagementSchema() {
  if (!adminManagementSchemaPromise) {
    adminManagementSchemaPromise = initializeAdminManagementSchema().catch((error) => {
      adminManagementSchemaPromise = null;
      throw error;
    });
  }
  return adminManagementSchemaPromise;
}

async function initializeAdminManagementSchema() {
  await ensureCentralHeartbeatTables();
  await modifyColumnSafe("ALTER TABLE theatres MODIFY COLUMN status ENUM('ACTIVE','DISABLED','ARCHIVED','INACTIVE') NOT NULL DEFAULT 'ACTIVE'");
  await modifyColumnSafe("ALTER TABLE screens ADD COLUMN status ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE'");
  await modifyColumnSafe("ALTER TABLE movies MODIFY COLUMN status ENUM('ACTIVE','DISABLED','ARCHIVED','INACTIVE') NOT NULL DEFAULT 'ACTIVE'");
  await modifyColumnSafe("ALTER TABLE seat_layouts ADD COLUMN status ENUM('ACTIVE','RETIRED') NOT NULL DEFAULT 'ACTIVE'");
  await modifyColumnSafe("ALTER TABLE shows MODIFY COLUMN status ENUM('SCHEDULED','OPEN','CLOSED','CANCELLED','RESCHEDULED') NOT NULL DEFAULT 'OPEN'");

  await addColumnIfMissing('theatres', 'address', 'TEXT NULL');
  await addColumnIfMissing('theatres', 'contact_phone', 'VARCHAR(40) NULL');
  await addColumnIfMissing('theatres', 'timezone', "VARCHAR(80) NOT NULL DEFAULT 'Asia/Kolkata'");
  await addColumnIfMissing('theatres', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

  await addColumnIfMissing('screens', 'capacity', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing('screens', 'status', "ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE'");
  await addColumnIfMissing('screens', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

  await addColumnIfMissing('movies', 'poster_metadata', 'JSON NULL');
  await addColumnIfMissing('movies', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

  await addColumnIfMissing('seat_layouts', 'version_no', 'INT NOT NULL DEFAULT 1');
  await addColumnIfMissing('seat_layouts', 'parent_layout_id', 'VARCHAR(100) NULL');
  await addColumnIfMissing('seat_layouts', 'status', "ENUM('ACTIVE','RETIRED') NOT NULL DEFAULT 'ACTIVE'");
  await addColumnIfMissing('seat_layouts', 'layout_json', 'JSON NULL');
  await addColumnIfMissing('seat_layouts', 'source_filename', 'VARCHAR(190) NULL');
  await addColumnIfMissing('seat_layouts', 'fingerprint', 'CHAR(64) NULL');
  await addColumnIfMissing('seat_layouts', 'seat_count', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing('seat_layouts', 'created_by', 'VARCHAR(80) NULL');
  await addIndexIfMissing('seat_layouts', 'idx_seat_layout_version', 'INDEX idx_seat_layout_version (screen_id, version_no)');
  await addIndexIfMissing('seat_layouts', 'idx_seat_layout_fingerprint', 'INDEX idx_seat_layout_fingerprint (screen_id, fingerprint)');

  await addColumnIfMissing('shows', 'show_end_time', 'DATETIME NULL');
  await addColumnIfMissing('shows', 'booking_opens_at', 'DATETIME NULL');
  await addColumnIfMissing('shows', 'booking_closes_at', 'DATETIME NULL');
  await addColumnIfMissing('shows', 'cleaning_buffer_minutes', 'INT NOT NULL DEFAULT 20');
  await addColumnIfMissing('shows', 'reschedule_count', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing('shows', 'cancelled_at', 'TIMESTAMP NULL');
  await addColumnIfMissing('shows', 'cancellation_reason', 'TEXT NULL');
  await addColumnIfMissing('shows', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  await addIndexIfMissing('shows', 'idx_shows_screen_time_status', 'INDEX idx_shows_screen_time_status (screen_id, show_time, status)');

  await getCentralDbPool().query(`
    CREATE TABLE IF NOT EXISTS show_change_history (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      show_id VARCHAR(80) NOT NULL,
      action VARCHAR(80) NOT NULL,
      admin_user_id VARCHAR(80) NULL,
      reason TEXT NULL,
      previous_values JSON NULL,
      new_values JSON NULL,
      affected_booking_count INT NOT NULL DEFAULT 0,
      affected_ticket_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_show_change_history_show (show_id, created_at)
    )
  `);

  await getCentralDbPool().query(`
    CREATE TABLE IF NOT EXISTS show_reschedules (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      show_id VARCHAR(80) NOT NULL,
      previous_show_time DATETIME NOT NULL,
      new_show_time DATETIME NOT NULL,
      previous_end_time DATETIME NULL,
      new_end_time DATETIME NULL,
      reason TEXT NOT NULL,
      admin_user_id VARCHAR(80) NULL,
      affected_booking_count INT NOT NULL DEFAULT 0,
      affected_ticket_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_show_reschedules_show (show_id, created_at)
    )
  `);

  await getCentralDbPool().query(`
    CREATE TABLE IF NOT EXISTS show_cancellations (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      show_id VARCHAR(80) NOT NULL,
      reason TEXT NOT NULL,
      admin_user_id VARCHAR(80) NULL,
      affected_booking_count INT NOT NULL DEFAULT 0,
      affected_ticket_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_show_cancellation (show_id)
    )
  `);

  await getCentralDbPool().query(`
    CREATE TABLE IF NOT EXISTS notification_outbox (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_id CHAR(36) NOT NULL UNIQUE,
      channel VARCHAR(30) NOT NULL DEFAULT 'EMAIL',
      notification_type VARCHAR(80) NOT NULL,
      recipient VARCHAR(190) NULL,
      booking_id VARCHAR(100) NULL,
      show_id VARCHAR(100) NULL,
      subject VARCHAR(255) NOT NULL,
      payload JSON NOT NULL,
      status ENUM('PENDING','SENT','FAILED','SKIPPED') NOT NULL DEFAULT 'PENDING',
      attempts INT NOT NULL DEFAULT 0,
      last_error TEXT NULL,
      available_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_notification_outbox_status (status, available_at),
      INDEX idx_notification_outbox_show (show_id, created_at)
    )
  `);

  await getCentralDbPool().query(`
    CREATE TABLE IF NOT EXISTS schedule_sync_outbox (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_id CHAR(36) NOT NULL UNIQUE,
      theatre_id VARCHAR(100) NOT NULL,
      entity_type VARCHAR(40) NOT NULL,
      entity_id VARCHAR(100) NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      payload JSON NOT NULL,
      requires_ack TINYINT(1) NOT NULL DEFAULT 0,
      status ENUM('PENDING','ACKED','FAILED') NOT NULL DEFAULT 'PENDING',
      retry_count INT NOT NULL DEFAULT 0,
      error_message TEXT NULL,
      acked_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_schedule_sync_theatre (theatre_id, id),
      INDEX idx_schedule_sync_status (status, created_at)
    )
  `);

  await getCentralDbPool().query(`
    CREATE TABLE IF NOT EXISTS schedule_sync_acknowledgements (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_id CHAR(36) NOT NULL,
      theatre_id VARCHAR(100) NOT NULL,
      local_sequence_no BIGINT NULL,
      status ENUM('ACKED','FAILED') NOT NULL DEFAULT 'ACKED',
      message TEXT NULL,
      acknowledged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_schedule_sync_ack_event_theatre (event_id, theatre_id)
    )
  `);

  await getCentralDbPool().query(`
    CREATE TABLE IF NOT EXISTS refund_records (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      booking_id VARCHAR(100) NOT NULL,
      payment_id VARCHAR(100) NULL,
      show_id VARCHAR(100) NOT NULL,
      amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      status ENUM('REFUND_PENDING','REFUND_PROCESSING','REFUNDED','REFUND_FAILED','NOT_REQUIRED') NOT NULL DEFAULT 'REFUND_PENDING',
      reason TEXT NULL,
      gateway_reference VARCHAR(190) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_refund_booking_payment (booking_id, payment_id),
      INDEX idx_refund_show_status (show_id, status)
    )
  `);
}

export async function requireAdminApi(allowed: CentralRole[]) {
  const session = await getCentralSession();
  if (!session) throw new AdminManagementError('UNAUTHENTICATED', 'Admin login is required.', 401);
  if (!allowed.includes(session.role)) throw new AdminManagementError('FORBIDDEN', 'This admin role is not allowed to perform this operation.', 403);
  return session;
}

function assertTheatreScope(session: CentralSession, theatreId: string) {
  if (session.role === 'SUPER_ADMIN') return;
  if (session.theatreId && session.theatreId === theatreId) return;
  throw new AdminManagementError('FORBIDDEN', 'This theatre is outside your admin scope.', 403);
}

export function adminErrorPayload(error: unknown): AdminOperationResult {
  if (error instanceof AdminManagementError) {
    return { success: false, error: error.code, message: error.message, details: error.details };
  }
  return { success: false, error: 'SERVER_ERROR', message: error instanceof Error ? error.message : 'Unable to complete the operation.' };
}

function parsePossibleJson(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new AdminManagementError('INVALID_SEAT_MAP_JSON', 'Seat-map JSON could not be parsed.');
  }
}

function normalizedRowLabel(value: unknown, fallback: string) {
  const text = String(value ?? fallback).trim().toUpperCase();
  return text || fallback;
}

function cellKind(value: unknown, blocked: boolean): SeatItemType {
  const text = String(value ?? '').trim().toUpperCase();
  if (blocked) return 'BLOCKED';
  if (text === 'GAP' || text === 'AISLE' || text === 'BLOCKED' || text === 'SEAT') return text;
  return text === 'SPACE' ? 'GAP' : 'SEAT';
}

function collectRowsFromSeatMap(input: Record<string, unknown>) {
  if (Array.isArray(input.rows)) return input.rows;
  if (Array.isArray(input.layout)) return input.layout;
  if (Array.isArray(input.zones)) {
    return input.zones.flatMap((zone) => {
      const zoneRecord = zone && typeof zone === 'object' ? zone as Record<string, unknown> : {};
      const rows = Array.isArray(zoneRecord.rows) ? zoneRecord.rows : [];
      return rows.map((row) => ({ ...(row && typeof row === 'object' ? row as Record<string, unknown> : {}), zone: zoneRecord.zone ?? zoneRecord.name ?? zoneRecord.code }));
    });
  }
  if (Array.isArray(input.seats)) {
    const rows = new Map<string, Record<string, unknown>[]>();
    for (const seat of input.seats) {
      const seatRecord = seat && typeof seat === 'object' ? seat as Record<string, unknown> : {};
      const rowLabel = normalizedRowLabel(seatRecord.rowLabel ?? seatRecord.row ?? seatRecord.row_label, 'A');
      rows.set(rowLabel, [...(rows.get(rowLabel) ?? []), seatRecord]);
    }
    return Array.from(rows, ([rowLabel, seats]) => ({ rowLabel, seats }));
  }
  return [];
}

export function validateSeatMapJson(raw: unknown): SeatMapValidationResult {
  const parsed = parsePossibleJson(raw);
  const input = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  if (!input) throw new AdminManagementError('INVALID_SEAT_MAP_JSON', 'Seat-map file must contain a JSON object.');

  const rows = collectRowsFromSeatMap(input);
  if (!rows.length) throw new AdminManagementError('INVALID_SEAT_MAP_STRUCTURE', 'Seat-map JSON must contain rows, zones[].rows, layout, or seats.');

  const seenSeatIds = new Set<string>();
  const zones = new Set<string>();
  const normalizedRows: Array<{ rowLabel: string; cells: NormalizedSeatCell[] }> = [];
  let seatCount = 0;

  rows.forEach((row, rowIndex) => {
    const rowRecord = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    const rowLabel = normalizedRowLabel(rowRecord.rowLabel ?? rowRecord.label ?? rowRecord.row ?? rowRecord.row_label, String.fromCharCode(65 + rowIndex));
    const cells = Array.isArray(rowRecord.cells) ? rowRecord.cells : Array.isArray(rowRecord.seats) ? rowRecord.seats : [];
    if (!cells.length) return;

    const normalizedCells: NormalizedSeatCell[] = cells.map((cell, index) => {
      const record: Record<string, unknown> = cell && typeof cell === 'object' ? cell as Record<string, unknown> : { seatNumber: cell };
      const blocked = boolValue(record.isBlocked ?? record.blocked) || String(record.status ?? '').toUpperCase() === 'BLOCKED';
      const kind = cellKind(record.kind ?? record.type ?? record.itemType ?? record.item_type, blocked);
      const seatNumber = kind === 'SEAT' || kind === 'BLOCKED'
        ? String(record.seatNumber ?? record.number ?? record.label ?? index + 1)
        : null;
      const zoneCode = optionalString(record.zone ?? record.zoneCode ?? record.category ?? rowRecord.zone ?? rowRecord.category, 80);
      if (zoneCode) zones.add(zoneCode);
      const seatId = optionalString(record.seatId ?? record.id ?? record.seat_id, 80)
        ?? `${rowLabel}${seatNumber ?? `${kind}_${index + 1}`}`;
      if ((kind === 'SEAT' || kind === 'BLOCKED') && seenSeatIds.has(seatId)) {
        throw new AdminManagementError('DUPLICATE_SEAT_ID', `Seat ID ${seatId} appears more than once.`);
      }
      if (kind === 'SEAT' || kind === 'BLOCKED') {
        seenSeatIds.add(seatId);
        seatCount += 1;
      }
      return {
        seatId,
        rowLabel,
        rowSort: Number(rowRecord.rowSort ?? rowRecord.sort ?? rowIndex),
        seatNumber,
        zoneCode,
        itemType: kind,
        displayOrder: Number(record.displayOrder ?? record.order ?? index + 1),
        gapWidth: record.gapWidth == null ? null : Number(record.gapWidth),
        isBlocked: blocked || kind === 'BLOCKED',
        accessibility: optionalString(record.accessibility ?? record.accessibilityLabel, 80)
      };
    });
    normalizedRows.push({ rowLabel, cells: normalizedCells });
  });

  if (seatCount === 0) throw new AdminManagementError('INVALID_SEAT_MAP_STRUCTURE', 'Seat-map must contain at least one usable seat.');

  const normalized = {
    name: optionalString(input.name, 150) ?? 'Seat layout',
    screenSideLabel: optionalString(input.screenSideLabel ?? input.screen_side_label, 80) ?? 'SCREEN THIS SIDE',
    rows: normalizedRows,
    zones: Array.from(zones)
  };
  return {
    name: String(normalized.name),
    screenSideLabel: String(normalized.screenSideLabel),
    seatCount,
    rows: normalizedRows,
    zones: Array.from(zones),
    normalized,
    fingerprint: createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
  };
}

async function getNextLayoutVersion(connection: Queryable, screenId: string) {
  const [[row]] = await connection.query<RowDataPacket[]>('SELECT COALESCE(MAX(version_no), 0) + 1 AS nextVersion FROM seat_layouts WHERE screen_id = ?', [screenId]);
  return Number(row.nextVersion ?? 1);
}

async function insertSeatLayoutVersion(connection: PoolConnection, input: {
  theatreId: string;
  screenId: string;
  layoutName: string;
  sourceFilename?: string | null;
  seatMap: SeatMapValidationResult;
  userId?: string | null;
}) {
  const versionNo = await getNextLayoutVersion(connection, input.screenId);
  const layoutId = `LAYOUT_${slug(input.screenId)}_V${versionNo}`;
  const [[currentLayout]] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM seat_layouts WHERE screen_id = ? AND is_active = TRUE ORDER BY version_no DESC, created_at DESC LIMIT 1',
    [input.screenId]
  );
  await connection.query('UPDATE seat_layouts SET is_active = FALSE, status = ? WHERE screen_id = ? AND is_active = TRUE', ['RETIRED', input.screenId]);
  await connection.query(
    `INSERT INTO seat_layouts (
       id, theatre_id, screen_id, name, screen_side_label, is_active, version_no,
       parent_layout_id, status, layout_json, source_filename, fingerprint, seat_count, created_by
     )
     VALUES (?, ?, ?, ?, ?, TRUE, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`,
    [
      layoutId,
      input.theatreId,
      input.screenId,
      input.layoutName || input.seatMap.name,
      input.seatMap.screenSideLabel,
      versionNo,
      currentLayout?.id ?? null,
      JSON.stringify(input.seatMap.normalized),
      input.sourceFilename ?? null,
      input.seatMap.fingerprint,
      input.seatMap.seatCount,
      input.userId ?? null
    ]
  );

  const cells = input.seatMap.rows.flatMap((row) => row.cells.map((cell) => [
    layoutId,
    cell.seatId,
    row.rowLabel,
    cell.rowSort,
    cell.seatNumber,
    cell.zoneCode,
    cell.itemType,
    cell.displayOrder,
    cell.gapWidth,
    cell.isBlocked ? 1 : 0,
    cell.accessibility
  ]));
  await connection.query(
    `INSERT INTO seat_layout_seats (
       layout_id, seat_id, row_label, row_sort, seat_number, zone_code, item_type,
       display_order, gap_width, is_blocked, accessibility
     )
     VALUES ?`,
    [cells]
  );
  await connection.query('UPDATE screens SET capacity = ?, updated_at = NOW() WHERE id = ?', [input.seatMap.seatCount, input.screenId]);
  return { layoutId, versionNo };
}

async function queueScheduleEvent(connection: PoolConnection, input: {
  theatreId: string;
  entityType: string;
  entityId: string;
  eventType: string;
  payload: Record<string, unknown>;
  requiresAck?: boolean;
}) {
  const eventId = randomUUID();
  await connection.query(
    `INSERT INTO schedule_sync_outbox (event_id, theatre_id, entity_type, entity_id, event_type, payload, requires_ack)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [eventId, input.theatreId, input.entityType, input.entityId, input.eventType, JSON.stringify(input.payload), input.requiresAck ? 1 : 0]
  );
  return eventId;
}

async function queueScheduleEventForTheatres(connection: PoolConnection, input: {
  theatreIds?: string[];
  entityType: string;
  entityId: string;
  eventType: string;
  payload: Record<string, unknown>;
  requiresAck?: boolean;
}) {
  const theatreIds = input.theatreIds?.length
    ? input.theatreIds
    : (await connection.query<RowDataPacket[]>("SELECT id FROM theatres WHERE status IN ('ACTIVE','INACTIVE')"))[0].map((row) => String(row.id));
  for (const theatreId of theatreIds) {
    await queueScheduleEvent(connection, { ...input, theatreId });
  }
}

function parseJsonColumn(value: unknown) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function dateOnly(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function moviePayloadFromRow(row: RowDataPacket | Record<string, unknown>) {
  return {
    movieId: String(row.movieId ?? row.id ?? ''),
    title: String(row.movieTitle ?? row.title ?? ''),
    language: row.movieLanguage ?? row.language ?? null,
    durationMinutes: row.movieDurationMinutes ?? row.durationMinutes ?? null,
    certificate: row.movieCertificate ?? row.certificate ?? null,
    releaseDate: dateOnly(row.movieReleaseDate ?? row.releaseDate),
    posterUrl: row.moviePosterUrl ?? row.posterUrl ?? null,
    genreJson: parseJsonColumn(row.movieGenreJson ?? row.genreJson),
    formatsJson: parseJsonColumn(row.movieFormatsJson ?? row.formatsJson),
    status: row.movieStatus ?? row.status ?? 'ACTIVE'
  };
}

function layoutPayloadFromRow(row: RowDataPacket | Record<string, unknown>) {
  const seatMap = parseJsonColumn(row.layoutJson);
  return {
    layoutId: String(row.layoutId ?? row.id ?? ''),
    name: row.layoutName ?? row.name ?? null,
    screenSideLabel: row.screenSideLabel ?? 'SCREEN THIS SIDE',
    versionNo: Number(row.layoutVersionNo ?? row.versionNo ?? 1),
    seatCount: Number(row.layoutSeatCount ?? row.seatCount ?? 0),
    fingerprint: row.layoutFingerprint ?? row.fingerprint ?? null,
    seatMap
  };
}

async function readShowSchedulePayload(connection: PoolConnection, showId: string) {
  const [[show]] = await connection.query<RowDataPacket[]>(
    `SELECT s.id AS showId, s.movie_id AS movieId, s.theatre_id AS theatreId,
            s.screen_id AS screenId, sc.code AS screenCode, sc.name AS screenName,
            s.layout_id AS layoutId, s.show_time AS showTime, s.show_end_time AS showEndTime,
            s.booking_opens_at AS bookingOpensAt, s.booking_closes_at AS bookingClosesAt,
            s.cleaning_buffer_minutes AS cleaningBufferMinutes, s.authority_mode AS authorityMode,
            s.status, s.reschedule_count AS rescheduleCount, s.cancelled_at AS cancelledAt,
            s.cancellation_reason AS cancellationReason,
            m.title AS movieTitle, m.language AS movieLanguage, m.duration_minutes AS movieDurationMinutes,
            m.certificate AS movieCertificate, m.release_date AS movieReleaseDate,
            m.poster_url AS moviePosterUrl, m.genre_json AS movieGenreJson,
            m.formats_json AS movieFormatsJson, m.status AS movieStatus,
            l.name AS layoutName, l.screen_side_label AS screenSideLabel,
            l.version_no AS layoutVersionNo, l.seat_count AS layoutSeatCount,
            l.fingerprint AS layoutFingerprint, l.layout_json AS layoutJson
     FROM shows s
     JOIN movies m ON m.id = s.movie_id
     JOIN screens sc ON sc.id = s.screen_id
     JOIN seat_layouts l ON l.id = s.layout_id
     WHERE s.id = ?
     LIMIT 1`,
    [showId]
  );
  if (!show) throw new AdminManagementError('NOT_FOUND', 'Show not found.', 404);
  const [priceRows] = await connection.query<RowDataPacket[]>(
    'SELECT zone_code AS zone, amount FROM show_pricing WHERE show_id = ? ORDER BY amount DESC, zone_code ASC',
    [showId]
  );
  const layout = layoutPayloadFromRow(show);
  return {
    showId: String(show.showId),
    movieId: String(show.movieId),
    movie: moviePayloadFromRow(show),
    movieTitle: String(show.movieTitle),
    theatreId: String(show.theatreId),
    screenId: String(show.screenId),
    screen: {
      screenId: String(show.screenId),
      code: String(show.screenCode ?? show.screenId),
      name: String(show.screenName)
    },
    screenName: String(show.screenName),
    layoutId: String(show.layoutId),
    layout,
    seatMap: layout.seatMap,
    start: serializeDateTime(show.showTime),
    end: serializeDateTime(show.showEndTime),
    showTime: serializeDateTime(show.showTime),
    showEndTime: serializeDateTime(show.showEndTime),
    bookingOpensAt: serializeDateTime(show.bookingOpensAt),
    bookingClosesAt: serializeDateTime(show.bookingClosesAt),
    cleaningBufferMinutes: Number(show.cleaningBufferMinutes ?? 20),
    authorityMode: String(show.authorityMode),
    status: String(show.status),
    rescheduleCount: Number(show.rescheduleCount ?? 0),
    cancelledAt: serializeDateTime(show.cancelledAt),
    cancellationReason: show.cancellationReason ?? null,
    prices: priceRows.map((row) => ({ zone: String(row.zone), amount: Number(row.amount) }))
  };
}

async function currentHeartbeatForAdmin(connection: Queryable, theatreId: string) {
  const [[heartbeat]] = await connection.query<RowDataPacket[]>(
    `SELECT theatre_id AS theatreId, status, trusted_for_admin_sync AS trusted,
            pending_local_events AS pendingLocalEvents, failed_local_events AS failedLocalEvents,
            last_local_sequence AS lastLocalSequence,
            TIMESTAMPDIFF(SECOND, last_seen_at, NOW()) AS ageSeconds
     FROM theatre_heartbeats WHERE theatre_id = ? LIMIT 1`,
    [theatreId]
  );
  const [[synced]] = await connection.query<RowDataPacket[]>(
    'SELECT COALESCE(MAX(source_sequence_no), 0) AS lastSyncedSequence FROM central_sync_inbox WHERE theatre_id = ?',
    [theatreId]
  );
  return heartbeat ? {
    status: String(heartbeat.status),
    trusted: Number(heartbeat.trusted ?? 0) === 1,
    pendingLocalEvents: Number(heartbeat.pendingLocalEvents ?? 0),
    failedLocalEvents: Number(heartbeat.failedLocalEvents ?? 0),
    lastLocalSequence: Number(heartbeat.lastLocalSequence ?? 0),
    lastSyncedSequence: Number(synced.lastSyncedSequence ?? 0),
    ageSeconds: Number(heartbeat.ageSeconds ?? 999999)
  } : null;
}

async function assertLocalAuthorityChangeAllowed(connection: PoolConnection, showId: string | null, theatreId: string, authorityMode: unknown, operation: string) {
  const mode = String(authorityMode ?? '').toUpperCase();
  if (mode !== 'LOCAL_AUTHORITY_ONLINE' && mode !== 'LOCAL_AUTHORITY_OFFLINE') return;
  const heartbeat = await currentHeartbeatForAdmin(connection, theatreId);
  const reasons: string[] = [];
  if (!heartbeat) reasons.push('NO_HEARTBEAT');
  else {
    if (heartbeat.status !== 'ONLINE' || heartbeat.ageSeconds > 60) reasons.push('THEATRE_OFFLINE_OR_STALE');
    if (!heartbeat.trusted) reasons.push('UNTRUSTED_HEARTBEAT');
    if (heartbeat.pendingLocalEvents > 0) reasons.push('PENDING_LOCAL_EVENTS');
    if (heartbeat.failedLocalEvents > 0) reasons.push('FAILED_LOCAL_EVENTS');
    if (heartbeat.lastLocalSequence !== heartbeat.lastSyncedSequence) reasons.push('LOCAL_SEQUENCE_NOT_SYNCED');
  }
  if (showId) {
    const [[state]] = await connection.query<RowDataPacket[]>(
      'SELECT pending_sync_events AS pendingSyncEvents, failed_sync_events AS failedSyncEvents FROM show_authority_state WHERE show_id = ? LIMIT 1',
      [showId]
    );
    if (Number(state?.pendingSyncEvents ?? 0) > 0) reasons.push('SHOW_PENDING_SYNC');
    if (Number(state?.failedSyncEvents ?? 0) > 0) reasons.push('SHOW_FAILED_SYNC');
  }
  if (reasons.length) {
    throw new AdminManagementError(
      'LOCAL_THEATRE_UNAVAILABLE',
      'The theatre server is currently unavailable. This show is controlled by the local theatre authority, so it cannot be edited or cancelled until the theatre server reconnects and synchronization is complete.',
      409,
      { operation, reasons, heartbeat }
    );
  }
}

async function getShowImpact(connection: PoolConnection, showId: string): Promise<ShowImpactSummary> {
  const [[row]] = await connection.query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM central_bookings WHERE show_id = ? AND status = 'CONFIRMED') AS confirmedBookings,
       (SELECT COUNT(*) FROM central_booking_items WHERE show_id = ?) AS tickets,
       (SELECT COUNT(*) FROM central_seat_holds WHERE show_id = ? AND status = 'ACTIVE' AND expires_at > NOW()) AS activeHolds,
       (SELECT COUNT(*) FROM payments WHERE show_id = ? AND status IN ('CREATED','PENDING','SUCCESS')) AS pendingPayments,
       (SELECT COUNT(*) FROM central_bookings WHERE show_id = ? AND channel = 'COUNTER' AND status = 'CONFIRMED') AS localCounterSales,
       (SELECT COALESCE(pending_sync_events, 0) + COALESCE(failed_sync_events, 0) FROM show_authority_state WHERE show_id = ?) AS unsyncedLocalTransactions`,
    [showId, showId, showId, showId, showId, showId]
  );
  const impact = {
    confirmedBookings: Number(row.confirmedBookings ?? 0),
    tickets: Number(row.tickets ?? 0),
    activeHolds: Number(row.activeHolds ?? 0),
    pendingPayments: Number(row.pendingPayments ?? 0),
    localCounterSales: Number(row.localCounterSales ?? 0),
    unsyncedLocalTransactions: Number(row.unsyncedLocalTransactions ?? 0),
    hasBookingRecords: false
  };
  impact.hasBookingRecords = impact.confirmedBookings > 0 || impact.tickets > 0 || impact.activeHolds > 0 || impact.pendingPayments > 0 || impact.localCounterSales > 0 || impact.unsyncedLocalTransactions > 0;
  return impact;
}

async function assertNoOverlap(connection: PoolConnection, input: { screenId: string; showId?: string | null; start: string; end: string; bufferMinutes: number }) {
  const start = new Date(input.start.replace(' ', 'T'));
  const end = new Date(input.end.replace(' ', 'T'));
  const bufferMs = Math.max(0, input.bufferMinutes) * 60_000;
  const startWithBuffer = mysqlDateTime(new Date(start.getTime() - bufferMs));
  const endWithBuffer = mysqlDateTime(new Date(end.getTime() + bufferMs));
  const params: unknown[] = [input.screenId, endWithBuffer, startWithBuffer];
  let showFilter = '';
  if (input.showId) {
    showFilter = ' AND s.id <> ?';
    params.push(input.showId);
  }
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT s.id, s.show_time AS showTime, COALESCE(s.show_end_time, DATE_ADD(s.show_time, INTERVAL COALESCE(m.duration_minutes, 150) MINUTE)) AS showEndTime
     FROM shows s
     JOIN movies m ON m.id = s.movie_id
     WHERE s.screen_id = ?
       AND s.status NOT IN ('CANCELLED','CLOSED')
       AND s.show_time < ?
       AND COALESCE(s.show_end_time, DATE_ADD(s.show_time, INTERVAL COALESCE(m.duration_minutes, 150) MINUTE)) > ?
       ${showFilter}
     LIMIT 1`,
    params
  );
  if (rows.length) {
    throw new AdminManagementError('SHOW_OVERLAP', 'Another show already overlaps this screen, including the configured cleaning buffer.', 409, rows[0]);
  }
}

function policyRows(showId: string, mode: SchedulingAuthorityMode) {
  if (mode === 'CENTRAL_AUTHORITY') {
    return [
      [showId, 'PUBLIC', mode, 1],
      [showId, 'AGENT', mode, 1],
      [showId, 'COUNTER', mode, 0]
    ];
  }
  if (mode === 'LOCAL_AUTHORITY_ONLINE') {
    return [
      [showId, 'PUBLIC', mode, 1],
      [showId, 'AGENT', mode, 1],
      [showId, 'COUNTER', mode, 1]
    ];
  }
  return [
    [showId, 'PUBLIC', mode, 0],
    [showId, 'AGENT', mode, 0],
    [showId, 'COUNTER', mode, 1]
  ];
}

async function writeAuthorityPolicy(connection: PoolConnection, showId: string, mode: SchedulingAuthorityMode) {
  await connection.query('DELETE FROM booking_authority_policy WHERE show_id = ?', [showId]);
  await connection.query(
    `INSERT INTO booking_authority_policy (show_id, channel, authority_mode, is_booking_allowed)
     VALUES ?`,
    [policyRows(showId, mode)]
  );
  await connection.query(
    `INSERT INTO show_authority_state (show_id, authority_mode, pending_sync_events, failed_sync_events)
     VALUES (?, ?, 0, 0)
     ON DUPLICATE KEY UPDATE authority_mode = VALUES(authority_mode), updated_at = NOW()`,
    [showId, mode]
  );
}

function parsePrices(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((row) => {
      const record = row && typeof row === 'object' ? row as Record<string, unknown> : {};
      return { zone: stringValue(record.zone ?? record.zoneCode, 'Pricing zone', 80), amount: numberValue(record.amount ?? record.price, 'Price') };
    });
  }
  const text = String(value ?? '').trim();
  if (!text) throw new AdminManagementError('VALIDATION_ERROR', 'At least one price is required.');
  if (text.startsWith('[')) return parsePrices(JSON.parse(text));
  return text.split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [zone, amount] = line.includes('=') ? line.split('=') : line.split(':');
      return { zone: stringValue(zone, 'Pricing zone', 80), amount: numberValue(amount, 'Price') };
    });
}

export async function listAdminManagementData(theatreScope?: string | null) {
  await ensureAdminManagementSchema();
  const scopeSql = theatreScope ? ' WHERE t.id = ?' : '';
  const scopeParams = theatreScope ? [theatreScope] : [];
  const [theatres] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT t.id, t.code, t.name, t.city, t.status, t.address, t.contact_phone AS contactPhone,
            COUNT(DISTINCT sc.id) AS screenCount,
            COUNT(DISTINCT s.id) AS showCount
     FROM theatres t
     LEFT JOIN screens sc ON sc.theatre_id = t.id
     LEFT JOIN shows s ON s.theatre_id = t.id
     ${scopeSql}
     GROUP BY t.id, t.code, t.name, t.city, t.status, t.address, t.contact_phone
     ORDER BY t.city, t.name`,
    scopeParams
  );
  const screenScope = theatreScope ? ' WHERE sc.theatre_id = ?' : '';
  const [screens] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT sc.id, sc.theatre_id AS theatreId, t.name AS theatreName, sc.code, sc.name,
            COALESCE(sc.status, 'ACTIVE') AS status, sc.capacity,
            l.id AS activeLayoutId, l.version_no AS activeLayoutVersion, l.seat_count AS activeSeatCount
     FROM screens sc
     JOIN theatres t ON t.id = sc.theatre_id
     LEFT JOIN seat_layouts l ON l.screen_id = sc.id AND l.is_active = TRUE
     ${screenScope}
     ORDER BY t.name, sc.name`,
    scopeParams
  );
  const [movies] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT m.id, m.title, m.language, m.duration_minutes AS durationMinutes,
            m.certificate, m.status, m.poster_url AS posterUrl, COUNT(s.id) AS showCount
     FROM movies m
     LEFT JOIN shows s ON s.movie_id = m.id
     GROUP BY m.id, m.title, m.language, m.duration_minutes, m.certificate, m.status, m.poster_url
     ORDER BY m.title`
  );
  const showScope = theatreScope ? ' WHERE s.theatre_id = ?' : '';
  const [shows] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT s.id, s.movie_id AS movieId, m.title AS movieTitle, s.theatre_id AS theatreId, t.name AS theatreName,
            s.screen_id AS screenId, sc.name AS screenName, s.layout_id AS layoutId,
            s.show_time AS showTime, s.show_end_time AS showEndTime, s.authority_mode AS authorityMode,
            s.status, s.booking_opens_at AS bookingOpensAt, s.booking_closes_at AS bookingClosesAt,
            s.cancelled_at AS cancelledAt, s.cancellation_reason AS cancellationReason,
            COALESCE(b.bookingCount, 0) AS bookingCount,
            COALESCE(i.ticketCount, 0) AS ticketCount,
            COALESCE(sync.pendingSync, 0) AS pendingScheduleSync
     FROM shows s
     JOIN movies m ON m.id = s.movie_id
     JOIN theatres t ON t.id = s.theatre_id
     JOIN screens sc ON sc.id = s.screen_id
     LEFT JOIN (SELECT show_id, COUNT(*) AS bookingCount FROM central_bookings WHERE status = 'CONFIRMED' GROUP BY show_id) b ON b.show_id = s.id
     LEFT JOIN (SELECT show_id, COUNT(*) AS ticketCount FROM central_booking_items GROUP BY show_id) i ON i.show_id = s.id
     LEFT JOIN (SELECT entity_id, COUNT(*) AS pendingSync FROM schedule_sync_outbox WHERE entity_type = 'SHOW' AND status = 'PENDING' GROUP BY entity_id) sync ON sync.entity_id = s.id
     ${showScope}
     ORDER BY s.show_time DESC
     LIMIT 120`,
    scopeParams
  );
  return { theatres, screens, movies, shows };
}

export async function createTheatre(session: CentralSession, input: Record<string, unknown>) {
  await ensureAdminManagementSchema();
  if (session.role !== 'SUPER_ADMIN') throw new AdminManagementError('FORBIDDEN', 'Only super admins can create theatres.', 403);
  const id = optionalString(input.id, 50) ?? `THEATRE_${slug(input.code ?? input.name)}`;
  const code = stringValue(input.code, 'Theatre code', 30);
  const name = stringValue(input.name, 'Theatre name', 150);
  const city = stringValue(input.city, 'City', 100);
  const address = optionalString(input.address);
  const contactPhone = optionalString(input.contactPhone, 40);
  const timezone = optionalString(input.timezone, 80) ?? 'Asia/Kolkata';
  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO theatres (id, code, name, city, status, address, contact_phone, timezone)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      [id, code, name, city, address, contactPhone, timezone]
    );
    await queueScheduleEvent(connection, {
      theatreId: id,
      entityType: 'THEATRE',
      entityId: id,
      eventType: 'THEATRE_CREATED',
      payload: { theatreId: id, id, code, name, city, status: 'ACTIVE', address, contactPhone, timezone }
    });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await writeCentralAuditLog({ userId: session.userId, role: session.role, action: 'THEATRE_CREATED', entityType: 'THEATRE', entityId: id, metadata: { code, name, city } });
  return { id };
}

export async function updateTheatre(session: CentralSession, input: Record<string, unknown>) {
  await ensureAdminManagementSchema();
  const id = stringValue(input.id, 'Theatre ID', 80);
  assertTheatreScope(session, id);
  const name = stringValue(input.name, 'Theatre name', 150);
  const city = stringValue(input.city, 'City', 100);
  const status = boolValue(input.enabled) ? 'ACTIVE' : 'DISABLED';
  const address = optionalString(input.address);
  const contactPhone = optionalString(input.contactPhone, 40);
  const timezone = optionalString(input.timezone, 80) ?? 'Asia/Kolkata';
  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();
    const [[theatre]] = await connection.query<RowDataPacket[]>('SELECT code FROM theatres WHERE id = ? FOR UPDATE', [id]);
    await connection.query(
      `UPDATE theatres SET name = ?, city = ?, status = ?, address = ?, contact_phone = ?, timezone = ? WHERE id = ?`,
      [name, city, status, address, contactPhone, timezone, id]
    );
    await queueScheduleEvent(connection, {
      theatreId: id,
      entityType: 'THEATRE',
      entityId: id,
      eventType: 'THEATRE_UPDATED',
      payload: { theatreId: id, id, code: theatre?.code ?? id, name, city, status, address, contactPhone, timezone }
    });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await writeCentralAuditLog({ userId: session.userId, role: session.role, action: 'THEATRE_UPDATED', entityType: 'THEATRE', entityId: id });
  return { id };
}

export async function deleteTheatre(session: CentralSession, theatreId: string) {
  await ensureAdminManagementSchema();
  if (session.role !== 'SUPER_ADMIN') throw new AdminManagementError('FORBIDDEN', 'Only super admins can delete theatres.', 403);
  const [[deps]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM screens WHERE theatre_id = ?) AS screens,
       (SELECT COUNT(*) FROM shows WHERE theatre_id = ?) AS shows,
       (SELECT COUNT(*) FROM central_bookings b JOIN shows s ON s.id = b.show_id WHERE s.theatre_id = ?) AS bookings`,
    [theatreId, theatreId, theatreId]
  );
  if (Number(deps.screens) || Number(deps.shows) || Number(deps.bookings)) {
    throw new AdminManagementError('PROTECTED_RECORD', 'Theatre has dependent screens, shows, or bookings. Disable it instead.', 409, deps);
  }
  await getCentralDbPool().query('DELETE FROM theatres WHERE id = ?', [theatreId]);
  await writeCentralAuditLog({ userId: session.userId, role: session.role, action: 'THEATRE_DELETED', entityType: 'THEATRE', entityId: theatreId });
}

export async function createScreenWithSeatMap(session: CentralSession, input: Record<string, unknown>) {
  await ensureAdminManagementSchema();
  const theatreId = stringValue(input.theatreId, 'Theatre ID', 80);
  assertTheatreScope(session, theatreId);
  const screenId = optionalString(input.id, 80) ?? `SCREEN_${slug(theatreId)}_${slug(input.code ?? input.name)}`;
  const code = stringValue(input.code, 'Screen code', 30);
  const name = stringValue(input.name, 'Screen name', 100);
  const seatMap = validateSeatMapJson(input.seatMapJson);
  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO screens (id, theatre_id, code, name, status, capacity)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?)`,
      [screenId, theatreId, code, name, seatMap.seatCount]
    );
    const layout = await insertSeatLayoutVersion(connection, {
      theatreId,
      screenId,
      layoutName: optionalString(input.layoutName, 150) ?? seatMap.name,
      sourceFilename: optionalString(input.sourceFilename, 190),
      seatMap,
      userId: session.userId
    });
    await queueScheduleEvent(connection, {
      theatreId,
      entityType: 'SCREEN',
      entityId: screenId,
      eventType: 'SCREEN_CREATED',
      payload: {
        theatreId,
        screenId,
        code,
        name,
        status: 'ACTIVE',
        capacity: seatMap.seatCount,
        layoutId: layout.layoutId,
        layoutName: optionalString(input.layoutName, 150) ?? seatMap.name,
        versionNo: layout.versionNo,
        screenSideLabel: seatMap.screenSideLabel,
        seatCount: seatMap.seatCount,
        fingerprint: seatMap.fingerprint,
        seatMap: seatMap.normalized,
        sourceFilename: optionalString(input.sourceFilename, 190)
      }
    });
    await connection.commit();
    await writeCentralAuditLog({ userId: session.userId, role: session.role, action: 'SCREEN_CREATED', entityType: 'SCREEN', entityId: screenId, metadata: { theatreId, layout } });
    return { id: screenId, layoutId: layout.layoutId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateScreenSeatMap(session: CentralSession, input: Record<string, unknown>) {
  await ensureAdminManagementSchema();
  const screenId = stringValue(input.screenId, 'Screen ID', 80);
  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();
    const [[screen]] = await connection.query<RowDataPacket[]>('SELECT id, theatre_id AS theatreId, code, name FROM screens WHERE id = ? FOR UPDATE', [screenId]);
    if (!screen) throw new AdminManagementError('NOT_FOUND', 'Screen not found.', 404);
    assertTheatreScope(session, String(screen.theatreId));
    const seatMap = validateSeatMapJson(input.seatMapJson);
    const layout = await insertSeatLayoutVersion(connection, {
      theatreId: String(screen.theatreId),
      screenId,
      layoutName: optionalString(input.layoutName, 150) ?? seatMap.name,
      sourceFilename: optionalString(input.sourceFilename, 190),
      seatMap,
      userId: session.userId
    });
    await queueScheduleEvent(connection, {
      theatreId: String(screen.theatreId),
      entityType: 'SCREEN',
      entityId: screenId,
      eventType: 'SEAT_MAP_VERSION_CREATED',
      payload: {
        theatreId: String(screen.theatreId),
        screenId,
        code: String(screen.code ?? screenId),
        name: String(screen.name ?? screenId),
        layoutId: layout.layoutId,
        layoutName: optionalString(input.layoutName, 150) ?? seatMap.name,
        versionNo: layout.versionNo,
        screenSideLabel: seatMap.screenSideLabel,
        seatCount: seatMap.seatCount,
        capacity: seatMap.seatCount,
        fingerprint: seatMap.fingerprint,
        seatMap: seatMap.normalized,
        sourceFilename: optionalString(input.sourceFilename, 190)
      }
    });
    await connection.commit();
    await writeCentralAuditLog({ userId: session.userId, role: session.role, action: 'SEAT_MAP_VERSION_CREATED', entityType: 'SCREEN', entityId: screenId, metadata: layout });
    return { id: screenId, layoutId: layout.layoutId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function upsertMovie(session: CentralSession, input: Record<string, unknown>) {
  await ensureAdminManagementSchema();
  if (session.role !== 'SUPER_ADMIN') throw new AdminManagementError('FORBIDDEN', 'Only super admins can manage movies.', 403);
  const id = optionalString(input.id, 80) ?? `movie_${slug(input.title).toLowerCase()}`;
  const title = stringValue(input.title, 'Movie title', 150);
  const status = String(input.status ?? 'ACTIVE').toUpperCase();
  const safeStatus = status === 'DISABLED' || status === 'ARCHIVED' || status === 'INACTIVE' ? status : 'ACTIVE';
  const posterUrl = optionalString(input.posterUrl, 1000);
  const posterMetadata = {
    fileName: optionalString(input.posterFileName, 190),
    contentType: optionalString(input.posterContentType, 80),
    sizeBytes: input.posterSizeBytes ? numberValue(input.posterSizeBytes, 'Poster size') : null,
    storage: posterUrl ? 'URL' : 'NONE'
  };
  const moviePayload = {
    movieId: id,
    title,
    language: optionalString(input.language, 50),
    durationMinutes: input.durationMinutes ? numberValue(input.durationMinutes, 'Duration') : null,
    certificate: optionalString(input.certificate, 20),
    releaseDate: optionalString(input.releaseDate, 20),
    posterUrl,
    trailerUrl: optionalString(input.trailerUrl, 1000),
    synopsis: optionalString(input.synopsis, 4000),
    genreJson: String(input.genres ?? '').split(',').map((item) => item.trim()).filter(Boolean),
    formatsJson: String(input.formats ?? '').split(',').map((item) => item.trim()).filter(Boolean),
    languagesJson: String(input.languages ?? '').split(',').map((item) => item.trim()).filter(Boolean),
    posterMetadata,
    status: safeStatus
  };
  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO movies (
         id, title, language, duration_minutes, certificate, release_date, poster_url,
         youtube_trailer_url, synopsis, genre_json, formats_json, languages_json, poster_metadata, status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), language = VALUES(language), duration_minutes = VALUES(duration_minutes),
         certificate = VALUES(certificate), release_date = VALUES(release_date), poster_url = VALUES(poster_url),
         youtube_trailer_url = VALUES(youtube_trailer_url), synopsis = VALUES(synopsis),
         genre_json = VALUES(genre_json), formats_json = VALUES(formats_json), languages_json = VALUES(languages_json),
         poster_metadata = VALUES(poster_metadata), status = VALUES(status), updated_at = NOW()`,
      [
        id,
        title,
        moviePayload.language,
        moviePayload.durationMinutes,
        moviePayload.certificate,
        moviePayload.releaseDate,
        posterUrl,
        moviePayload.trailerUrl,
        moviePayload.synopsis,
        JSON.stringify(moviePayload.genreJson),
        JSON.stringify(moviePayload.formatsJson),
        JSON.stringify(moviePayload.languagesJson),
        JSON.stringify(posterMetadata),
        safeStatus
      ]
    );
    await queueScheduleEventForTheatres(connection, { entityType: 'MOVIE', entityId: id, eventType: 'MOVIE_UPSERTED', payload: moviePayload });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await writeCentralAuditLog({ userId: session.userId, role: session.role, action: 'MOVIE_UPSERTED', entityType: 'MOVIE', entityId: id, metadata: { title, status: safeStatus } });
  return { id };
}

export async function deleteMovie(session: CentralSession, movieId: string) {
  await ensureAdminManagementSchema();
  if (session.role !== 'SUPER_ADMIN') throw new AdminManagementError('FORBIDDEN', 'Only super admins can delete movies.', 403);
  const [[deps]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM shows WHERE movie_id = ?) AS shows,
       (SELECT COUNT(*) FROM central_bookings b JOIN shows s ON s.id = b.show_id WHERE s.movie_id = ?) AS bookings`,
    [movieId, movieId]
  );
  if (Number(deps.shows) || Number(deps.bookings)) {
    throw new AdminManagementError('PROTECTED_RECORD', 'Movie has scheduled shows or bookings. Archive or disable it instead.', 409, deps);
  }
  await getCentralDbPool().query('DELETE FROM movies WHERE id = ?', [movieId]);
  await writeCentralAuditLog({ userId: session.userId, role: session.role, action: 'MOVIE_DELETED', entityType: 'MOVIE', entityId: movieId });
}

export async function createShow(session: CentralSession, input: Record<string, unknown>) {
  await ensureAdminManagementSchema();
  const theatreId = stringValue(input.theatreId, 'Theatre ID', 80);
  assertTheatreScope(session, theatreId);
  const screenId = stringValue(input.screenId, 'Screen ID', 80);
  const movieId = stringValue(input.movieId, 'Movie ID', 80);
  const authorityMode = stringValue(input.authorityMode, 'Authority mode', 80) as SchedulingAuthorityMode;
  if (!SHOW_SCHEDULING_AUTHORITY_MODES.includes(authorityMode)) throw new AdminManagementError('INVALID_AUTHORITY_MODE', 'Show scheduling supports only the three public authority modes.');
  const start = parseLocalDateTime(input.showDate, input.showTime, 'Show start');
  const durationMinutes = input.durationMinutes ? numberValue(input.durationMinutes, 'Duration') : null;
  const bufferMinutes = Math.max(0, Math.trunc(numberValue(input.cleaningBufferMinutes, 'Cleaning buffer', 20)));
  const prices = parsePrices(input.prices);
  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();
    const [[screen]] = await connection.query<RowDataPacket[]>('SELECT id, theatre_id AS theatreId FROM screens WHERE id = ? AND theatre_id = ? FOR UPDATE', [screenId, theatreId]);
    if (!screen) throw new AdminManagementError('VALIDATION_ERROR', 'Selected screen does not belong to the selected theatre.');
    const [[movie]] = await connection.query<RowDataPacket[]>('SELECT duration_minutes AS durationMinutes FROM movies WHERE id = ? LIMIT 1', [movieId]);
    if (!movie) throw new AdminManagementError('VALIDATION_ERROR', 'Selected movie was not found.');
    const [[layout]] = await connection.query<RowDataPacket[]>('SELECT id FROM seat_layouts WHERE screen_id = ? AND is_active = TRUE ORDER BY version_no DESC, created_at DESC LIMIT 1', [screenId]);
    if (!layout) throw new AdminManagementError('VALIDATION_ERROR', 'Selected screen does not have an active seat-map version.');
    const end = parseMaybeDateTime(input.showEndTime) ?? mysqlDateTime(new Date(new Date(start.replace(' ', 'T')).getTime() + (durationMinutes ?? Number(movie.durationMinutes ?? 150)) * 60_000));
    await assertNoOverlap(connection, { screenId, start, end, bufferMinutes });
    const showId = optionalString(input.id, 80) ?? `SHOW_${slug(screenId)}_${Date.now()}`;
    const showStatus = String(input.status ?? 'OPEN').toUpperCase() === 'SCHEDULED' ? 'SCHEDULED' : 'OPEN';
    const bookingOpensAt = parseMaybeDateTime(input.bookingOpensAt);
    const bookingClosesAt = parseMaybeDateTime(input.bookingClosesAt);
    await connection.query(
      `INSERT INTO shows (
         id, movie_id, theatre_id, screen_id, layout_id, show_time, show_end_time,
         booking_opens_at, booking_closes_at, cleaning_buffer_minutes, authority_mode, status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        showId,
        movieId,
        theatreId,
        screenId,
        layout.id,
        start,
        end,
        bookingOpensAt,
        bookingClosesAt,
        bufferMinutes,
        authorityMode,
        showStatus
      ]
    );
    await connection.query('INSERT INTO show_pricing (show_id, zone_code, amount) VALUES ?', [prices.map((price) => [showId, price.zone, price.amount])]);
    await writeAuthorityPolicy(connection, showId, authorityMode);
    await queueScheduleEvent(connection, {
      theatreId,
      entityType: 'SHOW',
      entityId: showId,
      eventType: 'SHOW_CREATED',
      payload: await readShowSchedulePayload(connection, showId),
      requiresAck: authorityMode !== 'CENTRAL_AUTHORITY'
    });
    await connection.commit();
    await writeCentralAuditLog({ userId: session.userId, role: session.role, action: 'SHOW_CREATED', entityType: 'SHOW', entityId: showId, metadata: { theatreId, screenId, movieId, authorityMode } });
    return { id: showId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateShowSchedule(session: CentralSession, input: Record<string, unknown>) {
  await ensureAdminManagementSchema();
  const showId = stringValue(input.showId, 'Show ID', 80);
  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();
    const [[show]] = await connection.query<RowDataPacket[]>(
      `SELECT s.*, m.title AS movieTitle FROM shows s JOIN movies m ON m.id = s.movie_id WHERE s.id = ? FOR UPDATE`,
      [showId]
    );
    if (!show) throw new AdminManagementError('NOT_FOUND', 'Show not found.', 404);
    assertTheatreScope(session, String(show.theatre_id));
    await assertLocalAuthorityChangeAllowed(connection, showId, String(show.theatre_id), show.authority_mode, 'SHOW_EDIT');
    const impact = await getShowImpact(connection, showId);
    const reason = optionalString(input.reason, 1000);
    if (impact.hasBookingRecords && (!reason || !boolValue(input.confirmReschedule))) {
      throw new AdminManagementError('RESCHEDULE_CONFIRMATION_REQUIRED', 'This show already has booking records. Enter a reason and explicitly confirm the reschedule.', 409, impact);
    }
    const authorityMode = (optionalString(input.authorityMode, 80) ?? String(show.authority_mode)) as SchedulingAuthorityMode;
    if (!SHOW_SCHEDULING_AUTHORITY_MODES.includes(authorityMode)) throw new AdminManagementError('INVALID_AUTHORITY_MODE', 'Only the three scheduling authority modes can be selected.');
    const start = input.showDate || input.showTime ? parseLocalDateTime(input.showDate, input.showTime, 'Show start') : mysqlDateTime(new Date(show.show_time));
    const end = parseMaybeDateTime(input.showEndTime) ?? (show.show_end_time ? mysqlDateTime(new Date(show.show_end_time)) : mysqlDateTime(new Date(new Date(start.replace(' ', 'T')).getTime() + 150 * 60_000)));
    const bufferMinutes = Math.max(0, Math.trunc(numberValue(input.cleaningBufferMinutes, 'Cleaning buffer', Number(show.cleaning_buffer_minutes ?? 20))));
    await assertNoOverlap(connection, { screenId: String(show.screen_id), showId, start, end, bufferMinutes });
    if (impact.hasBookingRecords && (String(show.layout_id) !== String(show.layout_id))) {
      throw new AdminManagementError('UNSAFE_LAYOUT_CHANGE', 'Booked shows cannot change seat-map versions.');
    }
    const previous = { showTime: show.show_time, showEndTime: show.show_end_time, authorityMode: show.authority_mode, status: show.status };
    await connection.query(
      `UPDATE shows
       SET show_time = ?, show_end_time = ?, booking_opens_at = ?, booking_closes_at = ?,
           cleaning_buffer_minutes = ?, authority_mode = ?, status = CASE WHEN status = 'CANCELLED' THEN status ELSE ? END,
           reschedule_count = reschedule_count + ?
       WHERE id = ?`,
      [
        start,
        end,
        parseMaybeDateTime(input.bookingOpensAt) ?? show.booking_opens_at,
        parseMaybeDateTime(input.bookingClosesAt) ?? show.booking_closes_at,
        bufferMinutes,
        authorityMode,
        String(input.status ?? show.status).toUpperCase() === 'SCHEDULED' ? 'SCHEDULED' : 'OPEN',
        impact.hasBookingRecords ? 1 : 0,
        showId
      ]
    );
    await writeAuthorityPolicy(connection, showId, authorityMode);
    await connection.query(
      `INSERT INTO show_change_history (show_id, action, admin_user_id, reason, previous_values, new_values, affected_booking_count, affected_ticket_count)
       VALUES (?, 'SHOW_UPDATED', ?, ?, ?, ?, ?, ?)`,
      [showId, session.userId, reason, JSON.stringify(previous), JSON.stringify({ showTime: start, showEndTime: end, authorityMode }), impact.confirmedBookings, impact.tickets]
    );
    if (impact.hasBookingRecords) {
      await connection.query(
        `INSERT INTO show_reschedules (show_id, previous_show_time, new_show_time, previous_end_time, new_end_time, reason, admin_user_id, affected_booking_count, affected_ticket_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [showId, show.show_time, start, show.show_end_time, end, reason, session.userId, impact.confirmedBookings, impact.tickets]
      );
      await queueBookingNotifications(connection, showId, 'SHOW_RESCHEDULED', 'Your show time has changed', { previousShowTime: previous.showTime, newShowTime: start, reason });
    }
    await queueScheduleEvent(connection, {
      theatreId: String(show.theatre_id),
      entityType: 'SHOW',
      entityId: showId,
      eventType: impact.hasBookingRecords ? 'SHOW_RESCHEDULED' : 'SHOW_UPDATED',
      payload: { ...(await readShowSchedulePayload(connection, showId)), previous, reason },
      requiresAck: authorityMode !== 'CENTRAL_AUTHORITY'
    });
    await connection.commit();
    await writeCentralAuditLog({ userId: session.userId, role: session.role, action: impact.hasBookingRecords ? 'SHOW_RESCHEDULED' : 'SHOW_UPDATED', entityType: 'SHOW', entityId: showId, metadata: { impact, reason } });
    return { id: showId, impact };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function queueBookingNotifications(connection: PoolConnection, showId: string, type: string, subject: string, metadata: Record<string, unknown>) {
  const [bookings] = await connection.query<RowDataPacket[]>(
    `SELECT b.id AS bookingId, b.customer_email AS customerEmail, b.total_amount AS totalAmount,
            m.title AS movieTitle, t.name AS theatreName, sc.name AS screenName, s.show_time AS showTime
     FROM central_bookings b
     JOIN shows s ON s.id = b.show_id
     JOIN movies m ON m.id = s.movie_id
     JOIN theatres t ON t.id = s.theatre_id
     JOIN screens sc ON sc.id = s.screen_id
     WHERE b.show_id = ? AND b.status = 'CONFIRMED'`,
    [showId]
  );
  for (const booking of bookings) {
    const recipient = booking.customerEmail ? String(booking.customerEmail) : null;
    await connection.query(
      `INSERT INTO notification_outbox (event_id, notification_type, recipient, booking_id, show_id, subject, payload, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        type,
        recipient,
        booking.bookingId,
        showId,
        subject,
        JSON.stringify({
          bookingId: booking.bookingId,
          movieName: booking.movieTitle,
          theatre: booking.theatreName,
          screen: booking.screenName,
          originalShowTime: metadata.previousShowTime ?? booking.showTime,
          revisedShowTime: metadata.newShowTime ?? null,
          reason: metadata.reason ?? null,
          refundStatus: metadata.refundStatus ?? null,
          support: process.env.CUSTOMER_SUPPORT_EMAIL ?? 'support@ksfdc.example'
        }),
        recipient ? 'PENDING' : 'SKIPPED'
      ]
    );
  }
}

export async function cancelShow(session: CentralSession, input: Record<string, unknown>) {
  await ensureAdminManagementSchema();
  const showId = stringValue(input.showId, 'Show ID', 80);
  const reason = stringValue(input.reason, 'Cancellation reason', 1000);
  if (!boolValue(input.confirmCancellation)) throw new AdminManagementError('CANCELLATION_CONFIRMATION_REQUIRED', 'Explicit cancellation confirmation is required.');
  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();
    const [[show]] = await connection.query<RowDataPacket[]>('SELECT * FROM shows WHERE id = ? FOR UPDATE', [showId]);
    if (!show) throw new AdminManagementError('NOT_FOUND', 'Show not found.', 404);
    assertTheatreScope(session, String(show.theatre_id));
    await assertLocalAuthorityChangeAllowed(connection, showId, String(show.theatre_id), show.authority_mode, 'SHOW_CANCEL');
    const impact = await getShowImpact(connection, showId);
    await connection.query(
      "UPDATE shows SET status = 'CANCELLED', cancelled_at = NOW(), cancellation_reason = ? WHERE id = ?",
      [reason, showId]
    );
    await connection.query("UPDATE central_seat_holds SET status = 'CANCELLED' WHERE show_id = ? AND status = 'ACTIVE'", [showId]);
    await connection.query("UPDATE payments SET status = 'REFUND_REQUIRED' WHERE show_id = ? AND status IN ('CAPTURED','COLLECTED','SUCCESS')", [showId]);
    await connection.query(
      `INSERT INTO refund_records (booking_id, payment_id, show_id, amount, status, reason)
       SELECT b.id, p.id, b.show_id, COALESCE(p.amount, b.total_amount), 'REFUND_PENDING', ?
       FROM central_bookings b
       LEFT JOIN payments p ON p.booking_id = b.id
       WHERE b.show_id = ? AND b.status = 'CONFIRMED'
       ON DUPLICATE KEY UPDATE status = status`,
      [reason, showId]
    );
    await connection.query(
      `INSERT INTO show_cancellations (show_id, reason, admin_user_id, affected_booking_count, affected_ticket_count)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE reason = VALUES(reason), affected_booking_count = VALUES(affected_booking_count), affected_ticket_count = VALUES(affected_ticket_count)`,
      [showId, reason, session.userId, impact.confirmedBookings, impact.tickets]
    );
    await connection.query(
      `INSERT INTO show_change_history (show_id, action, admin_user_id, reason, previous_values, new_values, affected_booking_count, affected_ticket_count)
       VALUES (?, 'SHOW_CANCELLED', ?, ?, ?, ?, ?, ?)`,
      [showId, session.userId, reason, JSON.stringify({ status: show.status }), JSON.stringify({ status: 'CANCELLED' }), impact.confirmedBookings, impact.tickets]
    );
    await queueBookingNotifications(connection, showId, 'SHOW_CANCELLED', 'Your show has been cancelled', { reason, refundStatus: 'REFUND_PENDING' });
    await queueScheduleEvent(connection, {
      theatreId: String(show.theatre_id),
      entityType: 'SHOW',
      entityId: showId,
      eventType: 'SHOW_CANCELLED',
      payload: { ...(await readShowSchedulePayload(connection, showId)), reason },
      requiresAck: String(show.authority_mode) !== 'CENTRAL_AUTHORITY'
    });
    await connection.commit();
    await writeCentralAuditLog({ userId: session.userId, role: session.role, action: 'SHOW_CANCELLED', entityType: 'SHOW', entityId: showId, metadata: { impact, reason } });
    return { id: showId, impact };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function acknowledgeScheduleEvents(input: { theatreId: string; events: Array<{ eventId: string; localSequenceNo?: number; status?: string; message?: string }> }) {
  await ensureAdminManagementSchema();
  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();
    for (const event of input.events) {
      await connection.query(
        `INSERT INTO schedule_sync_acknowledgements (event_id, theatre_id, local_sequence_no, status, message)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE local_sequence_no = VALUES(local_sequence_no), status = VALUES(status), message = VALUES(message), acknowledged_at = NOW()`,
        [event.eventId, input.theatreId, event.localSequenceNo ?? null, event.status === 'FAILED' ? 'FAILED' : 'ACKED', event.message ?? null]
      );
      await connection.query(
        `UPDATE schedule_sync_outbox SET status = ?, acked_at = CASE WHEN ? = 'ACKED' THEN NOW() ELSE acked_at END, error_message = ?
         WHERE event_id = ? AND theatre_id = ?`,
        [event.status === 'FAILED' ? 'FAILED' : 'ACKED', event.status === 'FAILED' ? 'FAILED' : 'ACKED', event.message ?? null, event.eventId, input.theatreId]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function readScheduleEvents(input: { theatreId: string; afterId?: number; limit?: number }) {
  await ensureAdminManagementSchema();
  const limit = Math.max(1, Math.min(500, Math.trunc(input.limit ?? 100)));
  const [events] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT id AS sequenceNo, event_id AS eventId, theatre_id AS theatreId, entity_type AS entityType,
            entity_id AS entityId, event_type AS eventType, payload, requires_ack AS requiresAck, status, created_at AS createdAt
     FROM schedule_sync_outbox
     WHERE theatre_id = ? AND id > ?
     ORDER BY id ASC
     LIMIT ?`,
    [input.theatreId, input.afterId ?? 0, limit]
  );
  return events.map((event) => ({
    sequenceNo: Number(event.sequenceNo),
    eventId: String(event.eventId),
    theatreId: String(event.theatreId),
    entityType: String(event.entityType),
    entityId: String(event.entityId),
    eventType: String(event.eventType),
    payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
    requiresAck: Number(event.requiresAck ?? 0) === 1,
    status: String(event.status),
    createdAt: new Date(event.createdAt).toISOString()
  }));
}

export async function mutationResult<T extends { id?: string }>(operation: () => Promise<T>): Promise<AdminOperationResult> {
  try {
    const result = await operation();
    return { success: true, id: result.id };
  } catch (error) {
    return adminErrorPayload(error);
  }
}
