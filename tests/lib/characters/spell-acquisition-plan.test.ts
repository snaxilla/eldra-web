// D&D 2024 Character Rules P3.2 -- the spell acquisition planner. Tests 1-28 of this phase's own
// acceptance matrix, plus three extra confidence tests (validator agreement, a fixed-grant-shaped
// candidate, and the proposed answer-key shape) the phase's own report calls out explicitly.
// Synthetic requirements prove the GENERIC mechanism (mirrors P3.1's own test posture); Wizard,
// cantrip, ordinary, half-caster, and Warlock sections use the REAL authored facet data.

import { describe, expect, it } from 'vitest'

import { findRulesFacet } from '../../../app/lib/content-rules'
import type { SpellRequirement } from '../../../app/lib/content-rules/types'
import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import { spellIdentityOf, validateSpellRequirements, type SpellStateCandidate } from '../../../app/lib/characters/spell-requirements'
import {
  planSpellAcquisition,
  spellRequirementAnswerKey,
  type SpellAcquisitionPlan,
  type SpellCatalogueEntry,
  type TentativeSpellSelection
} from '../../../app/lib/characters/spell-acquisition-plan'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import type { ContentRef } from '../../../app/lib/characters/progression-plan'
import type { SpellSlotLevel } from '../../../app/lib/characters/spellcasting'

const PKG = 'eldra.solaris.xphb'

function mechanics(name: string, level: number, classLists?: string[]) {
  return resolveDnd5eSpellMechanics({ name, source: 'XPHB', level, school: 'V', ...(classLists ? { classLists } : {}) })!
}

function ref(slug: string): ContentRef {
  return { packageId: PKG, slug }
}

function entry(slug: string, level: number, classLists: string[], title = slug): SpellCatalogueEntry {
  return { packageId: PKG, slug, title, spellMechanics: mechanics(title, level, classLists) }
}

function stateCandidate(slug: string, opts: { known?: boolean, prepared?: boolean, mechanics?: ReturnType<typeof mechanics> | null }): SpellStateCandidate {
  return {
    identity: spellIdentityOf({ ref: ref(slug) }),
    known: opts.known ?? false,
    prepared: opts.prepared ?? false,
    mechanics: opts.mechanics ?? null
  }
}

function tentativeFor(requirementId: string, slug: string): TentativeSpellSelection {
  return { requirementId, ref: ref(slug) }
}

function planOf(plan: SpellAcquisitionPlan, requirementId: string) {
  return plan.requirements.find((r) => r.requirementId === requirementId)!
}

const SYN_SPELL: SpellRequirement = { id: 'req.spell', pool: 'spell', filter: { classList: ['Wizard'] }, totalByLevel: Array(20).fill(4) }
const SLOTS_L1: SpellSlotLevel[] = [{ level: 1, max: 4, expended: 0 }]

