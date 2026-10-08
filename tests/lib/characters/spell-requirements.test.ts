// D&D 2024 Character Rules P3.1 -- the spell requirement validator. Tests 5-27 of this phase's own
// acceptance matrix. Synthetic requirements prove the GENERIC mechanism (mirrors how P1/P2's own
// tests use synthetic feat/spell fixtures for mechanism proof); the Wizard and Mystic Arcanum
// sections use the REAL authored facet data, since those two mechanics are the ones this phase's
// own corpus audit singled out as structurally special.

import { describe, expect, it } from 'vitest'

import { findRulesFacet } from '../../../app/lib/content-rules'
import type { SpellRequirement } from '../../../app/lib/content-rules/types'
import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import {
  allSpellRequirementsSatisfied,
  detectRequirementTopologyIssues,
  mergeSpellStateCandidate,
  orphanedProvenanceIdentities,
  spellIdentityOf,
  validateSpellRequirements,
  type SpellStateCandidate
} from '../../../app/lib/characters/spell-requirements'
import type { SpellSlotLevel } from '../../../app/lib/characters/spellcasting'

function mechanics(name: string, level: number, classLists?: string[]) {
  return resolveDnd5eSpellMechanics({ name, source: 'XPHB', level, school: 'V', ...(classLists ? { classLists } : {}) })!
}

function candidate(ref: string, opts: { known?: boolean, prepared?: boolean, mechanics: ReturnType<typeof mechanics> | null, requirementIds?: readonly string[] }): SpellStateCandidate {
  return {
    identity: spellIdentityOf({ ref: { packageId: 'eldra.solaris.xphb', slug: ref } }),
    known: opts.known ?? false,
    prepared: opts.prepared ?? false,
    mechanics: opts.mechanics,
    ...(opts.requirementIds ? { requirementIds: opts.requirementIds } : {})
  }
}

const SLOTS_UP_TO_1: SpellSlotLevel[] = [{ level: 1, max: 4, expended: 0 }]
const SLOTS_UP_TO_3: SpellSlotLevel[] = [{ level: 1, max: 4, expended: 0 }, { level: 2, max: 3, expended: 0 }, { level: 3, max: 2, expended: 0 }]

const SYN_CANTRIP: SpellRequirement = { id: 'req.cantrip', pool: 'cantrip', filter: { classList: ['Wizard'], level: 0 }, totalByLevel: Array(20).fill(2) }
const SYN_SPELL: SpellRequirement = { id: 'req.spell', pool: 'spell', filter: { classList: ['Wizard'] }, totalByLevel: Array(20).fill(2) }

describe('P3.1 validator -- cantrip pool (tests 5-8)', () => {
  it('5. correct cantrip count is satisfied', () => {
    const [result] = validateSpellRequirements({
      requirements: [SYN_CANTRIP], characterLevel: 1, spellSlotLevels: [],
      candidates: [candidate('a', { known: true, mechanics: mechanics('A', 0, ['Wizard']) }), candidate('b', { known: true, mechanics: mechanics('B', 0, ['Wizard']) })]
    })
    expect(result.satisfied).toBe(true)
    expect(result.owned).toBe(2)
    expect(result.issues).toEqual([])
  })

  it('6. too few cantrips is missing', () => {
    const [result] = validateSpellRequirements({
      requirements: [SYN_CANTRIP], characterLevel: 1, spellSlotLevels: [],
      candidates: [candidate('a', { known: true, mechanics: mechanics('A', 0, ['Wizard']) })]
    })
    expect(result.satisfied).toBe(false)
    expect(result.issues).toEqual([{ kind: 'missing', count: 1 }])
  })

  it('7. too many cantrips is illegal (over-count)', () => {
    const [result] = validateSpellRequirements({
      requirements: [SYN_CANTRIP], characterLevel: 1, spellSlotLevels: [],
      candidates: [
        candidate('a', { known: true, mechanics: mechanics('A', 0, ['Wizard']) }),
        candidate('b', { known: true, mechanics: mechanics('B', 0, ['Wizard']) }),
        candidate('c', { known: true, mechanics: mechanics('C', 0, ['Wizard']) })
      ]
    })
    expect(result.satisfied).toBe(false)
    expect(result.owned).toBe(3)
    expect(result.issues).toEqual([{ kind: 'over-count', count: 1 }])
  })

  it('8. a wrong-class-list cantrip is illegal and does not count', () => {
    const [result] = validateSpellRequirements({
      requirements: [SYN_CANTRIP], characterLevel: 1, spellSlotLevels: [],
      candidates: [
        candidate('a', { known: true, mechanics: mechanics('A', 0, ['Wizard']) }),
        candidate('b', { known: true, mechanics: mechanics('B', 0, ['Cleric']) })
      ]
    })
    expect(result.owned).toBe(1)
    expect(result.issues).toEqual(expect.arrayContaining([{ kind: 'missing', count: 1 }, { kind: 'illegal-wrong-class-list', identity: spellIdentityOf({ ref: { packageId: 'eldra.solaris.xphb', slug: 'b' } }) }]))
  })
})

