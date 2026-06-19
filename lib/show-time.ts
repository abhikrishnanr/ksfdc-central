export const MIDNIGHT_SHOW_HOUR = 23;
export const MIDNIGHT_SHOW_MINUTE = 59;

export function isMidnightShow(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Kolkata'
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === 'hour')?.value) === MIDNIGHT_SHOW_HOUR
    && Number(parts.find((part) => part.type === 'minute')?.value) === MIDNIGHT_SHOW_MINUTE;
}

export function midnightShowNote(value: string | Date) {
  return isMidnightShow(value) ? 'MIDNIGHT SHOW - continues after midnight' : null;
}
