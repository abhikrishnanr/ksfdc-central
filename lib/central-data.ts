import { RowDataPacket } from 'mysql2';
import { canShowBeBookedOnline, getOnlineBookingUnavailableMessage, getOnlineBookingUnavailableReason, normalizeCentralAuthorityMode } from './booking-policy';
import type { OnlineBookingUnavailableReason } from './booking-policy';
import { checkCentralDb, getCentralDbPool } from './db';
import { ensureCentralHeartbeatTables, ensureCentralMirrorEventsTable, ensureCentralSyncInbox } from './sync';
import { getLocalShowSeats } from './local-theatre-client';
import { getBookingAuthorityDecision } from './booking-authority';

export type DbStatus = Awaited<ReturnType<typeof checkCentralDb>>;

export interface CentralShowSummary {
  showId: string;
  movieId: string;
  movieTitle: string;
  moviePosterUrl: string | null;
  movieTrailerUrl: string | null;
  language: string | null;
  durationMinutes: number | null;
  certificate: string | null;
  genres: string[];
  formats: string[];
  theatreId: string;
  theatreName: string;
  screenName: string;
  showTime: string;
  authorityMode: string;
  status: string;
  availableSeats: number;
  soldSeats: number;
  heldSeats: number;
  bookingEnabled?: boolean;
  reason?: OnlineBookingUnavailableReason;
}

export interface CentralMovieSummary {
  id: string;
  title: string;
  language: string | null;
  durationMinutes: number | null;
  certificate: string | null;
  releaseDate: string | null;
  posterUrl: string | null;
  trailerUrl: string | null;
  synopsis: string | null;
  genres: string[];
  formats: string[];
  languages: string[];
  activeShowCount: number;
}

export interface CentralMovieCastMember {
  name: string;
  characterName: string | null;
  role: string | null;
  photoUrl: string | null;
}

export interface CentralMovieCrew {
  director: { name: string; photoUrl: string | null } | null;
  producers: Array<{ name: string; company: string | null }>;
  screenplay: string[];
  musicDirectors: string[];
  cinematographer: string | null;
  editor: string | null;
}

export interface CentralMovieShowtime {
  showId: string;
  theatreId: string;
  theatreName: string;
  city: string;
  screenName: string;
  showTime: string;
  authorityMode: string;
  status: string;
  priceStartsAt: number | null;
  availableSeats?: number;
  format?: string | null;
}

export interface CentralMovieDetail extends CentralMovieSummary {
  cast: CentralMovieCastMember[];
  crew: CentralMovieCrew;
  showtimes: CentralMovieShowtime[];
}

export interface PublicShowtimeSummary extends CentralShowSummary {
  city: string;
  synopsis: string | null;
  releaseDate: string | null;
  priceStartsAt: number | null;
}

export interface PublicSearchSuggestion {
  id: string;
  type: 'Movie' | 'Theatre';
  label: string;
  detail: string;
  href: string;
}

export interface CentralTheatreSummary {
  id: string;
  code: string;
  name: string;
  city: string;
  screenCount: number;
  activeShowCount: number;
  priceStartsAt: number | null;
}

export interface ZoneRate {
  zone: string;
  amount: number;
}

export interface SeatCell {
  cellId: string;
  kind: 'SEAT' | 'GAP' | 'AISLE' | 'BLOCKED';
  rowLabel: string;
  displayOrder: number;
  seatId: string | null;
  seatNumber: string | null;
  zone: string | null;
  accessibility?: string | null;
  price: number | null;
  status: 'AVAILABLE' | 'HELD' | 'SOLD' | 'BLOCKED';
}

export interface BookingShowDetail {
  showId: string;
  movieId: string;
  movieTitle: string;
  moviePosterUrl: string | null;
  movieTrailerUrl: string | null;
  language: string | null;
  durationMinutes: number | null;
  certificate: string | null;
  genres: string[];
  formats: string[];
  theatreId: string;
  theatreName: string;
  screenName: string;
  showTime: string;
  authorityMode: string;
  status: string;
  bookingEnabled?: boolean;
  reason?: OnlineBookingUnavailableReason;
  layoutName: string;
  screenSideLabel: string;
  zoneRates: ZoneRate[];
  rows: Array<{ rowLabel: string; cells: SeatCell[] }>;
}

export interface AdminDashboardData {
  totalShowsToday: number;
  totalBookingsToday: number;
  centralBookingsToday: number;
  localSyncedBookingsToday: number;
  agentBookingsToday: number;
  totalCollection: number;
  returningToCentralCount: number;
  localAuthorityOfflineCount: number;
  pendingSyncEvents: number;
  failedSyncEvents: number;
  latestReceivedLocalSequenceNo: number | null;
  latestCentralMirrorSequenceNo: number | null;
  activeAgents: number;
  authorityByShow: Array<{ showId: string; movieTitle: string; authorityMode: string; localHeartbeatAt: string | null; pendingSyncEvents: number; failedSyncEvents: number }>;
  theatreHeartbeats: Array<{ theatreId: string; status: string; localHeartbeatStatus: string; lastSeenAt: string; authorityMode: string; pendingLocalEvents: number; failedLocalEvents: number; lastLocalSequence: number; lastCentralMirrorSequence: number; localAppUrl: string | null }>;
  theatreHeartbeat: { theatreId: string; status: string; localHeartbeatStatus: string; lastSeenAt: string; authorityMode: string; pendingLocalEvents: number; failedLocalEvents: number; lastLocalSequence: number; lastCentralMirrorSequence: number; localAppUrl: string | null } | null;
}

export interface SeatLayoutSummary {
  id: string;
  name: string;
  theatreName: string;
  screenName: string;
  zones: ZoneRate[];
  rows: Array<{ rowLabel: string; cells: SeatCell[] }>;
  totalSeats: number;
  gapCount: number;
}

async function safe<T>(fallback: T, loader: () => Promise<T>): Promise<{ dbStatus: DbStatus; data: T }> {
  const dbStatus = await checkCentralDb();
  if (!dbStatus.ok) return { dbStatus, data: fallback };
  try {
    return { dbStatus, data: await loader() };
  } catch (error) {
    return {
      dbStatus: {
        ok: false,
        message: 'Central database is unavailable or not seeded.',
        error: error instanceof Error ? error.message : String(error)
      },
      data: fallback
    };
  }
}

