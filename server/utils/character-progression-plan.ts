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
// real choice mechanism that existed (`choice:skill.proficiency`) was
// explicitly creation-time-only (`category: 'character.creation'`, no
// level/trigger field in its type at all). `RulesFacet.progression` /
// `kind:'progression'` Definitions ARE a designed level-gated-grant seam,
// confirmed dormant at the time: zero real instances shipped, nothing
// evaluated one. CONCLUSION (Phase 1A): this module could honestly build a
// Progression Plan whose `requiredChoices` was always `[]`.
//
// ---------------------------------------------------------------------------
// PHASE 1B -- THE DORMANT SEAM IS NOW A REAL CONSUMER
// ---------------------------------------------------------------------------
// Character Progression Phase 1B completes exactly that designed seam
// (server/utils/character-actor-bridge.ts now reads `facet.progression`,
// resolves the named `ProgressionDefinition`, and applies rows whose `at`
// is at or below this character's current level) and extends `ProgressionRow`
// (app/lib/rules/types.ts) with its own `choices` field, reusing the
// EXACT SAME `RulesFacetChoice`/ChoiceSet/`rules_choices` machinery
// creation-time choices already use -- never a second choice language. One
// real Wizard fact is authored this phase (Level 2's real XPHB "Scholar"
// feature, a skill-Expertise choice -- see app/lib/content-rules/dnd5e-2024.ts's
// own header for the full corpus evidence and why every OTHER real Wizard/
// Fighter 1-5 choice -- subclass at level 3, Ability Score Improvement/feat
// at level 4 -- remains a documented content-authoring gap, not something
// this module fabricates). This module's own job did not change: it still
// diffs two real Rules Engine evaluations for `automaticConsequences`
// (unchanged, zero game knowledge) and now ALSO diffs two real evaluations'
// own DECLARED CHOICES for `requiredChoices` (`diffRequiredChoices` below)
// -- the identical "compare before/after, never author domain content"
// discipline, just applied to choices instead of values.
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
// Phase 1A: exactly ONE Directus write to commit any transition -- the
// `progression` block_instances row. Every downstream consequence (Max HP,
// Hit Dice Max, Proficiency Bonus, Spell Save DC/Attack, Spell Slot maxima,
// 1B.5's cantrip scaling) is Rules Engine OUTPUT, re-derived on the next
// read from that one new `value:level`, never a second write. That case
// (a transition crossing no level with a real progression choice) is
// UNCHANGED -- still exactly one write, still no multi-write risk.
//
// PHASE 1B: a transition that crosses a level with a REAL, VALIDLY-ANSWERED
// progression choice (today: only the Scholar/Expertise case, Wizard level
// 2) now requires TWO writes -- the answer, into the EXISTING `rules_choices`
// block (server/utils/character-rules-choices.ts, read-modify-MERGE-write,
// never a blind replace -- see this file's own CHOICE PERSISTENCE header
// below for why a merge is mandatory), and the level, into `progression` as
// before. There is still no cross-collection transaction anywhere in this
// codebase, so this module cannot make the pair atomic, only choose the
// least-bad ordering and document the residual risk honestly, the identical
// discipline server/utils/character-cast.ts's own ORDERING header already
// established for Roll+slot-expenditure.
//
// ORDER: rules_choices FIRST, progression (level) SECOND. If the
// rules_choices write fails, nothing else has happened -- clean failure, no
// residue, exactly like Cast's own "roll fails, nothing spent" case. If the
// rules_choices write SUCCEEDS but the level write then fails, the
// character is left with an answered-but-not-yet-relevant choice sitting in
// `rules_choices` for a level threshold this character has not actually
// reached -- INERT, not applied (server/utils/character-actor-bridge.ts's
// own Progression consumption gates every row on `rowAt <= currentLevel`,
// which is still false), and harmless: a LATER successful confirm attempt
// for the same target level reuses/overwrites the identical key
// idempotently. The reverse ordering (level first) was rejected because its
// own failure mode is worse and user-visible: a character actually AT the
// new level with a mandatory choice nothing ever answered, surfaced as a
// `pendingChoice` on their own Sheet until an admin manually resolves it --
// still recoverable (the EXISTING generic PUT .../choices route already
// accepts an answer for ANY currently-declared-and-unanswered choice,
// including a progression one, with zero changes to that route), but a
// worse resting state than an inert orphaned answer no one will ever see.
//
// IDEMPOTENCY: both writes are the same find-then-PATCH-or-POST upsert
// every sibling block in this codebase already uses -- retrying the
// identical confirm request (same targetLevel, same fingerprint, same
// answers) after a network failure reproduces the exact same final state,
// never a duplicated grant or a double-incremented level.
//
// ---------------------------------------------------------------------------
// CHOICE PERSISTENCE -- WHY `rules_choices`, AND WHY A MERGE, NEVER A REPLACE
// ---------------------------------------------------------------------------
// Audited before writing a line of the merge logic: `saveCharacterRulesChoices`
// (server/utils/character-rules-choices.ts) is a wholesale upsert of
// whatever `StoredRulesChoices` object it is given -- it does NOT deep-merge
// against what is already stored (Directus PATCHes the entire `data` JSON
// column). The EXISTING route that already writes this block
// (PUT .../choices) is documented, in its own header, as "a full replace of
// one resource" for exactly this reason -- it is safe there only because
// the CLIENT is expected to resend every creation-time answer it still
// wants kept, every time.
//
// Confirming a progression transition must NOT behave that way -- a Level
// Manager confirming "add the Scholar answer" has no reason to know or
// resend a character's unrelated creation-time skill-proficiency answers,
// and a confirm that silently erased them would be a real, destructive
// regression this task's own explicit requirement ("Progression
// confirmation must NOT overwrite or delete creation answers") forbids.
// So `confirmProgression` below does the READ-MODIFY-MERGE-WRITE itself:
// `loadCharacterRulesChoices` (the character's own real, current answers,
// creation-time AND any previously-confirmed progression ones) spread into
// a NEW object, THIS transition's own newly-answered progression keys
// overlaid on top, THEN written back whole via the same
// `saveCharacterRulesChoices` upsert. `progressionChoiceKey`'s own
// `${slot}:progression:${at}:${choiceSetId}` shape (app/lib/characters/
// rules-choices.ts) already guarantees a progression key can never
// collide with (and therefore never accidentally overwrite) a
// creation-time `${slot}:${choiceSetId}` key, even when both name the
// identical ChoiceSet.
//
// ---------------------------------------------------------------------------
// CHOICE ANSWERS DURING PREVIEW -- TENTATIVE, NEVER PERSISTED
// ---------------------------------------------------------------------------
// `planProgression` below accepts an optional `tentativeAnswers` map, laid
// ON TOP OF this character's own real persisted `rulesChoices` for the
// DURATION OF ONE PLAN EVALUATION ONLY (`getDerivedCharacterAtLevel`'s own
// new `tentativeAnswers` parameter, character-derived.ts) -- nothing here
// ever writes them anywhere. This is what lets a Level Manager show "if you
// pick Arcana, here is what Level 2 looks like" without a save button
// existing for that alone; the SAME map, re-submitted verbatim as
// `confirmProgression`'s own `answers` argument, is what actually gets
// persisted, and ONLY after `confirmProgression` re-validates it fresh
// (never trusting that a client-side "this was valid a moment ago" claim
// still holds).
//
// ---------------------------------------------------------------------------
// DEPENDENT CHOICES -- WHY TENTATIVE ANSWERS APPLY TO EVERY STEP, NOT JUST
// THEIR OWN
// ---------------------------------------------------------------------------
// `planProgression`'s own level-by-level loop calls `buildLevelStep` once
// per entered level, but passes the IDENTICAL FULL `tentativeAnswers` map
// to every single call -- an answer tentatively given for a level-2 choice
// stays applied when levels 3/4/5 are each independently evaluated in the
// SAME plan walk. This is what lets an EARLIER level's answer influence a
// LATER level's own declared facts/choices, the moment package content
// ever authors such a dependency (today's real corpus has none -- Scholar's
// own answer gates nothing downstream -- but the mechanism itself is
// exercised directly by this file's own tests against synthetic
// multi-row Progression content, the same "prove the mechanism against
// synthetic data, keep real authored content honest and minimal" precedent
// 1B.5's own scaling resolver tests already established).
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
  ContentRef,
  ProgressionAutomaticConsequence,
  ProgressionChoice,
  ProgressionLevelStep,
  ProgressionPlan
} from '../../app/lib/characters/progression-plan'
import { parseContentRef } from '../../app/lib/characters/progression-plan'
import { assembleCharacter } from './character-assembly'
import { getWorldContentCatalogue } from './world-content-catalogue'
import { listContentPackBindingsForWorld } from './world-content-packs'
import { getDerivedCharacterAtLevel, type DerivedCharacter, type DerivedValue } from './character-derived'
import { saveCharacterProgression } from './character-progression'
import { getWorldRuntime } from './world-runtime-service'
import {
  loadCharacterRulesChoices,
  saveCharacterRulesChoices
} from './character-rules-choices'
import { emptyStoredRulesChoices } from '../../app/lib/characters/rules-choices'

