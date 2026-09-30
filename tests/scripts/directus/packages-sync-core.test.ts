import { describe, expect, it } from 'vitest'
import {
  buildPlan,
  classifyContentState,
  classifyRulesState,
  compareVersions,
  findDanglingRulesFacetReferences,
  formatReport,
  resolveWorldSelector
  // @ts-expect-error -- plain .mjs, no type declarations
} from '../../../scripts/directus/packages-sync-core.mjs'

// ---------------------------------------------------------------------------
// TESTING -- WORLD (#1-4)
// ---------------------------------------------------------------------------

describe('resolveWorldSelector', () => {
  const worlds = [
    { id: 1, name: 'Varin' },
    { id: 4, name: 'Solaris' },
    { id: 5, name: 'EveryoneButBobbyB(Test)' }
  ]

  it('1. resolves Solaris by exact name', () => {
    const result = resolveWorldSelector(worlds, 'Solaris')
    expect(result.status).toBe('resolved')
    expect(result.world).toEqual({ id: 4, name: 'Solaris' })
  })

  it('2. resolves a World ID directly', () => {
    const result = resolveWorldSelector(worlds, '4')
    expect(result.status).toBe('resolved')
    expect(result.world).toEqual({ id: 4, name: 'Solaris' })
  })

  it('3. an unknown World name fails', () => {
    const result = resolveWorldSelector(worlds, 'Nonexistentia')
    expect(result.status).toBe('not-found')
  })

  it('4. an ambiguous World name fails, requiring an ID', () => {
    const ambiguousWorlds = [...worlds, { id: 9, name: 'Solaris' }]
    const result = resolveWorldSelector(ambiguousWorlds, 'Solaris')
    expect(result.status).toBe('ambiguous')
    expect(result.matches).toHaveLength(2)
  })

  it('an empty/missing selector fails, never silently picks one', () => {
    expect(resolveWorldSelector(worlds, '').status).toBe('not-found')
    expect(resolveWorldSelector(worlds, undefined).status).toBe('not-found')
  })
})

// ---------------------------------------------------------------------------
// TESTING -- RULES DETECTION
// ---------------------------------------------------------------------------

describe('classifyRulesState', () => {
  const authored = { packageId: 'eldra.rules.dnd5e-2024', version: '0.10.0', integrityHash: 'sha256-AAA', validationOk: true, validationIssues: [] }

  it('CURRENT: authored version is published with identical integrity and the World is activated on it', () => {
    const result = classifyRulesState({
      authored,
      publishedVersions: [{ version: '0.10.0', integrityHash: 'sha256-AAA' }],
      active: { packageId: 'eldra.rules.dnd5e-2024', version: '0.10.0', integrityHash: 'sha256-AAA' }
    })
    expect(result.status).toBe('CURRENT')
  })

  it('PUBLISH_REQUIRED: authored version does not exist published', () => {
    const result = classifyRulesState({
      authored,
      publishedVersions: [{ version: '0.9.0', integrityHash: 'sha256-OLD' }],
      active: { packageId: 'eldra.rules.dnd5e-2024', version: '0.9.0', integrityHash: 'sha256-OLD' }
    })
    expect(result.status).toBe('PUBLISH_REQUIRED')
    expect(result.version).toBe('0.10.0')
  })

  it('ACTIVATION_REQUIRED: authored version is published with identical integrity but World points elsewhere', () => {
    const result = classifyRulesState({
      authored,
      publishedVersions: [{ version: '0.10.0', integrityHash: 'sha256-AAA' }],
      active: { packageId: 'eldra.rules.dnd5e-2024', version: '0.9.0', integrityHash: 'sha256-OLD' }
    })
    expect(result.status).toBe('ACTIVATION_REQUIRED')
    expect(result.currentlyActiveVersion).toBe('0.9.0')
  })

  it('ACTIVATION_REQUIRED: also fires when the World has no active package at all', () => {
    const result = classifyRulesState({
      authored,
      publishedVersions: [{ version: '0.10.0', integrityHash: 'sha256-AAA' }],
      active: null
    })
    expect(result.status).toBe('ACTIVATION_REQUIRED')
    expect(result.currentlyActiveVersion).toBeNull()
  })

  it('SOURCE_VERSION_COLLISION: same package/version published, but integrity differs -- hard stop', () => {
    const result = classifyRulesState({
      authored,
      publishedVersions: [{ version: '0.10.0', integrityHash: 'sha256-DIFFERENT' }],
      active: null
    })
    expect(result.status).toBe('SOURCE_VERSION_COLLISION')
    expect(result.authoredIntegrityHash).toBe('sha256-AAA')
    expect(result.publishedIntegrityHash).toBe('sha256-DIFFERENT')
    expect(result.instruction).toMatch(/bump "version"/)
  })

  it('ERROR: authored package fails validation', () => {
    const result = classifyRulesState({
      authored: { ...authored, validationOk: false, validationIssues: [{ severity: 'error', code: 'x', message: 'bad' }] },
      publishedVersions: [],
      active: null
    })
    expect(result.status).toBe('ERROR')
    expect(result.issues).toHaveLength(1)
  })

  it('ERROR: no authored package found at all', () => {
    const result = classifyRulesState({ authored: null, publishedVersions: [], active: null })
    expect(result.status).toBe('ERROR')
  })
})

