/**
 * Serves the static guide and legal pages during `vite dev`.
 *
 * The guides are emitted by `scripts/seo-build.mjs`, which only runs after
 * `vite build` — so without this, every `/guide/*` URL falls through to Vite's
 * SPA fallback, the router normalizes the unknown path to `/`, and you silently
 * land on the home page instead of the guide you asked for.
 *
 * It reads the markdown per request rather than caching, so editing a guide and
 * hitting reload shows the change.
 */

import { GUIDES, LEGAL, guidePath, legalPath } from './site.mjs';
import { renderGuide, renderLegal } from './guides.mjs';

/** The path -> renderer map for every page the SEO pass emits as static HTML. */
function rendererFor(pathname) {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  const guide = GUIDES.find((slug) => guidePath(slug) === trimmed);
  if (guide) return () => renderGuide(guide);
  const legal = LEGAL.find((slug) => legalPath(slug) === trimmed);
  if (legal) return () => renderLegal(legal);
  return null;
}

export function guidePagesDevServer() {
  return {
    name: 'quadro-guide-pages-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const render = rendererFor(new URL(req.url, 'http://localhost').pathname);
        if (!render) return next();
        try {
          const { html } = await render();
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(html);
        } catch (err) {
          next(err);
        }
      });
    },
  };
}