describe('P3.2 planner -- plan core (tests 1-7)', () => {
  it('1. empty state produces the full target as missing', () => {
    const plan = planSpellAcquisition({ requirements: [SYN_SPELL], characterLevel: 1, candidates: [], catalogue: [], spellSlotLevels: SLOTS_L1 })
    const r = planOf(plan, SYN_SPELL.id)
    expect(r.target).toBe(4)
    expect(r.legalCount).toBe(0)
    expect(r.missing).toBe(4)
    expect(r.satisfied).toBe(false)
  })

  it('2. partial state produces only the remaining deficit', () => {
    const candidates = [
      stateCandidate('a', { prepared: true, mechanics: mechanics('A', 1, ['Wizard']) }),
      stateCandidate('b', { prepared: true, mechanics: mechanics('B', 1, ['Wizard']) }),
      stateCandidate('c', { prepared: true, mechanics: mechanics('C', 1, ['Wizard']) })
    ]
    const plan = planSpellAcquisition({ requirements: [SYN_SPELL], characterLevel: 1, candidates, catalogue: [], spellSlotLevels: SLOTS_L1 })
    const r = planOf(plan, SYN_SPELL.id)
    expect(r.legalCount).toBe(3)
    expect(r.missing).toBe(1)
  })

  it('3. complete state produces zero deficit and no requested selection', () => {
    const candidates = ['a', 'b', 'c', 'd'].map((s) => stateCandidate(s, { prepared: true, mechanics: mechanics(s, 1, ['Wizard']) }))
    const plan = planSpellAcquisition({ requirements: [SYN_SPELL], characterLevel: 1, candidates, catalogue: [entry('e', 1, ['Wizard'])], spellSlotLevels: SLOTS_L1 })
    const r = planOf(plan, SYN_SPELL.id)
    expect(r.missing).toBe(0)
    expect(r.satisfied).toBe(true)
    expect(r.options).toEqual([])
    expect(plan.complete).toBe(true)
  })

  it('4. illegal existing state remains a diagnostic, never silently repaired', () => {
    const candidates = [
      ...['a', 'b', 'c', 'd'].map((s) => stateCandidate(s, { prepared: true, mechanics: mechanics(s, 1, ['Wizard']) })),
      stateCandidate('intruder', { prepared: true, mechanics: mechanics('Intruder', 1, ['Cleric']) })
    ]
    const plan = planSpellAcquisition({ requirements: [SYN_SPELL], characterLevel: 1, candidates, catalogue: [], spellSlotLevels: SLOTS_L1 })
    const r = planOf(plan, SYN_SPELL.id)
    expect(r.legalCount).toBe(4)
    expect(r.missing).toBe(0)
    expect(r.satisfied).toBe(false) // an issue is present even though the count target is met
    expect(r.issues).toEqual(expect.arrayContaining([{ kind: 'illegal-wrong-class-list', identity: spellIdentityOf({ ref: ref('intruder') }) }]))
    expect(plan.complete).toBe(false)
  })

  it('5. over-count blocks the plan, never resolved by silently dropping a spell', () => {
    const candidates = ['a', 'b', 'c', 'd', 'e'].map((s) => stateCandidate(s, { prepared: true, mechanics: mechanics(s, 1, ['Wizard']) }))
    const plan = planSpellAcquisition({ requirements: [SYN_SPELL], characterLevel: 1, candidates, catalogue: [], spellSlotLevels: SLOTS_L1 })
    const r = planOf(plan, SYN_SPELL.id)
    expect(r.legalCount).toBe(5)
    expect(r.missing).toBe(0)
    expect(r.satisfied).toBe(false)
    expect(r.issues).toEqual(expect.arrayContaining([{ kind: 'over-count', count: 1 }]))
    expect(plan.complete).toBe(false)
  })

  it('6. an unresolved spell blocks, never counted', () => {
    const candidates = [stateCandidate('ghost', { prepared: true, mechanics: null })]
    const plan = planSpellAcquisition({ requirements: [SYN_SPELL], characterLevel: 1, candidates, catalogue: [], spellSlotLevels: SLOTS_L1 })
    const r = planOf(plan, SYN_SPELL.id)
    expect(r.legalCount).toBe(0)
    expect(r.satisfied).toBe(false)
    expect(r.issues).toEqual(expect.arrayContaining([{ kind: 'illegal-unresolved', identity: spellIdentityOf({ ref: ref('ghost') }) }]))
  })

  it('7. duplicate physical rows do not inflate the count', () => {
    const one = stateCandidate('a', { prepared: true, mechanics: mechanics('A', 1, ['Wizard']) })
    const plan = planSpellAcquisition({ requirements: [SYN_SPELL], characterLevel: 1, candidates: [one, { ...one }], catalogue: [], spellSlotLevels: SLOTS_L1 })
    expect(planOf(plan, SYN_SPELL.id).legalCount).toBe(1)
  })
})