function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonValue(value: unknown): unknown {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function parseCast(value: unknown): CentralMovieCastMember[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((member) => {
    const record = member && typeof member === 'object' ? member as Record<string, unknown> : {};
    return {
      name: String(record.name ?? ''),
      characterName: record.character_name ? String(record.character_name) : null,
      role: record.role ? String(record.role) : null,
      photoUrl: record.photo_url ? String(record.photo_url) : null
    };
  }).filter((member) => member.name);
}

function parseCrew(value: unknown): CentralMovieCrew {
  const record = parseJsonValue(value);
  const crew = record && typeof record === 'object' ? record as Record<string, unknown> : {};
  const director = crew.director && typeof crew.director === 'object' ? crew.director as Record<string, unknown> : null;
  const producers = Array.isArray(crew.producers) ? crew.producers : [];
  return {
    director: director?.name ? { name: String(director.name), photoUrl: director.photo_url ? String(director.photo_url) : null } : null,
    producers: producers.map((producer) => {
      const item = producer && typeof producer === 'object' ? producer as Record<string, unknown> : {};
      return { name: String(item.name ?? ''), company: item.company ? String(item.company) : null };
    }).filter((producer) => producer.name),
    screenplay: Array.isArray(crew.screenplay) ? crew.screenplay.map(String) : [],
    musicDirectors: Array.isArray(crew.music_directors) ? crew.music_directors.map(String) : [],
    cinematographer: crew.cinematographer ? String(crew.cinematographer) : null,
    editor: crew.editor ? String(crew.editor) : null
  };
}

export async function getTodaysShows() {
  return safe<CentralShowSummary[]>([], async () => {
    const [rows] = await getCentralDbPool().query<RowDataPacket[]>(`
      SELECT s.id AS showId, m.id AS movieId, m.title AS movieTitle, m.poster_url AS moviePosterUrl,
             m.youtube_trailer_url AS movieTrailerUrl, m.language, m.duration_minutes AS durationMinutes,
             m.certificate, m.genre_json AS genreJson, m.formats_json AS formatsJson,
             s.theatre_id AS theatreId, t.name AS theatreName, sc.name AS screenName,
             s.show_time AS showTime, s.authority_mode AS authorityMode, s.status,
             SUM(CASE WHEN sls.item_type = 'SEAT' AND sls.is_blocked = FALSE AND c.seat_id IS NULL AND h.seat_id IS NULL THEN 1 ELSE 0 END) AS availableSeats,
             SUM(CASE WHEN c.seat_id IS NOT NULL THEN 1 ELSE 0 END) AS soldSeats,
             SUM(CASE WHEN h.seat_id IS NOT NULL THEN 1 ELSE 0 END) AS heldSeats
      FROM shows s
      JOIN movies m ON m.id = s.movie_id
      JOIN theatres t ON t.id = s.theatre_id
      JOIN screens sc ON sc.id = s.screen_id
      JOIN seat_layout_seats sls ON sls.layout_id = s.layout_id
      LEFT JOIN central_confirmed_seats c ON c.show_id = s.id AND c.seat_id = sls.seat_id
      LEFT JOIN (
        SELECT hi.show_id, hi.seat_id
        FROM central_seat_hold_items hi
        JOIN central_seat_holds hh ON hh.id = hi.hold_id
        WHERE hh.status = 'ACTIVE' AND hh.expires_at > NOW()
      ) h ON h.show_id = s.id AND h.seat_id = sls.seat_id
      WHERE DATE(s.show_time) = CURRENT_DATE()
      GROUP BY s.id, m.id, m.title, m.poster_url, m.youtube_trailer_url, m.language, m.duration_minutes,
               m.certificate, m.genre_json, m.formats_json, s.theatre_id, t.name, sc.name, s.show_time,
               s.authority_mode, s.status
      ORDER BY s.show_time
    `);
    return rows.map((row) => ({
      showId: String(row.showId),
      movieId: String(row.movieId),
      movieTitle: String(row.movieTitle),
      moviePosterUrl: row.moviePosterUrl ? String(row.moviePosterUrl) : null,
      movieTrailerUrl: row.movieTrailerUrl ? String(row.movieTrailerUrl) : null,
      language: row.language ? String(row.language) : null,
      durationMinutes: row.durationMinutes == null ? null : Number(row.durationMinutes),
      certificate: row.certificate ? String(row.certificate) : null,
      genres: parseJsonArray(row.genreJson),
      formats: parseJsonArray(row.formatsJson),
      theatreId: String(row.theatreId),
      theatreName: String(row.theatreName),
      screenName: String(row.screenName),
      showTime: new Date(row.showTime).toISOString(),
      authorityMode: String(row.authorityMode),
      status: String(row.status),
      availableSeats: Number(row.availableSeats ?? 0),
      soldSeats: Number(row.soldSeats ?? 0),
      heldSeats: Number(row.heldSeats ?? 0)
    }));
  });
}

export async function getMovies() {
  return safe<CentralMovieSummary[]>([], async () => {
    const [rows] = await getCentralDbPool().query<RowDataPacket[]>(`
      SELECT m.id, m.title, m.language, m.duration_minutes AS durationMinutes, m.certificate,
             m.release_date AS releaseDate, m.poster_url AS posterUrl, m.youtube_trailer_url AS trailerUrl,
             m.synopsis, m.genre_json AS genreJson, m.formats_json AS formatsJson, m.languages_json AS languagesJson,
             COUNT(CASE WHEN s.status IN ('SCHEDULED','OPEN') THEN 1 END) AS activeShowCount
      FROM movies m
      LEFT JOIN shows s ON s.movie_id = m.id AND DATE(s.show_time) >= CURRENT_DATE()
      WHERE m.status = 'ACTIVE'
      GROUP BY m.id, m.title, m.language, m.duration_minutes, m.certificate, m.release_date,
               m.poster_url, m.youtube_trailer_url, m.synopsis, m.genre_json, m.formats_json, m.languages_json
      ORDER BY m.title
    `);
    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      language: row.language ? String(row.language) : null,
      durationMinutes: row.durationMinutes == null ? null : Number(row.durationMinutes),
      certificate: row.certificate ? String(row.certificate) : null,
      releaseDate: row.releaseDate ? new Date(row.releaseDate).toISOString().slice(0, 10) : null,
      posterUrl: row.posterUrl ? String(row.posterUrl) : null,
      trailerUrl: row.trailerUrl ? String(row.trailerUrl) : null,
      synopsis: row.synopsis ? String(row.synopsis) : null,
      genres: parseJsonArray(row.genreJson),
      formats: parseJsonArray(row.formatsJson),
      languages: parseJsonArray(row.languagesJson),
      activeShowCount: Number(row.activeShowCount ?? 0)
    }));
  });
}

