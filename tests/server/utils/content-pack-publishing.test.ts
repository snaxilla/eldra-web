// Unit tests for Content Pack Publishing
// (server/utils/content-pack-publishing.ts, Content Pack Publishing
// phase). publishContentPackRelease (./content-packs) is mocked directly
// for the orchestration tests; validateContentPackForPublication and
// buildContentPackManifest are pure and tested with no mocking at all.
//
// Deliberately imports NOTHING from app/lib/importers -- that is the whole
// point of the seam this file exercises. Fixtures are built directly from
// ContentPublicationCandidate, the module's own contract, never from
// EldraImportPreviewEntity/EldraImportPreviewResult.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { publishContentPackReleaseMock } = vi.hoisted(() => ({
  publishContentPackReleaseMock: vi.fn()
}))

vi.mock('../../../server/utils/content-packs', async () => {
  const actual = await vi.importActual<typeof import('../../../server/utils/content-packs')>(
    '../../../server/utils/content-packs'
  )
  return {
    ...actual,
    publishContentPackRelease: publishContentPackReleaseMock
  }
})

import {
  buildContentPackManifest,
  publishContentPack,
  validateContentPackForPublication,
  type ContentPackPublicationIdentity,
  type ContentPublicationCandidate
} from '../../../server/utils/content-pack-publishing'

function candidate(overrides: Partial<ContentPublicationCandidate> = {}): ContentPublicationCandidate {
  return {
    systemKey: 'dnd5e',
    entityType: 'item',
    title: 'Longsword',
    slug: 'longsword-phb',
    externalId: 'item__Longsword__PHB',
    provider: '5etools-json',
    sourceBook: 'PHB',
    sourcePage: '149',
    data: { name: 'Longsword' },
    ...overrides
  }
}

function identity(overrides: Partial<ContentPackPublicationIdentity> = {}): ContentPackPublicationIdentity {
  return {
    packageId: 'eldra.srd-5.1',
    version: '1.0.0',
    title: 'SRD 5.1',
    license: { id: 'CC-BY-4.0' },
    ...overrides
  }
}

beforeEach(() => {
  publishContentPackReleaseMock.mockReset()
})

describe('validateContentPackForPublication -- valid input', () => {
  it('accepts a well-formed pack with at least one candidate', () => {
    const result = validateContentPackForPublication(identity(), [candidate()])
    expect(result.ok).toBe(true)
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  it('never inspects candidate.data', () => {
    // A candidate whose data is deliberately malformed/empty must still
    // validate -- this module has no opinion on gameplay content shape.
    const result = validateContentPackForPublication(identity(), [candidate({ data: null })])
    expect(result.ok).toBe(true)
  })
})

describe('validateContentPackForPublication -- package identity', () => {
  it('rejects a missing packageId', () => {
    const result = validateContentPackForPublication(identity({ packageId: '' }), [candidate()])
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.code === 'invalid-package-id')).toBe(true)
  })

  it('rejects a packageId with no dot-separated segments', () => {
    const result = validateContentPackForPublication(identity({ packageId: 'srd' }), [candidate()])
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.code === 'invalid-package-id')).toBe(true)
  })

  it('accepts a packageId shaped like eldra.srd-5.1', () => {
    const result = validateContentPackForPublication(identity({ packageId: 'eldra.srd-5.1' }), [candidate()])
    expect(result.issues.some((i) => i.code === 'invalid-package-id')).toBe(false)
  })

  it('rejects a non-semver version', () => {
    const result = validateContentPackForPublication(identity({ version: 'latest' }), [candidate()])
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.code === 'invalid-version')).toBe(true)
  })

  it('rejects a missing title', () => {
    const result = validateContentPackForPublication(identity({ title: '  ' }), [candidate()])
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.code === 'missing-title')).toBe(true)
  })

  it('rejects a missing license', () => {
    const result = validateContentPackForPublication(identity({ license: null }), [candidate()])
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.code === 'missing-license')).toBe(true)
  })

  it('rejects a license with an empty id', () => {
    const result = validateContentPackForPublication(identity({ license: { id: '' } }), [candidate()])
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.code === 'missing-license')).toBe(true)
  })
})

