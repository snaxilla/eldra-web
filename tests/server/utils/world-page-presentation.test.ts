// Unit tests for server/utils/world-page-presentation.ts -- the pure
// cross-World asset check behind picking an EXISTING Media Gallery file
// as a page background (PAGE BACKGROUND PICKER UX CORRECTION). Proves
// the comparison directly; the route's own Directus I/O around it is
// exercised by the existing presentation route's own established test
// coverage pattern, unchanged by this task.

import { describe, expect, it } from 'vitest'
import {
  fileBelongsToWorld,
  isSupportedImageType,
  needsBackgroundFileLookup,
  pagePresentationNeedsWorldDefault,
  resolveBackgroundSource,
  resolvePagePresentation,
  resolveWriteBackgroundSource,
  validateBackgroundFile
} from '../../../server/utils/world-page-presentation'

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

// World Background Defaults pass -- the owner-reported requirement that
// an explicit "no background" choice must be distinguishable from "use
// World default," and that neither is reachable for a pre-migration row
// by inference alone (see the migration script's own backfill rationale).
describe('resolveBackgroundSource', () => {
  it('no row at all -- never configured -- resolves to inherit', () => {
    expect(resolveBackgroundSource(null)).toBe('inherit')
    expect(resolveBackgroundSource(undefined)).toBe('inherit')
  })

  it('a stored file id is always override, regardless of background_source', () => {
    expect(resolveBackgroundSource({ background_file_id: 'f1', background_source: 'inherit' })).toBe('override')
    expect(resolveBackgroundSource({ background_file_id: 'f1', background_source: null })).toBe('override')
  })

  it('no file id, explicit inherit marker -- inherit', () => {
    expect(resolveBackgroundSource({ background_file_id: null, background_source: 'inherit' })).toBe('inherit')
  })

  it('no file id, no inherit marker (legacy "Clear" row, or explicit none) -- none', () => {
    expect(resolveBackgroundSource({ background_file_id: null, background_source: null })).toBe('none')
    expect(resolveBackgroundSource({ background_file_id: null, background_source: 'none' })).toBe('none')
    expect(resolveBackgroundSource({ background_file_id: null })).toBe('none')
  })
})

describe('resolvePagePresentation', () => {
  const worldDefault = { presentation_mode: 'immersive', background_file_id: 'world-default-file' }

  it('an explicit page override always wins over the World default', () => {
    const own = { presentation_mode: 'muted', background_file_id: 'own-file', background_source: null }
    const result = resolvePagePresentation('locations', own, worldDefault)
    expect(result).toMatchObject({
      presentationMode: 'muted',
      backgroundFileId: 'own-file',
      backgroundSource: 'override'
    })
  })

  it('a page with no row at all inherits the World default', () => {
    const result = resolvePagePresentation('locations', null, worldDefault)
    expect(result).toMatchObject({
      presentationMode: 'immersive',
      backgroundFileId: 'world-default-file',
      backgroundSource: 'inherit'
    })
  })

  it('a page explicitly set to inherit (no file, inherit marker) picks up the World default', () => {
    const own = { presentation_mode: 'neutral', background_file_id: null, background_source: 'inherit' }
    const result = resolvePagePresentation('species', own, worldDefault)
    expect(result.backgroundFileId).toBe('world-default-file')
    expect(result.presentationMode).toBe('immersive')
    expect(result.backgroundSource).toBe('inherit')
  })

  it('explicit "No Background" shows nothing even though a World default exists', () => {
    const own = { presentation_mode: 'muted', background_file_id: null, background_source: 'none' }
    const result = resolvePagePresentation('species', own, worldDefault)
    expect(result).toMatchObject({
      presentationMode: 'neutral',
      backgroundFileId: null,
      backgroundSource: 'none'
    })
  })

  it('no World default configured -- inherit resolves to nothing, same as today for a World with no new default', () => {
    const result = resolvePagePresentation('locations', null, null)
    expect(result).toMatchObject({
      presentationMode: 'neutral',
      backgroundFileId: null,
      backgroundSource: 'inherit'
    })
  })

  it('the World-default row itself has nothing to inherit from -- returned as-is', () => {
    const own = { presentation_mode: 'immersive', background_file_id: 'the-default-file' }
    const result = resolvePagePresentation('world-default', own, { background_file_id: 'irrelevant' })
    expect(result).toMatchObject({
      presentationMode: 'immersive',
      backgroundFileId: 'the-default-file',
      backgroundSource: 'override'
    })
  })

  it('specialized surfaces (character-sheet, world-map) never silently inherit the World default', () => {
    for (const pageKey of ['character-sheet', 'world-map']) {
      const result = resolvePagePresentation(pageKey, null, worldDefault)
      expect(result).toMatchObject({
        presentationMode: 'neutral',
        backgroundFileId: null,
        backgroundSource: 'none'
      })
    }
  })

  it('an explicit override on a specialized surface still works unchanged', () => {
    const own = { presentation_mode: 'immersive', background_file_id: 'sheet-own-file' }
    const result = resolvePagePresentation('character-sheet', own, worldDefault)
    expect(result).toMatchObject({
      presentationMode: 'immersive',
      backgroundFileId: 'sheet-own-file',
      backgroundSource: 'override'
    })
  })
})

