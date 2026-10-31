// Homebrew Spell Catalogue Bridge -- Character Sheet Homebrew Spell
// Picker.
//
// ROOT CAUSE this module exists to close: the Character Sheet's Add Spell
// search (CharacterSpellcastingPanel.vue, backed by GET
// /api/worlds/:id/catalogue) reads ONLY `WorldGameplayCatalogue.spells`,
// which `getWorldContentCatalogue` (world-content-catalogue.ts) builds
// EXCLUSIVELY from this World's bound/published Content Packs -- see that
// module's own header: "This module is a *parallel*, Content-Pack-sourced
// foundation, not an integration with [the legacy entity resolver] -- it
// shares no code and no concept with character-sheet-resolver.ts." A
// World-authored Homebrew spell is only ever a real `entities` row
// (entity_type: 'spell', world_id: X) + a `spell_core` block -- exactly
// the shape createHomebrewDraft (server/utils/homebrew/index.ts) produces
// -- so it was structurally invisible to the Add Spell search no matter
// what the player typed. This was never a client-side filtering bug or a
// persistence-contract bug; the search endpoint's data source itself never
// read the legacy `entities` table.
//
// THE FIX'S WHOLE SURFACE: read this World's own Homebrew spell entities
// (world-scoped, server-side -- see getHomebrewSpellCatalogueEntries'
// own `world_id` filter, the entire authorization boundary) and convert
// each into the SAME ContentCatalogueEntry shape a published spell already
// has, so every existing downstream consumer -- the picker's options list,
// resolveSlot/resolveSpells' (packageId, slug) matching
// (character-assembly.ts), the sheet's resolved-entry display
// (CharacterSpellcastingPanel.vue) -- needs ZERO changes to also
// understand a Homebrew spell. This module does not modify
// world-content-catalogue.ts itself: that module's own "no legacy
// integration" design decision is preserved untouched. The merge is
// composed one layer up, by getWorldGameplayCatalogueWithHomebrewSpells
// below, which both GET /api/worlds/:id/catalogue (the picker's options)
// and character-assembly.ts's own catalogue read (spell resolution after
// save/reload) now call instead of getWorldContentCatalogue directly --
// both must see the same merged `spells` list, or a Homebrew pick would
// show in search but resolve as "missing" afterward.
//
// IDENTITY: HOMEBREW_SPELL_PACKAGE_ID is a sentinel packageId, never a real
// published package (every real packageId is bound through
// listContentPackBindingsForWorld; this one never is) -- paired with the
// entity's own World-unique slug (uniqueEntitySlug, homebrew/index.ts), so
// (packageId, slug) stays globally unambiguous and collision-free against
// any real Content Pack's own (packageId, slug) pairs. resolveSlot needs
// no changes at all: its match is a plain `(packageId, slug)` equality
// check against whatever `spells` array it is handed, so a Homebrew entry
// is just one more array member to it -- the exact same reference shape
// (SpellRef = {packageId, slug}, app/lib/characters/spellcasting.ts)
// already used for a published spell, never an invented incompatible one.
//
// MECHANICS: deliberately left unresolved (no `spellMechanics`, no
// `presentation`) -- CharacterSpellcastingPanel.vue's own `groupedSpells`
// is already explicitly designed around "a homebrew spell has no
// spellMechanics at all" (its own comment: "homebrew, missing/unpublished
// ... lands in Ungrouped ... ALWAYS shown, never hidden"). Computing one
// here would mean interpreting gameplay mechanics from a Homebrew author's
// own free-text/partial data -- forbidden both by this task's own
// instruction not to alter Rules Engine spell eligibility and by
// world-content-catalogue.ts's own header ("Do NOT interpret gameplay
// mechanics. Do NOT compute rules.").
//
// NAME: `title` is the entity's own authored name, copied verbatim --
// never prefixed with "Homebrew" (the naming contract commit 260258f
// established). Source identity is carried explicitly in `provider`
// ('eldra-homebrew', the exact string the Homebrew Forge's own
// `import_source` block already writes) and `sourceBook` ('Homebrew', a
// concise label CharacterSpellcastingPanel.vue's existing template
// already renders for any resolved entry's `entry.sourceBook` -- no
// template change needed).
//
// SCOPE: spells only, and only the Character Sheet's manual Add Spell
// round trip (the dialog's options + character-assembly.ts's resolution).
// Automated spell ACQUISITION during level-up/progression
// (character-progression-plan.ts) and ContentChoices resolution
// (character-derived.ts) are separate, Rules-Engine-adjacent systems this
// task does not touch -- this is a focused integration repair, not a
// general "Homebrew everywhere" change.