describe('validateContentPackForPublication -- candidates', () => {
  it('rejects a pack with zero candidates', () => {
    const result = validateContentPackForPublication(identity(), [])
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.code === 'empty-content')).toBe(true)
  })

  it('rejects a candidate missing a required identity field', () => {
    const result = validateContentPackForPublication(identity(), [candidate({ slug: '' })])
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.code === 'incomplete-candidate')).toBe(true)
  })

  it('rejects two candidates that share (systemKey, entityType, slug)', () => {
    const result = validateContentPackForPublication(identity(), [
      candidate({ title: 'Longsword' }),
      candidate({ title: 'Longsword (Duplicate)' })
    ])
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.code === 'duplicate-candidate')).toBe(true)
  })

  it('does not flag candidates with the same slug but a different entityType as duplicates', () => {
    const result = validateContentPackForPublication(identity(), [
      candidate({ slug: 'fire', entityType: 'item', title: 'Fire' }),
      candidate({ slug: 'fire', entityType: 'spell', title: 'Fire' })
    ])
    expect(result.issues.some((i) => i.code === 'duplicate-candidate')).toBe(false)
  })

  it('accepts candidates merged across multiple entity types', () => {
    const result = validateContentPackForPublication(identity(), [
      candidate({ entityType: 'item', slug: 'longsword' }),
      candidate({ entityType: 'spell', slug: 'fireball', title: 'Fireball' })
    ])
    expect(result.ok).toBe(true)
  })
})

describe('buildContentPackManifest', () => {
  it('builds a manifest with status forced to published regardless of input', () => {
    const manifest = buildContentPackManifest({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      license: { id: 'CC-BY-4.0' }
    })

    expect(manifest.status).toBe('published')
  })

  it('does not invent an origin when the caller supplies none', () => {
    const manifest = buildContentPackManifest({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      license: { id: 'CC-BY-4.0' }
    })

    expect(manifest.origin).toBeUndefined()
  })

  it('carries a caller-supplied origin through unchanged', () => {
    const manifest = buildContentPackManifest({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      license: { id: 'CC-BY-4.0' },
      origin: { kind: 'translated', adapterId: '5etools-json' }
    })

    expect(manifest.origin).toEqual({ kind: 'translated', adapterId: '5etools-json' })
  })

  it('defaults contentSchemaVersion to 1 when not supplied', () => {
    const manifest = buildContentPackManifest({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      license: { id: 'CC-BY-4.0' }
    })

    expect(manifest.contentSchemaVersion).toBe(1)
  })

  it('honors an explicit contentSchemaVersion', () => {
    const manifest = buildContentPackManifest({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      license: { id: 'CC-BY-4.0' },
      contentSchemaVersion: 3
    })

    expect(manifest.contentSchemaVersion).toBe(3)
  })

  it('carries packageId/version/title/description/license through unchanged', () => {
    const manifest = buildContentPackManifest({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      description: 'The 5.1 System Reference Document',
      license: { id: 'CC-BY-4.0', attribution: 'Wizards of the Coast' }
    })

    expect(manifest.packageId).toBe('eldra.srd-5.1')
    expect(manifest.version).toBe('1.0.0')
    expect(manifest.title).toBe('SRD 5.1')
    expect(manifest.description).toBe('The 5.1 System Reference Document')
    expect(manifest.license).toEqual({ id: 'CC-BY-4.0', attribution: 'Wizards of the Coast' })
  })
})

describe('publishContentPack -- validation failure blocks publish', () => {
  it('never calls publishContentPackRelease when validation fails', async () => {
    const result = await publishContentPack({
      packageId: '',
      version: '1.0.0',
      title: 'SRD 5.1',
      license: { id: 'CC-BY-4.0' },
      candidates: [candidate()]
    })

    expect(result.published).toBe(false)
    if (result.published) throw new Error('expected validation failure')
    expect(result.stage).toBe('validation')
    expect(result.issues.some((i) => i.code === 'invalid-package-id')).toBe(true)
    expect(publishContentPackReleaseMock).not.toHaveBeenCalled()
  })
})

