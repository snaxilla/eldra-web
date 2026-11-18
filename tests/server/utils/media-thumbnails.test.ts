// Unit tests for server/utils/media-thumbnails.ts -- the Media Gallery
// Thumbnail Performance pass's fallback generator for source images too
// large for Directus's own on-the-fly asset transform (confirmed
// empirically, see that module's own header, to refuse anything wider or
// taller than 6000px).
//
// Real `sharp` is exercised throughout (not mocked) -- this is pure,
// deterministic, CPU-only image processing with no network/filesystem
// side effects beyond what each test explicitly passes it, so mocking it
// would only hide real generation/decoding bugs. Source images are tiny
// real PNGs built with sharp itself, kept small so the suite stays fast;
// cold-generation timing against a representative ~100MB fixture was
// measured separately (see the final report) and is not re-proven here.
import { Readable } from 'node:stream'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import sharp from 'sharp'
import {
  getOrGenerateThumbnail,
  clearCachedThumbnail,
  resetMediaThumbnailsStateForTesting,
  setMediaThumbnailLimitsForTesting,
  getMediaThumbnailsCacheStats,
  toNodeReadable,
  THUMBNAIL_MAX_DIMENSION,
  ThumbnailGenerationOverloadedError
} from '../../../server/utils/media-thumbnails'

// A source stream this test file fully controls: it never emits data
// until `push`/`end` are called explicitly, and `destroyed` is readable
// afterward to prove cancellation actually reached this stream. Used
// instead of a giant real fixture for every concurrency/timeout/eviction
// test below -- those properties never depended on a large source, only
// on controlling exactly when (or whether) a generation finishes.
function deferredSource() {
  const stream = new Readable({ read() {} })
  return {
    stream,
    push: (chunk: Buffer) => stream.push(chunk),
    end: () => stream.push(null)
  }
}

async function pngBuffer(width: number, height: number, alpha = false): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha ? { r: 10, g: 20, b: 30, alpha: 0.4 } : { r: 10, g: 20, b: 30 }
    }
  })
    .png()
    .toBuffer()
}

function streamOf(buffer: Buffer): NodeJS.ReadableStream {
  return Readable.from(buffer)
}

beforeEach(() => {
  resetMediaThumbnailsStateForTesting()
})

describe('getOrGenerateThumbnail -- generation', () => {
  it('produces a valid, downscaled WebP for a landscape source', async () => {
    const source = await pngBuffer(2000, 1000)
    const openSource = vi.fn(async () => streamOf(source))

    const thumb = await getOrGenerateThumbnail('file-landscape', openSource)
    const meta = await sharp(thumb).metadata()

    expect(meta.format).toBe('webp')
    expect(meta.width).toBeLessThanOrEqual(THUMBNAIL_MAX_DIMENSION)
    expect(meta.height).toBeLessThanOrEqual(THUMBNAIL_MAX_DIMENSION)
    // fit: inside preserves aspect ratio -- never stretched.
    expect(meta.width! / meta.height!).toBeCloseTo(2000 / 1000, 1)
  })

  it('produces a valid, downscaled WebP for a portrait source', async () => {
    const source = await pngBuffer(900, 1800)
    const thumb = await getOrGenerateThumbnail('file-portrait', async () => streamOf(source))
    const meta = await sharp(thumb).metadata()

    expect(meta.width).toBeLessThanOrEqual(THUMBNAIL_MAX_DIMENSION)
    expect(meta.height).toBeLessThanOrEqual(THUMBNAIL_MAX_DIMENSION)
    expect(meta.width! / meta.height!).toBeCloseTo(900 / 1800, 1)
  })

  it('preserves transparency', async () => {
    const source = await pngBuffer(1200, 1200, true)
    const thumb = await getOrGenerateThumbnail('file-transparent', async () => streamOf(source))
    const meta = await sharp(thumb).metadata()

    expect(meta.hasAlpha).toBe(true)
  })

  it('never enlarges a source smaller than the thumbnail bound', async () => {
    const source = await pngBuffer(100, 80)
    const thumb = await getOrGenerateThumbnail('file-tiny', async () => streamOf(source))
    const meta = await sharp(thumb).metadata()

    expect(meta.width).toBe(100)
    expect(meta.height).toBe(80)
  })
})

