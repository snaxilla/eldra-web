// Shared asset-serving proxy -- the ONLY route ~80 call sites across this
// app build an image URL against (`/api/assets/:id`), from portraits to
// map pins to Content Pack asset refs. Authorization is unchanged by this
// pass: like every other non-public `/api/**` route, `server/middleware/
// authorize.ts` already requires a resolved Principal; this route itself
// has never called `requireCapability` beyond that, for any caller, for
// any file id -- "knowing a file id" has never been treated as a secret
// here, only Gallery ENUMERATION is (`world.entity.edit` on
// GET /api/worlds/:id/media). This pass does not change that posture.
//
// Media Gallery Thumbnail Performance pass -- adds ONE optional query
// param, `preset`. Omitted or unrecognized: behaves byte-for-byte as
// before this pass (plain original proxy) -- every existing bare-URL
// caller is unaffected. `preset=card` is the new path, used only by the
// Media Gallery grid and WorldMediaPicker (see those components):
//
// 1. First, ask DIRECTUS's own on-the-fly asset transform for a small
//    WebP (see THUMBNAIL_MAX_DIMENSION/THUMBNAIL_QUALITY below, kept
//    identical to media-thumbnails.ts's own fallback output so a card
//    never visibly changes size/quality depending on which path served
//    it). This is the PREFERRED path per this task's own instruction
//    ("prefer existing supported derivative infrastructure") -- zero new
//    storage, zero new code beyond this query string, and it is already
//    proven working in this deployment's own Directus version for any
//    image under its own transform size ceiling.
// 2. Directus 11.12.0 refuses to transform a source image wider or taller
//    than its own `ASSETS_TRANSFORM_IMAGE_MAX_DIMENSION` (default 6000px),
//    responding 400 `ILLEGAL_ASSET_TRANSFORMATION` -- confirmed
//    empirically against a disposable instance, not assumed. This is
//    exactly the reported Caldera case (~146MB, consistent with an
//    8K-class source). Raising that Directus-side limit is explicitly out
//    of scope ("do not increase global limits blindly," and it would let
//    Directus itself decode+resize an arbitrarily large image on every
//    cold request -- the very risk that limit exists to bound). Detected
//    by that error code AND (`isIllegalAssetTransformation`'s own header
//    has the full verification) the response's own `invalidTransformations`
//    actually naming `width`/`height` -- never by the code alone, and
//    never by a blanket "any failure falls back" -- this route falls back
//    to `media-thumbnails.ts`'s own bounded, cached, sharp-based generator
//    instead -- still never the original.
// 3. Any OTHER failure (file not found, auth failure, a genuinely corrupt
//    file) propagates exactly as it always has -- never silently
//    swallowed into a fallback that could mask an unrelated problem.
import { createError, defineEventHandler, getQuery, getRouterParam, setHeader } from 'h3'
import {
  getOrGenerateThumbnail,
  THUMBNAIL_CONTENT_TYPE,
  THUMBNAIL_MAX_DIMENSION,
  THUMBNAIL_QUALITY,
  ThumbnailGenerationOverloadedError,
  toNodeReadable
} from '../../utils/media-thumbnails'

// A small, fixed, named set -- per instruction ("keep card requests
// limited to a small supported set of sizes/formats") -- never an
// arbitrary caller-supplied width/height. Today there is exactly one:
// the gallery/picker card size. A second preset (e.g. a larger "detail"
// size) would be a one-line addition here, not a redesign.
const PRESETS: Record<string, { width: number; height: number }> = {
  card: { width: THUMBNAIL_MAX_DIMENSION, height: THUMBNAIL_MAX_DIMENSION }
}

// Verified against Directus 11.12.0's own source
// (@directus/api/dist/services/assets.js, AssetsService.getAsset):
// `IllegalAssetTransformationError` has exactly ONE throw site in that
// file, always with the literal `{ invalidTransformations: ['width',
// 'height'] }`, guarding exactly `!width || !height ||
// width > ASSETS_TRANSFORM_IMAGE_MAX_DIMENSION ||
// height > ASSETS_TRANSFORM_IMAGE_MAX_DIMENSION`. Confirmed empirically
// too, against a disposable instance: `storage_asset_transform: 'none'`,
// `'presets'` with no matching preset, an invalid `fit`/`format`/
// `quality`/negative-`width` query all respond with a DIFFERENT code
// (`INVALID_QUERY`) -- never this one. So today, this code is never
// shared with another transformation-policy failure. Checked anyway
// (review instruction: require verified oversized-source evidence
// through the actual response, not the bare code alone) by also
// requiring `invalidTransformations` to actually name a dimension field
// -- defense in depth against a future Directus version ever reusing
// this same code for an unrelated field (e.g. an invalid `fit`), which
// this additional check would then correctly NOT treat as "oversized."
function isIllegalAssetTransformation(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const errors = (body as { errors?: unknown }).errors
  if (!Array.isArray(errors)) return false
  return errors.some((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const extensions = (entry as { extensions?: unknown }).extensions
    if (!extensions || typeof extensions !== 'object') return false
    const { code, invalidTransformations } = extensions as { code?: unknown; invalidTransformations?: unknown }
    if (code !== 'ILLEGAL_ASSET_TRANSFORMATION') return false
    return Array.isArray(invalidTransformations) && invalidTransformations.some((field) => field === 'width' || field === 'height')
  })
}

