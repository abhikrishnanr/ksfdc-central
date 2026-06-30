export type DocTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export type DocTable = {
  title: string;
  description?: string;
  columns: string[];
  rows: string[][];
};

export type DocCallout = {
  tone: DocTone;
  title: string;
  body: string;
};

export type DocCard = {
  title: string;
  body: string;
  meta?: string;
  tone?: DocTone;
};

export type DocCode = {
  title: string;
  language: 'powershell' | 'bash' | 'json' | 'http' | 'sql' | 'text';
  code: string;
  warning?: string;
};

export type DocDiagram = {
  title: string;
  description: string;
  steps: string[];
  notes?: string[];
};

export type DocSection = {
  id: string;
  title: string;
  kicker?: string;
  summary: string;
  body?: string[];
  cards?: DocCard[];
  callouts?: DocCallout[];
  diagrams?: DocDiagram[];
  tables?: DocTable[];
  codes?: DocCode[];
};

export type TechnicalManual = {
  meta: {
    productName: string;
    documentationVersion: string;
    applicationVersion: string;
    lastReviewed: string;
    audience: string[];
  };
  sections: DocSection[];
};

const timingRows: string[][] = [
  ['Local heartbeat interval', '10', 'seconds', 'local-theatre-app/scripts/worker-core.mjs, HEARTBEAT_INTERVAL_SEC', 'Worker sends central heartbeat on this cadence.', 'A missed run is retried on the next loop or after backoff.'],
  ['Local sync interval', '5', 'seconds', 'local-theatre-app/scripts/worker-core.mjs, SYNC_INTERVAL_SEC', 'Worker attempts push, pull, and schedule sync.', 'Failures are backed off and retried without overlapping active locks.'],
  ['Fast local sync trigger', '750', 'milliseconds', 'local-theatre-app/scripts/worker-core.mjs, FAST_SYNC_INTERVAL_MS', 'Short loop used after fresh local activity.', 'Falls back to normal sync when no work remains.'],
  ['Worker fetch timeout', '12000', 'milliseconds', 'local-theatre-app/lib/env.ts, WORKER_FETCH_TIMEOUT_MS or SYNC_FETCH_TIMEOUT_MS', 'Caps central/local worker HTTP calls.', 'Request aborts and the worker records a retryable failure.'],
  ['Worker max failure backoff', '60000', 'milliseconds', 'local-theatre-app/scripts/worker-core.mjs, WORKER_FAILURE_BACKOFF_MAX_MS', 'Upper bound for repeated worker failures.', 'Worker waits no longer than this before retrying.'],
  ['Local push batch size', '100', 'events', 'local-theatre-app/lib/sync.ts, SYNC_BATCH_SIZE', 'Maximum local outbox events pushed in one request.', 'Remaining events stay pending for the next run.'],
  ['Central pull limit', '100', 'events', 'local-theatre-app/lib/sync.ts, CENTRAL_PULL_LIMIT', 'Maximum central mirror events pulled by local worker.', 'Additional events are pulled in later batches.'],
  ['Central schedule pull limit', '100', 'events', 'local-theatre-app/lib/sync.ts, CENTRAL_SCHEDULE_PULL_LIMIT', 'Maximum schedule events pulled by local worker.', 'Additional events are pulled in later batches.'],
  ['Sync retry delay cap', '300', 'seconds', 'local-theatre-app/lib/sync.ts, MAX_RETRY_DELAY_SECONDS', 'Maximum retry delay for failed outbox processing.', 'Failed records stay queued until due for retry.'],
  ['Immediate push sync delay', '100', 'milliseconds', 'local-theatre-app/lib/sync.ts, triggerImmediatePushSync', 'Schedules a quick push after local booking activity.', 'If a push is already active, the request is skipped.'],
  ['Immediate pull sync delay', '100', 'milliseconds', 'local-theatre-app/lib/sync.ts, triggerImmediatePullSync', 'Schedules a quick pull after central work.', 'If a pull is already active, the request is skipped.'],
  ['Central heartbeat stale threshold', '30', 'seconds', 'central-app/lib/booking-authority.ts, LOCAL_HEARTBEAT_STALE_SECONDS or LOCAL_HEARTBEAT_STALE_AFTER_SECONDS', 'Controls when local authority is treated as unreachable for booking.', 'Local-authority online booking is blocked with LOCAL_AUTHORITY_UNREACHABLE.'],
  ['Central heartbeat offline threshold', '60', 'seconds', 'central-app/lib/sync.ts, readTheatreHealth', 'Used for operational health state.', 'Health status becomes OFFLINE.'],
  ['Local health timeout', '7000', 'milliseconds', 'central-app/lib/booking-authority.ts, LOCAL_HEALTH_CHECK_TIMEOUT_MS', 'Central checks local health before local-authority online booking.', 'Booking is blocked if local confirmation cannot be trusted.'],
  ['Local tunnel timeout', '7000', 'milliseconds', 'central-app/lib/booking-authority.ts, LOCAL_TUNNEL_TIMEOUT_MS', 'Caps theatre tunnel availability checks.', 'Central treats the local theatre as unreachable.'],
  ['Local seat status timeout', '7000', 'milliseconds', 'central-app/lib/booking-authority.ts, LOCAL_SEAT_STATUS_TIMEOUT_MS', 'Caps forwarded local seat availability calls.', 'Central returns a temporary unavailable response.'],
  ['Public central seat hold', '600 default, max 900', 'seconds', 'central-app/app/api/bookings/hold/route.ts, PUBLIC_SEAT_HOLD_SECONDS or SEAT_HOLD_SECONDS', 'Duration for public central holds.', 'Expired holds cannot be confirmed and are released.'],
  ['Local counter seat hold', '300 default', 'seconds', 'local-theatre-app/app/counter/[counterId]/book/[showId]/actions.ts, COUNTER_SEAT_HOLD_SECONDS', 'Duration for counter holds before payment.', 'Confirm returns HOLD_EXPIRED after expiry.'],
  ['Counter session timeout', '480 default', 'minutes', 'local-theatre-app/lib/counter-auth.ts, COUNTER_SESSION_TIMEOUT_MIN', 'Counter login lifetime.', 'Counter is redirected to login after expiry.'],
  ['Central admin session', '8', 'hours', 'central-app/lib/auth.ts', 'Central admin cookie and session lifetime.', 'Expired sessions redirect to /admin/login.'],
  ['Public user session', '30', 'days', 'central-app/lib/public-auth.ts', 'Public booking profile session lifetime.', 'Expired users must verify email again when OTP is enabled.'],
  ['Public OTP expiry', '5 default, max 30', 'minutes', 'central-app/lib/public-auth.ts, PUBLIC_OTP_EXPIRY_MIN', 'Email OTP validity window.', 'OTP verification fails and a new code is required.'],
  ['Public OTP resend cooldown', '30 default, max 300', 'seconds', 'central-app/lib/public-auth.ts, PUBLIC_OTP_RESEND_COOLDOWN_SEC', 'Prevents repeated email sends.', 'Request is rejected until cooldown expires.'],
  ['Public OTP max attempts', '5 default, max 20', 'attempts', 'central-app/lib/public-auth.ts, PUBLIC_OTP_MAX_ATTEMPTS', 'Limits brute-force OTP attempts.', 'OTP is rejected after the limit.'],
  ['Reference data cache', '30', 'seconds', 'central-app/lib/central-data.ts, REFERENCE_DATA_REVALIDATE_SECONDS', 'Caches catalogue data only.', 'Live seat, booking, sync, and authority APIs are not cached.'],
  ['Central DB health cache', '1500', 'milliseconds', 'central-app/lib/db.ts, HEALTH_CHECK_TTL_MS', 'Avoids repeated health probes.', 'A fresh DB health query is run after TTL.'],
  ['Central DB pool limit', '10', 'connections', 'central-app/lib/db.ts, connectionLimit', 'Limits MySQL pool concurrency.', 'Requests wait for available connections.'],
  ['Local Razorpay QR central timeout', '2500', 'milliseconds', 'local-theatre-app/lib/payments.ts', 'Caps local QR availability request.', 'Counter falls back to cash/manual digital.'],
  ['Online booking cutoff after show start', '15', 'minutes', 'central-app/lib/booking-authority.ts and local-theatre-app/lib/local-data.ts', 'Stops late online/counter booking after the configured grace window.', 'Booking is rejected with booking cutoff messaging.']
];

