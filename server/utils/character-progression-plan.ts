// Character Progression Plan -- Character Progression Phase 1A (Game Admin
// Level Manager + Authoritative Level Transition Engine + Package-Declared
// Level Choices).
//
// ---------------------------------------------------------------------------
// THE MANDATORY AUDIT'S CONCLUSION, IN ONE PARAGRAPH
// ---------------------------------------------------------------------------
// Traced every write path into `ActorState.values['value:level']`
// (character-actor-bridge.ts) before writing a line of this module: NONE
// existed. `value:level` is `storage: 'stored'`, `default: 1`
// (definitions.json) -- a real, per-character-overridable input the engine
// was always ready for, with no code that had ever supplied an override.
// Every V2 character today therefore silently evaluates at level 1.
// character-actor-bridge.ts's own new `levelDefinitionId`/`levelOverride`
// inputs (Character Progression Phase 1A) are that missing mutable source;
// this module is what actually validates and commits a NEW value for it.
//
// Traced the active Rules Package (packages/eldra-dnd5e-2024) and the
// hand-authored Rules Facet corpus (app/lib/content-rules/dnd5e-2024.ts)
// for level-gated content next. Conclusion, confirmed by reading every
// facet and every Definition kind: a class facet's `grants`/`choices`/
// `sources` are UNCONDITIONAL -- there is no level field anywhere in
// `RulesFacetGrant`/`RulesFacetChoice`, no subclass slot in the Rules Engine
// at all (subclass-by-level data exists only as prose-parsed V1 display
// metadata, entirely outside the Definition/Facet system), no feat
// mechanics (feat prerequisites are prose-only; `RulesFacetGrant` is
// set-only, with no "increase" operation an ASI would need -- both
// documented as deliberate gaps in that type's own comments), and the ONE
// real choice mechanism that exists (`choice:skill.proficiency`) is
// explicitly creation-time-only (`category: 'character.creation'`, no
// level/trigger field in its type at all). `RulesFacet.progression` /
// `kind:'progression'` Definitions ARE a designed level-gated-grant seam --
// but zero real instances exist in the shipped package and nothing
// evaluates one (see app/lib/characters/progression-plan.ts's own header
// for the full "two unrelated things named progression" note). CONCLUSION:
// this module can honestly build a Progression Plan whose `requiredChoices`
// is always `[]` and whose `automaticConsequences` come entirely from
// re-evaluating the Rules Engine at each level and diffing -- there is
// currently NOTHING ELSE for it to surface, and inventing a subclass/ASI/
// feat/spell choice here would be exactly the fabrication this task
// forbids. See this file's own `buildLevelStep` for how automatic
// consequences are computed with ZERO game knowledge (a diff, never
// authored content).
//
// ---------------------------------------------------------------------------
// WHY DIFFING, NOT AUTHORED "AT LEVEL N, X CHANGES" CONTENT
// ---------------------------------------------------------------------------
// Generic Eldra must not know that Proficiency Bonus changes at levels
// 5/9/13/17, or that Spell Save DC moves when Proficiency Bonus does. It
// does not need to: `getDerivedCharacterAtLevel` (character-derived.ts) is
// the SAME Rules Engine evaluation every other read already trusts, run
// once per entered level with nothing persisted. Comparing consecutive
// levels' own output is a generic operation over "whatever a package
// declares" -- the exact same one `character-derived.ts` already performs
// for a real (not simulated) character, just called twice and subtracted.
// A future non-5e package's own level-driven (or milestone-driven, or
// rank-driven) Values would diff identically, with no code change here.
//
// ---------------------------------------------------------------------------
// PERSISTENCE / ATOMICITY
// ---------------------------------------------------------------------------
// Exactly ONE Directus write is required to commit any transition this
// module currently supports: the `progression` block_instances row
// (character-progression.ts's own `saveCharacterProgression`). Every
// downstream consequence (Max HP, Hit Dice Max, Proficiency Bonus, Spell
// Save DC/Attack, Spell Slot maxima, 1B.5's cantrip scaling) is Rules Engine
// OUTPUT, re-derived on the next read from that one new `value:level` --
// never a second write this module has to perform or sequence. There is
// therefore no multi-write atomicity risk to solve for THIS phase's scope
// (Stop Condition 5 does not apply): a single upsert against a single row
// either succeeds or fails as one Directus request already does for every
// sibling block in this codebase. This changes the day a real package
// choice needs its OWN persisted answer alongside the level -- reported
// here as a real future risk, not solved preemptively.
//
// ---------------------------------------------------------------------------
// LEVEL DOWN -- DELIBERATELY NOT SUPPORTED
// ---------------------------------------------------------------------------
// Lowering a class's level would leave already-spent runtime EXPENDITURE
// state (`hitDiceSpent`, `expendedSlots`) potentially inconsistent against
// the new, smaller maxima (`hit_dice_available = max - spent` can go
// negative; nothing in the Recovery/Spellcasting systems reconciles a spent
// count against a shrinking max). No reconciliation logic exists, and
// inventing 5e-specific "what happens to spent resources on level down"
// rules in generic app code is exactly what this task forbids. This module
// therefore supports ADVANCEMENT ONLY (`targetLevel` must exceed the
// character's current total level) -- `confirmProgression`/`planProgression`
// both reject a non-advancing target with `reason: 'not-advancement'`,
// honestly, rather than pretending to support a safe reversal that does not
// exist. A future Admin correction workflow (explicitly out of this
// phase's scope) is the right place to solve Level Down for real.