describe('P3.1 validator -- ordinary spell pool, level-gating (tests 9-13)', () => {
  it('9. correct ordinary spell count, within the legal max level, is satisfied', () => {
    const [result] = validateSpellRequirements({
      requirements: [SYN_SPELL], characterLevel: 1, spellSlotLevels: SLOTS_UP_TO_1,
      candidates: [
        candidate('a', { prepared: true, mechanics: mechanics('A', 1, ['Wizard']) }),
        candidate('b', { prepared: true, mechanics: mechanics('B', 1, ['Wizard']) })
      ]
    })
    expect(result.satisfied).toBe(true)
  })

  it('10. a spell above the legal maximum (derived from spell slots) is illegal and does not count', () => {
    const [result] = validateSpellRequirements({
      requirements: [SYN_SPELL], characterLevel: 1, spellSlotLevels: SLOTS_UP_TO_1,
      candidates: [
        candidate('a', { prepared: true, mechanics: mechanics('A', 1, ['Wizard']) }),
        candidate('b', { prepared: true, mechanics: mechanics('B', 3, ['Wizard']) })
      ]
    })
    expect(result.owned).toBe(1)
    expect(result.issues).toEqual(expect.arrayContaining([
      { kind: 'missing', count: 1 },
      { kind: 'illegal-wrong-level', identity: spellIdentityOf({ ref: { packageId: 'eldra.solaris.xphb', slug: 'b' } }), level: 3, maxLevel: 1 }
    ]))
  })

  it('the same spell is legal once the character\'s own slot access actually reaches that level', () => {
    const [result] = validateSpellRequirements({
      requirements: [SYN_SPELL], characterLevel: 3, spellSlotLevels: SLOTS_UP_TO_3,
      candidates: [
        candidate('a', { prepared: true, mechanics: mechanics('A', 1, ['Wizard']) }),
        candidate('b', { prepared: true, mechanics: mechanics('B', 3, ['Wizard']) })
      ]
    })
    expect(result.owned).toBe(2)
    expect(result.satisfied).toBe(true)
  })

  it('11. duplicate physical rows (same identity) do not inflate the count', () => {
    const one = candidate('a', { prepared: true, mechanics: mechanics('A', 1, ['Wizard']) })
    const req: SpellRequirement = { ...SYN_SPELL, totalByLevel: Array(20).fill(1) }
    const [result] = validateSpellRequirements({ requirements: [req], characterLevel: 1, spellSlotLevels: SLOTS_UP_TO_1, candidates: [one, { ...one }] })
    expect(result.owned).toBe(1)
    expect(result.satisfied).toBe(true)
  })

  it('12. an unresolved/unknown spell fails closed and does not count', () => {
    const [result] = validateSpellRequirements({
      requirements: [SYN_SPELL], characterLevel: 1, spellSlotLevels: SLOTS_UP_TO_1,
      candidates: [candidate('ghost', { prepared: true, mechanics: null })]
    })
    expect(result.owned).toBe(0)
    expect(result.issues).toEqual(expect.arrayContaining([{ kind: 'illegal-unresolved', identity: spellIdentityOf({ ref: { packageId: 'eldra.solaris.xphb', slug: 'ghost' } }) }]))
  })

  it('13. a spell with no normalized classLists fails closed, never "matches anything"', () => {
    const [result] = validateSpellRequirements({
      requirements: [SYN_SPELL], characterLevel: 1, spellSlotLevels: SLOTS_UP_TO_1,
      candidates: [candidate('unenriched', { prepared: true, mechanics: mechanics('Unenriched', 1) })]
    })
    expect(result.owned).toBe(0)
    expect(result.issues).toEqual(expect.arrayContaining([{ kind: 'illegal-wrong-class-list', identity: spellIdentityOf({ ref: { packageId: 'eldra.solaris.xphb', slug: 'unenriched' } }) }]))
  })
})

describe('P3.1 validator -- unknown pool kind fails closed', () => {
  it('an unrecognized pool is never silently satisfied', () => {
    const bogus = { id: 'req.bogus', pool: 'bogus' as unknown as SpellRequirement['pool'], filter: { classList: ['Wizard'] }, totalByLevel: [1] }
    const [result] = validateSpellRequirements({ requirements: [bogus], characterLevel: 1, spellSlotLevels: [], candidates: [] })
    expect(result.satisfied).toBe(false)
  })
})

