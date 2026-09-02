/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Empty in production: Pages and the Worker share one origin. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