export async function getPublicShowtimes(options: { dayOffset?: number; city?: string | null; movieId?: string | null; theatreId?: string | null } = {}) {
  return safe<PublicShowtimeSummary[]>([], async () => {
    const dayOffset = Number.isFinite(Number(options.dayOffset)) ? Math.max(0, Math.min(2, Math.trunc(Number(options.dayOffset)))) : 0;
    const filters = ['DATE(s.show_time) = DATE(DATE_ADD(CURRENT_DATE(), INTERVAL ? DAY))'];
    const params: Array<string | number> = [dayOffset];
    if (options.city) {
      filters.push('t.city = ?');
      params.push(options.city);
    }
    if (options.movieId) {
      filters.push('m.id = ?');
      params.push(options.movieId);
    }
    if (options.theatreId) {
      filters.push('t.id = ?');
      params.push(options.theatreId);
    }

    const [rows] = await getCentralDbPool().query<RowDataPacket[]>(`
      SELECT s.id AS showId, m.id AS movieId, m.title AS movieTitle, m.poster_url AS moviePosterUrl,
             m.youtube_trailer_url AS movieTrailerUrl, m.language, m.duration_minutes AS durationMinutes,
             m.certificate, m.genre_json AS genreJson, m.formats_json AS formatsJson, m.synopsis, m.release_date AS releaseDate,
             s.theatre_id AS theatreId, t.name AS theatreName, t.city, sc.name AS screenName,
             s.show_time AS showTime, s.authority_mode AS authorityMode, s.status,
             MIN(sp.amount) AS priceStartsAt,
             SUM(CASE WHEN sls.item_type = 'SEAT' AND sls.is_blocked = FALSE AND c.seat_id IS NULL AND h.seat_id IS NULL THEN 1 ELSE 0 END) AS availableSeats,
             SUM(CASE WHEN c.seat_id IS NOT NULL THEN 1 ELSE 0 END) AS soldSeats,
             SUM(CASE WHEN h.seat_id IS NOT NULL THEN 1 ELSE 0 END) AS heldSeats
      FROM shows s
      JOIN movies m ON m.id = s.movie_id
      JOIN theatres t ON t.id = s.theatre_id
      JOIN screens sc ON sc.id = s.screen_id
      JOIN seat_layout_seats sls ON sls.layout_id = s.layout_id
      LEFT JOIN show_pricing sp ON sp.show_id = s.id AND sp.zone_code = sls.zone_code
      LEFT JOIN central_confirmed_seats c ON c.show_id = s.id AND c.seat_id = sls.seat_id
      LEFT JOIN (
        SELECT hi.show_id, hi.seat_id
        FROM central_seat_hold_items hi
        JOIN central_seat_holds hh ON hh.id = hi.hold_id
        WHERE hh.status = 'ACTIVE' AND hh.expires_at > NOW()
      ) h ON h.show_id = s.id AND h.seat_id = sls.seat_id
      WHERE ${filters.join(' AND ')}
      GROUP BY s.id, m.id, m.title, m.poster_url, m.youtube_trailer_url, m.language, m.duration_minutes,
               m.certificate, m.genre_json, m.formats_json, m.synopsis, m.release_date, s.theatre_id, t.name, t.city,
               sc.name, s.show_time, s.authority_mode, s.status
      ORDER BY m.title, t.city, t.name, s.show_time
    `, params);

    const summaries: PublicShowtimeSummary[] = rows.map((row) => ({
      showId: String(row.showId),
      movieId: String(row.movieId),
      movieTitle: String(row.movieTitle),
      moviePosterUrl: row.moviePosterUrl ? String(row.moviePosterUrl) : null,
      movieTrailerUrl: row.movieTrailerUrl ? String(row.movieTrailerUrl) : null,
      language: row.language ? String(row.language) : null,
      durationMinutes: row.durationMinutes == null ? null : Number(row.durationMinutes),
      certificate: row.certificate ? String(row.certificate) : null,
      genres: parseJsonArray(row.genreJson),
      formats: parseJsonArray(row.formatsJson),
      theatreId: String(row.theatreId),
      theatreName: String(row.theatreName),
      city: String(row.city),
      screenName: String(row.screenName),
      showTime: new Date(row.showTime).toISOString(),
      authorityMode: String(row.authorityMode),
      status: String(row.status),
      availableSeats: Number(row.availableSeats ?? 0),
      soldSeats: Number(row.soldSeats ?? 0),
      heldSeats: Number(row.heldSeats ?? 0),
      synopsis: row.synopsis ? String(row.synopsis) : null,
      releaseDate: row.releaseDate ? new Date(row.releaseDate).toISOString().slice(0, 10) : null,
      priceStartsAt: row.priceStartsAt == null ? null : Number(row.priceStartsAt)
    }));

    return Promise.all(summaries.map(async (show) => {
      const decision = await getBookingAuthorityDecision({
        showId: show.showId,
        theatreId: show.theatreId,
        authorityMode: show.authorityMode,
        status: show.status
      });
      if (!decision) return { ...show, bookingEnabled: false, reason: 'UNKNOWN' as const };
      const reason = decision.publicBookingAllowed ? undefined : getOnlineBookingUnavailableReason({
        authorityMode: decision.authorityMode,
        status: show.status,
        localReachable: decision.localReachable
      });
      return {
        ...show,
        authorityMode: decision.authorityMode,
        bookingEnabled: decision.publicBookingAllowed,
        reason
      };
    }));
  });
}

