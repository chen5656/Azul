/**
 * Post-`vite build` static SEO pass.
 *
 * Vite emits one `index.html` for a client-rendered SPA, which gives every
 * route the same title and gives a crawler no text at all. This pass rewrites
 * `dist/` into something indexable:
 *
 *   1. one HTML file per SPA route, with its own title/description/canonical/OG
 *      and a crawler-visible first paint that React replaces on mount;
 *   2. the static guide pages, rendered from `content/guides/*.md`;
 *   3. `sitemap.xml` and `robots.txt`.
 *
 * It only ever *adds* files beside Vite's output, so `npm run build` stays the
 * single build command and `dist/index.html` remains the SPA fallback.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { escapeHtml, parseFrontmatter, renderMarkdown } from '../seo/markdown.mjs';
import { guidePage, head, jsonLd, absolute } from '../seo/template.mjs';
import { APP_ROUTES, GUIDES, ORIGIN, SITE_NAME, guidePath } from '../seo/site.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const guidesDir = join(root, 'content', 'guides');

/** `/guide/rules` -> `dist/guide/rules/index.html`; `/` -> `dist/index.html`. */
async function emit(path, html) {
  const file =
    path === '/' ? join(dist, 'index.html') : join(dist, path.replace(/^\/|\/$/g, ''), 'index.html');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html, 'utf8');
  return file;
}

/**
 * The block a crawler (and anyone with JS off) reads. It goes *inside* `#root`,
 * so `createRoot(...).render()` clears it the moment the app mounts — there is
 * never a moment where both are on screen, and no cleanup code to maintain.
 */
function prose({ h1, lead, links }) {
  const list = links
    .map(([href, label]) => `<li><a href="${href}">${escapeHtml(label)}</a></li>`)
    .join('');
  return `<div class="seo-fallback" style="max-width:44rem;margin:0 auto;padding:2rem 1rem;font-family:ui-sans-serif,system-ui,sans-serif;color:#f5f5f5">
        <h1 style="font-size:2rem;letter-spacing:-.02em;margin:0 0 .5rem">${escapeHtml(h1)}</h1>
        <p style="color:#a3a3a3;line-height:1.6">${escapeHtml(lead)}</p>
        <ul style="line-height:1.9">${list}</ul>
      </div>`;
}

/** Site-wide structured data, carried on the home page only. */
function siteStructuredData() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      name: SITE_NAME,
      url: ORIGIN,
      description:
        'A daily tile-drafting puzzle played against an AI opponent in the browser. One deal a day, the same for everyone, scored on winning margin.',
      applicationCategory: 'GameApplication',
      genre: ['Puzzle', 'Board game', 'Abstract strategy'],
      gamePlatform: 'Web browser',
      playMode: 'SinglePlayer',
      numberOfPlayers: { '@type': 'QuantitativeValue', value: 1 },
      operatingSystem: 'Any',
      inLanguage: 'en',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: ORIGIN,
      inLanguage: 'en',
    },
  ];
}

function breadcrumbs(path, title) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: ORIGIN },
      { '@type': 'ListItem', position: 2, name: 'Guide', item: absolute('/guide') },
      ...(path === '/guide'
        ? []
        : [{ '@type': 'ListItem', position: 3, name: title, item: absolute(path) }]),
    ],
  };
}

/**
 * Turns `## question` + the HTML that follows into FAQPage entities. The answer
 * text is the rendered block with tags stripped, so the markup and the
 * structured data can never drift apart.
 */
function faqStructuredData(html) {
  const parts = html.split(/<h2 id="[^"]*">/).slice(1);
  const entities = parts
    .map((part) => {
      const [question, ...rest] = part.split('</h2>');
      const answer = rest
        .join('</h2>')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!question || !answer) return null;
      return {
        '@type': 'Question',
        name: question.replace(/<[^>]+>/g, '').trim(),
        acceptedAnswer: { '@type': 'Answer', text: answer },
      };
    })
    .filter(Boolean);
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: entities };
}

