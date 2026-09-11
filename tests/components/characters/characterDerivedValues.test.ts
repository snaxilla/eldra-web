// Unit tests for app/components/characters/characterDerivedValues.ts --
// specifically `groupDerivedValues`, the pure helper the desktop IA pass
// added so the sheet can render "Stealth +9 (proficient)" and
// "Dexterity 20 (+5)" as ONE row each, when the Rules Engine emits each
// half as an independent Value.
//
// This is the riskiest new logic in that pass, and it is risky in a
// specific way: it must pair values back together WITHOUT knowing what any
// of them mean, or the sheet stops being game-agnostic (§13.2). Most of the
// tests below therefore use deliberately non-D&D ids, labels, and tags --
// if any of them started passing only for `value:skill.*`, the helper would
// have grown exactly the game knowledge it exists to avoid.

import { describe, expect, it } from 'vitest'
import {
  formatDerivedValue,
  groupDerivedValues,
  type DerivedValue
} from '../../../app/components/characters/characterDerivedValues'

function value(partial: Partial<DerivedValue> & { id: string }): DerivedValue {
  return { category: 'core.skills', ...partial } as DerivedValue
}

describe('groupDerivedValues', () => {
  it('pairs sibling values that share a stem (a bonus and its proficiency flag)', () => {
    const groups = groupDerivedValues([
      value({ id: 'value:skill.stealth.bonus', label: 'Stealth', value: 9, tags: ['skill', 'ability:dex'] }),
      value({ id: 'value:skill.stealth.proficient', label: 'Stealth Proficiency', value: true, tags: ['skill-proficiency', 'ability:dex'] })
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe('value:skill.stealth')
    // The label comes from the number, not the flag: "Stealth", never
    // "Stealth Proficiency".
    expect(groups[0]!.label).toBe('Stealth')
    expect(groups[0]!.numbers[0]!.value).toBe(9)
    expect(groups[0]!.flags[0]!.value).toBe(true)
    expect(groups[0]!.qualifier).toBe('dex')
  })

  it('attaches a value derived from another value to its parent (a score and its modifier)', () => {
    const groups = groupDerivedValues([
      value({ id: 'value:ability.str', label: 'Strength', value: 16, tags: ['ability'] }),
      value({ id: 'value:ability.str.mod', label: 'Strength Modifier', value: 3, tags: ['ability-modifier', 'ability:str'] })
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe('value:ability.str')
    expect(groups[0]!.label).toBe('Strength')
    // `primary` is the parent, and leads `numbers`, so a caller can rely on
    // numbers[0] being the score and numbers[1] being what derives from it.
    expect(groups[0]!.primary?.id).toBe('value:ability.str')
    expect(groups[0]!.numbers.map((entry) => entry.value)).toEqual([16, 3])
  })

  it('groups nothing it has no reason to group', () => {
    const groups = groupDerivedValues([
      value({ id: 'value:proficiency_bonus', label: 'Proficiency Bonus', value: 4, tags: ['proficiency'] }),
      value({ id: 'value:defenses.armor_class', label: 'Armor Class', value: 15, tags: ['defenses'] })
    ])

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.label)).toEqual(['Proficiency Bonus', 'Armor Class'])
  })

  it('pairs a system it has never heard of, by structure alone', () => {
    // No ability, no skill, no D&D anywhere -- a sanity track and a
    // humanity score, paired by exactly the same rules.
    const groups = groupDerivedValues([
      value({ id: 'value:track.sanity.current', label: 'Sanity', value: 62, tags: ['track', 'stat:pow'] }),
      value({ id: 'value:track.sanity.broken', label: 'Sanity Broken', value: false, tags: ['track-flag', 'stat:pow'] }),
      value({ id: 'value:humanity', label: 'Humanity', value: 40, tags: ['humanity'] }),
      value({ id: 'value:humanity.loss', label: 'Humanity Loss', value: 6, tags: ['humanity-loss'] })
    ])

    expect(groups).toHaveLength(2)

    expect(groups[0]!.label).toBe('Sanity')
    expect(groups[0]!.numbers[0]!.value).toBe(62)
    expect(groups[0]!.flags[0]!.value).toBe(false)
    expect(groups[0]!.qualifier).toBe('pow')

    // Parent/child, the ability-score shape, with no ability in sight.
    expect(groups[1]!.label).toBe('Humanity')
    expect(groups[1]!.numbers.map((entry) => entry.value)).toEqual([40, 6])
  })

  it('renders half a pair when only half exists', () => {
    // A package that declares a proficiency flag but no bonus still gets a
    // row -- absence is legal and visible, never a fabricated zero.
    const groups = groupDerivedValues([
      value({ id: 'value:skill.lockpicking.proficient', label: 'Lockpicking', value: true, tags: ['skill-proficiency'] })
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]!.label).toBe('Lockpicking')
    expect(groups[0]!.numbers).toHaveLength(0)
    expect(groups[0]!.flags[0]!.value).toBe(true)
    expect(groups[0]!.qualifier).toBeNull()
  })

  it('surfaces an evaluation error rather than swallowing it', () => {
    const groups = groupDerivedValues([
      value({ id: 'value:skill.stealth.bonus', label: 'Stealth', error: 'divide by zero', tags: ['skill'] }),
      value({ id: 'value:skill.stealth.proficient', label: 'Stealth Proficiency', value: true, tags: ['skill-proficiency'] })
    ])

    expect(groups[0]!.error).toBe('divide by zero')
  })

  it('keeps the order the package declared', () => {
    const groups = groupDerivedValues([
      value({ id: 'value:b.bonus', label: 'Bravery', value: 1 }),
      value({ id: 'value:b.proficient', label: 'Bravery Proficiency', value: false }),
      value({ id: 'value:a.bonus', label: 'Agility', value: 2 }),
      value({ id: 'value:a.proficient', label: 'Agility Proficiency', value: true })
    ])

    // Sorting is the renderer's decision (CharacterSkillList sorts
    // alphabetically); this helper preserves declaration order so a
    // renderer that wants the package's own order can have it.
    expect(groups.map((group) => group.label)).toEqual(['Bravery', 'Agility'])
  })

  it('documents the one case where stem grouping is greedy', () => {
    // Two unrelated NUMBERS sharing a stem, with no parent value and no
    // flag, are merged into one group -- the helper cannot tell them apart
    // from a score/modifier pair, because structurally they are identical.
    // Pinned here deliberately: it is harmless for the three categories
    // routed to the bespoke panels (every real one is a pair), and every
    // other category still renders ungrouped through CharacterDerivedPanel.
    // If a package ever hits this, the fix is to give the parent a Value,
    // not to teach this helper what the ids mean.
    const groups = groupDerivedValues([
      value({ id: 'value:pace.walk', label: 'Walking', value: 30 }),
      value({ id: 'value:pace.swim', label: 'Swimming', value: 15 })
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]!.numbers).toHaveLength(2)
  })
})

describe('formatDerivedValue', () => {
  it('signs a number only when the package tagged it as modifier-like', () => {
    expect(formatDerivedValue(value({ id: 'a', value: 3, tags: ['ability-modifier'] }))).toBe('+3')
    expect(formatDerivedValue(value({ id: 'b', value: 3, tags: ['skill'] }))).toBe('+3')
    expect(formatDerivedValue(value({ id: 'c', value: 3, tags: ['save'] }))).toBe('+3')
    expect(formatDerivedValue(value({ id: 'd', value: 3, tags: ['proficiency'] }))).toBe('+3')
    // An ability SCORE is not modifier-like, and must not gain a plus.
    expect(formatDerivedValue(value({ id: 'e', value: 16, tags: ['ability'] }))).toBe('16')
    expect(formatDerivedValue(value({ id: 'f', value: 15 }))).toBe('15')
  })

  it('leaves a negative modifier alone', () => {
    expect(formatDerivedValue(value({ id: 'a', value: -1, tags: ['ability-modifier'] }))).toBe('-1')
  })

  it('renders absence as an em dash, never as zero', () => {
    expect(formatDerivedValue(value({ id: 'a', value: undefined }))).toBe('—')
    expect(formatDerivedValue(value({ id: 'b', value: null as unknown as undefined }))).toBe('—')
  })

  it('passes a string value through untouched', () => {
    expect(formatDerivedValue(value({ id: 'a', value: 'Darkvision 60 ft.' }))).toBe('Darkvision 60 ft.')
  })
})