describe('P3.2 planner -- option resolution (tests 8-13)', () => {
  it('8. options satisfy the P2 filter (class list) and the legal max level', () => {
    const catalogue = [entry('wizard-one', 1, ['Wizard']), entry('cleric-one', 1, ['Cleric']), entry('wizard-high', 3, ['Wizard'])]
    const plan = planSpellAcquisition({ requirements: [SYN_SPELL], characterLevel: 1, candidates: [], catalogue, spellSlotLevels: SLOTS_L1 })
    const refs = planOf(plan, SYN_SPELL.id).options.map((o) => o.slug)
    expect(refs).toContain('wizard-one')
    expect(refs).not.toContain('cleric-one')
    expect(refs).not.toContain('wizard-high')
  })

  it('9. a spell already legally owned in the SAME pool is excluded from its own options', () => {
    const catalogue = [entry('a', 1, ['Wizard']), entry('b', 1, ['Wizard'])]
    const candidates = [stateCandidate('a', { prepared: true, mechanics: mechanics('A', 1, ['Wizard']) })]
    const plan = planSpellAcquisition({ requirements: [SYN_SPELL], characterLevel: 1, candidates, catalogue, spellSlotLevels: SLOTS_L1 })
    const refs = planOf(plan, SYN_SPELL.id).options.map((o) => o.slug)
    expect(refs).not.toContain('a')
    expect(refs).toContain('b')
  })

  it('10. the same spell may remain eligible for a DIFFERENT pool it already satisfies elsewhere', () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
    const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const catalogue = [entry('a', 1, ['Wizard'])]
    // 'a' is already a legal SPELLBOOK member (known: true); it must still appear as a PREPARED
    // option, since the prepared pool has not counted it toward ITS own legal set yet.
    const candidates = [stateCandidate('a', { known: true, mechanics: mechanics('A', 1, ['Wizard']) })]
    const plan = planSpellAcquisition({ requirements, characterLevel: 1, candidates, catalogue, spellSlotLevels: SLOTS_L1 })
    expect(planOf(plan, spellbookId).options.map((o) => o.slug)).not.toContain('a')
    expect(planOf(plan, spellId).options.map((o) => o.slug)).toContain('a')
  })

  it('11. a tentative duplicate (the same ref submitted twice to one requirement) is rejected', () => {
    const catalogue = [entry('a', 1, ['Wizard'])]
    const plan = planSpellAcquisition({
      requirements: [SYN_SPELL], characterLevel: 1, candidates: [], catalogue, spellSlotLevels: SLOTS_L1,
      tentative: [tentativeFor(SYN_SPELL.id, 'a'), tentativeFor(SYN_SPELL.id, 'a')]
    })
    const r = planOf(plan, SYN_SPELL.id)
    expect(r.legalCount).toBe(1) // only counted once
    expect(r.issues).toEqual(expect.arrayContaining([{ kind: 'tentative-duplicate', ref: 'eldra.solaris.xphb::a' }]))
    expect(r.satisfied).toBe(false)
  })

  it('12. a wrong-class-list tentative answer is refused, reported on its requirement', () => {
    const catalogue = [entry('cleric-one', 1, ['Cleric'])]
    const plan = planSpellAcquisition({
      requirements: [SYN_SPELL], characterLevel: 1, candidates: [], catalogue, spellSlotLevels: SLOTS_L1,
      tentative: [tentativeFor(SYN_SPELL.id, 'cleric-one')]
    })
    const r = planOf(plan, SYN_SPELL.id)
    expect(r.legalCount).toBe(0)
    expect(r.issues).toEqual(expect.arrayContaining([{ kind: 'illegal-wrong-class-list', identity: spellIdentityOf({ ref: ref('cleric-one') }) }]))
  })

  it('13. a wrong-level tentative answer is refused, reported on its requirement', () => {
    const catalogue = [entry('too-high', 3, ['Wizard'])]
    const plan = planSpellAcquisition({
      requirements: [SYN_SPELL], characterLevel: 1, candidates: [], catalogue, spellSlotLevels: SLOTS_L1,
      tentative: [tentativeFor(SYN_SPELL.id, 'too-high')]
    })
    const r = planOf(plan, SYN_SPELL.id)
    expect(r.legalCount).toBe(0)
    expect(r.issues).toEqual(expect.arrayContaining([{ kind: 'illegal-wrong-level', identity: spellIdentityOf({ ref: ref('too-high') }), level: 3, maxLevel: 1 }]))
  })
})

