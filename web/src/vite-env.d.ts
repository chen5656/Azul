/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Empty in production: Pages and the Worker share one origin. */
  readonly VITE_API_BASE?: string;
  /** Clerk's publishable key — public by design, never the secret key (NFR-010). */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
