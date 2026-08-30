import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Precaches the app shell so Practice and a cached Daily still play with no
    // network (A-006, FR-014, AC-006). The update prompt is manual: the banner
    // must never reload during a running Daily attempt (AC-038).
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        // Never serve an /api response from the cache: a stale leaderboard is
        // worse than an honest offline state.
        navigateFallbackDenylist: [/^\/api\//],
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
  server: { port: Number(process.env.PORT) || 5173 },
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
