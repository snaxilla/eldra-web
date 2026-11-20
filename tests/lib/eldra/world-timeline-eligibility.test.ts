// Unit tests for app/lib/eldra/world-timeline-eligibility.ts -- the pure
// capability gate behind Timeline creation/editing (CREATION ENTRY
// POINTS, MAP THUMBNAILS, AND MAP WORDING). No mode parameter exists, by
// construction, matching the established pattern for every other
// Play/Build decoupling this codebase has done.

import { describe, expect, it } from 'vitest'
import { canEditWorldTimelines } from '../../../app/lib/eldra/world-timeline-eligibility'

describe('canEditWorldTimelines', () => {
  it('true when world.timeline.edit is present', () => {
    expect(canEditWorldTimelines(['world.timeline.edit'])).toBe(true)
  })

  it('false for an ordinary player', () => {
    expect(canEditWorldTimelines(['world.read', 'world.character.create'])).toBe(false)
  })

  it('false for a worldbuilder-adjacent capability that is not this one', () => {
    expect(canEditWorldTimelines(['world.entity.edit'])).toBe(false)
  })

  it('false when capabilities is missing/not an array', () => {
    expect(canEditWorldTimelines(undefined)).toBe(false)
    expect(canEditWorldTimelines(null)).toBe(false)
  })

  it('has no mode/build-state parameter', () => {
    expect(canEditWorldTimelines.length).toBe(1)
  })
})
