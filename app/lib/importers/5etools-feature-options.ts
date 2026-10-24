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

// Exported so server/utils/content-sources/dnd5e/xphb.ts's per-option `definitionIdFor`
// callbacks (and the loader file's own class-option variant) can derive the IDENTICAL slug a
// Definition id's own suffix already uses, rather than a second, possibly-diverging copy.
export function slugify(input: string, separator: '-' | '_' = '-'): string {
  const escaped = separator === '_' ? '_' : '-'
  return String(input || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, escaped)
    .replace(new RegExp(`^${escaped}+|${escaped}+$`, 'g'), '')
}

type FeatureOptionFact = { label: string, value: string }

// COMPLETE OPTION-DESCRIPTION COVERAGE. A named option's own real 5etools name sometimes carries
// a parenthetical variant tag the Definition id formula never includes -- e.g. Giant Ancestry's
// list items are literally named "Cloud's Jaunt (Cloud Giant)", but the hand-authored id is
// `source:giant-ancestry.clouds-jaunt`, never `...-cloud-giant`. Structural (a trailing
// `(...)` is stripped by position, never inferred from what the parenthetical SAYS) -- the
// caller's own `definitionIdFor` always receives the stripped `base`, and the parenthetical (when
// present) is surfaced as a real fact rather than silently dropped.
function stripParenthetical(name: string): { base: string, parenthetical: string | null } {
  const match = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(name)
  if (!match?.[1] || !match[2]) return { base: name.trim(), parenthetical: null }
  return { base: match[1].trim(), parenthetical: match[2].trim() }
}

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
// `{type:'entries', name: ...}` block that contains the real options --
// read structurally (by section name, then by the nested node's own real
// `type`), never by row position or guesswork. Two REAL shapes exist in the
// corpus for this (verified directly, both still present this phase):
//
//  - `{type:'table', colLabels, rows:[[name, ...cells], ...]}` (Dragonborn's
//    Draconic Ancestors, Elf's Elven Lineages, Tiefling's Fiendish
//    Legacies). Exactly one extra column (Dragonborn: just "Damage Type")
//    becomes a single structured `facts` entry, labeled with that column's
//    own printed header -- never a hardcoded label. More than one extra
//    column (Elf/Tiefling: "Level 1"/"Level 3"/"Level 5") becomes one
//    `{type:'entries', name: header, entries: cell}` node per column,
//    folded into the option's own `entries` -- the SAME label-join shape
//    `sharedSections` below already relies on, so no new presentation
//    concept is needed to read either case; `resolveOption`
//    (content-presentation/dnd5e.ts) is unchanged by this phase.
//  - `{type:'list', items:[{type:'item', name, entries}, ...]}` (Goliath's
//    Giant Ancestry, Gnome's Gnomish Lineage). Each item's own `entries` IS
//    the option's complete description -- nothing to extract from a row.
//
// `sharedSectionNames` names SIBLING sections (e.g. Dragonborn's 'Breath
// Weapon'/'Damage Resistance') whose prose is shared by every option and is
// carried into each option's own `entries` verbatim -- real corpus text,
// never invented or summarized. Empty/omitted for every species where each
// option's own table cell or list entry is already self-contained (Elf,
// Goliath, Gnome, Tiefling all verified this phase to need none -- their
// sibling sections, e.g. Elf's 'Fey Ancestry'/'Trance', are separate
// passive traits unrelated to which lineage/legacy/benefit was chosen, so
// duplicating them in would misrepresent the real text as option-specific).
// `definitionIdFor` derives the join id structurally from the option's own
// name (parenthetical variant tags already stripped -- see
// stripParenthetical above), using the SAME formula the Rules Package's
// hand-authored Definition id already uses for this species (see the
// caller in server/utils/content-sources/dnd5e/feature-options.ts for the
// real prefix/derivation per species).
export function preview5eToolsSpeciesFeatureOptions(
  speciesRaw: any,
  options: {
    tableSectionName: string
    sharedSectionNames?: string[]
    definitionIdFor: (optionBaseName: string) => string
  }
): EldraImportPreviewResult {
  const speciesName = speciesRaw?.name || 'Species'
  const source = speciesRaw?.source || ''
  const page = speciesRaw?.page != null ? String(speciesRaw.page) : ''
  const entries: any[] = Array.isArray(speciesRaw?.entries) ? speciesRaw.entries : []

  const namedSection = entries.find((entry) => entry?.name === options.tableSectionName)
  const nested: any[] = Array.isArray(namedSection?.entries) ? namedSection.entries : []
  const table = nested.find((entry: any) => entry?.type === 'table' && Array.isArray(entry?.rows))
  const list = nested.find((entry: any) => entry?.type === 'list' && Array.isArray(entry?.items))

  // COMPLETE OPTION-DESCRIPTION COVERAGE -- FOLLOW-UP. A real reported gap, found by tracing the
  // actual published text for Elf/Dragonborn: the named section's own LEADING prose -- e.g.
  // Dragonborn's "Your lineage stems from a dragon progenitor..." or Elf's three sentences
  // explaining what an Elven Lineage even is and how the Level 3/5 bonus spell works -- sits in
  // `nested` BEFORE the table/list node, and was previously never read at all (only the
  // table/list itself was). Every option got the bare per-color/per-lineage mechanics with none
  // of the surrounding explanation, which is exactly the reported "mechanics-only, no plain-
  // language context" symptom -- not an absence of source prose. Structural, not guessed: every
  // plain-string entry preceding the table/list node, in order, verbatim.
  const tableOrListIndex = nested.findIndex((entry) => entry === table || entry === list)
  const leadInEntries = tableOrListIndex > 0 ? nested.slice(0, tableOrListIndex).filter((entry) => typeof entry === 'string') : []

  const sharedSections = (options.sharedSectionNames ?? [])
    .map((name) => entries.find((entry) => entry?.name === name))
    .filter(Boolean)
    .map((section: any) => ({ type: 'entries', name: section.name, entries: section.entries }))

  type Extracted = { rawName: string, entries: unknown, facts: FeatureOptionFact[] }
  let extracted: Extracted[] = []

  if (table) {
    const colLabels: string[] = Array.isArray(table.colLabels) ? table.colLabels.map((label: unknown) => String(label ?? '').trim()) : []
    extracted = (table.rows as any[][])
      .filter((row) => Array.isArray(row) && row[0])
      .map((row) => {
        const rawName = String(row[0]).trim()
        const extraCells = row.slice(1)

        if (extraCells.length === 1) {
          const value = extraCells[0]
          return { rawName, entries: [...leadInEntries, ...sharedSections], facts: value != null ? [{ label: colLabels[1] || 'Detail', value: String(value) }] : [] }
        }

        const columnSections = extraCells.map((cell, index) => ({
          type: 'entries',
          name: colLabels[index + 1] || `Column ${index + 2}`,
          entries: cell
        }))
        return { rawName, entries: [...leadInEntries, ...sharedSections, ...columnSections], facts: [] }
      })
  } else if (list) {
    extracted = (list.items as any[])
      .filter((item) => item?.name)
      .map((item) => {
        const itemEntries = Array.isArray(item.entries) ? item.entries : item.entries != null ? [item.entries] : []
        return { rawName: String(item.name).trim(), entries: [...leadInEntries, ...sharedSections, ...itemEntries], facts: [] }
      })
  }

  const items = extracted.map(({ rawName, entries: optionEntries, facts }) => {
    const { base, parenthetical } = stripParenthetical(rawName)
    const allFacts = parenthetical ? [...facts, { label: 'Variant', value: parenthetical }] : facts

    return buildOptionPreview({
      name: `${speciesName}: ${rawName}`,
      source,
      page,
      entries: optionEntries,
      facts: allFacts,
      definitionId: options.definitionIdFor(base)
    })
  })

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
