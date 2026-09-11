<script setup lang="ts">
// Character Sheet V2 -- Phase 1. See server/utils/character-assembly.ts and
// server/api/worlds/[id]/characters/[characterId]/assembly.get.ts for the
// design this renders. This page consumes ONLY
// GET /api/worlds/:id/characters/:characterId/assembly -- it holds no
// concept of Content Packs, bindings, the Catalogue, the importer, or
// 5etools; those abstractions are already resolved away behind the
// assembly endpoint by the time this page ever sees a response. Deliberately
// separate from entities/[entityId]/sheet.vue (V1, which reads World
// Entities and a character_sheets row) -- this page never calls
// /entities or /character_sheets. This is an inspection surface only: no
// ability scores, equipment, spellcasting, actions, notes, or editing (this
// task's own NON-GOALS) -- just Name/Species/Class/Background, rendered
// exactly as Assembly resolved them, including "missing" when it did not.
//
// ---------------------------------------------------------------------------
// PHASE 2: THE SAME MODELS THE BUILDER SHOWED
// ---------------------------------------------------------------------------
// Each resolved slot's placeholder card (source book + package id, and
// nothing else) is replaced by the resolved presentation model the Content
// Pack publishes, rendered through the SAME component the Character Builder
// previews with (~/components/characters/ContentPresentationPanel.vue).
//
// Builder and Sheet are two contexts on one model, not two renderings of one
// idea: what a player read while choosing a Species is exactly what they read
// afterwards on the sheet, down to the wording, because it is the same
// component fed by the same resolver.
//
// Provenance stays on the card and does NOT move into the panel: which pack
// and version an entry resolved through is a fact about this character's
// binding, not about the Species, and it is what makes a later "missing"
// state intelligible.
//
// This page still holds no concept of Content Packs' internals, 5etools, or
// `data` -- `entry.presentation` arrives already resolved from the assembly
// endpoint, which gets it from the World Content Catalogue.
//
// ---------------------------------------------------------------------------
// RULES ENGINE INTEGRATION (rules-package-architecture.md §13.1)
// ---------------------------------------------------------------------------
// The ability score panel is replaced by DERIVED output: ability modifiers,
// proficiency bonus, and saving throw / skill proficiencies, all read from
// GET /api/worlds/:id/characters/:characterId/derived.
//
// NOT ONE OF THOSE NUMBERS IS COMPUTED HERE. This page performs no
// arithmetic at all -- it fetches a projection and renders it. The engine
// calculated every value; the bridge supplied every input; this file chose
// only where things sit on screen.
//
// It also names no ability, skill, or Definition ID. It selects which
// CATEGORIES to render (§13.2: "Sheet regions address Rule Categories"),
// which is the agnostic vocabulary -- a package that declares no
// `core.skills` definitions simply produces no skills region, with no
// configuration and no per-system code.
//
// Two absences are legal and rendered as such, never as errors: a World with
// no Rules Package activated, and a package that is activated but broken.
// Those are distinct states and the sheet says which.
//
// ---------------------------------------------------------------------------
// PHASE 3: IDENTITY AND ABILITY SCORES
// ---------------------------------------------------------------------------
// The placeholder identity section (a bare title and a sentence explaining
// the page) is replaced by a real one: Name, then Species / Class /
// Background at a glance, then the six ability scores.
//
// VALUES ONLY. This page displays what the character HAS and derives nothing
// from it -- no modifier beside a score, no saving throw, no skill bonus, no
// armour class, no hit points, no initiative. Every one of those is the Rules
// Engine's (app/lib/rules/**), which this page does not import and must not
// reimplement. When they arrive, they arrive as data.
//
// The Sheet DISPLAYS; the Builder EDITS. There is no inline editing here --
// the ability scores link out to the Builder's own editing surface
// (.../[characterId]/abilities), which is also the path by which a character
// created before Phase 3 acquires scores at all.
//
// ---------------------------------------------------------------------------
// INVENTORY -- THE FIRST V1 FEATURE ON THE NEW ARCHITECTURE
// ---------------------------------------------------------------------------
// V1's Inventory tab, rebuilt on Character Assembly rather than ported. Its
// INFORMATION ARCHITECTURE is preserved (an add panel above a dense two-up
// item grid, quantity/equipped/attuned per card); its PLUMBING is not. There
// is no `character_sheets` row, no `character_sheet_inventory` table, no
// runtime column probing, and no snapshotted 5etools payload: items are
// `(packageId, slug)` references re-resolved against the World's catalogue on
// every read, exactly as Species/Class/Background already are.
//
// Inventory is the ONE editable surface on this page, and deliberately so --
// see CharacterInventoryPanel.vue's header. Picking something up happens at
// the table, not in a character builder.
//
// This page still computes nothing. Every list change is decided by the pure
// module (app/lib/characters/inventory.ts) and saved; no weight, capacity,
// attunement limit, or armour class is calculated anywhere, because those are
// Rule Category 13 (`equipment`) and belong to the Rules Engine.
//
// ---------------------------------------------------------------------------
// NOTES -- THE SECOND V1 FEATURE ON THE NEW ARCHITECTURE
// ---------------------------------------------------------------------------
// V1's Notes tab, reshaped rather than ported: six named fields (General,
// Appearance, Personality, Backstory, Goals, Secrets) instead of an
// open-ended card list, because that is the shape this feature was scoped
// to. Persisted through Character Assembly's same block_instances pattern
// Inventory established -- see server/utils/character-notes.ts.
//
// Notes resolve against nothing: no catalogue join, no Rules Engine call,
// no derived value. They are the one piece of this page that is exactly what
// was typed, both in and out.
//
// `secrets` is an ordinary field, not access-controlled -- see
// character-notes.ts's own note on why: no real GM role exists yet to gate
// it on, and labelling it GM-only here would promise privacy this platform
// cannot enforce.
//
// ---------------------------------------------------------------------------
// HEALTH -- THE SECOND GAMEPLAY-DERIVED SYSTEM, FOLLOWING ARMOR CLASS
// ---------------------------------------------------------------------------
// Same shape as Armor Class: Maximum HP, Hit Dice (total), and Hit Dice
// Available are ALL Rules Engine output, read from
// `derived.byCategory['core.health']` via `findDerivedNumber` -- never
// computed here. Current HP, Temporary HP, Hit Dice spent, and Death Save
// marks are the player's own stored data (server/utils/character-health.ts,
// the same block_instances pattern every other player-data block uses),
// edited directly on the Sheet -- Health is the second deliberate exception
// to "the Sheet displays, the Builder edits" (Inventory was the first, for
// the identical reason: it changes during play, not at creation).
//
// `findDerivedNumber` reads ONLY the three read-only summaries -- never
// Current HP or Death Saves, which the player edits directly through
// CharacterRecoveryPanel.vue (CharacterHealthPanel.vue, renamed in Phase
// 3's display/action split -- see that file's own header). Rendering
// those through the generic `core.health` region too would show the same
// fact twice, through two different paths; see that helper's own note.
//
// ---------------------------------------------------------------------------
// SPELLCASTING -- THE SECOND GAMEPLAY SYSTEM ON THE RULES ENGINE, THE SAME
// SHAPE AS HEALTH
// ---------------------------------------------------------------------------
// Spellcasting Ability Modifier, Spell Save DC, and Spell Attack Bonus are
// ALL Rules Engine output, read via `findDerivedNumber`/`findDerivedBoolean`
// -- never computed here. Known/Prepared spells and expended slot counts are
// the player's own stored data (server/utils/character-spellcasting.ts, the
// same block_instances pattern every other player-data block uses), edited
// directly on the Sheet for the identical reason Inventory and Health are.
//
// `slotLevels` is the ONE piece of interpretation this page's data layer
// performs for Spellcasting: which of the three Spell Slot progression
// Tables (`derived.tables`) applies to THIS character, picked by reading the
// `caster_type` boolean flags this file already hardcodes the Definition ids
// of -- the same "the fixed key names the package's own vocabulary declares"
// posture `findDerivedNumber('core.health', 'value:hit_points.max')`
// immediately above already establishes for Health, one level up (a Table,
// not a Value, because Spell Slot progression is not a formula -- see
// packages/eldra-dnd5e-2024/README.md's own note on why `lookup()` is not
// evaluated). This still computes no NUMBER: it selects a row a Table
// already declares and reads it, exactly as it already selects which
// `derived.collections` entry is the equipment slots. As of Phase 2 (see
// below), this selection lives in useCharacterSheet.ts, not this file.
//
// ---------------------------------------------------------------------------
// ACTIONS -- "WHAT CAN MY CHARACTER DO?", A PROJECTION OF EVERYTHING ABOVE
// ---------------------------------------------------------------------------
// The Character Actions System. Fetched from its own endpoint
// (GET .../actions, server/utils/character-actions.ts) rather than composed
// on this page the way `slotLevels` is above -- Actions combines FIVE
// sources (Species, Class, Background, equipped weapons, prepared spells)
// and attaches Rules Engine numbers to each, which is real orchestration
// work, not the single "pick a table row" selection `slotLevels` performs.
// This page still computes nothing: it renders whatever the endpoint
// already assembled. Read-only -- see CharacterActionsPanel.vue's own
// header for why this is the one panel added by this task with no `@`
// emits at all.
//
// ---------------------------------------------------------------------------
// PHASE 2 (BEAUTIFICATION PASS): DATA LAYER CONSOLIDATION
// ---------------------------------------------------------------------------
// Everything described above as "fetched"/"read from `derived`" now happens
// inside app/composables/useCharacterSheet.ts, and every mutation described
// above as "saved"/"POSTed" now happens inside
// app/composables/useCharacterMutations.ts. This page calls both composables
// once each and renders what they return -- it orchestrates LAYOUT, not
// DATA. See each composable's own header for the reasoning behind its
// specific domain boundaries (notably: why Notes stays local to this page
// rather than becoming a sixth mutation domain, and why Join/Leave Encounter
// lives under the `conditions` mutation group rather than its own).
//
// The identity summary is composed inline rather than extracted into a
// component: it is used by exactly this one page. The ability scores ARE
// extracted (CharacterAbilityScoresPanel), because the Builder's review step
// renders the same panel -- the same test ContentPresentationPanel passed.
// Encounter and Conditions ARE now extracted too (CharacterEncounterPanel,
// CharacterConditionsPanel) -- Phase 2's other stated deliverable, alongside
// the two composables above.
//
// ---------------------------------------------------------------------------
// PHASE 4 (BEAUTIFICATION PASS): SHELL, NAVIGATION, THREE-COLUMN LAYOUT
// -- SUPERSEDED BY CORRECTIVE PHASE 2R, BELOW
// ---------------------------------------------------------------------------
// Phase 4 gave this page a desktop-only three-column dashboard (left rail /
// center / right rail via CharacterSheetDesktopLayout.vue), nested inside
// Eldra's OWN three-pane workspace shell (world navigation / main
// workspace / context rail). Corrective Phase 2R (see
// eldra-character-sheet-visual-language.md) rejects that nesting outright:
// a second three-column app-within-app inside the workspace's own middle
// pane is precisely the "admin dashboard" feeling the Beautification Pass
// exists to remove, not a fix for it. Nothing about §3.4's five tabs or
// `?tab=` URL sync changes -- only the LAYOUT those tabs render into.
//
// ---------------------------------------------------------------------------
// CORRECTIVE PHASE 2R: V1-STYLE FOLIO SHELL
// ---------------------------------------------------------------------------
// The rails are gone, not restyled. `CharacterSheetShell.vue` no longer
// renders `CharacterSheetDesktopLayout.vue` at all (left unused on disk,
// per this task's own "bypass, don't delete" guidance) -- every breakpoint
// now gets the SAME single folio body: one sticky command center
// (`CharacterSheetCommandCenter.vue`, this page's one Feature surface),
// then one tabbed content column. What used to be gated `v-if="!isDesktop"`
// (Identity/Ability Scores/Derived folding into the Character tab;
// Recovery/Encounter/Conditions folding into the Play tab, "never both at
// once" to avoid two live instances of the same stateful panel) is now
// simply the ONLY copy of that content -- there is no second, rail-hosted
// copy left to avoid duplicating. This is why the template below is
// smaller than Phase 4's, not larger.
//
// `CharacterIdentityCard` (Visual Language Phase 2) is unchanged and
// simply relocated from "desktop left rail / mobile Character-tab fold" to
// "the one place it's ever shown now": the top of the Character tab's
// body. `CharacterVitalsBar` is unchanged internally and now renders
// `bare` inside `CharacterSheetCommandCenter`, which supplies the identity
// summary (portrait thumbnail, name, level, Species/Class/Background at a
// glance) and Back/Rest command buttons the old Vitals Bar's own top row
// used to own alone -- see that component's own header for the full
// reasoning. No gameplay panel below (Actions/Recovery/Spellcasting/
// Inventory/Conditions/Encounter) was touched: every one is the exact same
// component this task's IMPORTANT section says not to redesign, only
// re-parented into a flatter template.
//
// ---------------------------------------------------------------------------
// DESKTOP IA PASS: TWO SHEET REGIONS + ELDRA'S OWN CONTEXT DRAWER
// ---------------------------------------------------------------------------
// Corrective Phase 2R's single folio column was right to reject Phase 4's
// three-column app-within-an-app, and wrong to conclude the answer was one
// column at every width: it left a 2560px desktop mostly empty and buried
// saves and skills behind a tab.
//
// Measured against a real 5e sheet's desktop information architecture, the
// correction is that the sheet has TWO regions and the THIRD PANE IS NOT
// THE SHEET'S:
//
//   Command center   identity, ability tiles, HP/AC/DC, conditions, turn
//   Left region      reference: saves, proficiency, defenses (>= 1280px)
//   Center region    skills (always visible) + the tab body
//   Context drawer   Eldra's EXISTING WorldEntityContextDrawer -- the same
//                    component the World map, roster, admin, timelines and
//                    entity pages already open, now opened by this page too
//
// That last line is the whole point. A right-hand rail owned by the sheet
// would be a second context system sitting inside a workspace that already
// has one; instead an action/spell/item/feature/skill opens in the drawer
// Eldra already had, and the sheet compresses to make room for it at
// desktop width exactly as the reference sheet does. No new drawer, no
// third rail.
//
// The left region is rendered TWICE (rail at >= 1280px, folded into the
// Character tab below that) with CSS choosing which is visible rather than
// a JS breakpoint. That is safe here and nowhere else: every panel in it is
// a read-only projection of derived values. Recovery/Encounter, which
// mutate, are still rendered exactly once -- see
// CharacterReferencePanels.vue's own header.
//
// Skills are persistent at every width rather than living in a tab: "what
// do I roll for that?" is asked constantly and is not a destination.

