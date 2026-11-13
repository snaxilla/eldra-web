// Catalogue Entity Bridge -- Content Pack Browsers Regression Repair.
//
// ROOT CAUSE this module fixes: the six World Game Admin content browsers
// (Spells/Species/Items/Enemies/Classes/Feats) read EXCLUSIVELY from the
// legacy `entities` Directus collection (server/api/worlds/[id]/entities.get.ts,
// server/api/worlds/[id]/enemies.get.ts), filtered by `entity_type`. Since the
// content migration, 5etools-imported spells/species/items/classes/feats/
// enemies are no longer written there -- they are published into Content
// Packs and resolved per-World through resolveWorldContent/
// getWorldContentCatalogue (world-content-runtime.ts / world-content-catalogue.ts).
// The legacy `entities` query still runs (and still correctly returns any
// HOMEBREW-authored entity of these types -- the Homebrew Forge,
// server/utils/homebrew/index.ts's own TYPE_CONFIGS, writes into this exact
// same `entities`+`block_instances` pair), but for a World whose content of
// these types came from an imported-and-published pack rather than the
// Homebrew Forge, that legacy query now returns nothing, which is why the
// browsers show zero results.
//
// THE FIX is additive, not a replacement: this module reads the SAME
// `resolveWorldContent` the Character Creator/Sheet already consume (via
// getWorldContentCatalogue) for exactly the same World-scoped, bound/
// published/authorized content -- never bypassing pack binding or reading a
// provider's source files directly -- and turns each entry into a block-
// shaped pseudo row that the existing entities.get.ts/enemies.get.ts
// rendering pipeline (and WorldEntityInteractivePage.vue/enemies.vue's
// existing `blockByKey`/`itemCore`/`spellCore`/etc. readers) already knows
// how to read. The caller merges these rows alongside the legacy ones, so a
// homebrew spell and an imported-and-published spell both appear, exactly
// as the browsers did before the migration moved imports off the legacy
// path.
//
// WHY RESOLVEWORLDCONTENT, NOT GETWORLDCONTENTCATALOGUE: the catalogue
// layer deliberately strips `data` from every entry it returns (its own
// design decision 1 -- "never expose raw importer payload to a generic
// catalogue consumer that doesn't need it"). This module IS exactly the
// kind of consumer that needs it, the same way world-content-catalogue.ts's
// own `toCatalogueEntry` reads `entry.data` to resolve `presentation`/
// `spellMechanics`/`featMechanics`/`itemMechanics` before stripping it back
// out. This module does the identical thing one layer down, producing
// `.blocks` instead of a mechanics/presentation model, for the one
// additional category (enemies/monsters) and in service of the one
// additional consumer (these six browsers) that needed it.
//
// WHY THE EXISTING preview5eTools* IMPORTER FUNCTIONS, NOT A NEW RESOLVER:
// every one of species/classes/feats/items/spells/monsters already has a
// pure, already-tested `preview5eTools*(payload)` function
// (app/lib/importers/*.ts) that turns raw 5etools JSON into the exact
// `{blockKey, data}[]` shape (`item_core`, `spell_core`, `species_core`,
// `class_core`, `feat_core`) the legacy importer used to persist into
// `block_instances`, and that entities.get.ts/WorldEntityInteractivePage.vue
// already read today. A Content Pack entry's own `data` is that SAME raw
// 5etools JSON, untouched (content-pack-5etools-adapter.ts/
// content-pack-monsters-adapter.ts's own design decisions). Calling
// `preview5eToolsSpells([entry.data])` therefore reconstructs the identical
// `.blocks` shape a legacy import would have produced, with zero new field-
// mapping logic written here, and without touching the importer itself (no
// "expanding the manual importer" -- these functions are called unchanged,
// read-only, never to persist or publish anything).
//
// Each catalogue-backed row is tagged `__source: 'catalogue'` so the client
// can tell it apart from a legacy/homebrew row (`__source: 'legacy'`) --
// catalogue content has no backing `entities` row, so "Delete" and "Open
// Article" (which both operate on a real entities/:id) do not apply to it.

import { resolveWorldContent, type WorldContentEntry } from './world-content-runtime'
// Content Workspaces & Studio Phase 5/6 (§8.9): "catalogue-entity-bridge.ts
// takes EffectiveEntity[] instead of calling resolveWorldContent itself...
// and overlays entry.presentation's description onto the synthesized
// blocks so an authored description appears in the admin browser too."
// Behind ELDRA_EFFECTIVE_CONTENT, default off -- flag-off behavior below
// is byte-identical to before this import existed.
import { isEffectiveContentEnabled, resolveEffectiveContent, type EffectiveEntity } from './world-effective-content'
import { preview5eToolsSpecies } from '../../app/lib/importers/5etools-species'
import { preview5eToolsClasses } from '../../app/lib/importers/5etools-classes'
import { preview5eToolsFeats } from '../../app/lib/importers/5etools-feats'
import { preview5eToolsItems } from '../../app/lib/importers/5etools-items'
import { preview5eToolsSpells } from '../../app/lib/importers/5etools-spells'
import { preview5eToolsMonsters } from '../../app/lib/importers/5etools-monsters'

