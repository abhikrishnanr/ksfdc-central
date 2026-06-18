import { requireTicketCheckerSession } from '../../lib/ticket-checker-auth';
import { getTicketCheckerTheatres } from '../../lib/ticket-checker';
import TicketCheckerConsole from './TicketCheckerConsole';

export const dynamic = 'force-dynamic';

export default async function TicketCheckerPage() {
  const session = await requireTicketCheckerSession();
  const theatres = await getTicketCheckerTheatres(session.theatreId);
  return <TicketCheckerConsole session={{ displayName: session.displayName, username: session.username }} theatres={theatres} />;
}

