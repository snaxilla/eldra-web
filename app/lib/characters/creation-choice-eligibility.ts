// Creation-time choice eligibility -- ONE pure implementation shared by the
// V2 Builder's presentation (app/components/characters/builder/
// characterBuilderSelection.ts) and the save route's authority
// (server/api/worlds/[id]/characters/create-v2.post.ts).
//
// Why it lives here and not in the route or the page: the Builder and the
// save route must never disagree about legality. A duplicate the page shows
// as selectable and the server then rejects is the exact failure this module
// exists to prevent. Both callers pass the same inputs and get the same
// answer; neither re-implements the rule.
//
// No I/O, no Vue, no Rules registry. The Builder has no registry, and the
// save route deliberately reads only catalogue facets (see create-v2.post.ts's
// own header), so the rule is expressed over facets alone.
//
// THE RULE (narrow, deliberate, documented -- see also the bridge's own
// ELIGIBILITY header in server/utils/character-actor-bridge.ts):
//   An option a creation choice OFFERS is unavailable when an UNCONDITIONAL
//   direct grant from ANY selected creation slot (species, class, background)
//   already supplies it, or when an EARLIER creation choice's own valid
//   answer already supplies it. Only actual grants and actual answers count
//   as "already acquired" -- never a choice's own declaration (offered is not
//   owned). A choice never disables its OWN options.
//
// Order: direct grants are collected from every slot before any choice is
// judged, so they are order-independent. Sibling answers are judged in the
// caller's declared slot order, then facet order -- deterministic, never map
// iteration order. Only an answer that is itself still eligible counts, so a
// stale illegal answer never blocks another choice.

import type { DefinitionId } from '../rules/types'
import {
  validateChoiceSelection,
  type ResolvableChoice
} from './rules-choices'

export const ALREADY_ACQUIRED_REASON = 'Already acquired'

export type CreationFacetInput = {
  grants?: readonly { set: DefinitionId; to: unknown }[]
  choices?: readonly { choiceSet: DefinitionId; count: number; from?: readonly DefinitionId[] }[]
} | null | undefined

export type CreationSlotInput = {
  slot: string
  facet: CreationFacetInput
}

export type OfferedOption = {
  value: DefinitionId
  eligible: boolean
  reason?: string
}

export type CreationChoicePresentation = {
  key: string
  slot: string
  choiceSetId: DefinitionId
  count: number
  // Every option the content OFFERS, annotated -- an unavailable option stays
  // visible so the player can see why, rather than the list silently shrinking.
  offered: OfferedOption[]
  // The answer that actually counts: valid, eligible, in-count. Stale or
  // illegal input is dropped here, so a count is never satisfied by it.
  selected: DefinitionId[]
  answered: boolean
}

// Unconditional grants only, the same boolean-Value shape the bridge's own
// pre-pass seeds (`grant.to === true`). A grant is never a choice.
export function directlyGrantedValues(slots: readonly CreationSlotInput[]): Set<DefinitionId> {
  const granted = new Set<DefinitionId>()
  for (const { facet } of slots) {
    for (const grant of facet?.grants ?? []) {
      if (grant.to === true) granted.add(grant.set)
    }
  }
  return granted
}

// `rawSelections` is keyed `slot:choiceSetId` -- the same identity the
// Builder draft and the save payload already use.
export function resolveCreationChoices(
  slots: readonly CreationSlotInput[],
  rawSelections: Readonly<Record<string, readonly string[]>>,
  // PHASE 2C.2B -- choice sets that are CONTENT-backed (Content Catalogue
  // ContentRefs) are judged by creation-content-choices.ts, never here. Absent
  // means every choice is Definition-backed, exactly as before.
  isContentChoiceSet?: (choiceSetId: string) => boolean
): CreationChoicePresentation[] {
  const acquired = directlyGrantedValues(slots)
  const out: CreationChoicePresentation[] = []

  for (const { slot, facet } of slots) {
    for (const choice of facet?.choices ?? []) {
      if (isContentChoiceSet?.(choice.choiceSet)) continue
      const key = `${slot}:${choice.choiceSet}`
      const offeredValues = choice.from ?? []

      const offered: OfferedOption[] = offeredValues.map((value) => {
        const unavailable = acquired.has(value)
        return unavailable
          ? { value, eligible: false, reason: ALREADY_ACQUIRED_REASON }
          : { value, eligible: true }
      })

      const eligibleOptions = offered.filter((option) => option.eligible).map((option) => option.value)

      const resolvable: ResolvableChoice = {
        key,
        slot,
        choiceSetId: choice.choiceSet,
        count: choice.count,
        options: eligibleOptions,
        distinct: true
      }

      const effective = dropIllegal(rawSelections[key] ?? [], eligibleOptions, choice.count)
      const validation = validateChoiceSelection(resolvable, effective)

      out.push({
        key,
        slot,
        choiceSetId: choice.choiceSet,
        count: choice.count,
        offered,
        selected: effective,
        answered: validation.ok
      })

      // Only an answer that is itself eligible may constrain a later choice.
      for (const value of effective) acquired.add(value)
    }
  }

  return out
}

// Keeps eligible, de-duplicated values in order, up to `count`. Anything else
// is dropped silently here; the SAVE route does not use this -- it rejects a
// submitted ineligible value outright (see create-v2.post.ts).
function dropIllegal(raw: readonly string[], eligible: readonly string[], count: number): DefinitionId[] {
  const kept: DefinitionId[] = []
  for (const value of raw) {
    if (kept.length >= count) break
    if (!eligible.includes(value) || kept.includes(value)) continue
    kept.push(value)
  }
  return kept
}

// The one checkbox transition, used by the picker. An unavailable option can
// never be added; ticking a picked option removes it; an option is never
// added past `count`.
export function nextSelectionAfterToggle(
  state: {
    readonly selected: readonly DefinitionId[]
    readonly count: number
    readonly offered: readonly OfferedOption[]
  },
  value: DefinitionId
): DefinitionId[] {
  const isSelected = state.selected.includes(value)
  if (isSelected) return state.selected.filter((item) => item !== value)

  const option = state.offered.find((candidate) => candidate.value === value)
  if (!option || !option.eligible) return [...state.selected]
  if (state.selected.length >= state.count) return [...state.selected]

  return [...state.selected, value]
}
