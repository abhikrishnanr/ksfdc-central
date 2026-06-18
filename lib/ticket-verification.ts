import { createHash, timingSafeEqual } from 'crypto';

export function createTicketVerificationToken(bookingId: string, showId: string) {
  return createHash('sha256')
    .update(`${bookingId}:${showId}:${process.env.TICKET_VERIFY_SECRET ?? 'dev-ticket-verify-secret'}`)
    .digest('hex')
    .slice(0, 24);
}

export function ticketVerificationTokenMatches(value: string, bookingId: string, showId: string) {
  const expected = createTicketVerificationToken(bookingId, showId);
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

