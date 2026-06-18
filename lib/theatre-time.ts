const KERALA_OFFSET = '+05:30';

export function theatreDateTimeIso(value: unknown) {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (match) return `${match[1]}T${match[2]}${KERALA_OFFSET}`;
  return new Date(text).toISOString();
}

export function formatTheatreDateTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  }).format(new Date(value));
}

