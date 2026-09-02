# Authentication

Sign-in is [better-auth](https://www.better-auth.com) running inside the Worker.
There is no third-party auth service and no key built into the client: the
browser gets an HttpOnly session cookie on `acgame.win`, and every `/api/*` call
carries it.

## What a player can do

| Route in | What it costs them |
| --- | --- |
| **Just start playing** | Nothing. An anonymous account is created on the spot and can post scores immediately. |
| Google / Apple / LinkedIn | One tap in the provider's own flow. |
| Email + password | An address and a password (8+ characters). |

An anonymous player who later links a provider keeps their posted times:
`linkAnonymousScores` in `worker/auth/index.ts` moves the `scores` and
`submissions_audit` rows onto the real account before better-auth deletes the
anonymous user. Signing in with a second provider on an address that already
has an account links to it rather than creating a duplicate.

**The leaderboard never shows a real name.** Providers hand one back and
better-auth stores it in `user.name`, but the board reads `user.nickname`, which
the player types themselves; with none set it falls back to `player-<6 chars>`.

Avatars are uploaded to R2 (`PUT /api/me/avatar`, raw bytes, 1 MB cap) and
served back through the Worker at `/api/avatar/<userId>/<uuid>.<ext>`, which is
what keeps the CSP at `img-src 'self'`.

## Layout

| File | What it is |
| --- | --- |
| `worker/auth/options.ts` | The one config, shared by the Worker and the schema generator. |
| `worker/auth/index.ts` | The instance, the session lookup, and anonymous-account linking. |
| `worker/avatar.ts` | R2 upload and serve. |
| `src/auth/` | The client, the identity context, and the three dialogs. |
| `worker/migrations/004_auth.sql` | Generated — see below. |

## Changing the schema

Never hand-edit `worker/migrations/004_auth.sql`. Adding a plugin or a user
field changes the tables better-auth expects, so regenerate it from the config:

```bash
node scripts/gen-auth-schema.mjs
```

Then apply it:

```bash
npx wrangler d1 execute quadro --remote --file worker/migrations/004_auth.sql
```

## Configuration

`ALLOWED_ORIGIN` is a plain var in `wrangler.jsonc`. Everything else is a
secret; locally they live in `.dev.vars` (see `.dev.vars.example`), and in
production they are set with `wrangler secret put`:

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put APPLE_CLIENT_ID
npx wrangler secret put APPLE_CLIENT_SECRET
npx wrangler secret put LINKEDIN_CLIENT_ID
npx wrangler secret put LINKEDIN_CLIENT_SECRET
```

A provider whose pair is unset is simply not offered: `GET /api/providers`
reports what is configured and the dialog renders only those buttons, so a
half-configured provider can never render a button that dead-ends after the
redirect.

### Redirect URIs to register

The callback is always `<origin>/api/auth/callback/<provider>`:

```
https://acgame.win/api/auth/callback/google
https://acgame.win/api/auth/callback/apple
https://acgame.win/api/auth/callback/linkedin
```

For local development, the same paths on `http://localhost:5173` — Vite proxies
`/api` to the Worker, so the browser stays on one origin and the session cookie
is an ordinary same-origin cookie.

### Per-provider notes

- **Google** — Cloud Console → APIs & Services → Credentials → OAuth client ID,
  type "Web application".
- **Apple** — needs a paid Apple Developer account. `APPLE_CLIENT_ID` is the
  **Services ID** (not the App ID). `APPLE_CLIENT_SECRET` is an ES256 JWT signed
  with the `.p8` key, and Apple caps its lifetime at six months, so it has to be
  regenerated on a calendar reminder. Apple returns the player's name only on
  the very first authorization, and may hand back a private relay email address
  — which is why `allowDifferentEmails` is on.
- **LinkedIn** — the app needs the "Sign In with LinkedIn using OpenID Connect"
  product enabled, which is a separate request in the LinkedIn developer portal.
