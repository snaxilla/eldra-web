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
// CharacterHealthPanel.vue. Rendering those through the generic
// `core.health` region too would show the same fact twice, through two
// different paths; see that helper's own note.
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
// `slotLevels` (below) is the ONE piece of interpretation this page performs
// for Spellcasting: which of the three Spell Slot progression Tables
// (`derived.tables`) applies to THIS character, picked by reading the
// `caster_type` boolean flags this file already hardcodes the Definition ids
// of -- the same "the fixed key names the package's own vocabulary declares"
// posture `findDerivedNumber('core.health', 'value:hit_points.max')`
// immediately above already establishes for Health, one level up (a Table,
// not a Value, because Spell Slot progression is not a formula -- see
// packages/eldra-dnd5e-2024/README.md's own note on why `lookup()` is not
// evaluated). This page still computes no NUMBER: it selects a row a Table
// already declares and reads it, exactly as it already selects which
// `derived.collections` entry is the equipment slots.
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

// The identity summary is composed inline rather than extracted into a
// component: it is used by exactly this one page. The ability scores ARE
// extracted (CharacterAbilityScoresPanel), because the Builder's review step
// renders the same panel -- the same test ContentPresentationPanel passed.

import CharacterAbilityScoresPanel from '~/components/characters/CharacterAbilityScoresPanel.vue'
import CharacterInventoryPanel from '~/components/characters/CharacterInventoryPanel.vue'
import CharacterNotesPanel from '~/components/characters/CharacterNotesPanel.vue'
import CharacterHealthPanel from '~/components/characters/CharacterHealthPanel.vue'
import CharacterSpellcastingPanel from '~/components/characters/CharacterSpellcastingPanel.vue'
import {
  emptyCharacterNotes,
  type StoredCharacterNotes
} from '~/lib/characters/character-notes'
import {
  emptyCharacterHealth,
  type StoredCharacterHealth
} from '~/lib/characters/health'
import {
  addInventoryItem,
  changeInventoryQuantity,
  removeInventoryItem,
  toggleInventoryFlag,
  type AssembledInventoryItem,
  type InventoryFlag,
  type StoredInventoryItem
} from '~/lib/characters/inventory'
import {
  addSpell,
  expendSlot,
  removeSpell,
  restoreSlot,
  toggleSpellFlag,
  type AssembledSpellEntry,
  type SpellFlag,
  type StoredSpellEntry
} from '~/lib/characters/spellcasting'
import CharacterDerivedPanel from '~/components/characters/CharacterDerivedPanel.vue'
import CharacterActionsPanel, { type CharacterAction, type CombatOutcome } from '~/components/characters/CharacterActionsPanel.vue'
import { DERIVED_SHEET_REGIONS, findDerivedBoolean, findDerivedNumber, type DerivedCharacterResponse } from '~/components/characters/characterDerivedValues'
import ContentPresentationPanel from '~/components/characters/ContentPresentationPanel.vue'
import type { StoredAbilityScores } from '~/lib/characters/ability-scores'
import type { PresentationEntry } from '~/lib/content-presentation'

definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))
const characterId = computed(() => String(route.params.characterId || ''))

type CatalogueEntry = {
  packageId: string
  packageVersion: string
  systemKey: string
  title: string
  slug: string
  externalId: string
  provider: string
  sourceBook?: string
  sourcePage?: string
  // Optional and nullable for the same reasons the catalogue's own field is
  // -- a pack from a system with no resolver, or an entry whose published
  // `data` could not be read. The sheet still renders identity and
  // provenance in that case; it never fails.
  presentation?: PresentationEntry | null
}

type AssemblySlot =
  | { status: 'resolved'; entry: CatalogueEntry }
  | { status: 'missing'; packageId: string; slug: string; reason: string }

type AssemblyBlueprint = {
  worldId: string
  characterId: string
  characterTitle: string
  species: AssemblySlot
  class: AssemblySlot
  background: AssemblySlot
  // null for every character created before Phase 3 -- a real state, shown
  // as "not assigned yet" with a link to assign them, never as an error.
  abilityScores: StoredAbilityScores | null
  // Already joined to the World's catalogue by Character Assembly: each entry
  // carries its resolved title and provenance, or an explicit 'missing'.
  inventory: AssembledInventoryItem[]
  // `null` for every character created before this feature -- a real state,
  // rendered as six empty fields, never as an error.
  notes: StoredCharacterNotes | null
  // `null` for every character created before the Health System. Maximum HP
  // is deliberately absent here: it is Rules Engine output, read from
  // `derived`, never from this blueprint.
  health: StoredCharacterHealth | null
  // Already joined to the World's catalogue by Character Assembly, exactly
  // as `inventory` is. Spellcasting Ability, Spell Save DC, Spell Attack
  // Bonus, and Spell Slot progression are deliberately absent here -- all
  // four are Rules Engine output, read from `derived`, never from this
  // blueprint.
  spells: AssembledSpellEntry[]
  // How many of each spell level are currently expended -- resolves against
  // nothing, copied through verbatim.
  expendedSlots: Record<string, number>
}