import {
  emptyCharacterProgression,
  isValidClassLevel,
  totalCharacterLevel,
  type StoredCharacterProgression
} from '../../app/lib/characters/progression'
import type {
  ProgressionAutomaticConsequence,
  ProgressionLevelStep,
  ProgressionPlan
} from '../../app/lib/characters/progression-plan'
import { assembleCharacter } from './character-assembly'
import { getDerivedCharacterAtLevel, type DerivedCharacter, type DerivedValue } from './character-derived'
import { saveCharacterProgression } from './character-progression'

export type ProgressionFailureReason =
  | 'character-not-found'
  | 'no-catalogue-selection'
  | 'rules-unavailable'
  | 'invalid-target-level'
  | 'not-advancement'
  | 'no-class-recorded'
  | 'multiclass-not-supported'
  | 'stale-plan'

export function statusForProgressionFailure(reason: ProgressionFailureReason): number {
  switch (reason) {
    case 'character-not-found': return 404
    case 'no-catalogue-selection': return 409
    case 'rules-unavailable': return 409
    case 'invalid-target-level': return 400
    case 'not-advancement': return 400
    case 'no-class-recorded': return 409
    case 'multiclass-not-supported': return 409
    case 'stale-plan': return 409
    default: {
      const exhaustive: never = reason
      return exhaustive
    }
  }
}

export type ProgressionFailure = { ok: false; reason: ProgressionFailureReason; message: string }

// ---------------------------------------------------------------------------
// Current state -- read-only, used by both the Level Manager's own display
// and as the first step of every plan/confirm below.
// ---------------------------------------------------------------------------

export type CurrentProgressionState = {
  progression: StoredCharacterProgression
  currentLevel: number
}

export async function resolveCurrentProgression(
  worldId: string | number,
  characterId: string | number
): Promise<{ ok: true; state: CurrentProgressionState } | ProgressionFailure> {
  const assembly = await assembleCharacter(worldId, characterId)
  if (!assembly.available) {
    if (assembly.reason === 'character-not-found') {
      return { ok: false, reason: 'character-not-found', message: 'Character not found in this world' }
    }
    return { ok: false, reason: 'no-catalogue-selection', message: assembly.message }
  }

  const progression = assembly.blueprint.progression
  return { ok: true, state: { progression, currentLevel: totalCharacterLevel(progression) } }
}

