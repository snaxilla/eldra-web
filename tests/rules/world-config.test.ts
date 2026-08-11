// Unit tests for World Configuration lookup (app/lib/rules/world-config.ts).
// These assert on the public API (parseWorldTraitPath, lookupWorldTrait)
// only. Per this commit's scope, world config LOADING, RESOLUTION
// (defaults, Binding Gaps, roll-type composition), and world-vs-package
// declaration validation are not exercised here -- none of them exists yet.

import { describe, expect, it } from 'vitest'
import { lookupWorldTrait, parseWorldTraitPath } from '../../app/lib/rules/world-config'
import type { WorldConfigSnapshot } from '../../app/lib/rules/types'

function snapshot(traits: WorldConfigSnapshot['traits'] = {}): WorldConfigSnapshot {
  return {
    worldId: 'world:1',
    packageId: 'eldra.test.pkg',
    packageVersion: '1.0.0',
    worldConfigVersion: 1,
    traits
  }
}

describe('parseWorldTraitPath -- two-segment arity (world-configuration.md §F.2)', () => {
  it('splits a two-segment path into kind and key', () => {
    expect(parseWorldTraitPath('rules.flanking')).toEqual({ kind: 'rules', key: 'flanking' })
  })

  it('accepts a non-reserved kind, since kinds are world vocabulary not engine vocabulary', () => {
    expect(parseWorldTraitPath('calendar.currentSeason')).toEqual({ kind: 'calendar', key: 'currentSeason' })
  })

  it("accepts the architecture's own §19.2 example", () => {
    expect(parseWorldTraitPath('roadType.quality')).toEqual({ kind: 'roadType', key: 'quality' })
  })

  it('rejects a one-segment path -- it carries no kind, so it names no slot', () => {
    expect(parseWorldTraitPath('restVariant')).toBeUndefined()
  })

  it('rejects a three-segment path -- the data model has no such nesting depth', () => {
    expect(parseWorldTraitPath('a.b.c')).toBeUndefined()
  })

  it('rejects a bare @world reference (no path at all)', () => {
    expect(parseWorldTraitPath(undefined)).toBeUndefined()
  })

  it('rejects an empty path', () => {
    expect(parseWorldTraitPath('')).toBeUndefined()
  })

  it('rejects two segments where the kind is empty', () => {
    expect(parseWorldTraitPath('.flanking')).toBeUndefined()
  })

  it('rejects two segments where the key is empty', () => {
    expect(parseWorldTraitPath('rules.')).toBeUndefined()
  })

  it('never throws on malformed input', () => {
    expect(() => parseWorldTraitPath('....')).not.toThrow()
    expect(parseWorldTraitPath('....')).toBeUndefined()
  })
})

describe('lookupWorldTrait -- existing traits', () => {
  it('returns a boolean trait', () => {
    const config = snapshot({ rules: { flanking: true } })
    expect(lookupWorldTrait(config, 'rules', 'flanking')).toBe(true)
  })

  it('returns a number trait', () => {
    const config = snapshot({ roadType: { quality: 4 } })
    expect(lookupWorldTrait(config, 'roadType', 'quality')).toBe(4)
  })

  it('returns a text trait', () => {
    const config = snapshot({ calendar: { currentSeason: 'winter' } })
    expect(lookupWorldTrait(config, 'calendar', 'currentSeason')).toBe('winter')
  })

  it('returns a falsy scalar rather than treating it as absent', () => {
    const config = snapshot({ rules: { flanking: false, bonus: 0, label: '' } })
    expect(lookupWorldTrait(config, 'rules', 'flanking')).toBe(false)
    expect(lookupWorldTrait(config, 'rules', 'bonus')).toBe(0)
    expect(lookupWorldTrait(config, 'rules', 'label')).toBe('')
  })

  it('keeps kinds independent -- the same key under two kinds resolves separately', () => {
    const config = snapshot({ rules: { quality: 1 }, roadType: { quality: 4 } })
    expect(lookupWorldTrait(config, 'rules', 'quality')).toBe(1)
    expect(lookupWorldTrait(config, 'roadType', 'quality')).toBe(4)
  })
})

describe('lookupWorldTrait -- missing traits', () => {
  it('returns undefined when the kind is absent', () => {
    const config = snapshot({ rules: { flanking: true } })
    expect(lookupWorldTrait(config, 'calendar', 'currentSeason')).toBeUndefined()
  })

  it('returns undefined when the kind exists but the key does not', () => {
    const config = snapshot({ rules: { flanking: true } })
    expect(lookupWorldTrait(config, 'rules', 'grittyRest')).toBeUndefined()
  })

  it('returns undefined for an entirely empty snapshot', () => {
    expect(lookupWorldTrait(snapshot(), 'rules', 'flanking')).toBeUndefined()
  })

  it('never invents a default, a zero, or a false for an absent trait', () => {
    const result = lookupWorldTrait(snapshot({ rules: {} }), 'rules', 'flanking')
    expect(result).toBeUndefined()
    expect(result).not.toBe(false)
    expect(result).not.toBe(0)
  })

  it('does not throw for any missing lookup', () => {
    expect(() => lookupWorldTrait(snapshot(), 'nope', 'nope')).not.toThrow()
  })
})

describe('lookupWorldTrait -- prototype-chain safety', () => {
  // `traits` and its inner records are keyed by author-supplied strings, so
  // a reference like `@world:constructor.x` must not resolve up the
  // prototype chain and hand back a Function.
  it('does not resolve an inherited Object.prototype member as a kind', () => {
    expect(lookupWorldTrait(snapshot(), 'constructor', 'name')).toBeUndefined()
    expect(lookupWorldTrait(snapshot(), 'toString', 'x')).toBeUndefined()
  })

  it('does not resolve an inherited Object.prototype member as a key', () => {
    const config = snapshot({ rules: { flanking: true } })
    expect(lookupWorldTrait(config, 'rules', 'toString')).toBeUndefined()
    expect(lookupWorldTrait(config, 'rules', 'hasOwnProperty')).toBeUndefined()
  })
})