import CharacterAbilityScoresPanel from '~/components/characters/CharacterAbilityScoresPanel.vue'
import CharacterInventoryPanel from '~/components/characters/CharacterInventoryPanel.vue'
import CharacterNotesPanel from '~/components/characters/CharacterNotesPanel.vue'
import CharacterRecoveryPanel from '~/components/characters/CharacterRecoveryPanel.vue'
import CharacterSpellcastingPanel from '~/components/characters/CharacterSpellcastingPanel.vue'
import CharacterDerivedPanel from '~/components/characters/CharacterDerivedPanel.vue'
import CharacterActionsPanel from '~/components/characters/CharacterActionsPanel.vue'
import ContentPresentationPanel from '~/components/characters/ContentPresentationPanel.vue'
import CharacterSheetSection from '~/components/characters/CharacterSheetSection.vue'
import CharacterStatChip from '~/components/characters/CharacterStatChip.vue'
import CharacterEmptyState from '~/components/characters/CharacterEmptyState.vue'
import CharacterEncounterPanel from '~/components/characters/CharacterEncounterPanel.vue'
import CharacterConditionsPanel from '~/components/characters/CharacterConditionsPanel.vue'
import CharacterSheetShell from '~/components/characters/CharacterSheetShell.vue'
import CharacterIdentityCard from '~/components/characters/CharacterIdentityCard.vue'
import CharacterSheetCommandCenter from '~/components/characters/CharacterSheetCommandCenter.vue'
import CharacterReferencePanels from '~/components/characters/CharacterReferencePanels.vue'
import CharacterSkillList from '~/components/characters/CharacterSkillList.vue'
import WorldEntityContextDrawer from '~/components/world/WorldEntityContextDrawer.vue'
import type { CharacterAction } from '~/components/characters/CharacterActionsPanel.vue'
import type { CharacterSkillRow } from '~/components/characters/CharacterSkillList.vue'
import {
  HOMED_CATEGORIES,
  REFERENCE_CATEGORIES,
  SAVES_CATEGORY,
  SKILLS_CATEGORY
} from '~/components/characters/characterDerivedValues'
import { useCharacterSheet } from '~/composables/useCharacterSheet'
import { useCharacterMutations } from '~/composables/useCharacterMutations'
import { useCharacterSheetLayout } from '~/composables/useCharacterSheetLayout'
import type { AssembledInventoryItem } from '~/lib/characters/inventory'
import type { AssembledSpellEntry } from '~/lib/characters/spellcasting'
import type { PresentationEntry } from '~/lib/content-presentation/types'
import type { StoredCharacterNotes } from '~/lib/characters/character-notes'

definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))
const characterId = computed(() => String(route.params.characterId || ''))

// Single Character Sheet data-loading entry point -- see
// app/composables/useCharacterSheet.ts. Replaces what used to be six
// `useFetch` calls made directly in this script (three of them
// sequential, blocking each other in turn); this page now consumes that
// composable's state rather than coordinating its own fetching.
const sheet = await useCharacterSheet(worldId, characterId)

// One mutation surface for Recovery/Combat/Inventory/Spellcasting/
// Conditions -- see app/composables/useCharacterMutations.ts.
const mutations = useCharacterMutations(worldId, characterId, sheet)

const {
  assembly,
  blueprint,
  notAvailableMessage,
  errorMessage,
  pending,
  error,
  identity,
  derived,
  derivedPending,
  derivedUnavailable,
  derivedRegions,
  maxHp,
  hitDiceMax,
  hitDiceAvailable,
  hitDieSize,
  armorClass,
  proficiencyBonus,
  characterLevel,
  spellcastingIsCaster,
  spellcastingAbilityMod,
  spellcastingSaveDc,
  spellcastingAttackBonus,
  inventoryItems,
  inventoryOptions,
  noteDraft,
  healthDraft,
  spellItems,
  spellOptions,
  slotLevels,
  actions: characterActions,
  actionsPending,
  actionsUnavailableMessage,
  combatTargetOptions,
  encounter,
  conditions
} = sheet

