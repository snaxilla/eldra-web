// Unit tests for app/lib/world-entity-collection/direct-edit-navigation.ts
// -- the pure draft-transfer and return-path-validation helpers behind
// Quick Edit's "Open full editor" action.

import { beforeEach, describe, expect, it } from 'vitest'
import {
  consumeDraftTransfer,
  DIRECT_EDIT_DRAFT_TRANSFER_KEY,
  isSafeCollectionReturnPath,
  writeDraftTransfer
} from '../../../app/lib/world-entity-collection/direct-edit-navigation'

function fakeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
    clear: () => data.clear(),
    key: () => null,
    get length() { return data.size }
  } as Storage
}

describe('writeDraftTransfer / consumeDraftTransfer', () => {
  let storage: Storage
  beforeEach(() => { storage = fakeStorage() })

  it('round-trips a payload for the exact matching entity', () => {
    writeDraftTransfer(storage, {
      worldId: '4', entityType: 'item', slug: 'shortsword-xphb',
      name: 'Renamed Shortsword', nameDirty: true,
      image: { fileId: 'f1', url: 'https://x/f1.png' }, imageDirty: true
    })
    const result = consumeDraftTransfer(storage, { worldId: '4', entityType: 'item', slug: 'shortsword-xphb' })
    expect(result).toEqual({
      worldId: '4', entityType: 'item', slug: 'shortsword-xphb',
      name: 'Renamed Shortsword', nameDirty: true,
      image: { fileId: 'f1', url: 'https://x/f1.png' }, imageDirty: true
    })
  })

  it('clears the key on read -- single-use, never reapplied on a later visit', () => {
    writeDraftTransfer(storage, { worldId: '4', entityType: 'item', slug: 's', name: 'x', nameDirty: true, image: undefined, imageDirty: false })
    consumeDraftTransfer(storage, { worldId: '4', entityType: 'item', slug: 's' })
    expect(storage.getItem(DIRECT_EDIT_DRAFT_TRANSFER_KEY)).toBeNull()
    expect(consumeDraftTransfer(storage, { worldId: '4', entityType: 'item', slug: 's' })).toBeNull()
  })

  it('refuses a payload for a DIFFERENT entity than the one actually loaded', () => {
    writeDraftTransfer(storage, { worldId: '4', entityType: 'item', slug: 'shortsword-xphb', name: 'x', nameDirty: true, image: undefined, imageDirty: false })
    expect(consumeDraftTransfer(storage, { worldId: '4', entityType: 'item', slug: 'longsword-xphb' })).toBeNull()
  })

  it('refuses a payload for a DIFFERENT World, even with the same entityType/slug', () => {
    writeDraftTransfer(storage, { worldId: '4', entityType: 'item', slug: 'shortsword-xphb', name: 'x', nameDirty: true, image: undefined, imageDirty: false })
    expect(consumeDraftTransfer(storage, { worldId: '6', entityType: 'item', slug: 'shortsword-xphb' })).toBeNull()
  })

  it('returns null, not a throw, for missing/malformed stored data', () => {
    expect(consumeDraftTransfer(storage, { worldId: '4', entityType: 'item', slug: 's' })).toBeNull()
    storage.setItem(DIRECT_EDIT_DRAFT_TRANSFER_KEY, 'not json')
    expect(consumeDraftTransfer(storage, { worldId: '4', entityType: 'item', slug: 's' })).toBeNull()
  })

  it('only name was touched -- nameDirty true, imageDirty false, image comes back as whatever was stored (undefined)', () => {
    writeDraftTransfer(storage, { worldId: '4', entityType: 'item', slug: 's', name: 'New Name', nameDirty: true, image: undefined, imageDirty: false })
    const result = consumeDraftTransfer(storage, { worldId: '4', entityType: 'item', slug: 's' })
    expect(result?.nameDirty).toBe(true)
    expect(result?.imageDirty).toBe(false)
  })
})

describe('isSafeCollectionReturnPath', () => {
  it('accepts the World\'s own root and nested category paths', () => {
    expect(isSafeCollectionReturnPath('/worlds/4', '4')).toBe(true)
    expect(isSafeCollectionReturnPath('/worlds/4/items', '4')).toBe(true)
    expect(isSafeCollectionReturnPath('/worlds/4/items?q=sword&view=grid', '4')).toBe(true)
  })

  it('refuses a path for a DIFFERENT World', () => {
    expect(isSafeCollectionReturnPath('/worlds/6/items', '4')).toBe(false)
  })

  it('refuses protocol-relative and absolute external URLs (open-redirect shapes)', () => {
    expect(isSafeCollectionReturnPath('//evil.example.com/worlds/4/items', '4')).toBe(false)
    expect(isSafeCollectionReturnPath('https://evil.example.com/worlds/4/items', '4')).toBe(false)
    expect(isSafeCollectionReturnPath('http://evil.example.com', '4')).toBe(false)
  })

  it('refuses a path that does not even start with /', () => {
    expect(isSafeCollectionReturnPath('worlds/4/items', '4')).toBe(false)
  })

  it('refuses backslash tricks', () => {
    expect(isSafeCollectionReturnPath('/worlds/4/items\\@evil.com', '4')).toBe(false)
  })

  it('refuses non-string/missing input', () => {
    expect(isSafeCollectionReturnPath(undefined, '4')).toBe(false)
    expect(isSafeCollectionReturnPath(null, '4')).toBe(false)
    expect(isSafeCollectionReturnPath('', '4')).toBe(false)
  })
})
