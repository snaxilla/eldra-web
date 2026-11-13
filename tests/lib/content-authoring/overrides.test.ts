import { describe, expect, it } from 'vitest'
import {
  PRESENTATION_OVERRIDE_PATHS,
  buildSparseObject,
  diffOverrides,
  emptyChannel,
  isPrototypePollutingPath,
  isValidOverridePath,
  removeOverridePath,
  setPath,
  upsertOverride,
  type FieldOverride
} from '../../../app/lib/content-authoring/overrides'

const NOW = '2026-01-01T00:00:00Z'

function override(path: string, value: unknown, overrides: Partial<FieldOverride> = {}): FieldOverride {
  return { channel: 'presentation', path, value, authoredBy: 'acct-1', authoredAt: NOW, baseValueHash: null, ...overrides }
}

describe('isValidOverridePath', () => {
  it('accepts every path in the presentation allowlist', () => {
    for (const path of PRESENTATION_OVERRIDE_PATHS) {
      expect(isValidOverridePath('presentation', path)).toBe(true)
    }
  })

  it('rejects a path not in the presentation allowlist -- the protected-field guarantee', () => {
    expect(isValidOverridePath('presentation', 'data')).toBe(false)
    expect(isValidOverridePath('presentation', 'rulesFacet')).toBe(false)
    expect(isValidOverridePath('presentation', 'externalId')).toBe(false)
  })

  it('rejects prototype-polluting segments even under an otherwise-allowed root', () => {
    expect(isValidOverridePath('presentation', 'description.__proto__')).toBe(false)
    expect(isValidOverridePath('presentation', '__proto__')).toBe(false)
    expect(isValidOverridePath('presentation', 'constructor.prototype')).toBe(false)
  })

  it('rejects empty or malformed paths', () => {
    expect(isValidOverridePath('presentation', '')).toBe(false)
    expect(isValidOverridePath('presentation', 'name.')).toBe(false)
    expect(isValidOverridePath('presentation', '.name')).toBe(false)
  })
})

describe('isPrototypePollutingPath', () => {
  it.each(['__proto__', 'constructor', 'prototype', 'a.__proto__', '__proto__.b', 'a.constructor.b'])(
    'flags %s',
    (path) => expect(isPrototypePollutingPath(path)).toBe(true)
  )

  it.each(['name', 'description', 'a.b.c'])('does not flag %s', (path) => expect(isPrototypePollutingPath(path)).toBe(false))
})

describe('setPath', () => {
  it('sets a top-level path', () => {
    const target: Record<string, unknown> = {}
    setPath(target, 'name', 'Shortsword')
    expect(target).toEqual({ name: 'Shortsword' })
  })

  it('creates intermediate objects for a nested path', () => {
    const target: Record<string, unknown> = {}
    setPath(target, 'a.b.c', 1)
    expect(target).toEqual({ a: { b: { c: 1 } } })
  })

  it('refuses to set a prototype-polluting path', () => {
    const target: Record<string, unknown> = {}
    expect(() => setPath(target, '__proto__.polluted', true)).toThrow(/prototype-polluting/)
    expect(() => setPath(target, 'a.constructor.polluted', true)).toThrow(/prototype-polluting/)
    // Confirm nothing leaked onto the real prototype even on the throwing path.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('upsertOverride / removeOverridePath / emptyChannel', () => {
  it('inserts a new override and returns a NEW array', () => {
    const before: FieldOverride[] = []
    const after = upsertOverride(before, { channel: 'presentation', path: 'name', value: 'New Name', authoredBy: 'acct-1', baseValueHash: 'sha256-x' }, NOW)
    expect(before).toEqual([])
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ channel: 'presentation', path: 'name', value: 'New Name', authoredAt: NOW })
  })

  it('replaces an existing override at the same path rather than duplicating it', () => {
    const before = [override('name', 'First')]
    const after = upsertOverride(before, { channel: 'presentation', path: 'name', value: 'Second', authoredBy: 'acct-1', baseValueHash: null }, NOW)
    expect(after).toHaveLength(1)
    expect(after[0].value).toBe('Second')
  })

  it('orders deterministically by channel then path', () => {
    const after = upsertOverride(
      upsertOverride([], { channel: 'presentation', path: 'sourceBook', value: 'XPHB', authoredBy: null, baseValueHash: null }, NOW),
      { channel: 'presentation', path: 'description', value: ['x'], authoredBy: null, baseValueHash: null },
      NOW
    )
    expect(after.map((o) => o.path)).toEqual(['description', 'sourceBook'])
  })

  it('removeOverridePath removes exactly the matching channel+path', () => {
    const before = [override('name', 'A'), override('description', ['B'])]
    const after = removeOverridePath(before, 'presentation', 'name')
    expect(after).toEqual([override('description', ['B'])])
  })

  it('emptyChannel removes every override in that channel and nothing else', () => {
    const before: FieldOverride[] = [
      override('name', 'A'),
      { ...override('mechanics-ish', 1), channel: 'mechanics' }
    ]
    const after = emptyChannel(before, 'presentation')
    expect(after).toHaveLength(1)
    expect(after[0].channel).toBe('mechanics')
  })
})

describe('buildSparseObject', () => {
  it('reconstructs a sparse overlay object from a FieldOverride list', () => {
    const overrides = [override('name', 'Fine Shortsword'), override('image', { kind: 'media', fileId: 'f1' })]
    expect(buildSparseObject(overrides, 'presentation')).toEqual({ name: 'Fine Shortsword', image: { kind: 'media', fileId: 'f1' } })
  })

  it('represents an explicit null override (suppression) distinctly from absence', () => {
    const overrides = [override('image', null)]
    const sparse = buildSparseObject(overrides, 'presentation')
    expect(Object.prototype.hasOwnProperty.call(sparse, 'image')).toBe(true)
    expect(sparse.image).toBeNull()
  })

  it('returns an empty object when there is nothing in that channel', () => {
    expect(buildSparseObject([], 'presentation')).toEqual({})
  })
})

describe('diffOverrides', () => {
  it('reports an added path', () => {
    const diff = diffOverrides([], [override('name', 'New')])
    expect(diff).toEqual([{ channel: 'presentation', path: 'name', from: undefined, to: 'New' }])
  })

  it('reports a removed path', () => {
    const diff = diffOverrides([override('name', 'Old')], [])
    expect(diff).toEqual([{ channel: 'presentation', path: 'name', from: 'Old', to: undefined }])
  })

  it('reports a changed value and omits unchanged paths', () => {
    const before = [override('name', 'Old'), override('description', ['same'])]
    const after = [override('name', 'New'), override('description', ['same'])]
    const diff = diffOverrides(before, after)
    expect(diff).toEqual([{ channel: 'presentation', path: 'name', from: 'Old', to: 'New' }])
  })
})
