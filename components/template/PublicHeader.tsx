'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Building2,
  CalendarDays,
  Clapperboard,
  Home,
  Languages,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  Ticket,
  UserRound,
  X
} from 'lucide-react';
import { getOfficialNavigation, getPublicNavigation } from '../../lib/navigation';

type AuthState = { authenticated?: boolean; user?: { email?: string } };
type Suggestion = { id: string; type: 'Movie' | 'Theatre'; label: string; detail: string; href: string };

const CITIES = ['Kerala', 'Thiruvananthapuram', 'Kochi'];

function initials(email?: string) {
  return email ? email.slice(0, 2).toUpperCase() : 'U';
}

function NavigationIcon({ href }: { href: string }) {
  const props = { size: 19, strokeWidth: 2 };
  if (href === '/') return <Home {...props} />;
  if (href.startsWith('/movies')) return <Clapperboard {...props} />;
  if (href.startsWith('/shows')) return <CalendarDays {...props} />;
  if (href.startsWith('/theatres')) return <Building2 {...props} />;
  if (href.startsWith('/profile/tickets')) return <Ticket {...props} />;
  if (href.startsWith('/profile')) return <UserRound {...props} />;
  return <LogIn {...props} />;
}

export default function PublicHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const official = pathname.startsWith('/admin') || pathname.startsWith('/official');
  const [auth, setAuth] = useState<AuthState>({});
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const city = searchParams.get('city') || 'Kerala';
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (official) return;
    fetch('/api/public/auth/me').then((response) => response.json()).then(setAuth).catch(() => setAuth({}));
  }, [official]);

  useEffect(() => {
    if (official || query.trim().length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/public/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((payload) => {
          setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
          setActiveIndex(0);
        })
        .catch(() => setSuggestions([]));
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [official, query]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false);
    }
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMobileOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  async function publicLogout() {
    await fetch('/api/public/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAuth({});
    setMobileOpen(false);
    router.refresh();
  }

  async function officialLogout() {
    await fetch('/admin/logout', { method: 'POST' }).catch(() => undefined);
    window.location.href = '/admin/login';
  }

  const officialAuthenticated = official && !pathname.endsWith('/login') && !pathname.includes('/access-denied');
  const nav = official ? getOfficialNavigation(officialAuthenticated) : getPublicNavigation(Boolean(auth.authenticated));
  const publicHref = (href: string) => city === 'Kerala' ? href : `${href}${href.includes('?') ? '&' : '?'}city=${encodeURIComponent(city)}`;
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);
  const cityOptions = useMemo(() => CITIES, []);

  if (pathname.startsWith('/ticket-checker')) return null;

  function updateCity(nextCity: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextCity === 'Kerala') params.delete('city');
    else params.set('city', nextCity);
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  function chooseSuggestion(suggestion: Suggestion) {
    setQuery('');
    setSuggestions([]);
    setSearchOpen(false);
    setMobileOpen(false);
    router.push(suggestion.href);
  }

  function handleSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      chooseSuggestion(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      setSearchOpen(false);
    }
  }

  const suggestionList = suggestions.length ? (
    <div className="search-suggestions">
      {suggestions.map((suggestion, index) => (
        <button
          type="button"
          className={index === activeIndex ? 'active' : ''}
          key={`${suggestion.type}-${suggestion.id}`}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => chooseSuggestion(suggestion)}
        >
          <span>{suggestion.label}</span>
          <small>{suggestion.type} - {suggestion.detail}</small>
        </button>
      ))}
    </div>
  ) : null;

  if (!official) {
    const primaryNav = nav.filter((item) => !['Sign in', 'My tickets', 'Events', 'Cinema News'].includes(item.label));
    const accountItem = nav.find((item) => item.label === 'Sign in' || item.label === 'My tickets');
    return (
      <header className="public-topbar">
        <div className="public-header-main">
          <Link className="brand-lockup public-brand" href="/">
            <span className="brand-mark">KT</span>
            <span>
              <span className="brand-title">KSFDC Tickets</span><br />
              <span className="brand-subtitle">Kerala State Film Development Corporation</span>
            </span>
          </Link>

          <div className="public-header-utilities">
            <label className="city-select">
              <MapPin size={17} aria-hidden="true" />
              <select value={city} onChange={(event) => updateCity(event.target.value)} aria-label="City">
                {cityOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          <div className={`public-search ${searchOpen ? 'open' : ''}`} ref={searchRef}>
            <Search size={18} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => { const value = event.target.value; setQuery(value); if (value.trim().length < 2) setSuggestions([]); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={handleSearchKey}
              placeholder="Search movies or theatres"
              aria-label="Search movies or theatres"
            />
            {searchOpen ? suggestionList : null}
          </div>
            <button className="header-icon-button" type="button" aria-label="Notifications"><Bell size={18} /></button>
          {auth.authenticated ? (
            <div className="account-menu">
              <button type="button" className="avatar-button" onClick={() => setAccountOpen((value) => !value)}>
                <span>{initials(auth.user?.email)}</span><small>{auth.user?.email}</small>
              </button>
              {accountOpen ? (
                <div className="account-dropdown">
                  <Link href="/profile">Profile</Link><Link href="/profile/tickets">My tickets</Link>
                  <button type="button" onClick={publicLogout}>Logout</button>
                </div>
              ) : null}
            </div>
            ) : accountItem ? <Link className="login-signup-button" href={accountItem.href}><UserRound size={17} /> Login / Sign Up</Link> : null}
          </div>

          <button className="mobile-menu-button" type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen}>
            <Menu size={24} />
          </button>
        </div>

        <div className="public-header-navrow">
          <nav className="public-nav" aria-label="Public navigation">
            {primaryNav.map((item) => <Link className={isActive(item.href) ? 'active' : ''} key={`${item.label}-${item.href}`} href={publicHref(item.href)}>{item.label}</Link>)}
          </nav>
          <div className="public-partner-actions">
            {auth.authenticated && accountItem ? <Link href={accountItem.href}><Ticket size={17} /> My tickets</Link> : null}
            <Link className="theatre-login-link" href="/official/login"><ShieldCheck size={17} /> Theatre Login</Link>
            <label className="language-select" aria-label="Language"><Languages size={17} /><select defaultValue="EN"><option value="EN">EN</option><option value="ML">ML</option></select></label>
          </div>
        </div>

        <button className={`mobile-drawer-backdrop ${mobileOpen ? 'open' : ''}`} type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
        <aside className={`mobile-nav-drawer ${mobileOpen ? 'open' : ''}`} aria-hidden={!mobileOpen}>
          <div className="mobile-drawer-header">
            <Link className="brand-lockup" href="/" onClick={() => setMobileOpen(false)}>
              <span className="brand-mark">KT</span>
              <span><span className="brand-title">KSFDC Tickets</span><br /><span className="brand-subtitle">Book cinema across Kerala</span></span>
            </Link>
            <button type="button" className="drawer-close-button" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={25} /></button>
          </div>

          <div className="mobile-drawer-tools">
            <label className="drawer-search">
              <Search size={19} />
              <input value={query} onChange={(event) => { const value = event.target.value; setQuery(value); if (value.trim().length < 2) setSuggestions([]); setSearchOpen(true); }} onKeyDown={handleSearchKey} placeholder="Search movies or theatres" />
            </label>
            {searchOpen ? suggestionList : null}
            <label className="drawer-select"><MapPin size={19} /><select value={city} onChange={(event) => updateCity(event.target.value)}>{cityOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          </div>

          <nav className="mobile-drawer-nav" aria-label="Mobile navigation">
            {[...primaryNav, ...(accountItem ? [accountItem] : [])].map((item, index) => (
              <Link
                className={`${isActive(item.href) ? 'active' : ''} drawer-color-${index % 5}`}
                key={`${item.label}-${item.href}`}
                href={publicHref(item.href)}
                onClick={() => setMobileOpen(false)}
              >
                <span className="drawer-nav-icon"><NavigationIcon href={item.href} /></span>
                <span><strong>{item.label === 'Sign in' ? 'Login / Sign Up' : item.label}</strong><small>{item.href.startsWith('/profile/tickets') ? 'View bookings and tickets' : item.href.startsWith('/theatres') ? 'Explore theatre network' : item.href.startsWith('/shows') ? 'Find showtimes near you' : item.href.startsWith('/movies') ? 'Browse now showing' : item.href === '/' ? 'Discover cinema' : item.href === '/about' ? 'Our mission and network' : 'Account and preferences'}</small></span>
              </Link>
            ))}
          </nav>

          <div className="mobile-drawer-footer">
            <Link href="/official/login" onClick={() => setMobileOpen(false)}><ShieldCheck size={19} /> Theatre Login</Link>
            <span><Languages size={18} /><select defaultValue="EN"><option value="EN">English</option><option value="ML">Malayalam</option></select></span>
            {auth.authenticated ? <button type="button" onClick={publicLogout}><LogOut size={18} /> Logout</button> : null}
          </div>
        </aside>
      </header>
    );
  }

  return (
    <header className="topbar">
      <Link className="brand-lockup" href="/admin">
        <span className="brand-mark">KO</span>
        <span><span className="brand-title">KSFDC Operations</span><br /><span className="brand-subtitle">Theatre official portal</span></span>
      </Link>
      {pathname === '/admin/login' ? null : (
        <nav className="topnav" aria-label="Theatre official navigation">
          {nav.map((item) => item.href === '/admin/logout'
            ? <button className="nav-pill" key={item.href} type="button" onClick={officialLogout}>{item.label}</button>
            : <Link className="nav-pill" key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>
      )}
    </header>
  );
}
