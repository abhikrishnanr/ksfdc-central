'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function PublicFooter() {
  const pathname = usePathname();
  if (pathname.startsWith('/admin') || pathname.startsWith('/official')) return null;

  return (
    <footer className="public-footer">
      <span>© 2026 KSFDC. All Rights Reserved.</span>
      <nav aria-label="Footer navigation">
        <Link href="/terms">Terms & Conditions</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/refund">Refund Policy</Link>
        <Link href="/contact">Contact Us</Link>
      </nav>
      <div className="social-placeholders" aria-label="Social links">
        <span>f</span>
        <span>ig</span>
        <span>yt</span>
        <span>x</span>
      </div>
    </footer>
  );
}
