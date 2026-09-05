/**
 * The two things the SEO build emits: a `<head>` for any URL on the site, and
 * the full shell for a static guide page.
 *
 * Guide pages carry their own CSS rather than linking the app bundle: Tailwind
 * only emits classes it finds under `src/`, so utility classes written here
 * would be purged. It is ~2KB inline and one fewer request.
 */

import { escapeHtml } from './markdown.mjs';
import { ORIGIN, OG_IMAGE, OG_IMAGE_ALT, SITE_NAME, TWITTER_CARD } from './site.mjs';

export function absolute(path) {
  return `${ORIGIN}${path}`;
}

/**
 * Every tag that varies per URL. `type` is the og:type; `noindex` marks a page
 * that should stay crawlable but out of the index (thin or per-day boards).
 */
export function head({ path, title, description, type = 'website', noindex = false, extra = [] }) {
  const url = absolute(path);
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    noindex
      ? '<meta name="robots" content="noindex,follow" />'
      : '<meta name="robots" content="index,follow,max-image-preview:large" />',
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:image" content="${absolute(OG_IMAGE)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(OG_IMAGE_ALT)}" />`,
    `<meta name="twitter:card" content="${TWITTER_CARD}" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${absolute(OG_IMAGE)}" />`,
    ...extra,
  ];
  return tags.join('\n    ');
}

