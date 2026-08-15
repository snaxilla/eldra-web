// World <-> Content Pack Binding persistence.
// See scripts/directus/create-world-content-pack-bindings-schema.mjs
// (collection `world_content_pack_bindings`) and this task's DESIGN GOAL:
// "The design should support multiple Content Packs per World in the
// future." Unlike world_rules_config (server/utils/world-rules-config.ts,
// one row per World holding a single active_package_id/version), this
// collection is a join table -- one row per (world_id, package_id) --
// mirroring world_memberships.ts's multi-row-per-world persistence shape
// rather than world_rules_config.ts's single-row shape.
//
// Storage only. Nothing here calls loadPublishedContentPack or verifies a
// binding target resolves to a real, published Content Pack -- that
// verification is world-content-pack-binding.ts's job, mirroring the split
// between world-rules-config.ts (storage) and world-rules-activation.ts
// (verify + write).
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. `directusServiceRequest` (./directus), never a local dxFetch -- same
//    convention every module in this milestone follows.
//
// 2. At most one binding row per (world_id, package_id) is an
//    APPLICATION-level invariant (not a database constraint -- Directus's
//    Fields API has no composite-unique primitive; see the schema
//    script's own note), enforced the same way world-memberships.ts's
//    membershipExists guards its writes. saveContentPackBinding upserts:
//    an existing binding for (worldId, packageId) is repinned in place
//    (new version/integrity), never duplicated.
//
// 3. A World may hold MANY bindings, one per distinct package_id -- this
//    is the entire reason this collection is not shaped like
//    world_rules_config. listContentPackBindingsForWorld returns all of
//    them; there is no single "the" binding for a World the way there is
//    a single "active" rules package.
//
// 4. `package_version`/`package_integrity` are the World's PINNED
//    reference (rules-package-infrastructure.md §B.6's reasoning, carried
//    over unchanged): never a row id, never an embedded content copy.
//
// 5. Absence of a binding is `null`/`false`, never an error and never a
//    fabricated default -- world-configuration.md §3.3's "absence is
//    legal" posture, generalized to one-binding-among-many.

import { directusServiceRequest } from './directus'

const COLLECTION = 'world_content_pack_bindings'

export type WorldContentPackBindingRecord = {
  id: string
  worldId: string
  packageId: string
  packageVersion: string
  packageIntegrity: string | null
  createdAt: string | null
  updatedAt: string | null
}

const BINDING_FIELDS = 'id,world_id,package_id,package_version,package_integrity,created_at,updated_at'

function normalizeBinding(row: any): WorldContentPackBindingRecord {
  return {
    id: String(row?.id ?? ''),
    worldId: String(row?.world_id ?? ''),
    packageId: String(row?.package_id ?? ''),
    packageVersion: String(row?.package_version ?? ''),
    packageIntegrity: row?.package_integrity ?? null,
    createdAt: row?.created_at ?? null,
    updatedAt: row?.updated_at ?? null
  }
}

// worlds.id is a Directus integer primary key -- same verified fact
// world-rules-config.ts and world-memberships.ts already coerce against.
function coerceWorldId(worldId: string | number): number {
  return Number(worldId)
}

// Every Content Pack binding for a World -- design decision 3. Ordered by
// package_id for a stable listing, matching listPublishedContentPacks'
// own sort.
export async function listContentPackBindingsForWorld(
  worldId: string | number
): Promise<WorldContentPackBindingRecord[]> {
  const res: any = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'GET',
    query: {
      filter: { world_id: { _eq: coerceWorldId(worldId) } },
      sort: ['package_id'],
      limit: -1,
      fields: BINDING_FIELDS
    }
  })

  return Array.isArray(res?.data) ? res.data.map(normalizeBinding) : []
}

// The one binding (if any) a World holds for a specific packageId. `null`
// is a legal, meaningful "not bound" result, never an error -- see design
// decision 5.
export async function findContentPackBinding(
  worldId: string | number,
  packageId: string
): Promise<WorldContentPackBindingRecord | null> {
  const res: any = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { world_id: { _eq: coerceWorldId(worldId) } },
          { package_id: { _eq: packageId } }
        ]
      },
      limit: 1,
      fields: BINDING_FIELDS
    }
  })

  const row = Array.isArray(res?.data) ? res.data[0] : null
  return row ? normalizeBinding(row) : null
}

export type ContentPackBindingInput = {
  version: string
  integrity: string | null
}

// Creates or repins a binding for (worldId, packageId) -- design decision
// 2. Never creates a second row for the same (worldId, packageId); an
// existing binding is updated in place (new package_version/
// package_integrity), exactly as saveWorldRulesConfig updates
// active_package_version in place on repin.
export async function saveContentPackBinding(
  worldId: string | number,
  packageId: string,
  input: ContentPackBindingInput
): Promise<WorldContentPackBindingRecord> {
  const existing = await findContentPackBinding(worldId, packageId)
  const now = new Date().toISOString()

  if (existing) {
    const res: any = await directusServiceRequest(`/items/${COLLECTION}/${existing.id}`, {
      method: 'PATCH',
      body: {
        package_version: input.version,
        package_integrity: input.integrity,
        updated_at: now
      }
    })

    return normalizeBinding(res?.data ?? { ...existing, package_version: input.version, package_integrity: input.integrity })
  }

  const res: any = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'POST',
    body: {
      world_id: coerceWorldId(worldId),
      package_id: packageId,
      package_version: input.version,
      package_integrity: input.integrity,
      created_at: now,
      updated_at: now
    }
  })

  return normalizeBinding(res?.data ?? {})
}

// Removes a World's binding to a Content Pack, if one exists. Returns
// whether a binding was actually removed (`false` for "was never bound",
// never an error) -- unbinding an already-unbound pack is a no-op, not a
// failure.
export async function removeContentPackBinding(
  worldId: string | number,
  packageId: string
): Promise<boolean> {
  const existing = await findContentPackBinding(worldId, packageId)
  if (!existing) {
    return false
  }

  await directusServiceRequest(`/items/${COLLECTION}/${existing.id}`, {
    method: 'DELETE'
  })

  return true
}