describe('P3.2 planner -- Wizard dependency (tests 14-18), using the REAL authored facet', () => {
  const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
  const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
  const spellId = requirements.find((r) => r.pool === 'spell')!.id
  const SLOTS_WIZ_L1: SpellSlotLevel[] = [{ level: 1, max: 2, expended: 0 }]
  const catalogue = [...'abcdefghij'].map((s) => entry(s, 1, ['Wizard']))

  it('14. empty Level-1 Wizard spellbook is missing 6', () => {
    const plan = planSpellAcquisition({ requirements, characterLevel: 1, candidates: [], catalogue, spellSlotLevels: SLOTS_WIZ_L1 })
    const spellbook = planOf(plan, spellbookId)
    expect(spellbook.missing).toBe(6)
    expect(spellbook.options).toHaveLength(10)
    // Nothing is in the spellbook yet, so the prepared pool has no legal membership to draw from.
    expect(planOf(plan, spellId).options).toHaveLength(0)
  })

  it('15. tentative spellbook answers reduce the spellbook deficit', () => {
    const tentative = [...'abcdef'].map((s) => tentativeFor(spellbookId, s))
    const plan = planSpellAcquisition({ requirements, characterLevel: 1, candidates: [], catalogue, spellSlotLevels: SLOTS_WIZ_L1, tentative })
    const spellbook = planOf(plan, spellbookId)
    expect(spellbook.legalCount).toBe(6)
    expect(spellbook.missing).toBe(0)
    expect(spellbook.satisfied).toBe(true)
  })

  it('16. those tentative spellbook spells become eligible PREPARED options, in the SAME planning call', () => {
    const tentative = [...'abcdef'].map((s) => tentativeFor(spellbookId, s))
    const plan = planSpellAcquisition({ requirements, characterLevel: 1, candidates: [], catalogue, spellSlotLevels: SLOTS_WIZ_L1, tentative })
    const prepared = planOf(plan, spellId)
    const refs = prepared.options.map((o) => o.slug)
    for (const s of [...'abcdef']) expect(refs).toContain(s)
    // 'g'-'j' were never tentatively added to the spellbook, so they are not legal prepared options.
    for (const s of [...'ghij']) expect(refs).not.toContain(s)
  })

  it('17. a tentative prepared pick OUTSIDE the resulting spellbook is refused', () => {
    const tentative = [...'abcdef'].map((s) => tentativeFor(spellbookId, s))
    tentative.push(tentativeFor(spellId, 'g')) // 'g' was never added to the spellbook
    const plan = planSpellAcquisition({ requirements, characterLevel: 1, candidates: [], catalogue, spellSlotLevels: SLOTS_WIZ_L1, tentative })
    const prepared = planOf(plan, spellId)
    expect(prepared.legalCount).toBe(0)
    expect(prepared.issues).toEqual(expect.arrayContaining([
      { kind: 'illegal-not-in-membership-pool', identity: spellIdentityOf({ ref: ref('g') }), membershipPoolId: spellbookId }
    ]))
  })

  it('18. the same spell may tentatively satisfy BOTH spellbook and prepared at once, no duplicate corruption', () => {
    const tentative = [...'abcdef'].map((s) => tentativeFor(spellbookId, s))
    tentative.push(tentativeFor(spellId, 'a'), tentativeFor(spellId, 'b'))
    const plan = planSpellAcquisition({ requirements, characterLevel: 1, candidates: [], catalogue, spellSlotLevels: SLOTS_WIZ_L1, tentative })
    expect(planOf(plan, spellbookId).legalCount).toBe(6)
    expect(planOf(plan, spellId).legalCount).toBe(2)
  })

  // P3.2.1 -- the real bug this phase's own audit found and fixed: cantrip and spellbook BOTH read
  // `known`, so a real Wizard answering all three pools at once (the exact real Level-1 shape)
  // previously never reached `complete: true` -- a tentative cantrip pick got spuriously walked
  // against spellbook's "level 1+" floor, and vice versa. Proven fixed end-to-end through the
  // PLANNER (tentative-driven, not merely a persisted-state re-read -- see
  // tests/lib/characters/spell-requirements.test.ts for the persisted-state proof).
  it('P3.2.1: cantrip + spellbook + prepared, ALL answered by tentative selections at once, reach complete -- no cross-pool contamination', () => {
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const cantripCatalogue = [...'xyz'].map((s) => entry(`cantrip-${s}`, 0, ['Wizard']))
    const fullCatalogue = [...catalogue, ...cantripCatalogue]

    const tentative = [
      ...[...'abcdef'].map((s) => tentativeFor(spellbookId, s)),
      ...[...'abcd'].map((s) => tentativeFor(spellId, s)),
      ...[...'xyz'].map((s) => tentativeFor(cantripId, `cantrip-${s}`))
    ]

    const plan = planSpellAcquisition({ requirements, characterLevel: 1, candidates: [], catalogue: fullCatalogue, spellSlotLevels: SLOTS_WIZ_L1, tentative })

    expect(planOf(plan, cantripId).legalCount).toBe(3)
    expect(planOf(plan, cantripId).satisfied).toBe(true)
    expect(planOf(plan, spellbookId).legalCount).toBe(6)
    expect(planOf(plan, spellbookId).satisfied).toBe(true)
    expect(planOf(plan, spellId).legalCount).toBe(4)
    expect(planOf(plan, spellId).satisfied).toBe(true)
    expect(plan.complete).toBe(true)
  })
})