// ---------------------------------------------------------------------------
// Notes -- state and saving only; the pure module owns the shape. The one
// domain this phase deliberately did NOT move into useCharacterMutations.ts
// -- see that composable's own header for why (its task-scoped mutation
// list names Recovery/Combat/Inventory/Spellcasting/Conditions, not Notes).
// ---------------------------------------------------------------------------

const notesSaving = ref(false)
const notesError = ref('')

async function saveNotes(next: StoredCharacterNotes) {
  if (notesSaving.value) return

  const previous = noteDraft.value
  noteDraft.value = next
  notesSaving.value = true
  notesError.value = ''

  try {
    await $fetch(`/api/worlds/${worldId.value}/characters/${characterId.value}/notes`, {
      method: 'PUT',
      body: next
    })
  } catch (saveError: any) {
    noteDraft.value = previous
    notesError.value =
      saveError?.data?.statusMessage || saveError?.statusMessage || 'Failed to save notes'
  } finally {
    notesSaving.value = false
  }
}

// ---------------------------------------------------------------------------
// Vitals Bar -- Phase 3. Composes values already exposed by useCharacterSheet
// / useCharacterMutations into the shape CharacterVitalsBar.vue needs; no
// new fetch, no new arithmetic on a Rules Engine value (`characterClassName`
// only picks which already-resolved slot's title to show).
// ---------------------------------------------------------------------------

const characterClassName = computed(() => {
  const classSection = identity.value.sections.find((section) => section.key === 'class')
  if (!classSection) return ''
  return classSection.slot.status === 'resolved' ? classSection.slot.entry.title : 'Missing'
})

const isMyTurn = computed(() => conditions.myCombatant?.isCurrentTurn ?? false)

// One combined CharacterSaveIndicator for the whole page (§7.8: "a single
// CharacterSaveIndicator in the vitals bar, not per-panel text") --
// composed from every mutation domain's own saving/error, including Notes.
const vitalsSaving = computed(() =>
  mutations.recovery.saving
  || mutations.combat.resolving
  || mutations.inventory.saving
  || mutations.spellcasting.saving
  || encounter.pending
  || notesSaving.value
)

const vitalsError = computed(() =>
  mutations.recovery.error
  || mutations.combat.error
  || mutations.inventory.error
  || mutations.spellcasting.error
  || encounter.error
  || notesError.value
)

// ---------------------------------------------------------------------------
// Shell -- Corrective Phase 2R. `tabs`/`activeTab`/`setActiveTab` are still
// useCharacterSheetLayout.ts's (URL-synced tab state is still useful, per
// this task's own KEEP list); `isDesktop` is not destructured here anymore
// -- CharacterSheetShell.vue no longer branches on it (there is no more
// rail/tab-fold distinction left for it to decide), and every tab's
// content below now renders identically at every breakpoint, the same
// content that used to be gated `v-if="!isDesktop"` and is now simply the
// only copy.
// ---------------------------------------------------------------------------

const {
  tabs,
  activeTab,
  setActiveTab,
  context,
  contextEntity,
  openContext,
  closeContext
} = useCharacterSheetLayout()

// Rest buttons in the command center are a shortcut to the SAME mutation
// CharacterRecoveryPanel.vue's own Rest buttons already call -- see
// CharacterSheetCommandCenter.vue's own header for why this adds no new
// validation logic.
function handleCommandCenterRest(payload: { type: 'short-rest' | 'long-rest' }) {
  mutations.recovery.apply(payload)
}

