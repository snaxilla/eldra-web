// Unit tests for scripts/directus/backfill-media-world-scope-core.mjs.
//
// Media Gallery World-scope backfill follow-up (Content Workspaces &
// Studio Phase 0). Pure parsing/classification/validation logic -- no
// Directus transport involved, matching
// tests/scripts/directus/packages-sync-core.test.ts's own established
// pattern for this script family.
import { describe, expect, it } from 'vitest'
import {
  buildExplicitAssignmentReport,
  buildMappingAssignments,
  buildReport,
  classifyFile,
  classifyForExplicitAssignment,
  parseLegacyWorldMarker,
  resolveWorldByExactName,
  validateMapping
} from '../../../scripts/directus/backfill-media-world-scope-core.mjs'

describe('parseLegacyWorldMarker', () => {
  it('parses the exact, verified legacy format', () => {
    expect(parseLegacyWorldMarker('Eldra media upload for world 6')).toBe('6')
    expect(parseLegacyWorldMarker('Eldra media upload for world 42')).toBe('42')
  })

  it('rejects a description that merely CONTAINS the marker as a substring -- no loose matching', () => {
    expect(parseLegacyWorldMarker('Notes: Eldra media upload for world 6. Approved by GM.')).toBeNull()
    expect(parseLegacyWorldMarker('see Eldra media upload for world 6')).toBeNull()
  })

  it('rejects a non-numeric or garbled World id', () => {
    expect(parseLegacyWorldMarker('Eldra media upload for world six')).toBeNull()
    expect(parseLegacyWorldMarker('Eldra media upload for world')).toBeNull()
    expect(parseLegacyWorldMarker('Eldra media upload for world 6x')).toBeNull()
  })

  it('rejects missing/empty/non-string descriptions without throwing', () => {
    expect(parseLegacyWorldMarker(null)).toBeNull()
    expect(parseLegacyWorldMarker(undefined)).toBeNull()
    expect(parseLegacyWorldMarker('')).toBeNull()
    expect(parseLegacyWorldMarker('   ')).toBeNull()
  })

  it('rejects casing/whitespace variants that are not byte-identical to the real template literal', () => {
    expect(parseLegacyWorldMarker('ELDRA MEDIA UPLOAD FOR WORLD 6')).toBeNull()
    expect(parseLegacyWorldMarker('Eldra media upload for world  6')).toBeNull() // double space
  })
})

describe('classifyFile', () => {
  const worldIds = new Set(['1', '2'])

  it('classifies an exact legacy marker as safe when the World exists', () => {
    const result = classifyFile(
      { id: 'f1', description: 'Eldra media upload for world 1', world_id: null },
      { worldIds, mapping: new Map() }
    )
    expect(result).toMatchObject({ fileId: 'f1', status: 'safe', worldId: '1', source: 'legacy-description' })
  })

  it('never overwrites an already-assigned world_id, regardless of description content', () => {
    const result = classifyFile(
      { id: 'f2', description: 'Eldra media upload for world 1', world_id: 2 },
      { worldIds, mapping: new Map() }
    )
    expect(result).toMatchObject({ fileId: 'f2', status: 'already-assigned', worldId: '2' })
  })

  it('reports missing metadata for a file with no description and no mapping entry', () => {
    const result = classifyFile({ id: 'f3', description: null, world_id: null }, { worldIds, mapping: new Map() })
    expect(result).toMatchObject({ fileId: 'f3', status: 'missing-metadata' })
  })

  it('reports missing metadata (not malformed) for an unrelated, human-authored description', () => {
    const result = classifyFile(
      { id: 'f4', description: 'Shortsword concept art', world_id: null },
      { worldIds, mapping: new Map() }
    )
    expect(result.status).toBe('missing-metadata')
  })

  it('reports malformed metadata for a damaged/garbled attempt at the legacy marker', () => {
    const result = classifyFile(
      { id: 'f5', description: 'Eldra media upload for world', world_id: null },
      { worldIds, mapping: new Map() }
    )
    expect(result.status).toBe('malformed-metadata')
  })

  it('reports world-not-found when the parsed World id does not exist', () => {
    const result = classifyFile(
      { id: 'f6', description: 'Eldra media upload for world 999', world_id: null },
      { worldIds, mapping: new Map() }
    )
    expect(result).toMatchObject({ fileId: 'f6', status: 'world-not-found', worldId: '999' })
  })

  it('resolves from a mapping entry when no legacy description exists', () => {
    const mapping = new Map([['f7', '2']])
    const result = classifyFile({ id: 'f7', description: null, world_id: null }, { worldIds, mapping })
    expect(result).toMatchObject({ fileId: 'f7', status: 'safe', worldId: '2', source: 'mapping' })
  })

  it('reports a conflict when the mapping disagrees with the legacy description, and assigns nothing', () => {
    const mapping = new Map([['f8', '2']])
    const result = classifyFile(
      { id: 'f8', description: 'Eldra media upload for world 1', world_id: null },
      { worldIds, mapping }
    )
    expect(result.status).toBe('conflict')
    expect(result.worldId).toBeUndefined()
  })

  it('is not a conflict when the mapping agrees with the legacy description', () => {
    const mapping = new Map([['f9', '1']])
    const result = classifyFile(
      { id: 'f9', description: 'Eldra media upload for world 1', world_id: null },
      { worldIds, mapping }
    )
    expect(result).toMatchObject({ status: 'safe', worldId: '1' })
  })
})