describe('P3.1 validator -- Wizard spellbook + prepared, using the REAL authored facet (tests 14-18)', () => {
  const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
  const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
  const SLOTS_L1: SpellSlotLevel[] = [{ level: 1, max: 2, expended: 0 }]

  function wizardSpell(name: string, level: number) {
    return mechanics(name, level, ['Wizard'])
  }

  it('14. six legal Wizard level-1 spells, all known, satisfy the spellbook requirement at Level 1', () => {
    const candidates = ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => candidate(s, { known: true, mechanics: wizardSpell(s, 1) }))
    const results = validateSpellRequirements({ requirements, characterLevel: 1, spellSlotLevels: SLOTS_L1, candidates })
    const spellbook = results.find((r) => r.requirementId === spellbookId)!
    expect(spellbook.satisfied).toBe(true)
    expect(spellbook.owned).toBe(6)
  })

  it('15. five spellbook entries is missing one', () => {
    const candidates = ['a', 'b', 'c', 'd', 'e'].map((s) => candidate(s, { known: true, mechanics: wizardSpell(s, 1) }))
    const results = validateSpellRequirements({ requirements, characterLevel: 1, spellSlotLevels: SLOTS_L1, candidates })
    const spellbook = results.find((r) => r.requirementId === spellbookId)!
    expect(spellbook.issues).toEqual([{ kind: 'missing', count: 1 }])
  })

  it('16. seven spellbook entries is SATISFIED, never illegal -- the spellbook is a cumulative MINIMUM, confirmed from the corpus\'s own "whenever you gain a level, ADD spells" wording (it never shrinks, so extra is never wrong)', () => {
    const candidates = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s) => candidate(s, { known: true, mechanics: wizardSpell(s, 1) }))
    const results = validateSpellRequirements({ requirements, characterLevel: 1, spellSlotLevels: SLOTS_L1, candidates })
    const spellbook = results.find((r) => r.requirementId === spellbookId)!
    expect(spellbook.satisfied).toBe(true)
    expect(spellbook.owned).toBe(7)
    expect(spellbook.issues).toEqual([])
  })

  it('17. the prepared ("spell") pool is independently validated: a legal subset of the spellbook, by its own required count', () => {
    const spellbookEntries = ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => candidate(s, { known: true, mechanics: wizardSpell(s, 1) }))
    const preparedSubset = spellbookEntries.slice(0, 4).map((c) => ({ ...c, prepared: true }))
    const results = validateSpellRequirements({
      requirements, characterLevel: 1, spellSlotLevels: SLOTS_L1,
      candidates: [...spellbookEntries.slice(4), ...preparedSubset]
    })
    const spellReq = requirements.find((r) => r.pool === 'spell')!
    const prepared = results.find((r) => r.requirementId === spellReq.id)!
    expect(prepared.satisfied).toBe(true)
    expect(prepared.owned).toBe(4)
  })

  it('a prepared spell NOT in the spellbook is illegal (the membership gate), and does not count toward prepared', () => {
    const inBook = ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => candidate(s, { known: true, prepared: s === 'a', mechanics: wizardSpell(s, 1) }))
    const outsideBook = candidate('intruder', { prepared: true, mechanics: wizardSpell('intruder', 1) })
    const results = validateSpellRequirements({ requirements, characterLevel: 1, spellSlotLevels: SLOTS_L1, candidates: [...inBook, outsideBook] })
    const spellReq = requirements.find((r) => r.pool === 'spell')!
    const prepared = results.find((r) => r.requirementId === spellReq.id)!
    expect(prepared.owned).toBe(1)
    expect(prepared.issues).toEqual(expect.arrayContaining([
      { kind: 'illegal-not-in-membership-pool', identity: spellIdentityOf({ ref: { packageId: 'eldra.solaris.xphb', slug: 'intruder' } }), membershipPoolId: spellbookId }
    ]))
  })

  it('18. the SAME spell may be both spellbook-known and prepared at once, counted toward BOTH pools under each pool\'s own real required count, never flagged as duplicate corruption', () => {
    // Six spellbook entries (the real Level-1 minimum); exactly four of them are ALSO prepared
    // (the real Level-1 prepared total) -- the overlapping four satisfy both roles at once.
    const all6 = ['a', 'b', 'c', 'd', 'e', 'f'].map((s, i) => candidate(s, { known: true, prepared: i < 4, mechanics: wizardSpell(s, 1) }))
    const results = validateSpellRequirements({ requirements, characterLevel: 1, spellSlotLevels: SLOTS_L1, candidates: all6 })
    const spellbook = results.find((r) => r.requirementId === spellbookId)!
    const spellReq = requirements.find((r) => r.pool === 'spell')!
    const prepared = results.find((r) => r.requirementId === spellReq.id)!
    expect(spellbook.owned).toBe(6)
    expect(prepared.owned).toBe(4)
    expect(allSpellRequirementsSatisfied([spellbook, prepared])).toBe(true)
  })
})

