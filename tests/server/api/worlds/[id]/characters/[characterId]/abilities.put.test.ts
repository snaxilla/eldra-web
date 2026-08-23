// Unit tests for PUT /api/worlds/:id/characters/:characterId/abilities --
// Character Builder / Character Sheet Phase 3.
//
// requireCapability/can run for REAL (not mocked), matching
// create-v2.post.test.ts's own split; the Directus boundary (dxFetch) and
// the persistence util are mocked. This file is about authorization, world
// scoping, and validation -- not persistence, which
// tests/server/utils/character-ability-scores.test.ts covers.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { dxFetchMock, saveCharacterAbilityScoresMock } = vi.hoisted(() => ({
  dxFetchMock: vi.fn(),
  saveCharacterAbilityScoresMock: vi.fn()
}))

vi.mock('../../../../../../../server/utils/entity-factory', () => ({ dxFetch: dxFetchMock }))

vi.mock('../../../../../../../server/utils/character-ability-scores', () => ({
  saveCharacterAbilityScores: saveCharacterAbilityScoresMock
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: vi.fn(async (event: any) => event._requestBody)
  }
})

import handler from '../../../../../../../server/api/worlds/[id]/characters/[characterId]/abilities.put'
import type { Principal } from '../../../../../../../server/utils/authorization'

const SCORES = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }
const VALID_BODY = { method: 'standard-array', scores: SCORES }

function principalWith(capabilities: string[], worldId = '5'): Principal {
  return {
    accountId: 'account-1',
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(capabilities)]]),
    temporarySingleUserMode: false
  } as unknown as Principal
}

function gmPrincipal(worldId = '5') {
  return principalWith(['world.read', 'world.character.create', 'world.character.edit_any'], worldId)
}

function playerPrincipal(worldId = '5') {
  return principalWith(['world.read', 'world.character.create', 'world.character.edit_own'], worldId)
}

function fakeEvent(worldId: string, characterId: string, principal: Principal | null, body: unknown): H3Event {
  return {
    context: { principal, params: { id: worldId, characterId } },
    node: { req: {}, res: { statusCode: 200 } },
    _requestBody: body
  } as unknown as H3Event
}

beforeEach(() => {
  dxFetchMock.mockReset()
  dxFetchMock.mockResolvedValue({ data: { id: 42, world_id: 5 } })
  saveCharacterAbilityScoresMock.mockReset()
  saveCharacterAbilityScoresMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
})

describe('authorization and scoping', () => {
  it('fails with 401 when no principal is present', async () => {
    await expect(handler(fakeEvent('5', '42', null, VALID_BODY))).rejects.toMatchObject({ statusCode: 401 })
    expect(saveCharacterAbilityScoresMock).not.toHaveBeenCalled()
  })

  it('fails with 403 for a principal lacking world.character.edit_any', async () => {
    // Entity ownership is not tracked yet, so edit_own cannot be honoured --
    // the route requires edit_any, matching update.post.ts's own posture.
    await expect(handler(fakeEvent('5', '42', playerPrincipal(), VALID_BODY))).rejects.toMatchObject({ statusCode: 403 })
    expect(saveCharacterAbilityScoresMock).not.toHaveBeenCalled()
  })

  it('fails with 403 for a principal whose capability is in a DIFFERENT world', async () => {
    await expect(
      handler(fakeEvent('5', '42', gmPrincipal('99'), VALID_BODY))
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('fails with 404 when the character belongs to another world -- the URL id is not self-authorizing', async () => {
    dxFetchMock.mockResolvedValue({ data: { id: 42, world_id: 99 } })

    await expect(handler(fakeEvent('5', '42', gmPrincipal(), VALID_BODY))).rejects.toMatchObject({ statusCode: 404 })
    expect(saveCharacterAbilityScoresMock).not.toHaveBeenCalled()
  })

  it('fails with 404 when the character does not exist', async () => {
    dxFetchMock.mockResolvedValue({ data: null })

    await expect(handler(fakeEvent('5', '42', gmPrincipal(), VALID_BODY))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('fails with 400 when a route param is missing', async () => {
    await expect(handler(fakeEvent('', '42', gmPrincipal(), VALID_BODY))).rejects.toMatchObject({ statusCode: 400 })
    await expect(handler(fakeEvent('5', '', gmPrincipal(), VALID_BODY))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('validation', () => {
  it('stores a valid payload verbatim and reports it back', async () => {
    const result = await handler(fakeEvent('5', '42', gmPrincipal(), VALID_BODY))

    expect(saveCharacterAbilityScoresMock).toHaveBeenCalledWith('42', VALID_BODY)
    expect(result).toEqual({ success: true, abilityScores: VALID_BODY })
  })

  it('rejects an incomplete, out-of-bounds, or non-numeric set of scores', async () => {
    const bad = [
      { method: 'manual', scores: { str: 15, dex: 14 } },
      { method: 'manual', scores: { ...SCORES, str: 0 } },
      { method: 'manual', scores: { ...SCORES, str: 31 } },
      { method: 'manual', scores: { ...SCORES, str: 10.5 } },
      { method: 'manual', scores: { ...SCORES, str: 'strong' } },
      { method: 'manual' },
      null
    ]

    for (const body of bad) {
      await expect(handler(fakeEvent('5', '42', gmPrincipal(), body))).rejects.toMatchObject({ statusCode: 400 })
    }

    expect(saveCharacterAbilityScoresMock).not.toHaveBeenCalled()
  })

  it('does NOT re-litigate point-buy legality -- "store exactly what the player entered"', async () => {
    // 18 is not point-buy legal. A GM adjusting a point-buy character must
    // still be able to save.
    const nudged = { method: 'point-buy', scores: { ...SCORES, str: 18 } }

    const result = await handler(fakeEvent('5', '42', gmPrincipal(), nudged))

    expect(result).toEqual({ success: true, abilityScores: nudged })
  })

  it('is idempotent -- PUTting the same body twice stores the same record', async () => {
    await handler(fakeEvent('5', '42', gmPrincipal(), VALID_BODY))
    await handler(fakeEvent('5', '42', gmPrincipal(), VALID_BODY))

    expect(saveCharacterAbilityScoresMock).toHaveBeenCalledTimes(2)
    expect(saveCharacterAbilityScoresMock.mock.calls[0][1]).toEqual(saveCharacterAbilityScoresMock.mock.calls[1][1])
  })
})