export type CatalogueBridgeBlock = {
  block_key: string
  blockKey: string
  label: string
  repeatable: boolean
  sort: number
  data: Record<string, any> | null
}

export type CatalogueBridgeRow = {
  id: string
  title: string
  slug: string
  world_id: string
  system_key: string
  entity_type: string
  status: string
  visibility: string
  summary: string
  created_at: string | null
  updated_at: string | null
  image: null
  // Content Workspaces & Studio Phase 5/6 (§8.9, admin image propagation
  // follow-up). The ONE additive, centrally-defined signal
  // server/api/worlds/[id]/entities.get.ts's own `derivedImageUrl`
  // computation checks BEFORE its existing entityImageUrl/extractImageUrl/
  // fluff-fallback chain -- see that file's own comment at the check site.
  // `undefined` (the ordinary case: flag off, or no authored image
  // opinion) means "no override, use the existing chain unchanged" --
  // preserves every pre-existing fluff-derived image untouched.
  // `{ url }` means the author set an image -- takes precedence over
  // everything else. `null` means the author explicitly suppressed the
  // source image -- stops the chain with NO image, which plain block data
  // (extractImageUrl) cannot express (a missing/falsy block field there
  // just falls through to the next fallback instead of stopping).
  effectiveImageOverride?: { url: string } | null
  __source: 'catalogue'
  blocks: CatalogueBridgeBlock[]
}

// The five categories that already produce `EldraImportPreviewEntity`-shaped
// blocks via a `preview5eTools*` function -- `enemy` is handled separately
// below (getCatalogueBackedEnemyRows) since its importer returns a bespoke
// shape, not `.blocks` directly usable the same way (see
// content-pack-monsters-adapter.ts's own header).
const PREVIEWER_BY_ENTITY_TYPE: Record<string, (payload: any) => { items: Array<{ blocks: any[] }> }> = {
  species: preview5eToolsSpecies,
  class: preview5eToolsClasses,
  feat: preview5eToolsFeats,
  item: preview5eToolsItems,
  spell: preview5eToolsSpells
}

function toCatalogueBlocks(rawBlocks: any[] | undefined): CatalogueBridgeBlock[] {
  return (Array.isArray(rawBlocks) ? rawBlocks : []).map((block) => ({
    block_key: String(block?.blockKey || ''),
    blockKey: String(block?.blockKey || ''),
    label: String(block?.label || ''),
    repeatable: Boolean(block?.repeatable),
    sort: Number(block?.sort) || 0,
    data: block?.data ?? null
  }))
}

// The stable, opaque identifier used everywhere a catalogue-backed row needs
// a unique id that is NOT a Directus `entities.id` -- callers must never
// `Number()` this (there is no numeric id to parse out of it; see this
// module's own header on why catalogue content has no backing `entities`
// row at all). Exported so every caller composes it identically rather than
// re-deriving the format ad hoc (Homebrew Forge Content Pack Restoration --
// server/utils/homebrew/index.ts is the second caller after this module's
// own two row-builders below).
export function catalogueTemplateId(packageId: string, slug: string): string {
  return `catalogue:${packageId}:${slug}`
}

// Which block + field holds this entity type's narrative description --
// the ONE field the architecture doc's §8.9 names explicitly for the
// authored-presentation overlay. Not every bridged type has one: `feat`'s
// legacy `feat_core` block never had a `description` field (it uses
// `benefits` instead -- a structural fact of the pre-existing legacy
// shape, not an omission here), so it is deliberately absent from this
// map rather than guessed at.
const DESCRIPTION_BLOCK_BY_ENTITY_TYPE: Partial<Record<string, { blockKey: string; field: string }>> = {
  item: { blockKey: 'item_core', field: 'description' },
  spell: { blockKey: 'spell_core', field: 'description' },
  species: { blockKey: 'species_core', field: 'description' },
  class: { blockKey: 'class_core', field: 'description' }
}

