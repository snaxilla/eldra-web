// World Rules Configuration persistence.
// See .github/docs/architecture/rules-package-infrastructure.md §4.2/§4.3
// ("world_rules_config"), world-configuration.md §3.3 ("Absence is a
// legal, meaningful state") and §5.2/§6.5, and app/lib/rules/types.ts's
// StoredWorldRulesConfig for the design this implements.
//
// Storage only. loadWorldRulesConfig/saveWorldRulesConfig translate between
// the world_rules_config Directus row and StoredWorldRulesConfig
// (app/lib/rules/types.ts, an already-shipped Rules Engine type this
// module does not modify) plus the one row-only field the persistence
// layer alone needs. This module performs NO I/O beyond Directus, NEVER
// imports or calls createWorldRuntime/loadPublishedPackage, NEVER activates
// a package, and NEVER validates that an activePackageId/activePackageVersion
// pair actually resolves to a real, published package -- it stores
// whatever shape it is given and reports back exactly what is stored.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. `directusServiceRequest` (./directus), never a local dxFetch --
//    matches server/utils/rules-packages.ts's own precedent and the
//    architecture's explicit instruction (rules-package-infrastructure.md
//    §2.7/§21): world config reads happen during roll execution, where
//    there may be no user session to forward.
//
// 2. `activePackageIntegrity` is deliberately NOT added to
//    StoredWorldRulesConfig (app/lib/rules/types.ts). That type is the
//    already-approved, already-shipped Rules Engine contract, and this
//    commit's own instructions forbid changing Rules Engine runtime files.
//    The architecture itself says the extra column is a persistence-layer
//    addition, not a type-contract one (rules-package-infrastructure.md
//    §4.2: "These columns are exactly StoredWorldRulesConfig ... plus the
//    integrity witness and timestamps -- deliberately, so the translation
//    module is a field rename and nothing more"). `WorldRulesConfigRecord`
//    below is that one-field superset, defined here at the storage
//    boundary -- the same category of decision
//    server/utils/rules-packages.ts already made for `LoadedRulesPackage`
//    (a superset of the pure `RulesPackageManifest`).
//
// 3. Absence of a row is `null`, never an error, never a fabricated
//    default (world-configuration.md §3.3). `loadWorldRulesConfig` never
//    invents a StoredWorldRulesConfig for a world that has none, and
//    `saveWorldRulesConfig` never silently synthesizes
//    activePackageId/activePackageVersion when creating a brand-new row --
//    both are required to create one, and their absence on a first save is
//    a thrown error, not a filled-in guess (FAILURE MODEL: "Do not
//    silently fabricate rows. Do not silently create defaults.").
//
// 4. `world_config_version` increments on every save, unconditionally --
//    rules-package-infrastructure.md §K.6/§21's data model: "default 1;
//    incremented on every write." A brand-new row starts at 1 (the write
//    that creates it is itself the first configuration change from
//    "unconfigured"). Callers never supply a version; this module computes
//    it from the existing row (or its absence) every time.
//
// 5. `saveWorldRulesConfig` is a genuine partial patch, not a full
//    replace: an omitted field on an existing row keeps its stored value
//    (world-configuration.md §6.5's own sketch: `patch:
//    Partial<StoredWorldRulesConfig>`). This lets a later, not-yet-built
//    activation endpoint update only `activePackage*` and a later
//    settings-editing endpoint update only `settings`, without either one
//    needing to first read-modify-write the other's fields.
//
// 6. No validation, no activation, no runtime construction: this module
//    does not check that `activePackageId`/`activePackageVersion` resolve
//    to any real `rules_packages` row, does not call
//    `loadPublishedPackage`, and does not call `createWorldRuntime`. That
//    is explicitly a later commit's job (activation).

import { directusServiceRequest } from './directus'
import type { StoredWorldRulesConfig, WorldRollTypeOverride } from '../../app/lib/rules/types'

const COLLECTION = 'world_rules_config'

// See design decision 2: the one field the persistence layer carries
// alongside the pure StoredWorldRulesConfig contract.
export type WorldRulesConfigRecord = StoredWorldRulesConfig & {
  activePackageIntegrity: string | null
}

// A save never supplies `worldId` (the function's own first parameter) or
// `worldConfigVersion` (computed internally -- design decision 4).
export type WorldRulesConfigPatch = Partial<Omit<WorldRulesConfigRecord, 'worldId' | 'worldConfigVersion'>>

// ---------------------------------------------------------------------------
// Row <-> in-memory translation
// ---------------------------------------------------------------------------

function parseJsonObject<T extends object>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return fallback
    try {
      const parsed = JSON.parse(trimmed)
      return parsed && typeof parsed === 'object' ? (parsed as T) : fallback
    } catch {
      return fallback
    }
  }

  return typeof value === 'object' ? (value as T) : fallback
}

