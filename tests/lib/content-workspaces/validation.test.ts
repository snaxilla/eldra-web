// Content Workspace request validation -- Phase 3.
//
// The PATCH allowlist is the important one: a generic metadata endpoint
// must not be a way to rewrite identity, provenance, or publication
// state, and a field it refuses must be refused LOUDLY rather than
// dropped.

import { describe, expect, it } from 'vitest'

import {
  validateEntityListFilter,
  validateImportRequest,
  validatePageRequest,
  validateWorkspaceCreate,
  validateWorkspacePatch,
  validateContentEntityIdParam,
  validatePackageIdParam,
  isWorkspaceId,
  WORKSPACE_PAGE_MAX_LIMIT
} from '../../../app/lib/content-workspaces/validation'

const SYSTEMS = ['dnd5e', 'pf2e']

describe('validateWorkspaceCreate', () => {
  it('accepts a well-formed workspace', () => {
    const result = validateWorkspaceCreate({ workspaceKey: 'solaris-xphb', title: ' Solaris XPHB ', description: 'Curated', systemKey: 'dnd5e' }, SYSTEMS)
    expect(result).toEqual({ ok: true, value: { workspaceKey: 'solaris-xphb', title: 'Solaris XPHB', description: 'Curated', systemKey: 'dnd5e' } })
  })

  it('rejects an unregistered game system rather than creating an unusable workspace', () => {
    const result = validateWorkspaceCreate({ workspaceKey: 'abc', title: 'T', systemKey: 'made-up' }, SYSTEMS)
    expect(result.ok).toBe(false)
    expect((result as { problems: string[] }).problems.join()).toContain('systemKey must be one of')
  })

  it.each([['', 'empty'], ['ab', 'too short'], ['-leading', 'leading hyphen'], ['Upper', 'uppercase'], ['has space', 'space'], ['a'.repeat(80), 'too long']])(
    'rejects the workspace key %j (%s)',
    (key) => {
      expect(validateWorkspaceCreate({ workspaceKey: key, title: 'T', systemKey: 'dnd5e' }, SYSTEMS).ok).toBe(false)
    }
  )

  it('requires a title', () => {
    expect(validateWorkspaceCreate({ workspaceKey: 'abc', title: '   ', systemKey: 'dnd5e' }, SYSTEMS).ok).toBe(false)
  })

  it('rejects a non-object body', () => {
    expect(validateWorkspaceCreate('nope', SYSTEMS).ok).toBe(false)
    expect(validateWorkspaceCreate(null, SYSTEMS).ok).toBe(false)
  })
})

describe('validateWorkspacePatch -- the allowlist', () => {
  it('accepts the three mutable metadata fields', () => {
    expect(validateWorkspacePatch({ title: 'New', description: 'd', status: 'archived' })).toEqual({
      ok: true, value: { title: 'New', description: 'd', status: 'archived' }
    })
  })

  it.each([
    'workspaceKey', 'systemKey', 'id', 'ownerAccountId', 'owner_account_id',
    'createdAt', 'updatedAt', 'baseData', 'base_data', 'baseRefs', 'slugAliases',
    'authoredPresentation', 'authoredMechanics', 'authoredFacet',
    'sourceGameSystemKey', 'publishesPackageId', 'contentEntityId'
  ])('REFUSES %s rather than silently ignoring it', (field) => {
    const result = validateWorkspacePatch({ title: 'ok', [field]: 'anything' })
    expect(result.ok).toBe(false)
    expect((result as { problems: string[] }).problems.join()).toContain(`'${field}' cannot be changed`)
  })

  it('rejects an unknown status', () => {
    expect(validateWorkspacePatch({ status: 'published' }).ok).toBe(false)
  })

  it('rejects an empty patch instead of reporting a successful no-op', () => {
    const result = validateWorkspacePatch({})
    expect(result.ok).toBe(false)
    expect((result as { problems: string[] }).problems).toContain('nothing to change')
  })

  it('normalizes an empty description to null rather than an empty string', () => {
    expect(validateWorkspacePatch({ description: '' })).toEqual({ ok: true, value: { description: null } })
  })
})