export type ProgressionFailureReason =
  | 'character-not-found'
  | 'no-catalogue-selection'
  | 'rules-unavailable'
  | 'invalid-target-level'
  | 'not-advancement'
  | 'no-class-recorded'
  | 'multiclass-not-supported'
  | 'stale-plan'
  // Character Progression Phase 1B -- the plan this confirm re-validates
  // (using the SAME submitted `answers`) still has an unresolved required
  // choice; distinct from `stale-plan` (the STARTING state moved) because
  // here the starting state is fine and only the submitted answers are
  // incomplete/invalid.
  | 'unresolved-choices'

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
    case 'unresolved-choices': return 409
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

// Character Progression Phase 1B -- the package's own integrity hash joins
// `currentLevel` in the fingerprint (see this file's own PACKAGE VERSIONING
// consideration): a plan built under one Rules Package version confirmed
// against a DIFFERENT one (an admin re-activated a different package
// version between preview and confirm) is stale for the same reason a
// changed level is -- the legal choice options/automatic consequences a
// preview showed may no longer be what the package now declares. `''` when
// no package is configured/loaded (the failure is already reported earlier
// in both callers before this is ever reached for a real evaluation, so
// this is a defensive fallback, not a real path).
// Character Progression Phase 1C -- `contentBindingFingerprint` joins
// `packageIntegrityHash` in the plan fingerprint: since a required choice's
// legal options can now come from a Content Pack (subclass selection), a
// World's bound Content Pack changing between Preview and Confirm (e.g. a
// GM refreshes/rebinds XPHB, changing which subclasses are legal or their
// facets) is exactly as stale-making as the Rules Package changing -- the
// same reasoning `packageIntegrityHash` already documents, one layer over.
function fingerprintFor(currentLevel: number, packageIntegrityHash: string, contentBindingFingerprint: string): string {
  return `${currentLevel}|${packageIntegrityHash}|${contentBindingFingerprint}`
}

