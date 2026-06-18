import type { AuthorityMode } from './types';

export function normalizeAuthorityMode(value: unknown): AuthorityMode {
  if (typeof value !== 'string') return 'CENTRAL_AUTHORITY';

  const normalized = value.trim().toUpperCase();
  if (normalized === 'CENTRAL') return 'CENTRAL_AUTHORITY';
  if (normalized === 'LOCAL') return 'LOCAL_AUTHORITY_ONLINE';

  if (
    normalized === 'CENTRAL_AUTHORITY' ||
    normalized === 'LOCAL_AUTHORITY_ONLINE' ||
    normalized === 'LOCAL_AUTHORITY_OFFLINE' ||
    normalized === 'LOCAL_AUTHORITY_COUNTER_ONLY' ||
    normalized === 'LOCAL_SYNCING' ||
    normalized === 'RETURNING_TO_CENTRAL' ||
    normalized === 'SALES_CLOSED'
  ) {
    return normalized;
  }

  return 'CENTRAL_AUTHORITY';
}
