import type { CentralShowSummary } from './central-data';

export function getPublicShowStatus(show: Pick<CentralShowSummary, 'status' | 'availableSeats' | 'authorityMode' | 'bookingEnabled'>) {
  if (show.status !== 'OPEN') return { label: 'Booking closed', tone: 'bad' as const };
  if (show.bookingEnabled === false) return { label: 'Temporarily unavailable', tone: 'warn' as const };
  if (show.authorityMode === 'RETURNING_TO_CENTRAL' || show.authorityMode === 'LOCAL_SYNCING') {
    return { label: 'Temporarily unavailable', tone: 'warn' as const };
  }
  if (show.availableSeats <= 0) return { label: 'Sold out', tone: 'bad' as const };
  if (show.availableSeats <= 10) return { label: 'Few seats left', tone: 'warn' as const };
  return { label: 'Booking available', tone: 'good' as const };
}

export function formatPublicError(value: unknown) {
  const message = String(value ?? '');
  if (message.includes('SEAT_NOT_AVAILABLE')) return 'One or more selected seats are no longer available. Please choose again.';
  if (message.includes('Hold') && message.includes('expired')) return 'Your seat hold has expired. Please select seats again.';
  if (message.includes('RETURNING_TO_CENTRAL')) return 'Booking is temporarily unavailable for this show.';
  if (message.includes('authority') || message.includes('sync') || message.includes('LOCAL_')) return 'Booking is temporarily unavailable for this show.';
  return message || 'Something went wrong. Please try again.';
}
