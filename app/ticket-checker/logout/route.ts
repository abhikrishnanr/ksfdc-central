import { NextResponse } from 'next/server';
import { logoutTicketChecker } from '../../../lib/ticket-checker-auth';

export async function POST(request: Request) {
  await logoutTicketChecker();
  return NextResponse.redirect(new URL('/ticket-checker/login?loggedOut=1', request.url), 303);
}