type AssemblyResponse =
  | { available: true; blueprint: AssemblyBlueprint }
  | { available: false; reason: string; message?: string }

const {
  data: assembly,
  pending,
  error
} = await useFetch<AssemblyResponse>(() => `/api/worlds/${worldId.value}/characters/${characterId.value}/assembly`)

const blueprint = computed(() => (assembly.value?.available ? assembly.value.blueprint : null))

const notAvailableMessage = computed(() => {
  if (!assembly.value || assembly.value.available) return ''
  return assembly.value.message || 'This character has nothing for Character Sheet V2 to assemble yet.'
})

const errorMessage = computed(() => {
  if (!error.value) return ''
  const statusCode = (error.value as any)?.statusCode
  if (statusCode === 404) {
    return 'This character could not be found in this World.'
  }
  return 'Could not load this character. Try again shortly.'
})

// ---------------------------------------------------------------------------
// Derived values -- fetched, never computed. See this file's header.
// ---------------------------------------------------------------------------

const { data: derivedResponse, pending: derivedPending } = await useFetch<DerivedCharacterResponse>(
  () => `/api/worlds/${worldId.value}/characters/${characterId.value}/derived`
)

const derived = computed(() => (derivedResponse.value?.available ? derivedResponse.value.derived : null))

// Why derived values are unavailable, when they are. "No rules activated"
// and "the activated rules are broken" are different problems with different
// fixes, so they are never collapsed into one message.
const derivedUnavailable = computed(() => {
  const response = derivedResponse.value
  if (!response || response.available) return ''
  return response.message || 'Derived values are unavailable for this character.'
})

// Which regions to render is a category-level decision, declared once in
// characterDerivedValues.ts -- see the header for why category rather than
// Definition ID is what keeps this page game-agnostic.
const derivedRegions = computed(() =>
  DERIVED_SHEET_REGIONS
    .map((region) => ({ ...region, entries: derived.value?.byCategory?.[region.category] ?? [] }))
    .filter((region) => region.entries.length > 0)
)

// ---------------------------------------------------------------------------
// Inventory -- state and saving only; every decision is the pure module's
// ---------------------------------------------------------------------------

// Local working copy, seeded from Assembly. Held separately so a save that
// fails leaves the player looking at what they asked for, with an error,
// rather than silently snapping back.
const inventoryItems = ref<AssembledInventoryItem[]>([])
const inventorySaving = ref(false)
const inventoryError = ref('')

watch(
  blueprint,
  (value) => { inventoryItems.value = [...(value?.inventory ?? [])] },
  { immediate: true }
)

// Item options for the add form. `lazy` so a World with a large bound
// catalogue never delays the sheet itself -- the add form simply has nothing
// to offer until it arrives, and custom items work regardless.
type CatalogueOption = {
  packageId: string
  packageVersion: string
  title: string
  slug: string
  sourceBook?: string
}

const { data: catalogue } = await useFetch<{ items?: CatalogueOption[]; spells?: CatalogueOption[] }>(
  () => `/api/worlds/${worldId.value}/catalogue`, { lazy: true }
)

const inventoryOptions = computed(() => catalogue.value?.items ?? [])
const spellOptions = computed(() => catalogue.value?.spells ?? [])

// The one place inventory reaches the server. Takes the STORED shape --
// `AssembledInventoryItem` is a superset carrying resolved display fields,
// and persisting those would be storing a copy of the catalogue, which is
// exactly what this migration removes.
async function persistInventory(next: AssembledInventoryItem[]) {
  if (inventorySaving.value) return

  const previous = inventoryItems.value
  inventoryItems.value = next
  inventorySaving.value = true
  inventoryError.value = ''

  try {
    const items: StoredInventoryItem[] = next.map((item) => ({
      instanceId: item.instanceId,
      ...(item.ref ? { ref: item.ref } : { name: item.name }),
      quantity: item.quantity,
      equipped: item.equipped,
      attuned: item.attuned,
      ...(item.container ? { container: item.container } : {}),
      ...(item.notes ? { notes: item.notes } : {})
    }))

    await $fetch(`/api/worlds/${worldId.value}/characters/${characterId.value}/inventory`, {
      method: 'PUT',
      body: { items }
    })
  } catch (saveError: any) {
    inventoryItems.value = previous
    inventoryError.value =
      saveError?.data?.statusMessage || saveError?.statusMessage || 'Failed to save inventory'
  } finally {
    inventorySaving.value = false
  }
}

