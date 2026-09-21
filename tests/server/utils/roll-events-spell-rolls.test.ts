// Unit tests for server/utils/roll-events.ts's `createSpellAttackRollEvent`/
// `createSpellDamageRollEvent` -- Character Sheet Body Phase 1B.2
// (Authoritative Cast Foundation).
//
// Same mocking shape as roll-events-action-rolls.test.ts (its own header
// explains why, and these two functions sit right beside those two in the
// same file): `assembleCharacter`/`getWorldRuntime` mocked at the module
// boundary, the Rules Runtime REAL (built via createWorldRuntime from the
// actual eldra-dnd5e-2024 package on disk). Unlike the weapon/unarmed pair,
// these two do NOT resolve an actionId themselves -- they take an
// already-derived attack bonus / damage dice as plain input (see
// roll-events.ts's own header on why) -- so there is no character/action
// resolution to exercise here; these tests cover the roll+persist+
// conditional-broadcast mechanics only. `server/utils/character-cast.test.ts`
// covers the resolution-and-orchestration layer that calls these.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock, broadcastRollEventMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  broadcastRollEventMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

vi.mock('../../../server/utils/roll-realtime-bridge', () => ({
  broadcastRollEvent: broadcastRollEventMock
}))

import { createSpellAttackRollEvent, createSpellDamageRollEvent } from '../../../server/utils/roll-events'

function jsonResponse(data: unknown) {
  return { data }
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  broadcastRollEventMock.mockReset()
  directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => jsonResponse({ id: 'roll-1', ...options?.body }))
})

describe('createSpellAttackRollEvent', () => {
  it('rolls 1d20 against the caller-supplied attack bonus, never re-deriving or re-resolving anything', async () => {
    const roll = await createSpellAttackRollEvent({
      worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42',
      spellName: 'Fire Bolt', sourceId: 'spell:spell-1', attackBonus: 6,
      visibility: 'private', broadcast: true
    })

    expect(roll.sourceType).toBe('spell_attack')
    expect(roll.sourceId).toBe('spell:spell-1')
    expect(roll.label).toBe('Fire Bolt Attack')
    expect(roll.expression).toBe('1d20')
    expect(roll.dice).toHaveLength(1)
    expect(roll.dice[0]!.sides).toBe(20)
    expect(roll.modifier).toBe(6)
    expect(roll.total).toBe(roll.dice[0]!.total + 6)
  })

  it('broadcasts immediately when broadcast: true', async () => {
    const roll = await createSpellAttackRollEvent({
      worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42',
      spellName: 'Fire Bolt', sourceId: 'spell:spell-1', attackBonus: 6,
      visibility: 'private', broadcast: true
    })

    expect(broadcastRollEventMock).toHaveBeenCalledTimes(1)
    expect(broadcastRollEventMock).toHaveBeenCalledWith(roll)
  })

  it('persists but withholds the broadcast when broadcast: false -- the leveled-Cast ordering primitive', async () => {
    await createSpellAttackRollEvent({
      worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42',
      spellName: 'Fire Bolt', sourceId: 'spell:spell-1', attackBonus: 6,
      visibility: 'private', broadcast: false
    })

    expect(directusServiceRequestMock).toHaveBeenCalled() // still persisted
    expect(broadcastRollEventMock).not.toHaveBeenCalled() // never broadcast
  })
})

describe('createSpellDamageRollEvent', () => {
  it('rolls the caller-supplied dice plus modifier, and reuses the generic \'damage\' sourceType (no new taxonomy member)', async () => {
    const roll = await createSpellDamageRollEvent({
      worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42',
      spellName: 'Magic Missile', sourceId: 'spell:spell-2',
      dice: { count: 1, faces: 4 }, modifier: 1, damageType: 'force',
      visibility: 'private', broadcast: true
    })

    expect(roll.sourceType).toBe('damage')
    expect(roll.label).toBe('Magic Missile Damage')
    expect(roll.expression).toBe('1d4')
    expect(roll.dice).toHaveLength(1)
    expect(roll.dice[0]!.sides).toBe(4)
    expect(roll.modifier).toBe(1) // the Magic Missile "+1" regression, preserved end to end
    expect(roll.total).toBe(roll.dice[0]!.total + 1)
    expect(roll.metadata.damageType).toBe('force')
  })

  it('persists but withholds the broadcast when broadcast: false', async () => {
    await createSpellDamageRollEvent({
      worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42',
      spellName: 'Magic Missile', sourceId: 'spell:spell-2',
      dice: { count: 1, faces: 4 }, modifier: 1, damageType: 'force',
      visibility: 'private', broadcast: false
    })

    expect(directusServiceRequestMock).toHaveBeenCalled()
    expect(broadcastRollEventMock).not.toHaveBeenCalled()
  })

  it('omits damageType from metadata when none is given (e.g. an unresolved-choice spell, if ever forced through)', async () => {
    const roll = await createSpellDamageRollEvent({
      worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42',
      spellName: 'Fire Bolt', sourceId: 'spell:spell-1',
      dice: { count: 1, faces: 10 }, modifier: 0,
      visibility: 'private', broadcast: true
    })

    expect(roll.metadata.damageType).toBeUndefined()
  })

  // Character Sheet Body Phase 1B.2.1 (Cast Configuration) -- Chromatic
  // Orb's own acceptance case: the label gains a suffix ONLY when the
  // caller (character-cast.ts's own `damageTypeLabelFor`) supplies one,
  // never for an ordinary fixed-type spell (see the two tests above, both
  // still asserting the exact unsuffixed `"<name> Damage"` label).
  it('appends a "— Type" suffix to the label when damageTypeLabel is supplied', async () => {
    const roll = await createSpellDamageRollEvent({
      worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42',
      spellName: 'Chromatic Orb', sourceId: 'spell:spell-5',
      dice: { count: 3, faces: 8 }, modifier: 0, damageType: 'lightning', damageTypeLabel: 'Lightning',
      visibility: 'private', broadcast: true
    })

    expect(roll.label).toBe('Chromatic Orb Damage — Lightning')
  })
})