describe('publishContentPack -- successful publish', () => {
  it('publishes and returns the published package', async () => {
    publishContentPackReleaseMock.mockResolvedValue({
      ok: true,
      package: {
        packageId: 'eldra.srd-5.1',
        version: '1.0.0',
        manifest: { packageId: 'eldra.srd-5.1', version: '1.0.0', status: 'published', contentSchemaVersion: 1, title: 'SRD 5.1', license: { id: 'CC-BY-4.0' } },
        content: [candidate()],
        integrityHash: 'sha256-abc'
      }
    })

    const result = await publishContentPack({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      license: { id: 'CC-BY-4.0' },
      candidates: [candidate()]
    })

    expect(result.published).toBe(true)
    if (!result.published) throw new Error('expected success')
    expect(result.package.integrityHash).toBe('sha256-abc')
  })

  it('surfaces caller-supplied warnings as opaque, unmodified advisory issues', async () => {
    publishContentPackReleaseMock.mockResolvedValue({
      ok: true,
      package: { packageId: 'eldra.srd-5.1', version: '1.0.0', manifest: {} as any, content: [], integrityHash: 'sha256-abc' }
    })

    const result = await publishContentPack({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      license: { id: 'CC-BY-4.0' },
      candidates: [candidate()],
      warnings: ['[items] Skipped 1 malformed entry']
    })

    expect(result.published).toBe(true)
    if (!result.published) throw new Error('expected success')
    expect(result.issues).toEqual([
      { severity: 'warning', code: 'external', message: '[items] Skipped 1 malformed entry' }
    ])
  })

  it('passes the candidates through as content, unchanged', async () => {
    publishContentPackReleaseMock.mockResolvedValue({
      ok: true,
      package: { packageId: 'eldra.srd-5.1', version: '1.0.0', manifest: {} as any, content: [], integrityHash: 'sha256-abc' }
    })

    const candidates = [
      candidate({ entityType: 'item', slug: 'longsword' }),
      candidate({ entityType: 'spell', slug: 'fireball', title: 'Fireball' })
    ]

    await publishContentPack({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      license: { id: 'CC-BY-4.0' },
      candidates
    })

    const call = publishContentPackReleaseMock.mock.calls[0]![0]
    expect(call.content).toBe(candidates)
  })

  it('builds and forwards the manifest, never letting the caller set status', async () => {
    publishContentPackReleaseMock.mockResolvedValue({
      ok: true,
      package: { packageId: 'eldra.srd-5.1', version: '1.0.0', manifest: {} as any, content: [], integrityHash: 'sha256-abc' }
    })

    await publishContentPack({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      license: { id: 'CC-BY-4.0' },
      candidates: [candidate()]
    })

    const call = publishContentPackReleaseMock.mock.calls[0]![0]
    expect(call.manifest.status).toBe('published')
  })

  it('forwards a caller-supplied origin into the manifest unchanged', async () => {
    publishContentPackReleaseMock.mockResolvedValue({
      ok: true,
      package: { packageId: 'eldra.srd-5.1', version: '1.0.0', manifest: {} as any, content: [], integrityHash: 'sha256-abc' }
    })

    await publishContentPack({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      license: { id: 'CC-BY-4.0' },
      candidates: [candidate()],
      origin: { kind: 'translated', adapterId: '5etools-json' }
    })

    const call = publishContentPackReleaseMock.mock.calls[0]![0]
    expect(call.manifest.origin).toEqual({ kind: 'translated', adapterId: '5etools-json' })
  })
})

describe('publishContentPack -- duplicate publish', () => {
  it('surfaces already-exists without throwing', async () => {
    publishContentPackReleaseMock.mockResolvedValue({
      ok: false,
      stage: 'already-exists',
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      status: 'published'
    })

    const result = await publishContentPack({
      packageId: 'eldra.srd-5.1',
      version: '1.0.0',
      title: 'SRD 5.1',
      license: { id: 'CC-BY-4.0' },
      candidates: [candidate()]
    })

    expect(result.published).toBe(false)
    if (result.published) throw new Error('expected already-exists')
    expect(result.stage).toBe('already-exists')
    expect(result.status).toBe('published')
  })
})