// Overlays an authored presentation's description onto the ONE block/field
// that already carries a textual description for this entity type --
// mutating a COPY of `blocks`, never the input. Only overlays when the
// author actually expressed an opinion (customization.customized), so an
// un-customized entry's admin-rendered description is derived from the
// SAME `data` it always was, not a second, possibly differently-formatted
// recomputation of the identical text.
function overlayAuthoredDescription(entityType: string, blocks: CatalogueBridgeBlock[], entry: EffectiveEntity): CatalogueBridgeBlock[] {
  if (!entry.customization.customized || !entry.presentation?.description?.length) return blocks
  const target = DESCRIPTION_BLOCK_BY_ENTITY_TYPE[entityType]
  if (!target) return blocks

  const text = entry.presentation.description.join('\n\n')
  let found = false
  const overlaid = blocks.map((block) => {
    if (block.blockKey !== target.blockKey) return block
    found = true
    return { ...block, data: { ...block.data, [target.field]: text } }
  })

  if (found) return overlaid
  // No existing block of this key (e.g. an authored-origin workspace
  // entity with no upstream base) -- add one rather than silently
  // dropping the authored description.
  return [...blocks, { block_key: target.blockKey, blockKey: target.blockKey, label: target.blockKey, repeatable: false, sort: blocks.length, data: { [target.field]: text } }]
}

// The ONE place this module decides whether an authored image decision
// exists at all, independent of entity type -- unlike description, no
// per-category block/field mapping is needed, because this is relayed
// through CatalogueBridgeRow.effectiveImageOverride directly, never
// through a block. Checks `customization.authoredFields` (NOT merely
// "is this entry customized at all") so a customized entry whose author
// never touched the image field correctly returns `undefined` (inherit),
// not a stale/absent value masquerading as a decision.
function effectiveImageOverrideFor(entry: EffectiveEntity): { url: string } | null | undefined {
  const imageWasAuthored = entry.customization.authoredFields.some((field) => field.channel === 'presentation' && field.path === 'image')
  if (!imageWasAuthored) return undefined
  return entry.presentation?.image ? { url: entry.presentation.image.url } : null
}

// Single-entry version of getCatalogueBackedEntityRows's per-entry
// conversion -- extracted so a caller that already has ONE specific entry
// in hand (e.g. the Homebrew Forge resolving a client-selected template by
// identity, not listing a whole browser) can reuse the exact same
// previewer dispatch and degrade-on-malformed-data behavior without going
// through the list-building loop. `getCatalogueBackedEntityRows` below now
// calls this too, so there is exactly one place that knows how to turn a
// catalogue entry's raw `data` into `.blocks` per entity type.
//
// `effectiveEntry`, when given, is the SAME entry's EffectiveEntity form
// (presentation + customization) -- used only to overlay an authored
// description (§8.9); `entry`'s own `data` is still what blocks are built
// from either way, so a mechanics correction on a workspace-sourced
// winner's raw data appears here with no separate step.
export function catalogueEntryToBlocks(entityType: string, entry: WorldContentEntry, effectiveEntry?: EffectiveEntity): CatalogueBridgeBlock[] {
  const previewer = PREVIEWER_BY_ENTITY_TYPE[entityType]
  if (!previewer) return []

  try {
    const preview = previewer([entry.data])
    const blocks = toCatalogueBlocks(preview.items[0]?.blocks)
    return effectiveEntry ? overlayAuthoredDescription(entityType, blocks, effectiveEntry) : blocks
  } catch {
    return []
  }
}

export type CatalogueEnemyStructured = {
  blocks: CatalogueBridgeBlock[]
  statblock: Record<string, any> | null
  actions: CatalogueBridgeEnemyAction[]
  monsterProfile: Record<string, any> | null
  summary: string
}

// Single-entry version of getCatalogueBackedEnemyRows's per-entry
// conversion -- same extraction rationale as catalogueEntryToBlocks above,
// for the one entity type (enemy) whose importer produces a bespoke
// statblock/actions/monsterProfile shape rather than `.blocks` alone.
export function catalogueEnemyEntryToStructured(entry: WorldContentEntry): CatalogueEnemyStructured | null {
  try {
    const preview = preview5eToolsMonsters([entry.data])
    const item = preview.items[0]
    const monsterData = item?._monsterData

    const actions: CatalogueBridgeEnemyAction[] = (monsterData?.actions ?? []).map((action: any, index: number) => ({
      id: `catalogue:${entry.packageId}:${entry.slug}:${action.actionType}:${index}`,
      action_type: action.actionType,
      name: action.name,
      text: action.text,
      sort_order: typeof action.sort === 'number' ? action.sort : index
    }))

    return {
      blocks: toCatalogueBlocks(item?.blocks),
      statblock: monsterData?.statblock ?? null,
      actions,
      monsterProfile: monsterData?.monsterProfile ?? null,
      summary: item?.summary || ''
    }
  } catch {
    return null
  }
}

