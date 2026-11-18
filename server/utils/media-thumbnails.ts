// Media Gallery Thumbnail Performance pass.
//
// WHY THIS MODULE EXISTS
// Gallery cards/picker grids need a small preview of a Media Gallery
// image, not the full original -- but Directus's own on-the-fly asset
// transform (`/api/assets/[id].get.ts` forwards width/height/fit/format to
// it, the PREFERRED path -- see that route's own header) refuses any
// image wider or taller than its own `ASSETS_TRANSFORM_IMAGE_MAX_DIMENSION`
// limit. Confirmed empirically against a disposable Directus 11.12.0
// instance (not assumed from documentation): a 6000px-wide source
// transforms successfully; a 6001px-wide source fails with
// `ILLEGAL_ASSET_TRANSFORMATION`. The reported Caldera images (~146MB,
// consistent with an 8K-class source) are exactly this case. This module
// is the fallback ONLY for that case -- it is never invoked for an image
// Directus can already transform live.
//
// WHY AN APP-LEVEL SHARP PASS, NOT A DIRECTUS CONFIG CHANGE
// Raising `ASSETS_TRANSFORM_IMAGE_MAX_DIMENSION` would let Directus itself
// decode+resize an arbitrarily large image on every cold request --
// exactly the unbounded-resource-consumption risk that limit exists to
// prevent, and this task's own instruction is explicit: "do not increase
// global limits blindly." `sharp` is already a project dependency
// (`server/utils/map-tiles.ts` already uses it for an even heavier job --
// a full zoom pyramid, synchronously, at upload time), so generating ONE
// small derivative ourselves, bounded and cached, reuses existing
// infrastructure rather than adding a new service or installation
// requirement.
//
// CACHING -- IN-MEMORY, BYTE-BUDGETED, NOT ON DISK, AND WHY. `map-tiles.ts`
// caches its output to `/opt/eldra/maps`, a path this repo's own
// `Dockerfile` never provisions (`COPY --from=build /app/.output
// ./.output` is the only thing copied into the runtime image; there is no
// `VOLUME`, no `/opt/eldra` reference anywhere in it). Whether `/opt/eldra`
// is actually a persistent, deployment-provisioned volume in the real
// production container is UNCONFIRMED from this session -- no production
// access. Rather than silently inherit that same unverified assumption
// for a NEW path, this cache is a small, bounded in-memory `Map`: it adds
// zero new deployment requirement, and it is safe under this
// application's own already-documented single-process deployment
// (CLAUDE.md's Deployment Checklist; `eldra-roll-system.md`'s own
// identical "in-process Map, one Nitro process" caveat for its SSE
// bridge). The only cost of this choice being imperfect is a ~0.4-1s
// regeneration on the next cold request after a process restart -- never
// a correctness bug, never a stale result. If `/opt/eldra`'s production
// persistence is confirmed later, moving this to a file-backed cache
// mirroring `map-tiles.ts`'s own convention is a safe, incremental
// upgrade, not a redesign -- see this module's own `getOrGenerateThumbnail`
// contract, which does not leak this choice to its caller.
//
// Bounded by BYTES, not just entry count (review finding -- an
// entry-count-only cap is not a real memory bound, since worst-case
// per-entry size varies with content: measured 262KB for a worst-case
// maximum-entropy opaque 640x640 WebP, 667KB for the same with an alpha
// channel). `MAX_CACHE_BYTES` (below) is the real budget; LRU eviction
// (oldest-touched first, via Map insertion-order re-touching) runs on
// every insert until the running total is back under budget.
// `MAX_SINGLE_ENTRY_BYTES` additionally refuses to CACHE (never refuses
// to SERVE) a single generated thumbnail so large it would dominate the
// whole budget by itself -- the caller still gets its correctly-generated
// buffer this one time, it is simply not retained.
//
// CONCURRENCY -- bounded three ways: (1) per-`fileId` request coalescing
// (two concurrent requests for the SAME uncached thumbnail share ONE
// generation, never two independent sharp passes over the same large
// original), (2) a small global concurrency cap across DIFFERENT files --
// sharp/libvips needs roughly the source image's own decoded size in
// memory while generating (measured: ~140-230MB RSS for this task's own
// ~100-134MB real-sized test fixtures), so unbounded concurrent
// generations across many large images at once could exhaust memory --
// and (3) a bounded queue of callers WAITING for a concurrency slot: a
// request that cannot even get in line within `MAX_QUEUED_WAITERS` fails
// closed immediately with an explicit overload error, rather than queuing
// indefinitely (review finding -- the original version queued without
// limit, so a burst of requests for many different uncached large files
// could each wait an unbounded amount of time with no signal to the
// caller that anything was wrong).
//
// TIMEOUT AND CANCELLATION -- a timeout rejects the caller's promise AND
// destroys BOTH the source stream and the sharp transform stream (review
// finding, reproduced and fixed: destroying only the source leaves
// sharp/libvips running indefinitely in the background -- confirmed by a
// controlled test with a stalled source stream: destroying only the
// source left the transform's `destroyed` flag false and fired neither
// `end` nor `error`, i.e. genuinely still running; destroying both
// correctly stops it, confirmed by `transform.destroyed === true` and a
// `close` event). The concurrency slot is released only in the `finally`
// after this cancellation has been issued, never before -- so "released
// a slot" and "stopped the generation" are now the same moment, not two
// independent claims.
import { Readable } from 'node:stream'
import sharp from 'sharp'