describe('pagePresentationNeedsWorldDefault', () => {
  it('false for the World-default row itself and every specialized surface', () => {
    expect(pagePresentationNeedsWorldDefault('world-default')).toBe(false)
    expect(pagePresentationNeedsWorldDefault('character-sheet')).toBe(false)
    expect(pagePresentationNeedsWorldDefault('world-map')).toBe(false)
  })

  it('true for an ordinary page', () => {
    expect(pagePresentationNeedsWorldDefault('locations')).toBe(true)
    expect(pagePresentationNeedsWorldDefault('species')).toBe(true)
  })
})

describe('resolveWriteBackgroundSource', () => {
  it('a background file id always wins -- never writes the column, override is inferred from the id alone', () => {
    expect(resolveWriteBackgroundSource('inherit', 'some-file')).toBeNull()
    expect(resolveWriteBackgroundSource('none', 'some-file')).toBeNull()
    expect(resolveWriteBackgroundSource(undefined, 'some-file')).toBeNull()
  })

  it('no file id: the two explicit choices are written as given', () => {
    expect(resolveWriteBackgroundSource('inherit', null)).toBe('inherit')
    expect(resolveWriteBackgroundSource('none', null)).toBe('none')
  })

  it('no file id, nothing/garbage sent -- writes nothing, so a plain mode toggle or the pre-existing Clear action never touches this column', () => {
    expect(resolveWriteBackgroundSource(undefined, null)).toBeNull()
    expect(resolveWriteBackgroundSource('not-a-real-value', null)).toBeNull()
  })
})

