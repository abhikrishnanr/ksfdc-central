import type { ReactNode } from 'react';

export default function SeatSelectionLayout({ children }: { children: ReactNode }) {
  return <section className="public-seat-selection-layout">{children}</section>;
}