export async function getMovieDetail(movieId: string) {
  return safe<CentralMovieDetail | null>(null, async () => {
    const [[movie]] = await getCentralDbPool().query<RowDataPacket[]>(`
      SELECT m.id, m.title, m.language, m.duration_minutes AS durationMinutes, m.certificate,
             m.release_date AS releaseDate, m.poster_url AS posterUrl, m.youtube_trailer_url AS trailerUrl,
             m.synopsis, m.genre_json AS genreJson, m.formats_json AS formatsJson, m.languages_json AS languagesJson,
             m.cast_json AS castJson, m.crew_json AS crewJson,
             COUNT(CASE WHEN s.status IN ('SCHEDULED','OPEN') AND DATE(s.show_time) >= CURRENT_DATE() THEN 1 END) AS activeShowCount
      FROM movies m
      LEFT JOIN shows s ON s.movie_id = m.id
      WHERE m.id = ? AND m.status = 'ACTIVE'
      GROUP BY m.id, m.title, m.language, m.duration_minutes, m.certificate, m.release_date,
               m.poster_url, m.youtube_trailer_url, m.synopsis, m.genre_json, m.formats_json,
               m.languages_json, m.cast_json, m.crew_json
      LIMIT 1
    `, [movieId]);
    if (!movie) return null;

    const [showRows] = await getCentralDbPool().query<RowDataPacket[]>(`
      SELECT s.id AS showId, s.theatre_id AS theatreId, t.name AS theatreName, t.city,
             sc.name AS screenName, s.show_time AS showTime, s.authority_mode AS authorityMode,
             s.status, MIN(sp.amount) AS priceStartsAt
      FROM shows s
      JOIN theatres t ON t.id = s.theatre_id
      JOIN screens sc ON sc.id = s.screen_id
      LEFT JOIN show_pricing sp ON sp.show_id = s.id
      WHERE s.movie_id = ? AND s.status IN ('SCHEDULED','OPEN') AND DATE(s.show_time) >= CURRENT_DATE()
      GROUP BY s.id, s.theatre_id, t.name, t.city, sc.name, s.show_time, s.authority_mode, s.status
      ORDER BY t.city, t.name, s.show_time
    `, [movieId]);

    return {
      id: String(movie.id),
      title: String(movie.title),
      language: movie.language ? String(movie.language) : null,
      durationMinutes: movie.durationMinutes == null ? null : Number(movie.durationMinutes),
      certificate: movie.certificate ? String(movie.certificate) : null,
      releaseDate: movie.releaseDate ? new Date(movie.releaseDate).toISOString().slice(0, 10) : null,
      posterUrl: movie.posterUrl ? String(movie.posterUrl) : null,
      trailerUrl: movie.trailerUrl ? String(movie.trailerUrl) : null,
      synopsis: movie.synopsis ? String(movie.synopsis) : null,
      genres: parseJsonArray(movie.genreJson),
      formats: parseJsonArray(movie.formatsJson),
      languages: parseJsonArray(movie.languagesJson),
      activeShowCount: Number(movie.activeShowCount ?? 0),
      cast: parseCast(movie.castJson),
      crew: parseCrew(movie.crewJson),
      showtimes: showRows.map((row) => ({
        showId: String(row.showId),
        theatreId: String(row.theatreId),
        theatreName: String(row.theatreName),
        city: String(row.city),
        screenName: String(row.screenName),
        showTime: new Date(row.showTime).toISOString(),
        authorityMode: String(row.authorityMode),
        status: String(row.status),
        priceStartsAt: row.priceStartsAt == null ? null : Number(row.priceStartsAt),
        format: null
      }))
    };
  });
}

export async function getTheatreDetail(theatreId: string) {
  return safe<(CentralTheatreSummary & { showtimes: PublicShowtimeSummary[] }) | null>(null, async () => {
    const [[theatre]] = await getCentralDbPool().query<RowDataPacket[]>(`
      SELECT t.id, t.code, t.name, t.city, COUNT(DISTINCT sc.id) AS screenCount,
             COUNT(DISTINCT CASE WHEN s.status IN ('SCHEDULED','OPEN') AND DATE(s.show_time) >= CURRENT_DATE() THEN s.id END) AS activeShowCount,
             MIN(CASE WHEN s.status IN ('SCHEDULED','OPEN') AND DATE(s.show_time) >= CURRENT_DATE() THEN sp.amount END) AS priceStartsAt
      FROM theatres t
      LEFT JOIN screens sc ON sc.theatre_id = t.id
      LEFT JOIN shows s ON s.theatre_id = t.id
      LEFT JOIN show_pricing sp ON sp.show_id = s.id
      WHERE t.id = ? AND t.status = 'ACTIVE'
      GROUP BY t.id, t.code, t.name, t.city
      LIMIT 1
    `, [theatreId]);
    if (!theatre) return null;
    const showtimes = await getPublicShowtimes({ theatreId });
    return {
      id: String(theatre.id),
      code: String(theatre.code),
      name: String(theatre.name),
      city: String(theatre.city),
      screenCount: Number(theatre.screenCount ?? 0),
      activeShowCount: Number(theatre.activeShowCount ?? 0),
      priceStartsAt: theatre.priceStartsAt == null ? null : Number(theatre.priceStartsAt),
      showtimes: showtimes.data
    };
  });
}

export async function getPublicSearchSuggestions(query: string) {
  return safe<PublicSearchSuggestion[]>([], async () => {
    const term = query.trim();
    if (term.length < 2) return [];
    const like = `%${term}%`;
    const [movieRows] = await getCentralDbPool().query<RowDataPacket[]>(`
      SELECT id, title, language
      FROM movies
      WHERE status = 'ACTIVE' AND title LIKE ?
      ORDER BY title
      LIMIT 5
    `, [like]);
    const [theatreRows] = await getCentralDbPool().query<RowDataPacket[]>(`
      SELECT id, name, city
      FROM theatres
      WHERE status = 'ACTIVE' AND (name LIKE ? OR city LIKE ?)
      ORDER BY city, name
      LIMIT 5
    `, [like, like]);
    return [
      ...movieRows.map((row) => ({
        id: String(row.id),
        type: 'Movie' as const,
        label: String(row.title),
        detail: row.language ? String(row.language) : 'Movie',
        href: `/movies/${String(row.id)}`
      })),
      ...theatreRows.map((row) => ({
        id: String(row.id),
        type: 'Theatre' as const,
        label: String(row.name),
        detail: String(row.city),
        href: `/theatres/${String(row.id)}`
      }))
    ];
  });
}

