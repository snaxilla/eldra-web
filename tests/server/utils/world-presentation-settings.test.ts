// Unit tests for World Presentation Settings persistence
// (server/utils/world-presentation-settings.ts, Theming Architecture
// Phase 2). Directus is mocked at the module boundary, and `createError`
// is stubbed, exactly as tests/server/utils/world-rules-config.test.ts does.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

;(globalThis as any).createError = (input: { statusCode: number; statusMessage?: string; data?: unknown }) => {
  const error = new Error(input.statusMessage || `Error ${input.statusCode}`) as Error & {
    statusCode: number
    statusMessage?: string
    data?: unknown
  }
  error.statusCode = input.statusCode
  error.statusMessage = input.statusMessage
  error.data = input.data
  return error
}

import {
  loadWorldPresentationSettings,
  parseWorldPresentationSettingsPatch,
  saveWorldPresentationSettings
} from '../../../server/utils/world-presentation-settings'

type FakeRow = Record<string, any>

function createFakeDirectusStore(initialRows: FakeRow[] = []) {
  const rows: FakeRow[] = initialRows.map((row) => ({ ...row }))
  let nextId = 100

  directusServiceRequestMock.mockImplementation(async (path: string, options: any = {}) => {
    const method = options.method || 'GET'
    expect(path.startsWith('/items/world_presentation_settings')).toBe(true)

    if (method === 'GET') {
      const worldId = options.query?.filter?.world_id?._eq
      return { data: rows.filter((row) => row.world_id === worldId).slice(0, options.query?.limit ?? undefined) }
    }

    if (method === 'POST') {
      const row = { id: nextId++, ...options.body }
      rows.push(row)
      return { data: row }
    }

    if (method === 'PATCH') {
      const id = Number(path.split('/').pop())
      const row = rows.find((candidate) => candidate.id === id)
      Object.assign(row!, options.body)
      return { data: row }
    }

    throw new Error(`unexpected ${method} ${path}`)
  })

  return rows
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
})

describe('loadWorldPresentationSettings', () => {
  it('returns an empty selection (platform default) when the World has no row', async () => {
    createFakeDirectusStore()
    expect(await loadWorldPresentationSettings('7')).toEqual({ worldId: '7', themeKey: null, themeOptions: {} })
  })

  it('queries by integer world_id', async () => {
    createFakeDirectusStore()
    await loadWorldPresentationSettings('7')
    expect(directusServiceRequestMock.mock.calls[0]![1].query.filter.world_id._eq).toBe(7)
  })

  it('normalizes a stored row, including JSON stored as a string', async () => {
    createFakeDirectusStore([
      { id: 1, world_id: 7, theme_key: 'fantasy', theme_options: '{"panelOpacity":0.7,"panelBlur":4}' }
    ])
    expect(await loadWorldPresentationSettings(7)).toEqual({
      worldId: '7',
      themeKey: 'fantasy',
      themeOptions: { panelOpacity: 0.7, panelBlur: 4 }
    })
  })

  it('reads an unknown stored theme key and invalid options as platform default', async () => {
    createFakeDirectusStore([
      { id: 1, world_id: 7, theme_key: 'deleted-theme', theme_options: '{not json' }
    ])
    expect(await loadWorldPresentationSettings(7)).toEqual({ worldId: '7', themeKey: null, themeOptions: {} })
  })

  it('re-throws a Directus failure as a labeled 502, never as "no row"', async () => {
    directusServiceRequestMock.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    await expect(loadWorldPresentationSettings(7)).rejects.toMatchObject({
      statusCode: 502,
      data: { collection: 'world_presentation_settings', upstreamStatus: 403 }
    })
  })
})

describe('parseWorldPresentationSettingsPatch', () => {
  it('accepts a known theme key and sanitizes options', () => {
    expect(parseWorldPresentationSettingsPatch({
      themeKey: 'fantasy',
      themeOptions: { panelOpacity: 0.1, extra: true }
    })).toEqual({ themeKey: 'fantasy', themeOptions: { panelOpacity: 0.55 } })
  })

  it('treats null/empty theme key as "use platform default"', () => {
    expect(parseWorldPresentationSettingsPatch({ themeKey: null })).toEqual({ themeKey: null })
    expect(parseWorldPresentationSettingsPatch({ themeKey: '' })).toEqual({ themeKey: null })
  })

  it('rejects an unknown theme key with 400 instead of silently defaulting', () => {
    expect(() => parseWorldPresentationSettingsPatch({ themeKey: 'cyberpunk' })).toThrowError(
      expect.objectContaining({ statusCode: 400 })
    )
  })

  it('returns an empty patch for a missing or malformed body', () => {
    expect(parseWorldPresentationSettingsPatch(undefined)).toEqual({})
    expect(parseWorldPresentationSettingsPatch('fantasy')).toEqual({})
  })
})

describe('saveWorldPresentationSettings', () => {
  it('creates the World row on first save', async () => {
    const rows = createFakeDirectusStore()
    const saved = await saveWorldPresentationSettings('7', { themeKey: 'fantasy', themeOptions: { panelBlur: 6 } })

    expect(saved).toEqual({ worldId: '7', themeKey: 'fantasy', themeOptions: { panelBlur: 6 } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ world_id: 7, theme_key: 'fantasy', theme_options: { panelBlur: 6 } })
    expect(rows[0]!.created_at).toBeTruthy()
  })

  it('updates the existing row in place (one row per World) and keeps omitted fields', async () => {
    const rows = createFakeDirectusStore([
      { id: 1, world_id: 7, theme_key: 'fantasy', theme_options: { panelBlur: 6 } }
    ])

    const saved = await saveWorldPresentationSettings(7, { themeOptions: { panelOpacity: 0.9 } })

    expect(rows).toHaveLength(1)
    expect(saved).toEqual({ worldId: '7', themeKey: 'fantasy', themeOptions: { panelOpacity: 0.9 } })

    const cleared = await saveWorldPresentationSettings(7, { themeKey: null })
    expect(rows).toHaveLength(1)
    expect(cleared).toEqual({ worldId: '7', themeKey: null, themeOptions: { panelOpacity: 0.9 } })
  })

  it('never persists out-of-range options even if the caller skips parsing', async () => {
    const rows = createFakeDirectusStore()
    await saveWorldPresentationSettings(7, { themeOptions: { panelOpacity: -5, panelBlur: 900 } })
    expect(rows[0]!.theme_options).toEqual({ panelOpacity: 0.55, panelBlur: 24 })
  })
})
