// useCharacterSheet -- Character Sheet Beautification Pass, Phase 2 (see
// .github/docs/architecture/character-sheet-beauty-pass.md §8.3, §11 Phase 2).
// The single Character Sheet data-loading entry point: sheet-v2.vue used to
// run six `useFetch` calls directly in its own script (assembly, derived,
// catalogue, actions, world entities, available encounters), three of them
// (assembly/derived/actions) sequentially -- each `await useFetch(...)`
// blocking the next from starting. This composable issues those three
// concurrently (`Promise.all`) and centralizes the other three alongside
// them, so the page consumes data instead of orchestrating its loading.
//
// Boundary preserved, same as every other Character data path this
// session's tasks have built: this calls `server/api/**` only. No new
// server logic, no Vue-side calculation -- every value either comes back
// verbatim from Character Assembly / the Rules Engine, or is the same
// `findDerivedNumber`/`findDerivedBoolean` category-based read sheet-v2.vue
// already performed inline (see characterDerivedValues.ts's own header for
// why category, never Definition ID, is the selection vocabulary).
//
// Mutations are deliberately NOT here -- see useCharacterMutations.ts. This
// file only loads and holds state; nothing in it POSTs or PUTs.

import type { Ref } from 'vue'
import {
  DERIVED_SHEET_REGIONS,
  findDerivedBoolean,
  findDerivedNumber,
  type DerivedCharacterResponse
} from '~/components/characters/characterDerivedValues'
import type { CharacterAction } from '~/components/characters/CharacterActionsPanel.vue'
import type { StoredAbilityScores } from '~/lib/characters/ability-scores'
import type { PresentationEntry } from '~/lib/content-presentation'
import { emptyCharacterNotes, type StoredCharacterNotes } from '~/lib/characters/character-notes'
import { emptyCharacterHealth, type StoredCharacterHealth } from '~/lib/characters/health'
import type { AssembledInventoryItem } from '~/lib/characters/inventory'
import type { AssembledSpellEntry } from '~/lib/characters/spellcasting'