describe('P3.1 validator -- level jump safety (tests 19-21), using the REAL Bard requirement', () => {
  const requirements = findRulesFacet('dnd5e.2024', 'class', 'bard-xphb')!.spellRequirements!
  const spellReq = requirements.find((r) => r.pool === 'spell')!

  it('19. requirement resolution at Level 1 (no candidates, so missing = the full table value)', () => {
    const results = validateSpellRequirements({ requirements, characterLevel: 1, spellSlotLevels: [], candidates: [] })
    expect(results.find((r) => r.requirementId === spellReq.id)!.required).toBe(spellReq.totalByLevel[0])
  })

  it('20. requirement resolution at a mid level (8), with no dependence on levels 2-7 ever being visited', () => {
    const results = validateSpellRequirements({ requirements, characterLevel: 8, spellSlotLevels: [], candidates: [] })
    expect(results.find((r) => r.requirementId === spellReq.id)!.required).toBe(spellReq.totalByLevel[7])
  })

  it('21. requirement resolution at Level 20 in one call, identical to calling it fresh (no sequential state)', () => {
    const results = validateSpellRequirements({ requirements, characterLevel: 20, spellSlotLevels: [], candidates: [] })
    expect(results.find((r) => r.requirementId === spellReq.id)!.required).toBe(spellReq.totalByLevel[19])
  })
})

describe('P3.1 validator -- Mystic Arcanum (tests 22-24), using the REAL authored Warlock facet', () => {
  const requirements = findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb')!.spellRequirements!
  const tier6 = requirements.find((r) => r.pool === 'arcanum' && r.filter.level === 6)!
  const ordinarySpell = requirements.find((r) => r.pool === 'spell')!

  it('22. each tier requires exactly its own real spell level', () => {
    const tierLevels = requirements.filter((r) => r.pool === 'arcanum').map((r) => r.filter.level).sort()
    expect(tierLevels).toEqual([6, 7, 8, 9])
  })

  it('a level-6 spell, known, satisfies the Level-6 tier once the character reaches Level 11', () => {
    const results = validateSpellRequirements({
      requirements, characterLevel: 11, spellSlotLevels: [],
      candidates: [candidate('tier6pick', { known: true, mechanics: mechanics('Tier 6 Pick', 6, ['Warlock']) })]
    })
    expect(results.find((r) => r.requirementId === tier6.id)!.satisfied).toBe(true)
  })

  // P3.2.1 -- updated to tag the candidate explicitly for tier6 (`requirementIds: [tier6.id]`),
  // matching how a REAL tentative/persisted acquisition would actually arrive (P3.2's own
  // `{requirementId, ref}` shape, now carried onto the persisted candidate). The exact original
  // assertion is unchanged: a wrong-level pick EXPLICITLY SUBMITTED FOR tier6 is still refused for
  // tier6. See the companion test immediately below for the other half of what provenance now
  // resolves: the SAME spell, tagged for a DIFFERENT tier, is never even a tier6 candidate.
  it('23. a wrong-level pick explicitly tagged for this tier is refused for that tier (a level-7 spell does not satisfy the Level-6 tier)', () => {
    const results = validateSpellRequirements({
      requirements, characterLevel: 11, spellSlotLevels: [],
      candidates: [candidate('wrong', { known: true, mechanics: mechanics('Wrong Tier', 7, ['Warlock']), requirementIds: [tier6.id] })]
    })
    const result = results.find((r) => r.requirementId === tier6.id)!
    expect(result.satisfied).toBe(false)
    expect(result.issues.some((i) => i.kind === 'illegal-wrong-level')).toBe(true)
  })

  it('23 companion (P3.2.1) -- the SAME level-7 spell, tagged ONLY for tier7, is not even evaluated as a tier6 candidate', () => {
    const tier7 = requirements.find((r) => r.pool === 'arcanum' && r.filter.level === 7)!
    const results = validateSpellRequirements({
      requirements, characterLevel: 13, spellSlotLevels: [],
      candidates: [candidate('wrong', { known: true, mechanics: mechanics('Wrong Tier', 7, ['Warlock']), requirementIds: [tier7.id] })]
    })
    const tier6Result = results.find((r) => r.requirementId === tier6.id)!
    const tier7Result = results.find((r) => r.requirementId === tier7.id)!
    // tier6 never sees it at all -- no issue naming it, not even "illegal": it is simply not a
    // candidate for tier6, exactly as an untagged, unrelated spell would also not be.
    expect(tier6Result.issues).toEqual([{ kind: 'missing', count: 1 }])
    expect(tier7Result.satisfied).toBe(true)
  })

  it('24. the ordinary Warlock spell pool and the Arcanum tier pool do not consume each other\'s counts', () => {
    const ordinaryPick = candidate('ordinary', { prepared: true, mechanics: mechanics('Ordinary', 1, ['Warlock']) })
    const arcanumPick = candidate('arcanum6', { known: true, mechanics: mechanics('Arcanum Six', 6, ['Warlock']) })
    const results = validateSpellRequirements({
      requirements, characterLevel: 11,
      spellSlotLevels: [{ level: 3, max: 2, expended: 0 }],
      candidates: [ordinaryPick, arcanumPick]
    })
    const ordinary = results.find((r) => r.requirementId === ordinarySpell.id)!
    const tier = results.find((r) => r.requirementId === tier6.id)!
    expect(ordinary.owned).toBe(1)
    expect(tier.owned).toBe(1)
  })
})

