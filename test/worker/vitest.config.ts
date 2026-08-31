import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

/**
 * Worker tests run inside workerd via Miniflare, against a real local D1 —
 * the same SQLite engine production uses, so the SQL is genuinely exercised.
 */
export default defineWorkersConfig({
  test: {
    include: ['test/worker/**/*.test.ts'],
    poolOptions: {
      workers: {
        isolatedStorage: true,
        wrangler: { configPath: '../../wrangler.jsonc' },
        miniflare: {
          d1Databases: ['DB'],
          bindings: {
            CLERK_ISSUER: 'https://clerk.test.example',
            ALLOWED_ORIGIN: 'https://acgame.win',
          },
        },
      },
    },
  },
});
