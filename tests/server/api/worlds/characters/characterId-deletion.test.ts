// Route tests for:
//   GET    /api/worlds/:id/characters/:characterId/deletion-impact
//   DELETE /api/worlds/:id/characters/:characterId
//
// Covers the AUTHORIZATION boundary precisely -- the point of this task's
// delete-safety work: an ordinary Player can do neither; the pre-existing
// GM/Owner path (world.character.edit_any / world.npc.manage) is
// unchanged; platform.character.manage is an independent, additional
// path, not a replacement for it. The dependency trace itself is covered
// in tests/server/utils/character-deletion.test.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { planCharacterDeletionMock, executeCharacterDeletionMock } = vi.hoisted(() => ({
  planCharacterDeletionMock: vi.fn(),
  executeCharacterDeletionMock: vi.fn()
}))

vi.mock('../../../../../server/utils/character-deletion', () => ({
  planCharacterDeletion: planCharacterDeletionMock,
  executeCharacterDeletion: executeCharacterDeletionMock,
  deleteCharacterWithPlan: vi.fn()
}))

import deletionImpactHandler from '../../../../../server/api/worlds/[id]/characters/[characterId]/deletion-impact.get'
import deleteHandler from '../../../../../server/api/worlds/[id]/characters/[characterId]/index.delete'
import type { Principal } from '../../../../../server/utils/authorization'

function principal(opts: {
  platformCapabilities?: string[]
  worldCapabilities?: string[]
}): Principal {
  return {
    accountId: 'eldra-account-1',
    platformCapabilities: new Set(opts.platformCapabilities ?? []) as any,
    worldCapabilities: new Map([['4', new Set(opts.worldCapabilities ?? []) as any]]),
    accountLookupKeys: ['eldra-account-1']
  }
}

const platformAdmin = () => principal({ platformCapabilities: ['platform.character.manage'] })
const gm = () => principal({ worldCapabilities: ['world.read', 'world.character.edit_any', 'world.npc.manage'] })
const player = () => principal({ worldCapabilities: ['world.read', 'world.character.create', 'world.character.edit_own'] })

function fakeEvent(p: Principal | null): H3Event {
  return { context: { principal: p, params: { id: '4', characterId: '1645' } } } as unknown as H3Event
}

function fakePlan(entityType = 'pc') {
  return { worldId: '4', entityId: '1645', title: 'Borc', entityType, sheets: { count: 0, ids: [] } }
}

beforeEach(() => {
  planCharacterDeletionMock.mockReset()
  executeCharacterDeletionMock.mockReset()
  planCharacterDeletionMock.mockResolvedValue(fakePlan())
  executeCharacterDeletionMock.mockResolvedValue({ plan: fakePlan() })
})

describe('GET deletion-impact', () => {
  it('401s with no principal', async () => {
    await expect(deletionImpactHandler(fakeEvent(null))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('403s for an ordinary Player', async () => {
    await expect(deletionImpactHandler(fakeEvent(player()))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows a Platform Admin with no World role at all', async () => {
    const result = await deletionImpactHandler(fakeEvent(platformAdmin()))
    expect(result.plan).toBeDefined()
  })

  it('allows an ordinary GM/Owner (pre-existing path, unchanged)', async () => {
    const result = await deletionImpactHandler(fakeEvent(gm()))
    expect(result.plan).toBeDefined()
  })
})

describe('DELETE character', () => {
  it('401s with no principal', async () => {
    await expect(deleteHandler(fakeEvent(null))).rejects.toMatchObject({ statusCode: 401 })
    expect(executeCharacterDeletionMock).not.toHaveBeenCalled()
  })

  // THE CORE REQUIREMENT: an ordinary Player cannot delete another
  // account's character (or their own) through this route.
  it('403s for an ordinary Player', async () => {
    await expect(deleteHandler(fakeEvent(player()))).rejects.toMatchObject({ statusCode: 403 })
    expect(executeCharacterDeletionMock).not.toHaveBeenCalled()
  })

  it('a Platform Admin with NO World membership at all can still delete -- the whole point of the platform-scoped capability', async () => {
    const result = await deleteHandler(fakeEvent(platformAdmin()))
    expect(result.success).toBe(true)
    expect(executeCharacterDeletionMock).toHaveBeenCalled()
  })

  it('the pre-existing GM path (world.character.edit_any) still works, unchanged', async () => {
    const result = await deleteHandler(fakeEvent(gm()))
    expect(result.success).toBe(true)
  })

  it('an ordinary GM without platform.character.manage, lacking edit_any for an NPC, still needs world.npc.manage specifically', async () => {
    planCharacterDeletionMock.mockResolvedValue(fakePlan('npc'))
    const gmWithOnlyEditAny = principal({ worldCapabilities: ['world.read', 'world.character.edit_any'] })

    await expect(deleteHandler(fakeEvent(gmWithOnlyEditAny))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('a GM holding world.npc.manage can delete an NPC-typed character', async () => {
    planCharacterDeletionMock.mockResolvedValue(fakePlan('npc'))
    const npcManager = principal({ worldCapabilities: ['world.read', 'world.npc.manage'] })

    const result = await deleteHandler(fakeEvent(npcManager))
    expect(result.success).toBe(true)
  })

  it('a Platform Admin can delete an NPC too -- the platform override does not care about entity type', async () => {
    planCharacterDeletionMock.mockResolvedValue(fakePlan('npc'))

    const result = await deleteHandler(fakeEvent(platformAdmin()))
    expect(result.success).toBe(true)
  })

  it('executes the SAME plan authorization decided from -- no second dependency scan', async () => {
    const plan = fakePlan()
    planCharacterDeletionMock.mockResolvedValue(plan)
    executeCharacterDeletionMock.mockResolvedValue({ plan })

    await deleteHandler(fakeEvent(platformAdmin()))

    expect(planCharacterDeletionMock).toHaveBeenCalledTimes(1)
    expect(executeCharacterDeletionMock).toHaveBeenCalledWith(plan)
  })

  it('returns the impact summary alongside success', async () => {
    const plan = fakePlan()
    executeCharacterDeletionMock.mockResolvedValue({ plan })

    const result = await deleteHandler(fakeEvent(gm()))

    expect(result.impact).toBe(plan)
    expect(result.id).toBe('1645')
  })
})