// Owner follow-up: every row created before scripts/directus/alter-world-
// page-presentations-background-source.mjs has run reads back with
// `background_source` literally `null` (the column exists but was never
// populated) -- NOT merely absent from the object, which the earlier
// tests above already cover. Each bullet here is one of the five
// specific legacy-row guarantees asked for, named to match 1:1.
describe('legacy rows: background_source is literally null (pre-migration, not just absent)', () => {
  const worldDefault = { presentation_mode: 'immersive', background_file_id: 'world-default-file' }

  it('existing explicit page images remain unchanged', () => {
    const legacyOverrideRow = { presentation_mode: 'muted', background_file_id: 'own-file', background_source: null }
    const result = resolvePagePresentation('locations', legacyOverrideRow, worldDefault)
    expect(result).toMatchObject({ presentationMode: 'muted', backgroundFileId: 'own-file', backgroundSource: 'override' })
  })

  it('pages without an image inherit as intended -- but ONLY when there is no row at all, not merely a null background_source', () => {
    // No row ever created for this page: inherits.
    expect(resolvePagePresentation('locations', null, worldDefault)).toMatchObject({
      backgroundFileId: 'world-default-file',
      backgroundSource: 'inherit'
    })

    // A legacy row DOES exist (background_source null, file null) -- this
    // is the pre-existing "Clear" state, and must NOT silently start
    // inheriting just because a null column now exists to read.
    const legacyClearedRow = { presentation_mode: 'immersive', background_file_id: null, background_source: null }
    expect(resolvePagePresentation('locations', legacyClearedRow, worldDefault)).toMatchObject({
      presentationMode: 'neutral',
      backgroundFileId: null,
      backgroundSource: 'none'
    })
  })

  it('"Use World default" and "No background" remain distinct', () => {
    const inheriting = { presentation_mode: 'muted', background_file_id: null, background_source: 'inherit' }
    const explicitNone = { presentation_mode: 'muted', background_file_id: null, background_source: 'none' }

    expect(resolvePagePresentation('species', inheriting, worldDefault).backgroundFileId).toBe('world-default-file')
    expect(resolvePagePresentation('species', explicitNone, worldDefault).backgroundFileId).toBeNull()
    expect(resolvePagePresentation('species', inheriting, worldDefault).backgroundSource).not.toBe(
      resolvePagePresentation('species', explicitNone, worldDefault).backgroundSource
    )
  })

  it('updating presentation mode preserves the background source -- a mode-only save never writes this column', () => {
    // The write side: a mode toggle sends no backgroundSource, so nothing
    // is added to the save body regardless of the row's current state.
    expect(resolveWriteBackgroundSource(undefined, null)).toBeNull()

    // Which means the row's own background_source is untouched by that
    // save -- resolving it before and after a (simulated) mode-only
    // update gives the identical answer.
    const beforeModeChange = { presentation_mode: 'neutral', background_file_id: null, background_source: 'inherit' }
    const afterModeChangeOnly = { ...beforeModeChange, presentation_mode: 'immersive' } // only this field changed
    expect(resolveBackgroundSource(beforeModeChange)).toBe('inherit')
    expect(resolveBackgroundSource(afterModeChangeOnly)).toBe('inherit')
  })

  it('existing fallback backgrounds remain intact -- the character-sheet/characters legacy fallback row', () => {
    // server/api/worlds/[id]/presentation/[pageKey].get.ts substitutes the
    // legacy 'characters' row in place of a missing 'character-sheet' row
    // BEFORE calling resolvePagePresentation -- simulated here by passing
    // that substituted row directly as the 'character-sheet' item.
    const legacyCharactersRowWithImage = { presentation_mode: 'immersive', background_file_id: 'legacy-characters-file', background_source: null }
    expect(resolvePagePresentation('character-sheet', legacyCharactersRowWithImage, null)).toMatchObject({
      presentationMode: 'immersive',
      backgroundFileId: 'legacy-characters-file',
      backgroundSource: 'override'
    })

    // And if that legacy row never had an image either, it still reads as
    // "nothing" -- never swept into inheriting a World default, since
    // character-sheet is a specialized, excluded surface.
    const legacyCharactersRowNoImage = { presentation_mode: 'neutral', background_file_id: null, background_source: null }
    expect(resolvePagePresentation('character-sheet', legacyCharactersRowNoImage, null)).toMatchObject({
      presentationMode: 'neutral',
      backgroundFileId: null,
      backgroundSource: 'none'
    })
  })
})

