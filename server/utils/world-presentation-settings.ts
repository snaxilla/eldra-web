// World Presentation Settings persistence (Theming Architecture, Phase 2).
// See .github/docs/architecture/theming.md.
//
// One `world_presentation_settings` row per World holding the GM-selected
// theme (`theme_key`) and its tuning (`theme_options`). Schema:
// scripts/directus/create-world-presentation-settings-schema.mjs.
//
// Design decisions:
//
// 1. Absence is legal: no row means "inherit the platform default theme".
//    `loadWorldPresentationSettings` returns the sanitized empty selection
//    for it, never an error.
//
// 2. Everything crossing this boundary is sanitized through the shared,
//    pure app/lib/eldra/themes.ts helpers -- in both directions. An unknown
//    stored theme key (e.g. a theme later removed from the registry) reads
//    back as `null` (platform default) instead of breaking the workspace,
//    and a write can never persist a key or option the registry rejects.
//
// 3. A Directus request failure is NOT "no row". Like
//    world-rules-config.ts's findRawRow, it is re-thrown as a labeled 502
//    (an unprovisioned collection reads as a Directus 403 for the service
//    token, which would otherwise surface as "you are forbidden"). The
//    world layout treats a failed fetch as "platform default" on its own.
//
// 4. Separate from `world_page_presentations` (per-page background/mode,
//    presentation/[pageKey].*.ts), which this module never reads or writes.

import { directusServiceRequest } from './directus'
import {
  isKnownThemeKey,
  sanitizeThemeOptions,
  sanitizeWorldThemeSelection,
  type EldraWorldThemeSelection
} from '../../app/lib/eldra/themes'

const COLLECTION = 'world_presentation_settings'

export type WorldPresentationSettings = EldraWorldThemeSelection & {
  worldId: string
}

export type WorldPresentationSettingsPatch = {
  themeKey?: string | null
  themeOptions?: unknown
}

function parseJsonObject(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function normalizeRow(worldId: string | number, row: any | null): WorldPresentationSettings {
  const selection = sanitizeWorldThemeSelection({
    themeKey: row?.theme_key ?? null,
    themeOptions: parseJsonObject(row?.theme_options)
  })
  return { worldId: String(worldId), ...selection }
}

function coerceWorldId(worldId: string | number): number {
  return Number(worldId)
}

async function findRawRow(worldId: string | number): Promise<any | null> {
  let res: any
  try {
    res = await directusServiceRequest(`/items/${COLLECTION}`, {
      method: 'GET',
      query: {
        filter: { world_id: { _eq: coerceWorldId(worldId) } },
        limit: 1,
        fields: '*'
      }
    })
  } catch (error: any) {
    const upstreamStatus = error?.statusCode ?? error?.status ?? error?.response?.status ?? null
    const upstreamMessage =
      error?.data?.errors?.[0]?.message ?? error?.statusMessage ?? error?.message ?? String(error)

    throw createError({
      statusCode: 502,
      statusMessage: 'World Presentation Settings are unavailable',
      data: { collection: COLLECTION, upstreamStatus, upstreamMessage }
    })
  }

  const rows = Array.isArray(res?.data) ? res.data : []
  return rows[0] ?? null
}

export async function loadWorldPresentationSettings(worldId: string | number): Promise<WorldPresentationSettings> {
  return normalizeRow(worldId, await findRawRow(worldId))
}

// Validates a request body into a patch. Throws 400 for a theme key the
// registry does not know -- unlike reads, a write must not silently turn a
// typo into "platform default".
export function parseWorldPresentationSettingsPatch(body: unknown): WorldPresentationSettingsPatch {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  const patch: WorldPresentationSettingsPatch = {}

  if (source.themeKey !== undefined) {
    if (source.themeKey === null || source.themeKey === '') {
      patch.themeKey = null
    } else if (isKnownThemeKey(source.themeKey)) {
      patch.themeKey = source.themeKey
    } else {
      throw createError({ statusCode: 400, statusMessage: `Unknown theme '${String(source.themeKey)}'` })
    }
  }

  if (source.themeOptions !== undefined) {
    patch.themeOptions = sanitizeThemeOptions(source.themeOptions)
  }

  return patch
}

// Creates or updates the World's single row. Omitted fields keep their
// stored value (partial patch, same contract as saveWorldRulesConfig).
export async function saveWorldPresentationSettings(
  worldId: string | number,
  patch: WorldPresentationSettingsPatch
): Promise<WorldPresentationSettings> {
  const existingRow = await findRawRow(worldId)
  const existing = normalizeRow(worldId, existingRow)
  const now = new Date().toISOString()

  const body = {
    world_id: coerceWorldId(worldId),
    theme_key: patch.themeKey !== undefined ? patch.themeKey : existing.themeKey,
    theme_options: patch.themeOptions !== undefined ? sanitizeThemeOptions(patch.themeOptions) : existing.themeOptions,
    updated_at: now
  }

  const res: any = existingRow
    ? await directusServiceRequest(`/items/${COLLECTION}/${existingRow.id}`, {
        method: 'PATCH',
        body
      })
    : await directusServiceRequest(`/items/${COLLECTION}`, {
        method: 'POST',
        body: { ...body, created_at: now }
      })

  return normalizeRow(worldId, res?.data ?? res)
}
