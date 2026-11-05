// PHASE 2C.2B -- the generic creation content-choice mechanics, in isolation. The
// Fighter is only one consumer: every rule here is driven by a declaration the
// caller supplies, never by a class, choice id, or feat name.

import { describe, expect, it } from 'vitest'
import {
  declaredCreationContentChoices,
  resolveCreationContentChoices,
  type CreationFeatEntry
} from '../../../app/lib/characters/creation-content-choices'
import { resolveCreationChoices, type CreationSlotInput } from '../../../app/lib/characters/creation-choice-eligibility'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { serializeContentRef } from '../../../app/lib/characters/progression-plan'
import { resolveDnd5eFeatMechanics } from '../../../app/lib/feat-mechanics/dnd5e'
import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import { resolveDnd5eItemMechanics } from '../../../app/lib/item-mechanics/dnd5e'
import { weaponValueId } from '../../../app/lib/content-rules/proficiency-vocabulary'
import type { CreationSpellEntry, CreationItemEntry } from '../../../app/lib/characters/creation-content-choices'

const PKG = 'eldra.solaris.xphb'
const FS_SELECTOR = { category: 'feats', filter: { category: 'fighting-style', variants: ['FS'] } }
const SKILL_CHOICE = 'choice:skill.proficiency'
const CONTENT_CHOICE = 'choice:feat.fighting-style.fs-only'

// A minimal feat shaped like the corpus (the resolver reads these fields).
function feat(name: string, raw: Record<string, unknown>, rulesFacet?: CreationFeatEntry['rulesFacet']): CreationFeatEntry {
  return {
    packageId: PKG,
    slug: `${name.toLowerCase().replace(/ /g, '-')}-xphb`,
    title: name,
    featMechanics: resolveDnd5eFeatMechanics({ name, source: 'XPHB', ...raw }),
    rulesFacet
  }
}

const ARCHERY = feat('Archery', { category: 'FS', prerequisite: [{ feature: ['Fighting Style'] }] },
  { featureRequirements: [{ feature: 'Fighting Style', requires: 'value:feature.fighting-style' }] })
const DEFENSE = feat('Defense', { category: 'FS', prerequisite: [{ feature: ['Fighting Style'] }] },
  { featureRequirements: [{ feature: 'Fighting Style', requires: 'value:feature.fighting-style' }] })
const BLESSED = feat('Blessed Warrior', { category: 'FS:P', prerequisite: [{ otherSummary: { entry: 'x' } }] })
const ATHLETE = feat('Athlete', { category: 'G', prerequisite: [{ level: 4 }] })
const SPELLFIRE = feat('Spellfire Probe', { category: 'FS', prerequisite: [{ feature: ['Spellcasting'] }] },
  // A mapping for a DIFFERENT raw name must never cover this one.
  { featureRequirements: [{ feature: 'Fighting Style', requires: 'value:feature.fighting-style' }] })
const FEATS = [ARCHERY, DEFENSE, BLESSED, ATHLETE, SPELLFIRE]

const granting = (value: string) => ({ grants: [{ set: value, to: true }] })

describe('declaration -- recognized by the package\'s own selector, never by id or shape', () => {
  it('a content-backed choice is declared; a Definition-backed choice is not', () => {
    const slots = [
      { slot: 'class', facet: { choices: [{ choiceSet: CONTENT_CHOICE, count: 1 }, { choiceSet: SKILL_CHOICE, count: 2 }] } }
    ] as (CreationSlotInput & { slot: string })[]
    const declared = declaredCreationContentChoices(slots, (id) => (id === CONTENT_CHOICE ? FS_SELECTOR : null))
    expect(declared.map((d) => d.choiceSetId)).toEqual([CONTENT_CHOICE])
  })

  it('the declared key is the progression key convention, at creation level 1', () => {
    const slots = [{ slot: 'class', facet: { choices: [{ choiceSet: CONTENT_CHOICE, count: 1 }] } }] as (CreationSlotInput & { slot: string })[]
    const [declared] = declaredCreationContentChoices(slots, () => FS_SELECTOR)
    expect(declared!.key).toBe(progressionChoiceKey('class', 1, CONTENT_CHOICE))
    expect(declared!.key).toBe('class:progression:1:choice:feat.fighting-style.fs-only')
  })
})