describe('validateMapping', () => {
  const fileIds = new Set(['f1', 'f2'])
  const worldIds = new Set(['1', '2'])

  it('accepts a well-formed mapping with no issues', () => {
    const issues = validateMapping([{ fileId: 'f1', worldId: '1' }], { fileIds, worldIds })
    expect(issues).toEqual([])
  })

  it('flags an unknown file id', () => {
    const issues = validateMapping([{ fileId: 'does-not-exist', worldId: '1' }], { fileIds, worldIds })
    expect(issues).toEqual([expect.objectContaining({ status: 'unknown-file', fileId: 'does-not-exist' })])
  })

  it('flags a World that does not exist', () => {
    const issues = validateMapping([{ fileId: 'f1', worldId: '999' }], { fileIds, worldIds })
    expect(issues).toEqual([expect.objectContaining({ status: 'invalid-world', worldId: '999' })])
  })

  it('flags duplicate fileIds in the mapping file', () => {
    const issues = validateMapping(
      [{ fileId: 'f1', worldId: '1' }, { fileId: 'f1', worldId: '2' }],
      { fileIds, worldIds }
    )
    expect(issues.some((issue) => issue.status === 'duplicate-mapping-entry' && issue.fileId === 'f1')).toBe(true)
  })

  it('flags entries missing fileId or worldId without throwing', () => {
    const issues = validateMapping([{ fileId: 'f1' }, { worldId: '1' }, {}], { fileIds, worldIds })
    expect(issues.every((issue) => issue.status === 'invalid-entry')).toBe(true)
    expect(issues).toHaveLength(3)
  })

  it('reports a non-array mapping file as invalid, never throwing', () => {
    expect(() => validateMapping({ not: 'an array' }, { fileIds, worldIds })).not.toThrow()
    const issues = validateMapping({ not: 'an array' }, { fileIds, worldIds })
    expect(issues).toEqual([expect.objectContaining({ status: 'invalid-mapping-file' })])
  })
})

describe('buildMappingAssignments', () => {
  const fileIds = new Set(['f1', 'f2'])
  const worldIds = new Set(['1', '2'])

  it('builds a usable fileId -> worldId map from valid entries', () => {
    const map = buildMappingAssignments([{ fileId: 'f1', worldId: '2' }], { fileIds, worldIds })
    expect(map.get('f1')).toBe('2')
  })

  it('excludes a duplicate fileId entirely -- never picks the first or last one', () => {
    const map = buildMappingAssignments(
      [{ fileId: 'f1', worldId: '1' }, { fileId: 'f1', worldId: '2' }],
      { fileIds, worldIds }
    )
    expect(map.has('f1')).toBe(false)
  })

  it('excludes entries referencing an unknown file or invalid World', () => {
    const map = buildMappingAssignments(
      [{ fileId: 'ghost', worldId: '1' }, { fileId: 'f1', worldId: '999' }],
      { fileIds, worldIds }
    )
    expect(map.size).toBe(0)
  })
})