// Clarification the owner asked for directly: was "explicit none" new?
//
// The BEHAVIOR was not new -- "no background_file_id" has always meant
// "show nothing," and the pre-existing "Clear" action already reached
// exactly that state. What's new is that 'none' now EXISTS as a named,
// stored value distinguishable from something else -- which is only
// meaningful because 'inherit' is a brand new state this pass introduces.
// Before this pass there was nothing to distinguish "none" FROM, so the
// question "was explicit-none already supported" doesn't have a yes/no
// answer in the pre-existing system: the no-background OUTCOME already
// existed; the no-background STATE, named and guarded against being
// reinterpreted as inherit, did not.
describe('explicit "none" was not a pre-existing named state -- only its outcome was', () => {
  it('a pre-feature row (no background_source field on the object at all) produces the same visible outcome as an explicit none', () => {
    const preFeatureRow = { presentation_mode: 'muted', background_file_id: null } // no background_source key whatsoever
    const explicitNoneRow = { presentation_mode: 'muted', background_file_id: null, background_source: 'none' }

    const preFeatureResult = resolvePagePresentation('locations', preFeatureRow, null)
    const explicitResult = resolvePagePresentation('locations', explicitNoneRow, null)

    expect(preFeatureResult).toEqual(explicitResult)
    expect(preFeatureResult.backgroundSource).toBe('none')
  })
})

// Owner follow-up: the Gallery listing and upload endpoints both only
// ever let an image/* file reach the save route through NORMAL use of
// the picker -- neither one validates a direct save request itself.
describe('isSupportedImageType', () => {
  it('accepts any image/* mime type', () => {
    expect(isSupportedImageType('image/png')).toBe(true)
    expect(isSupportedImageType('image/webp')).toBe(true)
  })

  it('rejects a non-image type', () => {
    expect(isSupportedImageType('application/pdf')).toBe(false)
    expect(isSupportedImageType('text/plain')).toBe(false)
  })

  it('rejects null/undefined/non-string values', () => {
    expect(isSupportedImageType(null)).toBe(false)
    expect(isSupportedImageType(undefined)).toBe(false)
    expect(isSupportedImageType(42)).toBe(false)
  })
})

describe('needsBackgroundFileLookup', () => {
  it('false when no new asset is being submitted -- mode-only, "Use World Default", "No Background", and the legacy Clear action all pass null here', () => {
    expect(needsBackgroundFileLookup(null)).toBe(false)
    expect(needsBackgroundFileLookup('')).toBe(false)
  })

  it('true only when an actual file id is submitted', () => {
    expect(needsBackgroundFileLookup('some-file-id')).toBe(true)
  })
})

describe('validateBackgroundFile', () => {
  const WORLD_ID = 42

  it('a same-World image is accepted', () => {
    const file = { id: 'f1', world_id: WORLD_ID, type: 'image/png' }
    expect(validateBackgroundFile(file, WORLD_ID)).toEqual({ ok: true })
  })

  it('a same-World NON-image is rejected -- before persistence, with a 400, not silently waved through', () => {
    const file = { id: 'f1', world_id: WORLD_ID, type: 'application/pdf' }
    const result = validateBackgroundFile(file, WORLD_ID)
    expect(result).toEqual({
      ok: false,
      statusCode: 400,
      statusMessage: 'That file is not a supported image type.'
    })
  })

  it('a cross-World image remains rejected -- ownership is checked before type, so a wrong-World image never even reaches the type check', () => {
    const file = { id: 'f1', world_id: 43, type: 'image/png' }
    const result = validateBackgroundFile(file, WORLD_ID)
    expect(result).toEqual({
      ok: false,
      statusCode: 403,
      statusMessage: 'That image does not belong to this World.'
    })
  })

  it('a cross-World NON-image is still rejected for ownership first, not type -- the 403 wins', () => {
    const file = { id: 'f1', world_id: 43, type: 'application/pdf' }
    const result = validateBackgroundFile(file, WORLD_ID)
    expect(result.ok).toBe(false)
    expect((result as any).statusCode).toBe(403)
  })

  it('a missing/unknown file (no id at all) is rejected the same way an ownership mismatch is', () => {
    expect(validateBackgroundFile(null, WORLD_ID)).toEqual({
      ok: false,
      statusCode: 403,
      statusMessage: 'That image does not belong to this World.'
    })
    expect(validateBackgroundFile({ id: undefined, world_id: WORLD_ID, type: 'image/png' }, WORLD_ID)).toEqual({
      ok: false,
      statusCode: 403,
      statusMessage: 'That image does not belong to this World.'
    })
  })
})