export function jsonLd(data) {
  // `<` cannot appear inside a script element without ending it early.
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

const GUIDE_CSS = `
*,*::before,*::after{box-sizing:border-box}
:root{color-scheme:dark;--bg:#0a0a0a;--panel:#131316;--line:#262626;--fg:#f5f5f5;--muted:#a3a3a3;--dim:#737373;--accent:#38bdf8}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:17px;line-height:1.65;min-height:100dvh;display:flex;flex-direction:column}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.site-header{border-bottom:1px solid #262626;background:#0a0a0a;position:relative;z-index:50}
.site-header .bar{max-width:80rem;margin:0 auto;padding:.75rem 1rem;display:flex;flex-wrap:wrap;
  align-items:center;justify-content:space-between;gap:.75rem}
.brand{color:#f5f5f5;font-weight:600;letter-spacing:-.025em;display:inline-flex;align-items:center;gap:.5rem;text-decoration:none}
.brand:hover{color:#fff;text-decoration:none}
.site-nav{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:.25rem}
.site-nav a{display:inline-flex;align-items:center;gap:.375rem;color:#a3a3a3;font-size:.875rem;padding:.25rem .5rem;border-radius:.25rem;text-decoration:none}
.site-nav a:hover{color:#f5f5f5;text-decoration:none}
.site-nav a[aria-current="page"]{background:#262626;color:#f5f5f5}
main{max-width:44rem;margin:0 auto;padding:2rem 1rem 4rem;width:100%;flex:1}
.crumbs{font-size:.8125rem;color:var(--dim);margin:0 0 1rem}
h1{font-size:2rem;line-height:1.2;letter-spacing:-.02em;margin:0 0 .5rem}
h2{font-size:1.35rem;line-height:1.3;letter-spacing:-.01em;margin:2.25rem 0 .5rem;
  scroll-margin-top:1rem}
h3{font-size:1.05rem;margin:1.5rem 0 .35rem}
p,ul,ol{margin:0 0 1rem}
ul,ol{padding-left:1.25rem}
li{margin:.3rem 0}
.lead{color:var(--muted);font-size:1.075rem;margin-bottom:1.5rem}
code{background:#1f1f22;border:1px solid var(--line);border-radius:.25rem;
  padding:.05em .35em;font-size:.875em}
pre{background:#131316;border:1px solid var(--line);border-radius:.5rem;
  padding:.85rem 1rem;overflow-x:auto;margin:1.25rem 0;font-size:.875rem;line-height:1.5}
pre code{background:transparent;border:0;padding:0;font-size:inherit;display:block;white-space:pre}
hr{border:0;border-top:1px solid var(--line);margin:2rem 0}
blockquote{margin:1.25rem 0;padding:.75rem 1rem;border-left:3px solid var(--accent);
  background:rgba(56,189,248,.07);border-radius:0 .5rem .5rem 0;color:var(--muted)}
blockquote p{margin:0}
.table-wrap{overflow-x:auto;margin:0 0 1.25rem}
table{border-collapse:collapse;width:100%;font-size:.9375rem}
th,td{border:1px solid var(--line);padding:.5rem .65rem;text-align:left;vertical-align:top}
th{background:var(--panel);font-weight:600}
.toc{border:1px solid var(--line);background:var(--panel);border-radius:.75rem;
  padding:.85rem 1rem;margin:0 0 2rem}
.toc h2{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);
  margin:0 0 .4rem}
.toc ol{margin:0;padding-left:1.1rem;font-size:.9375rem}
.cta{display:block;border:1px solid var(--line);background:var(--panel);border-radius:.75rem;
  padding:1rem;margin:.75rem 0;color:var(--fg)}
.cta:hover{border-color:#525252;text-decoration:none}
.cta strong{display:block;font-size:1.05rem}
.cta span{color:var(--muted);font-size:.9375rem}
.next{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:2.5rem;padding-top:1.5rem;
  border-top:1px solid var(--line)}
.next a{border:1px solid var(--line);border-radius:.5rem;padding:.45rem .75rem;font-size:.9375rem}
.meta{color:var(--dim);font-size:.8125rem;margin-top:2rem}
.site-footer{margin-top:2rem;border-top:1px solid #262626}
.site-footer .bar{max-width:80rem;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:1rem .25rem;padding:1rem;font-size:.75rem;color:#737373}
.site-footer a{color:#737373;text-decoration:none;margin-left:.75rem}
.site-footer a:hover{color:#d4d4d4;text-decoration:none}
`.trim();

const LOGO_ICON_SVG = `<svg viewBox="0 0 32 32" aria-hidden="true" style="width:1.5rem;height:1.5rem;border-radius:.375rem;display:inline-block;vertical-align:middle">
  <rect width="32" height="32" rx="6" fill="#171717" />
  <rect x="5" y="5" width="10" height="10" rx="2" fill="#2f6fd0" />
  <rect x="17" y="5" width="10" height="10" rx="2" fill="#e8c33a" />
  <rect x="5" y="17" width="10" height="10" rx="2" fill="#c8402f" />
  <rect x="17" y="17" width="10" height="10" rx="2" fill="#e9e6dd" />
</svg>`;

const TROPHY_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:1rem;height:1rem;stroke:currentColor;color:#fbbf24;display:inline-block;vertical-align:middle" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
  <path d="M4 22h16" />
  <path d="M10 14.66V17c0 .55-.45 1-1 1H7v4h10v-4h-2c-.55 0-1-.45-1-1v-2.34" />
  <path d="M6 4h12v7a6 6 0 0 1-12 0V4z" />
</svg>`;

/** The nav shared by every guide page. Plain links — matches App.tsx navigation. */
function nav(currentPath) {
  const items = [
    ['/daily', 'Daily', '<span style="font-size:.75rem">📅</span>'],
    ['/practice', 'Practice', '<span style="font-size:.75rem">🎯</span>'],
    ['/leaderboard', 'Leaderboard', TROPHY_ICON_SVG],
    ['/tutorial', 'Learn', ''],
    ['/guide', 'Guide', ''],
  ];
  const links = items
    .map(([href, label, icon]) => {
      const current = href === currentPath || (href === '/guide' && currentPath.startsWith('/guide'))
        ? ' aria-current="page"'
        : '';
      return `<a href="${href}"${current}>${icon ? `${icon} ` : ''}${label}</a>`;
    })
    .join('');
  return `<nav class="site-nav" aria-label="Main">${links}</nav>`;
}

export function guidePage({ path, title, description, headings, html, updated, structuredData, crumbs }) {
  const toc =
    headings.length >= 3
      ? `<nav class="toc" aria-label="On this page"><h2>On this page</h2><ol>${headings
          .map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`)
          .join('')}</ol></nav>`
      : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    ${head({ path, title, description, type: 'article' })}
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <style>${GUIDE_CSS}</style>
    ${structuredData.map(jsonLd).join('\n    ')}
  </head>
  <body>
    <header class="site-header">
      <div class="bar">
        <a class="brand" href="/">
          ${LOGO_ICON_SVG}
          <span>${SITE_NAME}</span>
        </a>
        ${nav(path)}
      </div>
    </header>
    <main>
      <p class="crumbs">${(crumbs ?? [['/guide', 'Guide']])
        .map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`)
        .reduce((trail, link) => `${trail} › ${link}`, `<a href="/">${SITE_NAME}</a>`)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="lead">${escapeHtml(description)}</p>
      ${toc}
      ${html}
      <p class="meta">Last updated ${escapeHtml(updated)}.</p>
    </main>
    <footer class="site-footer">
      <div class="bar">
        <span>${SITE_NAME} — human vs AI consciousness & memory duel.</span>
        <a href="/guide">Guide</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </div>
    </footer>
  </body>
</html>
`;
}
