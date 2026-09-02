---
title: Privacy Policy
description: What Quadro stores, why, where it lives, how long it stays, and how to delete it.
updated: 2026-09-02
---

Quadro is a browser game at [acgame.win](https://acgame.win). This page describes
exactly what the game stores about you. It is written against what the code
actually does, not against what a generic policy template says.

Two things worth stating up front, because they are unusual enough to be worth
knowing:

- **There is no analytics, no advertising, and no third-party tracking.** No Google Analytics, no pixels, no ad network, no session recording. The only network requests the page makes are to Quadro's own API.
- **You can play the entire game without an account.** Learn, Practice and the Daily all work signed out. Signing in gates exactly one thing: putting a time on the public leaderboard.

## What is stored, and why

### If you never sign in

Nothing is stored about you on the server. Your display preferences (board
style, display scale) are kept in your browser's `localStorage` under the
`quadro.v1.` prefix and are never sent anywhere. Clearing your browser data
removes them.

### If you tap "Just start playing"

This creates an anonymous account. It holds a generated id and nothing else —
no email, no name. It exists so a time can go on the board. If you later sign in
with a provider, this account is merged into that one and your posted times come
with you.

### If you sign in with Google, Apple, LinkedIn, or an email and password

| Stored | Where it comes from |
| --- | --- |
| Email address | The provider, or what you typed |
| Name as the provider reports it | Google / Apple / LinkedIn |
| Nickname | You typed it |
| Profile picture | You uploaded it |
| Password, hashed | Only for email sign-ups. Never stored in readable form |
| The provider's access and refresh tokens | The provider, at sign-in |
| IP address and browser user-agent | Recorded on each session record |

**Your real name is never shown to anyone.** The leaderboard, your board, and
every other public surface show your nickname. The provider-supplied name is
stored because the sign-in library writes it, and nothing user-facing reads it.
If you set no nickname, the board shows an anonymous fallback like
`player-a1b2c3`.

The IP address and user-agent are recorded by the session library as part of
each sign-in record. They are not used for analytics, profiling, or location.

### When you post a score

Each recorded attempt stores the puzzle date, your account id, your nickname as
it read at that moment, your elapsed time, both final scores, the opponent
difficulty, the number of rounds, and the client version. Attempts that include
a replay also store the replay code, which is a compact record of the moves
played in that game.

A separate audit record logs every submission — accepted or rejected — with its
reason. It is what makes the per-hour submission limit enforceable and what
allows a polluted leaderboard to be investigated.

## Where it lives

Everything is on [Cloudflare](https://www.cloudflare.com): accounts and scores
in a Cloudflare D1 database, uploaded profile pictures in Cloudflare R2. The
site and the API run on Cloudflare's network. Nothing is sold, rented, or shared
with anyone, and no data is handed to any third party for advertising.

Profile pictures are served back through the API rather than from a public
bucket URL, so an image stops being reachable as soon as you replace or delete
it.

## How long it stays

- **Scores and submission audit records**: deleted automatically after 90 days by a nightly job.
- **Account, nickname, profile picture, linked sign-in methods**: kept until you delete your account.
- **Sign-in sessions**: expire 30 days after they were last used.

## Deleting your account

Deleting your account removes the account itself, not merely its scores: the
account record, every sign-in session, every linked provider, the stored
provider tokens, the password hash, your uploaded profile pictures, all of your
scores and all of your submission audit records. It takes effect on the next
request — nothing keeps working on a cached session afterwards. It cannot be
undone.

If you cannot reach the in-app control, email the address below and ask, from
the address on the account.

## Cookies

Quadro sets one cookie, and only after you sign in: an `HttpOnly` session
cookie, on `acgame.win` only, marked `SameSite=Lax` and `Secure`. It is what
keeps you signed in. There are no advertising cookies and no third-party
cookies.

The game also uses a service worker to cache the app so it plays offline. That
cache holds the game itself — code, styles, fonts — never your data, and never
any API response.

## Children

Quadro is not directed at children under 13 and does not knowingly collect
information from them.

## Changes

If this policy changes materially, the date at the bottom of this page changes
with it.

## Contact

Questions, or a deletion request: <hj.ch.chen@gmail.com>.
