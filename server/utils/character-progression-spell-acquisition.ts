// D&D 2024 Character Rules P3.4 -- PROGRESSION SPELL ACQUISITION, server-side orchestration.
//
// The progression-side counterpart of server/utils/character-spell-acquisition.ts (P3.3's creation
// orchestration). Both consume the SAME shared authority -- planSpellAcquisition (P3.2), itself built
// on P3.1's validator and P2's spellOptionVerdict -- nothing here re-implements count, pool,
// membership, or filtering legality a second time.
//
// ---------------------------------------------------------------------------
// TARGET-STATE, NOT ADJACENT DELTA
// ---------------------------------------------------------------------------
// planProgression/confirmProgression (character-progression-plan.ts) already walk the crossed levels
// ONE AT A TIME for automatic consequences and Definition/Content choices (buildLevelStep) -- that
// walk exists so a future per-level-gated choice is never skipped. Spell acquisition does NOT reuse
// that per-level walk: a class's SpellRequirement.totalByLevel is already a CUMULATIVE target at any
// given level (P3.1's own model), so planSpellAcquisition is called exactly ONCE, at targetLevel,
// against the character's CURRENT PERSISTED spell state -- "missing" is therefore always
// (target at targetLevel) - (currently legal), never a sum of per-level deltas. A direct Level 1 -> 20
// jump produces the complete deficit in one Preview, by construction, with no special-casing.
//
// ---------------------------------------------------------------------------
// WHY PERSISTED STATE, NEVER RECONSTRUCTED
// ---------------------------------------------------------------------------
// Candidates come from the character's REAL persisted `spellcasting.spells[]` (assembled against the
// current catalogue by character-assembly.ts, exactly as every other spell-aware surface already
// reads it) -- never rebuilt from progression/rules_choices history. A legacy (untagged) row falls
// back to spell-requirements.ts's own pre-P3.2.1 heuristic, UNCHANGED -- this module performs no
// migration and invents no provenance for a row that does not already carry it.
//
// ---------------------------------------------------------------------------
// CONFIRM WRITE -- CANONICAL MERGE, NEVER A REBUILD-FROM-SCRATCH
// ---------------------------------------------------------------------------
// character-spell-acquisition.ts's own `buildAcceptedSpellEntries` is correct for CREATION, where
// persisted state is always `[]` by construction (`buildCreationSpellPlan`'s own `candidates: []`).
// Progression's `buildProgressionAcceptedSpellEntries` below is a DIFFERENT function, not a
// generalization of that one, because it must instead PATCH the character's existing physical rows
// (preserving every `instanceId` and every unrelated requirement tag) and only ADD a new row for an
// identity with no existing one -- "no duplicate physical row for multiple memberships, never replace
// the entire array with only newly-selected spells" (this phase's own explicit requirement).

import type { RulesFacet } from '../../app/lib/content-rules'
import type { SpellRequirement } from '../../app/lib/content-rules/types'
import type { AssembledSpellEntry } from '../../app/lib/characters/spellcasting'
import {
  flagFor,
  mergeSpellStateCandidate,
  spellIdentityOf,
  type SpellStateCandidate
} from '../../app/lib/characters/spell-requirements'
import {
  extractTentativeSpellSelections,
  planSpellAcquisition,
  spellPoolLabel,
  spellRequirementAnswerKey,
  type SpellAcquisitionPlan,
  type SpellCatalogueEntry,
  type TentativeSpellSelection
} from '../../app/lib/characters/spell-acquisition-plan'
import type { ProgressionSpellPlan } from '../../app/lib/characters/progression-plan'
import {
  deriveSpellSlotLevels,
  nextInstanceId,
  type SpellSlotLevel,
  type StoredSpellEntry
} from '../../app/lib/characters/spellcasting'
import { casterTypeOf, slotTableRows } from './character-spell-acquisition'

// Progression's own stable slot namespace for a spell answer key. SpellRequirement is authored
// exclusively on CLASS facets (app/lib/content-rules/dnd5e-2024.ts), so 'class' is the identical
// slotKey the Progression bridge already assigns a class facet's own choices
// (server/utils/character-actor-bridge.ts's SLOT_ORDER) -- never a second, independently-invented
// slot name. `at: targetLevel` -- there is no per-row "at" a TARGET-STATE spell requirement is
// naturally gated by (unlike an authored Progression row); targetLevel is the one value stable for
// the lifetime of a single Preview/Confirm session (answers are cleared client-side on Confirm/
// Cancel -- see useCharacterProgression.ts), which is exactly the scope a tentative spell answer
// needs to stay addressable across repeated re-previews within that session.
const SPELL_ANSWER_SLOT = 'class'

