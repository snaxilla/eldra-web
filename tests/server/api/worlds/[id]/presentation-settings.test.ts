// Route tests for GET/PATCH /api/worlds/:id/presentation-settings (Theming
// Architecture, Phase 2). requireCapability/can run for REAL so these prove
// the routes are wired to the authorization module: every World member may
// read the theme, only `world.settings.edit` may change it. Persistence is
// mocked (covered by tests/server/utils/world-presentation-settings.test.ts).

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loadMock, saveMock } = vi.hoisted(() => ({
  loadMock: vi.fn(),
  saveMock: vi.fn()
}))

vi.mock('../../../../../server/utils/world-presentation-settings', async () => {
  const actual = await vi.importActual<any>('../../../../../server/utils/world-presentation-settings')
  return {
    ...actual,
    loadWorldPresentationSettings: loadMock,
    saveWorldPresentationSettings: saveMock
  }
})

// These routes use Nitro auto-imports (like presentation/[pageKey].*.ts),
// which do not exist under plain Vitest; stub them with h3's observable
// contract.
vi.hoisted(() => Object.assign(globalThis as any, {
  defineEventHandler: (handler: any) => handler,
  getRouterParam: (event: any, name: string) => event.context.params?.[name],
  readBody: async (event: any) => event._requestBody,
  createError: (input: { statusCode: number; statusMessage?: string }) =>
    Object.assign(new Error(input.statusMessage || `Error ${input.statusCode}`), input)
}))

// server/utils/authorization.ts imports createError from 'h3'. Provide it
// directly so this test does not depend on h3 being resolvable from tests/
// (it is a transitive dependency, not a direct one).
vi.mock('h3', () => ({
  createError: (globalThis as any).createError
}))

import getHandler from '../../../../../server/api/worlds/[id]/presentation-settings.get'
import patchHandler from '../../../../../server/api/worlds/[id]/presentation-settings.patch'
import type { Principal } from '../../../../../server/utils/authorization'

function principal(worldId: string, caps: string[]): Principal {
  return {
    accountId: 'account-1',
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(caps as any)]]),
    temporarySingleUserMode: false
  }
}

function fakeEvent(worldId: string, p: Principal | null, body?: unknown): any {
  return { context: { principal: p, params: { id: worldId } }, _requestBody: body }
}

const gm = principal('5', ['world.read', 'world.settings.edit'])
const player = principal('5', ['world.read', 'world.roll.execute'])

beforeEach(() => {
  loadMock.mockReset().mockResolvedValue({ worldId: '5', themeKey: 'fantasy', themeOptions: {} })
  saveMock.mockReset().mockImplementation(async (worldId: string, patch: any) => ({ worldId, themeKey: null, themeOptions: {}, ...patch }))
})

describe('GET /api/worlds/:id/presentation-settings', () => {
  it('lets a Player read the World theme (players inherit it)', async () => {
    await expect(getHandler(fakeEvent('5', player))).resolves.toMatchObject({ themeKey: 'fantasy' })
  })

  it('401s without a principal and 403s for a non-member', async () => {
    await expect(getHandler(fakeEvent('5', null))).rejects.toMatchObject({ statusCode: 401 })
    await expect(getHandler(fakeEvent('5', principal('9', ['world.read'])))).rejects.toMatchObject({ statusCode: 403 })
    expect(loadMock).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/worlds/:id/presentation-settings', () => {
  it('lets the GM (world.settings.edit) save a theme', async () => {
    const result = await patchHandler(fakeEvent('5', gm, { themeKey: 'fantasy', themeOptions: { panelBlur: 4 } }))
    expect(saveMock).toHaveBeenCalledWith('5', { themeKey: 'fantasy', themeOptions: { panelBlur: 4 } })
    expect(result).toMatchObject({ themeKey: 'fantasy' })
  })

  it('forbids a Player from changing the World theme', async () => {
    await expect(patchHandler(fakeEvent('5', player, { themeKey: 'fantasy' }))).rejects.toMatchObject({ statusCode: 403 })
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('rejects an unknown theme key with 400 and writes nothing', async () => {
    await expect(patchHandler(fakeEvent('5', gm, { themeKey: 'nope' }))).rejects.toMatchObject({ statusCode: 400 })
    expect(saveMock).not.toHaveBeenCalled()
  })
})
