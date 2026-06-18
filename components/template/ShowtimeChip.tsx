import Link from 'next/link';

export default function ShowtimeChip({ href, label, status }: { href: string; label: string; status?: string }) {
  if (status) {
    return <span className="showtime-chip disabled" aria-disabled="true">{label}<small>{status}</small></span>;
  }

  return <Link className="showtime-chip" href={href} prefetch>{label}</Link>;
}
