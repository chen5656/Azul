/**
 * Clerk identity (§13 "Clerk verification", FR-026 … FR-028).
 *
 * Sign-in gates exactly one thing: writing a score. Every screen renders and
 * every game plays without it (FR-027). When Clerk is not configured or cannot
 * load, the app stays fully playable and the sign-in controls say so (§15).
 */

import {
  ClerkProvider,
  SignInButton,
  UserButton,
  useAuth,
  useUser,
} from '@clerk/clerk-react';
import type { ReactNode } from 'react';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/** True when a key was built in; false means the sign-in path is unavailable. */
export const clerkConfigured = Boolean(PUBLISHABLE_KEY);

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!clerkConfigured) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY!} afterSignOutUrl="/quadro/">
      {children}
    </ClerkProvider>
  );
}

export interface Identity {
  signedIn: boolean;
  available: boolean;
  /** The leaderboard name: username, then first name, then a truncated id (A-002). */
  displayName: string | null;
  /** Fetches a fresh session JWT, or null when there is no session. */
  getToken: () => Promise<string | null>;
}

export function useIdentity(): Identity {
  if (!clerkConfigured) {
    return {
      signedIn: false,
      available: false,
      displayName: null,
      getToken: async () => null,
    };
  }
  // Hooks below are called unconditionally for a given build: `clerkConfigured`
  // is a build-time constant, so the hook order never changes at runtime.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useClerkIdentity();
}

function useClerkIdentity(): Identity {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();

  return {
    signedIn: Boolean(isSignedIn),
    available: true,
    displayName: displayNameFor(user),
    getToken: () => getToken(),
  };
}

function displayNameFor(user: { username?: string | null; firstName?: string | null; id?: string } | null | undefined): string | null {
  if (!user) return null;
  return user.username || user.firstName || (user.id ? `player-${user.id.slice(-6)}` : null);
}

/** The header's sign-in / account control. */
export function AuthControl() {
  if (!clerkConfigured) {
    return <span className="text-xs text-neutral-500">Sign-in unavailable</span>;
  }
  return <ClerkAuthControl />;
}

function ClerkAuthControl() {
  const { isSignedIn } = useAuth();
  if (isSignedIn) return <UserButton />;
  return (
    <SignInButton mode="modal">
      <button
        type="button"
        className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
      >
        Sign in
      </button>
    </SignInButton>
  );
}
