// Unit tests for POST /api/worlds/:id/rolls
// (server/api/worlds/[id]/rolls/index.post.ts). Phase 1 of
// .github/docs/architecture/eldra-roll-system.md §14, extended by Phase 2
// (§3/§4) for `sourceType: 'ability' | 'saving_throw' | 'skill'`.
//
// requireCapability/can are exercised for REAL (not mocked), matching
// tests/server/api/worlds/index.get.test.ts's own precedent of proving a
// route uses the actual capability system rather than a re-derived
// approximation of it. createCustomRollEvent/createDerivedRollEvent are
// mocked -- this file is about the route's own validation/rejection
// behavior, not roll persistence or derivation
// (tests/server/utils/roll-events.test.ts and
// tests/server/utils/roll-events-derived.test.ts cover those).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { createCustomRollEventMock, createDerivedRollEventMock, createActionAttackRollEventMock, createActionDamageRollEventMock } = vi.hoisted(() => ({
  createCustomRollEventMock: vi.fn(),
  createDerivedRollEventMock: vi.fn(),
  createActionAttackRollEventMock: vi.fn(),
  createActionDamageRollEventMock: vi.fn()
}))

vi.mock('../../../../../../server/utils/roll-events', () => ({
  createCustomRollEvent: createCustomRollEventMock,
  createDerivedRollEvent: createDerivedRollEventMock,
  createActionAttackRollEvent: createActionAttackRollEventMock,
  createActionDamageRollEvent: createActionDamageRollEventMock
}))

// h3's real readBody needs a live Node request stream this test has no
// interest in constructing -- same shim as
// tests/server/api/worlds/index.post.test.ts.
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: vi.fn(async (event: any) => event._requestBody)
  }
})

import handler from '../../../../../../server/api/worlds/[id]/rolls/index.post'
import type { Principal } from '../../../../../../server/utils/authorization'

function playerPrincipal(worldId: string, accountId = 'account-1'): Principal {
  return {
    accountId,
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.read', 'world.roll.execute'])]]),
    temporarySingleUserMode: false
  }
}

function observerPrincipal(worldId: string, accountId = 'observer-1'): Principal {
  return {
    accountId,
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.read'])]]), // no world.roll.execute
    temporarySingleUserMode: false
  }
}

function fakeEvent(worldId: string, principal: Principal | null, body: unknown): H3Event {
  return {
    context: { principal, params: { id: worldId } },
    node: { req: {}, res: { statusCode: 200 } },
    _requestBody: body
  } as unknown as H3Event
}

beforeEach(() => {
  createCustomRollEventMock.mockReset()
  createDerivedRollEventMock.mockReset()
  createActionAttackRollEventMock.mockReset()
  createActionDamageRollEventMock.mockReset()
})

