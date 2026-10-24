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

function slugify(input: string, separator: '-' | '_' = '-'): string {
  const escaped = separator === '_' ? '_' : '-'
  return String(input || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, escaped)
    .replace(new RegExp(`^${escaped}+|${escaped}+$`, 'g'), '')
}

// See this file's header -- `_membership` (the PROVIDER's own predicate) is
// intentionally unused, mirroring loadSubclassCandidatesFor's own posture
// exactly: both options this category authors need a DIFFERENT membership
// rule than the provider's single closure.
export function loadSpeciesFeatureOptionCandidatesFor(
  sourceCode: string,
  speciesName: string,
  tableSectionName: string,
  sharedSectionNames: string[],
  definitionIdPrefix: string,
  factLabel: string | undefined,
  vocabulary: string | undefined
) {
  return async function loadSpeciesFeatureOptionCandidates(_membership: (entry: any) => boolean): Promise<SourceCategoryLoadResult> {
    const rows = await loadDatasetEntries('species', isEntryFromSource(sourceCode))
    const species = rows.find((row) => row?.name === speciesName)

    if (!species) {
      return { candidates: [], warnings: [`${speciesName} (${sourceCode}) not found -- no feature options published`] }
    }

    const preview = preview5eToolsSpeciesFeatureOptions(species, {
      tableSectionName,
      sharedSectionNames,
      factLabel,
      definitionIdFor: (optionName) => `${definitionIdPrefix}.${slugify(optionName)}`
    })
    const candidates = toContentPublicationCandidates(preview)
    return { candidates, warnings: preview.warnings }
  }
}

let cachedOptionalFeatures: any[] | null = null

async function loadOptionalFeatureRows(): Promise<any[]> {
  if (cachedOptionalFeatures) return cachedOptionalFeatures
  let rows: any[] = []
  try {
    const raw = await readFile(join(DATA_ROOT, 'optionalfeatures.json'), 'utf8')
    const parsed = JSON.parse(raw)
    rows = Array.isArray(parsed?.optionalfeature) ? parsed.optionalfeature : []
  } catch {
    rows = []
  }
  cachedOptionalFeatures = rows
  return rows
}

export function loadClassOptionCandidatesFor(
  sourceCode: string,
  optionNames: readonly string[],
  definitionIdPrefix: string,
  _vocabulary: string | undefined
) {
  return async function loadClassOptionCandidates(_membership: (entry: any) => boolean): Promise<SourceCategoryLoadResult> {
    const allRows = await loadOptionalFeatureRows()
    const names = new Set(optionNames)
    const rows = allRows.filter((row) => row?.source === sourceCode && names.has(row?.name))

    const preview = preview5eToolsClassOptions(rows, (optionName) => `${definitionIdPrefix}.${slugify(optionName, '_')}.known`)
    const candidates = toContentPublicationCandidates(preview)
    return { candidates, warnings: preview.warnings }
  }
}
