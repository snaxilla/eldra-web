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
  type StoredAcquiredFeat,
  type StoredCharacterProgression
} from '../../app/lib/characters/progression'
import type {
  ContentRef,
  ProgressionAutomaticConsequence,
  ProgressionChoice,
  ProgressionLevelStep,
  ProgressionPlan,
  ProgressionSpellPlan
} from '../../app/lib/characters/progression-plan'
import { parseContentRef, serializeContentRef } from '../../app/lib/characters/progression-plan'
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
import { emptyStoredRulesChoices, resolveChoiceTarget } from '../../app/lib/characters/rules-choices'
import { featFilterVerdict, featOptionVerdict, type FeatPrerequisite, type FeatUnavailableReason } from '../../app/lib/feat-mechanics'
import type { ContentCatalogueFilter, SpellCatalogueFilter } from '../../app/lib/rules/types'
import { progressionUnresolvedDecisions, describeUnresolved } from '../../app/lib/content-rules/creation-completeness'
import type { RulesFacet } from '../../app/lib/content-rules'
import type { AssembledSpellEntry } from '../../app/lib/characters/spellcasting'
import { toStoredSpellEntry } from '../../app/lib/characters/spellcasting'
import type { SpellAcquisitionPlan, TentativeSpellSelection } from '../../app/lib/characters/spell-acquisition-plan'
import {
  buildProgressionAcceptedSpellEntries,
  buildProgressionSpellPlan,
  progressionSpellSlotLevels,
  spellTentativeSelectionsFromAnswers,
  toProgressionSpellPlan
} from './character-progression-spell-acquisition'
import { describeSpellPlanFailure } from './character-spell-acquisition'
import { saveCharacterSpellcasting } from './character-spellcasting'

// Phase 2C.1 -- how a content-backed progression answer is ROUTED. The
// ChoiceSet's own typed selector declares what it asks for (`from.category`:
// 'feats' or 'subclasses') and any package-owned filter. Routing reads THAT,
// never the choice set's id: a second feat choice set lands in
// progression.feats[] with no new branch here, and an unknown category fails
// closed rather than being written as a subclass.
// `filter`'s real shape depends on `category` (P2: 'spells' carries a SpellCatalogueFilter, never
// a feat's ContentCatalogueFilter) -- this file's own routing below reads `category` only; a
// filter's fields are read by featFilterVerdict/spellOptionVerdict, never here.
type ContentChoiceSelector = { category: string; filter?: ContentCatalogueFilter | SpellCatalogueFilter }
type ContentChoiceLookup = (choiceSetId: string) => ContentChoiceSelector | null

async function loadContentChoiceLookup(worldId: string | number): Promise<ContentChoiceLookup> {
  const runtime = await getWorldRuntime(worldId)
  if (!(runtime.configured && runtime.ok)) return () => null
  return (id) => {
    const definition = runtime.runtime.registry.getById(id)
    if (!definition || definition.kind !== 'choiceSet' || definition.from.kind !== 'fromContentCatalogue') return null
    return { category: definition.from.category, filter: definition.from.filter }
  }
}

// Progression answer keys are `${slot}:progression:${at}:${choiceSetId}` (see
// progressionChoiceKey), so the choice set id begins at its `choice:` segment.
function choiceSetIdOfKey(key: string): string | null {
  const index = key.indexOf(':choice:')
  return index < 0 ? null : key.slice(index + 1)
}

function contentSelectorOfKey(key: string, lookup: ContentChoiceLookup): ContentChoiceSelector | null {
  const id = choiceSetIdOfKey(key)
  return id ? lookup(id) : null
}

// Why a feat option was refused, keyed by the choice then the option. Built by
// the SAME preview pass that decides what is offered, so Confirm can explain a
// submitted illegal answer with the reason the predicate actually produced.
type FeatRejection = { title: string; reason: FeatUnavailableReason }
type FeatRejections = Record<string, Record<string, FeatRejection>>

// The ONE place that turns a feat rejection reason into player-facing text.
function featRejectionMessage(title: string, reason: FeatUnavailableReason): string {
  switch (reason) {
    case 'already-owned':
      return `'${title}' is not repeatable and this character already has it`
    case 'prerequisite-unmet':
      return `This character does not meet '${title}' prerequisite`
    case 'prerequisite-unsupported':
      return `'${title}' has a prerequisite this engine cannot evaluate, so it cannot be selected`
    default:
      return `'${title}' is not a legal option for this choice`
  }
}