describe('POST /api/worlds/:id/rolls', () => {
  it('fails with 401 when no principal is present', async () => {
    await expect(
      handler(fakeEvent('5', null, { sourceType: 'custom', expression: '2d6+3' }))
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(createCustomRollEventMock).not.toHaveBeenCalled()
  })

  it('fails with 403 for a Principal lacking world.roll.execute', async () => {
    await expect(
      handler(fakeEvent('5', observerPrincipal('5'), { sourceType: 'custom', expression: '2d6+3' }))
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(createCustomRollEventMock).not.toHaveBeenCalled()
  })

  it('rejects a sourceType nothing implements yet with 400 -- spell_attack/spell_save remain unimplemented here (Combat Resolution\'s own targeted Resolve control handles spells)', async () => {
    await expect(
      handler(fakeEvent('5', playerPrincipal('5'), { sourceType: 'spell_attack', sourceId: 'action-1', actorCharacterId: '42' }))
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(createCustomRollEventMock).not.toHaveBeenCalled()
    expect(createDerivedRollEventMock).not.toHaveBeenCalled()
    expect(createActionAttackRollEventMock).not.toHaveBeenCalled()
    expect(createActionDamageRollEventMock).not.toHaveBeenCalled()
  })

  it('rejects a missing sourceType with 400', async () => {
    await expect(
      handler(fakeEvent('5', playerPrincipal('5'), { expression: '2d6+3' }))
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(createCustomRollEventMock).not.toHaveBeenCalled()
  })

  it('rejects a missing expression with 400', async () => {
    await expect(
      handler(fakeEvent('5', playerPrincipal('5'), { sourceType: 'custom' }))
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(createCustomRollEventMock).not.toHaveBeenCalled()
  })

  it('rejects an unrecognized visibility with 400', async () => {
    await expect(
      handler(fakeEvent('5', playerPrincipal('5'), { sourceType: 'custom', expression: '1d20', visibility: 'blind_dm' }))
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(createCustomRollEventMock).not.toHaveBeenCalled()
  })

  it.each(['total', 'dice', 'seed', 'results'])(
    'rejects a body supplying "%s" with 400, and never calls the persistence layer',
    async (field) => {
      await expect(
        handler(
          fakeEvent('5', playerPrincipal('5'), {
            sourceType: 'custom',
            expression: '1d20',
            [field]: field === 'total' ? 18 : field === 'seed' ? 'abc' : [1, 2]
          })
        )
      ).rejects.toMatchObject({ statusCode: 400 })
      expect(createCustomRollEventMock).not.toHaveBeenCalled()
    }
  )

  it('succeeds for a Player rolling a custom expression, defaulting visibility to private (fail closed)', async () => {
    createCustomRollEventMock.mockResolvedValue({ id: 'roll-1', total: 12 })

    const result = await handler(fakeEvent('5', playerPrincipal('5'), { sourceType: 'custom', expression: '2d6+3' }))

    expect(result).toEqual({ id: 'roll-1', total: 12 })
    expect(createCustomRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        worldId: '5',
        rollerUserId: 'account-1',
        expression: '2d6+3',
        visibility: 'private',
        label: '2d6+3'
      })
    )
  })

  it('passes an explicit visibility and label through unchanged', async () => {
    createCustomRollEventMock.mockResolvedValue({ id: 'roll-2' })

    await handler(
      fakeEvent('5', playerPrincipal('5'), {
        sourceType: 'custom',
        expression: '1d20',
        label: 'Wisdom (Perception) check',
        visibility: 'table'
      })
    )

    expect(createCustomRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'table', label: 'Wisdom (Perception) check' })
    )
  })

  it('never derives rollerUserId from the request body, even when one is supplied', async () => {
    createCustomRollEventMock.mockResolvedValue({ id: 'roll-3' })

    await handler(
      fakeEvent('5', playerPrincipal('5', 'real-account'), {
        sourceType: 'custom',
        expression: '1d20',
        rollerUserId: 'someone-else'
      })
    )

    expect(createCustomRollEventMock).toHaveBeenCalledWith(expect.objectContaining({ rollerUserId: 'real-account' }))
  })

  it('propagates a malformed-formula rejection from createCustomRollEvent', async () => {
    createCustomRollEventMock.mockRejectedValue(Object.assign(new Error('bad formula'), { statusCode: 400 }))

    await expect(
      handler(fakeEvent('5', playerPrincipal('5'), { sourceType: 'custom', expression: 'not a formula' }))
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('POST /api/worlds/:id/rolls -- Phase 2 (ability/saving_throw/skill)', () => {
  it.each(['ability', 'saving_throw', 'skill'] as const)(
    'succeeds for a %s roll, sending only actorCharacterId/sourceKey/visibility to the derivation layer',
    async (sourceType) => {
      createDerivedRollEventMock.mockResolvedValue({ id: 'roll-1', sourceType, total: 17 })

      const result = await handler(
        fakeEvent('5', playerPrincipal('5'), {
          sourceType,
          actorCharacterId: '42',
          sourceKey: 'value:skill.stealth.bonus',
          visibility: 'table'
        })
      )

      expect(result).toEqual({ id: 'roll-1', sourceType, total: 17 })
      expect(createDerivedRollEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: '5',
          rollerUserId: 'account-1',
          actorCharacterId: '42',
          sourceType,
          sourceKey: 'value:skill.stealth.bonus',
          visibility: 'table'
        })
      )
      expect(createCustomRollEventMock).not.toHaveBeenCalled()
    }
  )

  it('defaults visibility to private (fail closed) when omitted', async () => {
    createDerivedRollEventMock.mockResolvedValue({ id: 'roll-2' })

    await handler(
      fakeEvent('5', playerPrincipal('5'), {
        sourceType: 'ability',
        actorCharacterId: '42',
        sourceKey: 'value:ability.str.mod'
      })
    )

    expect(createDerivedRollEventMock).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'private' }))
  })

  it('rejects a missing actorCharacterId with 400', async () => {
    await expect(
      handler(fakeEvent('5', playerPrincipal('5'), { sourceType: 'skill', sourceKey: 'value:skill.stealth.bonus' }))
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(createDerivedRollEventMock).not.toHaveBeenCalled()
  })

  it('rejects a missing sourceKey with 400', async () => {
    await expect(
      handler(fakeEvent('5', playerPrincipal('5'), { sourceType: 'skill', actorCharacterId: '42' }))
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(createDerivedRollEventMock).not.toHaveBeenCalled()
  })

  it.each(['expression', 'modifier', 'modifiers', 'bonus'])(
    'rejects a body supplying "%s" with 400 -- no client-side math for a derived roll',
    async (field) => {
      await expect(
        handler(
          fakeEvent('5', playerPrincipal('5'), {
            sourceType: 'ability',
            actorCharacterId: '42',
            sourceKey: 'value:ability.str.mod',
            [field]: field === 'modifiers' ? [1] : field === 'expression' ? '1d20+99' : 99
          })
        )
      ).rejects.toMatchObject({ statusCode: 400 })
      expect(createDerivedRollEventMock).not.toHaveBeenCalled()
    }
  )

  it('propagates a rejection from createDerivedRollEvent (e.g. a stale sourceKey) unchanged', async () => {
    createDerivedRollEventMock.mockRejectedValue(Object.assign(new Error('not declared'), { statusCode: 400 }))

    await expect(
      handler(
        fakeEvent('5', playerPrincipal('5'), {
          sourceType: 'skill',
          actorCharacterId: '42',
          sourceKey: 'value:skill.nonexistent.bonus'
        })
      )
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('never derives rollerUserId from the request body for a derived roll either', async () => {
    createDerivedRollEventMock.mockResolvedValue({ id: 'roll-3' })

    await handler(
      fakeEvent('5', playerPrincipal('5', 'real-account'), {
        sourceType: 'skill',
        actorCharacterId: '42',
        sourceKey: 'value:skill.stealth.bonus',
        rollerUserId: 'someone-else'
      })
    )

    expect(createDerivedRollEventMock).toHaveBeenCalledWith(expect.objectContaining({ rollerUserId: 'real-account' }))
  })
})

describe('POST /api/worlds/:id/rolls -- Character Sheet Body Phase 1A (action_attack/damage)', () => {
  it.each(['action_attack', 'damage'] as const)(
    'succeeds for a %s roll, sending only actorCharacterId/actionId/visibility to the action-roll layer',
    async (sourceType) => {
      const mock = sourceType === 'action_attack' ? createActionAttackRollEventMock : createActionDamageRollEventMock
      mock.mockResolvedValue({ id: 'roll-1', sourceType, total: 17 })

      const result = await handler(
        fakeEvent('5', playerPrincipal('5'), {
          sourceType,
          actorCharacterId: '42',
          actionId: 'weapon:item-1',
          visibility: 'table'
        })
      )

      expect(result).toEqual({ id: 'roll-1', sourceType, total: 17 })
      expect(mock).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: '5',
          rollerUserId: 'account-1',
          actorCharacterId: '42',
          actionId: 'weapon:item-1',
          visibility: 'table'
        })
      )
      expect(createCustomRollEventMock).not.toHaveBeenCalled()
      expect(createDerivedRollEventMock).not.toHaveBeenCalled()
      const other = sourceType === 'action_attack' ? createActionDamageRollEventMock : createActionAttackRollEventMock
      expect(other).not.toHaveBeenCalled()
    }
  )

  it('defaults visibility to private (fail closed) when omitted', async () => {
    createActionAttackRollEventMock.mockResolvedValue({ id: 'roll-2' })

    await handler(
      fakeEvent('5', playerPrincipal('5'), { sourceType: 'action_attack', actorCharacterId: '42', actionId: 'unarmed:strike' })
    )

    expect(createActionAttackRollEventMock).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'private' }))
  })

  it('rejects a missing actorCharacterId with 400', async () => {
    await expect(
      handler(fakeEvent('5', playerPrincipal('5'), { sourceType: 'action_attack', actionId: 'unarmed:strike' }))
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(createActionAttackRollEventMock).not.toHaveBeenCalled()
  })

  it('rejects a missing actionId with 400', async () => {
    await expect(
      handler(fakeEvent('5', playerPrincipal('5'), { sourceType: 'damage', actorCharacterId: '42' }))
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(createActionDamageRollEventMock).not.toHaveBeenCalled()
  })

  it.each(['expression', 'modifier', 'modifiers', 'bonus', 'sourceKey', 'attackBonus', 'damage', 'damageType', 'damageRoll'])(
    'rejects a body supplying "%s" with 400 -- no client-side mechanics for an action roll',
    async (field) => {
      await expect(
        handler(
          fakeEvent('5', playerPrincipal('5'), {
            sourceType: 'action_attack',
            actorCharacterId: '42',
            actionId: 'weapon:item-1',
            [field]: field === 'modifiers' || field === 'damageRoll' ? [1] : field === 'expression' ? '1d20+99' : 99
          })
        )
      ).rejects.toMatchObject({ statusCode: 400 })
      expect(createActionAttackRollEventMock).not.toHaveBeenCalled()
    }
  )

  it('propagates a rejection from createActionAttackRollEvent (e.g. an unknown action) unchanged', async () => {
    createActionAttackRollEventMock.mockRejectedValue(Object.assign(new Error('No such action'), { statusCode: 404 }))

    await expect(
      handler(fakeEvent('5', playerPrincipal('5'), { sourceType: 'action_attack', actorCharacterId: '42', actionId: 'weapon:does-not-exist' }))
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('never derives rollerUserId from the request body for an action roll either', async () => {
    createActionDamageRollEventMock.mockResolvedValue({ id: 'roll-3' })

    await handler(
      fakeEvent('5', playerPrincipal('5', 'real-account'), {
        sourceType: 'damage',
        actorCharacterId: '42',
        actionId: 'unarmed:strike',
        rollerUserId: 'someone-else'
      })
    )

    expect(createActionDamageRollEventMock).toHaveBeenCalledWith(expect.objectContaining({ rollerUserId: 'real-account' }))
  })

  it('never forwards a client-supplied label -- the display label is always server-derived from the action\'s own name', async () => {
    createActionAttackRollEventMock.mockResolvedValue({ id: 'roll-4' })

    await handler(
      fakeEvent('5', playerPrincipal('5'), {
        sourceType: 'action_attack',
        actorCharacterId: '42',
        actionId: 'unarmed:strike',
        label: 'Definitely The Real Attack Bonus'
      })
    )

    expect(createActionAttackRollEventMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ label: expect.anything() })
    )
  })
})
