// resolvePortableAssetRef -- the one place an authored image ref is
// checked against a World's gallery ownership before it is ever shown.
// What matters: never broaden access across Worlds, never pretend a
// missing/unsupported ref resolved, and treat explicit suppression
// (`null`) as distinct from every failure mode.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolvePortableAssetRef } from '../../../server/utils/content-presentation-assets'

const { directusServiceRequestMock } = vi.hoisted(() => ({ directusServiceRequestMock: vi.fn() }))
vi.mock('../../../server/utils/directus', () => ({ directusServiceRequest: directusServiceRequestMock }))

const WORLD_ID = '4'
const OTHER_WORLD_ID = '6'

beforeEach(() => {
  directusServiceRequestMock.mockReset()
})

describe('resolvePortableAssetRef', () => {
  it('ref === null is explicit author suppression -- no image, not unavailable', async () => {
    const result = await resolvePortableAssetRef(null, WORLD_ID)
    expect(result).toEqual({ image: null, unavailable: false })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('ref === undefined is a safe no-op', async () => {
    const result = await resolvePortableAssetRef(undefined, WORLD_ID)
    expect(result).toEqual({ image: null, unavailable: false })
  })

  it('resolves a media ref whose file belongs to the requested World', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: { id: 'file-1', width: 100, height: 200, world_id: Number(WORLD_ID) } })
    const result = await resolvePortableAssetRef({ kind: 'media', fileId: 'file-1' }, WORLD_ID)
    expect(result).toEqual({ image: { url: '/api/assets/file-1', width: 100, height: 200 }, unavailable: false })
  })

  it('never broadens access -- a file belonging to a DIFFERENT World is reported unavailable, never served', async () => {
    directusServiceRequestMock.mockResolvedValueOnce({ data: { id: 'file-1', world_id: Number(OTHER_WORLD_ID) } })
    const result = await resolvePortableAssetRef({ kind: 'media', fileId: 'file-1' }, WORLD_ID)
    expect(result).toEqual({ image: null, unavailable: true, unavailableReason: 'world-scope-mismatch' })
  })

  it('a missing file is unavailable, not an error', async () => {
    directusServiceRequestMock.mockRejectedValueOnce(Object.assign(new Error('not found'), { statusCode: 403 }))
    const result = await resolvePortableAssetRef({ kind: 'media', fileId: 'nope' }, WORLD_ID)
    expect(result).toEqual({ image: null, unavailable: true, unavailableReason: 'not-found' })
  })

  it('with no World context, a media ref can never resolve -- never guesses a World', async () => {
    const result = await resolvePortableAssetRef({ kind: 'media', fileId: 'file-1' }, null)
    expect(result).toEqual({ image: null, unavailable: true, unavailableReason: 'world-scope-mismatch' })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it.each(['pack', 'dataset', 'external'] as const)('kind %s is not resolvable this phase -- reported unavailable, never guessed', async (kind) => {
    const ref = kind === 'pack' ? { kind, assetId: 'a' } : kind === 'dataset' ? { kind, path: 'p' } : { kind, url: 'https://x' }
    const result = await resolvePortableAssetRef(ref as never, WORLD_ID)
    expect(result).toEqual({ image: null, unavailable: true, unavailableReason: 'unsupported-kind' })
  })
})
