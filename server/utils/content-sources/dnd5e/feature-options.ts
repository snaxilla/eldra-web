// Character Creator V3 -- Selected Option Explanations. The Feature Option
// category's own `loadCandidates` (the escape hatch 5etools-collection.ts's
// own header describes, the same mechanism subclasses.ts/xmm.ts already
// use) -- needed because neither species options nor class options fit the
// default datasetKey-driven pipeline:
//
//  - A species option (e.g. a Draconic Ancestry color) has no row of its
//    own anywhere in the corpus; it is synthesized from one already-loaded
//    species' `entries` (app/lib/importers/5etools-feature-options.ts's
//    `preview5eToolsSpeciesFeatureOptions` does the synthesis -- this
//    module only loads the one species row and hands it over).
//  - A class option (e.g. a Warlock invocation) lives in
//    optionalfeatures.json, a file NONE of the existing DatasetKeys reads
//    the right array key from (`feats`' own file filter happens to walk
//    this file too -- "optionalfeatures.json" contains the substring
//    "feat" -- but `getCollectionKeys('feats')` only ever extracts the
//    `feat` array, never `optionalfeature`). Read directly, the same way
//    5etools-dataset.ts's own `SPELL_CLASS_LIST_LOOKUP` already reads a
//    known file at a fixed path outside the DatasetKey/walkJsonFiles
//    machinery.
//
// No `attachRulesFacets` call, unlike subclasses.ts -- these candidates are
// PURELY PRESENTATIONAL. The real mechanical grant already happens through
// the owning Species/Class facet's own `choice:*.feature-option`/
// `choice:class.accumulating-option` ChoiceSet (app/lib/content-rules/
// dnd5e-2024.ts), which already names the Rules Engine Definition id
// directly (e.g. `source:draconic-ancestry.black`) -- a Feature Option
// Content Pack entry only carries that SAME id (as `definitionId`) to join
// real prose onto it, and mechanises nothing of its own.
//
// Generic across any source book/species/class: every identifying string
// (source code, species name, table/section names, option names,
// definitionId prefix) is a parameter here or in the caller
// (xphb.ts) -- this module hardcodes neither Dragonborn nor Warlock.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { DATA_ROOT, isEntryFromSource, loadDatasetEntries } from './5etools-dataset'
import { toContentPublicationCandidates } from '../../content-pack-5etools-adapter'
import {
  preview5eToolsClassOptions,
  preview5eToolsSpeciesFeatureOptions
} from '../../../../app/lib/importers/5etools-feature-options'
import type { SourceCategoryLoadResult } from '../types'

// COMPLETE OPTION-DESCRIPTION COVERAGE. `definitionIdFor` is a full callback, not a
// `prefix + slugify` formula baked in here -- Elf's own hand-authored ids
// (`source:elven-lineage.drow`/`.high`/`.wood`) drop the common "Elf" suffix from "High
// Elf"/"Wood Elf" that every other species' formula keeps, so the EXACT derivation is a
// per-species fact the registration site (xphb.ts) states explicitly, never a single formula
// this module would otherwise have to special-case per caller.
//
// See this file's header -- `_membership` (the PROVIDER's own predicate) is
// intentionally unused, mirroring loadSubclassCandidatesFor's own posture
// exactly: both options this category authors need a DIFFERENT membership
// rule than the provider's single closure.
export function loadSpeciesFeatureOptionCandidatesFor(
  sourceCode: string,
  speciesName: string,
  tableSectionName: string,
  sharedSectionNames: string[],
  definitionIdFor: (optionBaseName: string) => string,
  _vocabulary: string | undefined
) {
  return async function loadSpeciesFeatureOptionCandidates(_membership: (entry: any) => boolean): Promise<SourceCategoryLoadResult> {
    const rows = await loadDatasetEntries('species', isEntryFromSource(sourceCode))
    const species = rows.find((row) => row?.name === speciesName)

    if (!species) {
      return { candidates: [], warnings: [`${speciesName} (${sourceCode}) not found -- no feature options published`] }
    }

    const preview = preview5eToolsSpeciesFeatureOptions(species, { tableSectionName, sharedSectionNames, definitionIdFor })
    const candidates = toContentPublicationCandidates(preview)
    return { candidates, warnings: preview.warnings }
  }
}

// A known file read directly at a fixed path, outside the DatasetKey/walkJsonFiles machinery --
// see this file's header. Generic over which top-level array key to read (`optionalfeature` for
// optionalfeatures.json; `classFeature` for a `class/class-<X>.json` file), since both are
// single-array-per-file JSON documents at a path this module already knows, not a dataset-walk
// concern.
const fileRowCache = new Map<string, any[]>()