export type CatalogueEntry = {
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

export type AssemblySlot =
  | { status: 'resolved'; entry: CatalogueEntry }
  | { status: 'missing'; packageId: string; slug: string; reason: string }

export type AssemblyBlueprint = {
  worldId: string
  characterId: string
  characterTitle: string
  species: AssemblySlot
  class: AssemblySlot
  background: AssemblySlot
  abilityScores: StoredAbilityScores | null
  inventory: AssembledInventoryItem[]
  notes: StoredCharacterNotes | null
  health: StoredCharacterHealth | null
  spells: AssembledSpellEntry[]
  expendedSlots: Record<string, number>
}

export type AssemblyResponse =
  | { available: true; blueprint: AssemblyBlueprint }
  | { available: false; reason: string; message?: string }

export type CatalogueOption = {
  packageId: string
  packageVersion: string
  title: string
  slug: string
  sourceBook?: string
}

type ActionsResponse =
  | { available: true; actions: CharacterAction[] }
  | { available: false; reason: string; message?: string }

export type EncounterConditionView = {
  id: string
  conditionId: string
  label: string
  duration: number | null
  source?: string
}

export type EncounterCombatantView = {
  characterId: string
  characterTitle: string
  initiative: number
  isCurrentTurn: boolean
  conditions: EncounterConditionView[]
}

export type EncounterConditionOption = { id: string; label: string }

export type EncounterView = {
  id: string
  title: string
  status: 'active' | 'ended'
  round: number
  turnOrder: EncounterCombatantView[]
  currentCombatant: EncounterCombatantView | null
  availableConditions: EncounterConditionOption[]
}

const SECTION_LABELS: Record<'species' | 'class' | 'background', string> = {
  species: 'Species',
  class: 'Class',
  background: 'Background'
}

const SLOT_TABLE_BY_CASTER_TYPE: Record<'full' | 'half' | 'pact', string> = {
  full: 'table:spellcasting.slots_full',
  half: 'table:spellcasting.slots_half',
  pact: 'table:spellcasting.slots_pact'
}

export async function useCharacterSheet(worldId: Ref<string>, characterId: Ref<string>) {
  // -------------------------------------------------------------------
  // Assembly + Derived + Actions -- the three blocking fetches. Issued
  // without an intermediate `await` so all three requests fire together;
  // `Promise.all` then blocks (preserving the same SSR-complete-on-render
  // behavior sheet-v2.vue always had) until every one settles.
  // -------------------------------------------------------------------

  const assemblyTask = useFetch<AssemblyResponse>(
    () => `/api/worlds/${worldId.value}/characters/${characterId.value}/assembly`
  )
  const derivedTask = useFetch<DerivedCharacterResponse>(
    () => `/api/worlds/${worldId.value}/characters/${characterId.value}/derived`
  )
  const actionsTask = useFetch<ActionsResponse>(
    () => `/api/worlds/${worldId.value}/characters/${characterId.value}/actions`
  )

  // Item/spell options for the add forms, the Combat Resolution target
  // list, and the Encounter selector -- all `lazy` (see each one's use
  // site below for why), but still created here, before the
  // `Promise.all` below's internal `await`, alongside assemblyTask/
  // derivedTask/actionsTask. `useFetch` must be invoked while the
  // component's Nuxt instance is still active; once this function
  // crosses its own internal `await`, that instance is no longer
  // guaranteed available (Vue's `withAsyncContext` only protects the
  // outer `await useCharacterSheet(...)` in sheet-v2.vue, not awaits
  // inside this composable itself), so every `useFetch` call has to
  // happen up here, before that boundary.
  const { data: catalogue } = useFetch<{ items?: CatalogueOption[]; spells?: CatalogueOption[] }>(
    () => `/api/worlds/${worldId.value}/catalogue`,
    { lazy: true }
  )
  const { data: worldEntities } = useFetch<{ data?: Array<{ id: string | number; title?: string }> }>(
    () => `/api/worlds/${worldId.value}/entities?summary=1&type=character,npc,npc_sheet,pc,player_character`,
    { lazy: true }
  )
  const { data: availableEncounters } = useFetch<Array<{ id: string | number; title: string }>>(
    () => `/api/worlds/${worldId.value}/entities?type=encounter&summary=1`,
    { default: () => [], lazy: true }
  )

  const [
    { data: assembly, pending, error, refresh: refreshAssembly },
    { data: derivedResponse, pending: derivedPending, refresh: refreshDerived },
    { data: actionsResponse, pending: actionsPending, refresh: refreshActions }
  ] = await Promise.all([assemblyTask, derivedTask, actionsTask])

  // -------------------------------------------------------------------
  // Assembly-derived state
  // -------------------------------------------------------------------

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

  const sections = computed(() => {
    if (!blueprint.value) return []
    const current = blueprint.value
    return (['species', 'class', 'background'] as const).map((key) => ({
      key,
      label: SECTION_LABELS[key],
      slot: current[key]
    }))
  })

  // The at-a-glance identity line. Reads a resolved slot's title, or says
  // the choice is missing -- it never falls back to a blank, because "this
  // character's Species no longer resolves" is information, not an empty
  // cell.
  const identityRows = computed(() =>
    sections.value.map((section) => ({
      key: section.key,
      label: section.label,
      value: section.slot.status === 'resolved' ? section.slot.entry.title : 'Missing',
      missing: section.slot.status !== 'resolved'
    }))
  )

  const identity = computed(() => ({
    characterTitle: blueprint.value?.characterTitle || '',
    sections: sections.value,
    identityRows: identityRows.value
  }))

  // -------------------------------------------------------------------
  // Derived values -- fetched, never computed. See this file's header.
  // -------------------------------------------------------------------

  const derived = computed(() => (derivedResponse.value?.available ? derivedResponse.value.derived : null))

  // Why derived values are unavailable, when they are. "No rules activated"
  // and "the activated rules are broken" are different problems with
  // different fixes, so they are never collapsed into one message.
  const derivedUnavailable = computed(() => {
    const response = derivedResponse.value
    if (!response || response.available) return ''
    return response.message || 'Derived values are unavailable for this character.'
  })

  // Which regions to render is a category-level decision, declared once in
  // characterDerivedValues.ts -- see the header for why category rather
  // than Definition ID is what keeps this page game-agnostic.
  const derivedRegions = computed(() =>
    DERIVED_SHEET_REGIONS
      .map((region) => ({ ...region, entries: derived.value?.byCategory?.[region.category] ?? [] }))
      .filter((region) => region.entries.length > 0)
  )

  // Read-only Health summaries -- never Current HP or Death Saves, which
  // the player edits directly (see useCharacterMutations.ts's `recovery`
  // domain and CharacterRecoveryPanel.vue's own note on why).
  const maxHp = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'core.health', 'value:hit_points.max'))
  const hitDiceMax = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'core.health', 'value:hit_points.hit_dice_max'))
  const hitDiceAvailable = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'core.health', 'value:hit_points.hit_dice_available'))
  const hitDieSize = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'core.health', 'value:hit_points.hit_die_size'))

  // Armor Class -- Phase 3 (Vitals Bar) addition. Previously only rendered
  // generically via `derivedRegions` (category 'core.defenses'); the
  // Vitals Bar needs it as a NAMED T0 value, the same
  // `findDerivedNumber(category, key)` shape every other named read here
  // already uses. `value:defenses.armor_class` is
  // packages/eldra-dnd5e-2024/definitions.json's own id for it.
  const armorClass = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'core.defenses', 'value:defenses.armor_class'))

  // Read-only Spellcasting summaries.
  const spellcastingIsCaster = computed(() => findDerivedBoolean(derived.value?.byCategory ?? {}, 'spellcasting', 'value:spellcasting.is_caster'))
  const spellcastingAbilityMod = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'spellcasting', 'value:spellcasting.ability_mod'))
  const spellcastingSaveDc = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'spellcasting', 'value:spellcasting.save_dc'))
  const spellcastingAttackBonus = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'spellcasting', 'value:spellcasting.attack_bonus'))
  const characterLevel = computed(() => findDerivedNumber(derived.value?.byCategory ?? {}, 'progression', 'value:level') ?? 1)

  // -------------------------------------------------------------------
  // Inventory / Notes / Health / Spellcasting -- local working copies,
  // seeded from Assembly. Held separately so a save that fails leaves the
  // player looking at what they asked for, with an error, rather than
  // silently snapping back. Mutated by useCharacterMutations.ts, which
  // receives this composable's return value and writes back into these
  // same refs.
  // -------------------------------------------------------------------

  const inventoryItems = ref<AssembledInventoryItem[]>([])
  const noteDraft = ref<StoredCharacterNotes>(emptyCharacterNotes())
  const healthDraft = ref<StoredCharacterHealth>(emptyCharacterHealth())
  const spellItems = ref<AssembledSpellEntry[]>([])
  const spellcastingExpendedSlots = ref<Record<string, number>>({})

  watch(
    blueprint,
    (value) => {
      inventoryItems.value = [...(value?.inventory ?? [])]
      noteDraft.value = value?.notes ? { ...value.notes } : emptyCharacterNotes()
      healthDraft.value = value?.health ? { ...value.health } : emptyCharacterHealth()
      spellItems.value = [...(value?.spells ?? [])]
      spellcastingExpendedSlots.value = { ...(value?.expendedSlots ?? {}) }
    },
    { immediate: true }
  )

  // Item/spell options for the add forms. `lazy` (declared above,
  // alongside the other fetches, for the reason noted there) so a World
  // with a large bound catalogue never delays the sheet itself -- the
  // add form simply has nothing to offer until it arrives, and custom
  // items work regardless.
  const inventoryOptions = computed(() => catalogue.value?.items ?? [])
  const spellOptions = computed(() => catalogue.value?.spells ?? [])

  // Which of the three Spell Slot progression Tables applies -- the ONE
  // piece of interpretation this page performs itself; see sheet-v2.vue's
  // original SPELLCASTING header note (preserved there) for why.
  const slotLevels = computed(() => {
    const byCategory = derived.value?.byCategory ?? {}
    const casterType = (['full', 'half', 'pact'] as const).find((type) =>
      findDerivedBoolean(byCategory, 'spellcasting', `value:spellcasting.caster_type.${type}`)
    )
    if (!casterType) return []

    const table = derived.value?.tables?.find((entry) => entry.id === SLOT_TABLE_BY_CASTER_TYPE[casterType])
    const row = table?.rows.find((candidate) => candidate.key === characterLevel.value)
    if (!row) return []

    // Pact Magic (`table:spellcasting.slots_pact`) declares `slots`/
    // `slot_level` rather than one column per spell level -- every slot
    // the character has shares that one level. Full/Half declare
    // `slot_1`..`slot_9` directly.
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

  // -------------------------------------------------------------------
  // Actions -- fetched, never computed. Read-only: see
  // CharacterActionsPanel.vue's own header.
  // -------------------------------------------------------------------

  const actions = computed(() => (actionsResponse.value?.available ? actionsResponse.value.actions : []))

  const actionsUnavailableMessage = computed(() => {
    const response = actionsResponse.value
    if (!response || response.available) return ''
    return response.message || ''
  })

  // Combat Resolution's target list reuses GET .../entities, the same
  // World-character roster the Characters list page already fetches
  // (`lazy`, declared above, for the same reason `catalogue` is).
  const combatTargetOptions = computed(() =>
    (worldEntities.value?.data ?? [])
      .filter((entity) => String(entity.id) !== characterId.value)
      .map((entity) => ({ id: String(entity.id), title: entity.title || `Character ${entity.id}` }))
  )

  // -------------------------------------------------------------------
  // Encounter + Conditions -- see server/utils/encounter-view.ts /
  // encounter-actions.ts. Grouped as `reactive()` objects (rather than a
  // flat pile of refs) so CharacterEncounterPanel.vue / Character-
  // ConditionsPanel.vue each receive one clean, focused prop instead of
  // a dozen individually-named ones.
  // -------------------------------------------------------------------

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

  const myCombatant = computed(() =>
    encounterView.value?.turnOrder.find((c) => c.characterId === characterId.value) ?? null
  )

  const encounter = reactive({
    available: availableEncounters,
    selectedId: selectedEncounterId,
    view: encounterView,
    pending: encounterPending,
    error: encounterError,
    isInSelected: isInSelectedEncounter,
    refresh: loadEncounterView
  })

  const conditions = reactive({
    myCombatant,
    mine: computed(() => myCombatant.value?.conditions ?? []),
    available: computed(() => encounterView.value?.availableConditions ?? [])
  })

  // -------------------------------------------------------------------

  async function refresh() {
    await Promise.all([refreshAssembly(), refreshDerived(), refreshActions()])
  }

  return {
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
    spellcastingExpendedSlots,
    slotLevels,
    actions,
    actionsPending,
    actionsUnavailableMessage,
    combatTargetOptions,
    encounter,
    conditions,
    refresh
  }
}

export type CharacterSheet = Awaited<ReturnType<typeof useCharacterSheet>>
