// resolveDerivedImageUrl -- Content Workspaces & Studio Phase 5/6 (§8.9,
// admin image propagation follow-up). What matters: an authored override
// decides OUTRIGHT (including explicit suppression, which must never
// fall through to the legacy chain); absence of an override preserves
// the existing chain exactly, including which legacy branch wins when
// several would apply.

import { describe, expect, it, vi } from 'vitest'
import { resolveDerivedImageUrl } from '../../../app/lib/content-presentation/effective-image'

describe('resolveDerivedImageUrl', () => {
  it('an authored image override wins outright -- the legacy chain is never even invoked', () => {
    const legacyChain = vi.fn(() => '/api/5etools-img/some-fluff.webp')
    const result = resolveDerivedImageUrl({ url: '/api/assets/f1' }, legacyChain)
    expect(result).toBe('/api/assets/f1')
    expect(legacyChain).not.toHaveBeenCalled()
  })

  it('explicit suppression (override present, value null) returns null and never falls through to the legacy chain', () => {
    const legacyChain = vi.fn(() => '/api/5etools-img/some-fluff.webp')
    const result = resolveDerivedImageUrl(null, legacyChain)
    expect(result).toBeNull()
    expect(legacyChain).not.toHaveBeenCalled()
  })

  it('no override at all (undefined) defers entirely to the existing legacy chain', () => {
    const legacyChain = vi.fn(() => '/api/5etools-img/some-fluff.webp')
    const result = resolveDerivedImageUrl(undefined, legacyChain)
    expect(result).toBe('/api/5etools-img/some-fluff.webp')
    expect(legacyChain).toHaveBeenCalledTimes(1)
  })

  it('no override, and the legacy chain itself finds nothing -- null, exactly as before this feature existed', () => {
    const result = resolveDerivedImageUrl(undefined, () => null)
    expect(result).toBeNull()
  })
})