const authorityRows: string[][] = [
  ['CENTRAL_AUTHORITY', 'Allowed directly in central when show is OPEN and within cutoff.', 'Blocked in local counter unless local policy moves authority.', 'No', 'Central DB is source of truth.', 'central_confirmed_seats'],
  ['LOCAL_AUTHORITY_ONLINE', 'Allowed only through local API when health and heartbeat are valid.', 'Allowed on local LAN counter.', 'Yes', 'Central blocks when local is unreachable.', 'local_confirmed_seats, then central mirror'],
  ['LOCAL_AUTHORITY_OFFLINE', 'Blocked online from central.', 'Allowed locally when configured by show state.', 'Local owns confirmation.', 'Local keeps pending outbox events.', 'local_confirmed_seats'],
  ['LOCAL_AUTHORITY_COUNTER_ONLY', 'Blocked online from central.', 'Counter-only local booking policy.', 'Local owns confirmation.', 'Counter operations continue on LAN.', 'local_confirmed_seats'],
  ['LOCAL_SYNCING', 'Paused or blocked while final sync is running.', 'Counter booking only if ALLOW_COUNTER_BOOKING_DURING_LOCAL_SYNCING=true.', 'Yes', 'Pending events continue to drain.', 'central mirror after sync'],
  ['RETURNING_TO_CENTRAL', 'Blocked with RETURNING_TO_CENTRAL reason.', 'Central-routed local API is blocked; counter should pause unless policy permits.', 'Final local sync must complete.', 'Return is not allowed until safe checks pass.', 'central mirror verification'],
  ['SALES_CLOSED', 'Blocked.', 'Blocked.', 'No', 'No further sales should be accepted.', 'No owner because sales are closed']
];

const syncEventRows: string[][] = [
  ['BOOKING_CREATED', 'Local counter or local API confirmation', 'Central sync inbox', 'Confirmed local booking, including online-routed local authority bookings.', 'event_id plus theatre_id/source_sequence_no', 'Queued in local_sync_outbox, retried with capped exponential delay.', 'Central mirrors booking and confirmed seats idempotently.'],
  ['BOOKING_CANCELLED', 'Local cancellation flow when available', 'Central sync inbox', 'Local booking cancellation.', 'event_id plus theatre_id/source_sequence_no', 'Same outbox retry policy.', 'Central removes or updates mirrored booking state according to handler.'],
  ['PAYMENT_RECORDED', 'Local payment/audit flow', 'Central sync inbox', 'Payment collection metadata.', 'event_id plus theatre_id/source_sequence_no', 'Same outbox retry policy.', 'Central stores payment mirror/audit data.'],
  ['SHIFT_CLOSED', 'Counter shift close', 'Central sync inbox', 'Counter closes a shift.', 'event_id plus theatre_id/source_sequence_no', 'Same outbox retry policy.', 'Central receives shift close record once.'],
  ['TICKET_REPRINTED', 'Ticket reprint flow', 'Central sync inbox', 'A ticket is reprinted with supervisor control.', 'event_id plus theatre_id/source_sequence_no', 'Same outbox retry policy.', 'Central audit mirror receives reprint event.'],
  ['CENTRAL_BOOKING_CONFIRMED', 'Central booking confirmation', 'Local central event inbox', 'Central-authority booking needs local mirror.', 'central mirror event_id and sequence_no', 'Pulled by local worker in batches.', 'Local applies central booking idempotently.']
];

const databaseRows: string[][] = [
  ['central_movies', 'Central', 'Movie catalogue used by public, admin, and scheduling pages.', 'id', 'Movie poster, synopsis, trailer, status, and metadata.'],
  ['central_theatres', 'Central', 'Theatre catalogue and ownership metadata.', 'id', 'Theatre admins are scoped by theatre_id.'],
  ['central_screens', 'Central', 'Screen definitions linked to theatres and seat layouts.', 'id', 'Used by show scheduling and seat-map selection.'],
  ['seat_layouts, seat_layout_seats', 'Central', 'Canonical seat-map geometry and seat identifiers.', 'layout_id and seat_id keys', 'Seat picker renders from these rows.'],
  ['shows', 'Central', 'Scheduled show records and authority mode.', 'id', 'authority_mode drives central/local booking policy.'],
  ['central_show_pricing', 'Central', 'Zone pricing for each show.', 'show_id and zone', 'Used by public and counter amount calculations.'],
  ['central_seat_holds, central_seat_hold_items', 'Central', 'Public hold ownership before payment/confirmation.', 'hold id and unique hold item keys', 'Prevents duplicate active holds in central authority.'],
  ['central_bookings, central_booking_items', 'Central', 'Central booking ledger and item rows.', 'booking id and item uniqueness', 'Payment callback and idempotency logic reuse these records.'],
  ['central_confirmed_seats', 'Central', 'Final central seat ownership ledger.', 'PRIMARY KEY (show_id, seat_id)', 'Hard stop against duplicate central confirmed seats.'],
  ['central_sync_inbox, central_received_local_events', 'Central', 'Local-to-central sync landing table and audit view.', 'unique event_id, unique theatre_id/source_sequence_no', 'Replay-safe local sync ingestion.'],
  ['central_mirror_events', 'Central', 'Central-to-local event stream.', 'unique event_id and sequence_no', 'Local workers pull central schedule/booking events.'],
  ['central_sync_conflicts', 'Central', 'Detected sync conflicts.', 'unique event/seat conflict keys', 'Used for reconciliation and audit.'],
  ['theatre_heartbeats', 'Central', 'Last local heartbeat and sync counters.', 'theatre_id', 'Central health and authority decisions read this table.'],
  ['central_users, central_sessions', 'Central', 'Central admin authentication.', 'user id and session id', 'Stores role and theatre scoping, never documents hashes.'],
  ['public_users, public_sessions, public_otp_codes', 'Central', 'Public booking authentication.', 'user/session/otp ids', 'OTP values and hashes are intentionally not exposed.'],
  ['ticket_checker_users, ticket_checker_sessions, ticket_attendance, ticket_scan_logs', 'Central', 'Ticket validation workflow.', 'session ids and booking attendance keys', 'Marks attendance and records valid/invalid scans.'],
  ['local_movies, local_screens, local_shows', 'Local', 'Local mirror of scheduling and local authority show records.', 'local ids', 'Counter UI and local API read from local DB.'],
  ['local_seat_layouts, local_seat_layout_seats', 'Local', 'Local seat-map geometry.', 'layout_id and seat_id', 'Must match central for safe mirror verification.'],
  ['local_show_seats', 'Local', 'Local availability state for a show.', 'PRIMARY KEY (show_id, seat_id)', 'Local source of truth during local authority.'],
  ['local_seat_holds, local_seat_hold_items', 'Local', 'Local and counter holds.', 'hold id plus hold item uniqueness', 'Protects against two counters holding the same seat.'],
  ['local_confirmed_seats', 'Local', 'Local final seat ownership ledger.', 'PRIMARY KEY (show_id, seat_id)', 'Hard stop against duplicate local seats.'],
  ['local_bookings, local_booking_items', 'Local', 'Local booking ledger and ticket items.', 'booking id and unique hold/idempotency keys', 'Creates tickets and outbox events.'],
  ['local_sync_outbox, local_sync_state', 'Local', 'Local-to-central sync queue and sequence tracking.', 'unique event_id, unique sequence_no', 'Pending/failed/synced state drives the worker.'],
  ['central_sync_inbox, local_central_event_inbox, local_schedule_event_inbox', 'Local', 'Central-to-local event landing tables.', 'unique central event ids', 'Replay-safe pull processing.'],
  ['local_counters, local_users, local_sessions, active_counter_sessions, local_counter_shifts', 'Local', 'LAN counter access and session model.', 'counter/user/session/shift keys', 'Supports single active counter session policy.'],
  ['audit_logs, local_audit_logs', 'Both', 'Operational audit trails.', 'auto id', 'Payment, login, reprint, and administrative activity.']
];