export async function getTheatres() {
  return safe<CentralTheatreSummary[]>([], async () => {
    const [rows] = await getCentralDbPool().query<RowDataPacket[]>(`
      SELECT t.id, t.code, t.name, t.city,
             COUNT(DISTINCT sc.id) AS screenCount,
             COUNT(DISTINCT CASE WHEN s.status IN ('SCHEDULED','OPEN') AND DATE(s.show_time) >= CURRENT_DATE() THEN s.id END) AS activeShowCount,
             MIN(CASE WHEN s.status IN ('SCHEDULED','OPEN') AND DATE(s.show_time) >= CURRENT_DATE() THEN sp.amount END) AS priceStartsAt
      FROM theatres t
      LEFT JOIN screens sc ON sc.theatre_id = t.id
      LEFT JOIN shows s ON s.theatre_id = t.id
      LEFT JOIN show_pricing sp ON sp.show_id = s.id
      WHERE t.status = 'ACTIVE'
      GROUP BY t.id, t.code, t.name, t.city
      ORDER BY t.city, t.name
    `);
    return rows.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      city: String(row.city),
      screenCount: Number(row.screenCount ?? 0),
      activeShowCount: Number(row.activeShowCount ?? 0),
      priceStartsAt: row.priceStartsAt == null ? null : Number(row.priceStartsAt)
    }));
  });
}

export async function getHomeData() {
  const shows = await getTodaysShows();
  return {
    dbStatus: shows.dbStatus,
    data: {
      todaysShows: shows.data,
      localAuthorityCount: shows.data.filter((show) => show.authorityMode === 'LOCAL_AUTHORITY_ONLINE' || show.authorityMode === 'LOCAL_AUTHORITY_OFFLINE' || show.authorityMode === 'LOCAL_AUTHORITY_COUNTER_ONLY').length,
      centralAuthorityCount: shows.data.filter((show) => show.authorityMode === 'CENTRAL_AUTHORITY').length
    }
  };
}

export async function getBookingShow(showId: string) {
  return safe<BookingShowDetail | null>(null, async () => {
    const [[show]] = await getCentralDbPool().query<RowDataPacket[]>(`
      SELECT s.id AS showId, m.id AS movieId, m.title AS movieTitle, m.poster_url AS moviePosterUrl,
             m.youtube_trailer_url AS movieTrailerUrl, m.language, m.duration_minutes AS durationMinutes,
             m.certificate, m.genre_json AS genreJson, m.formats_json AS formatsJson,
             s.theatre_id AS theatreId, t.name AS theatreName, sc.name AS screenName,
             s.show_time AS showTime, s.authority_mode AS authorityMode, s.status, l.name AS layoutName, l.screen_side_label AS screenSideLabel
      FROM shows s
      JOIN movies m ON m.id = s.movie_id
      JOIN theatres t ON t.id = s.theatre_id
      JOIN screens sc ON sc.id = s.screen_id
      JOIN seat_layouts l ON l.id = s.layout_id
      WHERE s.id = ?
      LIMIT 1
    `, [showId]);
    if (!show) return null;

    const [prices] = await getCentralDbPool().query<RowDataPacket[]>("SELECT zone_code AS zone, amount FROM show_pricing WHERE show_id = ? ORDER BY amount DESC, zone_code ASC", [showId]);
    const [cells] = await getCentralDbPool().query<RowDataPacket[]>(`
      SELECT sls.seat_id AS cellId, CASE WHEN sls.item_type = 'BLOCKED' THEN 'SEAT' ELSE sls.item_type END AS kind, sls.row_label AS rowLabel, sls.display_order AS displayOrder,
             sls.seat_id AS seatId, sls.seat_number AS seatNumber, sls.zone_code AS zone, sls.accessibility, sp.amount,
             CASE
               WHEN sls.item_type IN ('GAP','AISLE') THEN 'AVAILABLE'
               WHEN sls.is_blocked = TRUE OR sls.item_type = 'BLOCKED' THEN 'BLOCKED'
               WHEN c.seat_id IS NOT NULL THEN 'SOLD'
               WHEN h.seat_id IS NOT NULL THEN 'HELD'
               ELSE 'AVAILABLE'
             END AS seatStatus
      FROM shows s
      JOIN seat_layout_seats sls ON sls.layout_id = s.layout_id
      LEFT JOIN show_pricing sp ON sp.show_id = s.id AND sp.zone_code = sls.zone_code
      LEFT JOIN central_confirmed_seats c ON c.show_id = s.id AND c.seat_id = sls.seat_id
      LEFT JOIN (
        SELECT hi.show_id, hi.seat_id
        FROM central_seat_hold_items hi
        JOIN central_seat_holds hh ON hh.id = hi.hold_id
        WHERE hh.status = 'ACTIVE' AND hh.expires_at > NOW()
      ) h ON h.show_id = s.id AND h.seat_id = sls.seat_id
      WHERE s.id = ?
      ORDER BY sls.row_sort, sls.row_label, sls.display_order
    `, [showId]);

    const rowMap = new Map<string, SeatCell[]>();
    for (const cell of cells) {
      const rowLabel = String(cell.rowLabel);
      const item: SeatCell = {
        cellId: String(cell.cellId),
        kind: cell.kind,
        rowLabel,
        displayOrder: Number(cell.displayOrder),
        seatId: cell.seatId ? String(cell.seatId) : null,
        seatNumber: cell.seatNumber ? String(cell.seatNumber) : null,
        zone: cell.zone ? String(cell.zone) : null,
        accessibility: cell.accessibility ? String(cell.accessibility) : null,
        price: cell.amount == null ? null : Number(cell.amount),
        status: cell.seatStatus
      };
      rowMap.set(rowLabel, [...(rowMap.get(rowLabel) ?? []), item]);
    }

    return {
      showId: String(show.showId),
      movieId: String(show.movieId),
      movieTitle: String(show.movieTitle),
      moviePosterUrl: show.moviePosterUrl ? String(show.moviePosterUrl) : null,
      movieTrailerUrl: show.movieTrailerUrl ? String(show.movieTrailerUrl) : null,
      language: show.language ? String(show.language) : null,
      durationMinutes: show.durationMinutes == null ? null : Number(show.durationMinutes),
      certificate: show.certificate ? String(show.certificate) : null,
      genres: parseJsonArray(show.genreJson),
      formats: parseJsonArray(show.formatsJson),
      theatreId: String(show.theatreId),
      theatreName: String(show.theatreName),
      screenName: String(show.screenName),
      showTime: new Date(show.showTime).toISOString(),
      authorityMode: String(show.authorityMode),
      status: String(show.status),
      layoutName: String(show.layoutName),
      screenSideLabel: String(show.screenSideLabel),
      zoneRates: prices.map((row) => ({ zone: String(row.zone), amount: Number(row.amount) })),
      rows: Array.from(rowMap, ([rowLabel, rowCells]) => ({ rowLabel, cells: rowCells }))
    };
  });
}

