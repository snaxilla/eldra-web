// Unit tests for app/lib/eldra/world-map-eligibility.ts -- the pure
// capability gate behind Map creation/management (CREATION ENTRY
// POINTS, MAP THUMBNAILS, AND MAP WORDING).

import { describe, expect, it } from 'vitest'
import { canEditWorldMaps } from '../../../app/lib/eldra/world-map-eligibility'

describe('canEditWorldMaps', () => {
  it('true when world.map.edit is present', () => {
    expect(canEditWorldMaps(['world.map.edit'])).toBe(true)
  })

  it('false for an ordinary player', () => {
    expect(canEditWorldMaps(['world.read', 'world.character.create'])).toBe(false)
  })

  it('false for an adjacent but distinct capability', () => {
    expect(canEditWorldMaps(['world.entity.edit'])).toBe(false)
  })

  it('false when capabilities is missing/not an array', () => {
    expect(canEditWorldMaps(undefined)).toBe(false)
    expect(canEditWorldMaps(null)).toBe(false)
  })
})