describe('buildReport', () => {
  it('groups classifications by status and produces accurate summary counts', () => {
    const classifications = [
      { fileId: 'f1', status: 'safe', worldId: '1', reason: 'x' },
      { fileId: 'f2', status: 'already-assigned', worldId: '2', reason: 'x' },
      { fileId: 'f3', status: 'missing-metadata', reason: 'x' },
      { fileId: 'f4', status: 'malformed-metadata', reason: 'x' },
      { fileId: 'f5', status: 'world-not-found', worldId: '999', reason: 'x' },
      { fileId: 'f6', status: 'conflict', reason: 'x' }
    ]

    const report = buildReport(classifications, [{ status: 'unknown-file', fileId: 'ghost', reason: 'x' }])

    expect(report.summary).toEqual({
      total: 6,
      safe: 1,
      alreadyAssigned: 1,
      missingMetadata: 1,
      malformedMetadata: 1,
      worldNotFound: 1,
      conflict: 1,
      mappingIssues: 1
    })
    expect(report.byStatus.safe).toHaveLength(1)
    expect(report.byStatus.safe[0].fileId).toBe('f1')
  })

  it('produces a correct, non-crashing report for zero classifications', () => {
    const report = buildReport([], [])
    expect(report.summary.total).toBe(0)
    expect(report.byStatus.safe).toEqual([])
  })
})

describe('classifyForExplicitAssignment', () => {
  it('treats every unassigned file as safe, regardless of description content', () => {
    expect(classifyForExplicitAssignment({ id: 'f1', world_id: null, description: null }).status).toBe('safe')
    expect(classifyForExplicitAssignment({ id: 'f2', world_id: null, description: 'garbage' }).status).toBe('safe')
  })

  it('ignores missing/malformed legacy descriptions -- this mode never inspects them', () => {
    const result = classifyForExplicitAssignment({ id: 'f3', world_id: null, description: 'Eldra media upload for world' })
    expect(result.status).toBe('safe')
  })

  it('deliberately ignores a historical description naming a DIFFERENT World -- explicit policy overrides inference', () => {
    const result = classifyForExplicitAssignment({ id: 'f4', world_id: null, description: 'Eldra media upload for world 99' })
    expect(result.status).toBe('safe')
    expect(result.worldId).toBeUndefined() // no worldId is inferred by this classifier; the CALLER supplies the target
  })

  it('never overwrites an already-assigned file', () => {
    const result = classifyForExplicitAssignment({ id: 'f5', world_id: 2, description: 'Eldra media upload for world 99' })
    expect(result).toMatchObject({ fileId: 'f5', status: 'already-assigned', worldId: '2' })
  })
})

describe('buildExplicitAssignmentReport', () => {
  it('splits safe vs already-assigned and produces accurate counts, carrying the target World id', () => {
    const classifications = [
      { fileId: 'f1', status: 'safe', reason: 'x' },
      { fileId: 'f2', status: 'safe', reason: 'x' },
      { fileId: 'f3', status: 'already-assigned', worldId: '7', reason: 'x' }
    ]

    const report = buildExplicitAssignmentReport(classifications, 4)

    expect(report.targetWorldId).toBe('4')
    expect(report.safe).toHaveLength(2)
    expect(report.alreadyAssigned).toHaveLength(1)
    expect(report.summary).toEqual({ total: 3, safe: 2, alreadyAssigned: 1 })
  })
})

describe('resolveWorldByExactName', () => {
  const worlds = [
    { id: '4', name: 'Solaris' },
    { id: '7', name: 'Arden' }
  ]

  it('resolves an exact, unambiguous name match', () => {
    const result = resolveWorldByExactName(worlds, 'Solaris')
    expect(result).toEqual({ ok: true, world: { id: '4', name: 'Solaris' } })
  })

  it('rejects a missing World -- never guesses or falls back to a hardcoded id', () => {
    const result = resolveWorldByExactName(worlds, 'Nonexistent')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/No World named 'Nonexistent'/)
  })

  it('rejects an ambiguous match -- more than one World with the same name', () => {
    const ambiguous = [{ id: '4', name: 'Solaris' }, { id: '9', name: 'Solaris' }]
    const result = resolveWorldByExactName(ambiguous, 'Solaris')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/Ambiguous/)
    expect(result.reason).toMatch(/4/)
    expect(result.reason).toMatch(/9/)
  })

  it('does not match a substring or case-insensitive variant -- exact only', () => {
    expect(resolveWorldByExactName(worlds, 'solaris').ok).toBe(false)
    expect(resolveWorldByExactName(worlds, 'Sol').ok).toBe(false)
  })
})