// The first submitted feat answer that the plan refused, explained by the
// shared predicate. Covers both refusals the preview recorded (already owned,
// prerequisite, unsupported) and crafted answers the choice never offered
// (wrong category or variant -- checked directly, without re-deriving state).
// Returns null when no feat answer is at fault, so the generic unresolved path
// still applies to everything else.
async function findRefusedFeatAnswer(
  worldId: string | number,
  plan: ProgressionPlan,
  rejections: FeatRejections,
  answers: Record<string, string[]>
): Promise<string | null> {
  const lookup = await loadContentChoiceLookup(worldId)
  const catalogue = await getWorldContentCatalogue(worldId)
  for (const step of plan.steps) {
    for (const choice of step.requiredChoices) {
      if (choice.kind !== 'content') continue
      const selector = lookup(choice.choiceSetId)
      if (selector?.category !== 'feats') continue
      for (const submitted of answers[choice.id] ?? []) {
        const recorded = rejections[choice.id]?.[submitted]
        if (recorded) return featRejectionMessage(recorded.title, recorded.reason)

        const ref = parseContentRef(submitted)
        const entry = ref ? catalogue.feats.find((candidate) => candidate.packageId === ref.packageId && candidate.slug === ref.slug) : undefined
        if (!entry || choice.options.some((option) => option.id === submitted)) continue
        // Guarded above by `selector?.category !== 'feats'`: always feat-shaped here.
        const verdict = featFilterVerdict(entry.featMechanics, selector.filter as ContentCatalogueFilter | undefined)
        if (!verdict.eligible) return featRejectionMessage(entry.title, verdict.reason)
      }
    }
  }
  return null
}

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
  // D&D 2024 Character Rules Phase 2A.1 -- a submitted feat answer failed
  // Confirm-time authority: it no longer resolves against the current
  // catalogue, is not a General-category feat, is a non-repeatable feat
  // this character already owns, fails its own real prerequisite, or its
  // ability-increase selection would push an ability above the ChoiceSet's
  // own declared `resultCap`. Distinct from `unresolved-choices` (which
  // means "nothing was answered, or the shape is wrong") -- this means "a
  // real answer was given and Confirm's own authoritative re-check rejects
  // it," the same distinction `stale-plan` already draws against
  // `invalid-target-level`.
  | 'illegal-feat-selection'
  // PHASE 0 -- the levels crossed (or a feat acquired in this transition) include a mandatory
  // decision Eldra cannot record yet. Refused at Confirm regardless of what the client shows.
  | 'unsupported-decision'
  // D&D 2024 Character Rules P3.4 -- this class's TARGET-STATE spell acquisition plan is not
  // `complete` (a missing, illegal, duplicate, wrong-tier, or Wizard-membership-violating answer),
  // re-validated fresh from the SUBMITTED answers, never the client's own remembered plan. Distinct
  // from `unresolved-choices` (Definition/content choices) because this is the SEPARATE spell
  // acquisition authority (planSpellAcquisition, P3.2) -- never folded into the same reason, so a
  // caller can tell which family of required selection is still outstanding.
  | 'unresolved-spell-selection'

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
    case 'illegal-feat-selection': return 400
    case 'unsupported-decision': return 409
    case 'unresolved-spell-selection': return 409
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
  // D&D 2024 Character Rules P3.4 -- the character's REAL persisted spell state and the currently
  // resolved class facet (for its own `spellRequirements`), read off the SAME `assembleCharacter`
  // call this function already makes -- zero extra fetches. `spells`/`expendedSlots` default to `[]`/
  // `{}` for a character with no spellcasting block yet (every character predating this phase), the
  // same "absence is legal" reading every sibling stored record in this family already gives a
  // missing block. `classFacet` is `null` for an unresolved class slot (Phase 0 may still refuse the
  // transition on other grounds; this field alone never does).
  spells: readonly AssembledSpellEntry[]
  expendedSlots: Record<string, number>
  classFacet: RulesFacet | null
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
  const classFacet = assembly.blueprint.class.status === 'resolved'
    ? (assembly.blueprint.class.entry.rulesFacet ?? null)
    : null
  return {
    ok: true,
    state: {
      progression,
      currentLevel: totalCharacterLevel(progression),
      spells: assembly.blueprint.spells ?? [],
      expendedSlots: assembly.blueprint.expendedSlots ?? {},
      classFacet
    }
  }
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
      kind: choice.kind,
      // D&D 2024 Character Rules Phase 2A.1 -- see ProgressionChoice's own
      // doc comment (app/lib/characters/progression-plan.ts).
      choiceSetId: choice.choiceSetId,
      // D&D 2024 Character Rules Phase 2A.1 UX Correction -- read straight
      // off the derived choice's own `distinct` (character-derived.ts's
      // `PresentableChoice`, itself relayed from the ChoiceSet's own
      // declaration), never re-derived or defaulted here.
      distinct: choice.distinct
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
// Tentative answers, routed by each answer's OWN selector. The first
// single-ContentRef subclasses answer is the subclass; every feat answer is
// kept, keyed by its own choiceKey (one preview can cross several feat levels).
// Definition answers (no content selector) and unknown categories are ignored
// here -- they are never applied as a feat or a subclass.
type TentativeFeatAcquisition = { choiceKey: string; choiceSetId: string; ref: ContentRef }

function extractTentativeContentAnswers(
  tentativeAnswers: Record<string, string[]>,
  lookup: ContentChoiceLookup
): { subclassRef: ContentRef | null; feats: TentativeFeatAcquisition[] } {
  let subclassRef: ContentRef | null = null
  const feats: TentativeFeatAcquisition[] = []
  for (const [key, selected] of Object.entries(tentativeAnswers)) {
    const selector = contentSelectorOfKey(key, lookup)
    if (!selector || selected.length !== 1) continue
    const ref = parseContentRef(selected[0]!)
    if (!ref) continue
    if (selector.category === 'feats') {
      feats.push({ choiceKey: key, choiceSetId: choiceSetIdOfKey(key)!, ref })
    } else if (selector.category === 'subclasses' && !subclassRef) {
      subclassRef = ref
    }
  }
  return { subclassRef, feats }
}

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules Phase 2A.1 -- FEAT VALIDATION HELPERS
// ---------------------------------------------------------------------------
// Everything below is read-only: it checks a resolved feat answer against
// real, authoritative Rules Engine output, never guesses, and never mutates
// anything. `confirmProgression`'s own FEAT ACQUISITIONS block (below) is
// the only caller.

