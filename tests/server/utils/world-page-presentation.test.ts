// Unit tests for server/utils/world-page-presentation.ts -- the pure
// cross-World asset check behind picking an EXISTING Media Gallery file
// as a page background (PAGE BACKGROUND PICKER UX CORRECTION). Proves
// the comparison directly; the route's own Directus I/O around it is
// exercised by the existing presentation route's own established test
// coverage pattern, unchanged by this task.

import { describe, expect, it } from 'vitest'
import { fileBelongsToWorld } from '../../../server/utils/world-page-presentation'

describe('fileBelongsToWorld', () => {
  it('true when the file world_id matches the requested world id', () => {
    expect(fileBelongsToWorld(42, 42)).toBe(true)
    expect(fileBelongsToWorld('42', '42')).toBe(true)
    expect(fileBelongsToWorld(42, '42')).toBe(true)
  })

  it('false for a different World -- the cross-World rejection case', () => {
    expect(fileBelongsToWorld(42, 43)).toBe(false)
  })

  it('false when the file has no world_id at all (pre-world-scope upload)', () => {
    expect(fileBelongsToWorld(null, 42)).toBe(false)
    expect(fileBelongsToWorld(undefined, 42)).toBe(false)
  })

  it('false when either value is not a finite number', () => {
    expect(fileBelongsToWorld('not-a-number', 42)).toBe(false)
    expect(fileBelongsToWorld(42, 'not-a-number')).toBe(false)
    expect(fileBelongsToWorld(NaN, 42)).toBe(false)
  })
})