describe('Definition choices -- unchanged by the content guard', () => {
  it('resolveCreationChoices with the content predicate skips content sets and keeps Definition sets exactly as before', () => {
    const slots: CreationSlotInput[] = [
      { slot: 'class', facet: { choices: [{ choiceSet: CONTENT_CHOICE, count: 1 }, { choiceSet: SKILL_CHOICE, count: 1, from: ['value:skill.arcana.proficient'] }] } }
    ]
    const withGuard = resolveCreationChoices(slots, {}, (id) => id === CONTENT_CHOICE).map((p) => p.choiceSetId)
    const withoutGuard = resolveCreationChoices(slots, {}).map((p) => p.choiceSetId)
    expect(withGuard).toEqual([SKILL_CHOICE])
    expect(withoutGuard).toEqual([CONTENT_CHOICE, SKILL_CHOICE])
  })
})

describe('authority -- the content presentation uses the shared feat verdict', () => {
  const slotsWithFeature = [{ slot: 'class', facet: { ...granting('value:feature.fighting-style'), choices: [{ choiceSet: CONTENT_CHOICE, count: 1 }] } }] as (CreationSlotInput & { slot: string })[]
  const declared = declaredCreationContentChoices(slotsWithFeature, () => FS_SELECTOR)

  it('the feature Value granted by the creation state makes the ordinary FS feat eligible', () => {
    const [presentation] = resolveCreationContentChoices(declared, slotsWithFeature, {}, FEATS)
    const archery = presentation!.offered.find((o) => o.slug === 'archery-xphb')
    expect(archery).toMatchObject({ eligible: true })
  })

  it('WITHOUT the feature grant the same FS feat is refused (prerequisite-unmet): nothing bypasses the package fact', () => {
    const noGrant = [{ slot: 'class', facet: { choices: [{ choiceSet: CONTENT_CHOICE, count: 1 }] } }] as (CreationSlotInput & { slot: string })[]
    const [presentation] = resolveCreationContentChoices(declared, noGrant, { [progressionChoiceKey('class', 1, CONTENT_CHOICE)]: [serializeContentRef({ packageId: PKG, slug: 'archery-xphb' })] }, FEATS)
    expect(presentation!.offered.find((o) => o.slug === 'archery-xphb')).toMatchObject({ eligible: false, reason: 'prerequisite-unmet' })
    expect(presentation!.selected).toEqual([])
    expect(presentation!.valid).toBe(false)
  })

  it('an unmapped raw feature (Spellcasting) stays unsupported even when another raw name is mapped', () => {
    const [presentation] = resolveCreationContentChoices(declared, slotsWithFeature, {}, FEATS)
    // SPELLFIRE is FS-category, so it is offered -- and refused by its unmapped feature.
    expect(presentation!.offered.find((o) => o.slug === 'spellfire-probe-xphb')).toMatchObject({ eligible: false, reason: 'prerequisite-unsupported' })
  })

  it('a wrong-category, wrong-variant, or General feat is never offered at all', () => {
    const [presentation] = resolveCreationContentChoices(declared, slotsWithFeature, {}, FEATS)
    const offered = presentation!.offered.map((o) => o.slug)
    expect(offered).not.toContain('blessed-warrior-xphb')
    expect(offered).not.toContain('athlete-xphb')
  })

  it('an unknown destination category is never valid (fail closed), even with a selection', () => {
    const unknown = [{ key: 'k', slot: 'class', choiceSetId: 'choice:x', count: 1, selector: { category: 'mystery' } }]
    const [presentation] = resolveCreationContentChoices(unknown, slotsWithFeature, { k: ['x'] }, FEATS)
    expect(presentation).toMatchObject({ category: 'mystery', offered: [], selected: [], valid: false })
  })
})

// D&D 2024 Character Rules P2 -- the SAME generic mechanism, routed to 'spells' instead of
// 'feats'. Synthetic spell fixtures here, exactly like ARCHERY/DEFENSE above are synthetic feat
// fixtures: this describe block proves the GENERIC routing/ownership mechanism, not real-corpus
// class-list membership (that is spell-option-eligibility.test.ts's own job, with real spells).
const SPELL_CHOICE = 'choice:spell.selection.test'
const WIZARD_L1_SELECTOR = { category: 'spells', filter: { classList: ['Wizard'], level: 1 } }

