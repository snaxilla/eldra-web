// D&D 2024 Character Rules P3.1 -- corpus-count proof. Re-reads the REAL class corpus directly
// (never the §25.26 audit's written numbers, never this session's own earlier scratch file) and
// independently recomputes every derived array, then compares against the authored facet data in
// app/lib/content-rules/dnd5e-2024.ts. A corpus change that invalidates the authored data fails
// this test, not silently passes.

import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { findRulesFacet } from '../../../app/lib/content-rules'
import type { SpellRequirement } from '../../../app/lib/content-rules/types'

const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'

const CASTERS: readonly { name: string, slug: string }[] = [
  { name: 'Bard', slug: 'bard-xphb' },
  { name: 'Cleric', slug: 'cleric-xphb' },
  { name: 'Druid', slug: 'druid-xphb' },
  { name: 'Paladin', slug: 'paladin-xphb' },
  { name: 'Ranger', slug: 'ranger-xphb' },
  { name: 'Sorcerer', slug: 'sorcerer-xphb' },
  { name: 'Warlock', slug: 'warlock-xphb' },
  { name: 'Wizard', slug: 'wizard-xphb' }
]

type RawClass = {
  name: string
  source: string
  preparedSpellsProgression?: number[]
  cantripProgression?: number[]
  spellsKnownProgressionFixed?: number[]
  spellsKnownProgressionFixedAllowLowerLevel?: boolean
  spellsKnownProgressionFixedByLevel?: Record<string, Record<string, number>>
}

function loadRawClass(name: string): RawClass {
  for (const file of readdirSync(`${DATA_ROOT}/class`)) {
    if (!/^class-.*\.json$/.test(file)) continue
    const data = JSON.parse(readFileSync(`${DATA_ROOT}/class/${file}`, 'utf8'))
    const found = (data.class ?? []).find((c: RawClass) => c.source === 'XPHB' && c.name === name)
    if (found) return found
  }
  throw new Error(`class not found in the real corpus: ${name}`)
}

function requirementsFor(slug: string): readonly SpellRequirement[] {
  return findRulesFacet('dnd5e.2024', 'class', slug)?.spellRequirements ?? []
}

function requirement(slug: string, pool: string): SpellRequirement | undefined {
  return requirementsFor(slug).find((r) => r.pool === pool)
}

describe('P3.1 corpus-count proof -- cantrips (all 8 classes, 1-20)', () => {
  for (const { name, slug } of CASTERS) {
    it(`${name}'s authored cantrip totalByLevel matches the real corpus array exactly (or is absent, matching no cantripProgression)`, () => {
      const raw = loadRawClass(name)
      const authored = requirement(slug, 'cantrip')
      if (!raw.cantripProgression) {
        expect(authored, `${name} should author no cantrip requirement`).toBeUndefined()
        return
      }
      expect(authored).toBeDefined()
      expect(authored!.totalByLevel).toEqual(raw.cantripProgression)
      expect(authored!.filter).toEqual({ classList: [name], level: 0 })
    })
  }
})

describe('P3.1 corpus-count proof -- ordinary prepared/selected spells (all 8 classes, 1-20)', () => {
  for (const { name, slug } of CASTERS) {
    it(`${name}'s authored spell totalByLevel matches the real corpus's preparedSpellsProgression exactly`, () => {
      const raw = loadRawClass(name)
      expect(raw.preparedSpellsProgression).toHaveLength(20)
      const authored = requirement(slug, 'spell')
      expect(authored).toBeDefined()
      expect(authored!.totalByLevel).toEqual(raw.preparedSpellsProgression)
      expect(authored!.filter).toEqual({ classList: [name] })
    })
  }
})

describe('P3.1 corpus-count proof -- Wizard spellbook (cumulative total, independently recomputed)', () => {
  it('matches 6 at level 1, +2 every level after, computed fresh from the real corpus increment array', () => {
    const raw = loadRawClass('Wizard')
    expect(raw.spellsKnownProgressionFixed).toBeDefined()
    expect(raw.spellsKnownProgressionFixedAllowLowerLevel).toBe(true)

    let running = 0
    const expectedTotal = raw.spellsKnownProgressionFixed!.map((increment) => { running += increment; return running })
    expect(expectedTotal[0]).toBe(6)
    expect(expectedTotal[19]).toBe(44)

    const authored = requirement('wizard-xphb', 'spellbook')
    expect(authored).toBeDefined()
    expect(authored!.totalByLevel).toEqual(expectedTotal)
    expect(authored!.filter).toEqual({ classList: ['Wizard'] })

    // The prepared ('spell') requirement must declare the spellbook as its membership gate.
    const prepared = requirement('wizard-xphb', 'spell')
    expect(prepared!.requiresMembershipPool).toBe(authored!.id)
  })
})

describe('P3.1 corpus-count proof -- Mystic Arcanum (4 independent exact-level tiers)', () => {
  it('matches the real corpus tier levels and acquisition levels exactly: L11/spell6, L13/spell7, L15/spell8, L17/spell9', () => {
    const raw = loadRawClass('Warlock')
    expect(raw.spellsKnownProgressionFixedByLevel).toEqual({ 11: { 6: 1 }, 13: { 7: 1 }, 15: { 8: 1 }, 17: { 9: 1 } })

    const arcanumRequirements = requirementsFor('warlock-xphb').filter((r) => r.pool === 'arcanum')
    expect(arcanumRequirements).toHaveLength(4)

    for (const [acquireLevelStr, bySpellLevel] of Object.entries(raw.spellsKnownProgressionFixedByLevel!)) {
      const acquireLevel = Number(acquireLevelStr)
      const spellLevel = Number(Object.keys(bySpellLevel)[0])
      const expectedTotal = Array.from({ length: 20 }, (_, i) => (i + 1 >= acquireLevel ? 1 : 0))

      const authored = arcanumRequirements.find((r) => r.filter.level === spellLevel)
      expect(authored, `arcanum tier for spell level ${spellLevel}`).toBeDefined()
      expect(authored!.totalByLevel).toEqual(expectedTotal)
      expect(authored!.filter).toEqual({ classList: ['Warlock'], level: spellLevel })
    }
  })
})

describe('P3.1 corpus-count proof -- Paladin/Ranger have no cantrips (real corpus confirms)', () => {
  it('neither class\'s raw record declares a cantripProgression, and neither authors a cantrip requirement', () => {
    for (const name of ['Paladin', 'Ranger']) {
      const raw = loadRawClass(name)
      expect(raw.cantripProgression, name).toBeUndefined()
    }
    expect(requirement('paladin-xphb', 'cantrip')).toBeUndefined()
    expect(requirement('ranger-xphb', 'cantrip')).toBeUndefined()
  })
})
