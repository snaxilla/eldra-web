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
  spellIdentityOf,
  validateSpellRequirements,
  type SpellStateCandidate
} from '../../../app/lib/characters/spell-requirements'
import type { SpellSlotLevel } from '../../../app/lib/characters/spellcasting'

function mechanics(name: string, level: number, classLists?: string[]) {
  return resolveDnd5eSpellMechanics({ name, source: 'XPHB', level, school: 'V', ...(classLists ? { classLists } : {}) })!
}

function candidate(ref: string, opts: { known?: boolean, prepared?: boolean, mechanics: ReturnType<typeof mechanics> | null }): SpellStateCandidate {
  return {
    identity: spellIdentityOf({ ref: { packageId: 'eldra.solaris.xphb', slug: ref } }),
    known: opts.known ?? false,
    prepared: opts.prepared ?? false,
    mechanics: opts.mechanics
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

  it('23. a wrong-level pick is refused for that tier (a level-7 spell does not satisfy the Level-6 tier)', () => {
    const results = validateSpellRequirements({
      requirements, characterLevel: 11, spellSlotLevels: [],
      candidates: [candidate('wrong', { known: true, mechanics: mechanics('Wrong Tier', 7, ['Warlock']) })]
    })
    const result = results.find((r) => r.requirementId === tier6.id)!
    expect(result.satisfied).toBe(false)
    expect(result.issues.some((i) => i.kind === 'illegal-wrong-level')).toBe(true)
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