function findNumberIn(derived: DerivedCharacter, id: string): number | null {
  for (const entries of Object.values(derived.byCategory)) {
    const entry = entries?.find((candidate) => candidate.id === id)
    if (entry) return typeof entry.value === 'number' ? entry.value : null
  }
  return null
}

function findBooleanIn(derived: DerivedCharacter, id: string): boolean {
  for (const entries of Object.values(derived.byCategory)) {
    const entry = entries?.find((candidate) => candidate.id === id)
    if (entry) return entry.value === true
  }
  return false
}

// Parses the real level a progression choice key was declared at --
// `${slot}:progression:${at}:${choiceSetId}` (app/lib/characters/rules-choices.ts's
// own progressionChoiceKey). A feat/ASI selection is always progression-
// shaped, so this should never legitimately return null for one; `null`
// (fail-closed, not thrown) is treated by its own caller as "cannot order,
// assume no prior acquisitions."
function parseProgressionChoiceLevel(key: string): number | null {
  const match = /:progression:(\d+):/.exec(key)
  return match ? Number(match[1]) : null
}

const ABILITY_PREREQUISITE_IDS: Record<string, string> = {
  str: 'value:ability.str', dex: 'value:ability.dex', con: 'value:ability.con',
  int: 'value:ability.int', wis: 'value:ability.wis', cha: 'value:ability.cha'
}

const ARMOR_PROFICIENCY_IDS: Record<string, string> = {
  light: 'value:armor.light.proficient', medium: 'value:armor.medium.proficient',
  heavy: 'value:armor.heavy.proficient', shield: 'value:armor.shield.proficient'
}

// One requirement, checked against a single derived snapshot.
// `registryHas` gates the `armor-proficiency` case specifically: the active
// Rules Package declares no `value:armor.*` Definition today (verified this
// phase directly against packages/eldra-dnd5e-2024/definitions.json), so a
// feat whose ONLY legal prerequisite path requires one fails closed here --
// honestly reported as "not satisfied," never silently treated as satisfied
// merely because the fact cannot currently be checked. See this phase's own
// report for which real feats this affects (Heavily Armored/Heavy Armor
// Master/Moderately Armored/Medium Armor Master/Shield Master).
function isRequirementSatisfied(
  requirement: FeatPrerequisite,
  derived: DerivedCharacter,
  characterLevel: number,
  registryHas: (id: string) => boolean
): boolean {
  switch (requirement.kind) {
    case 'level':
      return characterLevel >= requirement.level
    case 'ability': {
      const id = ABILITY_PREREQUISITE_IDS[requirement.ability]
      if (!id) return false
      const value = findNumberIn(derived, id)
      return value !== null && value >= requirement.minimum
    }
    case 'armor-proficiency': {
      const id = ARMOR_PROFICIENCY_IDS[requirement.tier]
      if (!id || !registryHas(id)) return false
      return findBooleanIn(derived, id)
    }
    case 'spellcasting':
      return findBooleanIn(derived, 'value:spellcasting.is_caster')
    default: {
      const exhaustive: never = requirement
      return exhaustive
    }
  }
}

// A feat's real prerequisite shape is OR-of-AND (app/lib/feat-mechanics/types.ts's
// own CanonicalFeatMechanics header) -- satisfying ANY one group is enough.
// `[]` (no groups at all) means no prerequisite, vacuously satisfied.
function isPrerequisiteSatisfied(
  groups: readonly (readonly FeatPrerequisite[])[],
  derived: DerivedCharacter,
  characterLevel: number,
  registryHas: (id: string) => boolean
): boolean {
  if (!groups.length) return true
  return groups.some((group) =>
    group.every((requirement) => isRequirementSatisfied(requirement, derived, characterLevel, registryHas))
  )
}

// What a step needs beyond the derived state: how to route each content
// answer, and the character's CONFIRMED state (feats and subclass) so option
// legality counts what is already owned.
type PlanContext = {
  lookup: ContentChoiceLookup
  persistedFeats: readonly StoredAcquiredFeat[]
  persistedSubclassRef: ContentRef | null
}

