export type ZoneGroup = { zone: string; seats: string[]; count: number; subtotal: number; unit: number };

export default function ZoneSummary({ groups }: { groups: ZoneGroup[] }) {
  if (!groups.length) return <p>No seats selected.</p>;
  return (
    <div className="grid gap-3">
      {groups.map((group) => (
        <div className="metric-tile" key={group.zone}>
          <strong>{group.zone}</strong>
          <span>{group.seats.join(', ')}</span>
          <span>{group.count} ticket(s) x INR {group.unit} = INR {group.subtotal}</span>
        </div>
      ))}
    </div>
  );
}
