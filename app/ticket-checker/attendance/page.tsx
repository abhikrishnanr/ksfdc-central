import { requireTicketCheckerSession } from '../../../lib/ticket-checker-auth';
import { getTicketCheckerTheatres } from '../../../lib/ticket-checker';
import AttendanceSheet from '../AttendanceSheet';

export const dynamic = 'force-dynamic';

export default async function TicketAttendancePage() {
  const session = await requireTicketCheckerSession();
  const theatres = await getTicketCheckerTheatres(session.theatreId);
  return <AttendanceSheet theatres={theatres} />;
}

