// Beta Zero audit, Issue 2: the Build workspace needs to know which
// capabilities the viewing Principal holds for THIS world, so it can hide
// worldbuilding UI instead of rendering it and failing later. `capabilities`
// below is computed by asking the real can() the same question every
// server-side enforcement site already asks -- never a re-derived
// approximation of role/membership logic on the client.
//
// createError/defineEventHandler/getRouterParam are imported explicitly
// (the same reason server/middleware/authorize.ts does) so this route is
// directly unit-testable under plain Vitest. This does not touch the
// route's existing raw-fetch Directus access pattern -- CLAUDE.md's
// documented "two Directus access patterns" debt is out of this task's
// scope.
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { ALL_WORLD_CAPABILITIES, can } from '../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const baseUrl = (process.env.DIRECTUS_URL || process.env.NUXT_PUBLIC_DIRECTUS_URL || '').replace(/\/$/, '')
  const token = process.env.DIRECTUS_TOKEN || ''

  const res = await fetch(`${baseUrl}/items/worlds?fields=*&limit=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  })

  const json = await res.json()

  if (!res.ok) {
    throw createError({
      statusCode: res.status,
      statusMessage: json?.errors?.[0]?.message || json?.message || 'Failed to load worlds'
    })
  }

  const worlds = Array.isArray(json?.data) ? json.data : []
  const world = worlds.find((w: any) => String(w.id) === String(id))

  if (!world) {
    throw createError({
      statusCode: 404,
      statusMessage: 'World not found'
    })
  }

  const principal = event.context.principal ?? null
  const capabilities = ALL_WORLD_CAPABILITIES.filter((capability) =>
    can(principal, capability, { kind: 'world', worldId: String(id) })
  )

  return {
    ...world,
    sidebar_image_url: world?.sidebar_image ? `/api/assets/${world.sidebar_image}` : null,
    banner_image_url: world?.banner_image ? `/api/assets/${world.banner_image}` : null,
    capabilities
  }
})