// ---------------------------------------------------------------------------
// TESTING -- CONTENT DETECTION / STALENESS (#10-11, #22-25)
// ---------------------------------------------------------------------------

describe('classifyContentState', () => {
  const latestPublished = { packageId: 'eldra.solaris.xphb', version: '1.0.4', integrityHash: 'sha256-CONTENT', compilerFingerprint: 'sha256-FP1' }

  it('CURRENT: unchanged raw source + unchanged facets/compiler, and World is bound to the latest', () => {
    const result = classifyContentState({
      bound: { packageId: 'eldra.solaris.xphb', version: '1.0.4', integrityHash: 'sha256-CONTENT' },
      latestPublished,
      regenerated: { integrityHash: 'sha256-CONTENT', compilerFingerprint: 'sha256-FP1' }
    })
    expect(result.status).toBe('CURRENT')
  })

  it('11. BIND_REQUIRED: a current refreshed artifact already exists but World is pinned to an older one', () => {
    const result = classifyContentState({
      bound: { packageId: 'eldra.solaris.xphb', version: '1.0.3', integrityHash: 'sha256-OLD' },
      latestPublished,
      regenerated: { integrityHash: 'sha256-CONTENT', compilerFingerprint: 'sha256-FP1' }
    })
    expect(result.status).toBe('BIND_REQUIRED')
    expect(result.version).toBe('1.0.4')
    expect(result.currentlyBoundVersion).toBe('1.0.3')
  })

  it('10 / 23. REFRESH_REQUIRED: changed raw source -- regenerated integrity differs from latest published', () => {
    const result = classifyContentState({
      bound: { packageId: 'eldra.solaris.xphb', version: '1.0.4', integrityHash: 'sha256-CONTENT' },
      latestPublished,
      regenerated: { integrityHash: 'sha256-DIFFERENT-BECAUSE-SOURCE-CHANGED', compilerFingerprint: 'sha256-FP1' }
    })
    expect(result.status).toBe('REFRESH_REQUIRED')
    expect(result.reason).toMatch(/different compiled content/)
  })

  it('24. REFRESH_REQUIRED: unchanged raw source, but the RulesFacet corpus changed (this is the real Phase 1B regression shape)', () => {
    // Facets are baked into candidates before hashing, so a facet change
    // DOES change the integrity hash too -- exactly the case that broke
    // Phase 1B (Wizard facet gained a progression reference, raw 5etools
    // source file untouched).
    const result = classifyContentState({
      bound: { packageId: 'eldra.solaris.xphb', version: '1.0.4', integrityHash: 'sha256-CONTENT' },
      latestPublished,
      regenerated: { integrityHash: 'sha256-DIFFERENT-BECAUSE-FACET-CHANGED', compilerFingerprint: 'sha256-FP2' }
    })
    expect(result.status).toBe('REFRESH_REQUIRED')
  })

  it('25. REFRESH_REQUIRED: compiler/fingerprint changed even though today\'s regenerated content happens to hash identically', () => {
    const result = classifyContentState({
      bound: { packageId: 'eldra.solaris.xphb', version: '1.0.4', integrityHash: 'sha256-CONTENT' },
      latestPublished,
      // integrityHash matches (content output unaffected for this pack),
      // but compilerFingerprint differs -- the conservative signal.
      regenerated: { integrityHash: 'sha256-CONTENT', compilerFingerprint: 'sha256-FP2-DIFFERENT' }
    })
    expect(result.status).toBe('REFRESH_REQUIRED')
    expect(result.reason).toMatch(/RulesFacet corpus or compiler version changed/)
  })

  it('a published pack with no stored compilerFingerprint (pre-existing pack) is judged on integrity hash alone', () => {
    const result = classifyContentState({
      bound: { packageId: 'eldra.solaris.xphb', version: '1.0.4', integrityHash: 'sha256-CONTENT' },
      latestPublished: { ...latestPublished, compilerFingerprint: undefined },
      regenerated: { integrityHash: 'sha256-CONTENT', compilerFingerprint: 'sha256-ANYTHING' }
    })
    expect(result.status).toBe('CURRENT')
  })

  it('ERROR: no published version exists yet for this Content Source', () => {
    const result = classifyContentState({ bound: null, latestPublished: null, regenerated: { integrityHash: 'x', compilerFingerprint: 'y' } })
    expect(result.status).toBe('ERROR')
  })
})

