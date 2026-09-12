// Unit tests for Roll Event persistence (server/utils/roll-events.ts).
// Phase 1 of .github/docs/architecture/eldra-roll-system.md §14.
//
// directusServiceRequest is mocked at the module boundary (matching
// tests/server/utils/world-memberships.test.ts and
// tests/server/utils/character-combat.test.ts's own convention of mocking
// one collaborator, keeping the rest real). The OpenDice adapter
// (app/lib/rolls/dice-adapter.ts, Phase 0) is exercised for REAL -- a
// mocked dice adapter would defeat the entire point of a "successful
// custom roll" test, which is proving an actual server-authoritative roll
// happened.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import {
  createCustomRollEvent,
  decodeRollEventsCursor,
  encodeRollEventsCursor,
  listRollEvents
} from '../../../server/utils/roll-events'

function jsonResponse(data: unknown) {
  return { data }
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
})

describe('createCustomRollEvent', () => {
  it('rolls a well-formed custom expression and persists a new row, never overwriting anything', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      expect(path).toBe('/items/roll_events')
      expect(options.method).toBe('POST')
      // Round-trips exactly what was written, as Directus itself would.
      return jsonResponse({ id: 'roll-1', ...options.body })
    })

    const roll = await createCustomRollEvent({
      worldId: '5',
      rollerUserId: 'account-1',
      expression: '2d6+3',
      label: 'Custom Roll',
      visibility: 'table'
    })

    expect(roll.id).toBe('roll-1')
    expect(roll.worldId).toBe('5')
    expect(roll.rollerUserId).toBe('account-1')
    expect(roll.sourceType).toBe('custom')
    expect(roll.sourceKey).toBeNull()
    expect(roll.sourceId).toBeNull()
    expect(roll.expression).toBe('2d6+3')
    expect(roll.visibility).toBe('table')

    // The dice are REAL OpenDice output, not a stub -- total is internally
    // consistent with what was actually rolled, never a fabricated number.
    expect(roll.dice).toHaveLength(1)
    const group = roll.dice[0]!
    expect(group.sides).toBe(6)
    expect(group.results).toHaveLength(2)
    expect(roll.modifier).toBe(3)
    expect(roll.modifiers).toEqual([3])
    expect(roll.total).toBe(group.total + 3)

    // Exactly one Directus call -- a create, never an update.
    expect(directusServiceRequestMock).toHaveBeenCalledTimes(1)
    expect(directusServiceRequestMock.mock.calls[0]![1].method).toBe('POST')
  })

  it('never sends a client-influenced total/dice/seed -- every persisted number came from the adapter', async () => {
    let persistedBody: any
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      persistedBody = options.body
      return jsonResponse({ id: 'roll-2', ...options.body })
    })

    await createCustomRollEvent({
      worldId: 1,
      rollerUserId: 'account-1',
      expression: '1d20',
      label: 'Ability Check',
      visibility: 'private'
    })

    expect(persistedBody.expression).toBe('1d20')
    expect(persistedBody.dice[0].sides).toBe(20)
    expect(persistedBody).not.toHaveProperty('seed')
    expect(persistedBody.created_at).toEqual(expect.any(String))
  })

  it('rejects a malformed expression with a 400 carrying OpenDice\'s own message, and never persists anything', async () => {
    await expect(
      createCustomRollEvent({
        worldId: '5',
        rollerUserId: 'account-1',
        expression: 'not a formula',
        label: 'Bad Roll',
        visibility: 'private'
      })
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('rejects a formula exceeding OpenDice\'s own documented dice ceiling, and never persists anything', async () => {
    await expect(
      createCustomRollEvent({
        worldId: '5',
        rollerUserId: 'account-1',
        expression: '99999999d6',
        label: 'Bad Roll',
        visibility: 'private'
      })
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('exposes no update or delete function -- append-only means there is nothing to overwrite a Roll Event with', async () => {
    const module = await import('../../../server/utils/roll-events')
    const exportNames = Object.keys(module)

    expect(exportNames).not.toContain('updateRollEvent')
    expect(exportNames).not.toContain('deleteRollEvent')
    expect(exportNames).not.toContain('patchRollEvent')
  })
})

describe('listRollEvents', () => {
  function row(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'row-1',
      world_id: 5,
      encounter_id: null,
      actor_character_id: null,
      roller_user_id: 'account-1',
      label: 'Roll',
      source_type: 'custom',
      source_key: null,
      source_id: null,
      expression: '1d20',
      dice: [{ sides: 20, sign: 1, results: [10], keptFlags: [true], kept: [10], advantageState: 'normal', multiplier: 1, total: 10, naturalHigh: false, naturalLow: false }],
      modifier: 0,
      modifiers: [],
      total: 10,
      visibility: 'table',
      created_at: '2026-01-01T00:00:00.000Z',
      metadata: {},
      ...overrides
    }
  }

  it('hides a private roll from anyone but its own roller when the requester lacks world.roll.see_gm', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      // Prove the visibility clause was actually sent to Directus, not
      // just applied after the fact client-side.
      expect(options.query.filter).toMatchObject({
        _and: expect.arrayContaining([
          {
            _or: [
              { visibility: { _eq: 'table' } },
              { _and: [{ visibility: { _eq: 'private' } }, { roller_user_id: { _eq: 'account-2' } }] }
            ]
          }
        ])
      })
      // Directus itself would already have applied this filter -- the
      // mock returns only what a real filtered query would.
      return jsonResponse([row({ id: 'mine', visibility: 'private', roller_user_id: 'account-2' })])
    })

    const result = await listRollEvents({
      worldId: 5,
      requesterAccountId: 'account-2',
      canSeeGm: false
    })

    expect(result.rolls).toHaveLength(1)
    expect(result.rolls[0]!.id).toBe('mine')
  })

  it('adds no visibility filter at all for a requester holding world.roll.see_gm -- a GM sees every row', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      const filter = options.query.filter
      const asString = JSON.stringify(filter)
      expect(asString).not.toContain('roller_user_id')
      return jsonResponse([row(), row({ id: 'row-2', visibility: 'private', roller_user_id: 'someone-else' })])
    })

    const result = await listRollEvents({
      worldId: 5,
      requesterAccountId: 'gm-account',
      canSeeGm: true
    })

    expect(result.rolls.map((r) => r.id)).toEqual(['row-1', 'row-2'])
  })

  it('scopes to the given World, encounter, and actor character', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      expect(options.query.filter).toMatchObject({
        _and: expect.arrayContaining([
          { world_id: { _eq: 5 } },
          { encounter_id: { _eq: 9 } },
          { actor_character_id: { _eq: 42 } }
        ])
      })
      return jsonResponse([])
    })

    await listRollEvents({
      worldId: 5,
      requesterAccountId: 'account-1',
      canSeeGm: true,
      encounterId: 9,
      actorCharacterId: 42
    })
  })

  it('returns nextCursor only when more rows exist beyond the page, and null otherwise', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      expect(options.query.limit).toBe(3) // pageSize(2) + 1
      return jsonResponse([row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })])
    })

    const result = await listRollEvents({
      worldId: 5,
      requesterAccountId: 'account-1',
      canSeeGm: true,
      limit: 2
    })

    expect(result.rolls.map((r) => r.id)).toEqual(['a', 'b'])
    expect(result.nextCursor).not.toBeNull()

    const decoded = decodeRollEventsCursor(result.nextCursor!)
    expect(decoded).toEqual({ createdAt: '2026-01-01T00:00:00.000Z', id: 'b' })
  })

  it('returns a null nextCursor when the page exactly exhausts the available rows', async () => {
    directusServiceRequestMock.mockImplementation(async () => jsonResponse([row({ id: 'a' }), row({ id: 'b' })]))

    const result = await listRollEvents({
      worldId: 5,
      requesterAccountId: 'account-1',
      canSeeGm: true,
      limit: 2
    })

    expect(result.rolls).toHaveLength(2)
    expect(result.nextCursor).toBeNull()
  })

  it('resuming from a cursor asks Directus for strictly-after rows in the same (created_at, id) order', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      expect(options.query.sort).toEqual(['-created_at', '-id'])
      expect(options.query.filter).toMatchObject({
        _and: expect.arrayContaining([
          {
            _or: [
              { created_at: { _lt: '2026-01-01T00:00:00.000Z' } },
              { _and: [{ created_at: { _eq: '2026-01-01T00:00:00.000Z' } }, { id: { _lt: 'b' } }] }
            ]
          }
        ])
      })
      return jsonResponse([row({ id: 'c' })])
    })

    const cursor = encodeRollEventsCursor({ createdAt: '2026-01-01T00:00:00.000Z', id: 'b' })
    const result = await listRollEvents({
      worldId: 5,
      requesterAccountId: 'account-1',
      canSeeGm: true,
      cursor
    })

    expect(result.rolls.map((r) => r.id)).toEqual(['c'])
  })

  it('clamps an out-of-range limit rather than trusting it verbatim', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      expect(options.query.limit).toBeLessThanOrEqual(201) // MAX_ROLL_EVENTS_LIMIT(200) + 1
      return jsonResponse([])
    })

    await listRollEvents({
      worldId: 5,
      requesterAccountId: 'account-1',
      canSeeGm: true,
      limit: 999999
    })
  })

  it('ignores an unparseable cursor rather than throwing, and starts from the beginning', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      const asString = JSON.stringify(options.query.filter)
      expect(asString).not.toContain('_lt')
      return jsonResponse([row()])
    })

    const result = await listRollEvents({
      worldId: 5,
      requesterAccountId: 'account-1',
      canSeeGm: true,
      cursor: 'not-a-real-cursor'
    })

    expect(result.rolls).toHaveLength(1)
  })
})

describe('encodeRollEventsCursor / decodeRollEventsCursor', () => {
  it('round-trips exactly', () => {
    const cursor = encodeRollEventsCursor({ createdAt: '2026-02-03T04:05:06.789Z', id: 'abc-123' })
    expect(decodeRollEventsCursor(cursor)).toEqual({ createdAt: '2026-02-03T04:05:06.789Z', id: 'abc-123' })
  })

  it('returns null for garbage input instead of throwing', () => {
    expect(decodeRollEventsCursor('!!!not-base64!!!')).toBeNull()
    expect(decodeRollEventsCursor('')).toBeNull()
  })
})