async function resolvePackageIntegrityHash(worldId: string | number): Promise<string> {
  const runtime = await getWorldRuntime(worldId)
  return runtime.configured && runtime.ok ? runtime.integrityHash : ''
}

// The SMALLEST authoritative Content staleness signal -- every one of this
// World's bound Content Pack (packageId, version, integrity) triples,
// joined deterministically. Reuses the World's own already-verified
// binding integrity (world_content_pack_bindings, set at bind/refresh
// time) rather than hashing the catalogue itself, per this task's own
// "do not hash the entire catalogue if binding integrity already
// guarantees the content artifact" instruction. Sorted by packageId so the
// SAME set of bindings always produces the SAME fingerprint regardless of
// Directus row order.
async function resolveContentBindingFingerprint(worldId: string | number): Promise<string> {
  const bindings = await listContentPackBindingsForWorld(worldId)
  return bindings
    .map((binding) => `${binding.packageId}@${binding.packageVersion}#${binding.packageIntegrity ?? ''}`)
    .sort()
    .join(',')
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

// Character Progression Phase 1B -- the choice counterpart of `diffLevels`
// immediately above: which choices does `next` declare that `previous` did
// not, computed as a diff between two real Rules Engine evaluations, never
// as authored "at level N, this choice appears" content. `DerivedCharacter.choices`
// (character-derived.ts) already carries EVERY choice a facet/Progression
// currently declares, answered or not, with labels already resolved -- this
// function only asks "which KEYS are new," the identical question
// `diffLevels` already asks of `byCategory`, just over a different
// collection. A choice's own CURRENT selection/answered state (`selected`/
// `answered` below) is read directly off `next` -- never recomputed here,
// so this can never disagree with what `character-actor-bridge.ts`'s own
// `validateChoiceSelection` already decided.
function diffRequiredChoices(previous: DerivedCharacter, next: DerivedCharacter): ProgressionChoice[] {
  const previousKeys = new Set(previous.choices.map((choice) => choice.key))
  const newlyDeclared = next.choices.filter((choice) => !previousKeys.has(choice.key))

  return newlyDeclared
    .map((choice): ProgressionChoice => ({
      id: choice.key,
      label: choice.label ?? choice.prompt,
      options: choice.options.map((optionId) => ({
        id: optionId,
        label: choice.optionLabels[optionId] ?? optionId
      })),
      count: choice.count,
      selected: choice.selected,
      answered: choice.answered,
      // Character Progression Phase 1C -- read straight off the derived
      // choice's own `kind` (character-derived.ts), never re-derived here.
      kind: choice.kind
    }))
    // Deterministic order, mirroring `diffLevels`'s own sort -- the same
    // package/answers always produce the same choice ordering.
    .sort((a, b) => a.id.localeCompare(b.id))
}

// Character Progression Phase 1C -- TENTATIVE SUBCLASS. Extracts a
// tentative subclass ContentRef from `tentativeAnswers` WITHOUT needing to
// already know which key names the subclass choice (a genuine
// chicken-and-egg problem: the key is only discoverable by evaluating the
// character, which is what this value feeds into). Pragmatic, honestly
// scoped heuristic for this phase's one real content choice: any
// single-element answer that successfully decodes as a ContentRef
// (`parseContentRef`) is treated as a candidate tentative subclass --
// Definition ids never contain `::`, so this cannot collide with a real
// Definition-choice answer. If more than one Content-choice TYPE existed
// simultaneously, this would need to disambiguate by choice key instead;
// documented here as the honest limit of this approach, not hidden.
function extractTentativeSubclassRef(tentativeAnswers: Record<string, string[]>): ContentRef | null {
  for (const selected of Object.values(tentativeAnswers)) {
    if (selected.length !== 1) continue
    const ref = parseContentRef(selected[0]!)
    if (ref) return ref
  }
  return null
}

async function buildLevelStep(
  worldId: string | number,
  characterId: string | number,
  previousLevel: number,
  level: number,
  tentativeAnswers: Record<string, string[]>
): Promise<{ ok: true; step: ProgressionLevelStep } | ProgressionFailure> {
  const tentativeSubclassRef = extractTentativeSubclassRef(tentativeAnswers)
  const [previousResult, currentResult] = await Promise.all([
    getDerivedCharacterAtLevel(worldId, characterId, previousLevel, tentativeAnswers, tentativeSubclassRef),
    getDerivedCharacterAtLevel(worldId, characterId, level, tentativeAnswers, tentativeSubclassRef)
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
      // Empty for the overwhelming majority of levels/characters (species/
      // background facets with no `progression`, every class besides the
      // one real authored case) -- see this file's own header on exactly
      // which real fact populates this and why every other real Wizard/
      // Fighter 1-5 choice remains a documented content gap, not a bug.
      requiredChoices: diffRequiredChoices(previousResult.derived, currentResult.derived)
    }
  }
}

// ---------------------------------------------------------------------------
// planProgression -- the preview `previewProgression(...)` this task's own
// FUTURE LEVEL-UP WIZARD CONTRACT names. Read-only: no write happens here.
// ---------------------------------------------------------------------------

// `tentativeAnswers` -- see this file's own CHOICE ANSWERS DURING PREVIEW
// and DEPENDENT CHOICES headers. `{}` (the default) reproduces Phase 1A's
// own exact behavior for every caller that predates this phase.
export async function planProgression(
  worldId: string | number,
  characterId: string | number,
  targetLevel: number,
  tentativeAnswers: Record<string, string[]> = {}
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
    const stepResult = await buildLevelStep(worldId, characterId, level - 1, level, tentativeAnswers)
    if (!stepResult.ok) return stepResult
    steps.push(stepResult.step)
  }

  // A choice counts as unresolved only while it is not VALIDLY answered --
  // `answered` is read straight off the Rules Engine's own
  // `validateChoiceSelection` verdict (via `diffRequiredChoices`), never
  // re-derived here. A tentatively-answered choice (this call's own
  // `tentativeAnswers`) already reads `answered: true` at this point, since
  // it was applied before every `getDerivedCharacterAtLevel` call above.
  const unresolvedChoiceIds = steps.flatMap((step) => step.requiredChoices.filter((choice) => !choice.answered).map((choice) => choice.id))

  const [packageIntegrityHash, contentBindingFingerprint] = await Promise.all([
    resolvePackageIntegrityHash(worldId),
    resolveContentBindingFingerprint(worldId)
  ])

  return {
    ok: true,
    plan: {
      currentLevel,
      targetLevel,
      steps,
      unresolvedChoiceIds,
      valid: unresolvedChoiceIds.length === 0,
      fingerprint: fingerprintFor(currentLevel, packageIntegrityHash, contentBindingFingerprint)
    }
  }
}