function forwardDirectusHeaders(event: Parameters<typeof setHeader>[0], res: Response): void {
  const contentType = res.headers.get('content-type')
  const contentLength = res.headers.get('content-length')
  const cacheControl = res.headers.get('cache-control')
  const etag = res.headers.get('etag')

  if (contentType) setHeader(event, 'content-type', contentType)
  if (contentLength) setHeader(event, 'content-length', Number(contentLength))
  setHeader(event, 'cache-control', cacheControl || 'public, max-age=3600')
  if (etag) setHeader(event, 'etag', etag)
}

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') || '')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing asset id'
    })
  }

  const baseUrl = (process.env.DIRECTUS_URL || process.env.NUXT_PUBLIC_DIRECTUS_URL || '').replace(/\/$/, '')
  const token = process.env.DIRECTUS_TOKEN || ''

  if (!baseUrl || !token) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Missing Directus configuration'
    })
  }

  const encodedId = encodeURIComponent(id)
  const authHeaders = { Authorization: `Bearer ${token}`, Accept: '*/*' }

  const presetKey = String(getQuery(event).preset || '')
  const preset = PRESETS[presetKey]

  if (preset) {
    const transformUrl =
      `${baseUrl}/assets/${encodedId}?width=${preset.width}&height=${preset.height}` +
      `&fit=inside&format=webp&quality=${THUMBNAIL_QUALITY}`

    const transformRes = await fetch(transformUrl, { headers: authHeaders })

    if (transformRes.ok) {
      forwardDirectusHeaders(event, transformRes)
      return transformRes.body
    }

    const rawBody = await transformRes.text()
    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      parsedBody = null
    }

    if (transformRes.status === 400 && isIllegalAssetTransformation(parsedBody)) {
      // Fallback path -- the source exceeds Directus's own transform
      // size ceiling (media-thumbnails.ts's own header explains why this
      // is handled here rather than by raising that ceiling).
      try {
        const buffer = await getOrGenerateThumbnail(id, async () => {
          const originalRes = await fetch(`${baseUrl}/assets/${encodedId}`, { headers: authHeaders })
          if (!originalRes.ok) {
            const text = await originalRes.text()
            throw createError({ statusCode: originalRes.status, statusMessage: text || `Failed to load asset ${id}` })
          }
          return toNodeReadable(originalRes.body)
        })

        setHeader(event, 'content-type', THUMBNAIL_CONTENT_TYPE)
        setHeader(event, 'content-length', buffer.length)
        // Content-addressed in effect: this exact fileId's bytes never
        // change in place (confirmed -- no PATCH/replace-in-place path
        // exists for Directus files anywhere in this codebase), so this
        // is safe to cache indefinitely, matching map-tiles.ts's own
        // convention for its own immutable derivative output.
        setHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
        return buffer
      } catch (error) {
        if (error instanceof ThumbnailGenerationOverloadedError) {
          // Explicit overload behavior (per instruction) -- never a
          // silent hang, never a fallback to the original.
          throw createError({ statusCode: 503, statusMessage: error.message })
        }
        const typed = error as { statusCode?: number; message?: string }
        if (typed?.statusCode) throw error
        throw createError({
          statusCode: 502,
          statusMessage: `Could not generate a preview for asset ${id}: ${typed?.message || error}`
        })
      }
    }

    // Any other transform failure (not the oversized-image case) --
    // propagate exactly as the non-preset path already would, never
    // silently fall back to the original.
    throw createError({
      statusCode: transformRes.status,
      statusMessage: rawBody || `Failed to load asset ${id}`
    })
  }

  const res = await fetch(`${baseUrl}/assets/${encodedId}`, { headers: authHeaders })

  if (!res.ok) {
    const text = await res.text()
    throw createError({
      statusCode: res.status,
      statusMessage: text || `Failed to load asset ${id}`
    })
  }

  forwardDirectusHeaders(event, res)
  return res.body
})