import { directusServiceRequest } from './directus'
import { getWorldContentCatalogue, type ContentCatalogueEntry, type WorldGameplayCatalogue } from './world-content-catalogue'

export const HOMEBREW_SPELL_PACKAGE_ID = 'eldra.homebrew'
const HOMEBREW_SPELL_PACKAGE_VERSION = '0.0.0'

function cleanText(value: any): string {
  return String(value ?? '').trim()
}

function worldValue(worldId: string | number) {
  const parsed = Number(worldId)
  return Number.isFinite(parsed) ? parsed : String(worldId)
}

// World-scoped and server-side only -- the `world_id` filter below is the
// entire authorization boundary (mirrors listHomebrewTemplates/
// entities.get.ts's own identical filter shape), so a spell authored in
// World A can never surface in World B's Add Spell search.
//
// Degrades to an empty list on any Directus read failure, exactly like
// homebrew/index.ts's own collectionFields precedent -- this is an
// ADDITIVE data source layered onto an already-working catalogue read, so
// a transient failure here must never take down character assembly or the
// Spells catalogue entirely; it should just mean "no Homebrew spells shown
// this read," the same degrade-gracefully posture
// world-content-catalogue.ts's own per-entry resolvers already use.
export async function getHomebrewSpellCatalogueEntries(
  worldId: string | number
): Promise<ContentCatalogueEntry[]> {
  try {
    const entitiesRes: any = await directusServiceRequest('/items/entities', {
      method: 'GET',
      query: {
        filter: {
          _and: [
            { world_id: { _eq: worldValue(worldId) } },
            { entity_type: { _eq: 'spell' } }
          ]
        },
        limit: -1,
        fields: 'id,title,slug,system_key'
      }
    })

    const rows: any[] = Array.isArray(entitiesRes?.data) ? entitiesRes.data : []

    return rows
      .filter((row) => cleanText(row?.slug))
      .map((row) => ({
        packageId: HOMEBREW_SPELL_PACKAGE_ID,
        packageVersion: HOMEBREW_SPELL_PACKAGE_VERSION,
        systemKey: cleanText(row?.system_key) || 'dnd5e',
        title: cleanText(row?.title) || 'Untitled Spell',
        slug: cleanText(row?.slug),
        externalId: `homebrew-entity:${cleanText(row?.id)}`,
        provider: 'eldra-homebrew',
        sourceBook: 'Homebrew'
      }))
  } catch {
    return []
  }
}

// The one place both consumers of the Add Spell round trip (the picker's
// options list and the sheet's own resolution after save/reload) read the
// World's spell catalogue from, so they can never drift out of sync with
// each other. Additive only: every published-pack entry
// getWorldContentCatalogue already produced is kept exactly as-is; Homebrew
// spells are appended after. A World with no Homebrew spells gets back
// precisely what getWorldContentCatalogue itself would have returned.
export async function getWorldGameplayCatalogueWithHomebrewSpells(
  worldId: string | number
): Promise<WorldGameplayCatalogue> {
  const catalogue = await getWorldContentCatalogue(worldId)
  const homebrewSpells = await getHomebrewSpellCatalogueEntries(worldId)

  if (homebrewSpells.length) {
    catalogue.spells = [...catalogue.spells, ...homebrewSpells]
  }

  return catalogue
}