// ---------------------------------------------------------------------------
// WHICH RULE CATEGORY RENDERS WHERE -- Desktop IA pass, corrected by
// Header Phase H1
// ---------------------------------------------------------------------------
// Saves have a bespoke home in the left region, skills a bespoke home as
// the persistent table, and proficiency bonus a bespoke home in the
// command center's vitals row (CharacterVitalsBar's own `proficiencyBonus`
// prop) -- one more category is routed to the left region as reference
// (defenses). Abilities are NOT given a bespoke home by this phase: H1
// removed the command center's ability tiles and explicitly does not
// replace them with a left-region equivalent yet. `core.abilities` stays
// in `characterDerivedValues.ts`'s own HOMED_CATEGORIES regardless, so it
// still does NOT fall through to the generic `otherDerivedRegions` below
// either -- that would just relocate the duplication H1 is removing, since
// ability scores already render via the Character tab's pre-existing
// `CharacterAbilityScoresPanel`. Right now `core.abilities` simply has no
// `derivedRegions`-driven rendering at all, until a future phase gives it
// one in the left region.
//
// This selects by CATEGORY and never by Definition id -- §13.2's whole
// point -- and computes nothing: each list is handed to a renderer exactly
// as the engine produced it.
// ---------------------------------------------------------------------------

const saveEntries = computed(() => derived.value?.byCategory?.[SAVES_CATEGORY] ?? [])
const skillEntries = computed(() => derived.value?.byCategory?.[SKILLS_CATEGORY] ?? [])

const referenceRegions = computed(() =>
  derivedRegions.value.filter((region) => REFERENCE_CATEGORIES.includes(region.category))
)

const otherDerivedRegions = computed(() =>
  derivedRegions.value.filter((region) => !HOMED_CATEGORIES.includes(region.category))
)

// ---------------------------------------------------------------------------
// CONTEXT DRAWER -- ELDRA'S OWN, NOT A NEW ONE
// ---------------------------------------------------------------------------
// Every handler below does the same thing: turn a panel's already-resolved
// payload into the shared `CharacterSheetContext` shape and hand it to
// useCharacterSheetLayout. There is NO FETCH here -- each panel already
// holds everything the drawer shows, because Character Assembly resolved it
// on the way in.
//
// Where a payload genuinely carries no prose (Assembly relays a spell's and
// an item's provenance and actions, but no description), the drawer shows
// the structured facts and says the pack publishes nothing further -- the
// same "absence is legal and visible" posture ContentPresentationPanel's
// own empty message already takes, never invented text.
// ---------------------------------------------------------------------------

function signedNumber(value: number): string {
  return value >= 0 ? `+${value}` : String(value)
}

function openActionContext(action: CharacterAction) {
  const lines: string[] = []
  if (action.range) lines.push(`Range: ${action.range}`)
  if (action.attackBonus !== undefined) lines.push(`Attack Bonus: ${signedNumber(action.attackBonus)}`)
  if (action.saveDc !== undefined) lines.push(`Save DC: ${action.saveDc}`)
  if (action.damage) lines.push(`Damage: ${action.damage}`)
  if (action.usage) lines.push(`Usage: ${action.usage}`)
  if (action.sourceBook) lines.push(`Source: ${action.sourceBook}`)

  openContext({
    kind: 'action',
    id: action.id,
    title: action.name,
    eyebrow: action.actionType || 'Action',
    detailLines: lines,
    summary: action.description || '',
    tags: [action.category]
  })
}

function openSpellContext(spell: AssembledSpellEntry) {
  const lines: string[] = []
  if (spell.entry?.sourceBook) lines.push(`Source: ${spell.entry.sourceBook}`)
  if (spell.entry) lines.push(`Resolved from: ${spell.entry.packageId}@${spell.entry.packageVersion}`)
  if (spell.status === 'missing' && spell.reason) lines.push(spell.reason)

  openContext({
    kind: 'spell',
    id: spell.instanceId,
    title: spell.title,
    eyebrow: spell.status === 'custom' ? 'Homebrew Spell' : 'Spell',
    detailLines: lines,
    summary: '',
    tags: spell.prepared ? ['Prepared'] : []
  })
}

function openItemContext(item: AssembledInventoryItem) {
  const lines: string[] = [`Quantity: ${item.quantity}`]
  if (item.container) lines.push(`Container: ${item.container}`)
  if (item.notes) lines.push(item.notes)
  if (item.entry?.sourceBook) lines.push(`Source: ${item.entry.sourceBook}`)
  if (item.entry) lines.push(`Resolved from: ${item.entry.packageId}@${item.entry.packageVersion}`)
  if (item.status === 'missing' && item.reason) lines.push(item.reason)

  const tags: string[] = []
  if (item.equipped) tags.push('Equipped')
  if (item.attuned) tags.push('Attuned')

  openContext({
    kind: 'item',
    id: item.instanceId,
    title: item.title,
    eyebrow: item.status === 'custom' ? 'Custom Item' : 'Item',
    detailLines: lines,
    summary: '',
    tags
  })
}

// Species/Class/Background. Unlike spells and items, these DO carry a
// published presentation model, so the drawer shows the pack's own prose.
function openFeatureContext(label: string, presentation: PresentationEntry | null | undefined, title: string) {
  const paragraphs = [
    ...(presentation?.description ?? []),
    ...(presentation?.sections ?? []).flatMap((section) => [section.title, ...section.paragraphs]),
    ...(presentation?.notes ?? [])
  ]

  openContext({
    kind: 'feature',
    id: `${label}:${title}`,
    title,
    eyebrow: label,
    detailLines: (presentation?.facts ?? []).map((fact) => `${fact.label}: ${fact.value}`),
    summary: paragraphs.join('\n\n'),
    tags: presentation?.sourceBook ? [presentation.sourceBook] : []
  })
}

function openSkillContext(skill: CharacterSkillRow) {
  const lines = [`Bonus: ${skill.value}`]
  if (skill.qualifier) lines.push(`Ability: ${skill.qualifier.toUpperCase()}`)
  if (skill.proficient !== null) lines.push(`Proficient: ${skill.proficient ? 'Yes' : 'No'}`)

  openContext({
    kind: 'skill',
    id: skill.key,
    title: skill.label,
    eyebrow: 'Skill',
    detailLines: lines,
    summary: '',
    tags: skill.proficient ? ['Proficient'] : []
  })
}
</script>