export async function getAdminDashboard(theatreId?: string | null) {
  return safe<AdminDashboardData>({ totalShowsToday: 0, totalBookingsToday: 0, centralBookingsToday: 0, localSyncedBookingsToday: 0, agentBookingsToday: 0, totalCollection: 0, returningToCentralCount: 0, localAuthorityOfflineCount: 0, pendingSyncEvents: 0, failedSyncEvents: 0, latestReceivedLocalSequenceNo: null, latestCentralMirrorSequenceNo: null, activeAgents: 0, authorityByShow: [], theatreHeartbeats: [], theatreHeartbeat: null }, async () => {
    await ensureCentralHeartbeatTables();
    await ensureCentralMirrorEventsTable();
    await ensureCentralSyncInbox();
    const showScope = theatreId ? ' AND theatre_id = ?' : '';
    const bookingScope = theatreId ? ' AND EXISTS (SELECT 1 FROM shows scoped_show WHERE scoped_show.id = cb.show_id AND scoped_show.theatre_id = ?)' : '';
    const heartbeatScope = theatreId ? ' AND theatre_id = ?' : '';
    const inboxScope = theatreId ? ' WHERE theatre_id = ?' : '';
    const mirrorScope = theatreId ? ' WHERE theatre_id = ?' : '';
    const summaryParams = theatreId ? Array(12).fill(theatreId) : [];
    const [[summary]] = await getCentralDbPool().query<RowDataPacket[]>(`
      SELECT
        (SELECT COUNT(*) FROM shows WHERE DATE(show_time) = CURRENT_DATE()${showScope}) AS totalShowsToday,
        (SELECT COUNT(*) FROM central_bookings cb WHERE DATE(cb.created_at) = CURRENT_DATE() AND cb.status = 'CONFIRMED'${bookingScope}) AS totalBookingsToday,
        (SELECT COUNT(*) FROM central_bookings cb WHERE DATE(cb.created_at) = CURRENT_DATE() AND cb.status = 'CONFIRMED' AND cb.channel = 'PUBLIC'${bookingScope}) AS centralBookingsToday,
        (SELECT COUNT(*) FROM central_bookings cb WHERE DATE(cb.created_at) = CURRENT_DATE() AND cb.status = 'CONFIRMED' AND cb.channel = 'COUNTER'${bookingScope}) AS localSyncedBookingsToday,
        (SELECT COUNT(*) FROM central_bookings cb WHERE DATE(cb.created_at) = CURRENT_DATE() AND cb.status = 'CONFIRMED' AND cb.channel = 'AGENT'${bookingScope}) AS agentBookingsToday,
        (SELECT COALESCE(SUM(cb.total_amount), 0) FROM central_bookings cb WHERE DATE(cb.created_at) = CURRENT_DATE() AND cb.status = 'CONFIRMED'${bookingScope}) AS totalCollection,
        (SELECT COUNT(*) FROM shows WHERE DATE(show_time) = CURRENT_DATE() AND authority_mode = 'RETURNING_TO_CENTRAL'${showScope}) AS returningToCentralCount,
        (SELECT COUNT(*) FROM shows WHERE DATE(show_time) = CURRENT_DATE() AND authority_mode = 'LOCAL_AUTHORITY_OFFLINE'${showScope}) AS localAuthorityOfflineCount,
        (SELECT COALESCE(SUM(pending_local_events), 0) FROM theatre_heartbeats WHERE trusted_for_admin_sync = 1${heartbeatScope}) AS pendingSyncEvents,
        (SELECT COALESCE(SUM(failed_local_events), 0) FROM theatre_heartbeats WHERE trusted_for_admin_sync = 1${heartbeatScope}) AS failedSyncEvents,
        (SELECT COUNT(*) FROM agent_clients WHERE status = 'ACTIVE') AS activeAgents,
        (SELECT MAX(source_sequence_no) FROM central_sync_inbox${inboxScope}) AS latestReceivedLocalSequenceNo,
        (SELECT MAX(sequence_no) FROM central_mirror_events${mirrorScope}) AS latestCentralMirrorSequenceNo
    `, summaryParams);
    const authorityParams = theatreId ? [theatreId] : [];
    const [authorityRows] = await getCentralDbPool().query<RowDataPacket[]>(`
      SELECT s.id AS showId, m.title AS movieTitle, COALESCE(st.authority_mode, s.authority_mode) AS authorityMode,
             st.local_heartbeat_at AS localHeartbeatAt, COALESCE(st.pending_sync_events, 0) AS pendingSyncEvents,
             COALESCE(st.failed_sync_events, 0) AS failedSyncEvents
      FROM shows s
      JOIN movies m ON m.id = s.movie_id
      LEFT JOIN show_authority_state st ON st.show_id = s.id
      WHERE DATE(s.show_time) = CURRENT_DATE()${theatreId ? ' AND s.theatre_id = ?' : ''}
      ORDER BY s.show_time
    `, authorityParams);
    const heartbeatParams = theatreId ? [theatreId] : [];
    const [heartbeatRows] = await getCentralDbPool().query<RowDataPacket[]>(`
      SELECT theatre_id AS theatreId, local_app_url AS localAppUrl, authority_mode AS authorityMode,
             last_local_sequence AS lastLocalSequence, last_central_mirror_sequence AS lastCentralMirrorSequence,
             pending_local_events AS pendingLocalEvents, failed_local_events AS failedLocalEvents, status, last_seen_at AS lastSeenAt,
             CASE
               WHEN status = 'OFFLINE' OR last_seen_at < DATE_SUB(NOW(), INTERVAL 60 SECOND) THEN 'OFFLINE'
               WHEN last_seen_at < DATE_SUB(NOW(), INTERVAL 30 SECOND) THEN 'STALE'
               ELSE 'ONLINE'
             END AS localHeartbeatStatus
      FROM theatre_heartbeats
      ${theatreId ? 'WHERE theatre_id = ?' : ''}
      ORDER BY last_seen_at DESC
    `, heartbeatParams);

    return {
      totalShowsToday: Number(summary.totalShowsToday ?? 0),
      totalBookingsToday: Number(summary.totalBookingsToday ?? 0),
      centralBookingsToday: Number(summary.centralBookingsToday ?? 0),
      localSyncedBookingsToday: Number(summary.localSyncedBookingsToday ?? 0),
      agentBookingsToday: Number(summary.agentBookingsToday ?? 0),
      totalCollection: Number(summary.totalCollection ?? 0),
      returningToCentralCount: Number(summary.returningToCentralCount ?? 0),
      localAuthorityOfflineCount: Number(summary.localAuthorityOfflineCount ?? 0),
      pendingSyncEvents: Number(summary.pendingSyncEvents ?? 0),
      failedSyncEvents: Number(summary.failedSyncEvents ?? 0),
      latestReceivedLocalSequenceNo: summary.latestReceivedLocalSequenceNo == null ? null : Number(summary.latestReceivedLocalSequenceNo),
      latestCentralMirrorSequenceNo: summary.latestCentralMirrorSequenceNo == null ? null : Number(summary.latestCentralMirrorSequenceNo),
      activeAgents: Number(summary.activeAgents ?? 0),
      authorityByShow: authorityRows.map((row) => ({
        showId: String(row.showId),
        movieTitle: String(row.movieTitle),
        authorityMode: String(row.authorityMode),
        localHeartbeatAt: row.localHeartbeatAt ? new Date(row.localHeartbeatAt).toISOString() : null,
        pendingSyncEvents: Number(row.pendingSyncEvents ?? 0),
        failedSyncEvents: Number(row.failedSyncEvents ?? 0)
      })),
      theatreHeartbeats: heartbeatRows.map((heartbeatRow) => ({
        theatreId: String(heartbeatRow.theatreId),
        localAppUrl: heartbeatRow.localAppUrl ? String(heartbeatRow.localAppUrl) : null,
        authorityMode: String(heartbeatRow.authorityMode),
        lastLocalSequence: Number(heartbeatRow.lastLocalSequence ?? 0),
        lastCentralMirrorSequence: Number(heartbeatRow.lastCentralMirrorSequence ?? 0),
        pendingLocalEvents: Number(heartbeatRow.pendingLocalEvents ?? 0),
        failedLocalEvents: Number(heartbeatRow.failedLocalEvents ?? 0),
        status: String(heartbeatRow.status),
        localHeartbeatStatus: String(heartbeatRow.localHeartbeatStatus),
        lastSeenAt: new Date(heartbeatRow.lastSeenAt).toISOString()
      })),
      theatreHeartbeat: heartbeatRows[0] ? {
        theatreId: String(heartbeatRows[0].theatreId),
        localAppUrl: heartbeatRows[0].localAppUrl ? String(heartbeatRows[0].localAppUrl) : null,
        authorityMode: String(heartbeatRows[0].authorityMode),
        lastLocalSequence: Number(heartbeatRows[0].lastLocalSequence ?? 0),
        lastCentralMirrorSequence: Number(heartbeatRows[0].lastCentralMirrorSequence ?? 0),
        pendingLocalEvents: Number(heartbeatRows[0].pendingLocalEvents ?? 0),
        failedLocalEvents: Number(heartbeatRows[0].failedLocalEvents ?? 0),
        status: String(heartbeatRows[0].status),
        localHeartbeatStatus: String(heartbeatRows[0].localHeartbeatStatus),
        lastSeenAt: new Date(heartbeatRows[0].lastSeenAt).toISOString()
      } : null
    };
  });
}