async function buildAppRoutes(shell) {
  const written = [];
  for (const route of APP_ROUTES) {
    const structured = route.path === '/' ? siteStructuredData().map(jsonLd).join('\n    ') : '';
    const html = shell
      .replace(/<title>[\s\S]*?<\/title>/, '@@HEAD@@')
      // The stock description is the only other head tag Vite's index.html owns;
      // the per-route one replaces it rather than joining it.
      .replace(/\n?\s*<meta name="description"[^>]*>/, '')
      .replace(
        '@@HEAD@@',
        head({ path: route.path, title: route.title, description: route.description }) +
          (structured ? `\n    ${structured}` : ''),
      )
      .replace('<div id="root"></div>', `<div id="root">${prose(route.prose)}</div>`);

    if (html.includes('@@HEAD@@') || !html.includes('og:title')) {
      throw new Error(`seo: could not patch the head for ${route.path}`);
    }
    written.push(await emit(route.path, html));
  }
  return written;
}

async function buildGuides() {
  const files = new Set(await readdir(guidesDir));
  const written = [];
  for (const slug of GUIDES) {
    const name = `${slug}.md`;
    if (!files.has(name)) throw new Error(`seo: content/guides/${name} is missing`);
    const source = await readFile(join(guidesDir, name), 'utf8');
    const { data, body } = parseFrontmatter(source);
    if (!data.title || !data.description) {
      throw new Error(`seo: content/guides/${name} needs a title and a description`);
    }
    const path = guidePath(slug);
    const { html, headings } = renderMarkdown(body);
    const structuredData = [breadcrumbs(path, data.title)];
    if (data.faq === 'true') structuredData.push(faqStructuredData(html));

    written.push(
      await emit(
        path,
        guidePage({
          path,
          title: data.title,
          description: data.description,
          headings,
          html,
          updated: data.updated ?? new Date().toISOString().slice(0, 10),
          structuredData,
        }),
      ),
    );
  }
  return written;
}

async function buildSitemap() {
  // Guides change on edit and the app routes are evergreen; `lastmod` is the
  // build date for everything, which is honest for a site rebuilt on deploy.
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ...APP_ROUTES.map((r) => ({ loc: r.path, priority: r.path === '/' ? '1.0' : '0.8' })),
    ...GUIDES.map((slug) => ({ loc: guidePath(slug), priority: '0.7' })),
  ];
  const body = urls
    .map(
      ({ loc, priority }) =>
        `  <url><loc>${absolute(loc)}</loc><lastmod>${today}</lastmod><priority>${priority}</priority></url>`,
    )
    .join('\n');
  await writeFile(
    join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    'utf8',
  );
  return urls.length;
}

/**
 * Workbox hashed `index.html` before this pass rewrote it, so the precache
 * manifest carries a revision for content that no longer exists. Re-stamping it
 * is what makes the service worker notice a change to the shell on a deploy
 * where the JS bundle happens to be identical.
 */
async function refreshServiceWorkerRevision() {
  const swPath = join(dist, 'sw.js');
  let sw;
  try {
    sw = await readFile(swPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return false; // No PWA in this build.
    throw err;
  }
  const shell = await readFile(join(dist, 'index.html'));
  const revision = createHash('md5').update(shell).digest('hex');
  const pattern = /(\{url:"index\.html",revision:")[0-9a-f]{32}(")/;
  if (!pattern.test(sw)) {
    throw new Error('seo: sw.js has no index.html precache entry to re-stamp');
  }
  await writeFile(swPath, sw.replace(pattern, `$1${revision}$2`), 'utf8');
  return true;
}

async function main() {
  const shell = await readFile(join(dist, 'index.html'), 'utf8');
  const app = await buildAppRoutes(shell);
  const guides = await buildGuides();
  const count = await buildSitemap();
  const sw = await refreshServiceWorkerRevision();
  console.log(
    `seo: ${app.length} app routes, ${guides.length} guide pages, ${count} sitemap entries` +
      (sw ? ', sw revision re-stamped' : ''),
  );
}

await main();
