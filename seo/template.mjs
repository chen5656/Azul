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
:root{color-scheme:dark;--bg:#0a0a0a;--panel:#131316;--line:#292929;--fg:#f5f5f5;--muted:#a3a3a3;--dim:#737373;--accent:#38bdf8}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:17px;line-height:1.65}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.site-header{border-bottom:1px solid var(--line)}
.bar{max-width:64rem;margin:0 auto;padding:.75rem 1rem;display:flex;flex-wrap:wrap;
  align-items:center;justify-content:space-between;gap:.5rem .75rem}
.brand{color:var(--fg);font-weight:600;letter-spacing:-.01em}
.site-nav{display:flex;flex-wrap:wrap;gap:.25rem}
.site-nav a{color:var(--muted);font-size:.875rem;padding:.25rem .5rem;border-radius:.25rem}
.site-nav a:hover{color:var(--fg);text-decoration:none}
.site-nav a[aria-current="page"]{background:#262626;color:var(--fg)}
main{max-width:44rem;margin:0 auto;padding:2rem 1rem 4rem}
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
footer{border-top:1px solid var(--line);color:var(--dim);font-size:.8125rem}
footer .bar{justify-content:center;padding:1.25rem 1rem}
`.trim();

/** The nav shared by every guide page. Plain links — no JS on these pages. */
function nav(currentPath) {
  const items = [
    ['/', 'Home'],
    ['/tutorial', 'Learn'],
    ['/daily', 'Daily'],
    ['/practice', 'Practice'],
    ['/leaderboard', 'Leaderboard'],
    ['/guide', 'Guide'],
  ];
  const links = items
    .map(([href, label]) => {
      const current = href === currentPath ? ' aria-current="page"' : '';
      return `<a href="${href}"${current}>${label}</a>`;
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
        <a class="brand" href="/">${SITE_NAME}</a>
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
    <footer><div class="bar">${SITE_NAME} — a free daily tile-drafting puzzle.</div></footer>
  </body>
</html>
`;
}
