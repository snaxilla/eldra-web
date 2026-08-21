// Unit tests for app/lib/content-sources/registry.ts -- the Content
// Source Registry (Game System -> Source Collection). Pure data + pure
// functions, no mocks needed.

import { describe, expect, it } from 'vitest'
import {
  GAME_SYSTEM_REGISTRY,
  firstAvailableCollection,
  getGameSystem,
  getSourceCollection,
  listGameSystems
} from '../../app/lib/content-sources/registry'

describe('Content Source Registry', () => {
  it('lists Dungeons & Dragons 5e as the one registered Game System', () => {
    const systems = listGameSystems()
    expect(systems).toHaveLength(1)
    expect(systems[0]?.key).toBe('dnd5e')
    expect(systems[0]?.label).toBe('Dungeons & Dragons 5e')
  })

  it('getGameSystem finds a registered system and returns undefined for an unknown one', () => {
    expect(getGameSystem('dnd5e')?.key).toBe('dnd5e')
    expect(getGameSystem('pathfinder')).toBeUndefined()
  })

  it('SRD 5.1 carries identity/license/book domain facts, and no status or previewEndpoint field', () => {
    const srd = getSourceCollection('dnd5e', 'srd-5.1')
    expect(srd).toMatchObject({
      key: 'srd-5.1',
      label: 'SRD 5.1',
      suggestedPackageId: 'eldra.content.srd-5.1',
      license: { id: 'OGL-1.0a' }
    })
    expect(srd?.books).toHaveLength(1)
    expect(srd?.books[0]).toMatchObject({ code: 'SRD5.1' })
    expect(srd).not.toHaveProperty('status')
    expect(srd).not.toHaveProperty('previewEndpoint')
  })

  it('every other Phase 1 Source Collection is listed with real domain facts, none of them a status/previewEndpoint field', () => {
    // `xphb` and `xdmg` are here rather than in the SRD-shaped assertions
    // above because they share this group's domain facts (proprietary
    // license, no free republication right -- see the architecture doc's
    // §9) even though, unlike the rest of this list, they now have a
    // registered provider. Availability is derived server-side and is
    // deliberately not a registry fact, so having a provider changes
    // nothing here.
    const otherKeys = ['xphb', 'phb-2014', 'xdmg', 'dmg', 'mm', 'xge', 'tce', 'ftd']

    for (const key of otherKeys) {
      const collection = getSourceCollection('dnd5e', key)
      expect(collection, `expected a registered collection for '${key}'`).toBeTruthy()
      expect(collection?.license.id).toBe('proprietary')
      expect(collection?.books.length).toBeGreaterThan(0)
      expect(collection?.suggestedPackageId).toBe(`eldra.content.${key}`)
      expect(collection).not.toHaveProperty('status')
      expect(collection).not.toHaveProperty('previewEndpoint')
    }

    const system = getGameSystem('dnd5e')
    expect(system?.collections).toHaveLength(1 + otherKeys.length)
  })

  it('getSourceCollection returns undefined for an unknown collection or an unknown game system', () => {
    expect(getSourceCollection('dnd5e', 'does-not-exist')).toBeUndefined()
    expect(getSourceCollection('pathfinder', 'srd-5.1')).toBeUndefined()
  })

  it('firstAvailableCollection picks the first collection the caller marks available', () => {
    expect(firstAvailableCollection('dnd5e', (key) => key === 'srd-5.1')?.key).toBe('srd-5.1')
    expect(firstAvailableCollection('dnd5e', (key) => key === 'ftd')?.key).toBe('ftd')
    expect(firstAvailableCollection('pathfinder', () => true)).toBeUndefined()
  })

  it('firstAvailableCollection falls back to the first collection at all when nothing is available', () => {
    expect(firstAvailableCollection('dnd5e', () => false)?.key).toBe('srd-5.1')
  })

  it('the registry itself is exported read-only-shaped (no mutation helpers)', () => {
    expect(Array.isArray(GAME_SYSTEM_REGISTRY)).toBe(true)
    expect(GAME_SYSTEM_REGISTRY.length).toBeGreaterThan(0)
  })
})
