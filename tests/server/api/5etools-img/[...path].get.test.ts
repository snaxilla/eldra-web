// Unit tests for GET /api/5etools-img/*
// (server/api/5etools-img/[...path].get.ts).
//
// Content Workspaces & Studio Phase 0, Area 4. Confirmed root cause: this
// route served from a hardcoded host path with no way to tell "the whole
// dataset isn't mounted here" apart from "this one file doesn't exist" --
// both were the identical opaque 404. These tests use a REAL temporary
// directory (not a mocked fs) as the dataset root, pointed at via the new
// ELDRA_5ETOOLS_IMG_DIR override, so each test exercises the real
// stat/readFile calls the route actually makes.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import handler, { _resetDatasetImageRootAvailabilityCacheForTests } from '../../../../server/api/5etools-img/[...path].get'

function fakeEvent(path: string): H3Event {
  const headers: Record<string, string> = {}
  return {
    context: { params: { path } },
    node: {
      res: {
        setHeader: (name: string, value: string) => { headers[name] = value }
      }
    }
  } as unknown as H3Event
}

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'eldra-5etools-img-test-'))
  process.env.ELDRA_5ETOOLS_IMG_DIR = root
  _resetDatasetImageRootAvailabilityCacheForTests()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  delete process.env.ELDRA_5ETOOLS_IMG_DIR
  _resetDatasetImageRootAvailabilityCacheForTests()
})

describe('GET /api/5etools-img/*', () => {
  it('fails with 400 when no path is given', async () => {
    await expect(handler(fakeEvent(''))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('serves an existing readable image with the correct content type', async () => {
    mkdirSync(join(root, 'items', 'XPHB'), { recursive: true })
    writeFileSync(join(root, 'items', 'XPHB', 'Shortsword.png'), Buffer.from([1, 2, 3]))

    const result = await handler(fakeEvent('items/XPHB/Shortsword.png'))

    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result).toEqual(Buffer.from([1, 2, 3]))
  })

  it('reports a distinct, diagnosable 404 when the dataset root itself does not exist -- the deployment-mount case', async () => {
    rmSync(root, { recursive: true, force: true }) // the configured root is now genuinely absent

    await expect(handler(fakeEvent('items/XPHB/Shortsword.png'))).rejects.toMatchObject({
      statusCode: 404,
      data: { code: 'dataset-image-root-missing' }
    })
  })

  it('reports a distinct 404 when the root exists but the specific requested file does not', async () => {
    mkdirSync(join(root, 'items', 'XPHB'), { recursive: true }) // root is present and real

    await expect(handler(fakeEvent('items/XPHB/DoesNotExist.png'))).rejects.toMatchObject({
      statusCode: 404,
      data: { code: 'image-not-found' }
    })
  })

  it('the missing-root and missing-file cases never share the same diagnostic code', async () => {
    mkdirSync(join(root, 'items'), { recursive: true })
    let missingFileCode: unknown
    try {
      await handler(fakeEvent('items/DoesNotExist.png'))
    } catch (error) {
      missingFileCode = (error as { data?: { code?: string } }).data?.code
    }

    rmSync(root, { recursive: true, force: true })
    _resetDatasetImageRootAvailabilityCacheForTests()
    let missingRootCode: unknown
    try {
      await handler(fakeEvent('items/DoesNotExist.png'))
    } catch (error) {
      missingRootCode = (error as { data?: { code?: string } }).data?.code
    }

    expect(missingFileCode).toBe('image-not-found')
    expect(missingRootCode).toBe('dataset-image-root-missing')
    expect(missingFileCode).not.toBe(missingRootCode)
  })

  it('a leading "../" traversal attempt never escapes the configured root -- it is neutralized into a root-relative path, not actually rejected with 400', async () => {
    // Verified directly (not assumed): the existing regex strips ANY
    // number of leading "../" segments in one pass and then re-joins the
    // remainder under `root` via path.join, which never lets a traversal
    // attempt climb above root -- it is NEUTRALIZED, not detected-and-
    // rejected the way the 400 branch's own name suggests. A real file
    // placed OUTSIDE root, at the exact location a successful escape
    // would reach, proves the escape never happens: the request 404s
    // (nothing exists at the neutralized root-relative path), and the
    // secret content is never returned.
    const secretDir = mkdtempSync(join(tmpdir(), 'eldra-5etools-img-secret-'))
    writeFileSync(join(secretDir, 'secret.png'), Buffer.from('should-never-be-served'))

    try {
      const attempt = handler(fakeEvent(`../${secretDir.split('/').pop()}/secret.png`))
      await expect(attempt).rejects.toMatchObject({ statusCode: 404, data: { code: 'image-not-found' } })
    } finally {
      rmSync(secretDir, { recursive: true, force: true })
    }
  })

  it('an input that collapses to an empty path (e.g. "..") is rejected with 400, never treated as the root directory itself', async () => {
    await expect(handler(fakeEvent('..'))).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid image path' })
  })

  it('an absolute-path attempt is safely contained under the root -- path.join never lets an absolute second argument replace it', async () => {
    mkdirSync(join(root, 'items'), { recursive: true })
    // path.join(root, '/etc/passwd') resolves to `${root}/etc/passwd`, not
    // /etc/passwd -- this 404s (nothing exists there under root), never
    // reads the real /etc/passwd.
    await expect(handler(fakeEvent('/etc/passwd'))).rejects.toMatchObject({ statusCode: 404, data: { code: 'image-not-found' } })
  })

  it('memoizes the root-availability check -- a root created AFTER the first (failed) check is still reported missing until the cache resets', async () => {
    rmSync(root, { recursive: true, force: true })
    await expect(handler(fakeEvent('items/x.png'))).rejects.toMatchObject({
      data: { code: 'dataset-image-root-missing' }
    })

    // Root now exists, but the memoized check (deliberately, per this
    // file's own header -- "a mount's presence does not change while a
    // container is running") is not re-evaluated without an explicit reset.
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'x.png'), Buffer.from([9]))
    await expect(handler(fakeEvent('items/x.png'))).rejects.toMatchObject({
      data: { code: 'dataset-image-root-missing' }
    })

    _resetDatasetImageRootAvailabilityCacheForTests()
    const result = await handler(fakeEvent('x.png'))
    expect(result).toEqual(Buffer.from([9]))
  })
})
