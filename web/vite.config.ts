import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
    testTimeout: 60_000,
    environmentMatchGlobs: [
      ['test/ui/**', 'jsdom'],
      ['**', 'node'],
    ],
  },
});
