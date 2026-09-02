import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// @ts-expect-error -- plain .mjs shared with the post-build SEO pass, no types.
import { guidePagesDevServer } from './seo/devGuides.mjs';

export default defineConfig({
  plugins: [
    react(),
    // `/guide/*` is static HTML emitted after `vite build`; without this the
    // dev server falls back to the SPA and every guide URL renders the home
    // page instead (the router normalizes unknown paths to `/`).
    guidePagesDevServer(),
    // Precaches the app shell so Practice and a cached Daily still play with no
    // network (A-006, FR-014, AC-006). The update prompt is manual: the banner
    // must never reload during a running Daily attempt (AC-038).
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        // Never serve an /api response from the cache: a stale leaderboard is
        // worse than an honest offline state. /guide/* is static HTML built
        // after this plugin runs, so the app shell must not shadow it either.
        navigateFallbackDenylist: [/^\/api\//, /^\/guide(\/|$)/, /^\/(privacy|terms)(\/|$)/],
      },
      manifest: {
        name: 'Quadro — Daily Challenge',
        short_name: 'Quadro',
        description: 'A daily tile-drafting puzzle. One deal a day, fastest win wins.',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
      },
    }),
  ],
  // Honour PORT so a supervising dev tool can place the server where it expects.
  server: {
    port: Number(process.env.PORT) || 5173,
    // In dev the SPA and the Worker are two processes. Without this every
    // `/api/*` call hits Vite and 404s, so the leaderboard silently never
    // loads and no score is ever posted. Proxying keeps the browser on one
    // origin, which also sidesteps the Worker's ALLOWED_ORIGIN CORS check.
    //
    // `changeOrigin` rewrites only the Host header, and it has to be on:
    // `wrangler.jsonc` declares a route on `acgame.win`, and wrangler dev maps
    // any request whose Host is not its own onto that route — rewriting the
    // browser's `Origin` to `http://acgame.win` along with it. better-auth
    // then sees an origin that is not the one it trusts and 403s every
    // state-changing call (sign-up, sign-out) with INVALID_ORIGIN.
    proxy: {
      '/api': {
        target: process.env.API_ORIGIN || 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    // The AI search chunk must load lazily, before the first AI turn, not on
    // page load (NFR-002). Vite emits the worker as its own chunk automatically;
    // this keeps the rest of the app in one predictable bundle for NFR-001.
    target: 'es2022',
    sourcemap: true,
  },
  worker: { format: 'es' },
  test: {
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // Worker tests need workerd, not node; they run under their own config
    // (`npm run test:worker`).
    exclude: ['test/worker/**'],
    testTimeout: 60_000,
    environmentMatchGlobs: [
      ['test/ui/**', 'jsdom'],
      ['**', 'node'],
    ],
  },
});