function spell(name: string, raw: Record<string, unknown>): CreationSpellEntry {
  return {
    packageId: PKG,
    slug: `${name.toLowerCase().replace(/ /g, '-')}-xphb`,
    title: name,
    spellMechanics: resolveDnd5eSpellMechanics({ name, source: 'XPHB', level: 1, school: 'V', ...raw })
  }
}

const MAGIC_MISSILE = spell('Magic Missile', { classLists: ['Sorcerer', 'Wizard'] })
const CURE_WOUNDS = spell('Cure Wounds', { classLists: ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger'] })
const SPELLS = [MAGIC_MISSILE, CURE_WOUNDS]

describe('authority -- spells category (P2), using the shared spell verdict', () => {
  const slots = [{ slot: 'class', facet: { choices: [{ choiceSet: SPELL_CHOICE, count: 1 }] } }] as (CreationSlotInput & { slot: string })[]
  const declared = declaredCreationContentChoices(slots, () => WIZARD_L1_SELECTOR)

  it('a spell on the declared class list, at the declared level, is offered and eligible', () => {
    const [presentation] = resolveCreationContentChoices(declared, slots, {}, [], SPELLS)
    expect(presentation!.offered.find((o) => o.slug === 'magic-missile-xphb')).toMatchObject({ eligible: true })
  })

  it('a spell NOT on the declared class list is offered but refused (wrong-class-list), never silently omitted', () => {
    const [presentation] = resolveCreationContentChoices(declared, slots, {}, [], SPELLS)
    expect(presentation!.offered.find((o) => o.slug === 'cure-wounds-xphb')).toMatchObject({ eligible: false, reason: 'wrong-class-list' })
  })

  it('a crafted selection of the ineligible spell is rejected, never trusted from the client', () => {
    const [presentation] = resolveCreationContentChoices(
      declared, slots,
      { [declared[0]!.key]: [serializeContentRef({ packageId: PKG, slug: 'cure-wounds-xphb' })] },
      [], SPELLS
    )
    expect(presentation!.selected).toEqual([])
    expect(presentation!.valid).toBe(false)
  })

  it('two spell choices cannot both take the same spell: the later one is refused as already owned', () => {
    const twoSlots = [
      { slot: 'class', facet: { choices: [{ choiceSet: SPELL_CHOICE, count: 1 }] } },
      { slot: 'background', facet: { choices: [{ choiceSet: 'choice:spell.other', count: 1 }] } }
    ] as (CreationSlotInput & { slot: string })[]
    const twoDeclared = declaredCreationContentChoices(twoSlots, () => WIZARD_L1_SELECTOR)
    const missileRef = serializeContentRef({ packageId: PKG, slug: 'magic-missile-xphb' })
    const presentations = resolveCreationContentChoices(twoDeclared, twoSlots, {
      [twoDeclared[0]!.key]: [missileRef],
      [twoDeclared[1]!.key]: [missileRef]
    }, [], SPELLS)
    expect(presentations[0]!.selected).toEqual([missileRef])
    expect(presentations[1]!.selected).toEqual([])
    expect(presentations[1]!.offered.find((o) => o.slug === 'magic-missile-xphb')).toMatchObject({ eligible: false, reason: 'already-owned' })
  })

  it('feats and spells coexist as distinct destinations, with no cross-contamination', () => {
    const mixedSlots = [{
      slot: 'class',
      facet: { ...granting('value:feature.fighting-style'), choices: [{ choiceSet: CONTENT_CHOICE, count: 1 }, { choiceSet: SPELL_CHOICE, count: 1 }] }
    }] as (CreationSlotInput & { slot: string })[]
    const mixedDeclared = declaredCreationContentChoices(
      mixedSlots,
      (id) => (id === CONTENT_CHOICE ? FS_SELECTOR : id === SPELL_CHOICE ? WIZARD_L1_SELECTOR : null)
    )
    const presentations = resolveCreationContentChoices(mixedDeclared, mixedSlots, {}, FEATS, SPELLS)
    expect(presentations.find((p) => p.choiceSetId === CONTENT_CHOICE)!.offered.map((o) => o.slug)).toContain('archery-xphb')
    expect(presentations.find((p) => p.choiceSetId === SPELL_CHOICE)!.offered.map((o) => o.slug)).toContain('magic-missile-xphb')
  })
})

describe('ownership and multiple creation acquisitions', () => {
  it('two declarations cannot both take the same ref: the later one is refused as already owned', () => {
    const slots = [
      { slot: 'class', facet: { ...granting('value:feature.fighting-style'), choices: [{ choiceSet: CONTENT_CHOICE, count: 1 }] } },
      { slot: 'background', facet: { choices: [{ choiceSet: 'choice:feat.other-fs', count: 1 }] } }
    ] as (CreationSlotInput & { slot: string })[]
    const declared = declaredCreationContentChoices(slots, () => FS_SELECTOR)
    const archery = serializeContentRef({ packageId: PKG, slug: 'archery-xphb' })
    const presentations = resolveCreationContentChoices(declared, slots, {
      [declared[0]!.key]: [archery],
      [declared[1]!.key]: [archery]
    }, FEATS)
    expect(presentations[0]!.selected).toEqual([archery])
    expect(presentations[1]!.selected).toEqual([])
    expect(presentations[1]!.offered.find((o) => o.slug === 'archery-xphb')).toMatchObject({ eligible: false, reason: 'already-owned' })
  })

  it('two DISTINCT acquisitions get distinct stable keys (no collision for the future Origin path)', () => {
    const classKey = progressionChoiceKey('class', 1, CONTENT_CHOICE)
    const backgroundKey = progressionChoiceKey('background', 1, 'choice:feat.origin-future')
    expect(classKey).not.toBe(backgroundKey)
    expect(new Set([classKey, backgroundKey]).size).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Weapon Mastery ('items' category) -- Character Purgatory follow-up. The
// real reported bug: the offered list included general equipment
// (Alchemist's Supplies, Arrows, Bagpipes, Breastplate) alongside actual
// weapons. A minimal item shaped like the real corpus (the resolver reads
// these exact fields; see app/lib/item-mechanics/dnd5e.ts's own header) --
// a non-weapon simply omits `weaponCategory` entirely, which is the
// STRUCTURAL signal (never a display-name check) resolveDnd5eItemMechanics
// uses to resolve `null`.
// ---------------------------------------------------------------------------

function item(name: string, slug: string, raw: Record<string, unknown> | null): CreationItemEntry {
  return {
    packageId: PKG,
    slug,
    title: name,
    itemMechanics: raw ? resolveDnd5eItemMechanics(raw) : null
  }
}

// Real weapons -- shaped exactly like items-base.json's own fields.
const LONGSWORD = item('Longsword', 'longsword-xphb', {
  weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Sap|XPHB']
})
const SHORTBOW = item('Shortbow', 'shortbow-xphb', {
  weaponCategory: 'simple', type: 'R|XPHB', property: ['A|XPHB', '2H|XPHB'], mastery: ['Vex|XPHB']
})

// Exactly the non-weapon equipment visible in Sam's screenshot -- none of
// these carry a `weaponCategory` field at all in the real corpus, so each
// resolves to `itemMechanics: null`.
const ALCHEMISTS_SUPPLIES = item('Alchemist\'s Supplies', 'alchemists-supplies-xphb', { type: 'AT|XPHB' })
const ARROWS = item('Arrows (20)', 'arrows-xphb', { type: 'AMMO|XPHB' })
const BAGPIPES = item('Bagpipes', 'bagpipes-xphb', { type: 'INS|XPHB' })
const BREASTPLATE = item('Breastplate', 'breastplate-xphb', { type: 'MA|XPHB', ac: 14 })
// Also covers an item whose raw `data` is missing/malformed entirely --
// the same "absent means not even a candidate" posture as a non-weapon.
const MYSTERY_TRADE_GOOD = item('Mystery Trade Good', 'mystery-trade-good', null)

const WEAPONS = [LONGSWORD, SHORTBOW]
const NON_WEAPONS = [ALCHEMISTS_SUPPLIES, ARROWS, BAGPIPES, BREASTPLATE, MYSTERY_TRADE_GOOD]
const ALL_CATALOGUE_ITEMS = [...WEAPONS, ...NON_WEAPONS]

const WEAPON_MASTERY_CHOICE = 'choice:item.weapon-mastery'
const WEAPON_MASTERY_SELECTOR = { category: 'items', filter: { itemKind: 'weapon' } }

function weaponMasterySlots(proficiencyGroup: string) {
  return [{
    slot: 'class',
    facet: { grants: [{ set: weaponValueId(proficiencyGroup), to: true }], choices: [{ choiceSet: WEAPON_MASTERY_CHOICE, count: 1 }] }
  }] as (CreationSlotInput & { slot: string })[]
}

describe('Weapon Mastery -- only actual weapons are offered', () => {
  it('excludes every non-weapon from the offered list, even though all six came from the same equipment catalogue', () => {
    const slots = weaponMasterySlots('martial')
    const declared = declaredCreationContentChoices(slots, () => WEAPON_MASTERY_SELECTOR)
    const [presentation] = resolveCreationContentChoices(declared, slots, {}, [], [], ALL_CATALOGUE_ITEMS)

    const offeredSlugs = presentation!.offered.map((o) => o.slug)
    for (const nonWeapon of NON_WEAPONS) {
      expect(offeredSlugs).not.toContain(nonWeapon.slug)
    }
  })

  it('includes actual weapons the character is proficient with', () => {
    const slots = weaponMasterySlots('martial')
    const declared = declaredCreationContentChoices(slots, () => WEAPON_MASTERY_SELECTOR)
    const [presentation] = resolveCreationContentChoices(declared, slots, {}, [], [], ALL_CATALOGUE_ITEMS)

    expect(presentation!.offered.map((o) => o.slug)).toContain('longsword-xphb')
    expect(presentation!.offered.find((o) => o.slug === 'longsword-xphb')).toMatchObject({ eligible: true })
  })

  it('a weapon the character is NOT proficient with is still offered (visible, disabled) -- only non-weapons are dropped from the list entirely', () => {
    // Proficient with simple weapons only, so the martial Longsword stays
    // ineligible -- but SHOULD still appear, disabled, the same contract
    // feats/spells already have. Non-weapons are different: they can
    // NEVER become eligible, which is why they alone are excluded.
    const slots = weaponMasterySlots('simple')
    const declared = declaredCreationContentChoices(slots, () => WEAPON_MASTERY_SELECTOR)
    const [presentation] = resolveCreationContentChoices(declared, slots, {}, [], [], ALL_CATALOGUE_ITEMS)

    expect(presentation!.offered.find((o) => o.slug === 'longsword-xphb')).toMatchObject({ eligible: false, reason: 'not-proficient' })
    expect(presentation!.offered.find((o) => o.slug === 'shortbow-xphb')).toMatchObject({ eligible: true })
  })

  it('an item with no resolvable mechanics at all (malformed/absent data) is excluded exactly like an ordinary non-weapon', () => {
    const slots = weaponMasterySlots('martial')
    const declared = declaredCreationContentChoices(slots, () => WEAPON_MASTERY_SELECTOR)
    const [presentation] = resolveCreationContentChoices(declared, slots, {}, [], [], ALL_CATALOGUE_ITEMS)

    expect(presentation!.offered.map((o) => o.slug)).not.toContain('mystery-trade-good')
  })

  it('a selected weapon can still be picked and round-trips through `selected`', () => {
    const slots = weaponMasterySlots('martial')
    const declared = declaredCreationContentChoices(slots, () => WEAPON_MASTERY_SELECTOR)
    const longswordRef = serializeContentRef({ packageId: PKG, slug: 'longsword-xphb' })

    const [presentation] = resolveCreationContentChoices(
      declared, slots, { [declared[0]!.key]: [longswordRef] }, [], [], ALL_CATALOGUE_ITEMS
    )

    expect(presentation!.selected).toEqual([longswordRef])
    expect(presentation!.valid).toBe(true)
  })
})