function fingerprintFor(currentLevel: number): string {
  return String(currentLevel)
}

// ---------------------------------------------------------------------------
// Automatic consequences -- one Rules Engine diff per entered level, zero
// game knowledge. See this file's own header.
// ---------------------------------------------------------------------------

function flattenValues(derived: DerivedCharacter): Map<string, DerivedValue> {
  const flat = new Map<string, DerivedValue>()
  for (const entries of Object.values(derived.byCategory)) {
    for (const entry of entries ?? []) flat.set(entry.id, entry)
  }
  return flat
}

function diffLevels(previous: DerivedCharacter, next: DerivedCharacter): ProgressionAutomaticConsequence[] {
  const before = flattenValues(previous)
  const after = flattenValues(next)
  const consequences: ProgressionAutomaticConsequence[] = []

  for (const [id, afterEntry] of after) {
    const beforeEntry = before.get(id)
    const previousValue = beforeEntry?.error ?? beforeEntry?.value
    const newValue = afterEntry.error ?? afterEntry.value
    if (JSON.stringify(previousValue) === JSON.stringify(newValue)) continue

    consequences.push({
      id,
      label: afterEntry.label,
      previousValue: previousValue ?? null,
      newValue: newValue ?? null
    })
  }

  // Deterministic order -- the same Definition set produces the same diff
  // order on every read, so a preview never visually reshuffles between
  // two identical plans.
  consequences.sort((a, b) => a.id.localeCompare(b.id))
  return consequences
}

async function buildLevelStep(
  worldId: string | number,
  characterId: string | number,
  previousLevel: number,
  level: number
): Promise<{ ok: true; step: ProgressionLevelStep } | ProgressionFailure> {
  const [previousResult, currentResult] = await Promise.all([
    getDerivedCharacterAtLevel(worldId, characterId, previousLevel),
    getDerivedCharacterAtLevel(worldId, characterId, level)
  ])

  if (!previousResult.available || !currentResult.available) {
    const failed = !currentResult.available ? currentResult : previousResult
    if (!failed.available) {
      if (failed.reason === 'character-not-found') {
        return { ok: false, reason: 'character-not-found', message: 'Character not found in this world' }
      }
      if (failed.reason === 'no-catalogue-selection') {
        return { ok: false, reason: 'no-catalogue-selection', message: failed.message }
      }
      return { ok: false, reason: 'rules-unavailable', message: failed.message }
    }
  }

  if (!previousResult.available || !currentResult.available) {
    // Unreachable given the branch above, but keeps TypeScript honest about
    // both being narrowed before the diff below reads `.derived`.
    return { ok: false, reason: 'rules-unavailable', message: 'Could not derive this level for preview' }
  }

  return {
    ok: true,
    step: {
      level,
      automaticConsequences: diffLevels(previousResult.derived, currentResult.derived),
      // Always empty -- see this file's own header on why the current
      // Rules Package declares no level-gated choice of any kind. Never
      // omitted: a future package that DOES declare one populates this
      // exact array, with no shape change here.
      requiredChoices: []
    }
  }
}

// ---------------------------------------------------------------------------
// planProgression -- the preview `previewProgression(...)` this task's own
// FUTURE LEVEL-UP WIZARD CONTRACT names. Read-only: no write happens here.
// ---------------------------------------------------------------------------

