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

type Row = Record<string, unknown>;
type TabKey = 'overview' | 'theatres' | 'screens' | 'scheduling';

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
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

function timeValue(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

function formatShowTime(value: unknown) {
  if (!value) return 'Not scheduled';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function Field({ label, name, defaultValue, type = 'text', required = false }: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <input name={name} type={type} required={required} defaultValue={defaultValue ?? ''} />
    </label>
  );
}

function TheatreOptions({ theatres }: { theatres: Row[] }) {
  return theatres.map((theatre) => (
    <option key={String(theatre.id)} value={String(theatre.id)}>
      {String(theatre.name)} · {String(theatre.city)}
    </option>
  ));
}

function ScreenOptions({ screens }: { screens: Row[] }) {
  return screens.map((screen) => (
    <option key={String(screen.id)} value={String(screen.id)}>
      {String(screen.theatreName)} · {String(screen.name)}
    </option>
  ));
}

function MovieOptions({ movies }: { movies: Row[] }) {
  return movies
    .filter((movie) => String(movie.status) === 'ACTIVE')
    .map((movie) => <option key={String(movie.id)} value={String(movie.id)}>{String(movie.title)}</option>);
}

function TabLink({ tab, active, children }: { tab: TabKey; active: TabKey; children: React.ReactNode }) {
  return (
    <Link
      href={`/admin/theatre-management?tab=${tab}`}
      className={`action-button${active === tab ? ' primary' : ''}`}
      aria-current={active === tab ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {description ? <p className="muted-note" style={{ marginTop: 6 }}>{description}</p> : null}
    </div>
  );
}

export default async function TheatreManagementPage({
  searchParams
}: {
  searchParams?: Promise<{ tab?: string; editShow?: string; editTheatre?: string }>;
}) {
  const params = await searchParams;
  const allowedTabs: TabKey[] = ['overview', 'theatres', 'screens', 'scheduling'];
  const activeTab = allowedTabs.includes(params?.tab as TabKey) ? params?.tab as TabKey : 'overview';

  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN']);
  const data = await listAdminManagementData(session.theatreId);
  const theatres = data.theatres as Row[];
  const screens = data.screens as Row[];
  const movies = data.movies as Row[];
  const shows = data.shows as Row[];

  const selectedShow = shows.find((show) => String(show.id) === params?.editShow);
  const selectedTheatre = theatres.find((theatre) => String(theatre.id) === params?.editTheatre);
  const activeShows = shows.filter((show) => !['CANCELLED', 'COMPLETED'].includes(String(show.status)));
  const syncPending = shows.filter((show) => Number(show.pendingScheduleSync ?? 0) > 0).length;
  const bookedShows = shows.filter((show) => Number(show.bookingCount ?? 0) > 0 || Number(show.ticketCount ?? 0) > 0).length;

  return (
    <section className="grid" style={{ gap: 22 }}>
      <PageHeader
        eyebrow="Theatre operations"
        title="Theatre management dashboard"
        description="Manage theatre masters, screens, seat-map versions, and show schedules through focused operational workspaces."
        actions={(
          <>
            {session.role === 'SUPER_ADMIN' ? <ActionButton href="/admin/movie-management" variant="primary">Movies</ActionButton> : null}
            <ActionButton href="/admin/seat-layouts">Seat layouts</ActionButton>
            <ActionButton href="/admin/sync-monitor">Sync monitor</ActionButton>
          </>
        )}
      />

      <PremiumCard>
        <nav className="meta-row" aria-label="Theatre management sections" style={{ gap: 10, flexWrap: 'wrap' }}>
          <TabLink tab="overview" active={activeTab}>Overview</TabLink>
          <TabLink tab="theatres" active={activeTab}>Theatres</TabLink>
          <TabLink tab="screens" active={activeTab}>Screens & seat maps</TabLink>
          <TabLink tab="scheduling" active={activeTab}>Show scheduling</TabLink>
        </nav>
      </PremiumCard>

      {activeTab === 'overview' ? (
        <>
          <section className="grid auto">
            <MetricTile label="Theatres" value={theatres.length} />
            <MetricTile label="Screens" value={screens.length} />
            <MetricTile label="Active shows" value={activeShows.length} />
            <MetricTile label="Awaiting local sync" value={syncPending} />
          </section>

          <section className="grid two">
            <PremiumCard>
              <SectionHeading eyebrow="Operational health" title="Scheduling snapshot" />
              <div className="grid auto">
                <MetricTile label="Movies available" value={movies.filter((movie) => String(movie.status) === 'ACTIVE').length} />
                <MetricTile label="Shows with bookings" value={bookedShows} />
                <MetricTile label="Cancelled shows" value={shows.filter((show) => String(show.status) === 'CANCELLED').length} />
              </div>
              <div className="meta-row" style={{ marginTop: 18, flexWrap: 'wrap' }}>
                <ActionButton href="/admin/theatre-management?tab=scheduling" variant="primary">Schedule a show</ActionButton>
                <ActionButton href="/admin/theatre-management?tab=screens">Manage layouts</ActionButton>
              </div>
            </PremiumCard>

            <PremiumCard>
              <SectionHeading eyebrow="Attention required" title="Exceptions and safeguards" />
              <div className="grid" style={{ gap: 12 }}>
                <article className="metric-tile">
                  <div className="meta-row" style={{ justifyContent: 'space-between' }}>
                    <strong>Pending local acknowledgements</strong>
                    <StatusBadge tone={syncPending ? 'warn' : 'good'}>{syncPending}</StatusBadge>
                  </div>
                  <p>Schedule changes remain visible here until the local theatre confirms synchronization.</p>
                </article>
                <article className="metric-tile">
                  <div className="meta-row" style={{ justifyContent: 'space-between' }}>
                    <strong>Booked shows</strong>
                    <StatusBadge tone={bookedShows ? 'warn' : 'neutral'}>{bookedShows}</StatusBadge>
                  </div>
                  <p>Rescheduling or cancellation requires an explicit reason and confirmation when bookings are affected.</p>
                </article>
              </div>
            </PremiumCard>
          </section>
        </>
      ) : null}

      {activeTab === 'theatres' ? (
        <section className="grid two">
          {session.role === 'SUPER_ADMIN' ? (
            <PremiumCard>
              <SectionHeading eyebrow="New master" title="Add theatre" description="Create a theatre once, then manage its screens separately." />
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
            <SectionHeading eyebrow="Theatre registry" title={`${theatres.length} theatres`} description="Open a theatre only when you need to edit it." />
            {!theatres.length ? <EmptyState title="No theatres"><p>Add the first theatre to begin.</p></EmptyState> : null}
            <div className="grid" style={{ gap: 12 }}>
              {theatres.map((theatre) => {
                const isEditing = String(selectedTheatre?.id) === String(theatre.id);
                return (
                  <article className="metric-tile" key={String(theatre.id)}>
                    <div className="meta-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <strong>{String(theatre.name)}</strong>
                        <p>{String(theatre.code)} · {String(theatre.city)} · {String(theatre.id)}</p>
                      </div>
                      <div className="meta-row">
                        <StatusBadge tone={toneForStatus(String(theatre.status))}>{String(theatre.status)}</StatusBadge>
                        <Link className="action-button" href={`/admin/theatre-management?tab=theatres&editTheatre=${encodeURIComponent(String(theatre.id))}`}>
                          {isEditing ? 'Editing' : 'Edit'}
                        </Link>
                      </div>
                    </div>
                    {isEditing ? (
                      <form className="admin-form compact" action={updateTheatreAction} style={{ marginTop: 14 }}>
                        <input type="hidden" name="id" value={String(theatre.id)} />
                        <Field label="Name" name="name" defaultValue={String(theatre.name)} required />
                        <Field label="City" name="city" defaultValue={String(theatre.city)} required />
                        <Field label="Phone" name="contactPhone" defaultValue={String(theatre.contactPhone ?? '')} />
                        <Field label="Timezone" name="timezone" defaultValue={String(theatre.timezone ?? 'Asia/Kolkata')} />
                        <label className="admin-inline"><input name="enabled" type="checkbox" defaultChecked={String(theatre.status) === 'ACTIVE'} /> Enabled</label>
                        <div className="meta-row">
                          <button className="action-button primary" type="submit">Save changes</button>
                          <Link className="action-button" href="/admin/theatre-management?tab=theatres">Close</Link>
                        </div>
                      </form>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </PremiumCard>
        </section>
      ) : null}

      {activeTab === 'screens' ? (
        <section className="grid two">
          <PremiumCard>
            <SectionHeading eyebrow="Screen onboarding" title="Create screen from seat-map JSON" description="The JSON is validated before the screen and first layout version are created." />
            <form className="admin-form" action={createScreenAction}>
              <label className="admin-field"><span>Theatre</span><select name="theatreId" required><TheatreOptions theatres={theatres} /></select></label>
              <Field label="Screen ID" name="id" />
              <Field label="Screen code" name="code" required />
              <Field label="Screen name" name="name" required />
              <Field label="Layout name" name="layoutName" />
              <Field label="Source file name" name="sourceFilename" />
              <label className="admin-field wide">
                <span>Seat-map JSON</span>
                <textarea name="seatMapJson" rows={11} required placeholder='{"name":"Screen 1","rows":[{"rowLabel":"A","cells":[{"seatId":"A1","seatNumber":"1","zone":"SILVER"}]}]}' />
              </label>
              <button className="action-button primary" type="submit">Validate and create screen</button>
            </form>
          </PremiumCard>

          <PremiumCard>
            <SectionHeading eyebrow="Version control" title="Publish a new seat-map version" description="Existing layouts remain in history; the new version becomes active after validation." />
            <form className="admin-form" action={createSeatMapVersionAction}>
              <label className="admin-field"><span>Screen</span><select name="screenId" required><ScreenOptions screens={screens} /></select></label>
              <Field label="Layout name" name="layoutName" />
              <Field label="Source file name" name="sourceFilename" />
              <label className="admin-field wide"><span>Seat-map JSON</span><textarea name="seatMapJson" rows={11} required /></label>
              <button className="action-button primary" type="submit">Create layout version</button>
            </form>
          </PremiumCard>

          <PremiumCard>
            <SectionHeading eyebrow="Screen registry" title={`${screens.length} screens`} />
            <div className="grid" style={{ gap: 12 }}>
              {screens.map((screen) => (
                <article className="metric-tile" key={String(screen.id)}>
                  <div className="meta-row" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <strong>{String(screen.theatreName)} · {String(screen.name)}</strong>
                      <p>{String(screen.code ?? screen.id)} · Layout v{String(screen.activeLayoutVersion ?? '—')}</p>
                    </div>
                    <div className="meta-row">
                      <StatusBadge tone={toneForStatus(String(screen.status))}>{String(screen.status)}</StatusBadge>
                      <StatusBadge tone="info">{String(screen.activeSeatCount ?? screen.capacity ?? 0)} seats</StatusBadge>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </PremiumCard>
        </section>
      ) : null}

      {activeTab === 'scheduling' ? (
        <>
          <PremiumCard>
            <SectionHeading eyebrow="New schedule" title="Create show" description="Screen overlap, booking windows, authority mode, and local safety rules are validated server-side." />
            <form className="admin-form admin-form-wide" action={createShowAction}>
              <label className="admin-field"><span>Theatre</span><select name="theatreId" required><TheatreOptions theatres={theatres} /></select></label>
              <label className="admin-field"><span>Screen</span><select name="screenId" required><ScreenOptions screens={screens} /></select></label>
              <label className="admin-field"><span>Movie</span><select name="movieId" required><MovieOptions movies={movies} /></select></label>
              <Field label="Show ID" name="id" />
              <Field label="Date" name="showDate" type="date" required />
              <Field label="Start time" name="showTime" type="time" required />
              <Field label="Duration (minutes)" name="durationMinutes" type="number" />
              <Field label="Cleaning buffer" name="cleaningBufferMinutes" type="number" defaultValue={20} />
              <label className="admin-field">
                <span>Booking authority</span>
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

          <PremiumCard>
            <div className="meta-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <SectionHeading eyebrow="Schedule register" title={`${shows.length} recent shows`} description="Open one show at a time to reschedule or cancel it." />
              <StatusBadge tone="warn">Reason required when bookings exist</StatusBadge>
            </div>

            {!shows.length ? <EmptyState title="No shows"><p>Create a show above to begin scheduling.</p></EmptyState> : null}
            <div className="grid" style={{ gap: 12 }}>
              {shows.map((show) => {
                const isEditing = String(selectedShow?.id) === String(show.id);
                const hasBookings = Number(show.bookingCount ?? 0) > 0 || Number(show.ticketCount ?? 0) > 0;
                return (
                  <article className="metric-tile" key={String(show.id)}>
                    <div className="meta-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <strong>{String(show.movieTitle)}</strong>
                        <p>{String(show.theatreName)} · {String(show.screenName)} · {formatShowTime(show.showTime)}</p>
                        <p className="muted-note">Show ID: {String(show.id)} · {String(show.bookingCount ?? 0)} bookings · {String(show.ticketCount ?? 0)} tickets</p>
                      </div>
                      <div className="meta-row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <StatusBadge tone={toneForAuthority(String(show.authorityMode))}>{SCHEDULING_AUTHORITY_LABELS[String(show.authorityMode) as keyof typeof SCHEDULING_AUTHORITY_LABELS] ?? String(show.authorityMode)}</StatusBadge>
                        <StatusBadge tone={toneForStatus(String(show.status))}>{String(show.status)}</StatusBadge>
                        {Number(show.pendingScheduleSync ?? 0) > 0 ? <StatusBadge tone="warn">Pending sync</StatusBadge> : null}
                        <Link className="action-button" href={`/admin/theatre-management?tab=scheduling&editShow=${encodeURIComponent(String(show.id))}`}>
                          {isEditing ? 'Editing' : 'Manage'}
                        </Link>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="grid two" style={{ marginTop: 18 }}>
                        <form className="admin-form" action={updateShowAction}>
                          <input type="hidden" name="showId" value={String(show.id)} />
                          <p className="eyebrow">Reschedule existing show</p>
                          <Field label="New date" name="showDate" type="date" defaultValue={dateValue(show.showTime)} required />
                          <Field label="New start time" name="showTime" type="time" defaultValue={timeValue(show.showTime)} required />
                          <Field label="Cleaning buffer" name="cleaningBufferMinutes" type="number" defaultValue={Number(show.cleaningBufferMinutes ?? 20)} />
                          <label className="admin-field">
                            <span>Authority</span>
                            <select name="authorityMode" defaultValue={String(show.authorityMode)}>
                              {SHOW_SCHEDULING_AUTHORITY_MODES.map((mode) => <option key={mode} value={mode}>{SCHEDULING_AUTHORITY_LABELS[mode]}</option>)}
                            </select>
                          </label>
                          <label className="admin-field wide"><span>Reason</span><textarea name="reason" rows={3} required={hasBookings} placeholder="Explain why the show time or authority is changing." /></label>
                          {hasBookings ? <label className="admin-inline"><input type="checkbox" name="confirmReschedule" required /> Confirm notification and rescheduling of affected bookings</label> : null}
                          <div className="meta-row">
                            <button className="action-button primary" type="submit">Update this show</button>
                            <Link className="action-button" href="/admin/theatre-management?tab=scheduling">Close</Link>
                          </div>
                        </form>

                        <form className="admin-form danger-form" action={cancelShowAction}>
                          <input type="hidden" name="showId" value={String(show.id)} />
                          <p className="eyebrow">Cancel existing show</p>
                          <label className="admin-field wide"><span>Cancellation reason</span><textarea name="reason" rows={4} required /></label>
                          <label className="admin-inline"><input type="checkbox" name="confirmCancellation" required /> I understand that bookings, refunds, notifications, and local synchronization may be affected</label>
                          <button className="action-button warn" type="submit">Cancel this show</button>
                        </form>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </PremiumCard>
        </>
      ) : null}

      <p className="muted-note">All show edits target an existing show ID. Schedule changes are written to the synchronization outbox, and local-authority changes remain blocked when theatre connectivity is unsafe.</p>
    </section>
  );
}
