// Minimal deterministic RNG for the Roll Engine.
// See .github/docs/architecture/rules-engine.md §17.4: "Rolls take an
// explicit seed... Given the same seed, spec, and state, the same result,
// so a disputed roll can be replayed and verified." No `Math.random()`
// anywhere in this module or its callers.
//
// This is the "minimal RNG abstraction, introduced only if strictly
// necessary, kept isolated" the Roll Engine task asked for: one function in
// (a seed string), one function out (a reproducible stream of numbers).
// Nothing here knows about dice, RollSpecs, or Roll Results -- see
// roll-engine.ts for the module that consumes this one.
//
// Not cryptographic. §17.4/§17.8 already accept that a roll's seed and
// result are visible/replayable ("the trace records both the computed and
// the overridden result"); the requirement is reproducibility, not secrecy
// from a determined viewer holding the seed.
//
// Algorithm: xmur3 (a small, widely used string hash) turns the seed string
// into a 32-bit integer, which seeds mulberry32 (a small, widely used
// 32-bit PRNG). Both are public-domain, deterministic, and standard enough
// that "why this generator" needs no further justification here.

export type RngStream = {
  // Next float in [0, 1).
  next(): number
  // Next integer in [0, maxExclusive).
  nextInt(maxExclusive: number): number
}

function xmur3(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Same seed string -> same infinite sequence, every time, on any machine.
export function createSeededRng(seed: string): RngStream {
  const next = mulberry32(xmur3(seed)())
  return {
    next,
    nextInt(maxExclusive: number): number {
      return Math.floor(next() * maxExclusive)
    }
  }
}