export const THUMBNAIL_MAX_DIMENSION = 640
export const THUMBNAIL_QUALITY = 78
export const THUMBNAIL_CONTENT_TYPE = 'image/webp'

// Real measured worst case (maximum-entropy 640x640 WebP with alpha) is
// ~667KB; this budget is generous relative to that, not tight against it,
// so ordinary photographic/painted content (measured in this task's own
// end-to-end run: 9.6KB-147KB) fits many hundreds of entries before
// eviction ever triggers.
const DEFAULT_MAX_CACHE_BYTES = 50 * 1024 * 1024
// Backstop against entry-COUNT blowup independent of bytes (e.g. many
// tiny entries) -- generous; the byte budget above is the real limit in
// practice.
const DEFAULT_MAX_CACHE_ENTRIES = 500
// A single generated thumbnail larger than this is still returned to its
// caller (correctness is never affected) but never cached -- it would
// otherwise single-handedly dominate MAX_CACHE_BYTES.
const DEFAULT_MAX_SINGLE_ENTRY_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_CONCURRENT_GENERATIONS = 2
const DEFAULT_MAX_QUEUED_WAITERS = 8
const DEFAULT_GENERATION_TIMEOUT_MS = 20000

// Mutable only through setMediaThumbnailLimitsForTesting (below) --
// production code always runs with the DEFAULT_* values above. Tests use
// this to exercise real eviction/concurrency/timeout/overload behavior
// deterministically with a handful of small real images and short
// timeouts, instead of needing giant fixtures or long waits to actually
// reach these limits.
let MAX_CACHE_BYTES = DEFAULT_MAX_CACHE_BYTES
let MAX_CACHE_ENTRIES = DEFAULT_MAX_CACHE_ENTRIES
let MAX_SINGLE_ENTRY_BYTES = DEFAULT_MAX_SINGLE_ENTRY_BYTES
let MAX_CONCURRENT_GENERATIONS = DEFAULT_MAX_CONCURRENT_GENERATIONS
let MAX_QUEUED_WAITERS = DEFAULT_MAX_QUEUED_WAITERS
let GENERATION_TIMEOUT_MS = DEFAULT_GENERATION_TIMEOUT_MS

