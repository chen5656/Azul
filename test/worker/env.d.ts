/// <reference types="@cloudflare/vitest-pool-workers" />

declare module '*.sql?raw' {
  const content: string;
  export default content;
}

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}