<template>
  <!-- World Backdrop Activation. `bg-transparent`, matching every sibling
       world-workspace page (characters/index.vue, entities/[entityId]/
       index.vue, WorldEntityInteractivePage.vue all use the identical
       "h-full overflow-y-auto bg-transparent" root) -- NOT `eldra-ground`.
       `world-workspace.vue`'s own layout already paints the page's Ground
       material (a dark gradient, always present) plus the World's
       configured backdrop image/overlay (per-`pageKey`, via the existing
       Page Setup / WorldPagePresentationPanel system -- see admin.vue's
       'characters' Page Setup entry, which already targets exactly the
       `pageKey` this route's own path resolves to) BEHIND this page's
       `<slot />`. An opaque `eldra-ground` root here would paint over that
       entire system and hide any backdrop a Game Admin configures -- which
       is exactly what happened before this task: Material Phase 1 applied
       `eldra-ground` directly to this page without realizing the
       workspace layout already owns "the ground," the same way it already
       does for every other World page. Nothing about the sheet's own
       panels changes: CharacterSheetCommandCenter/CharacterSheetSection
       are already semi-transparent + backdrop-blur (Glass/Frame material),
       the same treatment WorldEntityInteractivePage.vue's panels already
       use successfully over this exact backdrop system today. -->
  <div class="h-full overflow-y-auto bg-transparent">
    <!-- Sheet width, not dashboard width. Corrective Phase 2R capped this
         at max-w-4xl to stop the rejected 3-column layout from stretching
         to a 2560px monitor; a reference region beside a working region
         needs more than one folio column but far less than the whole
         viewport, so it opens up only at `xl` and stops at 1400px -- about
         the measure a real two-column character sheet is printed at.

         The right padding is how Eldra's EXISTING context drawer gets its
         space: when the drawer is open at desktop width the sheet
         compresses rather than being covered, which is both this app's
         prior behaviour and the reference sheet's. Below `xl` the drawer
         goes full-width over the sheet, as every other page's drawer
         already does on a phone. -->
    <div
      class="mx-auto max-w-4xl px-4 py-6 transition-[padding] duration-200 sm:px-6 sm:py-8 xl:max-w-[1400px]"
      :class="context ? 'xl:pr-[472px]' : ''"
    >
      <div
        v-if="pending"
        class="text-sm text-[#9f9278]"
      >
        Loading this character's Assembly…
      </div>

      <div
        v-else-if="error"
        class="rounded-none border border-red-900 bg-red-950/40 p-4 text-sm text-red-300"
      >
        {{ errorMessage }}
      </div>

      <div v-else-if="assembly && !assembly.available">
        <CharacterEmptyState
          icon="i-lucide-file-question"
          :message="notAvailableMessage"
        />
      </div>

      <CharacterSheetShell
        v-else-if="blueprint"
        :tabs="tabs"
        :active-tab="activeTab"
        :drawer-open="Boolean(context)"
        @select-tab="setActiveTab"
      >
        <!-- Command center: sticky within THIS page's own overflow-y-auto
             root (see the class on this file's outermost div), never
             `fixed` -- per the approved plan's own risk note on why. The
             page's one Feature surface (§7.2/Design Language §8 Rule 1),
             spent here. No height measurement needed -- there is no rail
             left to offset beneath it. -->
        <template #vitals>
          <CharacterSheetCommandCenter
            class="sticky top-0 z-20"
            :world-id="worldId"
            :character-title="identity.characterTitle"
            :image-url="identity.characterImageUrl"
            :level="characterLevel"
            :class-name="characterClassName"
            :identity-rows="identity.identityRows"
            :current-hp="healthDraft.currentHp"
            :max-hp="maxHp"
            :temporary-hp="healthDraft.temporaryHp"
            :armor-class="armorClass"
            :proficiency-bonus="proficiencyBonus"
            :is-caster="spellcastingIsCaster"
            :spell-save-dc="spellcastingSaveDc"
            :spell-attack-bonus="spellcastingAttackBonus"
            :conditions="conditions.mine"
            :in-encounter="encounter.isInSelected"
            :is-my-turn="isMyTurn"
            :round="encounter.view?.round ?? null"
            :saving="vitalsSaving"
            :error="vitalsError"
            :remove-condition="mutations.conditions.remove"
            @rest="handleCommandCenterRest"
          />
        </template>

        <!-- Left region: reference data, read constantly, changed almost
             never. Desktop only -- the same content is rendered again
             inside the Character tab below `xl` (see that copy, and
             CharacterReferencePanels.vue's header, for why duplicating
             THESE panels specifically is safe). -->
        <template #left>
          <CharacterReferencePanels
            :save-entries="saveEntries"
            :reference-regions="referenceRegions"
            :pending="derivedPending"
            :unavailable-message="derived ? '' : derivedUnavailable"
          />
        </template>

        <!-- Skills: persistent at every width, never behind a tab. Its own
             column beside the tab body at >= 1536px, stacked above the tab
             bar below that. -->
        <template #skills>
          <CharacterSheetSection
            heading="Skills"
            density="compact"
          >
            <div class="mt-3">
              <CharacterSkillList
                :entries="skillEntries"
                @select="openSkillContext"
              />
            </div>
          </CharacterSheetSection>
        </template>

        <!-- Center region: the working surface -- the only region that
             changes with the tab. -->
        <template #center>
          <template v-if="activeTab === 'play'">
            <!-- Actions: "what can my character do?", and now "execute one
                 against one target" -- this character's own state is never
                 edited here (Combat Resolution mutates the TARGET's HP, not
                 this character's own stored data). See CharacterActionsPanel.vue's
                 own header for why. -->
            <CharacterSheetSection heading="Actions">
              <div class="mt-4">
                <CharacterActionsPanel
                  :actions="characterActions"
                  :pending="actionsPending"
                  :error-message="actionsUnavailableMessage || mutations.combat.error"
                  :target-options="combatTargetOptions"
                  :results="mutations.combat.results"
                  :resolving="mutations.combat.resolving"
                  @resolve="mutations.combat.resolve"
                  @select="openActionContext"
                />
              </div>
            </CharacterSheetSection>

            <!-- Recovery and Encounter/Conditions live inside Play, not a
                 third rail -- this task's own NEW SHEET STRUCTURE note. -->
            <CharacterSheetSection heading="Recovery">
              <div class="mt-4">
                <CharacterRecoveryPanel
                  :health="healthDraft"
                  :max-hp="maxHp"
                  :hit-dice-max="hitDiceMax"
                  :hit-dice-available="hitDiceAvailable"
                  :hit-die-size="hitDieSize"
                  :saving="mutations.recovery.saving"
                  :error-message="mutations.recovery.error"
                  @save="mutations.recovery.save"
                  @recovery="mutations.recovery.apply"
                />
              </div>
            </CharacterSheetSection>

            <CharacterSheetSection heading="Encounter">
              <div class="mt-4">
                <CharacterEncounterPanel
                  :encounter="encounter"
                  :mutations="mutations.conditions"
                >
                  <template #conditions>
                    <CharacterConditionsPanel
                      v-if="encounter.isInSelected"
                      :conditions="conditions"
                      :mutations="mutations.conditions"
                      :pending="encounter.pending"
                      :encounter-ended="encounter.view?.status === 'ended'"
                    />
                  </template>
                </CharacterEncounterPanel>
              </div>
            </CharacterSheetSection>
          </template>

          <template v-else-if="activeTab === 'character'">
            <CharacterIdentityCard
              :character-title="identity.characterTitle"
              :image-url="identity.characterImageUrl"
              :level="characterLevel"
              :identity-rows="identity.identityRows"
            />

            <!-- The left region's content, for widths that have no left
                 region. CSS decides which copy is visible, not JS -- safe
                 here and only here because these panels are read-only
                 projections with no state of their own (the rule this does
                 NOT break is the one about never duplicating Recovery or
                 Encounter, which mutate and are still rendered once). -->
            <CharacterReferencePanels
              class="xl:hidden"
              :save-entries="saveEntries"
              :reference-regions="referenceRegions"
              :pending="derivedPending"
              :unavailable-message="derived ? '' : derivedUnavailable"
            />

            <CharacterSheetSection heading="Ability Scores">
              <template #heading-end>
                <NuxtLink
                  :to="`/worlds/${worldId}/characters/${characterId}/abilities`"
                  class="text-sm text-[#9f9278] underline-offset-4 hover:text-[#d8ceb8] hover:underline"
                >
                  {{ blueprint.abilityScores ? 'Edit' : 'Assign' }}
                </NuxtLink>
              </template>

              <div class="mt-3">
                <CharacterAbilityScoresPanel
                  :scores="blueprint.abilityScores?.scores ?? null"
                  empty-message="No ability scores have been assigned yet. Use Assign above to set them."
                />
              </div>
            </CharacterSheetSection>

            <CharacterSheetSection heading="Derived">
              <template #heading-end>
                <p
                  v-if="derived"
                  class="break-words text-xs text-[#6f6754]"
                >
                  {{ derived.packageId }}@{{ derived.packageVersion }}
                </p>
              </template>

              <p
                v-if="derivedPending"
                class="mt-3 text-sm text-[#9f9278]"
              >
                Evaluating this character against the World's rules…
              </p>

              <p
                v-else-if="!derived"
                class="mt-3 rounded-none border border-dashed border-[rgba(201,164,90,0.24)] p-4 text-sm text-[#9f9278]"
              >
                {{ derivedUnavailable }}
              </p>

              <div
                v-else
                class="mt-3 grid gap-5"
              >
                <!-- Only the categories WITHOUT a bespoke home. Abilities
                     (command center), saves (reference region) and skills
                     (persistent table) are deliberately absent here --
                     rendering them again would be the same fact reached by
                     two different paths. Anything else a package declares
                     still lands here automatically. -->
                <div
                  v-for="region in otherDerivedRegions"
                  :key="region.category"
                  class="min-w-0"
                >
                  <h3 class="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
                    {{ region.label }}
                  </h3>
                  <CharacterDerivedPanel :entries="region.entries" />
                </div>

                <div
                  v-for="collection in derived.collections"
                  :key="collection.id"
                  class="min-w-0"
                >
                  <h3 class="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
                    {{ collection.label || 'Equipment Slots' }}
                  </h3>
                  <div class="flex flex-wrap gap-2">
                    <CharacterStatChip
                      v-for="equipmentSlot in collection.slots"
                      :key="equipmentSlot.id"
                      :label="equipmentSlot.id"
                      :value="equipmentSlot.capacity"
                    />
                  </div>
                </div>

                <p
                  v-if="derived.pendingChoices.length"
                  class="text-xs leading-5 text-[#6f6754]"
                >
                  {{ derived.pendingChoices.length }} proficiency
                  {{ derived.pendingChoices.length === 1 ? 'choice is' : 'choices are' }}
                  still outstanding, so those proficiencies show as unselected.
                  <NuxtLink
                    :to="`/worlds/${worldId}/characters/${characterId}/proficiencies`"
                    class="text-[#c9a45a] underline underline-offset-2 hover:text-[#f5e7bd]"
                  >
                    Choose them
                  </NuxtLink>.
                </p>
              </div>
            </CharacterSheetSection>

            <!-- Species/Class/Background prose+traits: T2 Character at
                 every breakpoint (§3.2) -- the one piece of Character-tab
                 content that was never a rail item in the first place. -->
            <CharacterSheetSection
              v-for="section in identity.sections"
              :key="section.key"
              :heading="section.label"
            >
              <!-- Features open in the shared context drawer too, from the
                   section heading rather than from inside the panel:
                   ContentPresentationPanel is shared with the Builder, and
                   teaching it to emit a selection would change a component
                   two surfaces depend on in order to serve one. The prose
                   stays rendered inline exactly as before -- the drawer is
                   an additional way to read it, not a replacement. -->
              <template
                v-if="section.slot.status === 'resolved' && section.slot.entry.presentation"
                #heading-end
              >
                <button
                  type="button"
                  class="text-sm text-[#9f9278] underline-offset-4 transition hover:text-[#d8ceb8] hover:underline"
                  @click="openFeatureContext(section.label, section.slot.entry.presentation, section.slot.entry.title)"
                >
                  Details
                </button>
              </template>

              <template v-if="section.slot.status === 'resolved'">
                <!-- When the pack publishes details, the panel supplies the
                     name and source line itself; the bare title is the
                     fallback for an entry that resolved but carries no
                     presentation model. -->
                <div
                  v-if="!section.slot.entry.presentation"
                  class="mt-2 break-words text-xl font-semibold text-white"
                >
                  {{ section.slot.entry.title }}
                </div>

                <div class="mt-2">
                  <ContentPresentationPanel
                    :entry="section.slot.entry.presentation"
                    context="detail"
                    :empty-message="`This Content Pack publishes no further details for this ${section.label.toLowerCase()}.`"
                  />
                </div>

                <!-- Which bound pack this choice resolved through -- a fact
                     about this character, not about the Species/Class/
                     Background. -->
                <p class="mt-4 break-words border-t border-[rgba(201,164,90,0.14)] pt-3 text-xs text-[#6f6754]">
                  Resolved from {{ section.slot.entry.packageId }}@{{ section.slot.entry.packageVersion }}
                </p>
              </template>

              <template v-else>
                <div class="mt-2 rounded-none border border-red-900 bg-red-950/40 p-3">
                  <div class="text-sm font-semibold uppercase tracking-[0.1em] text-red-300">
                    Missing
                  </div>
                  <p class="mt-1 text-sm text-red-200">
                    {{ section.slot.reason }}
                  </p>
                  <dl
                    v-if="section.slot.packageId"
                    class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs"
                  >
                    <dt class="text-red-300/70">
                      Package
                    </dt>
                    <dd class="text-red-200">
                      {{ section.slot.packageId }}
                    </dd>
                  </dl>
                </div>
              </template>
            </CharacterSheetSection>
          </template>

          <template v-else-if="activeTab === 'spells'">
            <!-- Spellcasting: also editable -- see
                 CharacterSpellcastingPanel.vue's header. Spell Slots stay
                 inside this same panel rather than a standalone right-rail
                 widget -- see this file's own PHASE 4 header note. -->
            <CharacterSheetSection heading="Spellcasting">
              <div class="mt-4">
                <CharacterSpellcastingPanel
                  :spells="spellItems"
                  :options="spellOptions"
                  :slot-levels="slotLevels"
                  :is-caster="spellcastingIsCaster"
                  :ability-mod="spellcastingAbilityMod"
                  :save-dc="spellcastingSaveDc"
                  :attack-bonus="spellcastingAttackBonus"
                  :saving="mutations.spellcasting.saving"
                  :error-message="mutations.spellcasting.error"
                  @add="mutations.spellcasting.add"
                  @remove="mutations.spellcasting.remove"
                  @toggle-flag="mutations.spellcasting.toggleFlag"
                  @expend-slot="mutations.spellcasting.expendSlot"
                  @restore-slot="mutations.spellcasting.restoreSlot"
                  @select="openSpellContext"
                />
              </div>
            </CharacterSheetSection>
          </template>

          <template v-else-if="activeTab === 'inventory'">
            <!-- Inventory: the one editable region on this page. See the
                 file header and CharacterInventoryPanel.vue for why. -->
            <CharacterSheetSection heading="Inventory">
              <div class="mt-4">
                <CharacterInventoryPanel
                  :items="inventoryItems"
                  :options="inventoryOptions"
                  :saving="mutations.inventory.saving"
                  :error-message="mutations.inventory.error"
                  @add="mutations.inventory.add"
                  @remove="mutations.inventory.remove"
                  @change-quantity="mutations.inventory.changeQuantity"
                  @toggle-flag="mutations.inventory.toggleFlag"
                  @select="openItemContext"
                />
              </div>
            </CharacterSheetSection>
          </template>

          <template v-else-if="activeTab === 'notes'">
            <!-- Notes: also editable -- see CharacterNotesPanel.vue's
                 header. -->
            <CharacterSheetSection heading="Notes">
              <div class="mt-4">
                <CharacterNotesPanel
                  :notes="noteDraft"
                  :saving="notesSaving"
                  :error-message="notesError"
                  @save="saveNotes"
                />
              </div>
            </CharacterSheetSection>
          </template>
        </template>
      </CharacterSheetShell>
    </div>

    <!-- Eldra's ONE context system, mounted by this page exactly as the
         World map, roster, admin, timelines and entity pages already mount
         it -- and as the legacy sheet already does, with the same
         `rail-variant="sheet"` this drawer has carried for that purpose all
         along. `content="detail"` is the only new thing: it tells the
         drawer that what it is showing is an action/spell/item/feature/
         skill rather than a World Entity, so it skips the relationships
         panel, the Open Sheet link, and the entity footer. See that
         component's own header. -->
    <WorldEntityContextDrawer
      :open="Boolean(context)"
      :entity="contextEntity"
      :world-id="worldId"
      content="detail"
      rail-variant="sheet"
      @close="closeContext"
    />
  </div>
</template>
