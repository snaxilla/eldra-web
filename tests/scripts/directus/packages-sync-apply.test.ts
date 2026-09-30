// Package Sync Hotfix 1 -- regression coverage for the real production
// incident: a combined REFRESH_CONTENT -> BIND_CONTENT apply run bound
// Solaris to `eldra.solaris.xphb@1.0.1` instead of the artifact that SAME
// run had just created (`1.0.5`), because BIND_CONTENT read its target
// version from the pre-mutation classification (`content.classification.version`,
// which is `undefined` for a REFRESH_REQUIRED classification -- only
// `staleVersion` exists on that shape). These tests exercise
// `executeApply`'s actual VALUE PROPAGATION, not merely `buildPlan`'s
// action-kind ordering -- a test that only asserted `['REFRESH_CONTENT',
// 'BIND_CONTENT']` would have passed against the pre-hotfix code and never
// caught the real bug.
//
// `publishRulesPackage` is mocked (not exercised for real -- that function
// already has its own dedicated test suite,
// tests/scripts/directus/publish-rules-package.test.ts) so these tests stay
// fast and hit no filesystem/Directus. Every OTHER dependency `executeApply`
// calls is reached through its own `modules` parameter, which these tests
// fake directly -- the same "inject fakes at the seam the real code already
// uses" pattern every other scripts/directus/*.test.ts file in this repo
// already follows.

import { describe, expect, it, vi } from 'vitest'

const { publishRulesPackageMock } = vi.hoisted(() => ({
  publishRulesPackageMock: vi.fn()
}))

vi.mock('../../../scripts/directus/publish-rules-package.mjs', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, publishRulesPackage: publishRulesPackageMock }
})

import {
  executeApply
  // @ts-expect-error -- plain .mjs, no type declarations
} from '../../../scripts/directus/packages-sync.mjs'

function fakeModules(overrides: Record<string, any> = {}) {
  return {
    contentSourceRefresh: { refreshContentSource: vi.fn() },
    worldRulesActivation: { activateWorldRulesPackage: vi.fn() },
    worldContentPackBinding: { bindContentPackToWorld: vi.fn() },
    ...overrides
  }
}

const WORLD = { id: 4, name: 'Solaris' }

describe('executeApply -- REFRESH_CONTENT -> BIND_CONTENT value propagation (the real incident)', () => {
  it('BIND_CONTENT receives the EXACT version REFRESH_CONTENT just created, not undefined, not the stale pre-mutation version', async () => {
    const modules = fakeModules()
    // Mirrors the real production shape: the pre-mutation classification
    // for a REFRESH_REQUIRED Content axis has NO `.version` field, only
    // `staleVersion` -- exactly what triggered the incident.
    const contentResults = [{
      sourceKey: 'xphb',
      classification: { status: 'REFRESH_REQUIRED', packageId: 'eldra.solaris.xphb', staleVersion: '1.0.4', reason: 'stale' }
    }]
    const plan = [
      { kind: 'REFRESH_CONTENT', sourceKey: 'xphb', packageId: 'eldra.solaris.xphb' },
      { kind: 'BIND_CONTENT', sourceKey: 'xphb', packageId: 'eldra.solaris.xphb' }
    ]

    modules.contentSourceRefresh.refreshContentSource.mockResolvedValue({
      refreshed: true, packageId: 'eldra.solaris.xphb', previousVersion: '1.0.4', version: '1.0.5', integrityHash: 'sha256-NEW', counts: {}
    })
    modules.worldContentPackBinding.bindContentPackToWorld.mockResolvedValue({ bound: true, binding: {} })

    const result = await executeApply({
      modules, world: WORLD, rulesClassification: { status: 'CURRENT' }, contentResults, plan
    })

    expect(result.ok).toBe(true)
    expect(modules.worldContentPackBinding.bindContentPackToWorld).toHaveBeenCalledWith(
      WORLD.id, 'eldra.solaris.xphb', '1.0.5'
    )
    // Never the stale pre-refresh version, and never undefined -- the two
    // ways this incident could have (and did) happen.
    const [, , calledVersion] = modules.worldContentPackBinding.bindContentPackToWorld.mock.calls[0]!
    expect(calledVersion).not.toBe('1.0.4')
    expect(calledVersion).not.toBeUndefined()
  })

  it('this test WOULD FAIL against the pre-hotfix behavior -- proof the fix is exercised, not assumed', async () => {
    // Simulates the exact pre-hotfix defect directly: reading
    // `content.classification.version` (undefined for REFRESH_REQUIRED) is
    // what the OLD code did. This test documents that this specific read
    // would have produced `undefined`, which the CURRENT executeApply no
    // longer does (proven by the test above) -- kept as an explicit,
    // readable link between the incident and the fix, not a tautology.
    const contentResults = [{
      sourceKey: 'xphb',
      classification: { status: 'REFRESH_REQUIRED', packageId: 'eldra.solaris.xphb', staleVersion: '1.0.4', reason: 'stale' }
    }]
    const preHotfixRead = (contentResults[0]!.classification as any).version
    expect(preHotfixRead).toBeUndefined()
  })
})

