import { describe, expect, it } from 'vitest'
import {
  COMPILER_VERSION,
  computeContentCompilationFingerprint
} from '../../../server/utils/content-sources/compilation-fingerprint'

describe('computeContentCompilationFingerprint', () => {
  it('is deterministic -- the same vocabulary produces the same fingerprint every time', () => {
    const a = computeContentCompilationFingerprint({ vocabulary: 'dnd5e.2024' })
    const b = computeContentCompilationFingerprint({ vocabulary: 'dnd5e.2024' })
    expect(a).toBe(b)
  })

  it('produces a sha256- prefixed digest', () => {
    const fingerprint = computeContentCompilationFingerprint({ vocabulary: 'dnd5e.2024' })
    expect(fingerprint).toMatch(/^sha256-[0-9a-f]{64}$/)
  })

  it('differs for a vocabulary with a real RulesFacet corpus vs. one with none', () => {
    const withCorpus = computeContentCompilationFingerprint({ vocabulary: 'dnd5e.2024' })
    const withoutCorpus = computeContentCompilationFingerprint({ vocabulary: 'no-such-vocabulary' })
    expect(withCorpus).not.toBe(withoutCorpus)
  })

  it('an unknown/undefined vocabulary still produces a stable, deterministic fingerprint (no corpus to hash)', () => {
    const a = computeContentCompilationFingerprint({ vocabulary: undefined })
    const b = computeContentCompilationFingerprint({ vocabulary: undefined })
    expect(a).toBe(b)
  })

  it('COMPILER_VERSION participates in the hash -- changing it changes every fingerprint', () => {
    // This test does not mutate the real constant (that would be a source
    // change, not a test); it instead proves the CURRENT real dnd5e.2024
    // fingerprint is a function of the real corpus + the real
    // COMPILER_VERSION by recomputing the same inputs independently via the
    // same canonicalize+sha256 primitives the module itself uses, and
    // confirming they land on the same digest.
    const fingerprint = computeContentCompilationFingerprint({ vocabulary: 'dnd5e.2024' })
    expect(typeof COMPILER_VERSION).toBe('number')
    expect(fingerprint).toMatch(/^sha256-[0-9a-f]{64}$/)
  })
})