describe('P3.2 planner -- class equivalence (tests 19-23), using REAL authored facets', () => {
  it('19. cantrip caster (Sorcerer): empty state is missing the real corpus total; options are class-list-correct; duplicate tentative refused', () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'sorcerer-xphb')!.spellRequirements!
    const cantripReq = requirements.find((r) => r.pool === 'cantrip')!
    const catalogue = [entry('sorc-a', 0, ['Sorcerer']), entry('sorc-b', 0, ['Sorcerer']), entry('cleric-a', 0, ['Cleric'])]

    const empty = planSpellAcquisition({ requirements, characterLevel: 1, candidates: [], catalogue, spellSlotLevels: [] })
    const r0 = planOf(empty, cantripReq.id)
    expect(r0.target).toBe(cantripReq.totalByLevel[0])
    expect(r0.missing).toBe(cantripReq.totalByLevel[0])
    expect(r0.options.map((o) => o.slug)).not.toContain('cleric-a')

    const withTentative = planSpellAcquisition({
      requirements, characterLevel: 1, candidates: [], catalogue, spellSlotLevels: [],
      tentative: [tentativeFor(cantripReq.id, 'sorc-a'), tentativeFor(cantripReq.id, 'sorc-b')]
    })
    expect(planOf(withTentative, cantripReq.id).missing).toBe(cantripReq.totalByLevel[0] - 2)

    const duplicate = planSpellAcquisition({
      requirements, characterLevel: 1, candidates: [], catalogue, spellSlotLevels: [],
      tentative: [tentativeFor(cantripReq.id, 'sorc-a'), tentativeFor(cantripReq.id, 'sorc-a')]
    })
    expect(planOf(duplicate, cantripReq.id).legalCount).toBe(1)
  })

  it('20. non-Wizard ordinary caster (Cleric): empty state missing the real total; options respect class list and legal max level', () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'cleric-xphb')!.spellRequirements!
    const spellReq = requirements.find((r) => r.pool === 'spell')!
    const catalogue = [entry('cleric-low', 1, ['Cleric']), entry('cleric-high', 3, ['Cleric']), entry('wizard-low', 1, ['Wizard'])]
    const slots: SpellSlotLevel[] = [{ level: 1, max: 4, expended: 0 }]

    const plan = planSpellAcquisition({ requirements, characterLevel: 1, candidates: [], catalogue, spellSlotLevels: slots })
    const r = planOf(plan, spellReq.id)
    expect(r.target).toBe(spellReq.totalByLevel[0])
    expect(r.missing).toBe(spellReq.totalByLevel[0])
    const refs = r.options.map((o) => o.slug)
    expect(refs).toContain('cleric-low')
    expect(refs).not.toContain('cleric-high')
    expect(refs).not.toContain('wizard-low')

    const tentative = planSpellAcquisition({
      requirements, characterLevel: 1, candidates: [], catalogue, spellSlotLevels: slots,
      tentative: [tentativeFor(spellReq.id, 'cleric-low')]
    })
    expect(planOf(tentative, spellReq.id).missing).toBe(spellReq.totalByLevel[0] - 1)
  })

  it('21. half caster starting at Level 1 (Paladin): real non-zero requirement at Level 1, no 2014 Level-2 assumption', () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'paladin-xphb')!.spellRequirements!
    const spellReq = requirements.find((r) => r.pool === 'spell')!
    expect(spellReq.totalByLevel[0]).toBeGreaterThan(0)
    expect(requirements.find((r) => r.pool === 'cantrip')).toBeUndefined()

    const catalogue = [entry('pal-a', 1, ['Paladin'])]
    const slots: SpellSlotLevel[] = [{ level: 1, max: 2, expended: 0 }]
    const plan = planSpellAcquisition({ requirements, characterLevel: 1, candidates: [], catalogue, spellSlotLevels: slots })
    const r = planOf(plan, spellReq.id)
    expect(r.target).toBe(spellReq.totalByLevel[0])
    expect(r.options.map((o) => o.slug)).toContain('pal-a')
  })

  it('22. Warlock ordinary pools (cantrip + spell) resolve at an ordinary level with their own real totals', () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb')!.spellRequirements!
    const cantripReq = requirements.find((r) => r.pool === 'cantrip')!
    const spellReq = requirements.find((r) => r.pool === 'spell')!
    const slots: SpellSlotLevel[] = [{ level: 1, max: 1, expended: 0 }]
    const plan = planSpellAcquisition({ requirements, characterLevel: 1, candidates: [], catalogue: [], spellSlotLevels: slots })
    expect(planOf(plan, cantripReq.id).target).toBe(cantripReq.totalByLevel[0])
    expect(planOf(plan, spellReq.id).target).toBe(spellReq.totalByLevel[0])
  })

  it('23. a Mystic Arcanum tier appears only once its acquisition level is reached, and never consumes/is consumed by the ordinary pool', () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb')!.spellRequirements!
    const tier6 = requirements.find((r) => r.pool === 'arcanum' && r.filter.level === 6)!
    const spellReq = requirements.find((r) => r.pool === 'spell')!
    const slots: SpellSlotLevel[] = [{ level: 5, max: 3, expended: 0 }]

    const before = planSpellAcquisition({ requirements, characterLevel: 5, candidates: [], catalogue: [], spellSlotLevels: slots })
    expect(planOf(before, tier6.id).target).toBe(0)
    expect(planOf(before, tier6.id).satisfied).toBe(true)
    expect(planOf(before, tier6.id).options).toEqual([])

    const catalogue = [entry('tier-six', 6, ['Warlock']), entry('off-tier', 7, ['Warlock']), entry('ordinary', 1, ['Warlock'])]
    const after = planSpellAcquisition({
      requirements, characterLevel: 11, candidates: [], catalogue, spellSlotLevels: slots,
      tentative: [tentativeFor(tier6.id, 'tier-six'), tentativeFor(spellReq.id, 'ordinary')]
    })
    expect(planOf(after, tier6.id).target).toBe(1)
    expect(planOf(after, tier6.id).legalCount).toBe(1)
    expect(planOf(after, tier6.id).options.map((o) => o.slug)).not.toContain('off-tier') // exact tier level only
    expect(planOf(after, spellReq.id).legalCount).toBe(1) // the Arcanum pick did not also count here
  })
})