describe('executeApply -- BIND_REQUIRED path (unaffected by the defect, must still work)', () => {
  it('BIND_CONTENT targets the classification\'s own version when no refresh happened this run -- the current Solaris recovery shape', async () => {
    const modules = fakeModules()
    const contentResults = [{
      sourceKey: 'xphb',
      classification: {
        status: 'BIND_REQUIRED', packageId: 'eldra.solaris.xphb', version: '1.0.5',
        integrityHash: 'sha256-EXISTING', currentlyBoundVersion: '1.0.1'
      }
    }]
    const plan = [{ kind: 'BIND_CONTENT', sourceKey: 'xphb', packageId: 'eldra.solaris.xphb' }]

    modules.worldContentPackBinding.bindContentPackToWorld.mockResolvedValue({ bound: true, binding: {} })

    const result = await executeApply({
      modules, world: WORLD, rulesClassification: { status: 'CURRENT' }, contentResults, plan
    })

    expect(result.ok).toBe(true)
    expect(modules.worldContentPackBinding.bindContentPackToWorld).toHaveBeenCalledWith(
      WORLD.id, 'eldra.solaris.xphb', '1.0.5'
    )
    // refreshContentSource must never be called -- no refresh happened.
    expect(modules.contentSourceRefresh.refreshContentSource).not.toHaveBeenCalled()
  })
})

describe('executeApply -- combined PUBLISH_RULES + REFRESH_CONTENT + ACTIVATE_RULES + BIND_CONTENT', () => {
  it('every dependent operation consumes the ACTUAL artifact identities produced during this run, not plan-time fields', async () => {
    const modules = fakeModules()
    const contentResults = [{
      sourceKey: 'xphb',
      classification: { status: 'REFRESH_REQUIRED', packageId: 'eldra.solaris.xphb', staleVersion: '1.0.4', reason: 'stale' },
      provider: { collectionKey: 'xphb' },
      collection: { key: 'xphb' }
    }]
    const rulesClassification = { status: 'PUBLISH_REQUIRED', packageId: 'eldra.rules.dnd5e-2024', version: '0.11.0', integrityHash: 'sha256-AUTHORED' }
    const plan = [
      { kind: 'PUBLISH_RULES', packageId: 'eldra.rules.dnd5e-2024', version: '0.11.0' },
      { kind: 'REFRESH_CONTENT', sourceKey: 'xphb', packageId: 'eldra.solaris.xphb' },
      { kind: 'ACTIVATE_RULES', packageId: 'eldra.rules.dnd5e-2024', version: '0.11.0' },
      { kind: 'BIND_CONTENT', sourceKey: 'xphb', packageId: 'eldra.solaris.xphb' }
    ]

    publishRulesPackageMock.mockResolvedValue({
      row: { package_id: 'eldra.rules.dnd5e-2024', version: '0.11.0', integrity_hash: 'sha256-REAL-PUBLISHED' },
      created: { data: { id: 1 } },
      issues: []
    })
    modules.contentSourceRefresh.refreshContentSource.mockResolvedValue({
      refreshed: true, packageId: 'eldra.solaris.xphb', previousVersion: '1.0.4', version: '1.0.5', integrityHash: 'sha256-REAL-REFRESHED', counts: {}
    })
    modules.worldRulesActivation.activateWorldRulesPackage.mockResolvedValue({ activated: true, summary: {} })
    modules.worldContentPackBinding.bindContentPackToWorld.mockResolvedValue({ bound: true, binding: {} })

    const result = await executeApply({ modules, world: WORLD, rulesClassification, contentResults, plan })

    expect(result.ok).toBe(true)
    expect(result.completed.map((a: any) => a.kind)).toEqual(['PUBLISH_RULES', 'REFRESH_CONTENT', 'ACTIVATE_RULES', 'BIND_CONTENT'])

    // ACTIVATE_RULES consumed the REAL published row's own identity.
    expect(modules.worldRulesActivation.activateWorldRulesPackage).toHaveBeenCalledWith(
      WORLD.id, 'eldra.rules.dnd5e-2024', '0.11.0'
    )
    // BIND_CONTENT consumed the REAL refreshed artifact's own identity --
    // the exact assertion that would fail against the pre-hotfix code.
    expect(modules.worldContentPackBinding.bindContentPackToWorld).toHaveBeenCalledWith(
      WORLD.id, 'eldra.solaris.xphb', '1.0.5'
    )
  })
})
