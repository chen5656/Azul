import type { ReactNode } from 'react';

import { AppBanners } from './components/AppBanners';
import { SettingsMenu } from './components/SettingsMenu';
import { useAttemptRunning } from './game/attemptGuard';
import { AuthControl } from './auth';
import { Daily } from './routes/Daily';
import { Home } from './routes/Home';
import { LeaderboardPage } from './routes/LeaderboardPage';
import { HistoryPage } from './routes/HistoryPage';
import { Practice } from './routes/Practice';
import { ReplayPage } from './routes/ReplayPage';
import { Tutorial } from './routes/Tutorial';
import { Link, useRouter } from './router';
import { useLayoutMode } from './components/useLayoutMode';
import { useGameStyle } from './context/GameStyleContext';

/** Routes that are a game surface: on phones and tablets they own the screen. */
const GAME_ROUTES = new Set(['/tutorial', '/practice', '/daily']);

/** The cup that marks the board; the Daily no longer carries one of its own. */
function TrophyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 stroke-current text-amber-400"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.45 1-1 1H7v4h10v-4h-2c-.55 0-1-.45-1-1v-2.34" />
      <path d="M6 4h12v7a6 6 0 0 1-12 0V4z" />
    </svg>
  );
}

function LogoIcon() {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="h-6 w-6 rounded"
    >
      <rect width="32" height="32" rx="6" fill="#171717" />
      <rect x="5" y="5" width="10" height="10" rx="2" fill="#2f6fd0" />
      <rect x="17" y="5" width="10" height="10" rx="2" fill="#e8c33a" />
      <rect x="5" y="17" width="10" height="10" rx="2" fill="#c8402f" />
      <rect x="17" y="17" width="10" height="10" rx="2" fill="#e9e6dd" />
    </svg>
  );
}

function Nav() {
  const { route } = useRouter();
  const { style } = useGameStyle();
  const item = (
    to: '/tutorial' | '/daily' | '/practice' | '/leaderboard',
    label: string,
    icon?: ReactNode,
  ) => (
    <Link
      to={to}
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm ${
        route === to ||
        (to === '/leaderboard' && route.startsWith('/leaderboard'))
          ? 'bg-neutral-800 text-neutral-100'
          : 'text-neutral-400 hover:text-neutral-100'
      }`}
    >
      {icon}
      {label}
    </Link>
  );

  /*
    Four destinations only. Home is the wordmark; preferences sit behind the ⚙.
  */
  return (
    <nav aria-label="Main" className="flex flex-wrap items-center justify-end gap-1">
      {item('/daily', 'Daily', style !== 'focus' ? <span className="text-xs">📅</span> : undefined)}
      {item('/practice', 'Practice', style !== 'focus' ? <span className="text-xs">🎯</span> : undefined)}
      {item('/leaderboard', 'Leaderboard', style !== 'focus' ? <TrophyIcon /> : undefined)}
      {item('/tutorial', 'Learn')}
    </nav>
  );
}

export function App() {
  const { route } = useRouter();
  const attemptRunning = useAttemptRunning();
  const { style } = useGameStyle();
  /**
   * On a phone or tablet the nav, style/scale pickers and auth control cost a
   * whole band of screen for something you only touch between games. The game
   * surface hides them and offers its own back link instead.
   */
  const immersive = useLayoutMode() === 'stacked' && GAME_ROUTES.has(route);

  return (
    <div className="min-h-dvh">
      <AppBanners blockUpdates={attemptRunning} />
      {!immersive && (
      <header className="relative z-50 border-b border-neutral-800 bg-neutral-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-x-3 px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-2 font-semibold tracking-tight text-neutral-100 hover:text-white transition-colors">
            {style !== 'focus' && <LogoIcon />}
            <span>Quadro</span>
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Nav />
            <SettingsMenu />
            <AuthControl />
          </div>
        </div>
      </header>
      )}

      <main
        className={`mx-auto w-full ${
          GAME_ROUTES.has(route) ? 'max-w-[1600px]' : 'max-w-7xl'
        } ${immersive ? 'px-1.5 pb-[env(safe-area-inset-bottom)] pt-1.5' : 'px-2 sm:px-4 py-3'}`}
      >
        {route === '/' && <Home />}
        {route === '/tutorial' && <Tutorial />}
        {route === '/practice' && <Practice />}
        {route === '/daily' && <Daily />}
        {(route === '/leaderboard' ||
          route === '/leaderboard/today' ||
          route === '/leaderboard/date') && <LeaderboardPage />}
        {route === '/replay' && <ReplayPage />}
        {route === '/history' && <HistoryPage />}
      </main>

      {/*
        Static pages emitted by the SEO build, outside the router — plain <a>,
        not <Link>, or the router would normalize them to `/` and the policy
        would silently render as the home page. Google's consent screen links
        here too, so it has to be reachable.
      */}
      {!immersive && (
        <footer className="mt-8 border-t border-neutral-800">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 text-xs text-neutral-500">
            <span>Quadro — a free daily tile-drafting puzzle.</span>
            <a href="/guide" className="hover:text-neutral-300">
              Guide
            </a>
            <a href="/privacy" className="hover:text-neutral-300">
              Privacy
            </a>
            <a href="/terms" className="hover:text-neutral-300">
              Terms
            </a>
          </div>
        </footer>
      )}
    </div>
  );
}
