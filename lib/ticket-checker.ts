import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getCentralDbPool } from './db';
import { ensureTicketCheckerTables, type TicketCheckerSession } from './ticket-checker-auth';
import { ticketVerificationTokenMatches } from './ticket-verification';
import { formatTheatreDateTime, theatreDateTimeIso } from './theatre-time';

type ParsedQr = { bookingId: string | null; showId: string | null; theatreId: string | null; token: string | null; source: 'SIGNED_QR' | 'LOCAL_QR' | 'MANUAL' | 'UNKNOWN' };

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseTicketQr(rawValue: string): ParsedQr {
  const raw = rawValue.trim();
  if (!raw) return { bookingId: null, showId: null, theatreId: null, token: null, source: 'UNKNOWN' };
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const bookingId = stringValue(payload.bookingId) ?? stringValue(payload.ticket);
    const token = stringValue(payload.verificationToken);
    return {
      bookingId,
      showId: stringValue(payload.showId),
      theatreId: stringValue(payload.theatreId),
      token,
      source: token ? 'SIGNED_QR' : payload.ticket ? 'LOCAL_QR' : 'MANUAL'
    };
  } catch {
    try {
      const url = new URL(raw);
      const match = url.pathname.match(/\/ticket\/([^/?#]+)/i);
      return {
        bookingId: match ? decodeURIComponent(match[1]) : stringValue(url.searchParams.get('bookingId')),
        showId: stringValue(url.searchParams.get('showId')),
        theatreId: stringValue(url.searchParams.get('theatreId')),
        token: stringValue(url.searchParams.get('verify')),
        source: url.searchParams.get('verify') ? 'SIGNED_QR' : 'MANUAL'
      };
    } catch {
      return { bookingId: raw.length <= 100 ? raw : null, showId: null, theatreId: null, token: null, source: 'MANUAL' };
    }
  }
}

export async function getTicketCheckerTheatres(theatreScope?: string | null) {
  const [rows] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT id, code, name, city FROM theatres WHERE status = 'ACTIVE'${theatreScope ? ' AND id = ?' : ''} ORDER BY city, name`,
    theatreScope ? [theatreScope] : []
  );
  return rows.map((row) => ({ id: String(row.id), code: String(row.code), name: String(row.name), city: String(row.city) }));
}

export async function getTicketCheckerShows(input: { theatreId: string; date: string; theatreScope?: string | null }) {
  if (input.theatreScope && input.theatreScope !== input.theatreId) return [];
  const [rows] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT s.id, DATE_FORMAT(s.show_time, '%Y-%m-%dT%H:%i:%s') AS showTime, s.status, m.id AS movieId, m.title AS movieTitle,
            sc.id AS screenId, sc.name AS screenName, t.id AS theatreId, t.name AS theatreName
     FROM shows s
     JOIN movies m ON m.id = s.movie_id
     JOIN screens sc ON sc.id = s.screen_id
     JOIN theatres t ON t.id = s.theatre_id
     WHERE s.theatre_id = ? AND DATE(s.show_time) = ?
     ORDER BY m.title, s.show_time`,
    [input.theatreId, input.date]
  );
  return rows.map((row) => ({
    id: String(row.id), movieId: String(row.movieId), movieTitle: String(row.movieTitle),
    theatreId: String(row.theatreId), theatreName: String(row.theatreName),
    screenId: String(row.screenId), screenName: String(row.screenName),
    showTime: theatreDateTimeIso(row.showTime), status: String(row.status)
  }));
}

async function logScan(connection: Awaited<ReturnType<ReturnType<typeof getCentralDbPool>['getConnection']>>, input: {
  checkerUserId: string; bookingId?: string | null; theatreId: string; showId: string; result: string; reason?: string | null; metadata?: Record<string, unknown>;
}) {
  await connection.query(
    `INSERT INTO ticket_scan_logs (checker_user_id, booking_id, selected_theatre_id, selected_show_id, result, reason, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.checkerUserId, input.bookingId ?? null, input.theatreId, input.showId, input.result, input.reason ?? null, JSON.stringify(input.metadata ?? {})]
  );
}

export async function validateAndAdmitTicket(input: { rawValue: string; theatreId: string; showId: string; session: TicketCheckerSession }) {
  await ensureTicketCheckerTables();
  if (input.session.theatreId && input.session.theatreId !== input.theatreId) {
    return { success: false, outcome: 'INVALID', reason: 'THEATRE_ACCESS_DENIED', message: 'This checker is not assigned to the selected theatre.' };
  }
  const parsed = parseTicketQr(input.rawValue);
  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();
    if (!parsed.bookingId) {
      await logScan(connection, { checkerUserId: input.session.userId, theatreId: input.theatreId, showId: input.showId, result: 'INVALID', reason: 'UNREADABLE_QR' });
      await connection.commit();
      return { success: false, outcome: 'INVALID', reason: 'UNREADABLE_QR', message: 'Invalid ticket QR code.' };
    }
    const [[booking]] = await connection.query<RowDataPacket[]>(
      `SELECT b.id AS bookingId, b.show_id AS showId, b.status, b.channel, b.total_amount AS totalAmount,
              s.theatre_id AS theatreId, DATE_FORMAT(s.show_time, '%Y-%m-%dT%H:%i:%s') AS showTime, m.title AS movieTitle,
              t.name AS theatreName, sc.name AS screenName
       FROM central_bookings b
       JOIN shows s ON s.id = b.show_id
       JOIN movies m ON m.id = s.movie_id
       JOIN theatres t ON t.id = s.theatre_id
       JOIN screens sc ON sc.id = s.screen_id
       WHERE b.id = ? LIMIT 1 FOR UPDATE`,
      [parsed.bookingId]
    );
    if (!booking) {
      await logScan(connection, { checkerUserId: input.session.userId, bookingId: parsed.bookingId, theatreId: input.theatreId, showId: input.showId, result: 'INVALID', reason: 'TICKET_NOT_FOUND' });
      await connection.commit();
      return { success: false, outcome: 'INVALID', reason: 'TICKET_NOT_FOUND', message: 'Ticket not found.' };
    }
    const [items] = await connection.query<RowDataPacket[]>(
      'SELECT seat_id AS seatId, zone FROM central_booking_items WHERE booking_id = ? ORDER BY zone, seat_id',
      [parsed.bookingId]
    );
    const groups = new Map<string, string[]>();
    for (const item of items) groups.set(String(item.zone), [...(groups.get(String(item.zone)) ?? []), String(item.seatId)]);
    const ticket = {
      bookingId: String(booking.bookingId), showId: String(booking.showId), theatreId: String(booking.theatreId),
      theatreName: String(booking.theatreName), movieTitle: String(booking.movieTitle), screenName: String(booking.screenName),
      showTime: theatreDateTimeIso(booking.showTime), status: String(booking.status), channel: String(booking.channel),
      totalAmount: Number(booking.totalAmount ?? 0), groups: Array.from(groups, ([zone, seats]) => ({ zone, seats }))
    };
    let reason: string | null = null;
    if (parsed.token && !ticketVerificationTokenMatches(parsed.token, ticket.bookingId, ticket.showId)) reason = 'INVALID_SIGNATURE';
    else if (parsed.showId && parsed.showId !== ticket.showId) reason = 'QR_DETAILS_MISMATCH';
    else if (parsed.theatreId && parsed.theatreId !== ticket.theatreId) reason = 'QR_DETAILS_MISMATCH';
    else if (ticket.status !== 'CONFIRMED') reason = 'TICKET_NOT_CONFIRMED';
    else if (!items.length) reason = 'TICKET_HAS_NO_SEATS';
    else if (ticket.theatreId !== input.theatreId) reason = 'OTHER_THEATRE';
    else if (ticket.showId !== input.showId) reason = 'OTHER_SHOW';
    if (reason) {
      await logScan(connection, { checkerUserId: input.session.userId, bookingId: ticket.bookingId, theatreId: input.theatreId, showId: input.showId, result: 'INVALID', reason, metadata: { ticketShowId: ticket.showId, ticketTheatreId: ticket.theatreId, source: parsed.source } });
      await connection.commit();
      const message = reason === 'OTHER_THEATRE' ? `Valid ticket, but for ${ticket.theatreName}.` : reason === 'OTHER_SHOW' ? `Valid ticket, but for ${ticket.movieTitle} at ${formatTheatreDateTime(ticket.showTime)}.` : 'This ticket cannot be admitted.';
      return { success: false, outcome: 'INVALID', reason, message, ticket };
    }
    const [insert] = await connection.query<ResultSetHeader>(
      `INSERT IGNORE INTO ticket_attendance (booking_id, show_id, theatre_id, checker_user_id, admission_source)
       VALUES (?, ?, ?, ?, ?)`,
      [ticket.bookingId, ticket.showId, ticket.theatreId, input.session.userId, parsed.source]
    );
    const [[attendance]] = await connection.query<RowDataPacket[]>(
      'SELECT admitted_at AS admittedAt FROM ticket_attendance WHERE booking_id = ? LIMIT 1',
      [ticket.bookingId]
    );
    const isNew = insert.affectedRows === 1;
    await logScan(connection, { checkerUserId: input.session.userId, bookingId: ticket.bookingId, theatreId: input.theatreId, showId: input.showId, result: isNew ? 'ADMITTED' : 'ALREADY_ADMITTED', metadata: { source: parsed.source } });
    await connection.commit();
    return {
      success: true, outcome: isNew ? 'VALID' : 'ALREADY_ADMITTED', reason: isNew ? null : 'ALREADY_ADMITTED',
      message: isNew ? 'Ticket valid. Attendance marked.' : 'Ticket was already admitted.', ticket,
      attendanceMarked: isNew, admittedAt: new Date(attendance.admittedAt).toISOString()
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getAttendanceSheet(showId: string, theatreScope?: string | null) {
  const [rows] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT a.booking_id AS bookingId, a.admitted_at AS admittedAt, a.admission_source AS source,
            u.display_name AS checkerName, b.channel, b.total_amount AS totalAmount,
            s.id AS showId, s.theatre_id AS theatreId, DATE_FORMAT(s.show_time, '%Y-%m-%dT%H:%i:%s') AS showTime,
            m.title AS movieTitle, t.name AS theatreName, sc.name AS screenName
     FROM ticket_attendance a
     JOIN central_bookings b ON b.id = a.booking_id
     JOIN shows s ON s.id = a.show_id
     JOIN movies m ON m.id = s.movie_id
     JOIN theatres t ON t.id = s.theatre_id
     JOIN screens sc ON sc.id = s.screen_id
     LEFT JOIN ticket_checker_users u ON u.id = a.checker_user_id
     WHERE a.show_id = ?${theatreScope ? ' AND a.theatre_id = ?' : ''}
     ORDER BY a.admitted_at DESC`,
    theatreScope ? [showId, theatreScope] : [showId]
  );
  if (!rows.length) return { show: null, entries: [], admittedTickets: 0, admittedSeats: 0 };
  const bookingIds = rows.map((row) => String(row.bookingId));
  const placeholders = bookingIds.map(() => '?').join(',');
  const [items] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT booking_id AS bookingId, seat_id AS seatId, zone FROM central_booking_items WHERE booking_id IN (${placeholders}) ORDER BY zone, seat_id`,
    bookingIds
  );
  const itemMap = new Map<string, { zone: string; seatId: string }[]>();
  for (const item of items) itemMap.set(String(item.bookingId), [...(itemMap.get(String(item.bookingId)) ?? []), { zone: String(item.zone), seatId: String(item.seatId) }]);
  const first = rows[0];
  return {
    show: { id: String(first.showId), theatreId: String(first.theatreId), theatreName: String(first.theatreName), movieTitle: String(first.movieTitle), screenName: String(first.screenName), showTime: theatreDateTimeIso(first.showTime) },
    admittedTickets: rows.length, admittedSeats: items.length,
    entries: rows.map((row) => ({ bookingId: String(row.bookingId), admittedAt: new Date(row.admittedAt).toISOString(), source: String(row.source), checkerName: String(row.checkerName ?? 'Checker'), channel: String(row.channel), totalAmount: Number(row.totalAmount ?? 0), seats: itemMap.get(String(row.bookingId)) ?? [] }))
  };
}
