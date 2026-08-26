// Unit tests for the D&D 5e Content Action Resolver (app/lib/content-actions/*)
// -- the Character Actions System.
//
// THE FIXTURE IS REAL PUBLISHED CONTENT, NOT INVENTED SHAPES -- the same
// tests/lib/content-presentation/fixtures/5etools-real-rows.json
// content-presentation's own tests use, extended with `items` (Longsword,
// Dagger, Longbow) and `spells` (Fireball, Cure Wounds, Shield) rows copied
// verbatim out of the 5etools dataset. See that fixture's own header for why
// a row there is byte-identical to what a Content Pack stores.
//
// Pure throughout: no Nuxt, no Directus, no filesystem, no HTTP.

import { describe, expect, it } from 'vitest'

import { resolveContentActions } from '../../../app/lib/content-actions'
import { resolveDnd5eActions } from '../../../app/lib/content-actions/dnd5e'
import rows from '../content-presentation/fixtures/5etools-real-rows.json'

const xphb = rows.xphb as any

describe('resolveDnd5eActions -- weapons', () => {
  it('a melee weapon with no range property gets a 5 ft. reach', () => {
    const [action] = resolveDnd5eActions('item', xphb.items.Longsword)
    expect(action).toMatchObject({
      name: 'Longsword', category: 'weapon', actionType: 'Melee Attack', range: '5 ft.'
    })
    expect(action.damage).toContain('1d8 slashing')
  })

  it('surfaces the versatile two-handed damage alongside the one-handed expression', () => {
    const [action] = resolveDnd5eActions('item', xphb.items.Longsword)
    expect(action.damage).toContain('1d10 versatile')
  })

  it('a thrown weapon carries its own printed range, not a flat 5 ft.', () => {
    const [action] = resolveDnd5eActions('item', xphb.items.Dagger)
    expect(action).toMatchObject({
      name: 'Dagger', category: 'weapon', actionType: 'Melee or Thrown Attack', range: '20/60 ft.', damage: '1d4 piercing'
    })
  })

  it('a ranged weapon is a Ranged Attack with its printed range', () => {
    const [action] = resolveDnd5eActions('item', xphb.items.Longbow)
    expect(action).toMatchObject({
      name: 'Longbow', category: 'weapon', actionType: 'Ranged Attack', range: '150/600 ft.', damage: '1d8 piercing'
    })
  })

  it('produces no action for a non-weapon item', () => {
    expect(resolveDnd5eActions('item', { name: 'Rope', source: 'XPHB' })).toEqual([])
  })

  it('computes no attack bonus, save DC, or rolled number -- presentation only', () => {
    const [action]: any = resolveDnd5eActions('item', xphb.items.Longsword)
    for (const forbidden of ['attackBonus', 'attack_bonus', 'saveDc', 'toHit']) {
      expect(action[forbidden]).toBeUndefined()
    }
  })
})

describe('resolveDnd5eActions -- spells', () => {
  it('a cantrip is labelled by school, with its printed range and casting time', () => {
    // Mage Hand is not in the fixture, but Cure Wounds/Fireball/Shield are
    // all leveled -- level 0 behavior is exercised by a synthetic literal
    // rather than adding a fourth real spell fixture solely for the label.
    const [action] = resolveDnd5eActions('spell', { ...xphb.spells['Cure Wounds'], level: 0 })
    expect(action.actionType).toBe('Cantrip (Abjuration)')
  })

  it('Fireball: level, school, range, casting time, and full description text', () => {
    const [action] = resolveDnd5eActions('spell', xphb.spells.Fireball)
    expect(action).toMatchObject({
      name: 'Fireball', category: 'spell', actionType: 'Level 3 Spell (Evocation)', range: '150 ft.', usage: 'Action'
    })
    expect(action.description).toContain('fiery explosion')
    expect(action.description).toContain('8d6')
  })

  it('Cure Wounds: a touch-range spell reads "Touch", not a distance', () => {
    const [action] = resolveDnd5eActions('spell', xphb.spells['Cure Wounds'])
    expect(action.range).toBe('Touch')
  })

  it('Shield: a self-range Reaction spell carries its trigger condition', () => {
    const [action] = resolveDnd5eActions('spell', xphb.spells.Shield)
    expect(action.range).toBe('Self')
    expect(action.usage).toContain('Reaction')
    expect(action.usage).toContain('hit by an attack roll')
  })

  it('never fabricates a damage expression -- absent even for a damaging spell', () => {
    const [action] = resolveDnd5eActions('spell', xphb.spells.Fireball)
    expect(action.damage).toBeUndefined()
  })
})

describe('resolveDnd5eActions -- species', () => {
  it('surfaces every named trait uniformly, including passive ones, with full description text', () => {
    const actions = resolveDnd5eActions('species', xphb.species.Dragonborn)
    const names = actions.map((action) => action.name)

    expect(names).toContain('Breath Weapon')
    expect(names).toContain('Darkvision')

    const breathWeapon = actions.find((action) => action.name === 'Breath Weapon')!
    expect(breathWeapon.actionType).toBe('Feature')
    expect(breathWeapon.description).toContain('Dexterity saving throw')
  })

  it('produces no actions for a species with no traits', () => {
    expect(resolveDnd5eActions('species', { name: 'Nothing', source: 'XPHB' })).toEqual([])
  })
})

describe('resolveDnd5eActions -- class', () => {
  it('surfaces class feature names with their granted level, not their rules text', () => {
    const actions = resolveDnd5eActions('class', xphb.classes.Fighter)
    expect(actions.length).toBeGreaterThan(0)

    for (const action of actions) {
      expect(action.category).toBe('class')
      expect(action.actionType).toBe('Feature')
      expect(action.usage).toMatch(/^Class Feature/)
    }
  })

  it('never duplicates a (name, level) pair', () => {
    const actions = resolveDnd5eActions('class', xphb.classes.Fighter)
    const keys = actions.map((action) => `${action.usage}:${action.name}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('resolveDnd5eActions -- background', () => {
  it('surfaces the granted Origin Feat by name', () => {
    const actions = resolveDnd5eActions('background', xphb.backgrounds.Acolyte)
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({ category: 'background', actionType: 'Feature', usage: 'Granted by Background' })
    expect(actions[0].name).toBeTruthy()
  })
})

describe('resolveContentActions -- the dispatcher seam', () => {
  it('routes dnd5e to the real resolver', () => {
    const actions = resolveContentActions('dnd5e', 'item', xphb.items.Longsword)
    expect(actions).toHaveLength(1)
  })

  it('returns [] rather than throwing for an unknown system', () => {
    expect(resolveContentActions('pf2e', 'item', xphb.items.Longsword)).toEqual([])
  })

  it('returns [] for unusable data rather than throwing', () => {
    expect(resolveContentActions('dnd5e', 'item', null)).toEqual([])
    expect(resolveContentActions('dnd5e', 'item', 'not an object')).toEqual([])
  })
})