describe('getOrGenerateThumbnail -- caching', () => {
  it('caches the result -- a second call for the same fileId never calls openSource again', async () => {
    const source = await pngBuffer(1000, 1000)
    const openSource = vi.fn(async () => streamOf(source))

    const first = await getOrGenerateThumbnail('file-cache', openSource)
    const second = await getOrGenerateThumbnail('file-cache', openSource)

    expect(openSource).toHaveBeenCalledTimes(1)
    expect(second).toBe(first) // same cached Buffer instance
  })

  it('clearCachedThumbnail forces the next call to regenerate', async () => {
    const source = await pngBuffer(1000, 1000)
    const openSource = vi.fn(async () => streamOf(source))

    await getOrGenerateThumbnail('file-clear', openSource)
    clearCachedThumbnail('file-clear')
    await getOrGenerateThumbnail('file-clear', openSource)

    expect(openSource).toHaveBeenCalledTimes(2)
  })

  it('different fileIds cache independently', async () => {
    const sourceA = await pngBuffer(500, 500)
    const sourceB = await pngBuffer(800, 400)
    const openA = vi.fn(async () => streamOf(sourceA))
    const openB = vi.fn(async () => streamOf(sourceB))

    const a = await getOrGenerateThumbnail('file-a', openA)
    const b = await getOrGenerateThumbnail('file-b', openB)

    expect(openA).toHaveBeenCalledTimes(1)
    expect(openB).toHaveBeenCalledTimes(1)
    expect(a).not.toEqual(b)
  })
})

describe('getOrGenerateThumbnail -- concurrent requests for the same uncached preview', () => {
  it('coalesces N concurrent requests for the same fileId into exactly ONE openSource call', async () => {
    const source = await pngBuffer(1500, 1500)
    const openSource = vi.fn(async () => streamOf(source))

    const [a, b, c] = await Promise.all([
      getOrGenerateThumbnail('file-concurrent', openSource),
      getOrGenerateThumbnail('file-concurrent', openSource),
      getOrGenerateThumbnail('file-concurrent', openSource)
    ])

    expect(openSource).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    expect(b).toBe(c)
  })
})

describe('getOrGenerateThumbnail -- failure and fallback-safety behavior', () => {
  it('a failed generation is never cached -- the next call retries cleanly', async () => {
    let attempt = 0
    const openSource = vi.fn(async () => {
      attempt++
      if (attempt === 1) {
        const bad = Readable.from(Buffer.from('not an image'))
        return bad
      }
      return streamOf(await pngBuffer(400, 300))
    })

    await expect(getOrGenerateThumbnail('file-retry', openSource)).rejects.toThrow()
    const thumb = await getOrGenerateThumbnail('file-retry', openSource)
    const meta = await sharp(thumb).metadata()

    expect(attempt).toBe(2)
    expect(meta.format).toBe('webp')
  })

  it('propagates an openSource error (e.g. the original could not be fetched) without ever substituting the original', async () => {
    const openSource = vi.fn(async () => {
      throw new Error('upstream fetch failed')
    })

    await expect(getOrGenerateThumbnail('file-upstream-fail', openSource)).rejects.toThrow('upstream fetch failed')
  })
})