// ---------------------------------------------------------------------------
// TESTING -- REFERENCE INTEGRITY (#27-29)
// ---------------------------------------------------------------------------

describe('findDanglingRulesFacetReferences', () => {
  // Character Progression Phase 1C -- `facet.progression` is a real array
  // in the current codebase (app/lib/content-rules/types.ts), not a single
  // string. These fixtures use the array shape deliberately: an earlier
  // version of this test used a bare string, which is exactly why it
  // failed to catch a real regression (facet.progression pushed whole into
  // a `definitionIds.has(id)` check, always false for an array) found
  // during this phase's own production verification. Kept as an explicit
  // regression guard, not merely updated silently.
  it('27. a facet referencing existing Rules Definitions passes (no dangling references reported)', () => {
    const catalogueEntries = [
      { entityType: 'class', slug: 'wizard-xphb', rulesFacet: { progression: ['progression:class.skill-expertise', 'progression:class.subclass-selection'], grants: [{ set: 'value:hit_die', to: 6 }] } }
    ]
    const definitionIds = new Set(['progression:class.skill-expertise', 'progression:class.subclass-selection', 'value:hit_die'])

    expect(findDanglingRulesFacetReferences(catalogueEntries, definitionIds)).toEqual([])
  })

  it('28. a facet referencing a missing progression Definition fails -- the exact Phase 1B regression shape', () => {
    const catalogueEntries = [
      { entityType: 'class', slug: 'wizard-xphb', rulesFacet: { progression: ['progression:class.skill-expertise'] } }
    ]
    const definitionIds = new Set(['value:hit_die']) // progression Definition NOT present

    const dangling = findDanglingRulesFacetReferences(catalogueEntries, definitionIds)
    expect(dangling).toHaveLength(1)
    expect(dangling[0]).toEqual({
      entityType: 'class',
      slug: 'wizard-xphb',
      field: 'progression',
      referencedId: 'progression:class.skill-expertise'
    })
  })

  it('an array with one resolvable and one dangling progression id reports only the dangling one -- proves element-by-element checking, not whole-array', () => {
    const catalogueEntries = [
      { entityType: 'class', slug: 'wizard-xphb', rulesFacet: { progression: ['progression:class.skill-expertise', 'progression:class.subclass-selection'] } }
    ]
    const definitionIds = new Set(['progression:class.skill-expertise']) // only one of the two present

    const dangling = findDanglingRulesFacetReferences(catalogueEntries, definitionIds)
    expect(dangling).toEqual([{
      entityType: 'class',
      slug: 'wizard-xphb',
      field: 'progression',
      referencedId: 'progression:class.subclass-selection'
    }])
  })

  it('detects dangling grants, choices, and sources -- not just progression', () => {
    const catalogueEntries = [
      {
        entityType: 'class',
        slug: 'fighter-xphb',
        rulesFacet: {
          grants: [{ set: 'value:missing.grant', to: true }],
          choices: [{ choiceSet: 'choice:missing.set', count: 1, from: ['value:missing.option'] }],
          sources: ['source:missing.source']
        }
      }
    ]
    const definitionIds = new Set(['value:hit_die'])

    const dangling = findDanglingRulesFacetReferences(catalogueEntries, definitionIds)
    const fields = dangling.map((entry: any) => entry.field).sort()
    expect(fields).toEqual(['choices[].choiceSet', 'choices[].from[]', 'grants[].set', 'sources[]'])
  })

  it('an entry with no rulesFacet at all is never reported', () => {
    const catalogueEntries = [{ entityType: 'item', slug: 'torch', rulesFacet: undefined }]
    expect(findDanglingRulesFacetReferences(catalogueEntries, new Set())).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// TESTING -- DEPENDENCY ORDER / DRY RUN (#5-9, #12)
// ---------------------------------------------------------------------------

describe('buildPlan', () => {
  it('6. no actions when everything is already CURRENT', () => {
    const plan = buildPlan({
      rulesClassification: { status: 'CURRENT' },
      contentClassifications: [{ sourceKey: 'xphb', classification: { status: 'CURRENT' } }]
    })
    expect(plan).toEqual([])
  })

  it('7 / 8. Rules PUBLISH_REQUIRED plans PUBLISH_RULES then ACTIVATE_RULES, in that order', () => {
    const plan = buildPlan({
      rulesClassification: { status: 'PUBLISH_REQUIRED', packageId: 'p', version: '1.0.0' },
      contentClassifications: []
    })
    expect(plan.map((a: any) => a.kind)).toEqual(['PUBLISH_RULES', 'ACTIVATE_RULES'])
  })

  it('8. Rules ACTIVATION_REQUIRED (already published) plans only ACTIVATE_RULES, no publish', () => {
    const plan = buildPlan({
      rulesClassification: { status: 'ACTIVATION_REQUIRED', packageId: 'p', version: '1.0.0' },
      contentClassifications: []
    })
    expect(plan.map((a: any) => a.kind)).toEqual(['ACTIVATE_RULES'])
  })

  it('9. SOURCE_VERSION_COLLISION plans nothing -- it is a hard stop, not an action', () => {
    const plan = buildPlan({
      rulesClassification: { status: 'SOURCE_VERSION_COLLISION' },
      contentClassifications: []
    })
    expect(plan).toEqual([])
  })

  it('10. Content REFRESH_REQUIRED plans REFRESH_CONTENT before BIND_CONTENT', () => {
    const plan = buildPlan({
      rulesClassification: { status: 'CURRENT' },
      contentClassifications: [{ sourceKey: 'xphb', classification: { status: 'REFRESH_REQUIRED', packageId: 'p' } }]
    })
    expect(plan.map((a: any) => a.kind)).toEqual(['REFRESH_CONTENT', 'BIND_CONTENT'])
  })

  it('11. Content BIND_REQUIRED plans only BIND_CONTENT, no refresh', () => {
    const plan = buildPlan({
      rulesClassification: { status: 'CURRENT' },
      contentClassifications: [{ sourceKey: 'xphb', classification: { status: 'BIND_REQUIRED', packageId: 'p' } }]
    })
    expect(plan.map((a: any) => a.kind)).toEqual(['BIND_CONTENT'])
  })

  it('12. Rules + Content both stale -- combined dependency-aware plan, both publishes/refreshes before either activate/bind', () => {
    const plan = buildPlan({
      rulesClassification: { status: 'PUBLISH_REQUIRED', packageId: 'r', version: '1.0.0' },
      contentClassifications: [{ sourceKey: 'xphb', classification: { status: 'REFRESH_REQUIRED', packageId: 'c' } }]
    })
    const kinds = plan.map((a: any) => a.kind)
    expect(kinds.indexOf('PUBLISH_RULES')).toBeLessThan(kinds.indexOf('ACTIVATE_RULES'))
    expect(kinds.indexOf('REFRESH_CONTENT')).toBeLessThan(kinds.indexOf('BIND_CONTENT'))
    expect(kinds.indexOf('PUBLISH_RULES')).toBeLessThan(kinds.indexOf('BIND_CONTENT'))
    expect(kinds.indexOf('REFRESH_CONTENT')).toBeLessThan(kinds.indexOf('ACTIVATE_RULES'))
  })
})

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions('1.0.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.4', '1.0.10')).toBeLessThan(0)
  })
})

describe('formatReport', () => {
  it('renders a DRY RUN footer when no --apply, and lists ACTIONS: None when the plan is empty', () => {
    const report = formatReport({
      worldName: 'Solaris',
      worldId: 4,
      rulesClassification: { status: 'CURRENT', packageId: 'eldra.rules.dnd5e-2024', version: '0.10.0' },
      contentClassifications: [
        { sourceKey: 'xphb', label: "Player's Handbook (2024)", classification: { status: 'CURRENT', packageId: 'eldra.solaris.xphb', version: '1.0.4' } }
      ],
      plan: [],
      mode: 'dry-run'
    })

    expect(report).toContain('World: Solaris (4)')
    expect(report).toContain('ACTIONS')
    expect(report).toContain('None')
    expect(report).toContain('DRY RUN')
    expect(report).not.toContain('undefined')
  })
})
