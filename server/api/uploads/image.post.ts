// RETIRED -- media ownership policy follow-up, obsolete-upload-endpoint
// closure.
//
// Verified before this change: zero callers anywhere in this repository
// (app/, scripts, tests, docs, server code) via a direct text search for
// both `/api/uploads/image` and `uploads/image`, and zero route
// exclusions in nuxt.config.ts -- meaning this Nitro file-based route was
// genuinely LIVE and publicly reachable in production despite having no
// legitimate caller. The retired handler had NO authentication check, NO
// World context of any kind, and contacted Directus using a HARDCODED
// production Directus URL and a HARDCODED bearer token literally in
// source -- both removed from source entirely by this change, not merely
// left unused. An unauthenticated caller who discovered this URL could
// upload arbitrary files to the production Directus instance using the
// exposed service token.
//
// This was never World-scoped and therefore can never be retrofitted
// into the media ownership policy (there is no World to stamp) -- it is
// retired, not repaired. The project's established, authorized upload
// path for a generic World-owned image is
// server/api/worlds/[id]/media/upload.post.ts.
//
// See tests/server/api/uploads/image.post.test.ts for the verification
// that this route can no longer upload anything or contact Directus.
import { createError, defineEventHandler } from 'h3'

export default defineEventHandler(async () => {
  throw createError({
    statusCode: 410,
    statusMessage: 'This endpoint has been retired. Use POST /api/worlds/:id/media/upload instead.'
  })
})