describe('P3.2 planner -- level jump (tests 24-26), using the REAL Bard requirement, empty state', () => {
  const requirements = findRulesFacet('dnd5e.2024', 'class', 'bard-xphb')!.spellRequirements!
  const spellReq = requirements.find((r) => r.pool === 'spell')!

  it('24. Level 1 target, computed directly', () => {
    const plan = planSpellAcquisition({ requirements, characterLevel: 1, candidates: [], catalogue: [], spellSlotLevels: [] })
    expect(planOf(plan, spellReq.id).target).toBe(spellReq.totalByLevel[0])
  })

  it('25. a mid-level target (8), with no dependence on levels 2-7 ever being visited', () => {
    const plan = planSpellAcquisition({ requirements, characterLevel: 8, candidates: [], catalogue: [], spellSlotLevels: [] })
    expect(planOf(plan, spellReq.id).target).toBe(spellReq.totalByLevel[7])
  })

  it('26. Level 20 target, in one call, identical to calling it fresh', () => {
    const plan = planSpellAcquisition({ requirements, characterLevel: 20, candidates: [], catalogue: [], spellSlotLevels: [] })
    expect(planOf(plan, spellReq.id).target).toBe(spellReq.totalByLevel[19])
  })
})

describe('P3.2 planner -- purity (tests 27-28)', () => {
  it('27. persisted input candidates are byte-identical after planning', () => {
    const candidates = Object.freeze(['a', 'b'].map((s) => stateCandidate(s, { prepared: true, mechanics: mechanics(s, 1, ['Wizard']) })))
    planSpellAcquisition({ requirements: [SYN_SPELL], characterLevel: 1, candidates, catalogue: [], spellSlotLevels: SLOTS_L1 })
    expect(candidates).toHaveLength(2)
    expect(candidates[0].identity).toBe(spellIdentityOf({ ref: ref('a') }))
  })

  it('28. tentative input is byte-identical after planning', () => {
    const tentative = Object.freeze([tentativeFor(SYN_SPELL.id, 'a')])
    const catalogue = [entry('a', 1, ['Wizard'])]
    planSpellAcquisition({ requirements: [SYN_SPELL], characterLevel: 1, candidates: [], catalogue, spellSlotLevels: SLOTS_L1, tentative })
    expect(tentative).toHaveLength(1)
    expect(tentative[0]).toEqual(tentativeFor(SYN_SPELL.id, 'a'))
  })
})