// Each handler applies a PURE function and saves the result. No branching, no
// arithmetic, and no knowledge of what equipping something means.
function onInventoryAdd(payload: {
  ref?: { packageId: string; slug: string }
  name?: string
  quantity: number
  notes?: string
}) {
  const added = addInventoryItem(inventoryItems.value, payload)
  const entry = payload.ref
    ? inventoryOptions.value.find(
        (option) => option.packageId === payload.ref!.packageId && option.slug === payload.ref!.slug
      )
    : undefined

  // The new row is decorated for display exactly as Assembly would have, so
  // the card renders correctly before the next read rather than flashing an
  // "unavailable" state for an item that is perfectly fine.
  persistInventory(added.map((item, index) =>
    index === added.length - 1
      ? {
          ...item,
          status: payload.ref ? (entry ? 'resolved' : 'missing') : 'custom',
          title: entry?.title || payload.name || 'Item',
          ...(entry ? { entry } : {})
        }
      : (item as AssembledInventoryItem)
  ) as AssembledInventoryItem[])
}

function onInventoryRemove(instanceId: string) {
  persistInventory(removeInventoryItem(inventoryItems.value, instanceId) as AssembledInventoryItem[])
}

function onInventoryQuantity(payload: { instanceId: string; delta: number }) {
  persistInventory(
    changeInventoryQuantity(inventoryItems.value, payload.instanceId, payload.delta) as AssembledInventoryItem[]
  )
}

function onInventoryFlag(payload: { instanceId: string; flag: InventoryFlag }) {
  persistInventory(
    toggleInventoryFlag(inventoryItems.value, payload.instanceId, payload.flag) as AssembledInventoryItem[]
  )
}

// ---------------------------------------------------------------------------
// Notes -- state and saving only; the pure module owns the shape
// ---------------------------------------------------------------------------

const noteDraft = ref<StoredCharacterNotes>(emptyCharacterNotes())
const notesSaving = ref(false)
const notesError = ref('')

watch(
  blueprint,
  (value) => { noteDraft.value = value?.notes ? { ...value.notes } : emptyCharacterNotes() },
  { immediate: true }
)

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
// Health -- state and saving only; the pure module owns the shape
// ---------------------------------------------------------------------------

const healthDraft = ref<StoredCharacterHealth>(emptyCharacterHealth())
const healthSaving = ref(false)
const healthError = ref('')

watch(
  blueprint,
  (value) => { healthDraft.value = value?.health ? { ...value.health } : emptyCharacterHealth() },
  { immediate: true }
)

async function saveHealth(next: StoredCharacterHealth) {
  if (healthSaving.value) return

  const previous = healthDraft.value
  healthDraft.value = next
  healthSaving.value = true
  healthError.value = ''

  try {
    await $fetch(`/api/worlds/${worldId.value}/characters/${characterId.value}/health`, {
      method: 'PUT',
      body: next
    })
  } catch (saveError: any) {
    healthDraft.value = previous
    healthError.value =
      saveError?.data?.statusMessage || saveError?.statusMessage || 'Failed to save health'
  } finally {
    healthSaving.value = false
  }
}

// Recovery -- the six named actions. A POST, not a PUT: this page sends
// INTENT ({ type, amount? }); server/utils/character-recovery.ts decides
// the resulting numbers (reading Maximum HP and the other Rules Engine
// output each action needs) and returns the new authoritative state, which
// replaces `healthDraft` directly -- no separate recompute here, and no
// need to re-fetch `derived`, since none of these actions change Maximum
// HP, Hit Dice total, or Hit Die size (all three come from Class/level/
// Constitution, none of which Recovery touches).
async function applyRecovery(action: { type: string; amount?: number }) {
  if (healthSaving.value) return

  healthSaving.value = true
  healthError.value = ''

  try {
    const result = await $fetch<{ success: true; health: StoredCharacterHealth }>(
      `/api/worlds/${worldId.value}/characters/${characterId.value}/recovery`,
      { method: 'POST', body: action }
    )
    healthDraft.value = result.health
  } catch (recoveryError: any) {
    healthError.value =
      recoveryError?.data?.statusMessage || recoveryError?.statusMessage || 'Failed to apply recovery action'
  } finally {
    healthSaving.value = false
  }
}

