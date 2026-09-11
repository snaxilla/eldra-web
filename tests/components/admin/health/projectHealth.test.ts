// Unit tests for the Game Admin "Project Health" tab's pure state-
// classification helpers (app/components/admin/health/projectHealth.ts).
// Mirrors rulesSummary.test.ts's own precedent exactly: this repo has no
// component-rendering test harness, so these are the tests for the one
// piece of the tab where a mistake has real consequences -- a false
// "Healthy" hides a real problem, and this task's own STATUS section
// forbids inventing a fifth state.

import { describe, expect, it } from 'vitest'
import {
  classifyContentPackHealth,
  classifyRulesHealth,
  compareVersions,
  latestVersionFor,
  resolveContentSourceForPackageId
} from '../../../../app/components/admin/health/projectHealth'

describe('compareVersions / latestVersionFor', () => {
  it('orders by major, then minor, then patch, not lexically', () => {
    expect(compareVersions('1.9.0', '1.10.0')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })

  it('returns null when no listing matches the packageId', () => {
    expect(latestVersionFor('eldra.rules.dnd5e-2024', [])).toBeNull()
    expect(latestVersionFor('eldra.rules.dnd5e-2024', [{ packageId: 'other', version: '1.0.0' }])).toBeNull()
  })

  it('picks the highest version among multiple published rows for the same packageId', () => {
    const listings = [
      { packageId: 'eldra.rules.dnd5e-2024', version: '0.5.0' },
      { packageId: 'eldra.rules.dnd5e-2024', version: '0.9.0' },
      { packageId: 'eldra.rules.dnd5e-2024', version: '0.7.0' },
      { packageId: 'other.package', version: '9.9.9' }
    ]
    expect(latestVersionFor('eldra.rules.dnd5e-2024', listings)).toBe('0.9.0')
  })
})

describe('classifyRulesHealth -- not configured', () => {
  it('classifies { configured: false } as not-configured', () => {
    const result = classifyRulesHealth({ configured: false }, [])
    expect(result.status).toBe('not-configured')
    expect(result.activePackageId).toBeNull()
  })

  it('classifies null/undefined/malformed responses as not-configured, never a false Healthy', () => {
    expect(classifyRulesHealth(null, []).status).toBe('not-configured')
    expect(classifyRulesHealth(undefined, []).status).toBe('not-configured')
    expect(classifyRulesHealth('garbage', []).status).toBe('not-configured')
    expect(classifyRulesHealth({}, []).status).toBe('not-configured')
  })
})

describe('classifyRulesHealth -- needs attention', () => {
  it('classifies { configured: true, ok: false } as needs-attention, carrying the failure stage', () => {
    const result = classifyRulesHealth({ configured: true, ok: false, stage: 'package-load' }, [])
    expect(result.status).toBe('needs-attention')
    expect(result.brokenStage).toBe('package-load')
    expect(result.status).not.toBe('not-configured')
  })
})

describe('classifyRulesHealth -- healthy', () => {
  it('classifies a ready summary already on the latest published version as healthy', () => {
    const result = classifyRulesHealth(
      { configured: true, ok: true, packageId: 'eldra.rules.dnd5e-2024', packageVersion: '0.9.0', integrityHash: 'abc' },
      [{ packageId: 'eldra.rules.dnd5e-2024', version: '0.9.0' }]
    )
    expect(result.status).toBe('healthy')
    expect(result.isLatest).toBe(true)
    expect(result.integrityHash).toBe('abc')
  })

  it('classifies as healthy (not warning) when no published listing exists to compare against -- unknown is never a false warning', () => {
    const result = classifyRulesHealth(
      { configured: true, ok: true, packageId: 'eldra.rules.dnd5e-2024', packageVersion: '0.9.0' },
      []
    )
    expect(result.status).toBe('healthy')
    expect(result.isLatest).toBeNull()
  })
})

describe('classifyRulesHealth -- warning (out of date)', () => {
  it('classifies a ready summary behind the latest published version as warning', () => {
    const result = classifyRulesHealth(
      { configured: true, ok: true, packageId: 'eldra.rules.dnd5e-2024', packageVersion: '0.4.0', integrityHash: 'old' },
      [
        { packageId: 'eldra.rules.dnd5e-2024', version: '0.4.0' },
        { packageId: 'eldra.rules.dnd5e-2024', version: '0.9.0' }
      ]
    )
    expect(result.status).toBe('warning')
    expect(result.latestVersion).toBe('0.9.0')
    expect(result.isLatest).toBe(false)
  })
})

describe('classifyContentPackHealth -- healthy', () => {
  it('classifies a binding on the latest published version as healthy', () => {
    const result = classifyContentPackHealth({
      packageId: 'eldra.content.xphb',
      boundVersion: '1.2.0',
      publishedListings: [{ packageId: 'eldra.content.xphb', version: '1.2.0' }],
      refreshAvailable: true
    })
    expect(result.status).toBe('healthy')
    expect(result.publishedVersionExists).toBe(true)
  })
})

describe('classifyContentPackHealth -- warning (out of date, refresh available)', () => {
  it('classifies a binding behind the latest published version as warning', () => {
    const result = classifyContentPackHealth({
      packageId: 'eldra.content.xphb',
      boundVersion: '1.0.0',
      publishedListings: [
        { packageId: 'eldra.content.xphb', version: '1.0.0' },
        { packageId: 'eldra.content.xphb', version: '1.0.1' }
      ],
      refreshAvailable: true
    })
    expect(result.status).toBe('warning')
    expect(result.latestVersion).toBe('1.0.1')
    expect(result.refreshAvailable).toBe(true)
  })
})

describe('classifyContentPackHealth -- needs attention (broken binding)', () => {
  it('classifies a binding whose (packageId, version) no longer resolves as needs-attention, even if some OTHER version of it is published', () => {
    const result = classifyContentPackHealth({
      packageId: 'eldra.content.xphb',
      boundVersion: '1.0.0',
      publishedListings: [{ packageId: 'eldra.content.xphb', version: '2.0.0' }],
      refreshAvailable: true
    })
    expect(result.status).toBe('needs-attention')
    expect(result.publishedVersionExists).toBe(false)
  })
})

describe('resolveContentSourceForPackageId', () => {
  const registry = [
    {
      key: 'dnd5e',
      collections: [
        { key: 'srd-5.1', suggestedPackageId: 'eldra.content.srd-5.1' },
        { key: 'xphb', suggestedPackageId: 'eldra.content.xphb' }
      ]
    }
  ]

  it('resolves a packageId published under its registry-suggested identity', () => {
    expect(resolveContentSourceForPackageId('eldra.content.xphb', registry)).toEqual({
      gameSystemKey: 'dnd5e',
      collectionKey: 'xphb'
    })
  })

  it('returns null for a packageId published under a custom, non-suggested name', () => {
    expect(resolveContentSourceForPackageId('eldra.content.my-custom-pack', registry)).toBeNull()
  })
})
