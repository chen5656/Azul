import { AppBanners } from './components/AppBanners';
import { DisplayScaleControl } from './components/DisplayScaleControl';
import { GameStyleControl } from './components/GameStyleControl';
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

/** Routes that are a game surface: on phones and tablets they own the screen. */
const GAME_ROUTES = new Set(['/tutorial', '/practice', '/daily']);

function Nav() {
  const { route } = useRouter();
  const item = (
    to: '/' | '/tutorial' | '/daily' | '/practice' | '/leaderboard' | '/history',
    label: string,
  ) => (
    <Link
      to={to}
      className={`rounded px-2 py-1 text-sm ${
        route === to ||
        (to === '/leaderboard' && route.startsWith('/leaderboard'))
          ? 'bg-neutral-800 text-neutral-100'
          : 'text-neutral-400 hover:text-neutral-100'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
      {item('/', 'Home')}
      {item('/tutorial', 'Learn')}
      {item('/daily', 'Daily')}
      {item('/practice', 'Practice')}
      {item('/leaderboard', 'Leaderboard')}
      {item('/history', 'History')}
      {/* Static pages emitted by the SEO build, outside the router. */}
      <a
        href="/guide"
        className="rounded px-2 py-1 text-sm text-neutral-400 hover:text-neutral-100"
      >
        Guide
      </a>
    </nav>
  );
}

export function App() {
  const { route } = useRouter();
  const attemptRunning = useAttemptRunning();
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
      <header className="border-b border-neutral-800">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
          <Link to="/" className="font-semibold tracking-tight">
            Quadro
          </Link>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Nav />
            <GameStyleControl />
            <DisplayScaleControl />
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
    </div>
  );
}
