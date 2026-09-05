/**
 * The landing page (§9.1).
 *
 * This is the one page most visitors arrive on without knowing what Quadro is,
 * so it leads with what the game *is* and what it looks like, and only then
 * offers the mode choice. The guide pages are static HTML emitted by
 * `scripts/seo-build.mjs`, outside the SPA router — they are linked with plain
 * anchors on purpose, so they do a real navigation.
 */

import { HeroBoard } from '../components/HeroBoard';
import { Link } from '../router';

export function Home() {
  return (
    <div className="mx-auto max-w-5xl pb-12">
      {/* ---- Hero ---------------------------------------------------- */}
      <section className="grid items-center gap-8 py-8 sm:py-12 lg:grid-cols-2">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Quadro</h1>
          <p className="mt-3 text-xl text-neutral-200 sm:text-2xl">
            A fast tile-drafting strategy game, one-on-one against an AI opponent.
          </p>
          <p className="mt-3 max-w-prose leading-relaxed text-neutral-400">
            Draft tiles from factories, build your wall, and block what your rival needs.
            Easy to learn, hard to master.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/daily"
              className="rounded-lg bg-sky-500 px-6 py-2.5 font-semibold text-neutral-950 shadow-sm transition hover:bg-sky-400"
            >
              Play today's challenge
            </Link>
            <Link
              to="/practice"
              className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-5 py-2.5 font-semibold text-neutral-200 transition hover:border-neutral-500 hover:text-neutral-100"
            >
              Practice vs AI
            </Link>
          </div>

          <p className="mt-4 text-xs text-neutral-500">
            Free · No download · No sign-in · Plays offline in browser
          </p>
        </div>

        <HeroBoard />
      </section>

      {/* ---- How it works (Quick 3-step visual guide) ---------------- */}
      <section className="border-t border-neutral-800/80 py-8">
        <h2 className="text-xl font-semibold tracking-tight text-neutral-100">
          How it works
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="flex items-center gap-2 font-semibold text-sky-400">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/10 text-xs font-bold text-sky-400">1</span>
              Draft
            </div>
            <p className="mt-1.5 text-sm text-neutral-400 leading-relaxed">
              Take all tiles of one color from a factory. Leftovers drop to the center pool.
            </p>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="flex items-center gap-2 font-semibold text-amber-400">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/10 text-xs font-bold text-amber-400">2</span>
              Build
            </div>
            <p className="mt-1.5 text-sm text-neutral-400 leading-relaxed">
              Complete pattern lines to settle tiles onto your 5×5 wall and score combos.
            </p>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="flex items-center gap-2 font-semibold text-rose-400">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/10 text-xs font-bold text-rose-400">3</span>
              Block
            </div>
            <p className="mt-1.5 text-sm text-neutral-400 leading-relaxed">
              Deny colors your opponent desperately needs, or force them to overflow.
            </p>
          </div>
        </div>
      </section>

      {/* ---- What is Quadro (Compact & SEO-friendly) ----------------- */}
      <section className="border-t border-neutral-800/80 py-8">
        <div className="max-w-prose text-sm leading-relaxed text-neutral-400">
          <p>
            Like abstract tile-placement board games such as <em>Azul</em>? Quadro gives you
            the same rich tactical depth in quick head-to-head browser matches against distinct AI personalities.{' '}
            <a href="/guide/games-like-azul" className="text-sky-400 underline hover:text-sky-300">
              Compare Quadro to Azul
            </a>
            .
          </p>
        </div>
      </section>

      {/* ---- Guide links (SEO link equity) --------------------------- */}
      <section className="border-t border-neutral-800/80 py-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Guides & Documentation
        </h2>
        <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2 text-xs">
          {[
            ['/guide/rules', 'Rules of play'],
            ['/guide/scoring', 'Scoring system'],
            ['/guide/strategy', 'Strategy guide'],
            ['/guide/difficulty', 'AI opponents'],
            ['/guide/games-like-azul', 'Games like Azul'],
            ['/guide/faq', 'FAQ'],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href} className="text-neutral-400 underline transition hover:text-neutral-200">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