describe('P3.2 planner -- agreement with P3.1\'s own validator (no parallel interpretation)', () => {
  it('with no tentative answers, every requirement\'s target/legalCount/satisfied exactly matches validateSpellRequirements', () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
    const candidates = ['a', 'b', 'c', 'd', 'e', 'f'].map((s, i) => stateCandidate(s, { known: true, prepared: i < 4, mechanics: mechanics(s, 1, ['Wizard']) }))
    const slots: SpellSlotLevel[] = [{ level: 1, max: 2, expended: 0 }]

    const plan = planSpellAcquisition({ requirements, characterLevel: 1, candidates, catalogue: [], spellSlotLevels: slots })
    const validated = validateSpellRequirements({ requirements, characterLevel: 1, candidates, spellSlotLevels: slots })

    for (const requirement of requirements) {
      const planned = planOf(plan, requirement.id)
      const result = validated.find((r) => r.requirementId === requirement.id)!
      expect(planned.target).toBe(result.required)
      expect(planned.legalCount).toBe(result.owned)
      expect(planned.satisfied).toBe(result.satisfied)
      expect(planned.issues).toEqual(result.issues)
    }
  })
})

describe('P3.2 planner -- fixed-grant-shaped effective state (no real facet authors one yet; synthetic proof)', () => {
  it('a candidate carrying the POOL\'S OWN flag counts toward it, exactly like a real fixed grant would', () => {
    const grant = stateCandidate('granted', { prepared: true, mechanics: mechanics('Granted', 1, ['Wizard']) })
    const plan = planSpellAcquisition({ requirements: [SYN_SPELL], characterLevel: 1, candidates: [grant], catalogue: [], spellSlotLevels: SLOTS_L1 })
    expect(planOf(plan, SYN_SPELL.id).legalCount).toBe(1)
  })

  it('a candidate carrying the WRONG flag never reduces missing, exactly like a grant RAW does not count toward this pool', () => {
    const grant = stateCandidate('granted', { known: true, mechanics: mechanics('Granted', 1, ['Wizard']) }) // 'spell' pool reads `prepared`, not `known`
    const plan = planSpellAcquisition({ requirements: [SYN_SPELL], characterLevel: 1, candidates: [grant], catalogue: [], spellSlotLevels: SLOTS_L1 })
    expect(planOf(plan, SYN_SPELL.id).legalCount).toBe(0)
    expect(planOf(plan, SYN_SPELL.id).missing).toBe(4)
  })
})