async function buildLevelStep(
  worldId: string | number,
  characterId: string | number,
  previousLevel: number,
  level: number,
  tentativeAnswers: Record<string, string[]>,
  ctx: PlanContext
): Promise<{ ok: true; step: ProgressionLevelStep; rejections: FeatRejections } | ProgressionFailure> {
  const tentative = extractTentativeContentAnswers(tentativeAnswers, ctx.lookup)
  const tentativeSubclassRef = tentative.subclassRef
  // D&D 2024 Character Rules Phase 2A.1 -- the SAME "apply the full
  // tentative set to every step" rule `tentativeSubclassRef` already
  // follows (see this file's own DEPENDENT CHOICES header), generalized to
  // a list: a tentative Level-4 feat pick stays applied when Level 6/8
  // steps are each independently evaluated in the same plan walk.
  // D&D 2024 Character Rules Phase 2A.1 -- LEVEL-GATED, unlike
  // `tentativeSubclassRef` immediately above. A feat's own facet is
  // consumed unconditionally once it is in `blueprint.feats` (feats have
  // no `at` field of their own the bridge could gate on, the way a
  // Progression row's `rowAt <= currentLevel` already gates class facts) --
  // so passing the SAME full acquisition list to both the `previousLevel`
  // and `level` evaluations would make a feat's own NESTED choice (e.g.
  // Ability Score Improvement's ability-distribution choice) "already
  // declared" at the previous level too, the moment it is tentatively
  // picked, and `diffRequiredChoices` would then never see it as newly
  // declared at the level it was actually chosen. Filtering each
  // evaluation's own acquisition list by the REAL level its own choiceKey
  // encodes (`parseProgressionChoiceLevel`) restores the same "gated by
  // level, cumulative once reached" semantics every other level-gated fact
  // in this system already has.
  const tentativeFeatAcquisitions = tentative.feats.map((feat) => ({ choiceKey: feat.choiceKey, ref: feat.ref }))
  const acquisitionsAtOrBefore = (maxLevel: number) => tentativeFeatAcquisitions.filter((acquisition) => {
    const acquiredAt = parseProgressionChoiceLevel(acquisition.choiceKey)
    return acquiredAt === null || acquiredAt <= maxLevel
  })
  const [previousResult, currentResult] = await Promise.all([
    getDerivedCharacterAtLevel(worldId, characterId, previousLevel, tentativeAnswers, tentativeSubclassRef, acquisitionsAtOrBefore(previousLevel)),
    getDerivedCharacterAtLevel(worldId, characterId, level, tentativeAnswers, tentativeSubclassRef, acquisitionsAtOrBefore(level))
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

  // Empty for the overwhelming majority of levels/characters (species/
  // background facets with no `progression`, every class besides the one real
  // authored case) -- see this file's own header on exactly which real fact
  // populates this and why every other real Wizard/Fighter 1-5 choice remains
  // a documented content gap, not a bug.
  const legal = await legalizeFeatChoices(
    worldId, characterId, level, diffRequiredChoices(previousResult.derived, currentResult.derived),
    ctx, tentativeAnswers, tentativeSubclassRef, tentative.feats
  )
  if (!legal.ok) return legal

  return {
    ok: true,
    step: {
      level,
      automaticConsequences: diffLevels(previousResult.derived, currentResult.derived),
      requiredChoices: legal.choices
    },
    rejections: legal.rejections
  }
}

// THE preview-side legality pass for content choices. Each option is kept only
// if featOptionVerdict accepts it against THIS character's state BEFORE the
// acquisition at this level: not already owned anywhere in the plan,
// prerequisites met on derived state (the same basis Confirm uses), and no
// unsupported prerequisite. Derived state is computed once per feat choice,
// not once per option. Confirm applies the identical predicate, so preview and
// Confirm cannot disagree. A content choice whose selector is unknown offers
// nothing (fail closed); subclass options pass through unchanged.
async function legalizeFeatChoices(
  worldId: string | number,
  characterId: string | number,
  level: number,
  choices: ProgressionChoice[],
  ctx: PlanContext,
  tentativeAnswers: Record<string, string[]>,
  tentativeSubclassRef: ContentRef | null,
  tentativeFeats: readonly TentativeFeatAcquisition[]
): Promise<{ ok: true; choices: ProgressionChoice[]; rejections: FeatRejections } | ProgressionFailure> {
  if (!choices.some((choice) => choice.kind === 'content')) return { ok: true, choices, rejections: {} }
  const rejections: FeatRejections = {}

  const catalogue = await getWorldContentCatalogue(worldId)
  const runtime = await getWorldRuntime(worldId)
  const registryHas = runtime.configured && runtime.ok
    ? (id: string) => runtime.runtime.registry.has(id)
    : () => false
  const entriesByKey = new Map(catalogue.feats.map((entry) => [
    serializeContentRef({ packageId: entry.packageId, slug: entry.slug }),
    entry
  ]))
  const known = [
    ...ctx.persistedFeats.map((feat) => ({ choiceKey: feat.choiceKey, ref: feat.featRef })),
    ...tentativeFeats.map((feat) => ({ choiceKey: feat.choiceKey, ref: feat.ref }))
  ]

  const out: ProgressionChoice[] = []
  for (const choice of choices) {
    if (choice.kind !== 'content') {
      out.push(choice)
      continue
    }

    const selector = ctx.lookup(choice.choiceSetId)
    if (selector?.category === 'subclasses') {
      out.push(choice)
      continue
    }
    if (selector?.category !== 'feats') {
      out.push({ ...choice, options: [], answered: false })
      continue
    }

    const priorAcquisitions = known.filter((other) => {
      if (other.choiceKey === choice.id) return false
      const otherLevel = parseProgressionChoiceLevel(other.choiceKey)
      return otherLevel === null || otherLevel < level
    })
    const priorDerived = await getDerivedCharacterAtLevel(
      worldId, characterId, level, tentativeAnswers, tentativeSubclassRef ?? ctx.persistedSubclassRef, priorAcquisitions
    )
    if (!priorDerived.available) {
      return {
        ok: false,
        reason: priorDerived.reason === 'character-not-found' ? 'character-not-found' : 'rules-unavailable',
        message: priorDerived.reason === 'character-not-found' ? 'Character not found in this world' : priorDerived.message
      }
    }

    const legalIds = new Set<string>()
    for (const option of choice.options) {
      const entry = entriesByKey.get(option.id)
      if (!entry) continue
      // Guarded above by `selector?.category !== 'feats'`: always feat-shaped here.
      const verdict = featOptionVerdict({
        mechanics: entry.featMechanics,
        filter: selector.filter as ContentCatalogueFilter | undefined,
        mappings: entry.rulesFacet?.featureRequirements ?? [],
        featureActive: (id) => findBooleanIn(priorDerived.derived, id),
        ownedElsewhere: known.some((other) =>
          other.choiceKey !== choice.id && other.ref.packageId === entry.packageId && other.ref.slug === entry.slug
        ),
        prerequisitesMet: () => isPrerequisiteSatisfied(
          entry.featMechanics?.prerequisiteGroups ?? [], priorDerived.derived, level, registryHas
        )
      })
      if (verdict.eligible) {
        legalIds.add(option.id)
      } else {
        rejections[choice.id] = { ...rejections[choice.id], [option.id]: { title: entry.title, reason: verdict.reason } }
      }
    }

    out.push({
      ...choice,
      options: choice.options.filter((option) => legalIds.has(option.id)),
      answered: choice.selected.length === choice.count && choice.selected.every((id) => legalIds.has(id))
    })
  }

  return { ok: true, choices: out, rejections }
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
): Promise<
  | { ok: true; plan: ProgressionPlan; featRejections: FeatRejections; spellPlan: SpellAcquisitionPlan | null; spellTentative: readonly TentativeSpellSelection[] }
  | ProgressionFailure
> {
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

  const ctx: PlanContext = {
    lookup: await loadContentChoiceLookup(worldId),
    persistedFeats: current.state.progression.feats ?? [],
    persistedSubclassRef: current.state.progression.classes[0]?.subclassRef ?? null
  }

  const steps: ProgressionLevelStep[] = []
  const featRejections: FeatRejections = {}
  for (let level = currentLevel + 1; level <= targetLevel; level++) {
    const stepResult = await buildLevelStep(worldId, characterId, level - 1, level, tentativeAnswers, ctx)
    if (!stepResult.ok) return stepResult
    steps.push(stepResult.step)
    Object.assign(featRejections, stepResult.rejections)
  }

  // A choice counts as unresolved only while it is not VALIDLY answered --
  // `answered` is read straight off the Rules Engine's own
  // `validateChoiceSelection` verdict (via `diffRequiredChoices`), never
  // re-derived here. A tentatively-answered choice (this call's own
  // `tentativeAnswers`) already reads `answered: true` at this point, since
  // it was applied before every `getDerivedCharacterAtLevel` call above.
  const unresolvedChoiceIds = steps.flatMap((step) => step.requiredChoices.filter((choice) => !choice.answered).map((choice) => choice.id))

  // PHASE 0 -- FAIL CLOSED. The levels crossed by this transition, the subclass in effect for
  // them (persisted, or chosen in this transition), and any feat acquired here must not own a
  // mandatory decision Eldra cannot record. Computed from the structural decision index, not
  // from the Rules Engine's choices, so a decision the planner never saw still blocks.
  const tentativeContent = extractTentativeContentAnswers(tentativeAnswers, ctx.lookup)
  const persisted = current.state.progression.classes[0]
  const unresolvedDecisions = progressionUnresolvedDecisions({
    classSlug: persisted?.classRef?.slug ?? '',
    subclassSlug: tentativeContent.subclassRef?.slug ?? persisted?.subclassRef?.slug ?? null,
    fromLevel: currentLevel,
    toLevel: targetLevel,
    feats: tentativeContent.feats.map((feat) => feat.ref.slug)
  })

  const [packageIntegrityHash, contentBindingFingerprint] = await Promise.all([
    resolvePackageIntegrityHash(worldId),
    resolveContentBindingFingerprint(worldId)
  ])

  // D&D 2024 Character Rules P3.4 -- TARGET-STATE spell acquisition, computed exactly ONCE against
  // `targetLevel` (never per crossed level -- see character-progression-spell-acquisition.ts's own
  // header). `null` for a class with no `spellRequirements` at all -- no plan built, no gate added,
  // mirroring create-v2.post.ts's own identical "a non-caster skips this entirely" rule.
  const spellRequirements = current.state.classFacet?.spellRequirements ?? []
  let spellPlan: SpellAcquisitionPlan | null = null
  let progressionSpellPlan: ProgressionSpellPlan | null = null
  const spellTentative = spellTentativeSelectionsFromAnswers(tentativeAnswers, spellRequirements, targetLevel)

  if (spellRequirements.length > 0) {
    const [catalogue, runtime] = await Promise.all([
      getWorldContentCatalogue(worldId),
      getWorldRuntime(worldId)
    ])
    const registry = runtime.configured && runtime.ok ? runtime.runtime.registry : null
    const spellSlotLevels = progressionSpellSlotLevels(registry, current.state.classFacet, targetLevel)

    spellPlan = buildProgressionSpellPlan({
      requirements: spellRequirements,
      catalogue: catalogue.spells,
      spellSlotLevels,
      targetLevel,
      persisted: current.state.spells,
      tentative: spellTentative
    })
    progressionSpellPlan = toProgressionSpellPlan(spellRequirements, spellPlan, targetLevel)
  }

  return {
    ok: true,
    plan: {
      currentLevel,
      targetLevel,
      steps,
      unresolvedChoiceIds,
      unresolvedDecisions,
      spellPlan: progressionSpellPlan,
      valid: unresolvedChoiceIds.length === 0 && unresolvedDecisions.length === 0 && (spellPlan === null || spellPlan.complete),
      fingerprint: fingerprintFor(currentLevel, packageIntegrityHash, contentBindingFingerprint)
    },
    featRejections,
    spellPlan,
    spellTentative
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
  const spellRequirements = current.state.classFacet?.spellRequirements ?? []
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
  const unsupported = planResult.plan.unresolvedDecisions ?? []
  if (unsupported.length > 0) {
    return { ok: false, reason: 'unsupported-decision', message: describeUnresolved(unsupported) }
  }

  // Structural preconditions for THIS planner -- more fundamental than any required-selection
  // family (Definition/content choices, spell acquisition), since this planner's own
  // single-class-entry assumption (every plan built so far already assumed `base.classes[0]`)
  // means neither family's completeness is even a well-formed question for a character this
  // Level Manager cannot represent at all. Checked BEFORE either, so a multiclass character is
  // told exactly that -- never "finish answering your other required selections first" for a
  // selection family a single-class planner cannot evaluate correctly anyway.
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

  // D&D 2024 Character Rules P3.4 -- SPELL ACQUISITION AUTHORITY. Re-validated against the SAME
  // fresh plan `planProgression` just rebuilt from these exact submitted `answers` -- never the
  // client's own remembered plan. Checked before the generic Definition/content-choice branch below
  // (which has no vocabulary for a spell-specific issue) so a missing/illegal/duplicate/wrong-tier
  // spell answer is reported as exactly that, never folded into a misleading generic "unresolved
  // choices" message when `unresolvedChoiceIds` itself is empty.
  if (planResult.spellPlan && !planResult.spellPlan.complete) {
    return {
      ok: false,
      reason: 'unresolved-spell-selection',
      message: describeSpellPlanFailure(planResult.spellPlan) ?? 'Spell selections are incomplete.'
    }
  }

  if (!planResult.plan.valid) {
    // A submitted feat the plan refused is named with the reason the shared
    // predicate produced -- never a generic "unresolved" for a real illegal pick.
    const illegalFeat = await findRefusedFeatAnswer(worldId, planResult.plan, planResult.featRejections, answers)
    if (illegalFeat) {
      return { ok: false, reason: 'illegal-feat-selection', message: illegalFeat }
    }
    return {
      ok: false,
      reason: 'unresolved-choices',
      message: `This transition still has unresolved required choices: ${planResult.plan.unresolvedChoiceIds.join(', ')}`
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
  // D&D 2024 Character Rules Phase 2A.1 -- the feat counterpart of
  // `resolvedSubclassRef`, generalized to a list for the same MULTIPLE ASI
  // LEVELS reason `tentativeFeatAcquisitions` already is in `buildLevelStep`.
  const resolvedFeatAcquisitions: { choiceKey: string; choiceSetId: string; ref: ContentRef }[] = []
  // D&D 2024 Character Rules Phase 2A.1 -- every DEFINITION-kind answer
  // alongside its own choiceSetId, kept separately from `resolvedAnswers`
  // (which only needs the flat key->selections shape for persistence) so
  // the RESULT CAP check below can look up each answer's own ChoiceSet
  // declaration without re-parsing it out of the key string.
  const resolvedDefinitionChoices: { key: string; choiceSetId: string; selected: string[] }[] = []

  const lookupContent = await loadContentChoiceLookup(worldId)
  for (const step of planResult.plan.steps) {
    for (const choice of step.requiredChoices) {
      if (!choice.answered) continue
      if (choice.kind === 'content') {
        // count === 1 for every content choice this phase authors
        // (`choice:class.subclass`'s own progression-row `count: 1`,
        // `choice:feat.selection`'s own, identical `count: 1`) --
        // `selected[0]` is therefore always the whole answer. A future
        // multi-select content choice would need this generalized; not
        // needed by the real authored corpus today.
        const ref = choice.selected[0] ? parseContentRef(choice.selected[0]) : null
        if (!ref) continue
        // D&D 2024 Character Rules Phase 2A.1 -- routed by the SAME
        // selector-based routing in `extractTentativeContentAnswers`
        // already uses, for the identical reason (shape alone cannot tell
        // a feat pick from a subclass pick once both exist).
        const selector = lookupContent(choice.choiceSetId)
        if (selector?.category === 'feats') {
          resolvedFeatAcquisitions.push({ choiceKey: choice.id, choiceSetId: choice.choiceSetId, ref })
        } else if (selector?.category === 'subclasses') {
          resolvedSubclassRef = ref
        } else {
          return {
            ok: false,
            reason: 'unresolved-choices',
            message: `'${choice.id}' answers a content category this Rules Package does not route`
          }
        }
        continue
      }
      resolvedAnswers[choice.id] = choice.selected
      resolvedDefinitionChoices.push({ key: choice.id, choiceSetId: choice.choiceSetId, selected: choice.selected })
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

  // ---------------------------------------------------------------------
  // D&D 2024 Character Rules Phase 2A.1 -- FEAT ACQUISITIONS
  // ---------------------------------------------------------------------
  // Four independent, server-authoritative checks per resolved feat answer,
  // none of which trust the client's plan-time resolution any more than the
  // subclass check above does: (1) the submitted ContentRef still resolves
  // to a REAL feat in the CURRENT catalogue that the choice's own package
  // filter accepts (Phase 2C.1: category + variant, not a hardcoded category); (2)
  // repeatability -- a non-repeatable feat cannot be acquired twice, whether
  // the conflict is against an already-confirmed feat or another feat
  // resolved in this SAME confirm call; (3) the feat's own real prerequisite
  // (OR-of-AND groups, see isPrerequisiteSatisfied), checked against this
  // character's ACTUAL derived state the moment BEFORE this acquisition --
  // never merely "the client's picker offered it," and never inflated by
  // this exact feat's own ability increase or by a LATER acquisition in this
  // same batch; (4) for Ability Score Improvement specifically, the nested
  // ability-distribution answer's own declared `resultCap` (20, RAW) is not
  // exceeded by the resulting ability score.
  // `base.classes[0]` is safe here, unguarded: the multiclass-not-supported
  // check above already returned if `base.classes.length !== 1`.
  const subclassRefForFeatChecks = resolvedSubclassRef ?? base.classes[0]?.subclassRef ?? null

  if (resolvedFeatAcquisitions.length) {
    const catalogue = await getWorldContentCatalogue(worldId)
    const runtime = await getWorldRuntime(worldId)
    const registryHas = runtime.configured && runtime.ok
      ? (id: string) => runtime.runtime.registry.has(id)
      : () => false
    const lookupChoiceSet = runtime.configured && runtime.ok
      ? (id: string) => {
          const definition = runtime.runtime.registry.getById(id)
          return definition && definition.kind === 'choiceSet' ? definition : null
        }
      : () => null

    // D&D 2024 Character Rules Phase 2A.1 -- the RESULT CAP check below
    // must compare against the Value an 'activate-source' choice's
    // resolved target ACTUALLY increments, never the Source id itself
    // (a SourceDefinition is never itself a numeric, evaluable Value --
    // `character-derived.ts`'s own projection only ever evaluates
    // `kind: 'value'` Definitions). Reads the Source's own first inline
    // Modifier's `target` field -- the exact field
    // `source:asi.increase.<ability>`'s own single `phase: 'add'` Modifier
    // declares (definitions.json) -- `null` for a Source with no inline
    // Modifier (a ModifierReference, or none), which this corpus never
    // produces but which this function reports honestly rather than
    // guessing at.
    const lookupSourceValueTarget = runtime.configured && runtime.ok
      ? (sourceId: string): string | null => {
          const definition = runtime.runtime.registry.getById(sourceId)
          if (!definition || definition.kind !== 'source') return null
          const firstModifier = definition.modifiers[0]
          return firstModifier && 'target' in firstModifier ? firstModifier.target : null
        }
      : () => null

    // Every acquisition already on record (persisted) OR resolved in this
    // SAME confirm call -- the full pool repeatability is checked against.
    const allAcquisitions: { choiceKey: string; ref: ContentRef }[] = [
      ...(base.feats ?? []).map((f) => ({ choiceKey: f.choiceKey, ref: f.featRef })),
      ...resolvedFeatAcquisitions
    ]

    for (const acquisition of resolvedFeatAcquisitions) {
      const catalogueEntry = catalogue.feats.find(
        (candidate) => candidate.packageId === acquisition.ref.packageId && candidate.slug === acquisition.ref.slug
      )

      if (!catalogueEntry) {
        return {
          ok: false,
          reason: 'illegal-feat-selection',
          message: `'${acquisition.ref.slug}' no longer exists in this World's current Content Catalogue`
        }
      }

      const ownedElsewhere = allAcquisitions.some(
        (other) => other.choiceKey !== acquisition.choiceKey
          && other.ref.packageId === acquisition.ref.packageId
          && other.ref.slug === acquisition.ref.slug
      )

      // Prerequisite -- checked against this character's derived state
      // using every acquisition STRICTLY BEFORE this one (by the real level
      // its own choiceKey encodes), never this feat's own increase and
      // never a later one in this batch.
      const thisLevel = parseProgressionChoiceLevel(acquisition.choiceKey)
      const priorAcquisitions = allAcquisitions.filter((other) => {
        if (other.choiceKey === acquisition.choiceKey) return false
        const otherLevel = parseProgressionChoiceLevel(other.choiceKey)
        return otherLevel === null || thisLevel === null || otherLevel < thisLevel
      })

      const priorDerived = await getDerivedCharacterAtLevel(
        worldId, characterId, thisLevel ?? targetLevel, answers, subclassRefForFeatChecks, priorAcquisitions
      )

      if (!priorDerived.available) {
        return { ok: false, reason: 'rules-unavailable', message: priorDerived.reason === 'character-not-found' ? 'Character not found in this world' : priorDerived.message }
      }

      // `acquisition` is always a FEAT acquisition (progression.feats[]'s own persisted shape;
      // this function processes no other category) -- the filter is always feat-shaped here.
      const filter = lookupContent(acquisition.choiceSetId)?.filter as ContentCatalogueFilter | undefined
      const verdict = featOptionVerdict({
        mechanics: catalogueEntry.featMechanics,
        filter,
        mappings: catalogueEntry.rulesFacet?.featureRequirements ?? [],
        featureActive: (id) => findBooleanIn(priorDerived.derived, id),
        ownedElsewhere,
        prerequisitesMet: () => isPrerequisiteSatisfied(
          catalogueEntry.featMechanics?.prerequisiteGroups ?? [], priorDerived.derived, thisLevel ?? targetLevel, registryHas
        )
      })
      if (!verdict.eligible) {
        return { ok: false, reason: 'illegal-feat-selection', message: featRejectionMessage(catalogueEntry.title, verdict.reason) }
      }

      // RESULT CAP -- only relevant for the nested ability-distribution
      // answer this feat's own facet may have declared (today: only
      // Ability Score Improvement). Looked up by choiceSetId, never by feat
      // name -- see app/lib/rules/types.ts's own `resultCap` header.
      const nestedAnswers = resolvedDefinitionChoices.filter((entry) => entry.key.startsWith(`feat:${acquisition.choiceKey}:`))
      const featCap = catalogueEntry.featMechanics?.abilityCap

      for (const nested of nestedAnswers) {
        const choiceSet = lookupChoiceSet(nested.choiceSetId)
        if (!choiceSet || choiceSet.effect !== 'activate-source') continue
        const cap = featCap ?? choiceSet.resultCap
        if (typeof cap !== 'number') continue

        // "Before" snapshot: the full confirmed context (subclass + every
        // resolved feat acquisition, including this one) WITH this exact
        // nested answer removed, so the comparison below measures this
        // answer's own marginal effect, never double-counts it.
        const answersWithoutThisNested = { ...answers }
        delete answersWithoutThisNested[nested.key]

        const beforeDerived = await getDerivedCharacterAtLevel(
          worldId, characterId, targetLevel, answersWithoutThisNested, subclassRefForFeatChecks, allAcquisitions
        )
        if (!beforeDerived.available) {
          return { ok: false, reason: 'rules-unavailable', message: beforeDerived.reason === 'character-not-found' ? 'Character not found in this world' : beforeDerived.message }
        }

        // Each selection resolves to a SOURCE id (`source:asi.increase.str`,
        // per this choice's own `effect: 'activate-source'`); the cap is
        // checked against the VALUE that source's own Modifier increments
        // (`value:ability.str`), resolved via `lookupSourceValueTarget`
        // immediately above -- never the source id itself, which has no
        // numeric derived value of its own to compare against a cap.
        const additions = new Map<string, number>()
        for (const selected of nested.selected) {
          const sourceId = choiceSet.writesTo ? resolveChoiceTarget(choiceSet.writesTo, selected) : selected
          const valueTarget = lookupSourceValueTarget(sourceId)
          if (!valueTarget) continue
          additions.set(valueTarget, (additions.get(valueTarget) ?? 0) + 1)
        }

        for (const [valueTarget, addCount] of additions) {
          const before = findNumberIn(beforeDerived.derived, valueTarget) ?? 0
          if (before + addCount > cap) {
            return {
              ok: false,
              reason: 'illegal-feat-selection',
              message: `This selection would raise '${valueTarget}' to ${before + addCount}, above the legal maximum of ${cap}`
            }
          }
        }
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
  // D&D 2024 Character Rules Phase 2A.1 -- every previously-confirmed feat
  // survives this write unchanged (this is a REPLACE of the whole
  // `progression` row, mirroring `classes` immediately below -- carrying
  // `base.feats` forward is what keeps an EARLIER confirm's acquisitions
  // from being silently dropped by a LATER one), plus every feat newly
  // resolved by THIS confirm, already fully validated above.
  const nextFeats: StoredAcquiredFeat[] = [
    ...(base.feats ?? []),
    ...resolvedFeatAcquisitions.map((acquisition) => ({ featRef: acquisition.ref, choiceKey: acquisition.choiceKey }))
  ]

  const nextProgression: StoredCharacterProgression = {
    classes: [{
      classRef: onlyClassEntry.classRef,
      level: targetLevel,
      // A newly-confirmed subclass overrides; otherwise the class entry's
      // own already-persisted subclassRef survives this write unchanged
      // (this transition crossed no subclass-choice level, or one was
      // already confirmed on a prior transition).
      subclassRef: resolvedSubclassRef ?? onlyClassEntry.subclassRef ?? null
    }],
    feats: nextFeats
  }

  const saved = await saveCharacterProgression(characterId, nextProgression)

  // D&D 2024 Character Rules P3.4 -- CANONICAL SPELLCASTING WRITE-THROUGH. WRITE ORDER: deliberately
  // LAST, after rules_choices and after the level write immediately above -- see this file's own
  // header for the full ordering rationale, extended here. Writing spellcasting BEFORE the level
  // write would risk a WORSE partial-state failure than either existing write's own documented
  // residual risk: a bounded pool (cantrip/spell/arcanum) validates against `totalByLevel[level-1]`,
  // so persisting NEW spells while the character's OWN persisted level is still the OLD one could
  // leave it showing a real, player-visible OVER-COUNT (too many spells for its current level) if
  // this write then failed to reach the level write at all. Writing it LAST means a failure here
  // instead leaves the character at the NEW level with its OLD (now under-target) spell state --
  // benign, visible as "missing N more" exactly like every other real, untouched completeness gap
  // this system already tolerates, and self-healing on the NEXT Level Manager Preview/Confirm for
  // this class (the target-state planner always re-asks for whatever is still missing, regardless of
  // which level first surfaced it -- see REPEAT PREVIEW/SECOND LEVEL-UP in this phase's own report).
  // FAIL LOUDLY (no `.catch`) -- a completed-looking level-up silently missing its spells is exactly
  // the bug this phase exists to prevent, the same posture create-v2.post.ts's own identical write
  // already takes.
  if (planResult.spellPlan && spellRequirements.length > 0) {
    const persistedStoredSpells = current.state.spells.map(toStoredSpellEntry)
    const nextSpells = buildProgressionAcceptedSpellEntries(persistedStoredSpells, spellRequirements, planResult.spellPlan, planResult.spellTentative)
    await saveCharacterSpellcasting(characterId, { spells: nextSpells, expendedSlots: current.state.expendedSlots })
  }

  return { ok: true, progression: saved, currentLevel: targetLevel }
}
