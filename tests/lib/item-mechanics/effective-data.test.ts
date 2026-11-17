// Unit tests for app/lib/item-mechanics/effective-data.ts -- the ONE
// shared, pure, system-dispatched resolver two call sites must both use
// (server/utils/world-content-sources.ts and the entity-detail route) --
// see the Items Mechanics Editing investigation's own §5 finding for why
// a single call site is not enough on its own.

import { describe, expect, it } from 'vitest'
import { resolveEffectiveItemData } from '../../../app/lib/item-mechanics/effective-data'
import type { FieldOverride } from '../../../app/lib/content-authoring/overrides'

const RAW = { name: 'Shortsword', rarity: 'none', weight: 1 }

function mechanicsOverride(path: string, value: unknown): FieldOverride {
  return { channel: 'mechanics', path, value, authoredBy: 'acct-1', authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }
}

describe('resolveEffectiveItemData', () => {
  it('returns rawData BY REFERENCE, unchanged, when there are no overrides at all', () => {
    expect(resolveEffectiveItemData('dnd5e', RAW, [])).toBe(RAW)
  })

  it('returns rawData unchanged when overrides exist but none are on the mechanics channel', () => {
    const presentationOnly: FieldOverride[] = [{ channel: 'presentation', path: 'name', value: 'Fine Shortsword', authoredBy: null, authoredAt: '2026-01-01T00:00:00Z', baseValueHash: null }]
    expect(resolveEffectiveItemData('dnd5e', RAW, presentationOnly)).toBe(RAW)
  })

  it('dispatches to the dnd5e applier when a mechanics override exists', () => {
    const result = resolveEffectiveItemData('dnd5e', RAW, [mechanicsOverride('rarity', 'rare')]) as Record<string, unknown>
    expect(result).not.toBe(RAW)
    expect(result.rarity).toBe('rare')
    expect(result.weight).toBe(1) // untouched field preserved
  })

  it('an unknown systemKey returns rawData unchanged, never throws', () => {
    expect(resolveEffectiveItemData('some-other-system', RAW, [mechanicsOverride('rarity', 'rare')])).toBe(RAW)
  })
})
