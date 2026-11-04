// Unit tests for Character Ownership (server/utils/character-ownership.ts).
// See .github/docs/architecture/ownership-and-permissions.md §8.4/§12
// Phase 4 (partial) and this task's own CHARACTER OWNERSHIP section.
//
// server/utils/directus.ts relies on Nuxt/Nitro auto-imports that do not
// exist under plain Vitest -- mocked at the boundary, the established
// pattern in this repo. server/utils/eldra-accounts.ts and
// server/utils/world-memberships.ts are mocked too, since what is under
// test here is the ownership RULES (validation order, no-op detection,
// audit-before-write), not either of their own already-tested behaviors.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock, getAccountByIdMock, membershipExistsMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  getAccountByIdMock: vi.fn(),
  membershipExistsMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

vi.mock('../../../server/utils/eldra-accounts', () => ({
  getAccountById: getAccountByIdMock
}))

vi.mock('../../../server/utils/world-memberships', () => ({
  membershipExists: membershipExistsMock
}))

import {
  OWNABLE_CHARACTER_ENTITY_TYPES,
  assignCharacterOwner,
  getCharacterOwnership,
  isOwnableCharacterEntityType,
  listOwnershipHistory,
  unassignCharacterOwner
} from '../../../server/utils/character-ownership'

const WORLD_ID = '4'
const ENTITY_ID = '1645'
const CURRENT_OWNER = 'eldra-account-current'
const NEW_OWNER = 'eldra-account-new'
const ACTOR = 'eldra-account-admin'

function entityRow(overrides: Record<string, any> = {}) {
  return {
    id: Number(ENTITY_ID),
    world_id: Number(WORLD_ID),
    entity_type: 'pc',
    title: 'Borc',
    owner_account_id: CURRENT_OWNER,
    ...overrides
  }
}

function activeAccount(id: string) {
  return { id, displayName: 'Someone', status: 'active' }
}

function installDirectus(options: {
  entity?: any
  changesRows?: any[]
  onPatchEntity?: (body: any) => void
  onCreateChange?: (body: any) => void
  onConfirmChange?: (id: string, body: any) => void
  // Simulates the ENTITY write itself failing -- the one failure that
  // must propagate as a thrown error (see applyOwnerChange's own header).
  failEntityPatch?: boolean
  // Simulates the CONFIRM write (patching the audit row to
  // completed/failed) failing -- must NOT propagate when the entity
  // write itself succeeded.
  failConfirmPatch?: boolean
} = {}) {
  const entity = options.entity === undefined ? entityRow() : options.entity
  const changeRows: Record<string, any> = {}
  let nextChangeId = 1

  directusServiceRequestMock.mockImplementation(async (path: string, opts: any) => {
    if (path === `/items/entities/${ENTITY_ID}` && opts.method === 'GET') {
      return { data: entity }
    }
    if (path === `/items/entities/${ENTITY_ID}` && opts.method === 'PATCH') {
      if (options.failEntityPatch) {
        throw new Error('simulated entity write failure')
      }
      options.onPatchEntity?.(opts.body)
      return { data: { ...entity, ...opts.body } }
    }
    if (path === '/items/entity_ownership_changes' && opts.method === 'GET') {
      return { data: options.changesRows ?? [] }
    }
    if (path === '/items/entity_ownership_changes' && opts.method === 'POST') {
      const id = `change-${nextChangeId++}`
      const row = { id, status: 'pending', ...opts.body }
      changeRows[id] = row
      options.onCreateChange?.(opts.body)
      return { data: row }
    }
    const confirmMatch = path.match(/^\/items\/entity_ownership_changes\/(.+)$/)
    if (confirmMatch && opts.method === 'PATCH') {
      if (options.failConfirmPatch) {
        throw new Error('simulated confirm-write failure')
      }
      const id = confirmMatch[1]
      Object.assign(changeRows[id] ?? {}, opts.body)
      options.onConfirmChange?.(id, opts.body)
      return { data: changeRows[id] }
    }
    throw new Error(`unexpected call: ${opts.method} ${path}`)
  })

  return { changeRows }
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  getAccountByIdMock.mockReset()
  membershipExistsMock.mockReset()
  getAccountByIdMock.mockResolvedValue(activeAccount(NEW_OWNER))
  membershipExistsMock.mockResolvedValue(true)
})

