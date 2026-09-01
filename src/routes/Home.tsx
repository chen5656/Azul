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
import { puzzleIdFor } from '../daily/puzzle';
import { storage } from '../storage';

function Pillar({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <h3 className="text-base font-semibold text-neutral-100">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">{children}</p>
    </div>
  );
}

export function Home() {
  const puzzleId = puzzleIdFor();
  const playedToday = storage.lastDailyPlayed() === puzzleId;

  return (
    <div className="mx-auto max-w-5xl pb-12">
      {/* ---- Hero ---------------------------------------------------- */}
      <section className="grid items-center gap-8 py-8 sm:py-12 lg:grid-cols-2">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Quadro</h1>
          <p className="mt-3 text-xl text-neutral-200 sm:text-2xl">
            A fast tile-drafting strategy game, one-on-one against an AI opponent.
          </p>
          <p className="mt-4 max-w-prose leading-relaxed text-neutral-400">
            Draft colored tiles from the factories, build them into your wall, and take the
            colors your opponent needs before they can. Easy to learn, hard to master, and
            every deal plays differently.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/daily"
              className="rounded-lg bg-sky-500 px-5 py-2.5 font-semibold text-neutral-950 transition hover:bg-sky-400"
            >
              Play today's challenge
            </Link>
            <Link
              to="/practice"
              className="rounded-lg border border-neutral-600 px-5 py-2.5 font-semibold text-neutral-100 transition hover:border-neutral-400"
            >
              Practice vs AI
            </Link>
          </div>

          <p className="mt-5 text-sm text-neutral-500">
            Free · No download · No sign-in to play · Works offline in your browser
          </p>
        </div>

        <HeroBoard />
      </section>

      {/* ---- How it works -------------------------------------------- */}
      <section className="border-t border-neutral-800 py-10">
        <h2 className="text-2xl font-semibold tracking-tight">Draft. Build. Block.</h2>
        <p className="mt-2 max-w-prose text-neutral-400">
          Each turn you take every tile of one color from one factory, or whatever has been
          left in the center. Two clicks, and the choice is never only about you.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Pillar title="Draft">
            Pick one color from a factory. Everything you leave behind falls into the center,
            where your opponent can take it next.
          </Pillar>
          <Pillar title="Build">
            Fill a pattern line to complete it, and one tile settles onto your wall. Tiles
            placed next to your own score several times what an isolated tile does.
          </Pillar>
          <Pillar title="Block">
            Taking a color you cannot use is sometimes the best move on the board — if it was
            the color your opponent was one tile away from.
          </Pillar>
        </div>
      </section>

      {/* ---- Daily Challenge ------------------------------------------ */}
      <section className="border-t border-neutral-800 py-10">
        <h2 className="text-2xl font-semibold tracking-tight">
          One board. One opponent. One chance each day.
        </h2>
        <p className="mt-2 max-w-prose leading-relaxed text-neutral-400">
          Everyone in the world plays the same deal, dealt from a shared seed. Choose one of
          six AI opponents, beat it by the widest margin you can, and see where that puts you
          on the day's board. One recorded attempt per opponent, and the deal rolls over at
          midnight New York time.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Link
            to="/daily"
            className="rounded-lg bg-sky-500 px-5 py-2.5 font-semibold text-neutral-950 transition hover:bg-sky-400"
          >
            Play today's game
          </Link>
          <span className="text-sm text-neutral-500">
            {puzzleId}
            {playedToday && <span className="ml-2 text-sky-300">you've played today</span>}
          </span>
          <Link to="/leaderboard" className="text-sm text-neutral-400 underline hover:text-neutral-200">
            Today's leaderboard
          </Link>
        </div>
      </section>

      {/* ---- Modes ----------------------------------------------------- */}
      <section className="border-t border-neutral-800 py-10">
        <h2 className="text-2xl font-semibold tracking-tight">Ways to play</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Link
            to="/daily"
            className="rounded-xl border border-sky-800 bg-sky-950/40 p-4 transition hover:border-sky-500"
          >
            <h3 className="text-lg font-semibold">Daily Challenge</h3>
            <p className="mt-1 text-sm text-neutral-400">
              One deal for everyone. Pick your difficulty, maximize your score margin, take the
              lead on today's board.
            </p>
          </Link>

          <Link
            to="/practice"
            className="rounded-xl border border-neutral-700 bg-neutral-900/60 p-4 transition hover:border-neutral-500"
          >
            <h3 className="text-lg font-semibold">Practice</h3>
            <p className="mt-1 text-sm text-neutral-400">
              Any opponent, any deal, untimed. Nothing is recorded, and it works offline.
            </p>
          </Link>

          <Link
            to="/tutorial"
            className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 transition hover:border-neutral-600"
          >
            <h3 className="text-lg font-semibold">Learn to play</h3>
            <p className="mt-1 text-sm text-neutral-400">
              A guided round on the real board covers drafting, pattern lines, the floor line
              and scoring. Two minutes.
            </p>
          </Link>
        </div>
      </section>

      {/* ---- What is Quadro -------------------------------------------- */}
      <section className="border-t border-neutral-800 py-10">
        <h2 className="text-2xl font-semibold tracking-tight">What is Quadro?</h2>
        <div className="mt-3 max-w-prose space-y-4 leading-relaxed text-neutral-400">
          <p>
            Quadro is a free browser-based strategy game built around tile drafting, pattern
            building and tactical blocking. You play one-on-one against an AI opponent on a
            five-by-five wall: draft tiles from five factories, stage them on your pattern
            lines, and settle completed lines onto the wall, where they score for every run
            they join. Tiles you take but cannot place land on your floor line and cost you
            points, so every draft is a trade.
          </p>
          <p>
            If you like abstract board games, tile-placement games, or short head-to-head
            strategy games such as <em>Azul</em>, Quadro is built to give you the same kind of
            decision in a match that takes a few minutes and needs nobody else at the table.{' '}
            <a href="/guide/games-like-azul" className="text-sky-400 underline hover:text-sky-300">
              How Quadro compares to Azul
            </a>
            .
          </p>
        </div>
      </section>

      {/* ---- Guide links ------------------------------------------------ */}
      <section className="border-t border-neutral-800 py-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Read the guide
        </h2>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {[
            ['/guide/rules', 'The rules'],
            ['/guide/scoring', 'How scoring works'],
            ['/guide/strategy', 'Strategy guide'],
            ['/guide/difficulty', 'The six opponents'],
            ['/guide/games-like-azul', 'Games like Azul'],
            ['/guide/faq', 'FAQ'],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href} className="text-neutral-400 underline hover:text-neutral-200">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
