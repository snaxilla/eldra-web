// Unit tests for app/lib/content-actions/attack-capability.ts -- the one
// gate both CharacterActionsPanel.vue (client) and
// server/utils/character-actions.ts's `resolveAttackAction` (server) use to
// decide "is this a weapon/unarmed attack Character Sheet Body Phase 1A can
// roll." Pure, zero-I/O.

import { describe, expect, it } from 'vitest'

import { isAttackCapableAction } from '../../../app/lib/content-actions/attack-capability'

describe('isAttackCapableAction', () => {
  it('is true for a melee weapon attack-roll action', () => {
    expect(
      isAttackCapableAction({ category: 'weapon', resolution: { kind: 'attack-roll', attackKind: 'melee' } })
    ).toBe(true)
  })

  it('is true for a ranged weapon attack-roll action', () => {
    expect(
      isAttackCapableAction({ category: 'weapon', resolution: { kind: 'attack-roll', attackKind: 'ranged' } })
    ).toBe(true)
  })

  it('is true for Unarmed Strike', () => {
    expect(
      isAttackCapableAction({ category: 'unarmed', resolution: { kind: 'attack-roll', attackKind: 'melee' } })
    ).toBe(true)
  })

  it('is false for a spell attack roll, even though it is category-agnostic in mechanism', () => {
    expect(
      isAttackCapableAction({ category: 'spell', resolution: { kind: 'attack-roll', attackKind: 'spell' } })
    ).toBe(false)
  })

  it('is false for a saving-throw spell', () => {
    expect(
      isAttackCapableAction({ category: 'spell', resolution: { kind: 'saving-throw', savingAbility: 'dex' } })
    ).toBe(false)
  })

  it('is false for a weapon/unarmed action carrying no resolution at all', () => {
    expect(isAttackCapableAction({ category: 'weapon' })).toBe(false)
    expect(isAttackCapableAction({ category: 'unarmed' })).toBe(false)
  })

  it('is false for a non-attack, non-spell category (species/class/background)', () => {
    expect(
      isAttackCapableAction({ category: 'species', resolution: { kind: 'attack-roll', attackKind: 'melee' } })
    ).toBe(false)
  })
})