// Catalogue-backed pseudo rows for species/classes/feats/items/spells --
// the five browser entity types sharing the `preview5eTools*` -> `.blocks`
// shape. `entityTypes` is the caller's own already-normalized type filter;
// only the entries matching a KNOWN catalogue-backed type are resolved, so
// a caller asking for e.g. `character,npc` (not a catalogue category) does
// no extra work at all.
export async function getCatalogueBackedEntityRows(
  worldId: string | number,
  entityTypes: readonly string[]
): Promise<CatalogueBridgeRow[]> {
  const wanted = Array.from(new Set(entityTypes.filter((type) => type in PREVIEWER_BY_ENTITY_TYPE)))
  if (!wanted.length) return []

  // Flag off: UNCHANGED from before Phase 5 -- resolveWorldContent, no
  // effective entry, no overlay. Flag on: §8.9's "neither reads
  // content_packs.content directly again" -- byEntityType now comes from
  // the SAME resolveEffectiveContent the gameplay catalogue consumes.
  const useEffective = isEffectiveContentEnabled()
  const byEntityType = useEffective
    ? (await resolveEffectiveContent(worldId)).byEntityType
    : (await resolveWorldContent(worldId)).byEntityType

  const rows: CatalogueBridgeRow[] = []

  for (const entityType of wanted) {
    const previewer = PREVIEWER_BY_ENTITY_TYPE[entityType]
    if (!previewer) continue

    const entries = byEntityType[entityType] || []

    for (const entry of entries) {
      // One malformed published entry must never take down the whole
      // browser -- the same per-entry degrade world-content-catalogue.ts's
      // own `toCatalogueEntry` already applies to `presentation`/
      // `spellMechanics`/`featMechanics`/`itemMechanics`. Delegated to
      // catalogueEntryToBlocks so this exact degrade behavior has one
      // implementation shared with the Homebrew Forge's template resolver.
      const blocks = catalogueEntryToBlocks(entityType, entry, useEffective ? (entry as EffectiveEntity) : undefined)

      rows.push({
        id: catalogueTemplateId(entry.packageId, entry.slug),
        title: entry.title,
        slug: entry.slug,
        world_id: String(worldId),
        system_key: entry.systemKey,
        entity_type: entityType,
        status: 'published',
        visibility: 'world',
        summary: '',
        created_at: null,
        updated_at: null,
        image: null,
        effectiveImageOverride: useEffective ? effectiveImageOverrideFor(entry as EffectiveEntity) : undefined,
        __source: 'catalogue',
        blocks
      })
    }
  }

  return rows
}

export type CatalogueBridgeEnemyAction = {
  id: string
  action_type: string
  name: string
  text: string
  sort_order: number
}

export type CatalogueBridgeEnemyRow = {
  id: string
  title: string
  slug: string
  summary: string
  entityType: string
  image: null
  imageUrl: null
  image_url: null
  blocks: CatalogueBridgeBlock[]
  statblock: Record<string, any> | null
  actions: CatalogueBridgeEnemyAction[]
  monsterProfile: Record<string, any> | null
  __source: 'catalogue'
}

// Catalogue-backed pseudo rows for Enemies. Reuses preview5eToolsMonsters --
// the SAME pure function the legacy monster importer uses -- on each
// published entry's own `data` (the untouched raw 5etools monster JSON,
// content-pack-monsters-adapter.ts's own design decision 1) to rebuild the
// identical `statblock`/`actions`/`monsterProfile` shape
// server/api/worlds/[id]/enemies.get.ts already queries out of
// entity_statblocks/entity_actions/monster_profiles for a legacy/homebrew
// enemy -- so enemies.vue's existing rendering code needs no changes.
export async function getCatalogueBackedEnemyRows(worldId: string | number): Promise<CatalogueBridgeEnemyRow[]> {
  const resolved = await resolveWorldContent(worldId)
  const entries = resolved.byEntityType.enemy || []
  const rows: CatalogueBridgeEnemyRow[] = []

  for (const entry of entries) {
    // Delegated to catalogueEnemyEntryToStructured -- same per-entry
    // degrade-on-malformed-data behavior, now shared with the Homebrew
    // Forge's template resolver instead of duplicated.
    const structured = catalogueEnemyEntryToStructured(entry)
    if (!structured) continue

    rows.push({
      id: catalogueTemplateId(entry.packageId, entry.slug),
      title: entry.title,
      slug: entry.slug,
      summary: structured.summary,
      entityType: 'enemy',
      image: null,
      imageUrl: null,
      image_url: null,
      blocks: structured.blocks,
      statblock: structured.statblock,
      actions: structured.actions,
      monsterProfile: structured.monsterProfile,
      __source: 'catalogue'
    })
  }

  return rows
}