// Exposed for tests only. Omitted fields keep their current value --
// resetMediaThumbnailsStateForTesting (below) restores every one of them
// to its DEFAULT_* value alongside clearing cache/queue state, so tests
// never leak a custom limit into an unrelated test.
export function setMediaThumbnailLimitsForTesting(overrides: {
  maxCacheBytes?: number
  maxCacheEntries?: number
  maxSingleEntryBytes?: number
  maxConcurrentGenerations?: number
  maxQueuedWaiters?: number
  generationTimeoutMs?: number
}): void {
  if (overrides.maxCacheBytes !== undefined) MAX_CACHE_BYTES = overrides.maxCacheBytes
  if (overrides.maxCacheEntries !== undefined) MAX_CACHE_ENTRIES = overrides.maxCacheEntries
  if (overrides.maxSingleEntryBytes !== undefined) MAX_SINGLE_ENTRY_BYTES = overrides.maxSingleEntryBytes
  if (overrides.maxConcurrentGenerations !== undefined) MAX_CONCURRENT_GENERATIONS = overrides.maxConcurrentGenerations
  if (overrides.maxQueuedWaiters !== undefined) MAX_QUEUED_WAITERS = overrides.maxQueuedWaiters
  if (overrides.generationTimeoutMs !== undefined) GENERATION_TIMEOUT_MS = overrides.generationTimeoutMs
}

type CacheEntry = { buffer: Buffer; bytes: number }

const thumbnailCache = new Map<string, CacheEntry>()
let currentCacheBytes = 0

// Bounded lifecycle tracking (review finding -- a PERMANENT tombstone set
// retains every deleted file id for the lifetime of the process, an
// unbounded resource regardless of how safe each individual entry is).
// `invalidatedInFlight` only ever holds a fileId while a generation for
// that exact id is genuinely in flight (a subset of `inFlight`'s own
// keys, so it is bounded by the SAME cap `inFlight`/the concurrency
// semaphore already enforce -- at most MAX_CONCURRENT_GENERATIONS +
// MAX_QUEUED_WAITERS entries at any instant, never one per deletion ever
// performed). `getOrGenerateThumbnail`'s own `finally { inFlight.delete
// (fileId) }` removes the matching entry here too, the moment that
// generation settles -- see that function's own comment at the exact
// line. A delete for a fileId with NOTHING in flight needs no tracking
// at all: nothing could repopulate the cache for it, and the next real
// request re-verifies existence through Directus before ever reaching
// this module again (`/api/assets/[id].get.ts`'s own existence check).
const invalidatedInFlight = new Set<string>()

const inFlight = new Map<string, Promise<Buffer>>()
let activeGenerations = 0
const waiters: Array<() => void> = []

function cacheGet(fileId: string): Buffer | undefined {
  const entry = thumbnailCache.get(fileId)
  if (entry === undefined) return undefined
  // Insertion-order re-touch -- the simplest correct LRU over a `Map`:
  // delete + re-set moves this key to the "most recently used" end.
  thumbnailCache.delete(fileId)
  thumbnailCache.set(fileId, entry)
  return entry.buffer
}

function evictUntilWithinBudget(): void {
  while (
    (currentCacheBytes > MAX_CACHE_BYTES || thumbnailCache.size > MAX_CACHE_ENTRIES) &&
    thumbnailCache.size > 0
  ) {
    const oldestKey = thumbnailCache.keys().next().value
    if (oldestKey === undefined) break
    const oldestEntry = thumbnailCache.get(oldestKey)
    thumbnailCache.delete(oldestKey)
    if (oldestEntry) currentCacheBytes -= oldestEntry.bytes
  }
}

function cacheSet(fileId: string, buffer: Buffer): void {
  // Deletion-during-generation race: a generation that was already in
  // flight when its file was deleted must not repopulate the cache once
  // it finishes -- `clearCachedThumbnail` only clears an already-cached
  // entry; it cannot reach into an in-flight `Promise` that is about to
  // resolve. This check is what actually closes that window, checked at
  // the one place a result is ever written in. `invalidatedInFlight` is
  // bounded (see its own header) -- this is never a permanent record.
  if (invalidatedInFlight.has(fileId)) return

  // Oversized single entry (review finding): never let one entry alone
  // exceed the whole budget's worth of retention value.
  if (buffer.length > MAX_SINGLE_ENTRY_BYTES) return

  const existing = thumbnailCache.get(fileId)
  if (existing) currentCacheBytes -= existing.bytes

  thumbnailCache.set(fileId, { buffer, bytes: buffer.length })
  currentCacheBytes += buffer.length

  evictUntilWithinBudget()
}