// ---------------------------------------------------------------------------
// confirmProgression -- the commit `confirmProgression(...)` this task's own
// FUTURE LEVEL-UP WIZARD CONTRACT names. Re-derives and re-validates
// EVERYTHING fresh; never trusts a client-remembered plan as authority.
// ---------------------------------------------------------------------------

// `answers` -- this transition's own final choice selections (the SAME
// map a caller would have submitted as `planProgression`'s own
// `tentativeAnswers` for its last preview, resubmitted here verbatim to
// become authoritative). `{}` (the default) reproduces Phase 1A's own exact
// behavior -- and remains entirely correct for any transition that crosses
// no real progression choice, which is still the overwhelming majority.
export async function confirmProgression(
  worldId: string | number,
  characterId: string | number,
  targetLevel: number,
  fingerprint: string,
  answers: Record<string, string[]> = {}
): Promise<{ ok: true; progression: StoredCharacterProgression; currentLevel: number } | ProgressionFailure> {
  if (!isValidClassLevel(targetLevel)) {
    return { ok: false, reason: 'invalid-target-level', message: 'targetLevel must be an integer from 1 to 20' }
  }

  const current = await resolveCurrentProgression(worldId, characterId)
  if (!current.ok) return current

  const { progression, currentLevel } = current.state
  const [packageIntegrityHash, contentBindingFingerprint] = await Promise.all([
    resolvePackageIntegrityHash(worldId),
    resolveContentBindingFingerprint(worldId)
  ])

  // Stale-plan protection: the plan's own fingerprint must still match this
  // character's ACTUAL current level, the ACTIVE Rules Package's current
  // integrity hash, AND this World's current Content Pack binding
  // fingerprint (Phase 1C) -- all three re-read just now, not whatever the
  // client remembered from when it was first previewed (see this file's own
  // PACKAGE VERSIONING consideration).
  if (fingerprint !== fingerprintFor(currentLevel, packageIntegrityHash, contentBindingFingerprint)) {
    return {
      ok: false,
      reason: 'stale-plan',
      message: `This character's level or active Rules Package has changed since this plan was generated -- generate a fresh plan and try again`
    }
  }

  if (targetLevel <= currentLevel) {
    return {
      ok: false,
      reason: 'not-advancement',
      message: `This Level Manager supports advancement only -- target level ${targetLevel} is not above the character's current level ${currentLevel}`
    }
  }

  // Re-validate a FRESH plan, built from THESE submitted answers -- never
  // the client's own remembered plan, and never a plan built with no
  // answers at all (which would spuriously report every real choice as
  // still unresolved). Unresolved choices block here too.
  const planResult = await planProgression(worldId, characterId, targetLevel, answers)
  if (!planResult.ok) return planResult
  if (!planResult.plan.valid) {
    return {
      ok: false,
      reason: 'unresolved-choices',
      message: `This transition still has unresolved required choices: ${planResult.plan.unresolvedChoiceIds.join(', ')}`
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

  // Character Progression Phase 1B/1C -- CHOICE PERSISTENCE, FIRST (see
  // this file's own header for the full ordering rationale, re-evaluated
  // for Phase 1C below). Every VALIDLY ANSWERED required choice across the
  // whole plan, keyed by its own stable `progressionChoiceKey` -- never the
  // raw, untrusted `answers` object the caller submitted (a key naming a
  // choice this plan does not actually require, or one that remains
  // unanswered/invalid, is silently excluded, never written).
  //
  // SUBCLASS AUTHORITY (Phase 1C): a 'content'-kind answer (today: only
  // subclass selection) is NEVER written into `rules_choices` -- a Content
  // reference is not a Definition answer, and `rules_choices`' own
  // persisted shape stays `Record<string, DefinitionId[]>`, byte-identical
  // to every character before this phase (no migration, per this task's own
  // PERSISTED CHOICE MIGRATION requirement). Its sole durable authority is
  // `progression.classes[].subclassRef`, written below alongside the level
  // in the SAME progression write -- there is exactly one persisted
  // location for a confirmed subclass, so nothing can ever diverge from it.
  const resolvedAnswers: Record<string, string[]> = {}
  let resolvedSubclassRef: ContentRef | null = null

  for (const step of planResult.plan.steps) {
    for (const choice of step.requiredChoices) {
      if (!choice.answered) continue
      if (choice.kind === 'content') {
        // count === 1 for every content choice this phase authors
        // (`choice:class.subclass`'s own progression-row `count: 1`) --
        // `selected[0]` is therefore always the whole answer. A future
        // multi-select content choice would need this generalized; not
        // needed by the real authored corpus today.
        const ref = choice.selected[0] ? parseContentRef(choice.selected[0]) : null
        if (ref) resolvedSubclassRef = ref
        continue
      }
      resolvedAnswers[choice.id] = choice.selected
    }
  }

  // INVALID / STALE OPTIONS -- re-resolve the submitted subclass ContentRef
  // against the CURRENT Content Catalogue at Confirm time, never trusting
  // the client's plan-time resolution (a Content Pack refresh could have
  // happened between Preview and Confirm even though the plan's own
  // fingerprint check above already guards the common case of a BOUND
  // version changing; this is the deeper, "is this exact reference still
  // legal" check). Missing, wrong-parent, or malformed all reject the same
  // way -- never a silent substitution.
  if (resolvedSubclassRef) {
    const catalogue = await getWorldContentCatalogue(worldId)
    const parentClassSlug = base.classes[0]!.classRef.slug
    const entry = catalogue.subclasses.find(
      (candidate) => candidate.packageId === resolvedSubclassRef!.packageId && candidate.slug === resolvedSubclassRef!.slug
    )

    if (!entry || entry.parentClassSlug !== parentClassSlug) {
      return {
        ok: false,
        reason: 'unresolved-choices',
        message: entry
          ? `The submitted subclass does not belong to this character's class`
          : `The submitted subclass no longer exists in this World's current Content Catalogue`
      }
    }
  }

  if (Object.keys(resolvedAnswers).length) {
    const existingChoices = (await loadCharacterRulesChoices(characterId)) ?? emptyStoredRulesChoices()
    const mergedChoices = {
      selections: { ...existingChoices.selections, ...resolvedAnswers }
    }
    await saveCharacterRulesChoices(characterId, mergedChoices)
  }

  const onlyClassEntry = base.classes[0]!
  const nextProgression: StoredCharacterProgression = {
    classes: [{
      classRef: onlyClassEntry.classRef,
      level: targetLevel,
      // A newly-confirmed subclass overrides; otherwise the class entry's
      // own already-persisted subclassRef survives this write unchanged
      // (this transition crossed no subclass-choice level, or one was
      // already confirmed on a prior transition).
      subclassRef: resolvedSubclassRef ?? onlyClassEntry.subclassRef ?? null
    }]
  }

  const saved = await saveCharacterProgression(characterId, nextProgression)
  return { ok: true, progression: saved, currentLevel: targetLevel }
}
