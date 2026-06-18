import type { ReactNode } from 'react';

export default function ZoneSeatGroup({ name, price, children }: { name: string; price: number | null; children: ReactNode }) {
  return (
    <section className="zone-seat-group">
      <div className="zone-seat-heading">
        <h3>{price == null ? name : `INR ${price} ${name}`}</h3>
        <span>{price == null ? 'Price varies' : 'Per ticket'}</span>
      </div>
      {children}
    </section>
  );
}
