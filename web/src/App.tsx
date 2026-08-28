import { Home } from './routes/Home';
import { Practice } from './routes/Practice';
import { Link, useRouter } from './router';

function Nav() {
  const { route } = useRouter();
  const item = (to: '/' | '/daily' | '/practice' | '/leaderboard', label: string) => (
    <Link
      to={to}
      className={`rounded px-2 py-1 text-sm ${
        route === to ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-100'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {item('/', 'Home')}
      {item('/daily', 'Daily')}
      {item('/practice', 'Practice')}
      {item('/leaderboard', 'Leaderboard')}
    </nav>
  );
}

export function App() {
  const { route } = useRouter();

  return (
    <div className="min-h-dvh">
      <header className="border-b border-neutral-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="font-semibold tracking-tight">
            Quadro
          </Link>
          <Nav />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {route === '/' && <Home />}
        {route === '/practice' && <Practice />}
        {route === '/daily' && <Placeholder name="Daily" />}
        {route === '/leaderboard' && <Placeholder name="Leaderboard" />}
      </main>
    </div>
  );
}

/** Routes that arrive in the next slices of the build (§18 rollout order). */
function Placeholder({ name }: { name: string }) {
  return <p className="text-neutral-400">{name} is not built yet.</p>;
}
