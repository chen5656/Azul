/**
 * Identity for the app (FR-026 … FR-028).
 *
 * Sign-in gates exactly one thing: writing a score. Every screen renders and
 * every game plays without it (FR-027).
 *
 * There are three states, not two. A player can be signed out, signed in
 * anonymously — a real row that can hold scores, created with one tap and with
 * no details asked for — or signed in to a durable account. Linking the first
 * to the second carries the scores over; see `linkAnonymousScores` in the
 * Worker.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { AccountDialog } from './AccountDialog';
import { NicknamePrompt } from './NicknamePrompt';
import { SignInDialog } from './SignInDialog';
import { fetchProviders, useSession } from './client';

export interface Identity {
  /** True for an anonymous session too: both can post a score. */
  signedIn: boolean;
  /** False only while the very first session check is in flight. */
  ready: boolean;
  /** True when the session is the tap-to-play anonymous kind. */
  isAnonymous: boolean;
  /** The leaderboard name: the chosen nickname, else a stable fallback. */
  displayName: string | null;
  imageUrl: string | null;
  /** True once the player has set a nickname of their own. */
  hasNickname: boolean;
  /** Opens the sign-in dialog. */
  openSignIn: () => void;
  /** Opens the account dialog (nickname, avatar, linked providers). */
  openAccount: () => void;
}

const IdentityContext = createContext<Identity | null>(null);

/** Providers are fetched once per page load and shared by both dialogs. */
const ProvidersContext = createContext<string[]>([]);

export function useAuthProviders(): string[] {
  return useContext(ProvidersContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  const [providers, setProviders] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'none' | 'sign-in' | 'account'>('none');
  /**
   * The nickname prompt is offered once per page load, not once per session:
   * a player who skips it is not nagged again until they come back, and one who
   * sets a nickname never sees it at all.
   */
  const [nicknameAsked, setNicknameAsked] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchProviders().then((list) => {
      if (active) setProviders(list);
    });
    return () => {
      active = false;
    };
  }, []);

  const user = data?.user as
    | { id: string; name?: string | null; image?: string | null; nickname?: string | null; isAnonymous?: boolean | null }
    | undefined;

  const openSignIn = useCallback(() => setDialog('sign-in'), []);
  const openAccount = useCallback(() => setDialog('account'), []);
  const close = useCallback(() => setDialog('none'), []);

  const identity = useMemo<Identity>(
    () => ({
      signedIn: Boolean(user),
      ready: !isPending,
      isAnonymous: Boolean(user?.isAnonymous),
      displayName: user ? displayNameFor(user) : null,
      imageUrl: user?.image ?? null,
      hasNickname: Boolean(user?.nickname),
      openSignIn,
      openAccount,
    }),
    [user, isPending, openSignIn, openAccount],
  );

  return (
    <ProvidersContext.Provider value={providers}>
      <IdentityContext.Provider value={identity}>
        {children}
        {dialog === 'sign-in' && <SignInDialog onClose={close} />}
        {dialog === 'account' && <AccountDialog onClose={close} />}
        {dialog === 'none' &&
          !nicknameAsked &&
          identity.signedIn &&
          !identity.isAnonymous &&
          !identity.hasNickname && <NicknamePrompt onDone={() => setNicknameAsked(true)} />}
      </IdentityContext.Provider>
    </ProvidersContext.Provider>
  );
}

/**
 * Safe outside the provider: components render in tests and in the static
 * guide pages without one, and a signed-out identity is the honest answer.
 */
export function useIdentity(): Identity {
  return useContext(IdentityContext) ?? SIGNED_OUT;
}

const SIGNED_OUT: Identity = {
  signedIn: false,
  ready: true,
  isAnonymous: false,
  displayName: null,
  imageUrl: null,
  hasNickname: false,
  openSignIn: () => {},
  openAccount: () => {},
};

/**
 * A real name is never shown. Providers hand one back and better-auth stores
 * it, but the board reads the nickname the player chose, and falls back to
 * something anonymous rather than to `name`.
 */
export function displayNameFor(user: {
  id: string;
  nickname?: string | null;
  isAnonymous?: boolean | null;
}): string {
  if (user.nickname) return user.nickname;
  return `player-${user.id.slice(-6)}`;
}