describe('P3.1 validator -- historical read compatibility (tests 25-26)', () => {
  it('25. no candidates at all (a character with an empty or never-saved spellcasting block) still resolves, never throws', () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'cleric-xphb')!.spellRequirements!
    expect(() => validateSpellRequirements({ requirements, characterLevel: 5, spellSlotLevels: [], candidates: [] })).not.toThrow()
  })

  it('26. an incomplete historical state is reported as missing, with the input candidates array left untouched (no mutation)', () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'cleric-xphb')!.spellRequirements!
    const candidates = Object.freeze([candidate('one', { prepared: true, mechanics: mechanics('One', 1, ['Cleric']) })])
    const results = validateSpellRequirements({ requirements, characterLevel: 5, spellSlotLevels: [{ level: 1, max: 4, expended: 0 }], candidates })
    expect(results.some((r) => !r.satisfied)).toBe(true)
    expect(candidates).toHaveLength(1) // frozen input, unmutated
  })
})

describe('P3.2 HARDENING -- requirement dependency topology (unknown / self / cycle)', () => {
  const unknownTarget: SpellRequirement = { id: 'req.a', pool: 'spell', filter: { classList: ['Wizard'] }, totalByLevel: Array(20).fill(1), requiresMembershipPool: 'req.ghost' }
  const selfTarget: SpellRequirement = { id: 'req.a', pool: 'spell', filter: { classList: ['Wizard'] }, totalByLevel: Array(20).fill(1), requiresMembershipPool: 'req.a' }
  const cycleA: SpellRequirement = { id: 'req.a', pool: 'spell', filter: { classList: ['Wizard'] }, totalByLevel: Array(20).fill(1), requiresMembershipPool: 'req.b' }
  const cycleB: SpellRequirement = { id: 'req.b', pool: 'spellbook', filter: { classList: ['Wizard'] }, totalByLevel: Array(20).fill(1), requiresMembershipPool: 'req.a' }

  it('an unknown requiresMembershipPool reference is an explicit configuration issue, not a silently-empty membership pool', () => {
    const [result] = validateSpellRequirements({ requirements: [unknownTarget], characterLevel: 1, spellSlotLevels: [], candidates: [] })
    expect(result.issues).toEqual(expect.arrayContaining([{ kind: 'invalid-requirement-dependency', reason: 'unknown', membershipPoolId: 'req.ghost' }]))
  })

  it('a requirement that names itself is an explicit configuration issue', () => {
    const [result] = validateSpellRequirements({ requirements: [selfTarget], characterLevel: 1, spellSlotLevels: [], candidates: [] })
    expect(result.issues).toEqual(expect.arrayContaining([{ kind: 'invalid-requirement-dependency', reason: 'self', membershipPoolId: 'req.a' }]))
  })

  it('an A -> B -> A cycle is an explicit configuration issue on BOTH requirements', () => {
    const results = validateSpellRequirements({ requirements: [cycleA, cycleB], characterLevel: 1, spellSlotLevels: [], candidates: [] })
    expect(results.find((r) => r.requirementId === 'req.a')!.issues).toEqual(expect.arrayContaining([{ kind: 'invalid-requirement-dependency', reason: 'cycle', membershipPoolId: 'req.b' }]))
    expect(results.find((r) => r.requirementId === 'req.b')!.issues).toEqual(expect.arrayContaining([{ kind: 'invalid-requirement-dependency', reason: 'cycle', membershipPoolId: 'req.a' }]))
  })

  it('no otherwise-legal candidate can satisfy a cyclic requirement -- malformed topology can never appear complete', () => {
    const candidates = [candidate('x', { known: true, prepared: true, mechanics: mechanics('X', 1, ['Wizard']) })]
    const results = validateSpellRequirements({ requirements: [cycleA, cycleB], characterLevel: 1, spellSlotLevels: [{ level: 1, max: 2, expended: 0 }], candidates })
    for (const result of results) {
      expect(result.owned).toBe(0)
      expect(result.satisfied).toBe(false)
    }
  })

  it('a longer (3-requirement) cycle is caught by the same generic bounded walk', () => {
    const x: SpellRequirement = { id: 'req.x', pool: 'spell', filter: { classList: ['Wizard'] }, totalByLevel: Array(20).fill(1), requiresMembershipPool: 'req.y' }
    const y: SpellRequirement = { id: 'req.y', pool: 'spellbook', filter: { classList: ['Wizard'] }, totalByLevel: Array(20).fill(1), requiresMembershipPool: 'req.z' }
    const z: SpellRequirement = { id: 'req.z', pool: 'cantrip', filter: { classList: ['Wizard'], level: 0 }, totalByLevel: Array(20).fill(1), requiresMembershipPool: 'req.x' }
    const issues = detectRequirementTopologyIssues([x, y, z])
    expect(issues.size).toBe(3)
    for (const requirement of [x, y, z]) expect(issues.get(requirement.id)!.kind).toBe('invalid-requirement-dependency')
  })

  it('the real Wizard dependency (prepared requires spellbook) is well-formed -- zero topology issues', () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
    expect(detectRequirementTopologyIssues(requirements).size).toBe(0)
  })
})

