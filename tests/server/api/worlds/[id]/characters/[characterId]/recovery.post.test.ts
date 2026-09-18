// Unit tests for POST /api/worlds/:id/characters/:characterId/recovery --
// specifically the request-validation boundary (`ACTION_TYPES`/
// `parseAction`) that real-browser testing caught silently rejecting
// `{ type: 'temp-hp', amount }` with a 400 -- BEFORE the request ever
// reached applyRecoveryAction/grantTemporaryHp. That array is a hand-
// maintained duplicate of RecoveryAction['type'] from
// server/utils/character-recovery.ts, not derived from it, so adding a new
// action there does not automatically keep this route in sync -- exactly
// the gap this file's own tests exist to catch going forward.
//
// applyRecoveryAction itself is mocked (already covered directly by
// tests/server/utils/character-recovery.test.ts); this file is about
// whether a request BODY makes it through this route's own parsing at
// all, matching abilities.put.test.ts's own split between "does the route
// validate/authorize correctly" and "does the domain layer compute the
// right numbers".

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { dxFetchMock, applyRecoveryActionMock } = vi.hoisted(() => ({
  dxFetchMock: vi.fn(),
  applyRecoveryActionMock: vi.fn()
}))

vi.mock('../../../../../../../server/utils/entity-factory', () => ({ dxFetch: dxFetchMock }))

vi.mock('../../../../../../../server/utils/character-recovery', async () => {
  const actual = await vi.importActual<typeof import('../../../../../../../server/utils/character-recovery')>(
    '../../../../../../../server/utils/character-recovery'
  )
  return { ...actual, applyRecoveryAction: applyRecoveryActionMock }
})

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: vi.fn(async (event: any) => event._requestBody)
  }
})

import handler from '../../../../../../../server/api/worlds/[id]/characters/[characterId]/recovery.post'
import type { Principal } from '../../../../../../../server/utils/authorization'

function gmPrincipal(worldId = '5'): Principal {
  return {
    accountId: 'account-1',
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.read', 'world.character.edit_any'])]]),
    temporarySingleUserMode: false
  } as unknown as Principal
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
  applyRecoveryActionMock.mockReset()
  applyRecoveryActionMock.mockResolvedValue({
    ok: true,
    health: { currentHp: 9, temporaryHp: 5, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } }
  })
})

describe('recovery request validation -- the boundary that rejected temp-hp in production', () => {
  it('accepts { type: "temp-hp", amount } and forwards it to applyRecoveryAction unchanged, plus the authenticated roller', async () => {
    const result = await handler(fakeEvent('5', '42', gmPrincipal(), { type: 'temp-hp', amount: 5 }))

    expect(applyRecoveryActionMock).toHaveBeenCalledWith('5', '42', { type: 'temp-hp', amount: 5 }, 'account-1')
    expect(result).toEqual({ success: true, health: expect.objectContaining({ temporaryHp: 5 }) })
  })

  it('still accepts every previously-supported action type', async () => {
    for (const type of ['damage', 'heal', 'spend-hit-die', 'short-rest', 'long-rest', 'reset-death-saves']) {
      applyRecoveryActionMock.mockClear()
      const body = type === 'damage' || type === 'heal' ? { type, amount: 3 } : { type }

      await handler(fakeEvent('5', '42', gmPrincipal(), body))
      expect(applyRecoveryActionMock).toHaveBeenCalledWith('5', '42', body, 'account-1')
    }
  })

  it('rejects temp-hp with a missing or non-numeric amount before reaching applyRecoveryAction', async () => {
    for (const body of [{ type: 'temp-hp' }, { type: 'temp-hp', amount: 'a lot' }]) {
      await expect(handler(fakeEvent('5', '42', gmPrincipal(), body))).rejects.toMatchObject({ statusCode: 400 })
    }
    expect(applyRecoveryActionMock).not.toHaveBeenCalled()
  })

  it('still rejects an action type this route does not recognize', async () => {
    await expect(
      handler(fakeEvent('5', '42', gmPrincipal(), { type: 'grant-inspiration' }))
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(applyRecoveryActionMock).not.toHaveBeenCalled()
  })

  it('still rejects a missing or malformed body', async () => {
    for (const body of [null, undefined, 'temp-hp', 42, ['temp-hp']]) {
      await expect(handler(fakeEvent('5', '42', gmPrincipal(), body))).rejects.toMatchObject({ statusCode: 400 })
    }
    expect(applyRecoveryActionMock).not.toHaveBeenCalled()
  })
})
