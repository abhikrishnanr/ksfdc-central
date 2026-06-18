export type AuthorityMode =
  | 'CENTRAL_AUTHORITY'
  | 'LOCAL_AUTHORITY_ONLINE'
  | 'LOCAL_AUTHORITY_OFFLINE'
  | 'LOCAL_AUTHORITY_COUNTER_ONLY'
  | 'LOCAL_SYNCING'
  | 'RETURNING_TO_CENTRAL'
  | 'SALES_CLOSED';

export type BookingChannel = 'PUBLIC' | 'AGENT' | 'COUNTER';

export interface Theatre {
  id: string;
  code: string;
  name: string;
  city: string;
}

export interface Show {
  id: string;
  movieId: string;
  theatreId: string;
  screenCode: string;
  startsAt: string;
  authorityMode: AuthorityMode;
}
