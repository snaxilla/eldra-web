// The Encounter View -- the Encounter Management System's read model.
//
// Composes encounter-persistence.ts (the entity + its stored state) and one
// batched character-title lookup, and returns what a Sheet or DM panel
// renders: the computed turn order, who is current, who is next. Shaped
// like server/utils/character-derived.ts's own role one layer up -- a pure
// READ, no mutation, rebuilt from current storage on every call, no cache.
// Nothing here rolls a die or touches the Rules Engine; that is
// encounter-actions.ts's job (initiative generation) and
// character-combat.ts's job (resolving an action), neither duplicated here.

import { computeTurnOrder, type StoredEncounterState } from '../../app/lib/encounters/encounter'
import { loadEncounterEntity, loadEncounterState, type EncounterEntity } from './encounter-persistence'
import { dxFetch } from './entity-factory'

export type EncounterCombatantView = {
  characterId: string
  characterTitle: string
  initiative: number
  isCurrentTurn: boolean
}

export type EncounterView = {
  id: string
  title: string
  status: StoredEncounterState['status']
  round: number
  turnOrder: EncounterCombatantView[]
  currentCombatant: EncounterCombatantView | null
  nextCombatant: EncounterCombatantView | null
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

function buildView(entity: EncounterEntity, state: StoredEncounterState, titles: Record<string, string>): EncounterView {
  const order = computeTurnOrder(state)

  const turnOrder: EncounterCombatantView[] = order.map((combatant) => ({
    characterId: combatant.characterId,
    characterTitle: titles[combatant.characterId] || `Character ${combatant.characterId}`,
    initiative: combatant.initiative,
    isCurrentTurn: combatant.characterId === state.currentTurnCharacterId
  }))

  const currentIndex = turnOrder.findIndex((c) => c.isCurrentTurn)
  const currentCombatant = currentIndex === -1 ? null : turnOrder[currentIndex]!
  const nextCombatant =
    currentIndex === -1 || turnOrder.length < 2
      ? null
      : turnOrder[(currentIndex + 1) % turnOrder.length]!

  return {
    id: entity.id,
    title: entity.title,
    status: state.status,
    round: state.round,
    turnOrder,
    currentCombatant,
    nextCombatant
  }
}

// The canonical entry point. Composes loadEncounterEntity ->
// loadEncounterState -> resolveCharacterTitles -> buildView, and nothing
// else.
export async function getEncounterView(
  worldId: string | number,
  encounterId: string | number
): Promise<EncounterViewResult> {
  const entity = await loadEncounterEntity(worldId, encounterId)
  if (!entity) return { available: false, reason: 'encounter-not-found' }

  const state = (await loadEncounterState(encounterId)) ?? { status: 'active', round: 1, currentTurnCharacterId: null, combatants: [] }
  const titles = await resolveCharacterTitles(state.combatants.map((c) => c.characterId))

  return { available: true, encounter: buildView(entity, state, titles) }
}

// Exposed separately so encounter-actions.ts can build a view from a state
// it already has in hand (just mutated, about to be saved) without a second
// loadEncounterState round trip.
export async function buildEncounterView(
  entity: EncounterEntity,
  state: StoredEncounterState
): Promise<EncounterView> {
  const titles = await resolveCharacterTitles(state.combatants.map((c) => c.characterId))
  return buildView(entity, state, titles)
}
