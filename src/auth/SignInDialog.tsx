/**
 * Sign in, sign up, or just start playing.
 *
 * Three ways in, in the order they cost the player something: a provider tap,
 * an email and password, or an anonymous session that asks for nothing at all.
 * The anonymous route is the point — a score can be posted before the player
 * has decided whether they care enough to make an account, and linking later
 * carries it over.
 */

import { useState } from 'react';

import { Dialog, DialogError } from './Dialog';
import { PROVIDER_LABELS, signIn, signUp } from './client';
import { useAuthProviders } from './identity';

type Mode = 'choose' | 'email-in' | 'email-up';

export function SignInDialog({ onClose }: { onClose: () => void }) {
  const providers = useAuthProviders();
  const [mode, setMode] = useState<Mode>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ error?: { message?: string } | null }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result?.error) {
        setError(result.error.message ?? 'That did not work. Try again.');
        return;
      }
      onClose();
    } catch {
      setError("Couldn't reach the server. You can still play.");
    } finally {
      setBusy(false);
    }
  }

  const social = (provider: string) =>
    run(() =>
      // The redirect leaves the page; `callbackURL` is where the provider
      // returns to, which is simply wherever the player already was.
      signIn.social({ provider, callbackURL: window.location.href }),
    );

  return (
    <Dialog title={mode === 'email-up' ? 'Create an account' : 'Sign in'} onClose={onClose}>
      {mode === 'choose' && (
        <div className="space-y-2">
          {providers.map((provider) => (
            <button
              key={provider}
              type="button"
              disabled={busy}
              onClick={() => void social(provider)}
              className="w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-50"
            >
              Continue with {PROVIDER_LABELS[provider] ?? provider}
            </button>
          ))}

          {providers.length === 0 && (
            <p className="text-xs text-neutral-500">
              No sign-in providers are configured for this deployment.
            </p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => setMode('email-in')}
            className="w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-50"
          >
            Continue with email
          </button>

          <div className="pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => signIn.anonymous())}
              className="w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
            >
              Just start playing
            </button>
            <p className="mt-1.5 text-xs text-neutral-500">
              Posts your times under a temporary name. Sign in later and they come with you.
            </p>
          </div>
        </div>
      )}

      {mode !== 'choose' && (
        <EmailForm
          mode={mode}
          busy={busy}
          onSubmit={(email, password, nickname) =>
            run(() =>
              mode === 'email-up'
                ? signUp.email({ email, password, name: nickname, nickname })
                : signIn.email({ email, password }),
            )
          }
          onSwitch={() => {
            setError(null);
            setMode(mode === 'email-in' ? 'email-up' : 'email-in');
          }}
          onBack={() => {
            setError(null);
            setMode('choose');
          }}
        />
      )}

      <DialogError message={error} />
    </Dialog>
  );
}

function EmailForm({
  mode,
  busy,
  onSubmit,
  onSwitch,
  onBack,
}: {
  mode: 'email-in' | 'email-up';
  busy: boolean;
  onSubmit: (email: string, password: string, nickname: string) => void;
  onSwitch: () => void;
  onBack: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const signingUp = mode === 'email-up';

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(email.trim(), password, nickname.trim());
      }}
    >
      {signingUp && (
        <Field
          label="Nickname"
          hint="What the leaderboard shows. Not your real name."
          value={nickname}
          onChange={setNickname}
          autoComplete="nickname"
          required
          maxLength={24}
        />
      )}
      <Field
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        required
      />
      <Field
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete={signingUp ? 'new-password' : 'current-password'}
        required
        minLength={signingUp ? 8 : undefined}
        hint={signingUp ? 'At least 8 characters.' : undefined}
      />

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
      >
        {signingUp ? 'Create account' : 'Sign in'}
      </button>

      <div className="flex justify-between text-xs text-neutral-400">
        <button type="button" onClick={onBack} className="hover:text-neutral-100">
          ← All options
        </button>
        <button type="button" onClick={onSwitch} className="hover:text-neutral-100">
          {signingUp ? 'I already have an account' : 'Create an account'}
        </button>
      </div>
    </form>
  );
}

export function Field({
  label,
  hint,
  value,
  onChange,
  ...input
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-400">{label}</span>
      <input
        {...input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-sky-600"
      />
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}