export function spellAnswerKey(requirement: SpellRequirement, targetLevel: number): string {
  return spellRequirementAnswerKey(SPELL_ANSWER_SLOT, targetLevel, requirement)
}

// Decodes the wire answers map into `TentativeSpellSelection[]`, using THIS module's own fixed
// `slot`/`at` convention (`SPELL_ANSWER_SLOT`/`targetLevel`) -- a thin wrapper over
// `extractTentativeSpellSelections` (app/lib/characters/spell-acquisition-plan.ts), never a second
// decoder.
export function spellTentativeSelectionsFromAnswers(
  answers: Readonly<Record<string, readonly string[]>>,
  requirements: readonly SpellRequirement[],
  targetLevel: number
): TentativeSpellSelection[] {
  return extractTentativeSpellSelections(answers, requirements, SPELL_ANSWER_SLOT, targetLevel)
}

// The progression counterpart of character-spell-acquisition.ts's own `casterTypeOf`/
// `slotTableRows`, restated as a single derivation entry point here (never a second, parallel one)
// so character-progression-plan.ts never has to know `deriveSpellSlotLevels`'s own input shape.
// `registry: null` (no Rules Runtime, or one that failed to configure) degrades to "no slots" --
// `deriveSpellSlotLevels` already treats an absent/null casterType this way, failing every
// level-gated requirement closed exactly as creation's own derivation does.
export function progressionSpellSlotLevels(
  registry: { getById: (id: string) => unknown } | null,
  facet: RulesFacet | null,
  targetLevel: number
): SpellSlotLevel[] {
  const casterType = casterTypeOf(facet)
  const tableRows = registry ? slotTableRows(registry, casterType) : undefined
  return deriveSpellSlotLevels({ casterType, tableRows, characterLevel: targetLevel, expendedSlots: {} })
}

// Persisted spell state -> SpellStateCandidate[] -- the exact translation every other spell-aware
// reader (Cast, the Sheet) already performs, restated here rather than cross-imported (this
// family's own "restate the tiny translation, share the real arithmetic" convention).
export function candidatesFromAssembledSpells(spells: readonly AssembledSpellEntry[]): SpellStateCandidate[] {
  return spells.map((entry) => ({
    identity: spellIdentityOf(entry),
    known: entry.known,
    prepared: entry.prepared,
    mechanics: entry.entry?.spellMechanics ?? null,
    ...(entry.requirementIds?.length ? { requirementIds: entry.requirementIds } : {})
  }))
}

export function buildProgressionSpellPlan(input: {
  requirements: readonly SpellRequirement[]
  catalogue: readonly SpellCatalogueEntry[]
  spellSlotLevels: readonly SpellSlotLevel[]
  targetLevel: number
  persisted: readonly AssembledSpellEntry[]
  tentative: readonly TentativeSpellSelection[]
}): SpellAcquisitionPlan {
  return planSpellAcquisition({
    requirements: input.requirements,
    characterLevel: input.targetLevel,
    candidates: candidatesFromAssembledSpells(input.persisted),
    catalogue: input.catalogue,
    spellSlotLevels: input.spellSlotLevels,
    tentative: input.tentative
  })
}

// `ref:packageId::slug` -> `packageId::slug` -- the exact inverse of spell-requirements.ts's own
// `spellIdentityOf` for a catalogue-backed entry. `null` for a custom/homebrew identity
// (`name:...`), which has no ContentRef to resubmit as a wire answer.
function refStringOfIdentity(identity: string): string | null {
  return identity.startsWith('ref:') ? identity.slice(4) : null
}

