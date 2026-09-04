/**
 * The account panel: nickname, avatar, and which sign-ins reach this account.
 *
 * An anonymous player sees the same panel with one difference — linking a
 * provider here is what makes the account durable, and their posted times come
 * with them (the Worker moves the rows; see `linkAnonymousScores`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { Dialog, DialogError } from './Dialog';
import { Field } from './SignInDialog';
import { PROVIDER_LABELS, authClient, signIn, signOut, updateUser, useSession } from './client';
import { displayNameFor, useAuthProviders } from './identity';
import { Link, useRouter } from '../router';

const MAX_AVATAR_BYTES = 1_048_576;
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { data, refetch } = useSession();
  const providers = useAuthProviders();
  const [linked, setLinked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const user = data?.user as
    | { id: string; image?: string | null; nickname?: string | null; isAnonymous?: boolean | null }
    | undefined;

  useEffect(() => {
    if (!user) return;
    let active = true;
    void authClient
      .listAccounts()
      .then((result) => {
        if (active) setLinked((result.data ?? []).map((account) => account.providerId));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  const { navigate } = useRouter();

  if (!user) {
    onClose();
    return null;
  }

  return (
    <Dialog title="Your account" onClose={onClose}>
      <div className="space-y-5">
        <AvatarRow
          user={user}
          onError={setError}
          onUploaded={() => {
            void refetch();
          }}
        />

        <NicknameForm
          initial={user.nickname ?? ''}
          onError={setError}
          onSaved={() => {
            void refetch();
          }}
        />

        <LinkedAccounts
          providers={providers}
          linked={linked}
          isAnonymous={Boolean(user.isAnonymous)}
          onError={setError}
        />

        <div className="border-t border-neutral-800 pt-4">
          <Link
            to="/history"
            onClick={(e) => {
              e.preventDefault();
              navigate('/history');
              onClose();
            }}
            className="flex items-center justify-between rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            <span>My history</span>
            <span className="text-xs text-neutral-500">Dailies &amp; replays →</span>
          </Link>
        </div>

        <div className="flex justify-between border-t border-neutral-800 pt-3">
          <button
            type="button"
            onClick={() => {
              void signOut().then(onClose);
            }}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            Sign out
          </button>
        </div>

        <DialogError message={error} />
      </div>
    </Dialog>
  );
}

function AvatarRow({
  user,
  onError,
  onUploaded,
}: {
  user: { id: string; image?: string | null; nickname?: string | null; isAnonymous?: boolean | null };
  onError: (message: string | null) => void;
  onUploaded: () => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      if (!AVATAR_TYPES.includes(file.type)) {
        onError('Pick a PNG, JPEG, WebP or GIF image.');
        return;
      }
      if (file.size > MAX_AVATAR_BYTES) {
        onError('That image is over 1 MB. Pick a smaller one.');
        return;
      }

      setBusy(true);
      onError(null);
      try {
        // The raw bytes, not multipart: there is exactly one field, and this
        // keeps the Worker side to a single `arrayBuffer()`.
        const response = await fetch('/api/me/avatar', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'content-type': file.type },
          body: file,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          onError(body?.error?.message ?? 'The upload failed.');
          return;
        }
        onUploaded();
      } catch {
        onError("Couldn't reach the server.");
      } finally {
        setBusy(false);
      }
    },
    [onError, onUploaded],
  );

  return (
    <div className="flex items-center gap-3">
      {user.image ? (
        <img
          src={user.image}
          alt=""
          className="h-14 w-14 rounded-full border border-neutral-700 object-cover"
        />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-lg text-neutral-500">
          {(user.nickname ?? '?').slice(0, 1).toUpperCase()}
        </div>
      )}

      <div>
        <p className="text-sm">{displayNameFor(user)}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => picker.current?.click()}
          className="mt-1 rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy ? 'Uploading…' : user.image ? 'Change picture' : 'Add a picture'}
        </button>
        <input
          ref={picker}
          type="file"
          accept={AVATAR_TYPES.join(',')}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset so picking the same file twice fires `change` again.
            event.target.value = '';
            if (file) void upload(file);
          }}
        />
      </div>
    </div>
  );
}

function NicknameForm({
  initial,
  onError,
  onSaved,
}: {
  initial: string;
  onError: (message: string | null) => void;
  onSaved: () => void;
}) {
  const [nickname, setNickname] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const value = nickname.trim();
        if (!value) {
          onError('Pick a nickname — the board has to call you something.');
          return;
        }
        setBusy(true);
        onError(null);
        setSaved(false);
        // `name` is kept in step so anything reading better-auth's own field
        // (an admin listing, an export) shows the same thing the board does.
        const result = await updateUser({ nickname: value, name: value });
        setBusy(false);
        if (result.error) {
          onError(result.error.message ?? 'Could not save that nickname.');
          return;
        }
        setSaved(true);
        onSaved();
      }}
    >
      <Field
        label="Nickname"
        hint="What the leaderboard shows. Not your real name."
        value={nickname}
        onChange={(value) => {
          setNickname(value);
          setSaved(false);
        }}
        maxLength={24}
        autoComplete="nickname"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || nickname.trim() === initial}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm hover:bg-sky-500 disabled:opacity-40"
        >
          Save
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved.</span>}
      </div>
    </form>
  );
}

function LinkedAccounts({
  providers,
  linked,
  isAnonymous,
  onError,
}: {
  providers: string[];
  linked: string[];
  isAnonymous: boolean;
  onError: (message: string | null) => void;
}) {
  if (providers.length === 0) return null;

  return (
    <div className="border-t border-neutral-800 pt-4">
      <h3 className="text-sm font-medium">Sign-in methods</h3>
      <p className="mt-0.5 text-xs text-neutral-500">
        {isAnonymous
          ? 'Link one to keep this account — your posted times come with it.'
          : 'Any of these gets you back into this same account.'}
      </p>

      <ul className="mt-2 space-y-1.5">
        {providers.map((provider) => {
          const already = linked.includes(provider);
          return (
            <li key={provider} className="flex items-center justify-between gap-3">
              <span className="text-sm">{PROVIDER_LABELS[provider] ?? provider}</span>
              {already ? (
                <span className="text-xs text-emerald-400">Linked</span>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    onError(null);
                    const result = isAnonymous
                      ? // An anonymous session links by signing in: better-auth
                        // spots the anonymous user and runs `onLinkAccount`.
                        await signIn.social({ provider, callbackURL: window.location.href })
                      : await authClient.linkSocial({
                          provider,
                          callbackURL: window.location.href,
                        });
                    if (result?.error) {
                      onError(result.error.message ?? 'Could not link that account.');
                    }
                  }}
                  className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                >
                  Link
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