// Read-only summaries only -- see this file's HEALTH header note on why
// Current HP / Death Saves are never pulled from `derived` here.
const maxHp = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'core.health', 'value:hit_points.max'))
const hitDiceMax = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'core.health', 'value:hit_points.hit_dice_max'))
const hitDiceAvailable = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'core.health', 'value:hit_points.hit_dice_available'))
const hitDieSize = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'core.health', 'value:hit_points.hit_die_size'))

// ---------------------------------------------------------------------------
// Spellcasting -- state and saving only; every decision is the pure module's
// ---------------------------------------------------------------------------

const spellItems = ref<AssembledSpellEntry[]>([])
const spellcastingExpendedSlots = ref<Record<string, number>>({})
const spellcastingSaving = ref(false)
const spellcastingError = ref('')

watch(
  blueprint,
  (value) => {
    spellItems.value = [...(value?.spells ?? [])]
    spellcastingExpendedSlots.value = { ...(value?.expendedSlots ?? {}) }
  },
  { immediate: true }
)

// The one place Spellcasting reaches the server. Takes the STORED shape --
// `AssembledSpellEntry` is a superset carrying resolved display fields, and
// persisting those would be storing a copy of the catalogue, exactly as
// `persistInventory` above already refuses to do.
async function persistSpellcasting(nextSpells: AssembledSpellEntry[], nextExpendedSlots: Record<string, number>) {
  if (spellcastingSaving.value) return

  const previousSpells = spellItems.value
  const previousSlots = spellcastingExpendedSlots.value
  spellItems.value = nextSpells
  spellcastingExpendedSlots.value = nextExpendedSlots
  spellcastingSaving.value = true
  spellcastingError.value = ''

  try {
    const spells: StoredSpellEntry[] = nextSpells.map((entry) => ({
      instanceId: entry.instanceId,
      ...(entry.ref ? { ref: entry.ref } : { name: entry.name }),
      known: entry.known,
      prepared: entry.prepared
    }))

    await $fetch(`/api/worlds/${worldId.value}/characters/${characterId.value}/spellcasting`, {
      method: 'PUT',
      body: { spells, expendedSlots: nextExpendedSlots }
    })
  } catch (saveError: any) {
    spellItems.value = previousSpells
    spellcastingExpendedSlots.value = previousSlots
    spellcastingError.value =
      saveError?.data?.statusMessage || saveError?.statusMessage || 'Failed to save spellcasting'
  } finally {
    spellcastingSaving.value = false
  }
}

// Each handler applies a PURE function and saves the result -- the same
// shape the Inventory handlers above already use.
function onSpellAdd(payload: { ref?: { packageId: string; slug: string }; name?: string }) {
  const added = addSpell(spellItems.value, payload)
  const entry = payload.ref
    ? spellOptions.value.find(
        (option) => option.packageId === payload.ref!.packageId && option.slug === payload.ref!.slug
      )
    : undefined

  persistSpellcasting(added.map((item, index) =>
    index === added.length - 1
      ? {
          ...item,
          status: payload.ref ? (entry ? 'resolved' : 'missing') : 'custom',
          title: entry?.title || payload.name || 'Spell',
          ...(entry ? { entry } : {})
        }
      : (item as AssembledSpellEntry)
  ) as AssembledSpellEntry[], spellcastingExpendedSlots.value)
}

function onSpellRemove(instanceId: string) {
  persistSpellcasting(removeSpell(spellItems.value, instanceId) as AssembledSpellEntry[], spellcastingExpendedSlots.value)
}

function onSpellToggleFlag(payload: { instanceId: string; flag: SpellFlag }) {
  persistSpellcasting(
    toggleSpellFlag(spellItems.value, payload.instanceId, payload.flag) as AssembledSpellEntry[],
    spellcastingExpendedSlots.value
  )
}

function onExpendSlot(level: number) {
  const max = slotLevels.value.find((row) => row.level === level)?.max ?? 0
  persistSpellcasting(spellItems.value, expendSlot(spellcastingExpendedSlots.value, level, max))
}

function onRestoreSlot(level: number) {
  persistSpellcasting(spellItems.value, restoreSlot(spellcastingExpendedSlots.value, level))
}

// Read-only summaries -- see this file's SPELLCASTING header note.
const spellcastingIsCaster = computed(() => findDerivedBoolean(derived.value?.byCategory ?? {}, 'spellcasting', 'value:spellcasting.is_caster'))
const spellcastingAbilityMod = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'spellcasting', 'value:spellcasting.ability_mod'))
const spellcastingSaveDc = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'spellcasting', 'value:spellcasting.save_dc'))
const spellcastingAttackBonus = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'spellcasting', 'value:spellcasting.attack_bonus'))

