// D&D 2024 Character Rules P2 -- spell option eligibility, end to end through the REAL pipeline:
// the raw XPHB corpus record -> class-list enrichment (5etools-dataset.ts's own
// `enrichSpellClassLists`) -> the real spell-mechanics resolver -> spellOptionVerdict. Nothing
// here is hand-asserted from memory: every level/school/class-list fact is read from the real
// corpus files in this test's own setup, so a corpus change that invalidates an assumption fails
// this test rather than silently passing.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import type { CanonicalSpellMechanics } from '../../../app/lib/spell-mechanics/types'
import { spellOptionVerdict } from '../../../app/lib/spell-mechanics/spell-option-eligibility'
import { classListsFor } from '../../../server/utils/content-sources/dnd5e/5etools-dataset'
import type { SpellCatalogueFilter } from '../../../app/lib/rules/types'

const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'
const XPHB_SPELLS = (JSON.parse(readFileSync(`${DATA_ROOT}/spells/spells-xphb.json`, 'utf8')) as { spell: Record<string, unknown>[] }).spell
  .filter((s) => s.source === 'XPHB')

// The real spell, enriched and resolved through the SAME pipeline Content compilation uses
// (5etools-dataset.ts's enrichSpellClassLists, then the spell-mechanics resolver) -- never a
// hand-built mechanics object.
async function realMechanics(name: string): Promise<CanonicalSpellMechanics> {
  const raw = XPHB_SPELLS.find((s) => s.name === name)
  if (!raw) throw new Error(`fixture spell not found in the real corpus: ${name}`)
  const classLists = await classListsFor('XPHB', name)
  const mechanics = resolveDnd5eSpellMechanics(classLists.length ? { ...raw, classLists } : raw)
  if (!mechanics) throw new Error(`resolver returned null for a real spell: ${name}`)
  return mechanics
}

describe('P2 fixture sanity -- the real corpus facts this file\'s tests depend on', () => {
  it('Magic Missile is a real level-1 Evocation spell on the Wizard list; Cure Wounds is not on the Wizard list', async () => {
    const missile = await realMechanics('Magic Missile')
    const cureWounds = await realMechanics('Cure Wounds')
    expect(missile.level).toBe(1)
    expect(missile.school).toBe('Evocation')
    expect(missile.classLists).toContain('Wizard')
    expect(cureWounds.classLists).not.toContain('Wizard')
  })

  it('Acid Splash is a real cantrip (level 0); Mage Armor is a real level-1 Abjuration spell on the same (Sorcerer/Wizard) list as Magic Missile', async () => {
    const acidSplash = await realMechanics('Acid Splash')
    const mageArmor = await realMechanics('Mage Armor')
    const missile = await realMechanics('Magic Missile')
    expect(acidSplash.level).toBe(0)
    expect(mageArmor.level).toBe(1)
    expect(mageArmor.school).toBe('Abjuration')
    expect(new Set(mageArmor.classLists)).toEqual(new Set(missile.classLists))
  })
})

describe('P2 class-list filter -- real XPHB spells, real corpus membership', () => {
  it('a spell on the Wizard list is accepted for a Wizard-list filter', async () => {
    const missile = await realMechanics('Magic Missile')
    const verdict = spellOptionVerdict({ mechanics: missile, filter: { classList: ['Wizard'] } })
    expect(verdict).toEqual({ eligible: true })
  })

  it('the SAME spell is rejected for a class list it does not verify membership on', async () => {
    const missile = await realMechanics('Magic Missile')
    // Magic Missile's real class list is Sorcerer/Wizard (verified above) -- Cleric is not on it.
    expect(missile.classLists).not.toContain('Cleric')
    const verdict = spellOptionVerdict({ mechanics: missile, filter: { classList: ['Cleric'] } })
    expect(verdict).toEqual({ eligible: false, reason: 'wrong-class-list' })
  })

  it('Cure Wounds (real Cleric-list spell) is rejected for a Wizard-only filter', async () => {
    const cureWounds = await realMechanics('Cure Wounds')
    const verdict = spellOptionVerdict({ mechanics: cureWounds, filter: { classList: ['Wizard'] } })
    expect(verdict).toEqual({ eligible: false, reason: 'wrong-class-list' })
  })

  it('classList is OR within itself: either named class is enough', async () => {
    const cureWounds = await realMechanics('Cure Wounds')
    const verdict = spellOptionVerdict({ mechanics: cureWounds, filter: { classList: ['Wizard', 'Cleric'] } })
    expect(verdict).toEqual({ eligible: true })
  })
})

