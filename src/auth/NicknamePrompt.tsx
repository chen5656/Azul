/**
 * Asked once, right after a first sign-in: what should the board call you?
 *
 * Google, Apple and LinkedIn all hand back a real name, and putting that on a
 * public leaderboard is not something a player asked for. So the account starts
 * with no nickname and this asks for one — skippable, because a player who does
 * not care gets `player-a1b2c3` and nothing is blocked.
 */

import { useState } from 'react';

import { Dialog, DialogError } from './Dialog';
import { Field } from './SignInDialog';
import { updateUser } from './client';

export function NicknamePrompt({ onDone }: { onDone: () => void }) {
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog title="Pick a nickname" onClose={onDone}>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const value = nickname.trim();
          if (!value) {
            setError('Type a nickname, or skip and stay anonymous.');
            return;
          }
          setBusy(true);
          setError(null);
          const result = await updateUser({ nickname: value, name: value });
          setBusy(false);
          if (result.error) {
            setError(result.error.message ?? 'Could not save that nickname.');
            return;
          }
          onDone();
        }}
      >
        <p className="text-sm text-neutral-400">
          This is the only name the leaderboard shows. Your real name is never displayed.
        </p>

        <Field
          label="Nickname"
          value={nickname}
          onChange={setNickname}
          maxLength={24}
          autoComplete="nickname"
          autoFocus
        />

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm hover:bg-sky-500 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            Skip
          </button>
        </div>

        <DialogError message={error} />
      </form>
    </Dialog>
  );
}