const characterLevel = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'progression', 'value:level') ?? 1)

// Which of the three Spell Slot progression Tables applies -- see this
// file's SPELLCASTING header note on why this is the one piece of
// interpretation the page performs itself.
const SLOT_TABLE_BY_CASTER_TYPE: Record<'full' | 'half' | 'pact', string> = {
  full: 'table:spellcasting.slots_full',
  half: 'table:spellcasting.slots_half',
  pact: 'table:spellcasting.slots_pact'
}

const slotLevels = computed(() => {
  const byCategory = derived.value?.byCategory ?? {}
  const casterType = (['full', 'half', 'pact'] as const).find((type) =>
    findDerivedBoolean(byCategory, 'spellcasting', `value:spellcasting.caster_type.${type}`)
  )
  if (!casterType) return []

  const table = derived.value?.tables?.find((entry) => entry.id === SLOT_TABLE_BY_CASTER_TYPE[casterType])
  const row = table?.rows.find((candidate) => candidate.key === characterLevel.value)
  if (!row) return []

  // Pact Magic (`table:spellcasting.slots_pact`) declares `slots`/`slot_level`
  // rather than one column per spell level -- every slot the character has
  // shares that one level. Full/Half declare `slot_1`..`slot_9` directly.
  if (casterType === 'pact') {
    const level = Number(row.slot_level)
    const max = Number(row.slots)
    if (!level || !max) return []
    return [{ level, max, expended: spellcastingExpendedSlots.value[String(level)] ?? 0 }]
  }

  const levels: { level: number; max: number; expended: number }[] = []
  for (let level = 1; level <= 9; level++) {
    const max = Number(row[`slot_${level}`] ?? 0)
    if (max <= 0) continue
    levels.push({ level, max, expended: spellcastingExpendedSlots.value[String(level)] ?? 0 })
  }
  return levels
})

// ---------------------------------------------------------------------------
// Actions -- fetched, never computed. Read-only: see
// CharacterActionsPanel.vue's own header.
// ---------------------------------------------------------------------------

type ActionsResponse =
  | { available: true; actions: CharacterAction[] }
  | { available: false; reason: string; message?: string }

const { data: actionsResponse, pending: actionsPending } = await useFetch<ActionsResponse>(
  () => `/api/worlds/${worldId.value}/characters/${characterId.value}/actions`
)

const characterActions = computed(() => (actionsResponse.value?.available ? actionsResponse.value.actions : []))

const actionsUnavailableMessage = computed(() => {
  const response = actionsResponse.value
  if (!response || response.available) return ''
  return response.message || ''
})

// ---------------------------------------------------------------------------
// Combat Resolution -- one attacker (this character), one action, one
// target. The target list reuses GET .../entities, the same World-character
// roster the Characters list page already fetches (`lazy` for the same
// reason `catalogue` above is: never delay the Sheet itself on it).
// ---------------------------------------------------------------------------

const { data: worldEntities } = await useFetch<{ data?: Array<{ id: string | number; title?: string }> }>(
  () => `/api/worlds/${worldId.value}/entities?summary=1&type=character,npc,npc_sheet,pc,player_character`,
  { lazy: true }
)

const combatTargetOptions = computed(() =>
  (worldEntities.value?.data ?? [])
    .filter((entity) => String(entity.id) !== characterId.value)
    .map((entity) => ({ id: String(entity.id), title: entity.title || `Character ${entity.id}` }))
)

const combatResults = ref<Record<string, CombatOutcome>>({})
const combatResolving = ref(false)
const combatError = ref('')

async function onResolveAction(payload: { actionId: string; targetCharacterId: string }) {
  if (combatResolving.value) return

  combatResolving.value = true
  combatError.value = ''

  try {
    const result = await $fetch<CombatOutcome & { ok: true }>(
      `/api/worlds/${worldId.value}/characters/${characterId.value}/combat`,
      { method: 'POST', body: payload }
    )
    combatResults.value = { ...combatResults.value, [payload.actionId]: result }
  } catch (resolveError: any) {
    combatError.value =
      resolveError?.data?.statusMessage || resolveError?.statusMessage || 'Failed to resolve this action'
  } finally {
    combatResolving.value = false
  }
}

