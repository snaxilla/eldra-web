// Unit tests for app/lib/spell-mechanics/index.ts -- the resolver dispatch
// seam. Mirrors tests/lib/content-actions/dnd5e.test.ts's own dispatcher
// coverage (`resolveContentActions -- the dispatcher seam`) for the
// identical reason: this is the one place a second game system's spell
// resolver would plug in, and the one place "unknown system" behavior is
// pinned down.

import { describe, expect, it } from 'vitest'

import { resolveSpellMechanics } from '../../../app/lib/spell-mechanics'

describe('resolveSpellMechanics -- the dispatcher seam', () => {
  it('dispatches to the dnd5e resolver for systemKey "dnd5e"', () => {
    const mechanics = resolveSpellMechanics('dnd5e', { name: 'Ray of Frost', level: 0 })
    expect(mechanics).not.toBeNull()
    expect(mechanics?.level).toBe(0)
  })

  it('returns null for an unknown system, never throws -- a World bound to a system with no spell-mechanics resolver still loads', () => {
    expect(resolveSpellMechanics('pf2e', { name: 'Ray of Frost', level: 0 })).toBeNull()
  })

  it('returns null for malformed data through the same dispatch path', () => {
    expect(resolveSpellMechanics('dnd5e', 'not an object')).toBeNull()
    expect(resolveSpellMechanics('dnd5e', null)).toBeNull()
  })
})