// Called when the underlying Directus file is deleted -- see
// server/api/worlds/[id]/media/[fileId]/index.delete.ts. Two distinct
// jobs: (1) drop any entry already cached (hygiene -- a deleted file's
// buffer should not linger in memory indefinitely), and (2) if, and only
// if, a generation for this exact fileId is CURRENTLY in flight, mark it
// invalidated so it cannot write a result into the cache once it
// finishes (see `cacheSet`'s own check) -- without this, a request that
// started generating a preview a moment before deletion could finish
// AFTER the delete and silently repopulate the cache with a preview of a
// file that no longer exists. A fileId with nothing in flight needs no
// tracking at all (see `invalidatedInFlight`'s own header for why this is
// safe) -- this never grows into a permanent, unbounded record of every
// id ever deleted.
export function clearCachedThumbnail(fileId: string): void {
  const existing = thumbnailCache.get(fileId)
  if (existing) {
    thumbnailCache.delete(fileId)
    currentCacheBytes -= existing.bytes
  }
  if (inFlight.has(fileId)) {
    invalidatedInFlight.add(fileId)
  }
}

// Read-only introspection for tests/diagnostics -- never used by
// production request handling.
export function getMediaThumbnailsCacheStats() {
  return {
    entries: thumbnailCache.size,
    bytes: currentCacheBytes,
    activeGenerations,
    queuedWaiters: waiters.length,
    // Bounded by construction (see invalidatedInFlight's own header) --
    // a test (or an operator, via a future diagnostics route) can use
    // this to directly confirm it never grows past the concurrency cap,
    // regardless of how many deletions have happened over the process's
    // lifetime.
    invalidatedInFlightCount: invalidatedInFlight.size
  }
}

// Exposed for tests only -- resets every piece of this module's shared
// state (cache, in-flight invalidation tracking, in-flight map,
// concurrency slots, waiter queue) so test cases never see another
// test's leftover state.
export function resetMediaThumbnailsStateForTesting(): void {
  thumbnailCache.clear()
  currentCacheBytes = 0
  invalidatedInFlight.clear()
  inFlight.clear()
  activeGenerations = 0
  waiters.length = 0
  MAX_CACHE_BYTES = DEFAULT_MAX_CACHE_BYTES
  MAX_CACHE_ENTRIES = DEFAULT_MAX_CACHE_ENTRIES
  MAX_SINGLE_ENTRY_BYTES = DEFAULT_MAX_SINGLE_ENTRY_BYTES
  MAX_CONCURRENT_GENERATIONS = DEFAULT_MAX_CONCURRENT_GENERATIONS
  MAX_QUEUED_WAITERS = DEFAULT_MAX_QUEUED_WAITERS
  GENERATION_TIMEOUT_MS = DEFAULT_GENERATION_TIMEOUT_MS
}

export class ThumbnailGenerationOverloadedError extends Error {
  constructor() {
    super(`Too many concurrent thumbnail generations already queued (max ${MAX_QUEUED_WAITERS})`)
    this.name = 'ThumbnailGenerationOverloadedError'
  }
}

async function acquireGenerationSlot(): Promise<void> {
  if (activeGenerations < MAX_CONCURRENT_GENERATIONS) {
    activeGenerations++
    return
  }
  if (waiters.length >= MAX_QUEUED_WAITERS) {
    throw new ThumbnailGenerationOverloadedError()
  }
  await new Promise<void>((resolve) => waiters.push(resolve))
  activeGenerations++
}

function releaseGenerationSlot(): void {
  activeGenerations--
  const next = waiters.shift()
  if (next) next()
}

