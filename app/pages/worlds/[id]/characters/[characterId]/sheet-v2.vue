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

// The identity summary is composed inline rather than extracted into a
// component: it is used by exactly this one page. The ability scores ARE
// extracted (CharacterAbilityScoresPanel), because the Builder's review step
// renders the same panel -- the same test ContentPresentationPanel passed.

import CharacterAbilityScoresPanel from '~/components/characters/CharacterAbilityScoresPanel.vue'
import CharacterInventoryPanel from '~/components/characters/CharacterInventoryPanel.vue'
import CharacterNotesPanel from '~/components/characters/CharacterNotesPanel.vue'
import CharacterHealthPanel from '~/components/characters/CharacterHealthPanel.vue'
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
import CharacterDerivedPanel from '~/components/characters/CharacterDerivedPanel.vue'
import { DERIVED_SHEET_REGIONS, findDerivedNumber, type DerivedCharacterResponse } from '~/components/characters/characterDerivedValues'
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
const { data: catalogue } = await useFetch<{ items?: Array<{
  packageId: string
  packageVersion: string
  title: string
  slug: string
  sourceBook?: string
}> }>(() => `/api/worlds/${worldId.value}/catalogue`, { lazy: true })

const inventoryOptions = computed(() => catalogue.value?.items ?? [])

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

// Read-only summaries only -- see this file's HEALTH header note on why
// Current HP / Death Saves are never pulled from `derived` here.
const maxHp = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'core.health', 'value:hit_points.max'))
const hitDiceMax = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'core.health', 'value:hit_points.hit_dice_max'))
const hitDiceAvailable = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'core.health', 'value:hit_points.hit_dice_available'))
const hitDieSize = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'core.health', 'value:hit_points.hit_die_size'))

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
            />
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
