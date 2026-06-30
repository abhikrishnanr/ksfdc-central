'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const WARM_ROUTES = ['/', '/movies', '/shows', '/theatres'];

export default function NavigationWarmup() {
  const router = useRouter();

  useEffect(() => {
    const warm = () => WARM_ROUTES.forEach((route) => router.prefetch(route));
    const idleWindow = window as Window & { requestIdleCallback?: (callback: () => void) => number; cancelIdleCallback?: (id: number) => void };
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(warm);
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const id = window.requestAnimationFrame(warm);
    return () => window.cancelAnimationFrame(id);
  }, [router]);

  return null;
}
