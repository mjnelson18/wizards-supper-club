import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useData } from '../data.tsx';
import { fmtDateTime } from '../lib/format.ts';

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const NAV: { to: string; label: string; match: string[]; icon: ReactNode }[] = [
  { to: '/', label: 'Home', match: [], icon: icon(<path d="M4 20V10l8-6 8 6v10h-5v-6h-6v6z" />) },
  { to: '/circuits', label: 'Circuits', match: ['/circuits'], icon: icon(<><circle cx="12" cy="12" r="8" /><path d="M12 4v3M20 12h-3M12 20v-3M4 12h3" /></>) },
  { to: '/restaurants', label: 'Restaurants', match: ['/restaurants', '/evenings'], icon: icon(<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-3 4-3 7h3zM17 10v11" />) },
  { to: '/wizards', label: 'Wizards', match: ['/wizards'], icon: icon(<><path d="M12 3l5 13H7z" /><path d="M3 18c3 2.5 15 2.5 18 0" /></>) },
  { to: '/trends', label: 'Trends', match: ['/trends'], icon: icon(<path d="M4 18l5-6 4 3 7-9M4 21h16" />) },
  { to: '/records', label: 'Records', match: ['/records'], icon: icon(<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6L3.4 9.3l6-.7z" />) },
];

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') ?? 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1224' : '#efe6cf');
    try {
      localStorage.setItem('wsc-theme', theme);
    } catch {
      // Private browsing: the choice just lasts for this visit.
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))] as const;
}

export function Layout() {
  const { meta } = useData();
  const { pathname } = useLocation();
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const active = (item: (typeof NAV)[number]) =>
    item.to === '/' ? pathname === '/' : item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-on-gold">
        Skip to content
      </a>
      <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" className="shrink-0">
            <path d="M16 3l6.5 17h-13z" fill="var(--gold)" />
            <ellipse cx="16" cy="23" rx="12" ry="3.4" fill="var(--gold)" />
            <circle cx="18.5" cy="11.5" r="1.3" fill="var(--bg)" />
          </svg>
          <span className="truncate font-display text-lg font-semibold">Wizards Supper Club</span>
        </Link>
        <button
          type="button"
          onClick={toggleTheme}
          className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs text-ink-2 hover:text-ink"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </header>

      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:static sm:mx-4 sm:rounded-xl sm:border">
        <ul className="mx-auto grid max-w-3xl grid-cols-6">
          {NAV.map((item) => {
            const on = active(item);
            return (
              <li key={item.to} className="min-w-0">
                <Link
                  to={item.to}
                  aria-current={on ? 'page' : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-[10px] leading-tight sm:min-h-12 sm:flex-row sm:gap-1.5 sm:text-sm ${on ? 'font-semibold text-gold' : 'text-ink-2 hover:text-ink'}`}
                >
                  {item.icon}
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <main id="main" className="min-w-0 flex-1 px-4 pt-5">
        {meta.source === 'sample' && (
          <p role="note" className="mb-4 rounded-lg bg-[var(--tbc)] px-3 py-2 text-sm font-semibold text-[var(--tbc-ink)]">
            Sample data. These restaurants and scores are made up for testing, not the real record.
          </p>
        )}
        <Outlet />
      </main>

      <footer className="px-4 pb-24 pt-6 text-xs text-muted sm:pb-8">
        <p>
          Data last refreshed <time dateTime={meta.refreshedAt}>{fmtDateTime(meta.refreshedAt)}</time> · {meta.counts.evenings} evenings, {meta.counts.scores} scores
        </p>
        <p className="mt-1">
          <Link to="/methods" className="link">
            How the numbers are worked out
          </Link>
        </p>
      </footer>
    </div>
  );
}
