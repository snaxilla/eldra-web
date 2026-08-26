// The Encounter View -- the Encounter Management System's read model.
//
// Composes encounter-persistence.ts (the entity + its stored state), one
// batched character-title lookup, and (Character Conditions System
// addition) the active Rules Package's condition catalog, and returns what
// a Sheet or DM panel renders: the computed turn order, who is current, who
// is next, and each combatant's active conditions with a resolved label.
// Shaped like server/utils/character-derived.ts's own role one layer up --
// a pure READ, no mutation, rebuilt from current storage on every call, no
// cache. Nothing here rolls a die, applies a condition, or touches
// gameplay; that is encounter-actions.ts's job (initiative generation,
// condition mutation) and character-combat.ts's job (resolving an action),
// neither duplicated here.
//
// ---------------------------------------------------------------------------
// CONDITION LABELS ARE RESOLVED HERE, NOT VALIDATED IN encounter-actions.ts
// ---------------------------------------------------------------------------
// encounter-actions.ts's own header explains why a `conditionId` is never
// rejected at write time. This is the other half of that decision: the ONE
// place that reads the active Rules Package's `table:conditions.catalog`
// (packages/eldra-dnd5e-2024/definitions.json) is THIS read model, to
// attach a human `label` to each stored condition -- exactly the same
// "resolve for display, never gate the write" role
// character-assembly.ts's own `resolveInventory` already plays for a
// dangling item reference. A `conditionId` the catalog does not recognize
// (no Rules Package active, or a DM-typed custom condition) falls back to
// the raw id as its own label -- visible, never hidden, matching this
// codebase's own "absence is legal, and must stay visible" posture.

import { computeTurnOrder, type StoredCondition, type StoredEncounterState } from '../../app/lib/encounters/encounter'
import { loadEncounterEntity, loadEncounterState, type EncounterEntity } from './encounter-persistence'
import { dxFetch } from './entity-factory'
import { getWorldRuntime } from './world-runtime-service'

const CONDITION_CATALOG_TABLE_ID = 'table:conditions.catalog'

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

// One catalog entry -- for a client to build an "Apply Condition" picker
// from, the same role `inventoryOptions`/`spellOptions` already play on
// sheet-v2.vue for their own catalogues.
export type EncounterConditionOption = {
  id: string
  label: string
}

export type EncounterView = {
  id: string
  title: string
  status: StoredEncounterState['status']
  round: number
  turnOrder: EncounterCombatantView[]
  currentCombatant: EncounterCombatantView | null
  nextCombatant: EncounterCombatantView | null
  // [] whenever no Rules Package is active -- see this file's own header on
  // why that degrades rather than blocks anything.
  availableConditions: EncounterConditionOption[]
}

export type EncounterViewResult =
  | { available: true; encounter: EncounterView }
  | { available: false; reason: 'encounter-not-found' }

// One batched `entities` read for every combatant's title -- mirrors
// character-assembly.ts's own "one round trip" discipline for its own
// six-block read. A title that fails to resolve (the character was
// deleted out from under a still-running encounter) degrades to a
// placeholder rather than breaking the whole view -- the same "absence is
// legal, and must stay visible" posture this codebase applies everywhere
// else a reference might dangle.
async function resolveCharacterTitles(characterIds: readonly string[]): Promise<Record<string, string>> {
  if (!characterIds.length) return {}

  const res: any = await dxFetch(
    `/items/entities?filter[id][_in]=${characterIds.map(encodeURIComponent).join(',')}&fields=id,title`
  )
  const rows: any[] = Array.isArray(res?.data) ? res.data : []

  const titles: Record<string, string> = {}
  for (const row of rows) {
    titles[String(row.id)] = String(row.title || '')
  }
  return titles
}

// Reads `table:conditions.catalog` off the World's active Rules Package
// runtime directly -- never through `evaluate()`, matching every other
// Table consumer in this codebase (character-derived.ts's own generic
// `tables` exposure; sheet-v2.vue's own `slotLevels` computed for Spell
// Slot progression). Degrades to an empty catalog -- never an error -- when
// no Rules Package is activated or the active one does not declare this
// table, both legal states this codebase already treats as ordinary.
async function loadConditionCatalog(worldId: string | number): Promise<Record<string, string>> {
  const runtime = await getWorldRuntime(worldId)
  if (!runtime.configured || !runtime.ok) return {}

  const table = runtime.runtime.registry.getById(CONDITION_CATALOG_TABLE_ID)
  if (!table || table.kind !== 'table') return {}

  const catalog: Record<string, string> = {}
  for (const row of table.rows) {
    const key = row.key
    const label = row.label
    if (typeof key === 'string' && typeof label === 'string' && label) {
      catalog[key] = label
    }
  }
  return catalog
}

function resolveCondition(condition: StoredCondition, catalog: Record<string, string>): EncounterConditionView {
  return {
    id: condition.id,
    conditionId: condition.conditionId,
    label: catalog[condition.conditionId] || condition.conditionId,
    duration: condition.duration,
    ...(condition.source ? { source: condition.source } : {})
  }
}

function buildView(
  entity: EncounterEntity,
  state: StoredEncounterState,
  titles: Record<string, string>,
  catalog: Record<string, string>
): EncounterView {
  const order = computeTurnOrder(state)

  const turnOrder: EncounterCombatantView[] = order.map((combatant) => ({
    characterId: combatant.characterId,
    characterTitle: titles[combatant.characterId] || `Character ${combatant.characterId}`,
    initiative: combatant.initiative,
    isCurrentTurn: combatant.characterId === state.currentTurnCharacterId,
    conditions: combatant.conditions.map((condition) => resolveCondition(condition, catalog))
  }))

  const currentIndex = turnOrder.findIndex((c) => c.isCurrentTurn)
  const currentCombatant = currentIndex === -1 ? null : turnOrder[currentIndex]!
  const nextCombatant =
    currentIndex === -1 || turnOrder.length < 2
      ? null
      : turnOrder[(currentIndex + 1) % turnOrder.length]!

  const availableConditions: EncounterConditionOption[] = Object.entries(catalog)
    .map(([id, label]) => ({ id, label }))

  return {
    id: entity.id,
    title: entity.title,
    status: state.status,
    round: state.round,
    turnOrder,
    currentCombatant,
    nextCombatant,
    availableConditions
  }
}

// The canonical entry point. Composes loadEncounterEntity ->
// loadEncounterState -> resolveCharacterTitles + loadConditionCatalog ->
// buildView, and nothing else.
export async function getEncounterView(
  worldId: string | number,
  encounterId: string | number
): Promise<EncounterViewResult> {
  const entity = await loadEncounterEntity(worldId, encounterId)
  if (!entity) return { available: false, reason: 'encounter-not-found' }

  const state = (await loadEncounterState(encounterId)) ?? { status: 'active', round: 1, currentTurnCharacterId: null, combatants: [] }
  const [titles, catalog] = await Promise.all([
    resolveCharacterTitles(state.combatants.map((c) => c.characterId)),
    loadConditionCatalog(worldId)
  ])

  return { available: true, encounter: buildView(entity, state, titles, catalog) }
}

// Exposed separately so encounter-actions.ts can build a view from a state
// it already has in hand (just mutated, about to be saved) without a second
// loadEncounterState round trip.
export async function buildEncounterView(
  worldId: string | number,
  entity: EncounterEntity,
  state: StoredEncounterState
): Promise<EncounterView> {
  const [titles, catalog] = await Promise.all([
    resolveCharacterTitles(state.combatants.map((c) => c.characterId)),
    loadConditionCatalog(worldId)
  ])
  return buildView(entity, state, titles, catalog)
}