// ---------------------------------------------------------------------------
// Encounter -- Encounter Management System addition. "Show encounter
// status. Show whose turn it is. Provide: Join Encounter, Leave Encounter,
// Resolve Action" (this task's own CHARACTER SHEET section) -- Resolve
// Action is the Actions panel above, unchanged. This section performs no
// turn-order/round computation of its own: it fetches
// GET .../encounters/:id (server/utils/encounter-view.ts) exactly the way
// the DM's own encounter page does, and emits the same
// { type: 'join' | 'leave' } intent to the same
// POST .../encounters/:id/actions (server/utils/encounter-actions.ts).
// ---------------------------------------------------------------------------

type EncounterCombatantView = {
  characterId: string
  characterTitle: string
  initiative: number
  isCurrentTurn: boolean
}

type EncounterView = {
  id: string
  title: string
  status: 'active' | 'ended'
  round: number
  turnOrder: EncounterCombatantView[]
  currentCombatant: EncounterCombatantView | null
}

const { data: availableEncounters } = await useFetch<Array<{ id: string | number; title: string }>>(
  () => `/api/worlds/${worldId.value}/entities?type=encounter&summary=1`,
  { default: () => [], lazy: true }
)

const selectedEncounterId = ref('')
const encounterView = ref<EncounterView | null>(null)
const encounterPending = ref(false)
const encounterError = ref('')

const isInSelectedEncounter = computed(() =>
  encounterView.value?.turnOrder.some((c) => c.characterId === characterId.value) ?? false
)

async function loadEncounterView() {
  if (!selectedEncounterId.value) {
    encounterView.value = null
    return
  }

  encounterPending.value = true
  encounterError.value = ''

  try {
    const result = await $fetch<{ available: true; encounter: EncounterView } | { available: false }>(
      `/api/worlds/${worldId.value}/encounters/${selectedEncounterId.value}`
    )
    encounterView.value = result.available ? result.encounter : null
  } catch (fetchError: any) {
    encounterError.value = fetchError?.data?.statusMessage || fetchError?.statusMessage || 'Could not load this encounter'
  } finally {
    encounterPending.value = false
  }
}

watch(selectedEncounterId, loadEncounterView)

async function joinOrLeaveEncounter(type: 'join' | 'leave') {
  if (!selectedEncounterId.value || encounterPending.value) return

  encounterPending.value = true
  encounterError.value = ''

  try {
    const result = await $fetch<{ ok: true; encounter: EncounterView }>(
      `/api/worlds/${worldId.value}/encounters/${selectedEncounterId.value}/actions`,
      { method: 'POST', body: { type, characterId: characterId.value } }
    )
    encounterView.value = result.encounter
  } catch (fetchError: any) {
    encounterError.value = fetchError?.data?.statusMessage || fetchError?.statusMessage || 'Could not update this encounter'
  } finally {
    encounterPending.value = false
  }
}

const SECTION_LABELS: Record<'species' | 'class' | 'background', string> = {
  species: 'Species',
  class: 'Class',
  background: 'Background'
}

const sections = computed(() => {
  if (!blueprint.value) return []
  const current = blueprint.value

  return (['species', 'class', 'background'] as const).map((key) => ({
    key,
    label: SECTION_LABELS[key],
    slot: current[key]
  }))
})