describe('P3.2.1 -- SPELL REQUIREMENT PROVENANCE (the cross-pool collision fix)', () => {
  const SYN_CANTRIP_A: SpellRequirement = { id: 'req.cantripA', pool: 'cantrip', filter: { classList: ['Wizard'], level: 0 }, totalByLevel: Array(20).fill(1) }
  const SYN_SPELLBOOK: SpellRequirement = { id: 'req.spellbook', pool: 'spellbook', filter: { classList: ['Wizard'] }, totalByLevel: Array(20).fill(1) }

  it('a candidate tagged for requirement A is evaluated for A even if it would ALSO match B\'s flag', () => {
    const tagged = candidate('a', { known: true, mechanics: mechanics('A', 0, ['Wizard']), requirementIds: [SYN_CANTRIP_A.id] })
    const results = validateSpellRequirements({ requirements: [SYN_CANTRIP_A], characterLevel: 1, spellSlotLevels: [], candidates: [tagged] })
    expect(results[0]!.satisfied).toBe(true)
  })

  it('that SAME tagged candidate does NOT pollute a DIFFERENT requirement sharing the same flag, even though it previously would have', () => {
    // SYN_SPELLBOOK also reads `known` and requires level >= 1 -- the EXACT shape that produced the
    // spurious cross-pool issue this phase fixed. A cantrip (level 0), tagged ONLY for
    // SYN_CANTRIP_A, must never even be walked for SYN_SPELLBOOK.
    const tagged = candidate('a', { known: true, mechanics: mechanics('A', 0, ['Wizard']), requirementIds: [SYN_CANTRIP_A.id] })
    const results = validateSpellRequirements({ requirements: [SYN_CANTRIP_A, SYN_SPELLBOOK], characterLevel: 1, spellSlotLevels: [], candidates: [tagged] })
    const spellbookResult = results.find((r) => r.requirementId === SYN_SPELLBOOK.id)!
    expect(spellbookResult.owned).toBe(0)
    expect(spellbookResult.issues).toEqual([{ kind: 'missing', count: 1 }]) // no illegal-wrong-level -- never even a candidate
  })

  it('an UNTAGGED candidate still exhibits the pre-P3.2.1 legacy heuristic (documented, not fixed, for backward compatibility)', () => {
    // The same scenario as above, but WITHOUT a tag -- proving the legacy fallback is truly
    // unchanged (including its known limitation) rather than silently also fixed, which would be
    // an undocumented behavior change for historical rows.
    const untagged = candidate('a', { known: true, mechanics: mechanics('A', 0, ['Wizard']) })
    const results = validateSpellRequirements({ requirements: [SYN_CANTRIP_A, SYN_SPELLBOOK], characterLevel: 1, spellSlotLevels: [], candidates: [untagged] })
    const spellbookResult = results.find((r) => r.requirementId === SYN_SPELLBOOK.id)!
    expect(spellbookResult.issues.some((i) => i.kind === 'illegal-wrong-level')).toBe(true)
  })

  it('an empty requirementIds array behaves identically to absent -- never "tagged with nothing, invisible everywhere"', () => {
    const emptyTagged = candidate('a', { known: true, mechanics: mechanics('A', 0, ['Wizard']), requirementIds: [] })
    const results = validateSpellRequirements({ requirements: [SYN_CANTRIP_A], characterLevel: 1, spellSlotLevels: [], candidates: [emptyTagged] })
    expect(results[0]!.satisfied).toBe(true)
  })

  it('duplicate requirementIds on one candidate never double-count', () => {
    const tagged = candidate('a', { known: true, mechanics: mechanics('A', 0, ['Wizard']), requirementIds: [SYN_CANTRIP_A.id, SYN_CANTRIP_A.id, SYN_CANTRIP_A.id] })
    const results = validateSpellRequirements({ requirements: [SYN_CANTRIP_A], characterLevel: 1, spellSlotLevels: [], candidates: [tagged] })
    expect(results[0]!.owned).toBe(1)
    expect(results[0]!.satisfied).toBe(true)
  })

  describe('orphanedProvenanceIdentities', () => {
    it('reports a candidate whose EVERY tag is unknown to the current requirement set', () => {
      const orphan = candidate('a', { known: true, mechanics: mechanics('A', 0, ['Wizard']), requirementIds: ['req.stale-from-a-prior-package-version'] })
      const identities = orphanedProvenanceIdentities([SYN_CANTRIP_A], [orphan])
      expect(identities).toEqual([spellIdentityOf({ ref: { packageId: 'eldra.solaris.xphb', slug: 'a' } })])
    })

    it('does NOT report a candidate with at least one known tag, even alongside an unknown one', () => {
      const mixed = candidate('a', { known: true, mechanics: mechanics('A', 0, ['Wizard']), requirementIds: ['req.stale', SYN_CANTRIP_A.id] })
      expect(orphanedProvenanceIdentities([SYN_CANTRIP_A], [mixed])).toEqual([])
    })

    it('does NOT report an untagged (legacy) candidate', () => {
      const legacy = candidate('a', { known: true, mechanics: mechanics('A', 0, ['Wizard']) })
      expect(orphanedProvenanceIdentities([SYN_CANTRIP_A], [legacy])).toEqual([])
    })
  })

  describe('mergeSpellStateCandidate', () => {
    it('unions requirementIds and ORs known/prepared, never producing a duplicate physical row', () => {
      const a = candidate('magic-missile', { known: true, mechanics: mechanics('Magic Missile', 1, ['Wizard']), requirementIds: ['req.spellbook'] })
      const b = candidate('magic-missile', { prepared: true, mechanics: mechanics('Magic Missile', 1, ['Wizard']), requirementIds: ['req.spell'] })
      const merged = mergeSpellStateCandidate(a, b)
      expect(merged.known).toBe(true)
      expect(merged.prepared).toBe(true)
      expect(merged.requirementIds).toEqual(expect.arrayContaining(['req.spellbook', 'req.spell']))
      expect(merged.requirementIds).toHaveLength(2)
    })

    it('never produces an empty requirementIds array when neither side has one', () => {
      const a = candidate('a', { known: true, mechanics: mechanics('A', 1, ['Wizard']) })
      const b = candidate('a', { prepared: true, mechanics: mechanics('A', 1, ['Wizard']) })
      expect(mergeSpellStateCandidate(a, b).requirementIds).toBeUndefined()
    })

    it('with no base, returns a copy of next (first insert)', () => {
      const next = candidate('a', { known: true, mechanics: mechanics('A', 1, ['Wizard']), requirementIds: ['req.x'] })
      const merged = mergeSpellStateCandidate(undefined, next)
      expect(merged).toEqual(next)
      expect(merged).not.toBe(next) // a copy, not the same reference
    })
  })

  describe('REAL Wizard, full Level-1 state, explicitly tagged (3 cantrips + 6 spellbook + 4 prepared)', () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const SLOTS_L1: SpellSlotLevel[] = [{ level: 1, max: 2, expended: 0 }]

    function wizardSpell(name: string, level: number) {
      return mechanics(name, level, ['Wizard'])
    }

    it('reaches complete, each pool exact, zero cross-contamination -- no heuristic filtering needed', () => {
      const cantrips = ['c1', 'c2', 'c3'].map((s) => candidate(s, { known: true, mechanics: wizardSpell(s, 0), requirementIds: [cantripId] }))
      const spellbookOnly = ['s5', 's6'].map((s) => candidate(s, { known: true, mechanics: wizardSpell(s, 1), requirementIds: [spellbookId] }))
      const spellbookAndPrepared = ['s1', 's2', 's3', 's4'].map((s) => candidate(s, {
        known: true, prepared: true, mechanics: wizardSpell(s, 1), requirementIds: [spellbookId, spellId]
      }))

      const results = validateSpellRequirements({
        requirements, characterLevel: 1, spellSlotLevels: SLOTS_L1,
        candidates: [...cantrips, ...spellbookOnly, ...spellbookAndPrepared]
      })

      expect(allSpellRequirementsSatisfied(results)).toBe(true)

      const cantripResult = results.find((r) => r.requirementId === cantripId)!
      expect(cantripResult.owned).toBe(3)
      expect(cantripResult.issues).toEqual([])

      const spellbookResult = results.find((r) => r.requirementId === spellbookId)!
      expect(spellbookResult.owned).toBe(6)
      expect(spellbookResult.issues).toEqual([])

      const preparedResult = results.find((r) => r.requirementId === spellId)!
      expect(preparedResult.owned).toBe(4)
      expect(preparedResult.issues).toEqual([])
    })
  })

  describe('REAL Warlock, Level 20, every shared-`known` pool simultaneously (cantrip, ordinary, 4 Arcanum tiers)', () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb')!.spellRequirements!
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const tier6 = requirements.find((r) => r.pool === 'arcanum' && r.filter.level === 6)!
    const tier7 = requirements.find((r) => r.pool === 'arcanum' && r.filter.level === 7)!
    const tier8 = requirements.find((r) => r.pool === 'arcanum' && r.filter.level === 8)!
    const tier9 = requirements.find((r) => r.pool === 'arcanum' && r.filter.level === 9)!

    function warlockSpell(name: string, level: number) {
      return mechanics(name, level, ['Warlock'])
    }

    it('every pool evaluates independently at real Level-20 target counts, no tier contaminating cantrip/ordinary/another tier', () => {
      const cantripTarget = requirements.find((r) => r.pool === 'cantrip')!.totalByLevel[19]!
      const spellTarget = requirements.find((r) => r.pool === 'spell')!.totalByLevel[19]!

      const cantrips = Array.from({ length: cantripTarget }, (_, i) => candidate(`cantrip-${i}`, {
        known: true, mechanics: warlockSpell(`Cantrip ${i}`, 0), requirementIds: [cantripId]
      }))
      const ordinary = Array.from({ length: spellTarget }, (_, i) => candidate(`ordinary-${i}`, {
        prepared: true, mechanics: warlockSpell(`Ordinary ${i}`, 1), requirementIds: [spellId]
      }))
      const arcanum6 = candidate('arcanum-6', { known: true, mechanics: warlockSpell('Arcanum Six', 6), requirementIds: [tier6.id] })
      const arcanum7 = candidate('arcanum-7', { known: true, mechanics: warlockSpell('Arcanum Seven', 7), requirementIds: [tier7.id] })
      const arcanum8 = candidate('arcanum-8', { known: true, mechanics: warlockSpell('Arcanum Eight', 8), requirementIds: [tier8.id] })
      const arcanum9 = candidate('arcanum-9', { known: true, mechanics: warlockSpell('Arcanum Nine', 9), requirementIds: [tier9.id] })

      const results = validateSpellRequirements({
        requirements, characterLevel: 20, spellSlotLevels: [{ level: 5, max: 3, expended: 0 }],
        candidates: [...cantrips, ...ordinary, arcanum6, arcanum7, arcanum8, arcanum9]
      })

      expect(allSpellRequirementsSatisfied(results)).toBe(true)
      for (const tier of [tier6, tier7, tier8, tier9]) {
        const result = results.find((r) => r.requirementId === tier.id)!
        expect(result.owned).toBe(1)
        expect(result.issues).toEqual([])
      }
      expect(results.find((r) => r.requirementId === cantripId)!.owned).toBe(cantripTarget)
      expect(results.find((r) => r.requirementId === spellId)!.owned).toBe(spellTarget)
    })
  })

  describe('Magic Initiate collision isolation (synthetic feat requirement id -- Magic Initiate authoring is not implemented yet)', () => {
    it('a feat-granted Wizard-list cantrip, tagged with a feat requirement id, does NOT count toward the Wizard CLASS cantrip requirement', () => {
      const classCantrip: SpellRequirement = { id: 'spell-requirement.wizard-xphb.cantrip', pool: 'cantrip', filter: { classList: ['Wizard'], level: 0 }, totalByLevel: Array(20).fill(3) }
      const featCantrip = candidate('magic-initiate-cantrip', {
        known: true,
        mechanics: mechanics('Magic Initiate Cantrip', 0, ['Wizard']), // level 0, classLists includes Wizard, known: true -- every heuristic signal matches
        requirementIds: ['spell-requirement.feat.magic-initiate.synthetic'] // but tagged for a DIFFERENT (feat) requirement entirely
      })

      const [result] = validateSpellRequirements({ requirements: [classCantrip], characterLevel: 1, spellSlotLevels: [], candidates: [featCantrip] })
      expect(result.owned).toBe(0)
      expect(result.issues).toEqual([{ kind: 'missing', count: 3 }]) // never counted, never even flagged illegal -- simply not a candidate
    })
  })
})