describe('toNodeReadable', () => {
  it('converts a WHATWG ReadableStream into a Node Readable sharp can pipe from', async () => {
    const source = await pngBuffer(300, 300)
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(source))
        controller.close()
      }
    })

    const nodeStream = toNodeReadable(webStream)
    const thumb = await getOrGenerateThumbnail('file-web-stream', async () => nodeStream)
    const meta = await sharp(thumb).metadata()

    expect(meta.format).toBe('webp')
  })

  it('throws immediately for a null body rather than failing inside the generation pipeline', () => {
    expect(() => toNodeReadable(null)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Bounded Pre-Commit Resource Review -- the four review findings below,
// each reproduced and fixed, each with its own regression test using
// setMediaThumbnailLimitsForTesting (never a giant fixture or a long
// real wait) to actually reach the limit in question quickly and
// deterministically.
// ---------------------------------------------------------------------------

describe('cache eviction -- byte budget (review finding: entry-count alone is not a real memory bound)', () => {
  it('evicts the LEAST recently used entry once the byte budget is exceeded', async () => {
    // Three real, tiny (10x10) thumbnails, whose actual encoded size we
    // read back rather than assume, then a budget sized to hold the
    // first two but force the first one out once a third arrives.
    const sizes: number[] = []
    for (const id of ['evict-a', 'evict-b']) {
      const buf = await getOrGenerateThumbnail(id, async () => streamOf(await pngBuffer(10, 10)))
      sizes.push(buf.length)
    }
    setMediaThumbnailLimitsForTesting({ maxCacheBytes: sizes[0]! + sizes[1]! })

    const openA = vi.fn(async () => streamOf(await pngBuffer(10, 10)))
    const openC = vi.fn(async () => streamOf(await pngBuffer(10, 10)))

    // Re-touch 'evict-a' as more-recently-used than 'evict-b' before the
    // budget is exceeded, so the LRU prediction below is unambiguous.
    await getOrGenerateThumbnail('evict-a', openA)
    expect(openA).not.toHaveBeenCalled() // still cached from the setup loop above

    await getOrGenerateThumbnail('evict-c', openC) // pushes total bytes over budget

    const stats = getMediaThumbnailsCacheStats()
    expect(stats.bytes).toBeLessThanOrEqual(sizes[0]! + sizes[1]!)

    // Check survival of 'evict-a' (touched more recently, above) BEFORE
    // probing 'evict-b' -- regenerating 'evict-b' next would itself
    // re-insert it and could evict 'evict-a' under this same tight
    // budget, which would corrupt this very assertion if checked after.
    const openAAgain = vi.fn(async () => streamOf(await pngBuffer(10, 10)))
    await getOrGenerateThumbnail('evict-a', openAAgain)
    expect(openAAgain).not.toHaveBeenCalled()

    // 'evict-b' was the least-recently-touched -- it should have been
    // evicted, forcing a real regeneration on the next request for it.
    const openB = vi.fn(async () => streamOf(await pngBuffer(10, 10)))
    await getOrGenerateThumbnail('evict-b', openB)
    expect(openB).toHaveBeenCalledTimes(1)
  })

  it('evicts on entry COUNT even when every entry is tiny (the byte budget backstop)', async () => {
    setMediaThumbnailLimitsForTesting({ maxCacheBytes: 10 * 1024 * 1024, maxCacheEntries: 2 })

    await getOrGenerateThumbnail('count-a', async () => streamOf(await pngBuffer(10, 10)))
    await getOrGenerateThumbnail('count-b', async () => streamOf(await pngBuffer(10, 10)))
    await getOrGenerateThumbnail('count-c', async () => streamOf(await pngBuffer(10, 10)))

    expect(getMediaThumbnailsCacheStats().entries).toBeLessThanOrEqual(2)

    const openAAgain = vi.fn(async () => streamOf(await pngBuffer(10, 10)))
    await getOrGenerateThumbnail('count-a', openAAgain)
    expect(openAAgain).toHaveBeenCalledTimes(1) // evicted -- regenerated
  })

  it('a single entry larger than the configured max is still served, but never cached', async () => {
    const real = await getOrGenerateThumbnail('size-probe', async () => streamOf(await pngBuffer(200, 200)))
    setMediaThumbnailLimitsForTesting({ maxSingleEntryBytes: real.length - 1 })

    const openSource = vi.fn(async () => streamOf(await pngBuffer(200, 200)))
    const first = await getOrGenerateThumbnail('oversized-entry', openSource)
    expect(first.length).toBeGreaterThan(0) // still correctly generated and returned

    const second = await getOrGenerateThumbnail('oversized-entry', openSource)
    expect(openSource).toHaveBeenCalledTimes(2) // never cached -- regenerated every time
    expect(second).toEqual(first)
  })
})

describe('concurrency -- bounded queue and explicit overload behavior (review finding: the original queue was unbounded)', () => {
  it('rejects immediately once the concurrency slots AND the wait queue are both full, rather than queuing forever', async () => {
    setMediaThumbnailLimitsForTesting({ maxConcurrentGenerations: 1, maxQueuedWaiters: 1 })

    const first = deferredSource()
    const second = deferredSource()

    // Takes the one active slot.
    const firstPromise = getOrGenerateThumbnail('busy-1', async () => first.stream)
    // Takes the one queued waiter slot.
    const secondPromise = getOrGenerateThumbnail('busy-2', async () => second.stream)
    // Queue is now full (1 active + 1 queued) -- a third, different file
    // must fail closed immediately, not queue indefinitely.
    await expect(getOrGenerateThumbnail('busy-3', async () => deferredSource().stream)).rejects.toThrow(
      ThumbnailGenerationOverloadedError
    )

    // Let the first generation finish so the queued second can proceed
    // and the module returns to a clean state for the next test.
    first.push(await pngBuffer(10, 10))
    first.end()
    await firstPromise
    second.push(await pngBuffer(10, 10))
    second.end()
    await secondPromise
  })

  it('recovers cleanly after an overload rejection -- the next request is not permanently blocked', async () => {
    setMediaThumbnailLimitsForTesting({ maxConcurrentGenerations: 1, maxQueuedWaiters: 0 })

    const blocking = deferredSource()
    const blockingPromise = getOrGenerateThumbnail('recover-1', async () => blocking.stream)

    await expect(getOrGenerateThumbnail('recover-2', async () => deferredSource().stream)).rejects.toThrow(
      ThumbnailGenerationOverloadedError
    )

    blocking.push(await pngBuffer(10, 10))
    blocking.end()
    await blockingPromise

    // The slot is free again -- a new request for a DIFFERENT file must
    // succeed promptly, not inherit any corrupted semaphore state from
    // the rejected one above.
    const after = await getOrGenerateThumbnail('recover-3', async () => streamOf(await pngBuffer(10, 10)))
    expect(after.length).toBeGreaterThan(0)
  })

  it('concurrent requests for DIFFERENT files never mix results', async () => {
    const a = await pngBuffer(50, 50)
    const b = await pngBuffer(90, 40)

    const [resultA, resultB] = await Promise.all([
      getOrGenerateThumbnail('distinct-a', async () => streamOf(a)),
      getOrGenerateThumbnail('distinct-b', async () => streamOf(b))
    ])

    const metaA = await sharp(resultA).metadata()
    const metaB = await sharp(resultB).metadata()
    expect([metaA.width, metaA.height]).toEqual([50, 50])
    expect([metaB.width, metaB.height]).toEqual([90, 40])
  })
})

describe('timeout -- cancellation actually stops the underlying work, not just the caller\'s promise (review finding)', () => {
  it('rejects on timeout and destroys the source stream it was reading from', async () => {
    setMediaThumbnailLimitsForTesting({ generationTimeoutMs: 50 })
    const stalled = deferredSource() // never pushes, never ends

    await expect(getOrGenerateThumbnail('timeout-1', async () => stalled.stream)).rejects.toThrow(/timed out/i)
    expect(stalled.stream.destroyed).toBe(true)
  })

  it('releases the concurrency slot after a timeout -- a queued request is not stuck behind a dead one', async () => {
    setMediaThumbnailLimitsForTesting({ maxConcurrentGenerations: 1, generationTimeoutMs: 50 })
    const stalled = deferredSource()

    await expect(getOrGenerateThumbnail('timeout-2', async () => stalled.stream)).rejects.toThrow(/timed out/i)

    expect(getMediaThumbnailsCacheStats().activeGenerations).toBe(0)

    // A fresh request for a different file must succeed promptly --
    // proving the slot genuinely came back, not just that the first
    // promise settled.
    const next = await getOrGenerateThumbnail('timeout-3', async () => streamOf(await pngBuffer(10, 10)))
    expect(next.length).toBeGreaterThan(0)
  })

  it('a timed-out generation is never cached', async () => {
    setMediaThumbnailLimitsForTesting({ generationTimeoutMs: 50 })
    const stalled = deferredSource()
    const openSource = vi.fn(async () => stalled.stream)

    await expect(getOrGenerateThumbnail('timeout-4', openSource)).rejects.toThrow(/timed out/i)

    const retrySource = vi.fn(async () => streamOf(await pngBuffer(10, 10)))
    await getOrGenerateThumbnail('timeout-4', retrySource)
    expect(retrySource).toHaveBeenCalledTimes(1) // regenerated, not served from a bad cache entry
  })
})

describe('delete-during-generation race -- bounded lifecycle tracking (review finding: a PERMANENT tombstone retains every deleted id for process lifetime)', () => {
  it('a generation that finishes AFTER its file was deleted never writes a cached result, and the tracking is cleaned up once it settles', async () => {
    const deferred = deferredSource()

    const generationPromise = getOrGenerateThumbnail('deleted-mid-flight', async () => deferred.stream)

    // The delete happens WHILE generation is still in flight -- this is
    // the exact race: clearCachedThumbnail runs before the buffer this
    // generation will eventually produce has been written anywhere.
    clearCachedThumbnail('deleted-mid-flight')
    expect(getMediaThumbnailsCacheStats().invalidatedInFlightCount).toBe(1)

    deferred.push(await pngBuffer(10, 10))
    deferred.end()
    const result = await generationPromise
    expect(result.length).toBeGreaterThan(0) // the in-flight caller still gets its correct result once

    // Cleanup assertion: the invalidation tracking for this fileId is
    // gone the moment the generation it was guarding has settled --
    // never left behind, never a growing record.
    expect(getMediaThumbnailsCacheStats().invalidatedInFlightCount).toBe(0)

    // Nothing was repopulated into the cache for a file that is
    // supposed to be gone -- the next request regenerates from scratch.
    const openSource = vi.fn(async () => streamOf(await pngBuffer(10, 10)))
    await getOrGenerateThumbnail('deleted-mid-flight', openSource)
    expect(openSource).toHaveBeenCalledTimes(1)
  })

  it('a delete with NOTHING in flight tracks nothing at all -- a later, unrelated generation for the same id caches normally', async () => {
    // No generation is running for this id -- clearCachedThumbnail has
    // nothing to invalidate, and (unlike a permanent tombstone) must not
    // retain the id just in case. This is the bounded-tracking property
    // itself: deletion of an idle id leaves no trace.
    clearCachedThumbnail('deleted-while-idle')
    expect(getMediaThumbnailsCacheStats().invalidatedInFlightCount).toBe(0)

    const first = vi.fn(async () => streamOf(await pngBuffer(10, 10)))
    await getOrGenerateThumbnail('deleted-while-idle', first)

    const second = vi.fn(async () => streamOf(await pngBuffer(10, 10)))
    await getOrGenerateThumbnail('deleted-while-idle', second)

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled() // the first call's result was cached normally -- no lingering tombstone blocked it
  })

  it('repeated delete-during-generation cycles never accumulate tracking state (bounded, not permanent)', async () => {
    for (let i = 0; i < 25; i++) {
      const deferred = deferredSource()
      const fileId = `cycle-${i}`
      const generationPromise = getOrGenerateThumbnail(fileId, async () => deferred.stream)
      clearCachedThumbnail(fileId)
      deferred.push(await pngBuffer(10, 10))
      deferred.end()
      await generationPromise
    }

    // 25 delete-during-generation cycles, each cleaned up as it settled --
    // never 25 permanently-retained entries.
    expect(getMediaThumbnailsCacheStats().invalidatedInFlightCount).toBe(0)
  })
})