export async function getSeatLayouts() {
  return safe<SeatLayoutSummary[]>([], async () => {
    const [layouts] = await getCentralDbPool().query<RowDataPacket[]>(`
      SELECT l.id, l.name, t.name AS theatreName, sc.name AS screenName
      FROM seat_layouts l
      JOIN screens sc ON sc.id = l.screen_id
      JOIN theatres t ON t.id = sc.theatre_id
      ORDER BY t.name, sc.name, l.name
    `);
    const output: SeatLayoutSummary[] = [];
    for (const layout of layouts) {
      const [zoneRows] = await getCentralDbPool().query<RowDataPacket[]>(`
        SELECT zone_code AS zone, MAX(amount) AS amount FROM show_pricing sp
        JOIN shows s ON s.id = sp.show_id
        WHERE s.layout_id = ?
        GROUP BY zone_code
        ORDER BY amount DESC
      `, [layout.id]);
      const [cellRows] = await getCentralDbPool().query<RowDataPacket[]>(`
        SELECT seat_id AS cellId, CASE WHEN item_type = 'BLOCKED' THEN 'SEAT' ELSE item_type END AS kind, row_label AS rowLabel, display_order AS displayOrder,
               seat_id AS seatId, seat_number AS seatNumber, zone_code AS zone, accessibility, NULL AS amount,
               CASE WHEN is_blocked = TRUE OR item_type = 'BLOCKED' THEN 'BLOCKED' ELSE 'AVAILABLE' END AS seatStatus
        FROM seat_layout_seats
        WHERE layout_id = ?
        ORDER BY row_sort, row_label, display_order
      `, [layout.id]);
      const rowMap = new Map<string, SeatCell[]>();
      let totalSeats = 0;
      let gapCount = 0;
      for (const cell of cellRows) {
        if (cell.kind === 'SEAT' || cell.kind === 'BLOCKED') totalSeats += 1;
        else gapCount += 1;
        const rowLabel = String(cell.rowLabel);
        const item: SeatCell = {
          cellId: String(cell.cellId),
          kind: cell.kind,
          rowLabel,
          displayOrder: Number(cell.displayOrder),
          seatId: cell.seatId ? String(cell.seatId) : null,
          seatNumber: cell.seatNumber ? String(cell.seatNumber) : null,
          zone: cell.zone ? String(cell.zone) : null,
          accessibility: cell.accessibility ? String(cell.accessibility) : null,
          price: null,
          status: cell.seatStatus
        };
        rowMap.set(rowLabel, [...(rowMap.get(rowLabel) ?? []), item]);
      }
      output.push({
        id: String(layout.id),
        name: String(layout.name),
        theatreName: String(layout.theatreName),
        screenName: String(layout.screenName),
        zones: zoneRows.map((row) => ({ zone: String(row.zone), amount: Number(row.amount) })),
        rows: Array.from(rowMap, ([rowLabel, cells]) => ({ rowLabel, cells })),
        totalSeats,
        gapCount
      });
    }
    return output;
  });
}