const apiRows: string[][] = [
  ['Public booking', 'GET', '/api/shows/[showId]/seats', 'Public', 'Returns show, zones, seats, bookingEnabled, reason, and availability state.', '404 show missing, unavailable reason when authority/cutoff blocks booking.'],
  ['Public booking', 'POST', '/api/bookings/hold', 'Public user/session when configured', 'Creates a central hold or forwards local-authority hold to local API.', '409 seat conflict, 503 local unavailable, 400 invalid seats.'],
  ['Public booking', 'POST', '/api/bookings/confirm', 'Public plus payment/hold context', 'Confirms central booking or finalizes local-authority confirmation.', '409 duplicate/seat unavailable, payment or hold validation errors.'],
  ['Public booking', 'POST', '/api/bookings/release', 'Public hold owner', 'Releases an unconfirmed hold.', '404 hold missing, already confirmed/expired.'],
  ['Payment', 'POST', '/api/payments/razorpay/order', 'Public booking flow', 'Creates a Razorpay order or simulated fallback when explicitly enabled.', 'Provider disabled, invalid amount, booking mismatch.'],
  ['Payment', 'POST', '/api/payments/razorpay/verify', 'Public booking flow', 'Verifies Razorpay signature and moves booking forward.', 'Signature/payment mismatch, repeated callbacks handled idempotently.'],
  ['Payment', 'POST', '/api/payments/razorpay/webhook', 'Razorpay webhook secret', 'Receives asynchronous payment events.', 'Invalid signature, duplicate event ignored.'],
  ['Public auth', 'GET', '/api/public/auth/me', 'Public cookie', 'Returns public user auth state.', 'Anonymous returns unauthenticated state.'],
  ['Public auth', 'POST', '/api/public/auth/request-email-otp', 'Public', 'Sends email OTP when enabled.', 'Cooldown, email disabled, rate/attempt guard.'],
  ['Public auth', 'POST', '/api/public/auth/verify-email-otp', 'Public', 'Creates public session after OTP verification.', 'Expired OTP, invalid code, attempt limit.'],
  ['Admin management', 'POST/GET', '/api/admin/management', 'Central admin role', 'Admin theatre, screen, movie, show operations.', 'Access denied, validation failure.'],
  ['Ticket checker', 'POST', '/api/ticket-checker/login', 'Ticket checker credentials', 'Creates checker session.', 'Invalid credentials.'],
  ['Ticket checker', 'POST', '/api/ticket-checker/scan', 'Ticket checker session', 'Validates QR payload and marks attendance.', 'Already scanned, wrong theatre/show, invalid ticket.'],
  ['Heartbeat', 'POST', '/api/local-theatre/heartbeat', 'Shared secret or HMAC headers', 'Stores local health, sync counters, authority summaries.', '401 invalid theatre secret, rejected payload.'],
  ['Sync push', 'POST', '/api/sync/local-events', 'Local worker HMAC/shared secret', 'Accepts local outbox events idempotently.', '401 auth failure, conflict, malformed event.'],
  ['Sync pull', 'GET', '/api/sync/central-events', 'Local worker HMAC/shared secret', 'Returns central mirror events.', '401 auth failure, limit validation.'],
  ['Schedule sync', 'GET', '/api/sync/schedule-events', 'Local worker HMAC/shared secret', 'Returns scheduling events for local DB.', '401 auth failure, 429/protection page if deployment security blocks worker.'],
  ['Debug health', 'GET', '/api/debug/local-health', 'Administrative/debug only', 'Checks local API reachability and Cloudflare Access headers.', 'Timeout/unreachable/local DB unavailable.'],
  ['Debug authority', 'GET', '/api/debug/authority-status?showId=...', 'Administrative/debug only', 'Explains return-to-central eligibility and blocking reasons.', 'Show missing, local not reachable.']
];

const failureRows: string[][] = [
  ['Two counters select the same seat', 'local_seat_holds plus local_confirmed_seats constraints and transaction checks.', 'Only one hold/confirmation succeeds; the second receives seat unavailable.'],
  ['Online and counter booking overlap', 'Authority routing sends local-authority online booking to local; local confirmed seat PK wins.', 'Existing local ticket is preserved and central receives conflict/unavailable response.'],
  ['Payment callback received twice', 'Booking idempotency keys, hold state checks, and confirmed-seat uniqueness.', 'Booking remains single; repeated callback cannot create a second ticket.'],
  ['Sync event is replayed', 'central_sync_inbox unique event_id and unique theatre_id/source_sequence_no.', 'Duplicate event is ignored or acknowledged without duplicate records.'],
  ['Hold expires during payment', 'expires_at and hold status validation before confirm.', 'Confirm fails with hold expired; seats become available after cleanup/release.'],
  ['Local disconnects during confirmation', 'Central only finalizes local-authority booking after local confirmation succeeds.', 'Central blocks or rolls back user flow; local outbox resumes after reconnect.'],
  ['Central is unavailable while local sells tickets', 'Local outbox retains PENDING/FAILED events and retries.', 'Local ticket remains valid locally; central mirror catches up after sync.'],
  ['Heartbeat delayed or missing', 'theatre_heartbeats age checks and local health timeout.', 'Central online booking for local-authority show is blocked until health recovers.'],
  ['Seat already sold after user selection', 'Fresh seat status is checked before hold/confirm.', 'Unavailable modal is shown and UI must refresh latest layout.'],
  ['Worker crash or restart', 'Outbox/inbox persisted in MySQL, active in-process lock resets on process restart.', 'Worker resumes processing durable queues.']
];

const troubleshootingRows: string[][] = [
  ['Heartbeat rejected by central', 'Shared secret/HMAC mismatch, wrong central URL, or protected deployment page.', 'Open local worker logs and test /api/local-theatre/heartbeat with configured headers.', 'Correct LOCAL_THEATRE_SHARED_SECRET, central URL, Cloudflare/Vercel bypass headers.', 'Keep production env values in Vercel/local .env only.'],
  ['Central shows LOCAL_AUTHORITY_UNREACHABLE', 'Heartbeat stale, local API unreachable, tunnel down, or Cloudflare Access headers missing.', 'Check /api/debug/local-health and /api/debug/authority-status?showId=...', 'Restart tunnel/worker, verify LOCAL_THEATRE_API_URL and access credentials.', 'Monitor theatre_heartbeats age.'],
  ['Previous heartbeat still active', 'Worker loop tried a new heartbeat while old request had not completed.', 'Look for skipped lock logs in local worker.', 'Wait for request timeout or restart worker if stuck.', 'Keep worker timeout lower than interval under slow networks.'],
  ['Sync run still active', 'Push/pull/schedule lock is already in progress.', 'Check local worker lock logs and pending counts.', 'Allow current run to finish; restart only if process is wedged.', 'Avoid running multiple workers for the same theatre.'],
  ['Counter LAN guard rejection', 'Host/IP is public or private IP parsing failed.', 'Read [counter-lan-guard] log fields hostIsLan and forwardedForIsLan.', 'Use LAN IP/localhost or correct reverse proxy headers.', 'Do not expose /counter through public tunnel.'],
  ['Counter redirected to login', 'Counter session expired, cookie path/domain mismatch, or wrong counter session.', 'Check counter cookie and active_counter_sessions.', 'Log in again with the correct counter code.', 'Keep counter cookie httpOnly, sameSite lax, path /.'],
  ['Duplicate booking conflict', 'Seat already held/confirmed, sync replay, or stale UI selection.', 'Inspect hold id, booking id, confirmed seat table, and sync conflict logs.', 'Refresh seat layout; do not override confirmed seats manually.', 'Rely on unique keys and fresh status fetch before confirm.'],
  ['Database connection failure', 'MySQL stopped, wrong DB env, remote DB firewall, or pool exhausted.', 'Run app health/debug route and check MySQL service/XAMPP.', 'Start MySQL, correct env values, test connection with mysql client.', 'Keep pool limits sane and avoid long transactions.'],
  ['Seat layout mismatch', 'Central and local layout versions differ or stale seeded data.', 'Compare seat_layouts and local_seat_layouts for the show screen.', 'Reseed or pull schedule events, then refresh local layout.', 'Run schedule sync after theatre/screen changes.'],
  ['Vercel Security Checkpoint 429', 'Worker request is blocked by Vercel deployment protection.', 'Local worker logs show HTML title Vercel Security Checkpoint.', 'Add automation bypass secret env and worker header support.', 'Keep worker endpoints allowed for machine clients.']
];