// The wire-ready presentation the Level Manager renders -- see CharacterProgressionPanel.vue's own
// spell section. `selectedRefs` deliberately includes EVERY currently-legal catalogue-backed
// identity for this requirement (persisted AND already-accepted-tentative alike, indistinguishable)
// -- resubmitting an already-persisted/already-accepted ref as a tentative answer on the NEXT
// setAnswer call is harmless (mergeSpellStateCandidate is idempotent) and is what lets the panel
// hold zero local draft state of its own (see this phase's own report).
export function toProgressionSpellPlan(
  requirements: readonly SpellRequirement[],
  plan: SpellAcquisitionPlan,
  targetLevel: number
): ProgressionSpellPlan {
  const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement]))
  const requirementPlans = plan.requirements.map((requirementPlan) => {
    const requirement = requirementById.get(requirementPlan.requirementId)!
    return {
      requirementId: requirementPlan.requirementId,
      pool: requirementPlan.pool,
      label: spellPoolLabel(requirementPlan.pool),
      answerKey: spellAnswerKey(requirement, targetLevel),
      target: requirementPlan.target,
      legalCount: requirementPlan.legalCount,
      missing: requirementPlan.missing,
      satisfied: requirementPlan.satisfied,
      selectedRefs: requirementPlan.selected
        .map(refStringOfIdentity)
        .filter((ref): ref is string => ref !== null),
      options: requirementPlan.options,
      issues: requirementPlan.issues
    }
  })
  return { requirements: requirementPlans, complete: plan.complete }
}

// CONFIRM WRITE -- CANONICAL MERGE. Patches the character's EXISTING persisted
// `spellcasting.spells[]` rather than rebuilding it from the accepted answers alone -- see this
// file's own header for why this is a DIFFERENT function from character-spell-acquisition.ts's own
// `buildAcceptedSpellEntries`, not a generalization of it. Mirrors `mergeSpellStateCandidate`'s exact
// OR-flags/UNION-ids rule for every identity that already has a physical row; an identity with no
// existing row gets exactly one NEW row, deterministically id'd.
export function buildProgressionAcceptedSpellEntries(
  persisted: readonly StoredSpellEntry[],
  requirements: readonly SpellRequirement[],
  plan: SpellAcquisitionPlan,
  tentative: readonly TentativeSpellSelection[]
): StoredSpellEntry[] {
  const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement]))
  const planByRequirement = new Map(plan.requirements.map((requirement) => [requirement.requirementId, requirement]))
  const refByIdentity = new Map<string, TentativeSpellSelection['ref']>()
  const deltaByIdentity = new Map<string, SpellStateCandidate>()

  for (const selection of tentative) {
    const requirement = requirementById.get(selection.requirementId)
    if (!requirement) continue
    const requirementPlan = planByRequirement.get(requirement.id)
    if (!requirementPlan) continue

    const identity = spellIdentityOf({ ref: selection.ref })
    if (!requirementPlan.selected.includes(identity)) continue // not an accepted answer

    refByIdentity.set(identity, selection.ref)
    const flag = flagFor(requirement.pool)
    const candidate: SpellStateCandidate = {
      identity,
      known: flag === 'known',
      prepared: flag === 'prepared',
      mechanics: null,
      requirementIds: [requirement.id]
    }
    deltaByIdentity.set(identity, mergeSpellStateCandidate(deltaByIdentity.get(identity), candidate))
  }

  const seen = new Set<string>()
  const nextEntries: StoredSpellEntry[] = []

  // Every existing physical row survives, patched in place when this confirm's own accepted
  // answers add a NEW membership/flag/requirement tag to it -- never dropped, never replaced.
  for (const entry of persisted) {
    const identity = spellIdentityOf(entry)
    seen.add(identity)
    const delta = deltaByIdentity.get(identity)
    if (!delta) {
      nextEntries.push(entry)
      continue
    }
    const mergedIds = [...new Set([...(entry.requirementIds ?? []), ...(delta.requirementIds ?? [])])]
    nextEntries.push({
      ...entry,
      known: entry.known || delta.known,
      prepared: entry.prepared || delta.prepared,
      ...(mergedIds.length ? { requirementIds: mergedIds } : {})
    })
  }

  // A genuinely NEW identity (no existing physical row) gets exactly one new row.
  for (const [identity, delta] of deltaByIdentity) {
    if (seen.has(identity)) continue
    const ref = refByIdentity.get(identity)
    if (!ref) continue
    nextEntries.push({
      instanceId: nextInstanceId(nextEntries),
      ref,
      known: delta.known,
      prepared: delta.prepared,
      ...(delta.requirementIds?.length ? { requirementIds: delta.requirementIds } : {})
    })
  }

  return nextEntries
}
