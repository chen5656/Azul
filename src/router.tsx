/**
 * A ~50-line history router.
 *
 * Four static routes and no nested layouts (§9.1), so a routing library would
 * cost more bundle than it saves (NFR-001). Cloudflare Pages serves index.html
 * for unknown paths, which is what makes the deep links work (AC-036).
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Route = '/' | '/daily' | '/practice' | '/leaderboard';

const ROUTES: Route[] = ['/', '/daily', '/practice', '/leaderboard'];

function normalize(pathname: string): Route {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  return (ROUTES.find((r) => r === trimmed) ?? '/') as Route;
}

interface RouterValue {
  route: Route;
  navigate: (to: Route) => void;
}

const RouterContext = createContext<RouterValue>({ route: '/', navigate: () => {} });

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => normalize(window.location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(normalize(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: Route) => {
    if (normalize(window.location.pathname) !== to) window.history.pushState({}, '', to);
    setRoute(to);
    window.scrollTo(0, 0);
  }, []);

  return <RouterContext.Provider value={{ route, navigate }}>{children}</RouterContext.Provider>;
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
  to: Route;
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
