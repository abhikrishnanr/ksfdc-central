import type { ReactNode } from 'react';

export default function SeatMap({ children }: { children: ReactNode }) {
  return <div className="seat-map-stage">{children}</div>;
}
