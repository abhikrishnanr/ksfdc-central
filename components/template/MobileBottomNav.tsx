'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { label: 'Home', href: '/', icon: '⌂' },
  { label: 'Movies', href: '/movies', icon: '▤' },
  { label: 'Bookings', href: '/profile/tickets', icon: '▱' },
  { label: 'Profile', href: '/profile', icon: '○' }
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith('/admin') || pathname.startsWith('/official')) return null;
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {items.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return <Link className={active ? 'active' : ''} key={item.href} href={item.href}><span>{item.icon}</span>{item.label}</Link>;
      })}
    </nav>
  );
}
