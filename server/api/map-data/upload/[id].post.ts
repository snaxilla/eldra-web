// RETIRED -- media ownership policy follow-up, obsolete-upload-endpoint
// closure.
//
// Verified before this change: zero callers anywhere in this repository
// (a text search for `/api/map-data/upload` and `map-data/upload` across
// app/, scripts, tests, docs, and server code found none), and zero
// route exclusions in nuxt.config.ts -- this Nitro file-based route was
// genuinely live and reachable. Git history
// ("Reset map API onto flat map-data routes", 9ff3bc4) shows the whole
// server/api/map-data/** family (this route plus
// set-default/[mapId].post.ts and world/[id].get.ts, all built on
// server/utils/map-data.ts) was the map API's EARLIER shape, superseded
// by server/api/worlds/[id]/maps/upload.post.ts +
// server/utils/directus-maps.ts -- the route
// app/pages/worlds/[id]/maps.vue actually calls today (tile generation,
// the shared streaming multipart parser, and now ownership stamping all
// live only in the newer implementation).
//
// Unlike server/api/uploads/image.post.ts, THIS route did not contain
// hardcoded credentials -- verified directly: it called
// server/utils/map-data.ts's own uploadDirectusFile/createWorldMap,
// which read DIRECTUS_URL/DIRECTUS_TOKEN from the environment, and it
// DID check `world.map.edit` against a real, route-derived `worldId`.
// But it never stamped `world_id` on the file it created, so leaving it
// live would be an alternate, properly-authenticated upload path that
// still silently bypassed the media ownership policy every other map
// upload route now enforces. Retired rather than patched, since the
// active, correct, already-ownership-aware implementation already
// exists at the route named above.
//
// The other two server/api/map-data/** routes (set-default, world GET)
// are read-only/toggle-only, touch no file uploads, and carry no
// credential or ownership concern -- left untouched, out of scope for
// this pass, and reported separately rather than changed here.
//
// See tests/server/api/map-data/upload.post.test.ts for the verification
// that this route can no longer upload anything or contact Directus.
import { createError, defineEventHandler } from 'h3'

export default defineEventHandler(async () => {
  throw createError({
    statusCode: 410,
    statusMessage: 'This endpoint has been retired. Use POST /api/worlds/:id/maps/upload instead.'
  })
})
