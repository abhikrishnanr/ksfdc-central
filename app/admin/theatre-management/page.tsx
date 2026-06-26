export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ActionButton, EmptyState, MetricTile, PageHeader, PremiumCard, StatusBadge } from '../../../components/premium-ui';
import { requireCentralRole } from '../../../lib/auth';
import { listAdminManagementData, SCHEDULING_AUTHORITY_LABELS, SHOW_SCHEDULING_AUTHORITY_MODES } from '../../../lib/admin-management';
import {
  cancelShowAction,
  createScreenAction,
  createSeatMapVersionAction,
  createShowAction,
  createTheatreAction,
  updateShowAction,
  updateTheatreAction
} from './actions';

function toneForStatus(status: string) {
  if (status === 'ACTIVE' || status === 'OPEN' || status === 'SCHEDULED') return 'good' as const;
  if (status === 'CANCELLED' || status === 'DISABLED') return 'bad' as const;
  if (status === 'RESCHEDULED') return 'warn' as const;
  return 'neutral' as const;
}

function toneForAuthority(mode: string) {
  if (mode === 'CENTRAL_AUTHORITY') return 'good' as const;
  if (mode === 'LOCAL_AUTHORITY_ONLINE') return 'warn' as const;
  return 'violet' as const;
}

function dateValue(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function timeValue(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(11, 16);
}

function Field({ label, name, defaultValue, type = 'text', required = false }: { label: string; name: string; defaultValue?: string | number | null; type?: string; required?: boolean }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <input name={name} type={type} required={required} defaultValue={defaultValue ?? ''} />
    </label>
  );
}

function TheatreOptions({ theatres }: { theatres: Array<Record<string, unknown>> }) {
  return theatres.map((theatre) => <option key={String(theatre.id)} value={String(theatre.id)}>{String(theatre.name)} - {String(theatre.city)}</option>);
}

function ScreenOptions({ screens }: { screens: Array<Record<string, unknown>> }) {
  return screens.map((screen) => <option key={String(screen.id)} value={String(screen.id)}>{String(screen.theatreName)} / {String(screen.name)}</option>);
}

function MovieOptions({ movies }: { movies: Array<Record<string, unknown>> }) {
  return movies.filter((movie) => String(movie.status) === 'ACTIVE').map((movie) => <option key={String(movie.id)} value={String(movie.id)}>{String(movie.title)}</option>);
}

