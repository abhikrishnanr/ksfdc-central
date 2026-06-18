import Link from 'next/link';

export default function ShowtimeChip({ href, label, status }: { href: string; label: string; status?: string }) {
  return <Link className="showtime-chip" href={href} prefetch>{label}{status ? <small>{status}</small> : null}</Link>;
}
