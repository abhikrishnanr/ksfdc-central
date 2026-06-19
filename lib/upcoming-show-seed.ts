import { RowDataPacket } from 'mysql2';
import { getCentralDbPool } from './db';

export async function seedUpcomingPublicShows() {
  const connection = await getCentralDbPool().getConnection();
  try {
    await connection.beginTransaction();
    const [[requirements]] = await connection.query<RowDataPacket[]>(`
      SELECT
        (SELECT COUNT(*) FROM theatres WHERE id = 'THEATRE_LULU_TVM') AS theatreCount,
        (SELECT COUNT(*) FROM movies WHERE id IN ('drishyam_3_2026', 'varavu_2026')) AS movieCount,
        (SELECT COUNT(*) FROM seat_layouts WHERE id = 'LAYOUT_LULU_IMAX1_JSON') AS layoutCount,
        (SELECT COUNT(*) FROM seat_layout_seats WHERE layout_id = 'LAYOUT_LULU_IMAX1_JSON') AS seatCount
    `);
    if (Number(requirements.theatreCount) !== 1 || Number(requirements.movieCount) !== 2
      || Number(requirements.layoutCount) !== 1 || Number(requirements.seatCount) === 0) {
      throw new Error('Required Lulu theatre, movies, or source seat layout are missing.');
    }

    await connection.query("UPDATE movies SET poster_url = '/posters/varavu-2026.webp' WHERE id = 'varavu_2026'");
    await connection.query(`
      INSERT INTO screens (id, theatre_id, code, name)
      VALUES ('SCREEN_LULU_2', 'THEATRE_LULU_TVM', 'SCREEN2', 'Screen 2 - Late Shows')
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `);
    await connection.query(`
      INSERT INTO seat_layouts (id, theatre_id, screen_id, name, screen_side_label, is_active)
      SELECT 'LAYOUT_LULU_SCREEN2_JSON', theatre_id, 'SCREEN_LULU_2',
             'Lulu Screen 2 Layout', screen_side_label, 1
      FROM seat_layouts WHERE id = 'LAYOUT_LULU_IMAX1_JSON'
      ON DUPLICATE KEY UPDATE name = VALUES(name), screen_side_label = VALUES(screen_side_label), is_active = VALUES(is_active)
    `);
    await connection.query(`
      INSERT INTO seat_layout_seats (
        layout_id, seat_id, row_label, row_sort, seat_number, zone_code,
        item_type, display_order, gap_width, is_blocked, accessibility
      )
      SELECT 'LAYOUT_LULU_SCREEN2_JSON', seat_id, row_label, row_sort, seat_number, zone_code,
             item_type, display_order, gap_width, is_blocked, accessibility
      FROM seat_layout_seats WHERE layout_id = 'LAYOUT_LULU_IMAX1_JSON'
      ON DUPLICATE KEY UPDATE
        row_label = VALUES(row_label), row_sort = VALUES(row_sort), seat_number = VALUES(seat_number),
        zone_code = VALUES(zone_code), item_type = VALUES(item_type), display_order = VALUES(display_order),
        gap_width = VALUES(gap_width), is_blocked = VALUES(is_blocked), accessibility = VALUES(accessibility)
    `);
    await connection.query(`
      INSERT INTO shows (id, movie_id, theatre_id, screen_id, layout_id, show_time, authority_mode, status)
      SELECT CONCAT('SHOW_LULU_EXTRA_', DATE_FORMAT(show_date, '%Y%m%d'), '_1500'),
             'drishyam_3_2026', 'THEATRE_LULU_TVM', 'SCREEN_LULU_2', 'LAYOUT_LULU_SCREEN2_JSON',
             TIMESTAMP(show_date, '15:00:00'), 'CENTRAL_AUTHORITY', 'OPEN'
      FROM (
        SELECT CURRENT_DATE AS show_date
        UNION ALL SELECT DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)
        UNION ALL SELECT DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY)
      ) dates
      UNION ALL
      SELECT CONCAT('SHOW_LULU_MIDNIGHT_', DATE_FORMAT(show_date, '%Y%m%d')),
             'varavu_2026', 'THEATRE_LULU_TVM', 'SCREEN_LULU_2', 'LAYOUT_LULU_SCREEN2_JSON',
             TIMESTAMP(show_date, '23:59:00'), 'CENTRAL_AUTHORITY', 'OPEN'
      FROM (
        SELECT CURRENT_DATE AS show_date
        UNION ALL SELECT DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)
        UNION ALL SELECT DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY)
      ) dates
      ON DUPLICATE KEY UPDATE
        movie_id = VALUES(movie_id), theatre_id = VALUES(theatre_id), screen_id = VALUES(screen_id),
        layout_id = VALUES(layout_id), show_time = VALUES(show_time),
        authority_mode = VALUES(authority_mode), status = VALUES(status)
    `);
    await connection.query(`
      INSERT INTO show_pricing (show_id, zone_code, amount)
      SELECT s.id, prices.zone_code, prices.amount
      FROM shows s
      JOIN (
        SELECT 'CLASSIC' AS zone_code, 450.00 AS amount
        UNION ALL SELECT 'EXTRA LEGROOM', 500.00
        UNION ALL SELECT 'PICTURE PERFECT', 520.00
        UNION ALL SELECT 'PRIME', 470.00
        UNION ALL SELECT 'RECLINER', 650.00
      ) prices
      WHERE s.screen_id = 'SCREEN_LULU_2'
        AND DATE(s.show_time) BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY)
      ON DUPLICATE KEY UPDATE amount = VALUES(amount)
    `);

    const [shows] = await connection.query<RowDataPacket[]>(`
      SELECT id, movie_id AS movieId, show_time AS showTime
      FROM shows
      WHERE screen_id = 'SCREEN_LULU_2'
        AND DATE(show_time) BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY)
      ORDER BY show_time
    `);
    await connection.commit();
    return {
      shows: shows.map((show) => ({
        id: String(show.id),
        movieId: String(show.movieId),
        showTime: new Date(show.showTime).toISOString()
      })),
      copiedSeats: Number(requirements.seatCount)
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