async function loadJsonArrayRows(relativePath: string, arrayKey: string): Promise<any[]> {
  const cacheKey = `${relativePath}#${arrayKey}`
  const cached = fileRowCache.get(cacheKey)
  if (cached) return cached

  let rows: any[] = []
  try {
    const raw = await readFile(join(DATA_ROOT, relativePath), 'utf8')
    const parsed = JSON.parse(raw)
    rows = Array.isArray(parsed?.[arrayKey]) ? parsed[arrayKey] : []
  } catch {
    rows = []
  }
  fileRowCache.set(cacheKey, rows)
  return rows
}

// COMPLETE OPTION-DESCRIPTION COVERAGE. `definitionIdFor` is a full callback for the same reason
// `loadSpeciesFeatureOptionCandidatesFor`'s own is -- Warlock's invocations need a `.known` suffix
// the Divine Order/Primal Order class-feature options below do not, so no single
// `prefix + slugify` formula could serve both without a hidden special case.
export function loadClassOptionCandidatesFor(
  sourceCode: string,
  optionNames: readonly string[],
  definitionIdFor: (optionName: string) => string,
  _vocabulary: string | undefined
) {
  return async function loadClassOptionCandidates(_membership: (entry: any) => boolean): Promise<SourceCategoryLoadResult> {
    const allRows = await loadJsonArrayRows('optionalfeatures.json', 'optionalfeature')
    const names = new Set(optionNames)
    const rows = allRows.filter((row) => row?.source === sourceCode && names.has(row?.name))

    const preview = preview5eToolsClassOptions(rows, definitionIdFor)
    const candidates = toContentPublicationCandidates(preview)
    return { candidates, warnings: preview.warnings }
  }
}

// COMPLETE OPTION-DESCRIPTION COVERAGE FOLLOW-UP. Mirrors the species importer's own `leadIn`
// fix exactly, for the same reason: Cleric's "Divine Order" classFeature row carries its own
// real intro sentence ("You have dedicated yourself to one of the following sacred roles of
// your choice.") BEFORE its `refClassFeature` pointers to "Protector"/"Thaumaturge" -- real,
// sourced context about what Divine Order even IS, previously never read because the loader
// only ever looked at the two named child rows directly. Structural: every plain-string entry on
// the PARENT row, named explicitly by the caller (never inferred from the child names, since
// nothing in a child row points back to its parent's name).
function leadingProseFor(rows: any[], parentFeatureName: string, sourceCode: string): string[] {
  const parent = rows.find((row) => row?.name === parentFeatureName && row?.source === sourceCode)
  const entries: any[] = Array.isArray(parent?.entries) ? parent.entries : []
  const leadIn: string[] = []
  for (const entry of entries) {
    if (typeof entry !== 'string') break
    leadIn.push(entry)
  }
  return leadIn
}

// COMPLETE OPTION-DESCRIPTION COVERAGE -- Cleric's Divine Order (Protector/Thaumaturge) and
// Druid's Primal Order (Magician/Warden). Structurally DIFFERENT from a Warlock invocation or a
// species feature-option: each named option is ALREADY its own complete, independent
// `classFeature` row in the class's own `class/class-<X>.json` file (verified directly against
// class-cleric.json/class-druid.json) -- nothing is synthesized from a table or list, so this
// reuses `preview5eToolsClassOptions` exactly as the Warlock invocation loader does, just reading
// `classFeature` rows from a class file instead of `optionalfeature` rows from
// optionalfeatures.json. `parentFeatureName`, when given, names the OWNING classFeature row
// (e.g. 'Divine Order') whose own leading prose is prepended to every matched child's entries --
// see leadingProseFor above.
export function loadClassFeatureOptionCandidatesFor(
  classFileName: string,
  sourceCode: string,
  optionNames: readonly string[],
  definitionIdFor: (optionName: string) => string,
  parentFeatureName?: string
) {
  return async function loadClassFeatureOptionCandidates(_membership: (entry: any) => boolean): Promise<SourceCategoryLoadResult> {
    const allRows = await loadJsonArrayRows(`class/${classFileName}`, 'classFeature')
    const names = new Set(optionNames)
    const matched = allRows.filter((row) => row?.source === sourceCode && names.has(row?.name))

    const leadIn = parentFeatureName ? leadingProseFor(allRows, parentFeatureName, sourceCode) : []
    const rows = leadIn.length
      ? matched.map((row) => ({ ...row, entries: [...leadIn, ...(Array.isArray(row?.entries) ? row.entries : [])] }))
      : matched

    const preview = preview5eToolsClassOptions(rows, definitionIdFor)
    const candidates = toContentPublicationCandidates(preview)
    return { candidates, warnings: preview.warnings }
  }
}
