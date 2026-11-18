// Published-Pack Load Reduction Pass -- Diagnostic Safety Review.
//
// An owner review of a verbose [roll-perf:*] capture found a concrete
// identifier logged verbatim: eldra-sessions.ts's own `last_used_at` PATCH
// (`/items/eldra_sessions/${session.id}`), which directus.ts's
// sanitizePathForLogging did not redact because eldra_sessions rows use a
// UUID primary key and the function only ever matched numeric segments.
// These tests pin the fixed behavior directly -- both the pre-existing
// numeric case and the new UUID case -- without standing up a `$fetch`
// mock, since sanitizePathForLogging is exported for exactly this reason
// (see its own header in directus.ts).
import { describe, expect, it } from 'vitest'
import { sanitizePathForLogging } from '../../../server/utils/directus'

describe('sanitizePathForLogging', () => {
  it('redacts a numeric Directus row id', () => {
    expect(sanitizePathForLogging('/items/entities/482')).toBe('/items/entities/:id')
  })

  it('redacts a UUID Directus row id -- the gap a real capture exposed (eldra_sessions)', () => {
    expect(sanitizePathForLogging('/items/eldra_sessions/550e8400-e29b-41d4-a716-446655440000')).toBe(
      '/items/eldra_sessions/:id'
    )
  })

  it('redacts a UUID id regardless of case', () => {
    expect(sanitizePathForLogging('/items/content_workspaces/550E8400-E29B-41D4-A716-446655440000')).toBe(
      '/items/content_workspaces/:id'
    )
  })

  it('redacts multiple ids (one numeric, one UUID) in the same path', () => {
    expect(
      sanitizePathForLogging('/items/entities/482/relationships/550e8400-e29b-41d4-a716-446655440000')
    ).toBe('/items/entities/:id/relationships/:id')
  })

  it('leaves a path with no id segment unchanged', () => {
    expect(sanitizePathForLogging('/items/content_packs')).toBe('/items/content_packs')
  })

  it('never reproduces the raw UUID anywhere in its output', () => {
    const raw = '550e8400-e29b-41d4-a716-446655440000'
    const result = sanitizePathForLogging(`/items/eldra_sessions/${raw}`)
    expect(result).not.toContain(raw)
  })
})