export default async function TheatreManagementPage() {
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
  const data = await listAdminManagementData(session.theatreId);
  const scopedTheatres = data.theatres as Array<Record<string, unknown>>;
  const screens = data.screens as Array<Record<string, unknown>>;
  const movies = data.movies as Array<Record<string, unknown>>;
  const shows = data.shows as Array<Record<string, unknown>>;

  return (
    <section className="grid" style={{ gap: 24 }}>
      <PageHeader
        eyebrow="Dynamic scheduling"
        title="Theatres, screens, seat maps, and shows"
        description="Database-backed administration with seat-map versioning, overlap checks, local-authority safety gates, schedule sync events, notifications, refunds, and audit history."
        actions={(
          <>
            {session.role === 'SUPER_ADMIN' ? <ActionButton href="/admin/movie-management" variant="primary">Movie management</ActionButton> : null}
            <ActionButton href="/admin/seat-layouts">Seat layouts</ActionButton>
            <ActionButton href="/admin/sync-monitor">Sync monitor</ActionButton>
          </>
        )}
      />

      <section className="grid auto">
        <MetricTile label="Theatres" value={scopedTheatres.length} />
        <MetricTile label="Screens" value={screens.length} />
        <MetricTile label="Movies" value={movies.length} />
        <MetricTile label="Recent shows" value={shows.length} />
      </section>

      <section className="grid two">
        {session.role === 'SUPER_ADMIN' ? (
          <PremiumCard>
            <p className="eyebrow">Create theatre</p>
            <h2>Preserve theatre IDs and codes</h2>
            <form className="admin-form" action={createTheatreAction}>
              <Field label="Theatre ID" name="id" />
              <Field label="Code" name="code" required />
              <Field label="Name" name="name" required />
              <Field label="City" name="city" required />
              <Field label="Phone" name="contactPhone" />
              <Field label="Timezone" name="timezone" defaultValue="Asia/Kolkata" />
              <label className="admin-field wide"><span>Address</span><textarea name="address" rows={3} /></label>
              <button className="action-button primary" type="submit">Create theatre</button>
            </form>
          </PremiumCard>
        ) : null}

        <PremiumCard>
          <p className="eyebrow">Screen and seat map</p>
          <h2>Create screen from JSON</h2>
          <form className="admin-form" action={createScreenAction}>
            <label className="admin-field">
              <span>Theatre</span>
              <select name="theatreId" required><TheatreOptions theatres={scopedTheatres} /></select>
            </label>
            <Field label="Screen ID" name="id" />
            <Field label="Screen code" name="code" required />
            <Field label="Screen name" name="name" required />
            <Field label="Layout name" name="layoutName" />
            <Field label="Source file name" name="sourceFilename" />
            <label className="admin-field wide">
              <span>Seat-map JSON</span>
              <textarea name="seatMapJson" rows={10} required placeholder='{"name":"Screen 1","rows":[{"rowLabel":"A","cells":[{"seatId":"A1","seatNumber":"1","zone":"SILVER"}]}]}' />
            </label>
            <button className="action-button primary" type="submit">Validate and create screen</button>
          </form>
        </PremiumCard>
      </section>

      <PremiumCard>
        <p className="eyebrow">Show scheduling</p>
        <h2>Create a database-backed show</h2>
        <form className="admin-form admin-form-wide" action={createShowAction}>
          <label className="admin-field"><span>Theatre</span><select name="theatreId" required><TheatreOptions theatres={scopedTheatres} /></select></label>
          <label className="admin-field"><span>Screen</span><select name="screenId" required><ScreenOptions screens={screens} /></select></label>
          <label className="admin-field"><span>Movie</span><select name="movieId" required><MovieOptions movies={movies} /></select></label>
          <Field label="Show ID" name="id" />
          <Field label="Date" name="showDate" type="date" required />
          <Field label="Start time" name="showTime" type="time" required />
          <Field label="Duration minutes" name="durationMinutes" type="number" />
          <Field label="Cleaning buffer minutes" name="cleaningBufferMinutes" type="number" defaultValue={20} />
          <label className="admin-field">
            <span>Authority</span>
            <select name="authorityMode" required>
              {SHOW_SCHEDULING_AUTHORITY_MODES.map((mode) => <option key={mode} value={mode}>{SCHEDULING_AUTHORITY_LABELS[mode]}</option>)}
            </select>
          </label>
          <label className="admin-field"><span>Status</span><select name="status"><option value="OPEN">Open</option><option value="SCHEDULED">Scheduled</option></select></label>
          <Field label="Booking opens at" name="bookingOpensAt" type="datetime-local" />
          <Field label="Booking closes at" name="bookingClosesAt" type="datetime-local" />
          <label className="admin-field wide"><span>Prices, one per line: ZONE=AMOUNT</span><textarea name="prices" rows={4} required placeholder={'SILVER=160\nGOLD=220'} /></label>
          <button className="action-button primary" type="submit">Create show</button>
        </form>
      </PremiumCard>

      <section className="grid two">
        <PremiumCard>
          <p className="eyebrow">Theatres</p>
          <h2>Enable, disable, and edit</h2>
          <div className="grid" style={{ marginTop: 16 }}>
            {scopedTheatres.map((theatre) => (
              <article className="metric-tile" key={String(theatre.id)}>
                <div className="meta-row" style={{ justifyContent: 'space-between' }}>
                  <strong>{String(theatre.name)}</strong>
                  <StatusBadge tone={toneForStatus(String(theatre.status))}>{String(theatre.status)}</StatusBadge>
                </div>
                <p>{String(theatre.id)} / {String(theatre.code)} / {String(theatre.city)}</p>
                <form className="admin-form compact" action={updateTheatreAction}>
                  <input type="hidden" name="id" value={String(theatre.id)} />
                  <Field label="Name" name="name" defaultValue={String(theatre.name)} required />
                  <Field label="City" name="city" defaultValue={String(theatre.city)} required />
                  <Field label="Phone" name="contactPhone" defaultValue={String(theatre.contactPhone ?? '')} />
                  <Field label="Timezone" name="timezone" defaultValue="Asia/Kolkata" />
                  <label className="admin-inline"><input name="enabled" type="checkbox" defaultChecked={String(theatre.status) === 'ACTIVE'} /> Enabled</label>
                  <button className="action-button" type="submit">Save theatre</button>
                </form>
              </article>
            ))}
          </div>
        </PremiumCard>

        <PremiumCard>
          <p className="eyebrow">Seat-map versions</p>
          <h2>Replace active layout safely</h2>
          <form className="admin-form" action={createSeatMapVersionAction}>
            <label className="admin-field">
              <span>Screen</span>
              <select name="screenId" required><ScreenOptions screens={screens} /></select>
            </label>
            <Field label="Layout name" name="layoutName" />
            <Field label="Source file name" name="sourceFilename" />
            <label className="admin-field wide"><span>Seat-map JSON</span><textarea name="seatMapJson" rows={10} required /></label>
            <button className="action-button primary" type="submit">Create new seat-map version</button>
          </form>
          <div className="grid" style={{ marginTop: 16 }}>
            {screens.map((screen) => (
              <article className="metric-tile" key={String(screen.id)}>
                <strong>{String(screen.theatreName)} / {String(screen.name)}</strong>
                <p>{String(screen.id)} - Layout {String(screen.activeLayoutId ?? 'none')} v{String(screen.activeLayoutVersion ?? '-')}</p>
                <div className="meta-row">
                  <StatusBadge tone={toneForStatus(String(screen.status))}>{String(screen.status)}</StatusBadge>
                  <StatusBadge tone="info">{String(screen.activeSeatCount ?? screen.capacity ?? 0)} seats</StatusBadge>
                </div>
              </article>
            ))}
          </div>
        </PremiumCard>
      </section>

      <PremiumCard>
        <div className="meta-row" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="eyebrow">Scheduled shows</p>
            <h2>Edit, reschedule, or cancel</h2>
          </div>
          <StatusBadge tone="warn">Reason required after booking</StatusBadge>
        </div>
        {!shows.length ? <EmptyState title="No shows"><p>Create a show above to begin database-driven scheduling.</p></EmptyState> : null}
        <div className="grid" style={{ marginTop: 16 }}>
          {shows.map((show) => (
            <article className="metric-tile" key={String(show.id)}>
              <div className="meta-row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{String(show.movieTitle)}</strong>
                  <p>{String(show.theatreName)} / {String(show.screenName)} / {new Date(String(show.showTime)).toLocaleString('en-IN')}</p>
                </div>
                <div className="meta-row">
                  <StatusBadge tone={toneForAuthority(String(show.authorityMode))}>{String(show.authorityMode)}</StatusBadge>
                  <StatusBadge tone={toneForStatus(String(show.status))}>{String(show.status)}</StatusBadge>
                  {Number(show.pendingScheduleSync ?? 0) > 0 ? <StatusBadge tone="warn">Pending local sync</StatusBadge> : null}
                </div>
              </div>
              <div className="metric-strip">
                <MetricTile label="Bookings" value={String(show.bookingCount ?? 0)} />
                <MetricTile label="Tickets" value={String(show.ticketCount ?? 0)} />
                <MetricTile label="Show ID" value={String(show.id)} />
              </div>
              <form className="admin-form admin-form-wide" action={updateShowAction}>
                <input type="hidden" name="showId" value={String(show.id)} />
                <Field label="New date" name="showDate" type="date" defaultValue={dateValue(show.showTime)} required />
                <Field label="New start time" name="showTime" type="time" defaultValue={timeValue(show.showTime)} required />
                <Field label="Cleaning buffer" name="cleaningBufferMinutes" type="number" defaultValue={20} />
                <label className="admin-field">
                  <span>Authority</span>
                  <select name="authorityMode" defaultValue={String(show.authorityMode)}>
                    {SHOW_SCHEDULING_AUTHORITY_MODES.map((mode) => <option key={mode} value={mode}>{SCHEDULING_AUTHORITY_LABELS[mode]}</option>)}
                  </select>
                </label>
                <label className="admin-field wide"><span>Reschedule reason</span><textarea name="reason" rows={2} placeholder="Required when bookings, holds, payments, or local sales exist." /></label>
                <label className="admin-inline"><input type="checkbox" name="confirmReschedule" /> Confirm reschedule if bookings are affected</label>
                <button className="action-button" type="submit">Save show change</button>
              </form>
              <form className="admin-form compact danger-form" action={cancelShowAction}>
                <input type="hidden" name="showId" value={String(show.id)} />
                <label className="admin-field wide"><span>Cancellation reason</span><textarea name="reason" rows={2} required /></label>
                <label className="admin-inline"><input type="checkbox" name="confirmCancellation" required /> I understand bookings, refunds, and local sync will be affected</label>
                <button className="action-button warn" type="submit">Cancel show</button>
              </form>
            </article>
          ))}
        </div>
      </PremiumCard>

      <p className="muted-note">Schedule metadata changes are written to an idempotent outbox for local acknowledgement. Local-authority show edits are blocked server-side when heartbeat or local sync is unsafe.</p>
    </section>
  );
}
