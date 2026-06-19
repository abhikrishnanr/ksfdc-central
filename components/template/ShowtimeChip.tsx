import Link from 'next/link';

export default function ShowtimeChip({ href, label, status, note }: { href: string; label: string; status?: string; note?: string | null }) {
  if (status) {
    return <span className="showtime-chip disabled" aria-disabled="true">{label}{note ? <em>{note}</em> : null}<small>{status}</small></span>;
  }

  return <Link className="showtime-chip" href={href} prefetch>{label}{note ? <em>{note}</em> : null}</Link>;
}