describe('validatePageRequest', () => {
  it('defaults to a bounded page', () => {
    expect(validatePageRequest({})).toEqual({ ok: true, value: { limit: 50, offset: 0 } })
  })

  it('caps the page size so a whole library cannot be fetched at once', () => {
    expect(validatePageRequest({ limit: String(WORKSPACE_PAGE_MAX_LIMIT + 1) }).ok).toBe(false)
    expect(validatePageRequest({ limit: '-1' }).ok).toBe(false)
    expect(validatePageRequest({ limit: '0' }).ok).toBe(false)
  })

  it('rejects a non-numeric page', () => {
    expect(validatePageRequest({ offset: 'abc' }).ok).toBe(false)
  })
})

describe('validateEntityListFilter', () => {
  it('accepts an entity type and a search term', () => {
    expect(validateEntityListFilter({ entityType: 'item', q: ' sword ' })).toEqual({ ok: true, value: { entityType: 'item', search: 'sword' } })
  })

  it('rejects a malformed entity type', () => {
    expect(validateEntityListFilter({ entityType: 'a::b' }).ok).toBe(false)
  })

  it('rejects an overlong search term', () => {
    expect(validateEntityListFilter({ q: 'x'.repeat(200) }).ok).toBe(false)
  })
})

describe('validateImportRequest', () => {
  it('accepts a release source', () => {
    expect(validateImportRequest({ source: { kind: 'release', packageId: 'eldra.solaris.xphb', version: '1.0.38' } })).toEqual({
      ok: true, value: { dryRun: false, source: { kind: 'release', packageId: 'eldra.solaris.xphb', version: '1.0.38' } }
    })
  })

  it('accepts a provider source, with categories de-duplicated', () => {
    const result = validateImportRequest({ dryRun: true, source: { kind: 'provider', gameSystemKey: 'dnd5e', collectionKey: 'xphb', categories: ['items', 'items', 'spells'] } })
    expect(result).toMatchObject({ ok: true, value: { dryRun: true, source: { categories: ['items', 'spells'] } } })
  })

  it('rejects a malformed package or version', () => {
    expect(validateImportRequest({ source: { kind: 'release', packageId: 'nodots', version: '1.0.0' } }).ok).toBe(false)
    expect(validateImportRequest({ source: { kind: 'release', packageId: 'a.b', version: 'latest' } }).ok).toBe(false)
  })

  it('rejects an unknown source kind', () => {
    expect(validateImportRequest({ source: { kind: 'workspace', workspaceId: 'x' } }).ok).toBe(false)
    expect(validateImportRequest({ source: {} }).ok).toBe(false)
    expect(validateImportRequest({}).ok).toBe(false)
  })

  it('rejects an empty category list rather than treating it as "everything"', () => {
    expect(validateImportRequest({ source: { kind: 'provider', gameSystemKey: 'dnd5e', collectionKey: 'xphb', categories: [] } }).ok).toBe(false)
  })
})

describe('param validators', () => {
  it('accepts only a well-formed content entity id', () => {
    expect(validateContentEntityIdParam('ce_abcdefghijklmnopqrstuvwxyz').ok).toBe(true)
    expect(validateContentEntityIdParam('shortsword').ok).toBe(false)
  })

  it('accepts only a reverse-DNS package id', () => {
    expect(validatePackageIdParam('eldra.solaris.xphb').ok).toBe(true)
    expect(validatePackageIdParam('nodots').ok).toBe(false)
  })

  it('accepts only a uuid workspace id', () => {
    expect(isWorkspaceId('3f1451cb-fa22-4559-badc-f36e85a7af64')).toBe(true)
    expect(isWorkspaceId('not-a-uuid')).toBe(false)
  })
})
