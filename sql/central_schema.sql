CREATE TABLE IF NOT EXISTS central_users (
  id VARCHAR(50) PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('SUPER_ADMIN','THEATRE_ADMIN','FINANCE_VIEWER','AGENT_CLIENT') NOT NULL,
  theatre_id VARCHAR(80) NULL,
  force_password_change BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS central_sessions (
  id VARCHAR(80) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL,
  CONSTRAINT fk_central_sessions_user FOREIGN KEY (user_id) REFERENCES central_users(id)
);

CREATE TABLE IF NOT EXISTS public_users (
  id VARCHAR(80) PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  display_name VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public_sessions (
  id VARCHAR(100) PRIMARY KEY,
  public_user_id VARCHAR(80) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL,
  INDEX idx_public_sessions_user (public_user_id, expires_at),
  CONSTRAINT fk_public_sessions_user FOREIGN KEY (public_user_id) REFERENCES public_users(id)
);

CREATE TABLE IF NOT EXISTS public_email_otps (
  id VARCHAR(100) PRIMARY KEY,
  email VARCHAR(190) NOT NULL,
  purpose VARCHAR(40) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  expires_at TIMESTAMP NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP NULL,
  request_ip VARCHAR(80) NULL,
  INDEX idx_public_email_otps_email_purpose (email, purpose, expires_at),
  INDEX idx_public_email_otps_sent (sent_at)
);

CREATE TABLE IF NOT EXISTS theatres (
  id VARCHAR(50) PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  city VARCHAR(100) NOT NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS screens (
  id VARCHAR(50) PRIMARY KEY,
  theatre_id VARCHAR(50) NOT NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_screens_theatre_code (theatre_id, code),
  CONSTRAINT fk_screens_theatre FOREIGN KEY (theatre_id) REFERENCES theatres(id)
);

CREATE TABLE IF NOT EXISTS movies (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  language VARCHAR(50) NULL,
  duration_minutes INT NULL,
  certificate VARCHAR(20) NULL,
  release_date DATE NULL,
  poster_url TEXT NULL,
  youtube_trailer_url TEXT NULL,
  synopsis TEXT NULL,
  genre_json JSON NULL,
  cast_json JSON NULL,
  crew_json JSON NULL,
  formats_json JSON NULL,
  languages_json JSON NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seat_layouts (
  id VARCHAR(100) PRIMARY KEY,
  theatre_id VARCHAR(50) NOT NULL,
  screen_id VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  screen_side_label VARCHAR(80) NOT NULL DEFAULT 'SCREEN THIS SIDE',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_seat_layouts_screen (screen_id, is_active),
  CONSTRAINT fk_seat_layouts_screen FOREIGN KEY (screen_id) REFERENCES screens(id)
);

CREATE TABLE IF NOT EXISTS seat_layout_seats (
  layout_id VARCHAR(100) NOT NULL,
  seat_id VARCHAR(30) NOT NULL,
  row_label VARCHAR(10) NOT NULL,
  row_sort INT NOT NULL DEFAULT 0,
  seat_number VARCHAR(10) NULL,
  zone_code VARCHAR(80) NULL,
  item_type ENUM('SEAT','GAP','AISLE','BLOCKED') NOT NULL DEFAULT 'SEAT',
  display_order INT NOT NULL,
  gap_width INT NULL,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  accessibility VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (layout_id, seat_id),
  UNIQUE KEY uq_layout_position (layout_id, row_label, display_order),
  INDEX idx_layout_row (layout_id, row_sort, row_label, display_order),
  INDEX idx_layout_zone (layout_id, zone_code),
  CONSTRAINT fk_seat_layout_seats_layout FOREIGN KEY (layout_id) REFERENCES seat_layouts(id)
);

CREATE TABLE IF NOT EXISTS shows (
  id VARCHAR(50) PRIMARY KEY,
  movie_id VARCHAR(50) NOT NULL,
  theatre_id VARCHAR(50) NOT NULL,
  screen_id VARCHAR(50) NOT NULL,
  layout_id VARCHAR(100) NOT NULL,
  show_time DATETIME NOT NULL,
  authority_mode ENUM('CENTRAL_AUTHORITY','LOCAL_AUTHORITY_ONLINE','LOCAL_AUTHORITY_OFFLINE','LOCAL_AUTHORITY_COUNTER_ONLY','LOCAL_SYNCING','RETURNING_TO_CENTRAL','SALES_CLOSED') NOT NULL DEFAULT 'CENTRAL_AUTHORITY',
  status ENUM('SCHEDULED','OPEN','CLOSED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_shows_time (show_time),
  CONSTRAINT fk_shows_movie FOREIGN KEY (movie_id) REFERENCES movies(id),
  CONSTRAINT fk_shows_theatre FOREIGN KEY (theatre_id) REFERENCES theatres(id),
  CONSTRAINT fk_shows_screen FOREIGN KEY (screen_id) REFERENCES screens(id),
  CONSTRAINT fk_shows_layout FOREIGN KEY (layout_id) REFERENCES seat_layouts(id)
);

CREATE TABLE IF NOT EXISTS show_pricing (
  show_id VARCHAR(50) NOT NULL,
  zone_code VARCHAR(80) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (show_id, zone_code),
  CONSTRAINT fk_show_pricing_show FOREIGN KEY (show_id) REFERENCES shows(id)
);

CREATE TABLE IF NOT EXISTS booking_authority_policy (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  show_id VARCHAR(50) NOT NULL,
  channel ENUM('PUBLIC','COUNTER','AGENT') NOT NULL,
  authority_mode ENUM('CENTRAL_AUTHORITY','LOCAL_AUTHORITY_ONLINE','LOCAL_AUTHORITY_OFFLINE','LOCAL_AUTHORITY_COUNTER_ONLY','LOCAL_SYNCING','RETURNING_TO_CENTRAL','SALES_CLOSED') NOT NULL DEFAULT 'CENTRAL_AUTHORITY',
  is_booking_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_authority_policy (show_id, channel),
  CONSTRAINT fk_authority_policy_show FOREIGN KEY (show_id) REFERENCES shows(id)
);

CREATE TABLE IF NOT EXISTS show_authority_state (
  show_id VARCHAR(50) PRIMARY KEY,
  authority_mode ENUM('CENTRAL_AUTHORITY','LOCAL_AUTHORITY_ONLINE','LOCAL_AUTHORITY_OFFLINE','LOCAL_AUTHORITY_COUNTER_ONLY','LOCAL_SYNCING','RETURNING_TO_CENTRAL','SALES_CLOSED') NOT NULL DEFAULT 'CENTRAL_AUTHORITY',
  local_heartbeat_at TIMESTAMP NULL,
  pending_sync_events INT NOT NULL DEFAULT 0,
  failed_sync_events INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_authority_state_show FOREIGN KEY (show_id) REFERENCES shows(id)
);

CREATE TABLE IF NOT EXISTS central_seat_holds (
  id VARCHAR(80) PRIMARY KEY,
  show_id VARCHAR(50) NOT NULL,
  idempotency_key VARCHAR(120) NOT NULL,
  customer_name VARCHAR(120) NULL,
  status ENUM('ACTIVE','CONFIRMED','EXPIRED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hold_idempotency (show_id, idempotency_key),
  INDEX idx_holds_show_status (show_id, status, expires_at),
  CONSTRAINT fk_holds_show FOREIGN KEY (show_id) REFERENCES shows(id)
);

CREATE TABLE IF NOT EXISTS central_seat_hold_items (
  hold_id VARCHAR(80) NOT NULL,
  show_id VARCHAR(50) NOT NULL,
  seat_id VARCHAR(30) NOT NULL,
  zone VARCHAR(30) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (hold_id, seat_id),
  INDEX idx_hold_items_show_seat (show_id, seat_id),
  CONSTRAINT fk_hold_items_hold FOREIGN KEY (hold_id) REFERENCES central_seat_holds(id),
  CONSTRAINT fk_hold_items_show FOREIGN KEY (show_id) REFERENCES shows(id)
);

CREATE TABLE IF NOT EXISTS central_bookings (
  id VARCHAR(80) PRIMARY KEY,
  show_id VARCHAR(50) NOT NULL,
  hold_id VARCHAR(80) NULL,
  idempotency_key VARCHAR(120) NOT NULL,
  customer_name VARCHAR(120) NULL,
  customer_email VARCHAR(190) NULL,
  public_user_id VARCHAR(80) NULL,
  channel ENUM('PUBLIC','COUNTER','AGENT') NOT NULL DEFAULT 'PUBLIC',
  status ENUM('CONFIRMED','CANCELLED','REFUNDED') NOT NULL DEFAULT 'CONFIRMED',
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_booking_idempotency (show_id, idempotency_key),
  INDEX idx_bookings_show (show_id),
  INDEX idx_bookings_public_user (public_user_id, created_at),
  INDEX idx_bookings_customer_email (customer_email, created_at),
  CONSTRAINT fk_bookings_show FOREIGN KEY (show_id) REFERENCES shows(id),
  CONSTRAINT fk_bookings_hold FOREIGN KEY (hold_id) REFERENCES central_seat_holds(id),
  CONSTRAINT fk_bookings_public_user FOREIGN KEY (public_user_id) REFERENCES public_users(id)
);

CREATE TABLE IF NOT EXISTS central_booking_items (
  booking_id VARCHAR(80) NOT NULL,
  show_id VARCHAR(50) NOT NULL,
  seat_id VARCHAR(30) NOT NULL,
  zone VARCHAR(30) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (booking_id, seat_id),
  INDEX idx_booking_items_show_seat (show_id, seat_id),
  CONSTRAINT fk_booking_items_booking FOREIGN KEY (booking_id) REFERENCES central_bookings(id),
  CONSTRAINT fk_booking_items_show FOREIGN KEY (show_id) REFERENCES shows(id)
);

CREATE TABLE IF NOT EXISTS central_confirmed_seats (
  show_id VARCHAR(50) NOT NULL,
  seat_id VARCHAR(30) NOT NULL,
  booking_id VARCHAR(80) NOT NULL,
  channel ENUM('PUBLIC','COUNTER','AGENT') NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (show_id, seat_id),
  CONSTRAINT fk_confirmed_seats_show FOREIGN KEY (show_id) REFERENCES shows(id),
  CONSTRAINT fk_confirmed_seats_booking FOREIGN KEY (booking_id) REFERENCES central_bookings(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(80) PRIMARY KEY,
  booking_id VARCHAR(80) NULL,
  hold_id VARCHAR(100) NULL,
  show_id VARCHAR(100) NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'SIMULATED',
  payment_mode VARCHAR(40) NOT NULL DEFAULT 'RAZORPAY',
  provider_reference VARCHAR(160) NULL,
  provider_order_id VARCHAR(160) NULL,
  provider_payment_id VARCHAR(160) NULL,
  provider_signature VARCHAR(255) NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status ENUM('CREATED','PENDING','CAPTURED','COLLECTED','SUCCESS','FAILED','CANCELLED','REFUND_REQUIRED','NEEDS_MANUAL_REVIEW','REFUNDED') NOT NULL DEFAULT 'CREATED',
  authority_mode_at_order VARCHAR(50) NULL,
  channel VARCHAR(30) NOT NULL DEFAULT 'PUBLIC',
  collected_by_user_id VARCHAR(80) NULL,
  counter_code VARCHAR(30) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_payments_hold (hold_id),
  INDEX idx_payments_provider_order (provider_order_id),
  INDEX idx_payments_status_created (status, created_at),
  CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES central_bookings(id)
);

CREATE TABLE IF NOT EXISTS central_payment_audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  payment_id VARCHAR(80) NULL,
  hold_id VARCHAR(100) NULL,
  show_id VARCHAR(100) NULL,
  action VARCHAR(80) NOT NULL,
  provider VARCHAR(50) NULL,
  provider_order_id VARCHAR(160) NULL,
  provider_payment_id VARCHAR(160) NULL,
  status VARCHAR(50) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_central_payment_audit_payment (payment_id, created_at),
  INDEX idx_central_payment_audit_show (show_id, created_at)
);




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
);

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
);

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
);

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
);

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
);

CREATE TABLE IF NOT EXISTS central_sync_api_request_log (
  request_id VARCHAR(100) PRIMARY KEY,
  client_id VARCHAR(100) NOT NULL,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_central_sync_api_request_log_created (created_at),
  INDEX idx_central_sync_api_request_log_client (client_id, created_at)
);

CREATE OR REPLACE VIEW central_received_local_events AS
SELECT
  event_id,
  theatre_id,
  JSON_UNQUOTE(JSON_EXTRACT(payload, '$.showId')) AS show_id,
  source_sequence_no AS sequence_no,
  event_type,
  payload,
  received_at
FROM central_sync_inbox;

CREATE TABLE IF NOT EXISTS agent_clients (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  api_key_hash VARCHAR(255) NOT NULL,
  status ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  last_seen_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NULL,
  role VARCHAR(40) NULL,
  ip VARCHAR(80) NULL,
  user_agent VARCHAR(255) NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NULL,
  entity_id VARCHAR(80) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
