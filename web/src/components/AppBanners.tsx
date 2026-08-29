/**
 * The two global states from §9.3: offline, and "a new build is ready".
 *
 * The update banner never reloads on its own, and it hides entirely while a
 * Daily attempt is running (AC-038) — the caller passes `blockUpdates`.
 */

import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function AppBanners({ blockUpdates }: { blockUpdates: boolean }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <>
      {!online && (
        <div className="bg-neutral-800 px-4 py-1.5 text-center text-xs text-neutral-300">
          Offline — you can still play, but times aren't recorded.
        </div>
      )}
      {needRefresh && !blockUpdates && (
        <div className="flex items-center justify-center gap-3 bg-sky-950 px-4 py-1.5 text-xs">
          <span>An update is available.</span>
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="rounded border border-sky-700 px-2 py-0.5 hover:bg-sky-900"
          >
            Reload
          </button>
        </div>
      )}
    </>
  );
}