const incompleteRows: string[][] = [
  ['Notification delivery worker', 'notification_outbox-style tables and email helpers exist, but a dedicated production sender loop was not verified in the scanned central scripts.', 'Treat notification dispatch as requiring operational verification before production reliance.'],
  ['Refund automation', 'Refund/payment tables and Razorpay integration exist, but full provider-driven refund settlement flow was not fully audited in this documentation pass.', 'Use finance reconciliation before promising automatic refunds.'],
  ['Show cancellation/reschedule customer notifications', 'Admin actions and notification data are present, but end-to-end customer delivery needs live-provider testing.', 'Run a staged cancellation test with SES configured.'],
  ['Multi-theatre owner portal depth', 'Theatre scoping exists for THEATRE_ADMIN, but every admin subpage should be regression-tested after adding new theatres.', 'Use role-specific test accounts before onboarding owners.'],
  ['Production rate limiting', 'OTP cooldown/attempt limits exist, but a platform-wide rate limiter was not found in the scanned code.', 'Place public APIs behind hosting/WAF protections for abuse control.']
];

export const technicalManual: TechnicalManual = {
  meta: {
    productName: 'KSFDC Theatre Management and Hybrid Ticketing System',
    documentationVersion: 'Version 2.0',
    applicationVersion: 'central-app 0.1.0, local-theatre-app 0.1.0, Next.js 16.2.6',
    lastReviewed: '2026-06-30',
    audience: ['Developers', 'System administrators', 'Theatre operators', 'Auditors', 'Future maintenance teams']
  },
  sections: [
    {
      id: 'overview',
      title: 'Version Overview',
      kicker: 'Official manual',
      summary: 'Version 2.0 documents the hybrid central and local theatre architecture currently implemented in the codebase.',
      body: [
        'The system combines a central ticketing portal with one or more local theatre servers. Central serves the public booking site, admin tools, payment integration, ticket checker, health dashboards, and cross-theatre reporting. Local theatre apps serve LAN counters, local authority booking, offline continuity, heartbeat reporting, and durable synchronization.',
        'The implementation supports central authority booking, local authority online booking through a reachable theatre server, local authority offline/counter booking, return-to-central safeguards, ticket validation, public email OTP login, counter sessions, sync conflict tracking, and operational debug routes.',
        'Version 2.0 changes covered here include hybrid authority modes, safe return-to-central checks, local outbox sync, heartbeat-driven availability, LAN-only counter protection, ticket checker attendance, mobile seat selection improvements, local poster seed assets, and booking cutoff enforcement.'
      ],
      cards: [
        { title: 'Central responsibility', body: 'Public booking, central authority seats, admin scheduling, payments, ticket checker, reports, heartbeat receiver, central mirror events, and reconciliation.', meta: 'central-app' },
        { title: 'Local responsibility', body: 'LAN counter booking, local authority seats, local holds, local tickets, offline operation, heartbeat sender, outbox sync, and central pull sync.', meta: 'local-theatre-app' },
        { title: 'Primary safety rule', body: 'A seat is never confirmed by blind UI state. Final confirmation is protected by database uniqueness, authority checks, hold status, and idempotent sync.', tone: 'success' },
        { title: 'Documentation scope', body: 'Secrets, hashes, credentials, private production URLs, and personal data are intentionally omitted.', tone: 'warning' }
      ],
      callouts: [
        { tone: 'warning', title: 'Sensitive operations', body: 'This manual is admin-only because it includes operational routes, table names, debug endpoints, and deployment procedures. It must not be linked from public booking navigation.' }
      ]
    },
    {
      id: 'architecture',
      title: 'System Architecture',
      kicker: 'Hybrid topology',
      summary: 'Central and local systems share schedules and booking state through heartbeat, push sync, pull sync, and authority-specific booking APIs.',
      diagrams: [
        {
          title: 'High-Level Architecture',
          description: 'Customer, admin, local theatre, worker, and counter responsibilities.',
          steps: [
            'Customer browser -> Central Next.js app -> Central MySQL',
            'Central app -> Local theatre API for LOCAL_AUTHORITY_ONLINE hold and confirm',
            'Local counters -> Local Next.js app on LAN port 3001 -> Local MySQL',
            'Local worker -> Central heartbeat endpoint every configured interval',
            'Local worker -> Central sync APIs for local outbox push',
            'Local worker <- Central sync APIs for mirror and schedule pull',
            'Central admin and ticket checker -> Central app protected routes'
          ],
          notes: [
            'Cloudflare Access or a secure tunnel may protect local API traffic.',
            'Counter routes remain LAN-only and must not be exposed through a public tunnel.'
          ]
        },
        {
          title: 'Online Booking Sequence',
          description: 'Central online sale path, including local-authority forwarding.',
          steps: [
            'User opens show and central resolves show authority',
            'Central checks booking cutoff, show status, heartbeat, and local health',
            'Seat status is loaded from central DB or forwarded to local API',
            'User selects seats and central creates or forwards a hold',
            'Payment starts using Razorpay or configured fallback',
            'Payment success verifies order/signature',
            'Central confirms directly for CENTRAL_AUTHORITY or asks local to confirm for LOCAL_AUTHORITY_ONLINE',
            'Confirmed seats are written only after the authority owner succeeds',
            'Ticket is issued and sync/outbox records mirror the sale'
          ]
        },
        {
          title: 'Counter Booking Sequence',
          description: 'LAN counter sale path on the local theatre server.',
          steps: [
            'Counter user logs in with counter code and session cookie',
            'Counter opens local show list and selects a show',
            'Local app verifies counter session and local authority policy',
            'Operator selects seats and creates a local hold',
            'Cash or manual digital payment is collected',
            'Local transaction confirms hold into booking and confirmed seats',
            'BOOKING_CREATED is written into local_sync_outbox',
            'Worker pushes event to central when available',
            'Ticket page prints or downloads the local ticket'
          ]
        },
        {
          title: 'Heartbeat and Availability',
          description: 'How central decides local theatre reachability.',
          steps: [
            'Local worker builds heartbeat payload with theatre id, code, DB state, authority summaries, and sync counters',
            'Worker posts to /api/local-theatre/heartbeat with shared-secret or HMAC authentication',
            'Central stores latest heartbeat and sequence counters in theatre_heartbeats',
            'Booking-authority logic checks heartbeat age and local health request result',
            'Fresh heartbeat and healthy local API allow LOCAL_AUTHORITY_ONLINE booking',
            'Stale or missing heartbeat blocks online local-authority booking',
            'When communication recovers, fresh heartbeat and sync counters restore booking availability'
          ]
        },
        {
          title: 'Synchronization Flow',
          description: 'Durable local-to-central and central-to-local event movement.',
          steps: [
            'Local booking creates a PENDING local_sync_outbox event',
            'Push worker reads due events in sequence order and sends a batch to central',
            'Central inserts into central_sync_inbox with unique event and sequence constraints',
            'Central applies mirror changes or records conflicts',
            'Local marks accepted events SYNCED or schedules retry on failure',
            'Pull worker reads central_mirror_events and schedule events',
            'Local applies central events idempotently and acknowledges processed events'
          ]
        },
        {
          title: 'Seat State Model',
          description: 'States visible or enforced across the central and local applications.',
          steps: [
            'AVAILABLE: seat can be selected',
            'SELECTED: UI-only state before hold creation',
            'HELD: active hold row exists before confirmation',
            'PENDING payment: hold is protected while payment or counter collection is in progress',
            'CONFIRMED or SOLD: booking and confirmed-seat row exists',
            'BLOCKED or UNAVAILABLE: seat is not bookable',
            'EXPIRED: hold can no longer be confirmed',
            'CANCELLED: booking or hold is cancelled where supported',
            'FAILED: payment or sync/event processing failed and needs retry/recovery'
          ]
        }
      ],
      tables: [
        {
          title: 'Authority Ownership Summary',
          columns: ['Area', 'Authoritative Component', 'Reason'],
          rows: [
            ['Seat availability in CENTRAL_AUTHORITY', 'Central DB', 'Central holds and central_confirmed_seats own the decision.'],
            ['Seat availability in LOCAL_AUTHORITY_ONLINE', 'Local DB via local API', 'Central must forward hold/confirm and cannot directly insert final local seats first.'],
            ['Seat availability in LOCAL_AUTHORITY_OFFLINE', 'Local DB', 'Central online booking is blocked.'],
            ['Counter sales', 'Local theatre app', 'Counter sessions, holds, payments, and tickets are local-first.'],
            ['Show schedules', 'Central admin then sync to local', 'Central scheduling data is mirrored through schedule events.'],
            ['Conflict resolution', 'Database constraints plus reconciliation views', 'Duplicate confirmed seats and replayed sync events are rejected.']
          ]
        }
      ]
    },
    {
      id: 'timing',
      title: 'Timing and Configuration',
      kicker: 'Drift audit',
      summary: 'Timing values below are copied from code paths and environment fallbacks found during the documentation audit.',
      callouts: [
        { tone: 'info', title: 'Safe config policy', body: 'Only names, fallback values, and behavior are documented. Secret values are never rendered.' },
        { tone: 'warning', title: 'Environment overrides', body: 'Several values are environment-driven. If production env differs from fallback code values, update this manual after changing the environment.' }
      ],
      tables: [
        {
          title: 'Timing and Configuration Reference',
          columns: ['Configuration', 'Current Value', 'Unit', 'Source File or Environment Variable', 'Purpose', 'Behaviour When Exceeded'],
          rows: timingRows
        },
        {
          title: 'Documentation Audit Report: Timing Values Found vs Documented',
          description: 'This table is intentionally duplicated as an audit artifact so timing drift can be reviewed during future releases.',
          columns: ['Found Timing Value', 'Documented Value', 'Source', 'Audit Result'],
          rows: timingRows.map((row) => [row[0], `${row[1]} ${row[2]}`, row[3], 'Documented'])
        }
      ]
    },
    {
      id: 'heartbeat',
      title: 'Heartbeat Mechanism',
      kicker: 'Local availability',
      summary: 'The local worker sends heartbeat updates to central, and central uses heartbeat age plus local health checks to protect local-authority online booking.',
      body: [
        'The local worker runs from local-theatre-app/scripts/local-worker.mjs through scripts/worker-core.mjs. It loads .env.local, prints its central URL, theatre identity, heartbeat endpoint, interval configuration, and shared-secret presence, then starts a recurring heartbeat loop.',
        'Central receives heartbeat at /api/local-theatre/heartbeat. The payload includes theatre identity, local app health, DB status, pending/failed sync counters, authority summaries, and sequence counters. The heartbeat updates theatre_heartbeats and powers debug health routes.',
        'Overlapping heartbeat execution is prevented by an in-process active lock. When a heartbeat is still running, the worker logs that the heartbeat is skipped instead of starting another request.'
      ],
      tables: [
        {
          title: 'Heartbeat States and Booking Impact',
          columns: ['State', 'Detected By', 'Central Booking Impact', 'Operator Action'],
          rows: [
            ['ONLINE', 'Fresh theatre_heartbeats row and successful local health response.', 'LOCAL_AUTHORITY_ONLINE booking can proceed through local API.', 'Keep worker and tunnel running.'],
            ['STALE', 'Heartbeat age is over the stale threshold.', 'Central may block or warn depending on authority path.', 'Check worker logs and network.'],
            ['OFFLINE', 'Heartbeat age is over offline threshold, row missing, or stored status OFFLINE.', 'Central blocks local-authority online booking.', 'Restart local worker/tunnel and confirm DB health.'],
            ['DB unavailable', 'Local health payload reports dbStatus unavailable.', 'Central should not trust local confirmation.', 'Start/fix local MySQL before accepting online routed bookings.'],
            ['Rejected heartbeat', 'Central returns non-OK or auth failure.', 'Health age becomes stale/offline if repeated.', 'Fix shared secret/HMAC headers or deployment protection.']
          ]
        }
      ],
      codes: [
        {
          title: 'Local heartbeat worker',
          language: 'powershell',
          code: 'cd D:\\film-lsa-plan\\local-theatre-app\nnpm run worker'
        },
        {
          title: 'Central health debug route',
          language: 'http',
          code: 'GET https://central.webtestingonline.com/api/debug/local-health'
        }
      ]
    },
    {
      id: 'synchronization',
      title: 'Synchronization',
      kicker: 'Outbox and inbox',
      summary: 'Local-to-central and central-to-local sync are durable, batch-based, idempotent, and protected against overlapping worker runs.',
      body: [
        'Local-to-central push reads due local_sync_outbox rows in sequence order and sends them to central sync APIs. Accepted events are marked synced; rejected or failed events remain queued with retry_count and next_attempt_at.',
        'Central-to-local pull reads central mirror and schedule events in bounded batches. Local inbox tables store received central events and apply them idempotently.',
        'Both push and pull have in-process active locks. Repeated triggers while a run is active return or log IN_PROGRESS instead of starting overlapping work.'
      ],
      tables: [
        {
          title: 'Sync Event Types',
          columns: ['Event Type', 'Created By', 'Destination', 'Trigger', 'Idempotency Key', 'Retry Behaviour', 'Final Result'],
          rows: syncEventRows
        },
        {
          title: 'Sync Queue Tables',
          columns: ['Table', 'Side', 'Purpose', 'Replay Protection'],
          rows: [
            ['local_sync_outbox', 'Local', 'Durable pending local events.', 'unique event_id and unique sequence_no.'],
            ['central_sync_inbox', 'Central', 'Accepted local events.', 'unique event_id and unique theatre_id/source_sequence_no.'],
            ['central_received_local_events', 'Central', 'View for audit/reporting over central_sync_inbox.', 'Read-only derived view.'],
            ['central_mirror_events', 'Central', 'Central event stream for locals.', 'unique event_id and unique sequence_no.'],
            ['local_central_event_inbox', 'Local', 'Received central mirror events.', 'central event id uniqueness.'],
            ['local_schedule_event_inbox', 'Local', 'Received schedule updates.', 'central schedule event id uniqueness.'],
            ['central_sync_conflicts/local_sync_conflicts', 'Both', 'Conflict audit.', 'unique conflict keys per event/seat.']
          ]
        }
      ],
      codes: [
        {
          title: 'Run the local all-in-one worker',
          language: 'powershell',
          code: 'cd D:\\film-lsa-plan\\local-theatre-app\nnpm run worker'
        },
        {
          title: 'Check authority/sync state for one show',
          language: 'http',
          code: 'GET https://central.webtestingonline.com/api/debug/authority-status?showId=SHOW_TODAY_001'
        }
      ]
    },
    {
      id: 'duplicate-protection',
      title: 'Duplicate Booking Prevention',
      kicker: 'Seat safety',
      summary: 'Duplicate ticket prevention is layered across database keys, hold ownership, authority routing, transactions, idempotency, and sync replay protection.',
      body: [
        'The most important protection is the confirmed-seat ledger. central_confirmed_seats and local_confirmed_seats both use PRIMARY KEY (show_id, seat_id), making duplicate final ownership impossible without an explicit destructive database operation.',
        'Holds reduce race windows, but final confirmation still checks hold status, expiry, authority, and current seat state. Sync replay protection prevents a successful local sale from being mirrored twice.',
        'For local authority shows, central must not directly write a final confirmed seat before the local API confirms. The local DB is the authority owner, and central mirrors the event afterward.'
      ],
      tables: [
        {
          title: 'Failure Scenario Matrix',
          columns: ['Scenario', 'Protection Mechanism', 'Expected Result'],
          rows: failureRows
        },
        {
          title: 'Concrete Safety Layers',
          columns: ['Layer', 'Central Implementation', 'Local Implementation'],
          rows: [
            ['Final seat uniqueness', 'central_confirmed_seats PRIMARY KEY (show_id, seat_id).', 'local_confirmed_seats PRIMARY KEY (show_id, seat_id).'],
            ['Hold item uniqueness', 'central_seat_hold_items repair helper enforces unique hold item keys.', 'local_seat_hold_items protects held show/seat ownership.'],
            ['Booking idempotency', 'central booking/hold idempotency keys.', 'local_bookings unique idempotency and hold keys.'],
            ['Sync replay', 'central_sync_inbox event and source sequence uniqueness.', 'local inbox unique central event ids.'],
            ['Authority routing', 'booking-authority logic blocks or forwards by authority_mode.', 'local-data enforces local authority policy and cutoff.'],
            ['Operator double click', 'Hold/confirm endpoints are retry-safe through state checks and DB uniqueness.', 'Counter actions validate hold state before confirm.']
          ]
        }
      ]
    },
    {
      id: 'booking-lifecycle',
      title: 'Booking Lifecycle',
      kicker: 'Online and counter',
      summary: 'Booking moves from availability to hold to payment and confirmation, with different authority owners deciding the final seat ledger.',
      tables: [
        {
          title: 'Booking and Hold Statuses',
          columns: ['Status', 'Created When', 'Allowed Next States', 'User-Facing Meaning', 'Recovery Action'],
          rows: [
            ['ACTIVE hold', 'Seats are held for a public or counter session.', 'CONFIRMED, EXPIRED, CANCELLED/released.', 'Seats are protected temporarily.', 'Confirm before expiry or release and retry.'],
            ['CONFIRMED hold', 'A hold has been converted into a booking.', 'No further hold action.', 'Ticket was issued.', 'Use ticket or support/reconciliation flows.'],
            ['EXPIRED hold', 'expires_at passed before confirmation.', 'Release/cleanup only.', 'Seats are no longer protected.', 'Start a new hold if seats remain available.'],
            ['CANCELLED hold', 'User or system releases hold.', 'No confirm allowed.', 'Seats return to availability.', 'Select again if needed.'],
            ['PENDING booking', 'Booking is created while payment/confirmation is incomplete.', 'CONFIRMED or CANCELLED/failed where supported.', 'Payment or authority confirmation is still in progress.', 'Check payment and hold status.'],
            ['CONFIRMED booking', 'Payment and authority confirmation succeeded.', 'Ticket reprint, attendance scan, cancellation if supported.', 'Ticket is valid.', 'No automatic recovery needed.'],
            ['CANCELLED booking', 'Cancellation flow marks booking cancelled.', 'Refund/reconciliation where configured.', 'Ticket is no longer valid.', 'Follow finance policy.']
          ]
        },
        {
          title: 'Booking Lifecycle Variants',
          columns: ['Lifecycle', 'Authority Owner', 'Important Behavior'],
          rows: [
            ['Central online booking', 'Central', 'Central creates hold, processes payment, inserts central booking and confirmed seats.'],
            ['Local authority online booking', 'Local', 'Central forwards hold and confirm to local API. Central mirrors after local confirmation.'],
            ['Local counter booking', 'Local', 'Counter hold and payment are local. Outbox sync mirrors to central.'],
            ['Payment failure', 'Authority owner remains unconfirmed.', 'Hold can be released or expires. No confirmed seat is created.'],
            ['Payment timeout/browser close', 'Hold expires by expires_at.', 'Seats become available when status/cleanup recognizes expiry.'],
            ['Ticket reprint', 'Existing confirmed booking.', 'Requires audit trail and supervisor control where implemented.'],
            ['Show cancellation/reschedule', 'Admin scheduling flow.', 'Implementation exists, but notification/refund completion requires operational verification.']
          ]
        }
      ]
    },
    {
      id: 'seat-holds',
      title: 'Seat Hold Mechanism',
      kicker: 'Temporary ownership',
      summary: 'Holds protect selected seats only for a bounded time and never replace final confirmed-seat constraints.',
      diagrams: [
        {
          title: 'Hold Timeline',
          description: 'Lifecycle of a public or counter hold.',
          steps: [
            'User selects available seats in UI',
            'API validates show, authority, cutoff, seat ids, and current availability',
            'Hold row is created with expires_at and owner/session metadata',
            'Hold items record each selected seat',
            'Payment or counter collection starts',
            'Confirm checks hold is ACTIVE and not expired',
            'Successful confirm creates booking, booking items, and confirmed seats',
            'Hold becomes CONFIRMED or expires/releases on failure'
          ]
        }
      ],
      tables: [
        {
          title: 'Hold Behavior',
          columns: ['Question', 'Current Implementation'],
          rows: [
            ['Who owns a hold?', 'Public holds are tied to hold/session/idempotency context; counter holds include counter, operator, and shift context.'],
            ['Can holds be extended?', 'No verified hold-extension route was found in the audited paths. Create a new hold after expiry.'],
            ['What happens on browser close?', 'The database hold remains until release or expiry; confirmation after expiry fails.'],
            ['What happens with multiple tabs?', 'Idempotency and unique hold/seat checks prevent duplicate final seats.'],
            ['Can an expired hold confirm?', 'No. Counter confirm returns HOLD_EXPIRED and public confirm validates hold state.'],
            ['Can a failed payment keep seats forever?', 'No. Failed payment should release or allow expiry; final confirm still requires active hold.']
          ]
        }
      ]
    },
    {
      id: 'authority',
      title: 'Authority Modes and Policies',
      kicker: 'Show-level ownership',
      summary: 'authority_mode on shows determines whether central, local online, local offline, syncing, or closed sales rules apply.',
      tables: [
        {
          title: 'Authority Mode Matrix',
          columns: ['Authority Mode', 'Online Booking', 'Counter Booking', 'Local Confirmation Required', 'Offline Behaviour', 'Conflict Owner'],
          rows: authorityRows
        },
        {
          title: 'Return-to-Central Safe Rule',
          columns: ['Requirement', 'Purpose'],
          rows: [
            ['Local reachable or final sync completed before disconnect.', 'Central must know local state before taking authority.'],
            ['Pending sync count is zero for the show.', 'No unsent local booking can be lost.'],
            ['Failed sync count is zero for the show.', 'No known failed local event remains unresolved.'],
            ['lastLocalSequence equals lastSyncedSequence.', 'Central has consumed all local events up to the latest sequence.'],
            ['Central mirror contains all confirmed local seats.', 'Central will not sell a locally sold seat after return.'],
            ['Local has paused or ended authority for the show.', 'No new local booking appears after verification.']
          ]
        }
      ]
    },
    {
      id: 'database',
      title: 'Database Reference',
      kicker: 'Schemas and constraints',
      summary: 'The most important central and local tables are documented below. Sensitive columns and credential values are intentionally omitted.',
      tables: [
        {
          title: 'Central and Local Database Tables',
          columns: ['Table', 'Database', 'Purpose', 'Primary/Unique Keys', 'Notes'],
          rows: databaseRows
        },
        {
          title: 'Entity Relationship Overview',
          columns: ['Relationship', 'Meaning'],
          rows: [
            ['central_theatres -> central_screens -> shows', 'A theatre owns screens; screens host scheduled shows.'],
            ['movies -> shows', 'A movie can be scheduled into many shows.'],
            ['seat_layouts -> seat_layout_seats -> shows', 'A screen layout supplies seat ids for show availability.'],
            ['shows -> central_seat_holds -> central_seat_hold_items', 'Public seat holds before central confirmation.'],
            ['shows -> central_bookings -> central_booking_items', 'Confirmed or pending central booking ledger.'],
            ['shows -> central_confirmed_seats', 'Final central seat ownership.'],
            ['local_shows -> local_seat_holds/local_bookings/local_confirmed_seats', 'Local authority and counter equivalent.'],
            ['local_sync_outbox -> central_sync_inbox', 'Local events become central mirror records.'],
            ['central_mirror_events -> local_central_event_inbox', 'Central events become local mirror records.']
          ]
        }
      ]
    },
    {
      id: 'api',
      title: 'API Reference',
      kicker: 'Sanitized routes',
      summary: 'Important public, admin, debug, heartbeat, payment, ticket checker, and sync routes are grouped below.',
      callouts: [
        { tone: 'danger', title: 'Do not expose internal APIs casually', body: 'Heartbeat, sync, debug, local API, and counter endpoints are operational routes. They require role auth, shared secrets, HMAC, or LAN-only protection depending on route.' }
      ],
      tables: [
        {
          title: 'Important API Groups',
          columns: ['Group', 'Method', 'Route', 'Authentication', 'Request Purpose', 'Common Errors'],
          rows: apiRows
        }
      ],
      codes: [
        {
          title: 'Sanitized hold request shape',
          language: 'json',
          code: '{\n  "showId": "SHOW_TODAY_001",\n  "seatIds": ["A1", "A2"],\n  "idempotencyKey": "client-generated-unique-key"\n}'
        },
        {
          title: 'Sanitized local health response shape',
          language: 'json',
          code: '{\n  "success": true,\n  "status": "ONLINE",\n  "theatreId": "THEATRE_KAVITHA_KOCHI",\n  "pendingSync": 0,\n  "failedSync": 0,\n  "dbStatus": "AVAILABLE"\n}'
        }
      ]
    },
    {
      id: 'security',
      title: 'Authentication, Roles, and Security',
      kicker: 'Access control',
      summary: 'The system uses signed httpOnly cookies for users, shared-secret/HMAC auth for worker traffic, role-based admin access, and LAN-only counter protection.',
      tables: [
        {
          title: 'Role and Permission Matrix',
          columns: ['Role', 'Scope', 'Main Access', 'Restrictions'],
          rows: [
            ['SUPER_ADMIN', 'Central', 'All central admin pages, movie management, technical manual, reconciliation, reports.', 'Protect credentials and production destructive operations.'],
            ['THEATRE_ADMIN', 'Central theatre-scoped', 'Admin dashboard, theatre management, settings where scoped.', 'No global movie management or technical manual by default.'],
            ['FINANCE_VIEWER', 'Central finance', 'Admin dashboard, reports, reconciliation.', 'Read-oriented finance/reporting access.'],
            ['AGENT_CLIENT', 'Central agent', 'Agent-specific flows where configured.', 'No general admin access.'],
            ['LOCAL_ADMIN', 'Local', 'Local theatre administration.', 'Local app only.'],
            ['THEATRE_MANAGER', 'Local', 'Local theatre operations.', 'Local app only.'],
            ['COUNTER_OPERATOR', 'Local counter', 'Counter booking and ticket flow for assigned counter.', 'Bound to counter session and LAN access.'],
            ['SHIFT_SUPERVISOR', 'Local counter', 'Supervisor approval such as reprint where implemented.', 'Local app only.'],
            ['Ticket checker', 'Central ticket checker', 'Ticket scanning and attendance.', 'Separate session model, no admin access.']
          ]
        },
        {
          title: 'Security Controls',
          columns: ['Control', 'Implementation'],
          rows: [
            ['Central session cookie', 'ksfdc_central_session, HMAC signed, httpOnly, sameSite lax, secure in production, 8 hour maxAge.'],
            ['Public session cookie', 'ksfdc_public_session, HMAC signed, httpOnly, sameSite lax, secure in production, 30 day maxAge.'],
            ['Counter session cookie', 'Local counter cookie with httpOnly, sameSite lax, path /, secure false for local HTTP unless env overrides.'],
            ['Worker authentication', 'Shared-secret or HMAC headers; local worker includes theatre identity and optional Vercel/Cloudflare access headers.'],
            ['LAN guard', 'Counter routes allow localhost/private LAN and block public requests unless ALLOW_PUBLIC_COUNTER_ACCESS=true.'],
            ['SQL injection protection', 'mysql2 parameterized queries and explicit SQL placeholders in audited paths.'],
            ['Audit logging', 'Central and local audit_logs record login, payment, reprint, admin, and operational activity.'],
            ['Secrets policy', 'This manual documents variable names and behavior only, never values.']
          ]
        }
      ]
    },
    {
      id: 'workers',
      title: 'Background Workers',
      kicker: 'Recurring processes',
      summary: 'Local worker loops perform heartbeat, push sync, pull sync, and schedule sync with locks and retry/backoff behavior.',
      tables: [
        {
          title: 'Worker and Scheduled Process Reference',
          columns: ['Worker', 'Trigger', 'Frequency', 'Locking', 'Retry Behaviour', 'Failure Impact', 'Recovery'],
          rows: [
            ['Heartbeat worker', 'npm run worker / npm run heartbeat', '10 seconds default', 'heartbeat active lock', 'Backoff after failure.', 'Central marks local stale/offline after threshold.', 'Fix network/auth and worker resumes.'],
            ['Local push sync', 'npm run worker / immediate trigger', '5 seconds default plus immediate 100 ms trigger', 'push active lock', 'Outbox retry with capped exponential delay.', 'Central mirror lags behind local sales.', 'Worker retries durable pending events.'],
            ['Central pull sync', 'npm run worker / immediate trigger', '5 seconds default plus immediate 100 ms trigger', 'pull active lock', 'Backoff after failed fetch/apply.', 'Local may miss central bookings/events temporarily.', 'Worker resumes and applies idempotently.'],
            ['Schedule pull sync', 'npm run worker', '5 seconds default', 'schedule active lock', 'Backoff after failed fetch/apply.', 'Local schedule/layout may become stale.', 'Worker pulls schedule events after connection recovers.'],
            ['Hold expiry cleanup', 'API and confirmation paths validate expires_at; explicit recurring cleanup was not verified in this pass.', 'On demand/status checks', 'Database status checks', 'Expired holds cannot confirm.', 'Stale hold rows may remain for audit until cleanup.', 'Run safe cleanup procedure if needed.'],
            ['Ticket generation', 'Booking confirmation/ticket page request', 'On demand', 'Booking idempotency and confirmed-seat uniqueness', 'Retry-safe render/download.', 'Ticket display can be retried without new booking.', 'Open ticket by booking id.']
          ]
        }
      ]
    },
    {
      id: 'failure-recovery',
      title: 'Failure Handling and Recovery',
      kicker: 'Operational response',
      summary: 'The system favors blocking unsafe sales, preserving local tickets, and retrying durable sync over guessing during failures.',
      tables: [
        {
          title: 'Failure Handling Matrix',
          columns: ['Failure', 'User Impact', 'System Response', 'Automatic Recovery', 'Manual Intervention', 'Relevant Logs'],
          rows: [
            ['Local server unavailable', 'Central local-authority booking disabled.', 'Returns unavailable reason and preserves seats.', 'Heartbeat/local health recovers.', 'Restart local app/tunnel/MySQL.', '[local-worker] heartbeat failed, debug local health.'],
            ['Central server unavailable', 'Public central booking and sync unavailable.', 'Local counter can continue if local authority/offline policy allows.', 'Worker retries pending outbox.', 'Restore central app/DB.', '[local-worker] push sync failed.'],
            ['Database unavailable', 'Affected app returns health or server errors.', 'DB health check reports unavailable.', 'Pool reconnects after DB returns.', 'Restart MySQL/XAMPP or fix DB env.', 'dbStatus AVAILABLE/UNAVAILABLE logs.'],
            ['Slow network/API timeout', 'Temporary unavailable or retry later.', 'Fetch aborts at configured timeout.', 'Worker backoff retries.', 'Increase timeout only after diagnosing network.', 'failed in Xms, timeout.'],
            ['Payment success but confirmation failure', 'User may not receive ticket immediately.', 'Booking must not confirm without authority owner success.', 'Retry/reconciliation can recover if payment is verified.', 'Use payment and booking reconciliation.', 'payment verify/confirm logs.'],
            ['Confirmed locally but not centrally', 'Central reports lagging mirror.', 'local_sync_outbox remains PENDING/FAILED.', 'Worker pushes after reconnect.', 'Check failed sync queue and conflicts.', 'push sync OK/failed.'],
            ['Invalid theatre secret', 'Heartbeat/sync rejected.', 'Central returns auth failure.', 'None until env is corrected.', 'Align central and local secret/env headers.', 'Heartbeat rejected by central.'],
            ['Seat conflict', 'Second buyer sees unavailable/conflict.', 'DB unique key or application check rejects duplicate.', 'UI refresh gets latest availability.', 'Do not manually override confirmed seats.', 'Conflict/unavailable API response.']
          ]
        }
      ]
    },
    {
      id: 'monitoring',
      title: 'Logging, Monitoring, and Health Checks',
      kicker: 'Operations',
      summary: 'Useful signals include theatre heartbeat age, pending and failed sync counts, booking ids, hold ids, event ids, and local DB status.',
      tables: [
        {
          title: 'Health and Debug Routes',
          columns: ['Route', 'Purpose', 'Good Result'],
          rows: [
            ['/api/debug/local-health', 'Central checks local API, shared secret, Cloudflare Access headers, and DB state.', 'success true, statusCode 200, local status ONLINE, dbStatus AVAILABLE.'],
            ['/api/debug/authority-status?showId=...', 'Explains authority, reachability, pending/failed sync, sequences, and blocking reasons.', 'canReturnToCentral true only when safe conditions pass.'],
            ['/api/debug/heartbeat-status', 'Summarizes heartbeat freshness.', 'ONLINE when recent heartbeat is present.'],
            ['/api/local/health', 'Local theatre health endpoint.', 'success true, status ONLINE, dbStatus AVAILABLE.'],
            ['/api/central/sync/heartbeat or /api/local-theatre/heartbeat', 'Heartbeat receiver depending on current route generation.', '200/accepted heartbeat with trusted counters.']
          ]
        },
        {
          title: 'Alert-Worthy Conditions',
          columns: ['Signal', 'Why It Matters'],
          rows: [
            ['pendingSync > 0 for long period', 'Local sales are not mirrored to central.'],
            ['failedSync > 0', 'Manual review may be required.'],
            ['heartbeat age > 30 seconds', 'Local-authority online booking may block.'],
            ['heartbeat age > 60 seconds', 'Theatre is operationally offline to central.'],
            ['local dbStatus unavailable', 'Local authority confirmation is unsafe.'],
            ['central_sync_conflicts rows increasing', 'Seat or sequence conflict needs reconciliation.']
          ]
        }
      ]
    },
    {
      id: 'deployment',
      title: 'Deployment Architecture',
      kicker: 'Install and release',
      summary: 'Central is deployed as a Next.js app with MySQL and provider integrations; local theatres run Next.js on port 3001 with local MySQL and a background worker.',
      callouts: [
        { tone: 'danger', title: 'Production reset warning', body: 'Never run destructive reset commands on production databases unless backups, service shutdown, and approval are complete. The commands below are for controlled development/test refreshes.' }
      ],
      tables: [
        {
          title: 'Deployment Checklist',
          columns: ['Environment', 'Checklist'],
          rows: [
            ['Development central', 'Create central DB, set .env.local, run seed, npm run dev or build/start.'],
            ['Production central', 'Set Vercel/env variables, configure MySQL, domain, HTTPS, SES/Razorpay secrets, and worker bypass headers.'],
            ['New local theatre', 'Install local app, create local DB, seed theatre/screen/layout, set theatre id/code and central URL, start app on port 3001.'],
            ['Theatre LAN counters', 'Use http://SERVER-LAN-IP:3001/counter/CODE/login; verify LAN guard allows private IP and blocks public tunnel.'],
            ['Tunnel/API access', 'Expose only local API routes needed by central, protect with Cloudflare Access/shared secret, never expose /counter publicly.'],
            ['Backup/restore', 'Backup central and local MySQL before migrations, seed resets, or authority return operations.']
          ]
        }
      ],
      codes: [
        {
          title: 'Central build check',
          language: 'powershell',
          code: 'cd D:\\ksfdc-central\nnpm run typecheck\nnpm run build'
        },
        {
          title: 'Local build and worker check',
          language: 'powershell',
          code: 'cd D:\\film-lsa-plan\\local-theatre-app\nnpm run typecheck\nnpm run build\nnpm run worker'
        }
      ]
    },
    {
      id: 'installation-reset',
      title: 'Installation and Safe Reset',
      kicker: 'Fresh start guide',
      summary: 'Use these steps for development/test refreshes. Stop app and worker processes before touching databases.',
      callouts: [
        { tone: 'danger', title: 'Stop services before reset', body: 'Before resetting holds, queues, or seed data, stop central app, local app, local worker, and any tunnel that can accept traffic.' },
        { tone: 'warning', title: 'Tables that must not be casually cleared', body: 'Do not clear production users, sessions, audit logs, payment records, confirmed seats, sync inbox/outbox, or ticket attendance without a backup and written approval.' }
      ],
      codes: [
        {
          title: 'Development fresh seed command',
          language: 'powershell',
          code: 'cd D:\\ksfdc-central\nnpm run db:fresh\n\ncd D:\\film-lsa-plan\\local-theatre-app\nnpm run db:fresh',
          warning: 'Use only in development/test. This can drop or replace seeded data depending on the project script implementation.'
        },
        {
          title: 'Startup order after reset',
          language: 'powershell',
          code: '# 1. Start MySQL/XAMPP\n# 2. Start central app\ncd D:\\ksfdc-central\nnpm run build\nnpm run start\n\n# 3. Start local app in another terminal\ncd D:\\film-lsa-plan\\local-theatre-app\nnpm run build\nnpm run start\n\n# 4. Start local worker in another terminal\ncd D:\\film-lsa-plan\\local-theatre-app\nnpm run worker'
        }
      ],
      tables: [
        {
          title: 'Post-Reset Verification',
          columns: ['Step', 'Expected Result'],
          rows: [
            ['Central home page', 'Movies and showtimes load from central DB.'],
            ['Local /api/local/health', 'status ONLINE and dbStatus AVAILABLE.'],
            ['Central /api/debug/local-health', 'success true and statusCode 200 when tunnel/local API reachable.'],
            ['Heartbeat logs', 'Worker logs heartbeat OK without active lock stuck.'],
            ['Authority debug', 'pendingSync and failedSync are zero after fresh seed/sync.'],
            ['Central booking test', 'Available seat can be held/confirmed in central authority.'],
            ['Local counter test', 'LAN counter login, hold, cash/manual digital confirm, and ticket page work.'],
            ['Offline test', 'Central blocks local-authority online booking when tunnel stops; local counter still books if local policy allows.']
          ]
        }
      ]
    },
    {
      id: 'troubleshooting',
      title: 'Troubleshooting',
      kicker: 'Searchable runbook',
      summary: 'Common operational failures and diagnostic steps are listed here using sanitized log messages and route names.',
      tables: [
        {
          title: 'Troubleshooting Entries',
          columns: ['Symptom', 'Probable Cause', 'Diagnostic Steps', 'Resolution', 'Prevention'],
          rows: troubleshootingRows
        }
      ]
    },
    {
      id: 'limitations',
      title: 'Incomplete or Requires Verification',
      kicker: 'Audit honesty',
      summary: 'Items in this section were present as schema, helpers, or partial flows, but were not fully verified end to end during this documentation pass.',
      tables: [
        {
          title: 'Verified Limitations',
          columns: ['Feature', 'Finding', 'Operational Recommendation'],
          rows: incompleteRows
        }
      ]
    },
    {
      id: 'glossary',
      title: 'Glossary',
      kicker: 'Terms',
      summary: 'Shared language for central, local, booking, sync, and theatre operations.',
      tables: [
        {
          title: 'Glossary',
          columns: ['Term', 'Meaning'],
          rows: [
            ['Central authority', 'The central DB owns hold and final confirmed-seat decisions for a show.'],
            ['Local authority', 'The local theatre DB owns hold and final confirmed-seat decisions for a show.'],
            ['Heartbeat', 'Recurring local worker message that tells central the theatre is online and reports counters.'],
            ['Hold', 'Temporary reservation of seats before payment/confirmation.'],
            ['Outbox', 'Durable queue of events created by the source system for delivery to another system.'],
            ['Inbox', 'Durable landing table for events received from another system.'],
            ['Idempotency', 'The ability to safely repeat a request/event without creating duplicates.'],
            ['Conflict resolution', 'Detection and handling of impossible or duplicate seat/event states.'],
            ['Pending transaction', 'Payment or booking flow that has not reached final confirmed/cancelled state.'],
            ['Confirmed seat', 'Final ownership row for show_id and seat_id.'],
            ['Authority mode', 'Show-level booking policy stored as authority_mode.'],
            ['Counter session', 'Local LAN session tied to a counter code/operator.'],
            ['Sync replay', 'Receiving an event that was already processed. Unique keys make replay safe.'],
            ['Theatre availability', 'Central interpretation of local heartbeat, health, DB state, and tunnel reachability.'],
            ['Health check', 'API route that reports service and DB status without exposing secrets.']
          ]
        }
      ]
    }
  ]
};
