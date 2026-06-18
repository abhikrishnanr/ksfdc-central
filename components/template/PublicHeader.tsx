'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getOfficialNavigation, getPublicNavigation } from '../../lib/navigation';

type AuthState = { authenticated?: boolean; user?: { email?: string } };
type Suggestion = { id: string; type: 'Movie' | 'Theatre'; label: string; detail: string; href: string };

const CITIES = ['Kerala', 'Thiruvananthapuram', 'Kochi'];

function initials(email?: string) {
  if (!email) return 'U';
  return email.slice(0, 2).toUpperCase();
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
      setSuggestions([]);
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

  async function publicLogout() {
    await fetch('/api/public/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAuth({});
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

  if (!official) {
    return (
      <header className="public-topbar">
        <Link className="brand-lockup public-brand" href="/">
          <span className="brand-mark">KT</span>
          <span>
            <span className="brand-title">KSFDC Tickets</span>
            <br />
            <span className="brand-subtitle">Kerala State Film Development Corporation</span>
          </span>
        </Link>

        <div className={`public-header-controls ${mobileOpen ? 'open' : ''}`}>
          <label className="city-select">
           
            <select value={city} onChange={(event) => updateCity(event.target.value)}>
              {cityOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <div className={`public-search ${searchOpen ? 'open' : ''}`} ref={searchRef}>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={handleSearchKey}
              placeholder="Search movies or theatres"
              aria-label="Search movies or theatres"
            />
            {searchOpen && suggestions.length ? (
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
            ) : null}
          </div>

          <nav className="public-nav" aria-label="Public navigation">
            {nav.map((item) => item.label === 'Sign in'
              ? <Link className="login-signup-button" key={item.href} href={item.href}>Login / Sign Up</Link>
              : <Link className={isActive(item.href) ? 'active' : ''} key={`${item.label}-${item.href}`} href={publicHref(item.href)}>{item.label}</Link>)}
            <button className="header-icon-button" type="button" aria-label="Notifications">!</button>
            <label className="language-select" aria-label="Language">
              <select defaultValue="EN">
                <option value="EN">EN</option>
                <option value="ML">ML</option>
              </select>
            </label>
            <Link className="theatre-login-link" href="/official/login">Theatre Login</Link>
          </nav>

          {auth.authenticated ? (
            <div className="account-menu">
              <button type="button" className="avatar-button" onClick={() => setAccountOpen((value) => !value)}>
                <span>{initials(auth.user?.email)}</span>
                <small>{auth.user?.email}</small>
              </button>
              {accountOpen ? (
                <div className="account-dropdown">
                  <Link href="/profile">Profile</Link>
                  <Link href="/profile/tickets">My tickets</Link>
                  <button type="button" onClick={publicLogout}>Logout</button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <button className="mobile-menu-button" type="button" onClick={() => setMobileOpen((value) => !value)} aria-label="Toggle menu">
          <span />
          <span />
          <span />
        </button>
      </header>
    );
  }

  return (
    <header className="topbar">
      <Link className="brand-lockup" href={official ? '/admin' : '/'}>
        <span className="brand-mark">{official ? 'KO' : 'KC'}</span>
        <span>
          <span className="brand-title">{official ? 'KSFDC Operations' : 'KSFDC Tickets'}</span>
          <br />
          <span className="brand-subtitle">{official ? 'Theatre official portal' : 'Movies across Kerala'}</span>
        </span>
      </Link>
      <nav className="topnav" aria-label={official ? 'Theatre official navigation' : 'Public navigation'}>
        {nav.map((item) => item.href === '/admin/logout'
          ? <button className="nav-pill" key={item.href} type="button" onClick={officialLogout}>{item.label}</button>
          : <Link className="nav-pill" key={item.href} href={item.href}>{item.label}</Link>)}
        {!official ? <Link className="nav-pill" href="/official/login">Theatre Login</Link> : null}
        {!official && auth.authenticated ? <button className="nav-pill" type="button" onClick={publicLogout}>Logout</button> : null}
      </nav>
    </header>
  );
}