// The at-a-glance identity line. Reads a resolved slot's title, or says the
// choice is missing -- it never falls back to a blank, because "this
// character's Species no longer resolves" is information, not an empty cell.
const identityRows = computed(() =>
  sections.value.map((section) => ({
    key: section.key,
    label: section.label,
    value: section.slot.status === 'resolved' ? section.slot.entry.title : 'Missing',
    missing: section.slot.status !== 'resolved'
  }))
)
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <!-- max-w-4xl rather than 3xl: the cards now carry trait prose and
         two-column fact grids, not two lines of provenance. px-4 on phones
         keeps those same cards readable with no horizontal scroll. -->
    <div class="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div class="eldra-kicker text-xs">
        Character Sheet
      </div>
      <h1 class="eldra-title mt-2 break-words text-3xl font-semibold">
        {{ blueprint?.characterTitle || 'Character Sheet' }}
      </h1>

      <!-- Identity at a glance: who this character is, in one line on a
           phone-friendly wrapping list. The full Species/Class/Background
           detail cards follow further down. -->
      <dl
        v-if="blueprint"
        class="mt-3 flex flex-wrap gap-x-6 gap-y-2"
      >
        <div
          v-for="row in identityRows"
          :key="row.key"
          class="min-w-0"
        >
          <dt class="text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
            {{ row.label }}
          </dt>
          <dd
            class="break-words text-base font-semibold"
            :class="row.missing ? 'text-red-300' : 'text-[#fff7df]'"
          >
            {{ row.value }}
          </dd>
        </div>
      </dl>

      <NuxtLink
        :to="`/worlds/${worldId}/characters`"
        class="mt-4 inline-block text-sm text-[#9f9278] hover:text-[#d8ceb8]"
      >
        &larr; Back to Characters
      </NuxtLink>

      <div
        v-if="pending"
        class="mt-8 text-sm text-[#9f9278]"
      >
        Loading this character's Assembly…
      </div>

      <div
        v-else-if="error"
        class="mt-8 rounded-none border border-red-900 bg-red-950/40 p-4 text-sm text-red-300"
      >
        {{ errorMessage }}
      </div>

      <div
        v-else-if="assembly && !assembly.available"
        class="mt-8 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-4 text-sm text-[#d8ceb8]"
      >
        {{ notAvailableMessage }}
      </div>

      <div
        v-else-if="blueprint"
        class="mt-8 grid gap-4"
      >
        <!-- Ability Scores. Values only -- nothing on this page derives a
             modifier, save, skill, AC, HP, or initiative from them. -->
        <section class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Ability Scores
            </div>
            <!-- The Sheet displays; the Builder edits. -->
            <NuxtLink
              :to="`/worlds/${worldId}/characters/${characterId}/abilities`"
              class="text-sm text-[#9f9278] underline-offset-4 hover:text-[#d8ceb8] hover:underline"
            >
              {{ blueprint.abilityScores ? 'Edit' : 'Assign' }}
            </NuxtLink>
          </div>

          <div class="mt-3">
            <CharacterAbilityScoresPanel
              :scores="blueprint.abilityScores?.scores ?? null"
              empty-message="No ability scores have been assigned yet. Use Assign above to set them."
            />
          </div>
        </section>

        <!-- Derived by the Rules Engine. Every value below was computed by
             the evaluator from this character's data and the World's active
             Rules Package; nothing on this page calculates. -->
        <section class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Derived
            </div>
            <p
              v-if="derived"
              class="break-words text-xs text-[#6f6754]"
            >
              {{ derived.packageId }}@{{ derived.packageVersion }}
            </p>
          </div>

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
            <div
              v-for="region in derivedRegions"
              :key="region.category"
              class="min-w-0"
            >
              <h3 class="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
                {{ region.label }}
              </h3>
              <CharacterDerivedPanel :entries="region.entries" />
            </div>

            <!-- Equipment Slots: declared by the active Rules Package's
                 Collection metadata (registry.getById('collection:equipment')
                 .slots), not computed here. No per-slot occupancy is shown --
                 that needs an item to declare WHICH slot it fills, which
                 needs a Rules Facet no item authors yet (see the actor
                 bridge's header). What the package declares (which slots
                 exist, and their capacity) is real Rules Engine output and
                 is shown as such. -->
            <div
              v-for="collection in derived.collections"
              :key="collection.id"
              class="min-w-0"
            >
              <h3 class="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-[#9f9278]">
                {{ collection.label || 'Equipment Slots' }}
              </h3>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="equipmentSlot in collection.slots"
                  :key="equipmentSlot.id"
                  class="eldra-gold-chip rounded-none border px-3 py-1 text-xs capitalize"
                >
                  {{ equipmentSlot.id }} &middot; {{ equipmentSlot.capacity }}
                </div>
              </div>
            </div>

            <!-- Declared by a Species, Class, or Background and not yet
                 answered. Stated rather than silently omitted, because "you
                 still have skills to choose" is information a player needs
                 -- and it disappears on its own once they are answered,
                 because `pendingChoices` is derived from the current answers
                 rather than from a flag anything has to clear.
                 The Sheet still renders; it does not edit. The link goes to
                 the Builder-context page that does. -->
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
        </section>

        <!-- Inventory: the one editable region on this page. See the
             file header and CharacterInventoryPanel.vue for why. -->
        <section class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Inventory
          </div>

          <div class="mt-4">
            <CharacterInventoryPanel
              :items="inventoryItems"
              :options="inventoryOptions"
              :saving="inventorySaving"
              :error-message="inventoryError"
              @add="onInventoryAdd"
              @remove="onInventoryRemove"
              @change-quantity="onInventoryQuantity"
              @toggle-flag="onInventoryFlag"
            />
          </div>
        </section>

        <!-- Notes: also editable -- see CharacterNotesPanel.vue's header. -->
        <section class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Notes
          </div>

          <div class="mt-4">
            <CharacterNotesPanel
              :notes="noteDraft"
              :saving="notesSaving"
              :error-message="notesError"
              @save="saveNotes"
            />
          </div>
        </section>

        <!-- Health: also editable -- see CharacterHealthPanel.vue's header. -->
        <section class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Health
          </div>

          <div class="mt-4">
            <CharacterHealthPanel
              :health="healthDraft"
              :max-hp="maxHp"
              :hit-dice-max="hitDiceMax"
              :hit-dice-available="hitDiceAvailable"
              :hit-die-size="hitDieSize"
              :saving="healthSaving"
              :error-message="healthError"
              @save="saveHealth"
              @recovery="applyRecovery"
            />
          </div>
        </section>

        <!-- Spellcasting: also editable -- see CharacterSpellcastingPanel.vue's
             header. -->
        <section class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Spellcasting
          </div>

          <div class="mt-4">
            <CharacterSpellcastingPanel
              :spells="spellItems"
              :options="spellOptions"
              :slot-levels="slotLevels"
              :is-caster="spellcastingIsCaster"
              :ability-mod="spellcastingAbilityMod"
              :save-dc="spellcastingSaveDc"
              :attack-bonus="spellcastingAttackBonus"
              :saving="spellcastingSaving"
              :error-message="spellcastingError"
              @add="onSpellAdd"
              @remove="onSpellRemove"
              @toggle-flag="onSpellToggleFlag"
              @expend-slot="onExpendSlot"
              @restore-slot="onRestoreSlot"
            />
          </div>
        </section>

        <!-- Actions: "what can my character do?", and now "execute one
             against one target" -- this character's own state is never
             edited here (Combat Resolution mutates the TARGET's HP, not
             this character's own stored data). See CharacterActionsPanel.vue's
             own header for why. -->
        <section class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Actions
          </div>

          <div class="mt-4">
            <CharacterActionsPanel
              :actions="characterActions"
              :pending="actionsPending"
              :error-message="actionsUnavailableMessage || combatError"
              :target-options="combatTargetOptions"
              :results="combatResults"
              :resolving="combatResolving"
              @resolve="onResolveAction"
            />
          </div>
        </section>

        <!-- Encounter: status, whose turn it is, Join/Leave -- Resolve
             Action is the Actions panel above, unchanged. See this file's
             own ENCOUNTER header note. -->
        <section class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Encounter
          </div>

          <div class="mt-4">
            <label class="block">
              <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Encounter</span>
              <select
                v-model="selectedEncounterId"
                class="eldra-input min-h-11 w-full rounded-none px-3 py-2 text-sm text-[#f5e7bd]"
              >
                <option
                  value=""
                  class="bg-[#090909]"
                >
                  No encounter selected
                </option>
                <option
                  v-for="option in availableEncounters"
                  :key="option.id"
                  :value="String(option.id)"
                  class="bg-[#090909]"
                >
                  {{ option.title }}
                </option>
              </select>
            </label>

            <p
              v-if="encounterError"
              class="mt-3 rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
            >
              {{ encounterError }}
            </p>

            <template v-if="encounterView">
              <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">Round</span>
                  <div class="text-lg font-semibold tabular-nums text-[#fff7df]">{{ encounterView.round }}</div>
                </div>
                <div>
                  <span class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">Current Turn</span>
                  <div class="text-lg font-semibold text-[#fff7df]">
                    {{ encounterView.currentCombatant?.characterTitle ?? '—' }}
                  </div>
                </div>
              </div>

              <button
                v-if="!isInSelectedEncounter"
                type="button"
                class="eldra-button mt-3 min-h-11 w-full rounded-none px-3 text-sm font-semibold disabled:opacity-50"
                :disabled="encounterPending || encounterView.status === 'ended'"
                @click="joinOrLeaveEncounter('join')"
              >
                Join Encounter
              </button>
              <button
                v-else
                type="button"
                class="mt-3 min-h-11 w-full rounded-none border border-red-500/20 bg-red-500/10 px-3 text-sm text-red-200 disabled:opacity-50"
                :disabled="encounterPending"
                @click="joinOrLeaveEncounter('leave')"
              >
                Leave Encounter
              </button>
            </template>
          </div>
        </section>

        <section
          v-for="section in sections"
          :key="section.key"
          class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur"
        >
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            {{ section.label }}
          </div>

          <template v-if="section.slot.status === 'resolved'">
            <!-- When the pack publishes details, the panel supplies the name
                 and source line itself; the bare title is the fallback for an
                 entry that resolved but carries no presentation model. -->
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

            <!-- Which bound pack this choice resolved through -- a fact about
                 this character, not about the Species/Class/Background. -->
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
        </section>
      </div>
    </div>
  </div>
</template>
