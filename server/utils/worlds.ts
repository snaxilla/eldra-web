// Eldra World creation -- .github/docs/architecture/ownership-and-permissions.md
// (Revision 2) §5.3/§10.1/§12 Phase 0. Worlds have historically been
// created directly in the Directus admin UI -- the architecture doc's own
// audit found no POST /api/worlds route at all (§2.5). This module is what
// makes World creation an Eldra use case instead of a Directus one; it is
// called from server/api/worlds/index.post.ts, which stays a thin route
// per this codebase's established server/api -> server/utils split.
//
// TEMPORARY OWNERSHIP (architecture doc §12 Phase 0, §10.1): there is no
// WorldMembership collection yet, so ownership is recorded the only way
// the current schema supports -- the existing, previously-unpopulated
// `worlds.owner_id` column (§2.5: "never written... the one existing world
// has owner_id: null"), set to the creating Principal's accountId. This is
// deliberately the SAME column Phase 2's real Membership model will read
// to seed the first 'owner' row per world, so nothing about this decision
// needs to be undone later, only supplemented -- exactly the "make
// replacing the temporary owner model straightforward" requirement this
// task was given.
//
// Rules Platform: NOT touched. No `world_rules_config` row is created here
// -- absence is a legal, unconfigured state by that system's own design
// (world-configuration.md §3.3), and creating one preemptively here would
// be exactly the scope creep this task's NON-GOALS forbid.

import { directusServiceRequest } from './directus'
import { slugify } from './entity-factory'

export type WorldVisibility = 'private' | 'public'

export type WorldRecord = {
  id: string | number
  name: string
  slug: string
  system_key: string
  systemKey: string
  description: string
  visibility: string
  owner_id: string | null
  banner_image_url: string | null
  sidebar_image_url: string | null
}

// The only game system this codebase implements today (architecture doc
// §2.6: "every importer hardcodes systemKey: 'dnd5e'"). A caller may
// override it; this is the default for the common case, not an assumption
// baked into the write itself -- `system_key` remains the pluggable
// extension point CLAUDE.md describes.
const DEFAULT_SYSTEM_KEY = 'dnd5e'
const DEFAULT_VISIBILITY: WorldVisibility = 'private'

const WORLD_FIELDS = 'id,name,slug,system_key,description,visibility,owner_id'

// Shared by both GET /api/worlds and POST /api/worlds (server/api/worlds/index.get.ts
// imports this too) so the two never drift into two different ideas of
// what a World looks like on the wire.
export function normalizeWorld(row: any): WorldRecord {
  return {
    id: row.id,
    name: row.name || 'Untitled World',
    slug: row.slug || '',
    system_key: row.system_key || row.systemKey || '',
    systemKey: row.system_key || row.systemKey || '',
    description: row.description || '',
    visibility: row.visibility || 'private',
    owner_id: row.owner_id ?? null,
    banner_image_url: null,
    sidebar_image_url: null
  }
}

async function worldSlugExists(slug: string): Promise<boolean> {
  const res = await directusServiceRequest('/items/worlds', {
    method: 'GET',
    query: {
      filter: { slug: { _eq: slug } },
      limit: 1,
      fields: 'id'
    }
  })

  return Array.isArray(res?.data) && res.data.length > 0
}

// World slugs are unique across the WHOLE `worlds` collection (schema:
// `is_unique: true` on `slug`, with no per-scope qualifier) -- unlike
// entity slugs, which are only unique per-world
// (server/utils/homebrew/index.ts's uniqueEntitySlug). This mirrors that
// function's shape (base -> -2 -> -3 ... on collision) without a worldId
// argument, since there is no narrower scope to check against.
async function uniqueWorldSlug(baseName: string): Promise<string> {
  const base = slugify(baseName) || 'world'
  let candidate = base
  let index = 2

  while (await worldSlugExists(candidate)) {
    candidate = `${base}-${index}`
    index++
  }

  return candidate
}

export type CreateWorldInput = {
  name: string
  description?: string | null
  systemKey?: string | null
  visibility?: string | null
  // The Principal creating the World -- see TEMPORARY OWNERSHIP above.
  ownerAccountId: string
}

// Validation of `name` (required, non-empty) is the route handler's job,
// matching this codebase's established convention (e.g.
// server/api/worlds/[id]/timelines/index.post.ts validates `title` before
// ever reaching its own persistence call) -- this function assumes a
// trimmed, non-empty name and focuses on the creation + defaulting logic
// itself.
export async function createWorld(input: CreateWorldInput): Promise<WorldRecord> {
  const name = input.name.trim()
  const slug = await uniqueWorldSlug(name)
  const systemKey = input.systemKey?.trim() || DEFAULT_SYSTEM_KEY
  const visibility: WorldVisibility = input.visibility === 'public' ? 'public' : DEFAULT_VISIBILITY
  const description = input.description?.trim() || null

  const res = await directusServiceRequest('/items/worlds', {
    method: 'POST',
    query: { fields: WORLD_FIELDS },
    body: {
      name,
      slug,
      system_key: systemKey,
      description,
      visibility,
      owner_id: input.ownerAccountId
    }
  })

  return normalizeWorld(res?.data ?? {})
}
