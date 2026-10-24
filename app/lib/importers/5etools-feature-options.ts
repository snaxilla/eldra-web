// Character Creator V3 -- Selected Option Explanations. The Feature Option
// importer: produces one EldraImportPreviewEntity per NAMED OPTION inside a
// larger species trait (e.g. each Draconic Ancestry color) or class feature
// (e.g. each Warlock invocation), joined back to its own hand-authored
// Rules Engine Definition id via `definitionId` -- see that field's own doc
// comment (app/lib/importers/types.ts) for why this join exists, and
// rules-package-architecture.md §18.1 for why the Definition itself can
// never carry this prose directly ("prose lives in Content Packs, not
// here" -- a licensing boundary enforced by
// tests/rules/dnd5e-2024-package.test.ts, not by convention).
//
// Two distinct upstream shapes feed this importer (see each function's own
// header below): a species option is SYNTHESIZED per-row from a species'
// own `entries` array (there is no single 5etools row for e.g. "Draconic
// Ancestry: Black" anywhere in the corpus); a class option (e.g. a Warlock
// invocation) is already a complete, independent row in
// optionalfeatures.json. Both converge on the SAME generic preview `raw`
// shape (`name`/`source`/`page`/`entries`/`facts`), which
// app/lib/content-presentation/dnd5e.ts's `resolveOption` reads uniformly,
// with no branch for which kind produced it.
//
// `entityType: 'featureOption'` is intentionally NOT registered in
// app/lib/systems/dnd5e.ts (the legacy World-entity block schema) --
// confirmed by tracing content-pack-5etools-adapter.ts's own
// `toContentPublicationCandidate`, which sets `data: entity.raw` and never
// reads `entity.blocks` at all. `blocks` below is built only for the same
// shape-consistency every other importer in this directory keeps; a
// registration-less entityType already degrades `buildDefaultEntityData`
// to `[]` (getBlocksForEntity's own "unknown entity type" fallback), so
// this costs nothing and invents no new convention.

import { buildDefaultEntityData } from '../systems'
import type { EldraImportPreviewEntity, EldraImportPreviewResult } from './types'

function slugify(input: string, separator: '-' | '_' = '-'): string {
  const escaped = separator === '_' ? '_' : '-'
  return String(input || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, escaped)
    .replace(new RegExp(`^${escaped}+|${escaped}+$`, 'g'), '')
}

type FeatureOptionFact = { label: string, value: string }

function buildOptionPreview(params: {
  name: string
  source: string
  page?: string
  entries: unknown
  facts?: FeatureOptionFact[]
  definitionId: string
}): EldraImportPreviewEntity {
  const { name, source, page, entries, facts, definitionId } = params
  const externalId = `${name}__${source || 'unknown'}`
  const slug = slugify(`${name}-${source || 'option'}`)
  const blocks = buildDefaultEntityData('dnd5e', 'featureOption')

  return {
    systemKey: 'dnd5e',
    entityType: 'featureOption',
    title: name,
    slug,
    provider: '5etools-json',
    externalId,
    sourceBook: source,
    sourcePage: page,
    blocks,
    raw: { name, source, page, entries, facts: facts ?? [] },
    definitionId
  }
}

// ---------------------------------------------------------------------------
// SPECIES FEATURE OPTIONS
// ---------------------------------------------------------------------------
// `speciesRaw` is one already-loaded species row (e.g. the real Dragonborn
// (XPHB) `race` row from races.json). `tableSectionName` names the
// `{type:'entries', name: ...}` block that contains the real options table
// (e.g. 'Draconic Ancestry', whose nested `{type:'table', rows:[[name,
// damageType], ...]}` is the Draconic Ancestors table) -- read structurally
// (by section name, then by nested table shape), never by row position or
// guesswork. `sharedSectionNames` names SIBLING sections (e.g. 'Breath
// Weapon', 'Damage Resistance') whose prose is shared by every option and
// is carried into each option's own `entries` verbatim -- real corpus text,
// never invented or summarized. `definitionIdFor` derives the join id
// structurally from the table row's own first column, using the SAME
// formula the Rules Package's hand-authored Definition id already uses for
// this species (see the caller in server/utils/content-sources/dnd5e/
// feature-options.ts for the real prefix).
export function preview5eToolsSpeciesFeatureOptions(
  speciesRaw: any,
  options: {
    tableSectionName: string
    sharedSectionNames?: string[]
    factLabel?: string
    definitionIdFor: (optionName: string) => string
  }
): EldraImportPreviewResult {
  const speciesName = speciesRaw?.name || 'Species'
  const source = speciesRaw?.source || ''
  const page = speciesRaw?.page != null ? String(speciesRaw.page) : ''
  const entries: any[] = Array.isArray(speciesRaw?.entries) ? speciesRaw.entries : []

  const tableSection = entries.find((entry) => entry?.name === options.tableSectionName)
  const table = Array.isArray(tableSection?.entries)
    ? tableSection.entries.find((entry: any) => entry?.type === 'table' && Array.isArray(entry?.rows))
    : null
  const rows: any[][] = Array.isArray(table?.rows) ? table.rows : []

  const sharedSections = (options.sharedSectionNames ?? [])
    .map((name) => entries.find((entry) => entry?.name === name))
    .filter(Boolean)
    .map((section: any) => ({ type: 'entries', name: section.name, entries: section.entries }))

  const items = rows
    .map((row) => {
      const optionName = String(row?.[0] ?? '').trim()
      if (!optionName) return null

      const factValue = row?.[1] != null ? String(row[1]).trim() : ''
      const facts: FeatureOptionFact[] = options.factLabel && factValue
        ? [{ label: options.factLabel, value: factValue }]
        : []

      return buildOptionPreview({
        name: `${speciesName}: ${optionName}`,
        source,
        page,
        entries: sharedSections,
        facts,
        definitionId: options.definitionIdFor(optionName)
      })
    })
    .filter((item): item is EldraImportPreviewEntity => item !== null)

  return {
    provider: '5etools-json',
    systemKey: 'dnd5e',
    entityType: 'featureOption',
    count: items.length,
    items,
    warnings: items.length ? [] : [`No options found in '${options.tableSectionName}' for ${speciesName}`]
  }
}

// ---------------------------------------------------------------------------
// CLASS OPTIONS
// ---------------------------------------------------------------------------
// Each row IS already a complete, independent 5etools entry (an
// `optionalfeature` row, e.g. one Warlock invocation) -- unlike species
// options, nothing here is synthesized. `rows` must already be filtered
// (by the caller's loader) to exactly the named options this phase
// authors; `definitionIdFor` derives the join id structurally from the
// row's own `name`, using the SAME formula the Rules Package's
// hand-authored Definition id already uses for that option.
export function preview5eToolsClassOptions(
  rows: any[],
  definitionIdFor: (optionName: string) => string
): EldraImportPreviewResult {
  const items = rows
    .map((row) => {
      const name = String(row?.name ?? '').trim()
      if (!name) return null

      return buildOptionPreview({
        name,
        source: row?.source || '',
        page: row?.page != null ? String(row.page) : '',
        entries: row?.entries,
        definitionId: definitionIdFor(name)
      })
    })
    .filter((item): item is EldraImportPreviewEntity => item !== null)

  return {
    provider: '5etools-json',
    systemKey: 'dnd5e',
    entityType: 'featureOption',
    count: items.length,
    items,
    warnings: items.length ? [] : ['No class options found']
  }
}
