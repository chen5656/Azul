/**
 * Serves the static guide pages during `vite dev`.
 *
 * The guides are emitted by `scripts/seo-build.mjs`, which only runs after
 * `vite build` — so without this, every `/guide/*` URL falls through to Vite's
 * SPA fallback, the router normalizes the unknown path to `/`, and you silently
 * land on the home page instead of the guide you asked for.
 *
 * It reads the markdown per request rather than caching, so editing a guide and
 * hitting reload shows the change.
 */

import { GUIDES, guidePath } from './site.mjs';
import { renderGuide } from './guides.mjs';

/** `/guide` -> `index`, `/guide/rules` -> `rules`; anything else -> null. */
function slugFor(pathname) {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  return GUIDES.find((slug) => guidePath(slug) === trimmed) ?? null;
}

export function guidePagesDevServer() {
  return {
    name: 'quadro-guide-pages-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const slug = slugFor(new URL(req.url, 'http://localhost').pathname);
        if (!slug) return next();
        try {
          const { html } = await renderGuide(slug);
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
