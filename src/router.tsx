/**
 * A ~50-line history router.
 *
 * A handful of static routes and no nested layouts (§9.1), so a routing library would
 * cost more bundle than it saves (NFR-001). Cloudflare Pages serves index.html
 * for unknown paths, which is what makes the deep links work (AC-036).
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Route =
  | '/'
  | '/tutorial'
  | '/daily'
  | '/practice'
  | '/leaderboard'
  | '/leaderboard/today'
  /** `/leaderboard/YYYY-MM-DD`; the date arrives in `params.date`. */
  | '/leaderboard/date'
  | '/replay'
  | '/history';

const ROUTES: Route[] = [
  '/',
  '/tutorial',
  '/daily',
  '/practice',
  '/leaderboard',
  '/leaderboard/today',
  '/replay',
  '/history',
];

export interface RouteParams {
  /** `YYYY-MM-DD`, on the dated leaderboard only. */
  date?: string;
}

const DATED_BOARD = /^\/leaderboard\/(\d{4}-\d{2}-\d{2})$/;

function normalize(pathname: string): { route: Route; params: RouteParams } {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  const dated = DATED_BOARD.exec(trimmed);
  if (dated) return { route: '/leaderboard/date', params: { date: dated[1] } };
  return { route: (ROUTES.find((r) => r === trimmed) ?? '/') as Route, params: {} };
}

interface RouterValue {
  route: Route;
  params: RouteParams;
  search: string;
  /** Without the leading '#'. Replay codes ride here so they stay out of logs. */
  hash: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterValue>({
  route: '/',
  params: {},
  search: '',
  hash: '',
  navigate: () => {},
});

export function RouterProvider({ children }: { children: ReactNode }) {
  const [match, setMatch] = useState(() => normalize(window.location.pathname));
  const [search, setSearch] = useState<string>(() => window.location.search);
  const [hash, setHash] = useState<string>(() => window.location.hash.replace(/^#/, ''));

  useEffect(() => {
    const onPop = () => {
      setMatch(normalize(window.location.pathname));
      setSearch(window.location.search);
      setHash(window.location.hash.replace(/^#/, ''));
    };
    window.addEventListener('popstate', onPop);
    // A replay link pasted into the address bar changes only the fragment, so
    // popstate alone would leave the page showing the previous replay.
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, []);

  const navigate = useCallback((to: string) => {
    const url = new URL(to, window.location.href);
    if (
      window.location.pathname !== url.pathname ||
      window.location.search !== url.search ||
      window.location.hash !== url.hash
    ) {
      window.history.pushState({}, '', to);
    }
    setMatch(normalize(url.pathname));
    setSearch(url.search);
    setHash(url.hash.replace(/^#/, ''));
    window.scrollTo(0, 0);
  }, []);

  return (
    <RouterContext.Provider
      value={{ route: match.route, params: match.params, search, hash, navigate }}
    >
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter(): RouterValue {
  return useContext(RouterContext);
}

/** An anchor that navigates in-place but still behaves like a real link. */
export function Link({
  to,
  className,
  children,
}: {
  /** Any in-app href, not just a bare `Route`: dated boards and replay links
   *  carry a path segment or a fragment. */
  to: string;
  className?: string;
  children: ReactNode;
}) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
