import type { ReactNode } from 'react';

export default function MovieDetailLayout({ children }: { children: ReactNode }) {
  return <section className="movie-detail-layout">{children}</section>;
}