function withBookingState(show: BookingShowDetail, bookingEnabled: boolean, reason?: OnlineBookingUnavailableReason): BookingShowDetail {
  return { ...show, authorityMode: normalizeCentralAuthorityMode(show.authorityMode), bookingEnabled, reason };
}

function localCellToCentralCell(cell: {
  kind: string;
  cellId: string;
  seatId?: string;
  rowLabel?: string;
  seatNumber?: number | string;
  zone?: string;
  rate?: number;
  status?: SeatCell['status'];
  accessibility?: string | null;
}, rowLabel: string, index: number): SeatCell {
  if (cell.kind !== 'SEAT') {
    return {
      cellId: cell.cellId,
      kind: 'AISLE',
      rowLabel,
      displayOrder: index + 1,
      seatId: null,
      seatNumber: null,
      zone: null,
    price: null,
    accessibility: null,
    status: 'AVAILABLE'
    };
  }

  return {
    cellId: cell.cellId,
    kind: 'SEAT',
    rowLabel: cell.rowLabel ?? rowLabel,
    displayOrder: index + 1,
    seatId: cell.seatId ?? null,
    seatNumber: cell.seatNumber == null ? null : String(cell.seatNumber),
    zone: cell.zone ?? null,
    accessibility: cell.accessibility ?? null,
    price: cell.rate == null ? null : Number(cell.rate),
    status: cell.status ?? 'AVAILABLE'
  };
}

async function fetchLiveLocalSeatStatus(showId: string): Promise<BookingShowDetail | null> {
  const controller = new AbortController();
  const configuredTimeout = Number(
    process.env.LOCAL_SEAT_STATUS_TIMEOUT_MS
      ?? process.env.LOCAL_HEALTH_CHECK_TIMEOUT_MS
      ?? process.env.LOCAL_TUNNEL_TIMEOUT_MS
      ?? 7000
  );
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.max(1500, Math.floor(configuredTimeout))
    : 7000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload = await getLocalShowSeats(showId, controller.signal);

    return {
      showId: payload.show.showId,
      movieId: payload.show.showId,
      movieTitle: payload.show.movieTitle,
      moviePosterUrl: null,
      movieTrailerUrl: null,
      language: null,
      durationMinutes: null,
      certificate: null,
      genres: [],
      formats: [],
      theatreId: payload.show.theatreId,
      theatreName: payload.show.theatreId,
      screenName: payload.show.screenName,
      showTime: payload.show.showTime,
      authorityMode: payload.show.authorityMode,
      status: payload.show.status,
      bookingEnabled: Boolean(payload.bookingEnabled),
      reason: undefined,
      layoutName: payload.screenSideLabel ?? 'Local theatre layout',
      screenSideLabel: payload.screenSideLabel ?? 'SCREEN THIS SIDE',
      zoneRates: payload.zoneRates.map((rate) => ({ zone: String(rate.zone), amount: Number(rate.amount) })),
      rows: payload.rows.map((row) => ({
        rowLabel: row.rowLabel,
        cells: row.cells.map((cell, index) => localCellToCentralCell(cell, row.rowLabel, index))
      }))
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAuthorityAwareBookingShow(showId: string) {
  return safe<BookingShowDetail | null>(null, async () => {
    const centralShow = await getBookingShow(showId);
    const show = centralShow.data;
    if (!show) return null;

    const decision = await getBookingAuthorityDecision({
      showId,
      theatreId: show.theatreId,
      authorityMode: show.authorityMode,
      status: show.status
    });
    const authorityMode = normalizeCentralAuthorityMode(decision?.authorityMode ?? show.authorityMode);
    const status = String(show.status);

    if (authorityMode === 'LOCAL_AUTHORITY_ONLINE') {
      if (!decision?.publicBookingAllowed) {
        return withBookingState(show, false, 'LOCAL_AUTHORITY_UNREACHABLE');
      }

      const localShow = await fetchLiveLocalSeatStatus(showId);
      if (localShow) {
        const publicLocalShow: BookingShowDetail = {
          ...localShow,
          showId: show.showId,
          movieId: show.movieId,
          movieTitle: show.movieTitle,
          moviePosterUrl: show.moviePosterUrl,
          movieTrailerUrl: show.movieTrailerUrl,
          language: show.language,
          durationMinutes: show.durationMinutes,
          certificate: show.certificate,
          genres: show.genres,
          formats: show.formats,
          theatreId: show.theatreId,
          theatreName: show.theatreName,
          screenName: show.screenName,
          showTime: show.showTime
        };
        const reason = canShowBeBookedOnline({
          authorityMode: publicLocalShow.authorityMode,
          status: publicLocalShow.status,
          localReachable: true
        }) ? undefined : getOnlineBookingUnavailableReason({
          authorityMode: publicLocalShow.authorityMode,
          status: publicLocalShow.status,
          localReachable: true
        });
        return withBookingState(publicLocalShow, reason === undefined, reason);
      }

      // Authority and heartbeat already proved local online booking is available.
      // If the live local seat-layout fetch is slow through the tunnel, keep the
      // public flow open with the central mirror; hold/confirm still forward to
      // local and enforce the final seat conflict checks there.
      return withBookingState(show, true);
    }

    const reason = getOnlineBookingUnavailableReason({ authorityMode, status });

    return withBookingState(show, reason === undefined, reason);
  });
}

export function getCentralBookingUnavailableMessage(reason?: OnlineBookingUnavailableReason) {
  return getOnlineBookingUnavailableMessage(reason);
}
