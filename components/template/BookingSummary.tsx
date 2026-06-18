import ZoneSummary, { type ZoneGroup } from './ZoneSummary';

export default function BookingSummary({ groups, total, count }: { groups: ZoneGroup[]; total: number; count: number }) {
  return (
    <div className="grid gap-4">
      <ZoneSummary groups={groups} />
      <div className="metric-strip">
        <div className="metric-tile"><strong>{count}</strong><span>Tickets</span></div>
        <div className="metric-tile"><strong>INR {total}</strong><span>Total amount</span></div>
      </div>
    </div>
  );
}