describe('isOwnableCharacterEntityType / OWNABLE_CHARACTER_ENTITY_TYPES', () => {
  it('is exactly pc and player_character -- verified against the live schema, not guessed', () => {
    expect([...OWNABLE_CHARACTER_ENTITY_TYPES].sort()).toEqual(['pc', 'player_character'])
  })

  it('accepts pc and player_character', () => {
    expect(isOwnableCharacterEntityType('pc')).toBe(true)
    expect(isOwnableCharacterEntityType('player_character')).toBe(true)
  })

  it('rejects npc, npc_sheet, and bare character -- NPCs stay unownable', () => {
    expect(isOwnableCharacterEntityType('npc')).toBe(false)
    expect(isOwnableCharacterEntityType('npc_sheet')).toBe(false)
    expect(isOwnableCharacterEntityType('character')).toBe(false)
  })

  it('rejects an unrelated entity type', () => {
    expect(isOwnableCharacterEntityType('location')).toBe(false)
    expect(isOwnableCharacterEntityType('')).toBe(false)
  })
})

describe('getCharacterOwnership', () => {
  it('returns the current owner for a real, ownable character', async () => {
    installDirectus()

    const ownership = await getCharacterOwnership(WORLD_ID, ENTITY_ID)

    expect(ownership).toEqual({
      entityId: ENTITY_ID,
      worldId: WORLD_ID,
      entityType: 'pc',
      title: 'Borc',
      ownerAccountId: CURRENT_OWNER
    })
  })

  it('reports null for an Unassigned character', async () => {
    installDirectus({ entity: entityRow({ owner_account_id: null }) })

    const ownership = await getCharacterOwnership(WORLD_ID, ENTITY_ID)

    expect(ownership.ownerAccountId).toBeNull()
  })

  it('404s when the character does not exist', async () => {
    installDirectus({ entity: null })

    await expect(getCharacterOwnership(WORLD_ID, ENTITY_ID)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('404s when the character belongs to a different World -- World/entity mismatch', async () => {
    installDirectus({ entity: entityRow({ world_id: 999 }) })

    await expect(getCharacterOwnership(WORLD_ID, ENTITY_ID)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects an unsupported (NPC) entity type with 400, not 404', async () => {
    installDirectus({ entity: entityRow({ entity_type: 'npc' }) })

    await expect(getCharacterOwnership(WORLD_ID, ENTITY_ID)).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('assignCharacterOwner', () => {
  it('assigns a new owner, validates membership, and writes the audit row BEFORE the entity update', async () => {
    const order: string[] = []
    installDirectus({
      onCreateChange: () => order.push('audit'),
      onPatchEntity: () => order.push('entity-update')
    })

    const result = await assignCharacterOwner(WORLD_ID, ENTITY_ID, NEW_OWNER, ACTOR)

    expect(result.changed).toBe(true)
    expect(result.ownership.ownerAccountId).toBe(NEW_OWNER)
    expect(order).toEqual(['audit', 'entity-update'])
  })

  it('records previous and new owner, and the acting account, in the audit row', async () => {
    let capturedBody: any = null
    installDirectus({ onCreateChange: (body) => { capturedBody = body } })

    await assignCharacterOwner(WORLD_ID, ENTITY_ID, NEW_OWNER, ACTOR)

    expect(capturedBody).toMatchObject({
      world_id: Number(WORLD_ID),
      entity_id: Number(ENTITY_ID),
      previous_owner_account_id: CURRENT_OWNER,
      new_owner_account_id: NEW_OWNER,
      actor_account_id: ACTOR
    })
  })

  it('reassigns regardless of the current owner -- Platform Admin override, not blocked by who owns it now', async () => {
    installDirectus({ entity: entityRow({ owner_account_id: 'someone-elses-account' }) })

    const result = await assignCharacterOwner(WORLD_ID, ENTITY_ID, NEW_OWNER, ACTOR)

    expect(result.changed).toBe(true)
    expect(result.ownership.ownerAccountId).toBe(NEW_OWNER)
  })

  it('assigns from Unassigned (null) to a real owner', async () => {
    installDirectus({ entity: entityRow({ owner_account_id: null }) })

    const result = await assignCharacterOwner(WORLD_ID, ENTITY_ID, NEW_OWNER, ACTOR)

    expect(result.changed).toBe(true)
    const [, options] = directusServiceRequestMock.mock.calls.find(
      ([path, opts]: [string, any]) => path === '/items/entity_ownership_changes' && opts.method === 'POST'
    )!
    expect(options.body.previous_owner_account_id).toBeNull()
  })

  it('is a no-op -- no audit row, no entity write -- when the new owner equals the current owner', async () => {
    installDirectus()
    getAccountByIdMock.mockResolvedValue(activeAccount(CURRENT_OWNER))

    const result = await assignCharacterOwner(WORLD_ID, ENTITY_ID, CURRENT_OWNER, ACTOR)

    expect(result.changed).toBe(false)
    const writeCalls = directusServiceRequestMock.mock.calls.filter(
      ([, opts]: [string, any]) => opts.method === 'POST' || opts.method === 'PATCH'
    )
    expect(writeCalls).toHaveLength(0)
  })

  it('rejects a blank accountId', async () => {
    installDirectus()

    await expect(assignCharacterOwner(WORLD_ID, ENTITY_ID, '   ', ACTOR)).rejects.toMatchObject({ statusCode: 400 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('rejects an accountId that does not resolve to a real Account', async () => {
    installDirectus()
    getAccountByIdMock.mockResolvedValue(null)

    await expect(assignCharacterOwner(WORLD_ID, ENTITY_ID, 'not-real', ACTOR)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects an inactive/suspended Account', async () => {
    installDirectus()
    getAccountByIdMock.mockResolvedValue({ id: NEW_OWNER, displayName: 'X', status: 'suspended' })

    await expect(assignCharacterOwner(WORLD_ID, ENTITY_ID, NEW_OWNER, ACTOR)).rejects.toMatchObject({ statusCode: 400 })
  })

  // THE ACCOUNT-RECOVERY CASE'S OWN GUARDRAIL: a real, active Account that
  // simply has no membership in THIS World must still be rejected -- the
  // whole point is "may reassign regardless of ordinary World role," not
  // "may assign to anyone who merely exists."
  it('rejects a real, active Account with no membership in this World -- same-World membership required', async () => {
    installDirectus()
    membershipExistsMock.mockResolvedValue(false)

    await expect(assignCharacterOwner(WORLD_ID, ENTITY_ID, NEW_OWNER, ACTOR)).rejects.toMatchObject({ statusCode: 400 })
    expect(membershipExistsMock).toHaveBeenCalledWith(WORLD_ID, NEW_OWNER)
  })

  it('rejects an unsupported entity type before ever checking the target account', async () => {
    installDirectus({ entity: entityRow({ entity_type: 'npc' }) })

    await expect(assignCharacterOwner(WORLD_ID, ENTITY_ID, NEW_OWNER, ACTOR)).rejects.toMatchObject({ statusCode: 400 })
    expect(getAccountByIdMock).not.toHaveBeenCalled()
  })

  it('rejects a World/entity mismatch', async () => {
    installDirectus({ entity: entityRow({ world_id: 999 }) })

    await expect(assignCharacterOwner(WORLD_ID, ENTITY_ID, NEW_OWNER, ACTOR)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('validates the character BEFORE the target account, and the account BEFORE membership', async () => {
    installDirectus({ entity: null })

    await expect(assignCharacterOwner(WORLD_ID, ENTITY_ID, NEW_OWNER, ACTOR)).rejects.toMatchObject({ statusCode: 404 })
    expect(getAccountByIdMock).not.toHaveBeenCalled()
    expect(membershipExistsMock).not.toHaveBeenCalled()
  })
})

describe('unassignCharacterOwner', () => {
  it('unassigns an owned character, writing the audit row before the entity update', async () => {
    const order: string[] = []
    installDirectus({
      onCreateChange: () => order.push('audit'),
      onPatchEntity: () => order.push('entity-update')
    })

    const result = await unassignCharacterOwner(WORLD_ID, ENTITY_ID, ACTOR)

    expect(result.changed).toBe(true)
    expect(result.ownership.ownerAccountId).toBeNull()
    expect(order).toEqual(['audit', 'entity-update'])
  })

  it('records new_owner_account_id as null, and the previous owner, and the actor', async () => {
    let capturedBody: any = null
    installDirectus({ onCreateChange: (body) => { capturedBody = body } })

    await unassignCharacterOwner(WORLD_ID, ENTITY_ID, ACTOR)

    expect(capturedBody).toMatchObject({
      previous_owner_account_id: CURRENT_OWNER,
      new_owner_account_id: null,
      actor_account_id: ACTOR
    })
  })

  it('is a no-op -- no audit row -- when the character is already Unassigned', async () => {
    installDirectus({ entity: entityRow({ owner_account_id: null }) })

    const result = await unassignCharacterOwner(WORLD_ID, ENTITY_ID, ACTOR)

    expect(result.changed).toBe(false)
    const writeCalls = directusServiceRequestMock.mock.calls.filter(
      ([, opts]: [string, any]) => opts.method === 'POST' || opts.method === 'PATCH'
    )
    expect(writeCalls).toHaveLength(0)
  })

  it('unassigns regardless of who the current owner is -- Platform Admin override', async () => {
    installDirectus({ entity: entityRow({ owner_account_id: 'someone-elses-account' }) })

    const result = await unassignCharacterOwner(WORLD_ID, ENTITY_ID, ACTOR)

    expect(result.changed).toBe(true)
  })
})

describe('listOwnershipHistory', () => {
  it('returns every change row for this character, normalized', async () => {
    installDirectus({
      changesRows: [
        {
          id: 'c2',
          world_id: Number(WORLD_ID),
          entity_id: Number(ENTITY_ID),
          previous_owner_account_id: CURRENT_OWNER,
          new_owner_account_id: NEW_OWNER,
          actor_account_id: ACTOR,
          changed_at: '2026-02-01T00:00:00Z',
          status: 'completed'
        },
        {
          id: 'c1',
          world_id: Number(WORLD_ID),
          entity_id: Number(ENTITY_ID),
          previous_owner_account_id: null,
          new_owner_account_id: CURRENT_OWNER,
          actor_account_id: ACTOR,
          changed_at: '2026-01-01T00:00:00Z',
          status: 'completed'
        }
      ]
    })

    const history = await listOwnershipHistory(WORLD_ID, ENTITY_ID)

    expect(history).toEqual([
      {
        id: 'c2',
        worldId: WORLD_ID,
        entityId: ENTITY_ID,
        previousOwnerAccountId: CURRENT_OWNER,
        newOwnerAccountId: NEW_OWNER,
        actorAccountId: ACTOR,
        changedAt: '2026-02-01T00:00:00Z',
        status: 'completed'
      },
      {
        id: 'c1',
        worldId: WORLD_ID,
        entityId: ENTITY_ID,
        previousOwnerAccountId: null,
        newOwnerAccountId: CURRENT_OWNER,
        actorAccountId: ACTOR,
        changedAt: '2026-01-01T00:00:00Z',
        status: 'completed'
      }
    ])
  })

  it('returns an empty array for a character with no ownership history', async () => {
    installDirectus({ changesRows: [] })

    expect(await listOwnershipHistory(WORLD_ID, ENTITY_ID)).toEqual([])
  })

  it('defaults a row with no status column (old data) to pending, never crashing and never claiming completed', async () => {
    installDirectus({
      changesRows: [
        {
          id: 'c0',
          world_id: Number(WORLD_ID),
          entity_id: Number(ENTITY_ID),
          previous_owner_account_id: null,
          new_owner_account_id: CURRENT_OWNER,
          actor_account_id: ACTOR,
          changed_at: '2026-01-01T00:00:00Z'
          // no `status` field at all
        }
      ]
    })

    const [entry] = await listOwnershipHistory(WORLD_ID, ENTITY_ID)

    expect(entry.status).toBe('pending')
  })
})

// ---------------------------------------------------------------------
// WRITE-SAFETY REVIEW: the pending -> completed/failed audit sequence.
//
// No cross-collection Postgres transaction is available for this pair of
// writes (re-verified: the existing ELDRA_RESOURCE_DB_URL / eldra_resource_writer
// credential has only SELECT on `entities` and no grant at all on
// `entity_ownership_changes` -- confirmed against
// scripts/directus/create-resources-unique-index.mjs's own documented
// grant list). These tests pin the resulting three-state design instead
// of a false claim of atomicity.
// ---------------------------------------------------------------------

describe('assignCharacterOwner -- write sequence is pending -> completed/failed, never a false audit', () => {
  it('writes the audit row as pending BEFORE attempting the entity write', async () => {
    const order: string[] = []
    installDirectus({
      onCreateChange: () => order.push('insert-pending'),
      onPatchEntity: () => order.push('entity-write'),
      onConfirmChange: () => order.push('confirm')
    })

    await assignCharacterOwner(WORLD_ID, ENTITY_ID, NEW_OWNER, ACTOR)

    expect(order).toEqual(['insert-pending', 'entity-write', 'confirm'])
  })

  it('marks the row completed once the entity write succeeds', async () => {
    const { changeRows } = installDirectus()

    await assignCharacterOwner(WORLD_ID, ENTITY_ID, NEW_OWNER, ACTOR)

    expect(Object.values(changeRows)[0].status).toBe('completed')
  })

  // THE CORE FIX: when the entity write fails, the audit row must NOT
  // claim the change happened.
  it('when the entity write fails: marks the row failed, and re-throws the ORIGINAL error -- never a false "completed"', async () => {
    const { changeRows } = installDirectus({ failEntityPatch: true })

    await expect(assignCharacterOwner(WORLD_ID, ENTITY_ID, NEW_OWNER, ACTOR)).rejects.toThrow('simulated entity write failure')

    expect(Object.values(changeRows)[0].status).toBe('failed')
  })

  // THE OTHER HALF OF THE FIX: when the entity write SUCCEEDS but
  // confirming that in the audit row fails, the caller must NOT be told
  // the operation failed -- that would be a false failure for a change
  // that actually took effect.
  it('when only the CONFIRM write fails: does not throw, and the real ownership change still took effect', async () => {
    let entityWasPatched = false
    const { changeRows } = installDirectus({
      failConfirmPatch: true,
      onPatchEntity: () => { entityWasPatched = true }
    })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await assignCharacterOwner(WORLD_ID, ENTITY_ID, NEW_OWNER, ACTOR)

    expect(result.changed).toBe(true)
    expect(result.ownership.ownerAccountId).toBe(NEW_OWNER)
    expect(entityWasPatched).toBe(true)
    // The row is left pending -- honest about the gap, never upgraded to
    // 'completed' by this function pretending the confirm write worked.
    expect(Object.values(changeRows)[0].status).toBe('pending')
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })

  it('still performs no-op detection BEFORE ever writing a pending row', async () => {
    const { changeRows } = installDirectus()
    getAccountByIdMock.mockResolvedValue(activeAccount(CURRENT_OWNER))

    const result = await assignCharacterOwner(WORLD_ID, ENTITY_ID, CURRENT_OWNER, ACTOR)

    expect(result.changed).toBe(false)
    expect(Object.keys(changeRows)).toHaveLength(0)
  })
})

describe('unassignCharacterOwner -- same write sequence', () => {
  it('marks the row completed once the entity write succeeds', async () => {
    const { changeRows } = installDirectus()

    await unassignCharacterOwner(WORLD_ID, ENTITY_ID, ACTOR)

    expect(Object.values(changeRows)[0].status).toBe('completed')
  })

  it('when the entity write fails: marks the row failed and re-throws', async () => {
    const { changeRows } = installDirectus({ failEntityPatch: true })

    await expect(unassignCharacterOwner(WORLD_ID, ENTITY_ID, ACTOR)).rejects.toThrow('simulated entity write failure')

    expect(Object.values(changeRows)[0].status).toBe('failed')
  })

  it('a no-op (already Unassigned) writes no pending row at all', async () => {
    const { changeRows } = installDirectus({ entity: entityRow({ owner_account_id: null }) })

    const result = await unassignCharacterOwner(WORLD_ID, ENTITY_ID, ACTOR)

    expect(result.changed).toBe(false)
    expect(Object.keys(changeRows)).toHaveLength(0)
  })
})
