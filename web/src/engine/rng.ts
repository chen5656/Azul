/**
 * The engine's only source of randomness.
 *
 * mulberry32: a 32-bit-state PRNG, deliberately not a port of Python's Mersenne
 * Twister (BUILD-SPEC A-003). A given seed therefore produces different deals in
 * Python and TypeScript, which is fine because the Daily is defined by *this*
 * engine. Parity vectors carry explicit states and actions, so they never depend
 * on the PRNG stream.
 *
 * The state is a single uint32, so a `GameState` carrying an `Rng` still
 * serializes losslessly.
 */
export class Rng {
  state: number;

  constructor(seed: number = (Math.random() * 0x100000000) >>> 0) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [0, n). */
  nextInt(n: number): number {
    return Math.floor(this.next() * n);
  }

  clone(): Rng {
    return new Rng(this.state);
  }
}

/** FNV-1a over the UTF-8 bytes of `text`, as an unsigned 32-bit integer. */
export function fnv1a32(text: string): number {
  const bytes = new TextEncoder().encode(text);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
