import type { ReactNode } from 'react';
import type { ZoneGroup } from './ZoneSummary';

export default function BookingSummaryBar({
  groups,
  total,
  count,
  holdLabel,
  disabled,
  pending,
  message,
  children,
  onProceed
}: {
  groups: ZoneGroup[];
  total: number;
  count: number;
  holdLabel: string | null;
  disabled: boolean;
  pending: boolean;
  message?: string | null;
  children?: ReactNode;
  onProceed: () => void;
}) {
  return (
    <aside className="booking-summary-bar">
      <div className="selected-zone-summary">
        <strong>{holdLabel ? `Seats held for ${holdLabel}` : count ? `${count} ticket(s) selected` : 'Select seats'}</strong>
        <span>{groups.length ? groups.map((group) => `${group.zone}: ${group.seats.join(', ')}`).join(' | ') : 'Choose available seats from the map.'}</span>
      </div>
      <div className="selected-total">
        <span>Total</span>
        <strong>INR {total}</strong>
      </div>
      {children}
      <button type="button" disabled={disabled} onClick={onProceed} className="action-button primary">
        {pending ? 'Processing...' : count ? 'Proceed to payment' : 'Choose seats'}
      </button>
      {message ? <p aria-live="polite">{message}</p> : null}
    </aside>
  );
}
