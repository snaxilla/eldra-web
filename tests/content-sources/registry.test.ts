// Unit tests for app/lib/content-sources/registry.ts -- the Content Source
// Registry (Game System -> Content Source). Pure data + pure functions, no
// mocks needed.

import { describe, expect, it } from 'vitest'
import {
  GAME_SYSTEM_REGISTRY,
  firstAvailableContentSource,
  getContentSource,
  getGameSystem,
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

  it('SRD 5.1 is the only available Content Source, with a real preview endpoint', () => {
    const srd = getContentSource('dnd5e', 'srd-5.1')
    expect(srd).toMatchObject({
      key: 'srd-5.1',
      label: 'SRD 5.1',
      status: 'available',
      previewEndpoint: '/api/content-packs/preview/srd-5-1'
    })
  })

  it('every other Phase 1 Content Source is listed but disabled (coming-soon, no preview endpoint)', () => {
    const comingSoonKeys = ['phb-2014', 'dmg', 'mm', 'xge', 'tce', 'ftd']

    for (const key of comingSoonKeys) {
      const source = getContentSource('dnd5e', key)
      expect(source, `expected a registered source for '${key}'`).toBeTruthy()
      expect(source?.status).toBe('coming-soon')
      expect(source?.previewEndpoint).toBeUndefined()
    }

    const system = getGameSystem('dnd5e')
    expect(system?.contentSources).toHaveLength(1 + comingSoonKeys.length)
  })

  it('getContentSource returns undefined for an unknown source or an unknown game system', () => {
    expect(getContentSource('dnd5e', 'does-not-exist')).toBeUndefined()
    expect(getContentSource('pathfinder', 'srd-5.1')).toBeUndefined()
  })

  it('firstAvailableContentSource picks SRD 5.1 for dnd5e and undefined for an unknown system', () => {
    expect(firstAvailableContentSource('dnd5e')?.key).toBe('srd-5.1')
    expect(firstAvailableContentSource('pathfinder')).toBeUndefined()
  })

  it('the registry itself is exported read-only-shaped (no mutation helpers)', () => {
    expect(Array.isArray(GAME_SYSTEM_REGISTRY)).toBe(true)
    expect(GAME_SYSTEM_REGISTRY.length).toBeGreaterThan(0)
  })
})