describe('P3.2 planner -- dependency topology hardening (shared with P3.1\'s validator)', () => {
  it('a cyclic requirement pair cannot be made to appear complete by any tentative acquisition', () => {
    const cycleA: SpellRequirement = { id: 'req.a', pool: 'spell', filter: { classList: ['Wizard'] }, totalByLevel: Array(20).fill(1), requiresMembershipPool: 'req.b' }
    const cycleB: SpellRequirement = { id: 'req.b', pool: 'spellbook', filter: { classList: ['Wizard'] }, totalByLevel: Array(20).fill(1), requiresMembershipPool: 'req.a' }
    const catalogue = [entry('x', 1, ['Wizard'])]
    const plan = planSpellAcquisition({
      requirements: [cycleA, cycleB], characterLevel: 1, candidates: [], catalogue, spellSlotLevels: SLOTS_L1,
      tentative: [tentativeFor('req.a', 'x'), tentativeFor('req.b', 'x')]
    })
    expect(plan.complete).toBe(false)
    for (const r of plan.requirements) {
      expect(r.legalCount).toBe(0)
      expect(r.satisfied).toBe(false)
      expect(r.options).toEqual([]) // no option is ever offered for a topologically-broken requirement
      expect(r.issues.some((i) => i.kind === 'invalid-requirement-dependency')).toBe(true)
    }
  })

  it('the real Wizard dependency remains green through the planner', () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
    const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
    const plan = planSpellAcquisition({ requirements, characterLevel: 1, candidates: [], catalogue: [], spellSlotLevels: [{ level: 1, max: 2, expended: 0 }] })
    expect(planOf(plan, spellbookId).issues.some((i) => i.kind === 'invalid-requirement-dependency')).toBe(false)
  })
})

describe('P3.2 planner -- proposed answer-key shape (reported, not persisted)', () => {
  it('reuses progressionChoiceKey verbatim -- no new key-building rule', () => {
    const requirement = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!.find((r) => r.pool === 'spellbook')!
    expect(spellRequirementAnswerKey('class', 1, requirement)).toBe(progressionChoiceKey('class', 1, requirement.id))
  })
})
