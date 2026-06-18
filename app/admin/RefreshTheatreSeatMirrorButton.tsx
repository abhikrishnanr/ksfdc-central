'use client';

import { useState, useTransition } from 'react';

export default function RefreshTheatreSeatMirrorButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refreshNow() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch('/api/sync/refresh-theatre-seat-mirror', { method: 'POST' });
      const payload = await response.json();
      setMessage(response.ok
        ? `Refresh complete. Pushed ${payload.pushed?.sent ?? 0} central event(s); mirrored ${payload.pulled?.mirroredSeats ?? 0} sold seat(s); latest local sequence received: ${payload.latestReceivedSequenceNo ?? 'none'}.`
        : payload.error ?? 'Mirror refresh failed.');
    });
  }

  return (
    <div>
      <button type="button" onClick={refreshNow} disabled={isPending} className="action-button primary">
        {isPending ? 'Refreshing mirror...' : 'Refresh theatre seat mirror'}
      </button>
      {message ? <p aria-live="polite">{message}</p> : null}
    </div>
  );
}