// Pipes `source` through sharp/libvips rather than buffering the whole
// original into a JS Buffer first -- the original can be ~150MB; this
// keeps this process's own peak memory bounded to roughly what libvips
// itself needs to decode (measured above), not the full file size twice
// over. Returns the live `transform` stream alongside the result promise
// so a timeout can destroy it directly (see the module header's
// TIMEOUT AND CANCELLATION note) -- `generate` itself never decides when
// to give up; it is handed that decision from the outside.
function generate(source: NodeJS.ReadableStream): { transform: sharp.Sharp; result: Promise<Buffer> } {
  const transform = sharp()
    .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: THUMBNAIL_QUALITY })

  const result = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    source.on('error', reject)
    transform.on('error', reject)
    transform.on('data', (chunk: Buffer) => chunks.push(chunk))
    transform.on('end', () => resolve(Buffer.concat(chunks)))
    source.pipe(transform)
  })

  return { transform, result }
}

// The one entry point. `fileId` is both the cache key and the request-
// coalescing key. `openSource` is called ONLY on an actual cache miss
// (never speculatively, never for a file whose thumbnail is already
// cached or already being generated by a concurrent caller) and must
// return a FRESH readable stream of the original image bytes on each
// call -- never bytes already buffered into memory by the caller, so a
// large original is held in memory only as long as sharp itself needs,
// never for the duration of this function call as a whole. Rejects with
// `ThumbnailGenerationOverloadedError` if the bounded wait queue is full
// -- see the module header's CONCURRENCY note; callers should treat this
// the same as any other generation failure (serve an error state, never
// the original).
export async function getOrGenerateThumbnail(
  fileId: string,
  openSource: () => Promise<NodeJS.ReadableStream>
): Promise<Buffer> {
  const cached = cacheGet(fileId)
  if (cached !== undefined) return cached

  const existing = inFlight.get(fileId)
  if (existing) return existing

  const task = (async () => {
    await acquireGenerationSlot()
    let source: NodeJS.ReadableStream | undefined
    let transform: sharp.Sharp | undefined
    try {
      source = await openSource()
      const generated = generate(source)
      transform = generated.transform

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const timer = setTimeout(() => {
          // Destroy BOTH ends -- destroying only the source leaves the
          // sharp/libvips pipeline running in the background indefinitely
          // (reproduced and confirmed in this pass's own review; see the
          // module header). This is what makes "the promise rejected" and
          // "the work actually stopped" the same fact.
          const destroyableSource = source as (NodeJS.ReadableStream & { destroy?: () => void }) | undefined
          if (destroyableSource && typeof destroyableSource.destroy === 'function') destroyableSource.destroy()
          transform?.destroy()
          reject(new Error(`Thumbnail generation timed out after ${GENERATION_TIMEOUT_MS}ms`))
        }, GENERATION_TIMEOUT_MS)

        generated.result.then(
          (value) => {
            clearTimeout(timer)
            resolve(value)
          },
          (error) => {
            clearTimeout(timer)
            reject(error)
          }
        )
      })

      cacheSet(fileId, buffer)
      return buffer
    } finally {
      // Only reached once generation has actually stopped (returned,
      // thrown, or been destroyed above) -- the slot is never released
      // while the underlying sharp/libvips work is still running.
      releaseGenerationSlot()
    }
  })()

  inFlight.set(fileId, task)
  try {
    return await task
  } finally {
    // Cleanup for BOTH lifecycle structures happens together, the
    // moment this generation settles (success, failure, or timeout) --
    // `invalidatedInFlight` must never outlive the in-flight entry it
    // was tracking, which is exactly what keeps it bounded (see its own
    // header).
    inFlight.delete(fileId)
    invalidatedInFlight.delete(fileId)
  }
}

// Converts a WHATWG `ReadableStream` (what Node's native `fetch`'s
// `res.body` is) into the Node `Readable` `getOrGenerateThumbnail`'s
// `openSource` contract expects. Exported so the route that fetches the
// original from Directus never has to know this module's own stream
// representation.
export function toNodeReadable(body: ReadableStream<Uint8Array> | null): NodeJS.ReadableStream {
  if (!body) throw new Error('Response has no body to stream')
  return Readable.fromWeb(body as never)
}
