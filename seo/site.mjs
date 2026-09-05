/**
 * Everything the SEO build needs to know about the site.
 *
 * The app itself is a client-rendered SPA, so nothing here is imported by the
 * bundle. `scripts/seo-build.mjs` reads this after `vite build` and emits one
 * real HTML file per route (§SEO-1), plus the static guide pages (§SEO-3).
 */

export const ORIGIN = 'https://acgame.win';
export const SITE_NAME = 'MirrorLink';
export const OG_IMAGE = '/og.png';
export const OG_IMAGE_ALT =
  'MirrorLink — a human vs AI consciousness & memory duel.';
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
    title: 'MirrorLink — human mind vs AI duel over memory and consciousness',
    description:
      'A strategic duel between human consciousness and a synthetic replica. Extract tokens from attention nodes, anchor your memory, resist hallucination. Free, no sign-in, works offline.',
    prose: {
      h1: 'MirrorLink',
      lead:
        'A fast-paced consciousness duel against an AI opponent. Extract memory tokens from shared attention nodes, align them in your context lines, and etch them into permanent memory — before the synthetic replica steals your identity. Free, no download, plays in your browser. One deal a day, the same for everyone, scored on your winning margin.',
      links: [
        ['/daily', 'Daily Challenge — one deal for everyone, scored on margin'],
        ['/practice', 'Practice — any opponent, any deal, untimed'],
        ['/tutorial', 'Learn to play — a guided round on the neural board'],
        ['/leaderboard', "Leaderboard — today's board, one per opponent"],
        ['/guide/story', 'The Story — The Mirror Link Protocol'],
        ['/guide/rules', 'The rules'],
        ['/guide/scoring', 'How scoring works'],
        ['/guide/strategy', 'Strategy guide'],
        ['/guide/games-like-azul', 'Games like Azul — how MirrorLink compares'],
        ['/guide', 'All the lore, rules, scoring and strategy guides'],
      ],
    },
  },
  {
    path: '/daily',
    title: 'Daily Challenge — MirrorLink',
    description:
      "Today's MirrorLink deal, identical for every player. Pick your opponent difficulty, maximize your score margin, and take the lead on the daily board.",
    prose: {
      h1: 'Daily Challenge',
      lead:
        'One deal a day, dealt from a shared seed so every player faces the same attention nodes in the same order. Choose one of six AI opponents, play the game out, and your winning margin goes on that opponent’s board. One recorded attempt per opponent per day.',
      links: [
        ['/leaderboard', "See today's leaderboard"],
        ['/guide/rules', 'Read the rules first'],
      ],
    },
  },
  {
    path: '/practice',
    title: 'Practice — MirrorLink',
    description:
      'Play MirrorLink untimed against any of six AI opponents, on any deal. Nothing is recorded, and it works offline.',
    prose: {
      h1: 'Practice',
      lead:
        'Any opponent, any deal, untimed and unrecorded. Practice runs entirely in your browser and keeps working with no network once the page has been loaded.',
      links: [
        ['/guide/story', 'The Story — The Mirror Link Protocol'],
        ['/guide/strategy', 'Strategy guide'],
        ['/guide/difficulty', 'What the six opponents actually do'],
      ],
    },
  },
  {
    path: '/tutorial',
    title: 'Learn to play MirrorLink — a guided round',
    description:
      'A two-minute scripted round: attention drafting, context lines, hallucination overload, and how permanent memory scores. No sign-in, nothing recorded.',
    prose: {
      h1: 'Learn to play',
      lead:
        'A scripted round on the real neural board walks you through the two clicks of a turn, why overflow causes hallucinations, and how crystallized memory scores connected nodes. About two minutes, nothing timed or recorded.',
      links: [
        ['/guide/story', 'The Story — The Mirror Link Protocol'],
        ['/guide/rules', 'The full written rules'],
        ['/guide/scoring', 'How scoring works'],
      ],
    },
  },
  {
    path: '/leaderboard',
    title: 'Leaderboard — MirrorLink Daily',
    description:
      "Today's MirrorLink leaderboard, with a separate board for each of the six AI opponents. Ranked by score margin, then by time.",
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
  'story',
  'rules',
  'scoring',
  'strategy',
  'difficulty',
  'games-like-azul',
  'faq',
];

/** Where a guide slug is served from. */
export function guidePath(slug) {
  return slug === 'index' ? '/guide' : `/guide/${slug}`;
}

/**
 * The legal pages. They are static HTML for the same reason the guides are:
 * Google's OAuth consent screen, and anyone checking what the app does with
 * their data, must be able to read them without running the SPA — and the SPA
 * router normalizes unknown paths to `/`, so a policy served only by the app
 * would silently be the home page. Files live in `content/legal/`.
 */
export const LEGAL = ['privacy', 'terms'];

export function legalPath(slug) {
  return `/${slug}`;
}
