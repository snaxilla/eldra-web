import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3'
import { stat, readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

// Content Workspaces & Studio Phase 0, Area 4 -- the 5etools image proxy.
//
// CONFIRMED ROOT CAUSE: this route has always served from a hardcoded host
// path, and the production container (built from Dockerfile, which ships
// `.output` only -- no source tree, no /opt/eldra/datasets) does not
// contain it. Every `/api/5etools-img/<path>` URL the presentation layer
// emits (app/lib/content-presentation/dnd5e.ts's `readImage`, reading
// `data.fluff.images[0].href`) is therefore a dead link in a real
// production deployment today -- it has only ever appeared to work in
// this dev/ops environment because this host happens to have the dataset
// mounted at this exact path.
//
// WHAT THIS FIX DOES (Option A: configurable root + honest diagnostics --
// see this task's own brief for why this was chosen over Option B):
//   1. The root is now overridable via ELDRA_5ETOOLS_IMG_DIR, matching the
//      existing ELDRA_5ETOOLS_DATA_DIR precedent
//      (server/api/worlds/[id]/class-spell-options.get.ts) -- same naming
//      convention, same "env var overrides a hardcoded default" shape.
//      The default is UNCHANGED (the same path this route has always
//      used), so nothing about today's behavior in an environment that
//      DOES have the dataset mounted (this one) changes.
//   2. "The root is missing entirely" and "this one requested image is
//      missing" are no longer the same opaque 404. Both are still 404s
//      (the resource genuinely is not there, either way -- this is not a
//      500/503, since nothing is actually broken at the HTTP layer), but
//      each now carries a distinct, machine-readable `data.code` so a
//      caller/log line can tell "deployment misconfiguration" apart from
//      "this specific asset doesn't exist," per this task's own
//      requirement not to conflate the two.
//   3. The root-availability check is a single `stat` call, memoized for
//      the life of the process (a mount's presence does not change while
//      a container is running) -- "startup or first-use diagnostic," not
//      a stat-per-request cost. The first (and only) time it comes back
//      missing, this logs ONE loud, specific operator message naming the
//      exact configured path and the env var that controls it -- never
//      silent, never repeated into a log-spam loop.
//
// WHAT THIS FIX DOES NOT DO: it does not download, cache, or ingest any
// part of the 5etools image corpus, and it does not implement the future
// Content Pack portable asset manifest (readImage's own `kind: 'pack'`
// branch, .github/docs/architecture/content-workspaces-and-studio.md
// Phase 8) -- that is the actual fix for "a curated/published pack must
// carry its own images, independent of any host mount," and is
// deliberately out of scope here. This route remains exactly what it has
// always been: a dev/ops-environment-only proxy onto a host-mounted
// dataset, now honest about when that mount is absent instead of silently
// pretending it works.
//
// Path traversal protection (normalize -> strip leading ../ -> reject any
// remaining `..`, then path.join, which never lets an absolute second
// segment escape the root) is UNCHANGED from before this fix -- nothing
// here weakens it.

function rootFromEnv(): string {
  return process.env.ELDRA_5ETOOLS_IMG_DIR || '/opt/eldra/datasets/5etools-img'
}

function contentTypeFor(ext: string) {
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

// Memoized for the process lifetime -- see this file's own header. Reset
// only by restarting the process (e.g. redeploying with the mount fixed),
// exactly like every other "read environment/filesystem state once at
// startup" pattern in this codebase.
let rootAvailabilityCheck: Promise<boolean> | null = null

async function isDatasetImageRootAvailable(root: string): Promise<boolean> {
  if (!rootAvailabilityCheck) {
    rootAvailabilityCheck = stat(root)
      .then((stats) => stats.isDirectory())
      .catch(() => false)
      .then((available) => {
        if (!available) {
          console.error(
            `[5etools-img] Dataset image root is missing or unreadable at '${root}'. ` +
            'Set ELDRA_5ETOOLS_IMG_DIR to the correct path, or mount the 5etools image dataset ' +
            `at this location. Every /api/5etools-img/* request will 404 with code 'dataset-image-root-missing' until this is fixed.`
          )
        }
        return available
      })
  }

  return rootAvailabilityCheck
}

// Test-only: the module-level memoization above is deliberate production
// behavior (see this file's own header), but it would make every test
// after the first observe whatever the first test's filesystem state was.
// Exported under a name that can never collide with a real route export.
export function _resetDatasetImageRootAvailabilityCacheForTests(): void {
  rootAvailabilityCheck = null
}

export default defineEventHandler(async (event) => {
  const rawPath = String(getRouterParam(event, 'path') || '').trim()

  if (!rawPath) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing image path'
    })
  }

  const cleaned = normalize(rawPath)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^\/+/, '')

  if (!cleaned || cleaned.includes('..')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid image path'
    })
  }

  const root = rootFromEnv()

  if (!(await isDatasetImageRootAvailable(root))) {
    throw createError({
      statusCode: 404,
      statusMessage: 'The 5etools image dataset is not available on this deployment.',
      data: { code: 'dataset-image-root-missing' }
    })
  }

  const fullPath = join(root, cleaned)

  let data: Buffer
  try {
    data = await readFile(fullPath)
  } catch {
    throw createError({
      statusCode: 404,
      statusMessage: 'Image not found',
      data: { code: 'image-not-found' }
    })
  }

  setHeader(event, 'Content-Type', contentTypeFor(extname(fullPath).toLowerCase()))
  setHeader(event, 'Cache-Control', 'public, max-age=86400')

  return data
})
