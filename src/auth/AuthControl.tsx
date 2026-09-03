/**
 * The header's sign-in / account control.
 *
 * Signed out it is one button. Signed in it is the avatar, which opens the
 * account panel — and an anonymous session says so, because "you are signed in"
 * would be a promise this account cannot keep until a provider is linked.
 */

import { useIdentity } from './identity';

export function AuthControl() {
  const identity = useIdentity();

  if (!identity.ready) {
    return <span className="text-xs text-neutral-600">…</span>;
  }

  if (!identity.signedIn) {
    return (
      <button
        type="button"
        onClick={identity.openSignIn}
        className="shrink-0 whitespace-nowrap rounded border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-800"
      >
        Sign in
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={identity.openAccount}
      className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded border border-neutral-700 py-0.5 pl-0.5 pr-2 text-sm hover:bg-neutral-800"
      aria-label="Your account"
    >
      {identity.imageUrl ? (
        <img src={identity.imageUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
      ) : (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 text-xs text-neutral-400">
          {(identity.displayName ?? '?').slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="max-w-[10ch] truncate">{identity.displayName}</span>
      {identity.isAnonymous && (
        <span className="rounded bg-amber-900/50 px-1 text-[10px] text-amber-300">guest</span>
      )}
    </button>
  );
}