function normalizeRow(row: any): WorldRulesConfigRecord {
  return {
    worldId: String(row.world_id),
    activePackageId: String(row.active_package_id),
    activePackageVersion: String(row.active_package_version),
    activePackageIntegrity: row.active_package_integrity ?? null,
    worldConfigVersion: Number(row.world_config_version),
    settings: parseJsonObject<StoredWorldRulesConfig['settings']>(row.settings, {}),
    rollTypes: parseJsonObject<Record<string, WorldRollTypeOverride>>(row.roll_types, {})
  }
}

// worlds.id is a Directus integer primary key (verified live against the
// production instance for this commit -- see the commit Summary). Every
// other world-scoped collection in this codebase (character_sheets,
// entity_relationships) already coerces the same way.
function coerceWorldId(worldId: string | number): number {
  return Number(worldId)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Blocker fix (Forbidden on GET /rules/summary): a Directus REQUEST
// failure (network error, permission denial, or -- the actual case found
// live -- a collection Directus does not recognize at all) must never be
// read the same way as "the query succeeded and matched zero rows."
//
// Verified against the deployed instance: Directus returns HTTP 403
// `{"errors":[{"message":"You don't have permission to access
// this.","extensions":{"code":"FORBIDDEN"}}]}` for ANY collection name it
// does not recognize -- confirmed identical for a deliberately-nonexistent
// collection name, even under a full-admin service token. It is not a
// distinguishable "not found"; Directus deliberately does not reveal
// whether an unrecognized name is unpermitted or simply does not exist,
// to avoid collection-name enumeration. `directusServiceRequest` (a bare
// `$fetch`) throws for this, uncaught, with `statusMessage: 'Forbidden'`
// -- and until this fix, nothing between here and the HTTP response caught
// it, so that exact upstream 403 reached the browser verbatim, reading as
// "you are forbidden" when the true cause is an upstream access/
// provisioning failure with nothing to do with the calling user's
// authorization.
//
// This function's contract (`loadWorldRulesConfig` returns `null` only
// for a genuinely absent row) must stay intact, so a thrown request error
// is re-thrown as a distinctly labeled, honest error rather than
// swallowed into `null` -- collapsing it into "unconfigured" would hide a
// real infrastructure failure behind the World's normal, silent, correct
// steady state, forever. It is also not rethrown as the raw upstream 403:
// that status code describes the caller's own authorization, and the
// caller here (our own service token, reading its own collection) is not
// who is unauthorized. 502 names what actually happened: an upstream
// dependency this request needed failed.
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
      statusMessage: 'World Rules Configuration is unavailable',
      data: { collection: COLLECTION, upstreamStatus, upstreamMessage }
    })
  }

  const rows = Array.isArray(res?.data) ? res.data : []
  return rows[0] ?? null
}

// Returns `null` when the World has no configuration -- a legal, meaningful
// state (world-configuration.md §3.3), never an error and never a
// fabricated default.
export async function loadWorldRulesConfig(worldId: string | number): Promise<WorldRulesConfigRecord | null> {
  const row = await findRawRow(worldId)
  return row ? normalizeRow(row) : null
}

// Creates or updates the one world_rules_config row for `worldId`.
// world_config_version always increments (design decision 4); every other
// field is a partial patch over whatever already exists (design decision
// 5). Creating a row that does not yet exist REQUIRES
// activePackageId/activePackageVersion in `patch` -- there is no default
// to fall back to, and none is invented.
export async function saveWorldRulesConfig(
  worldId: string | number,
  patch: WorldRulesConfigPatch
): Promise<WorldRulesConfigRecord> {
  const existingRow = await findRawRow(worldId)

  if (!existingRow && (patch.activePackageId === undefined || patch.activePackageVersion === undefined)) {
    throw new Error(
      'saveWorldRulesConfig: creating a new world_rules_config row requires both activePackageId and activePackageVersion'
    )
  }

  const nextVersion = existingRow ? Number(existingRow.world_config_version) + 1 : 1
  const now = new Date().toISOString()

  const body = {
    world_id: coerceWorldId(worldId),
    active_package_id: patch.activePackageId ?? existingRow?.active_package_id,
    active_package_version: patch.activePackageVersion ?? existingRow?.active_package_version,
    active_package_integrity:
      patch.activePackageIntegrity !== undefined ? patch.activePackageIntegrity : (existingRow?.active_package_integrity ?? null),
    world_config_version: nextVersion,
    settings: patch.settings ?? parseJsonObject(existingRow?.settings, {}),
    roll_types: patch.rollTypes ?? parseJsonObject(existingRow?.roll_types, {}),
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

  const savedRow = res?.data ?? res
  return normalizeRow(savedRow)
}
