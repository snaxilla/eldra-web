// Unit tests for app/lib/content-packs/versions.ts.
//
// Content Workspaces & Studio Phase 0, Area 2 -- the shared numeric
// Content Pack version comparator, extracted from three independent
// copies (server/utils/content-sources/refresh.ts,
// app/components/admin/health/projectHealth.ts,
// app/components/admin/content-packs/contentPackRefreshMatch.ts). These
// tests pin the exact defect reported: "1.0.9" must not outrank "1.0.38",
// and "1.0.10" must outrank "1.0.9", neither of which holds under plain
// string/lexical comparison.

import { describe, expect, it } from 'vitest'
import { compareVersions, latestVersionFor, parseVersionTriple } from '../../../app/lib/content-packs/versions'

describe('compareVersions', () => {
  it('ranks "1.0.38" above "1.0.9" -- the reported defect', () => {
    expect(compareVersions('1.0.9', '1.0.38')).toBeLessThan(0)
    expect(compareVersions('1.0.38', '1.0.9')).toBeGreaterThan(0)
  })

  it('ranks "1.0.10" above "1.0.9"', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.9', '1.0.10')).toBeLessThan(0)
  })

  it('ranks "1.1.0" above "1.0.99"', () => {
    expect(compareVersions('1.1.0', '1.0.99')).toBeGreaterThan(0)
  })

  it('ranks "2.0.0" above "1.999.999"', () => {
    expect(compareVersions('2.0.0', '1.999.999')).toBeGreaterThan(0)
  })

  it('reports equal versions as equal', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', '1.0.0')).not.toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).not.toBeGreaterThan(0)
  })

  it('falls back to a deterministic localeCompare for a malformed/nonstandard version, never throwing', () => {
    expect(() => compareVersions('not-a-version', '1.0.0')).not.toThrow()
    expect(compareVersions('not-a-version', '1.0.0')).toBe('not-a-version'.localeCompare('1.0.0'))
    expect(compareVersions('', '')).toBe(0)
  })

  it('reads only the major.minor.patch prefix, same as the three original copies -- a pre-release/build suffix is not SemVer-ordered, only pattern-matched for the prefix', () => {
    expect(parseVersionTriple('1.0.0-beta.1')).toEqual([1, 0, 0])
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(0)
  })
})

describe('parseVersionTriple', () => {
  it('returns null for a string with no leading major.minor.patch', () => {
    expect(parseVersionTriple('vNext')).toBeNull()
    expect(parseVersionTriple('')).toBeNull()
  })

  it('parses a well-formed triple', () => {
    expect(parseVersionTriple('1.0.38')).toEqual([1, 0, 38])
  })
})

describe('latestVersionFor', () => {
  it('returns null when nothing is published under the given packageId', () => {
    expect(latestVersionFor('eldra.missing', [{ packageId: 'eldra.other', version: '1.0.0' }])).toBeNull()
    expect(latestVersionFor('eldra.missing', [])).toBeNull()
  })

  it('finds the numerically latest version among many, unordered, published versions -- the exact production shape (1.0.33 through 1.0.38)', () => {
    const listings = [
      { packageId: 'eldra.solaris.xphb', version: '1.0.9' },
      { packageId: 'eldra.solaris.xphb', version: '1.0.33' },
      { packageId: 'eldra.solaris.xphb', version: '1.0.4' },
      { packageId: 'eldra.solaris.xphb', version: '1.0.38' },
      { packageId: 'eldra.solaris.xphb', version: '1.0.35' }
    ]

    expect(latestVersionFor('eldra.solaris.xphb', listings)).toBe('1.0.38')
  })

  it('never mixes versions from a different packageId into its result', () => {
    const listings = [
      { packageId: 'eldra.a', version: '9.9.9' },
      { packageId: 'eldra.b', version: '1.0.0' }
    ]

    expect(latestVersionFor('eldra.b', listings)).toBe('1.0.0')
  })
})
