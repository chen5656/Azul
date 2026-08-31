/**
 * Everything the SEO build needs to know about the site.
 *
 * The app itself is a client-rendered SPA, so nothing here is imported by the
 * bundle. `scripts/seo-build.mjs` reads this after `vite build` and emits one
 * real HTML file per route (§SEO-1), plus the static guide pages (§SEO-3).
 */

export const ORIGIN = 'https://acgame.win';
export const SITE_NAME = 'Quadro';
export const OG_IMAGE = '/og.png';
export const OG_IMAGE_ALT =
  'Quadro — a daily tile-drafting puzzle played against an AI opponent.';
export const TWITTER_CARD = 'summary_large_image';

/**
 * The SPA routes. `prose` is the crawler-visible first paint: React wipes
 * `#root` on mount, so this is what a non-JS client (and a first-pass crawler)
 * reads. It must describe the page honestly — it is the same claim the rendered
 * page makes, not a keyword shim.
 */
export const APP_ROUTES = [
  {
    path: '/',
    title: 'Quadro — a daily tile-drafting puzzle',
    description:
      'One tile-drafting deal a day, the same for everyone, played against an AI opponent. Score is your winning margin. Free, no install, works offline.',
    prose: {
      h1: 'Quadro',
      lead:
        'A tile-drafting duel. Draft a color, stage it on a pattern line, settle it onto your wall — and beat the machine by a wider margin than anyone else did today.',
      links: [
        ['/daily', 'Daily Challenge — one deal for everyone, scored on margin'],
        ['/practice', 'Practice — any opponent, any deal, untimed'],
        ['/tutorial', 'Learn to play — a guided round on the real board'],
        ['/leaderboard', "Leaderboard — today's board, one per opponent"],
        ['/guide', 'Rules, scoring and strategy guides'],
      ],
    },
  },
  {
    path: '/daily',
    title: 'Daily Challenge — Quadro',
    description:
      "Today's Quadro deal, identical for every player. Pick your opponent difficulty, maximize your score margin, and take the lead on the daily board.",
    prose: {
      h1: 'Daily Challenge',
      lead:
        'One deal a day, dealt from a shared seed so every player faces the same factories in the same order. Choose one of six AI opponents, play the game out, and your winning margin goes on that opponent’s board. One recorded attempt per opponent per day.',
      links: [
        ['/leaderboard', "See today's leaderboard"],
        ['/guide/rules', 'Read the rules first'],
      ],
    },
  },
  {
    path: '/practice',
    title: 'Practice — Quadro',
    description:
      'Play Quadro untimed against any of six AI opponents, on any deal. Nothing is recorded, and it works offline.',
    prose: {
      h1: 'Practice',
      lead:
        'Any opponent, any deal, untimed and unrecorded. Practice runs entirely in your browser and keeps working with no network once the page has been loaded.',
      links: [
        ['/guide/strategy', 'Strategy guide'],
        ['/guide/difficulty', 'What the six opponents actually do'],
      ],
    },
  },
  {
    path: '/tutorial',
    title: 'Learn to play Quadro — a guided round',
    description:
      'A two-minute scripted round on the real board: drafting, pattern lines, the floor line, and how the wall scores. No sign-in, nothing recorded.',
    prose: {
      h1: 'Learn to play',
      lead:
        'A scripted round on the real board walks you through the two clicks of a turn, why overflow costs points, and how a settled tile scores the runs it joins. About two minutes, nothing timed or recorded.',
      links: [
        ['/guide/rules', 'The full written rules'],
        ['/guide/scoring', 'How scoring works'],
      ],
    },
  },
  {
    path: '/leaderboard',
    title: 'Leaderboard — Quadro Daily',
    description:
      "Today's Quadro leaderboard, with a separate board for each of the six AI opponents. Ranked by score margin, then by time.",
    prose: {
      h1: 'Leaderboard',
      lead:
        'Today’s board, ranked by your margin over the AI opponent and then by elapsed time. Each of the six opponents has its own board — a margin against Extreme and a margin against Easy are not the same achievement, so they are never mixed.',
      links: [
        ['/daily', "Play today's deal"],
        ['/guide/difficulty', 'How the six opponents compare'],
      ],
    },
  },
];

/** Guide slugs, in nav and sitemap order. Files live in `content/guides/`. */
export const GUIDES = [
  'index',
  'rules',
  'scoring',
  'strategy',
  'difficulty',
  'faq',
];

/** Where a guide slug is served from. */
export function guidePath(slug) {
  return slug === 'index' ? '/guide' : `/guide/${slug}`;
}
