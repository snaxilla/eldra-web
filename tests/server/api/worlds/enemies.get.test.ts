// Unit tests for the pure helper functions behind
// GET /api/worlds/:id/enemies (server/api/worlds/[id]/enemies.get.ts) --
// Species/Class Context Content pass (Enemy image restoration).
//
// Does not mock Directus/h3/the full route handler -- extractImageUrl and
// withResolvedCatalogueEnemyImages are plain data transforms, exported for
// direct coverage the same way server/api/worlds/[id]/maps/upload.post.ts's
// own MAX_MAP_UPLOAD_BYTES already is.
import { describe, expect, it, vi } from 'vitest'

// This route uses Nitro auto-imports (defineEventHandler/getRouterParam/
// createError), which do not exist under plain Vitest -- same shim already
// established in tests/server/api/worlds/[id]/presentation-settings.test.ts
// for the identical reason. Only defineEventHandler actually runs at
// import time (the module-level `export default defineEventHandler(...)`
// call); the rest are stubbed defensively since this file never invokes
// the default handler itself, only its two named helper exports.
vi.hoisted(() => Object.assign(globalThis as any, {
  defineEventHandler: (handler: any) => handler,
  getRouterParam: (event: any, name: string) => event?.context?.params?.[name],
  createError: (input: { statusCode: number; statusMessage?: string }) =>
    Object.assign(new Error(input.statusMessage || `Error ${input.statusCode}`), input)
}))

const { extractImageUrl, withResolvedCatalogueEnemyImages } = await import('../../../../server/api/worlds/[id]/enemies.get')

describe('extractImageUrl', () => {
  it('resolves a real monster fluff image block (preview5eToolsMonsters\' own overview block shape)', () => {
    const blocks = [
      { block_key: 'overview', data: { text: 'A fearsome beast.', image: { image_url: '/api/5etools-img/bestiary/XMM/Goblin.webp' } } },
      { block_key: 'source', data: { source: 'XMM', page: 1 } }
    ]
    expect(extractImageUrl(blocks)).toBe('/api/5etools-img/bestiary/XMM/Goblin.webp')
  })

  it('resolves a Directus asset id (string or {file_id}/{id}) to /api/assets/:id', () => {
    expect(extractImageUrl([{ data: { image: 'abc-123' } }])).toBe('/api/assets/abc-123')
    expect(extractImageUrl([{ data: { image: { file_id: 'abc-123' } } }])).toBe('/api/assets/abc-123')
    expect(extractImageUrl([{ data: { image: { id: 'abc-123' } } }])).toBe('/api/assets/abc-123')
  })

  it('returns null when no block carries an image -- the existing "genuinely absent" fallback', () => {
    expect(extractImageUrl([{ block_key: 'source', data: { source: 'XMM' } }])).toBeNull()
    expect(extractImageUrl([])).toBeNull()
    expect(extractImageUrl(undefined)).toBeNull()
  })
})

describe('withResolvedCatalogueEnemyImages', () => {
  it('populates imageUrl/image_url for a catalogue row whose blocks carry a real fluff image -- the actual reproduced bug', () => {
    // CatalogueBridgeEnemyRow shape (catalogue-entity-bridge.ts): image/
    // imageUrl/image_url hardcoded null regardless of what `blocks` itself
    // carries -- this is the exact row shape getCatalogueBackedEnemyRows
    // produces for a real monster with fluff art.
    const rows = [{
      id: 'catalogue:eldra.test:goblin-xmm',
      title: 'Goblin',
      slug: 'goblin-xmm',
      imageUrl: null,
      image_url: null,
      blocks: [{ block_key: 'overview', data: { image: { image_url: '/api/5etools-img/bestiary/XMM/Goblin.webp' } } }]
    }]

    const resolved = withResolvedCatalogueEnemyImages(rows)
    expect(resolved[0].imageUrl).toBe('/api/5etools-img/bestiary/XMM/Goblin.webp')
    expect(resolved[0].image_url).toBe('/api/5etools-img/bestiary/XMM/Goblin.webp')
  })

  it('preserves the existing fallback: a catalogue row with no image anywhere in its blocks stays imageless', () => {
    const rows = [{ id: 'catalogue:eldra.test:rat-xmm', imageUrl: null, image_url: null, blocks: [{ block_key: 'overview', data: { text: 'A rat.' } }] }]
    const resolved = withResolvedCatalogueEnemyImages(rows)
    expect(resolved[0].imageUrl).toBeNull()
    expect(resolved[0].image_url).toBeNull()
  })

  it('does not mutate the input rows (returns new objects)', () => {
    const rows = [{ id: 'x', imageUrl: null, image_url: null, blocks: [{ data: { image: { image_url: '/api/assets/1' } } }] }]
    const resolved = withResolvedCatalogueEnemyImages(rows)
    expect(resolved).not.toBe(rows)
    expect(rows[0].imageUrl).toBeNull()
    expect(resolved[0].imageUrl).toBe('/api/assets/1')
  })

  it('resolves distinctly-shaped images independently for two different enemies (no cross-contamination)', () => {
    const rows = [
      { id: 'a', imageUrl: null, image_url: null, blocks: [{ data: { image: { image_url: '/api/5etools-img/a.webp' } } }] },
      { id: 'b', imageUrl: null, image_url: null, blocks: [{ data: { image: { image_url: '/api/5etools-img/b.webp' } } }] }
    ]
    const resolved = withResolvedCatalogueEnemyImages(rows)
    expect(resolved[0].imageUrl).toBe('/api/5etools-img/a.webp')
    expect(resolved[1].imageUrl).toBe('/api/5etools-img/b.webp')
  })
})