export async function planProgression(
  worldId: string | number,
  characterId: string | number,
  targetLevel: number
): Promise<{ ok: true; plan: ProgressionPlan } | ProgressionFailure> {
  if (!isValidClassLevel(targetLevel)) {
    return { ok: false, reason: 'invalid-target-level', message: 'targetLevel must be an integer from 1 to 20' }
  }

  const current = await resolveCurrentProgression(worldId, characterId)
  if (!current.ok) return current

  const { currentLevel } = current.state

  if (targetLevel <= currentLevel) {
    return {
      ok: false,
      reason: 'not-advancement',
      message: `This Level Manager supports advancement only -- target level ${targetLevel} is not above the character's current level ${currentLevel}`
    }
  }

  const steps: ProgressionLevelStep[] = []
  for (let level = currentLevel + 1; level <= targetLevel; level++) {
    const stepResult = await buildLevelStep(worldId, characterId, level - 1, level)
    if (!stepResult.ok) return stepResult
    steps.push(stepResult.step)
  }

  const unresolvedChoiceIds = steps.flatMap((step) => step.requiredChoices.map((choice) => choice.id))

  return {
    ok: true,
    plan: {
      currentLevel,
      targetLevel,
      steps,
      unresolvedChoiceIds,
      valid: unresolvedChoiceIds.length === 0,
      fingerprint: fingerprintFor(currentLevel)
    }
  }
}

// ---------------------------------------------------------------------------
// confirmProgression -- the commit `confirmProgression(...)` this task's own
// FUTURE LEVEL-UP WIZARD CONTRACT names. Re-derives and re-validates
// EVERYTHING fresh; never trusts a client-remembered plan as authority.
// ---------------------------------------------------------------------------

export async function confirmProgression(
  worldId: string | number,
  characterId: string | number,
  targetLevel: number,
  fingerprint: string
): Promise<{ ok: true; progression: StoredCharacterProgression; currentLevel: number } | ProgressionFailure> {
  if (!isValidClassLevel(targetLevel)) {
    return { ok: false, reason: 'invalid-target-level', message: 'targetLevel must be an integer from 1 to 20' }
  }

  const current = await resolveCurrentProgression(worldId, characterId)
  if (!current.ok) return current

  const { progression, currentLevel } = current.state

  // Stale-plan protection: the plan's own fingerprint must still match this
  // character's ACTUAL current level, re-read just now, not whatever the
  // client remembered from when it was first previewed.
  if (fingerprint !== fingerprintFor(currentLevel)) {
    return {
      ok: false,
      reason: 'stale-plan',
      message: `This character's level has changed since this plan was generated (was ${fingerprint}, is now ${currentLevel}) -- generate a fresh plan and try again`
    }
  }

  if (targetLevel <= currentLevel) {
    return {
      ok: false,
      reason: 'not-advancement',
      message: `This Level Manager supports advancement only -- target level ${targetLevel} is not above the character's current level ${currentLevel}`
    }
  }

  // Re-validate the SAME plan one more time (unresolved choices would block
  // here too, once any real choice exists -- today this is always a no-op,
  // honestly, per this file's own header).
  const planResult = await planProgression(worldId, characterId, targetLevel)
  if (!planResult.ok) return planResult
  if (!planResult.plan.valid) {
    return {
      ok: false,
      reason: 'invalid-target-level',
      message: 'This transition still has unresolved required choices'
    }
  }

  const base = progression.classes.length ? progression : emptyCharacterProgression()

  if (base.classes.length === 0) {
    return {
      ok: false,
      reason: 'no-class-recorded',
      message: 'This character has no recorded class to level up -- assign a Class before using the Level Manager'
    }
  }

  if (base.classes.length > 1) {
    // Multiclassing is explicitly not implemented in this phase (this
    // file's own header) -- rather than guess which class entry a bare
    // target level should apply to, refuse honestly.
    return {
      ok: false,
      reason: 'multiclass-not-supported',
      message: 'This character has more than one class entry -- multiclass leveling is not supported by this Level Manager yet'
    }
  }

  const onlyClassEntry = base.classes[0]!
  const nextProgression: StoredCharacterProgression = {
    classes: [{ classRef: onlyClassEntry.classRef, level: targetLevel }]
  }

  const saved = await saveCharacterProgression(characterId, nextProgression)
  return { ok: true, progression: saved, currentLevel: targetLevel }
}
