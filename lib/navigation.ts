export type NavigationItem = {
  label: string;
  href: string;
};

export const publicGuestNavigation: NavigationItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Movies', href: '/movies' },
  { label: 'Showtimes', href: '/shows' },
  { label: 'Theatres', href: '/theatres' },
  { label: 'Events', href: '/shows' },
  { label: 'Cinema News', href: '/shows' },
  { label: 'About KSFDC', href: '/about' },
  { label: 'Sign in', href: '/profile' }
];

export const publicUserNavigation: NavigationItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Movies', href: '/movies' },
  { label: 'Showtimes', href: '/shows' },
  { label: 'Theatres', href: '/theatres' },
  { label: 'Events', href: '/shows' },
  { label: 'Cinema News', href: '/shows' },
  { label: 'About KSFDC', href: '/about' },
  { label: 'My tickets', href: '/profile/tickets' }
];

export const officialNavigation: NavigationItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard' },
  { label: 'Scheduling', href: '/admin/theatre-management' },
  { label: 'Movies', href: '/admin/movie-management' },
  { label: 'Shows', href: '/admin/shows' },
  { label: 'Bookings', href: '/admin/reports' },
  { label: 'Reports', href: '/admin/reports' },
  { label: 'Reconciliation', href: '/admin/reconciliation' }
];

export function getPublicNavigation(authenticated: boolean): NavigationItem[] {
  return authenticated ? publicUserNavigation : publicGuestNavigation;
}

export function getOfficialNavigation(authenticated: boolean): NavigationItem[] {
  return authenticated ? [...officialNavigation, { label: 'Logout', href: '/admin/logout' }] : officialNavigation;
}