describe('P2 level filter -- real entries', () => {
  it('a real cantrip is accepted by a level-0 filter', async () => {
    const acidSplash = await realMechanics('Acid Splash')
    expect(spellOptionVerdict({ mechanics: acidSplash, filter: { level: 0 } })).toEqual({ eligible: true })
  })

  it('the SAME cantrip is rejected by a level-1 filter', async () => {
    const acidSplash = await realMechanics('Acid Splash')
    expect(spellOptionVerdict({ mechanics: acidSplash, filter: { level: 1 } })).toEqual({ eligible: false, reason: 'wrong-level' })
  })

  it('a real level-1 spell is accepted by a level-1 filter', async () => {
    const missile = await realMechanics('Magic Missile')
    expect(spellOptionVerdict({ mechanics: missile, filter: { level: 1 } })).toEqual({ eligible: true })
  })

  it('a real level-3 spell is rejected by a level-1 filter', async () => {
    const fireball = await realMechanics('Fireball')
    expect(fireball.level).toBe(3)
    expect(spellOptionVerdict({ mechanics: fireball, filter: { level: 1 } })).toEqual({ eligible: false, reason: 'wrong-level' })
  })
})

describe('P2 school filter -- supported because the metadata is already canonical and the check is free; not required by a current Milestone-A rule (see this phase\'s own report)', () => {
  it('the correct school is accepted, using a real spell', async () => {
    const missile = await realMechanics('Magic Missile')
    expect(spellOptionVerdict({ mechanics: missile, filter: { school: 'Evocation' } })).toEqual({ eligible: true })
  })

  it('the wrong school is rejected, using a real minimal pair (Magic Missile vs. Mage Armor: same class list, same level, different school)', async () => {
    const mageArmor = await realMechanics('Mage Armor')
    expect(spellOptionVerdict({ mechanics: mageArmor, filter: { school: 'Evocation' } })).toEqual({ eligible: false, reason: 'wrong-school' })
  })
})

describe('P2 combined filter -- every declared dimension must hold (AND across dimensions)', () => {
  const filter: SpellCatalogueFilter = { classList: ['Wizard'], level: 1, school: 'Evocation' }

  it('Magic Missile satisfies Wizard list AND level 1 AND Evocation', async () => {
    const missile = await realMechanics('Magic Missile')
    expect(spellOptionVerdict({ mechanics: missile, filter })).toEqual({ eligible: true })
  })

  it('Mage Armor fails the SAME combined filter on school alone (it satisfies class list and level)', async () => {
    const mageArmor = await realMechanics('Mage Armor')
    expect(mageArmor.classLists).toContain('Wizard')
    expect(mageArmor.level).toBe(1)
    expect(spellOptionVerdict({ mechanics: mageArmor, filter })).toEqual({ eligible: false, reason: 'wrong-school' })
  })

  it('Cure Wounds fails the SAME combined filter on class list (checked first)', async () => {
    const cureWounds = await realMechanics('Cure Wounds')
    expect(spellOptionVerdict({ mechanics: cureWounds, filter })).toEqual({ eligible: false, reason: 'wrong-class-list' })
  })
})

describe('P2 fail closed -- no best-effort legality', () => {
  it('no filter at all is refused, never a free pass', async () => {
    const missile = await realMechanics('Magic Missile')
    expect(spellOptionVerdict({ mechanics: missile, filter: null })).toEqual({ eligible: false, reason: 'no-filter' })
    expect(spellOptionVerdict({ mechanics: missile, filter: undefined })).toEqual({ eligible: false, reason: 'no-filter' })
  })

  it('an unrecognized filter field is refused, never silently ignored', async () => {
    const missile = await realMechanics('Magic Missile')
    const verdict = spellOptionVerdict({ mechanics: missile, filter: { level: 1, ritual: true } as unknown as SpellCatalogueFilter })
    expect(verdict).toEqual({ eligible: false, reason: 'unsupported-filter' })
  })

  it('missing mechanics (an unresolvable or non-spell entry) is refused', () => {
    expect(spellOptionVerdict({ mechanics: null, filter: { level: 1 } })).toEqual({ eligible: false, reason: 'no-mechanics' })
    expect(spellOptionVerdict({ mechanics: undefined, filter: { level: 1 } })).toEqual({ eligible: false, reason: 'no-mechanics' })
  })

  // PUBLISHED-OLD-CONTENT / DEPLOYMENT SEQUENCING: this is exactly Solaris's currently-published
  // shape -- its spell entries were compiled before this phase and carry no `classLists` at all
  // (see 5etools-spell-class-lists.test.ts's own "currently-published shape, pre-refresh" case for
  // the compile-side half of this same proof). Until a Content refresh runs, a `classList` filter
  // against ANY already-published spell must fail closed, never silently pass.
  it('a classList filter against a spell with NO normalized class-list membership is refused, never treated as "matches anything"', () => {
    const noClassLists = resolveDnd5eSpellMechanics({ name: 'Homebrew Mystery Spell', source: 'XPHB', level: 1, school: 'V' })!
    expect(noClassLists.classLists).toBeUndefined()
    expect(spellOptionVerdict({ mechanics: noClassLists, filter: { classList: ['Wizard'] } })).toEqual({ eligible: false, reason: 'wrong-class-list' })
  })
})
