// Unit tests for POST /api/worlds/:id/rolls
// (server/api/worlds/[id]/rolls/index.post.ts). Phase 1 of
// .github/docs/architecture/eldra-roll-system.md §14.
//
// requireCapability/can are exercised for REAL (not mocked), matching
// tests/server/api/worlds/index.get.test.ts's own precedent of proving a
// route uses the actual capability system rather than a re-derived
// approximation of it. createCustomRollEvent is mocked -- this file is
// about the route's own validation/rejection behavior, not roll
// persistence (tests/server/utils/roll-events.test.ts covers that).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { createCustomRollEventMock } = vi.hoisted(() => ({
  createCustomRollEventMock: vi.fn()
}))

vi.mock('../../../../../../server/utils/roll-events', () => ({
  createCustomRollEvent: createCustomRollEventMock
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

  it('rejects sourceType other than "custom" with 400 -- Phase 1 scope', async () => {
    await expect(
      handler(fakeEvent('5', playerPrincipal('5'), { sourceType: 'skill', sourceKey: 'value:skill.stealth.bonus' }))
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(createCustomRollEventMock).not.toHaveBeenCalled()
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
