import { AppBanners } from './components/AppBanners';
import { DisplayScaleControl } from './components/DisplayScaleControl';
import { useAttemptRunning } from './game/attemptGuard';
import { AuthControl } from './auth/clerk';
import { Daily } from './routes/Daily';
import { Home } from './routes/Home';
import { LeaderboardPage } from './routes/LeaderboardPage';
import { Practice } from './routes/Practice';
import { Tutorial } from './routes/Tutorial';
import { Link, useRouter } from './router';

function Nav() {
  const { route } = useRouter();
  const item = (to: '/' | '/tutorial' | '/daily' | '/practice' | '/leaderboard', label: string) => (
    <Link
      to={to}
      className={`rounded px-2 py-1 text-sm ${
        route === to || (to === '/leaderboard' && route === '/leaderboard/today')
          ? 'bg-neutral-800 text-neutral-100'
          : 'text-neutral-400 hover:text-neutral-100'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {item('/', 'Home')}
      {item('/tutorial', 'Learn')}
      {item('/daily', 'Daily')}
      {item('/practice', 'Practice')}
      {item('/leaderboard', 'Leaderboard')}
    </nav>
  );
}

export function App() {
  const { route } = useRouter();
  const attemptRunning = useAttemptRunning();

  return (
    <div className="min-h-dvh">
      <AppBanners blockUpdates={attemptRunning} />
      <header className="border-b border-neutral-800">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
          <Link to="/" className="font-semibold tracking-tight">
            Quadro
          </Link>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Nav />
            <DisplayScaleControl />
            <AuthControl />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-2 sm:px-4 py-3 w-full">
        {route === '/' && <Home />}
        {route === '/tutorial' && <Tutorial />}
        {route === '/practice' && <Practice />}
        {route === '/daily' && <Daily />}
        {(route === '/leaderboard' || route === '/leaderboard/today') && <LeaderboardPage />}
      </main>
    </div>
  );
}
