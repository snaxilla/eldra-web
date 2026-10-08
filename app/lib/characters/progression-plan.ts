// Progression Plan -- the shared type contract for Character Progression
// Phase 1A's Game Admin Level Manager, and (per this task's own explicit
// requirement) the SAME contract a future player-facing Level Up Wizard
// will consume. Declared in app/lib/ (never server/) so both the client
// panel and the server planner import the identical shapes -- the same
// "restate the tiny ref, share the real type" rule this codebase's other
// client/server contracts (cast-capability.ts, effective-mechanics.ts)
// already follow.
//
// ---------------------------------------------------------------------------
// TWO UNRELATED THINGS NAMED "PROGRESSION" -- READ THIS FIRST
// ---------------------------------------------------------------------------
// The Rules Engine ALREADY has a `kind: 'progression'` Definition type and a
// `RulesFacet.progression?: DefinitionId` pointer to one (app/lib/rules/types.ts,
// app/lib/content-rules/types.ts, rules-package-architecture.md §7.5) --
// designed, but confirmed (by tracing every reader of it) completely
// unconsumed: no real `kind:'progression'` Definition exists anywhere in
// `packages/eldra-dnd5e-2024`, evaluating one is a RulesError by design, and
// `character-actor-bridge.ts` never reads `facet.progression` at all. This
// module has NOTHING to do with that seam -- it does not touch it, extend
// it, or depend on it. "Progression" here means the STORED, per-character
// fact of which class levels a character has
// (app/lib/characters/progression.ts's own `StoredCharacterProgression`)
// and the PLAN for transitioning between two such states. Two different
// concepts sharing an English word; this comment exists so a future reader
// never conflates them.
//
// ---------------------------------------------------------------------------
// WHY THIS IS A PLAN, NOT `level = N`
// ---------------------------------------------------------------------------
// A target level more than one above the current level must be evaluated
// LEVEL BY LEVEL (this task's own explicit requirement) so any choice a
// future package declares at an intermediate level is discoverable before
// commit, not skipped. `steps` is therefore always the full ascending run
// of entered levels (current+1 .. target), never a single collapsed diff.
//
// ---------------------------------------------------------------------------
// WHY `requiredChoices` WAS (HONESTLY) ALWAYS EMPTY IN PHASE 1A, AND ISN'T
// ANYMORE
// ---------------------------------------------------------------------------
// Phase 1A's own audit found the active Rules Package declared no
// level-gated choice of any kind -- `RulesFacetChoice` (the only choice
// mechanism that existed then) had no level/trigger field at all and was
// creation-time-only. Character Progression Phase 1B completes the
// designed-but-dormant `RulesFacet.progression`/`kind:'progression'` seam
// (rules-package-architecture.md §7.5) into a real consumer
// (server/utils/character-actor-bridge.ts), and extends `ProgressionRow`
// (app/lib/rules/types.ts) with its own `choices` -- so a Progression row
// CAN now require an answer once its own level threshold is reached. This
// type was always shaped to CARRY a real choice the moment content declared
// one (mirroring `SpellChoice`, app/lib/spell-mechanics/types.ts's own
// generic "package declares id/label/options" shape exactly); `selected`/
// `answered` are the only fields this phase adds, for the CHOICE ANSWERS
// DURING PREVIEW flow (character-progression-plan.ts's own header) --
// `id`/`label`/`options`/`count` are unchanged since Phase 1A.
//
// `requiredChoices` still reads EMPTY for the overwhelming majority of
// content (species/background facets that declare no `progression` at all,
// and every OTHER class besides the one real authored case -- see
// app/lib/content-rules/dnd5e-2024.ts's own header for exactly which real
// Wizard fact this phase authored and why every other Wizard/Fighter 1-5
// choice remains a documented content-authoring gap, not a bug).

export type ProgressionChoiceOption = {
  id: string
  label: string
}

// Character Progression Phase 1C -- the stable Content Catalogue reference
// shape a subclass (or any future Content-sourced choice) is identified by.
// Deliberately the SAME `{packageId, slug}` shape every other catalogue
// reference in this codebase already uses (character-assembly.ts's own
// StoredChoiceRef, app/lib/characters/progression.ts's own ClassRef) --
// restated here rather than cross-imported, matching this family's own
// established "restate the tiny ref shape" convention.
export type ContentRef = {
  packageId: string
  slug: string
}

// Encodes a ContentRef into the SAME `string[]` wire shape every Definition
// choice answer already uses (`answers: Record<string, string[]>` on both
// /progression/plan and /progression/confirm) -- chosen specifically so
// NEITHER route's request/response shape needs to change for Content
// choices to flow through the identical existing protocol. `::` is not a
// legal character in either a packageId (reverse-DNS-style,
// content-pack-publishing.ts's own PACKAGE_ID_PATTERN) or a slug
// (lowercase/digits/hyphens, 5etools-classes.ts's own slugify), so this
// encoding is unambiguous and losslessly reversible.
export function serializeContentRef(ref: ContentRef): string {
  return `${ref.packageId}::${ref.slug}`
}

export function parseContentRef(value: string): ContentRef | null {
  const parts = value.split('::')
  if (parts.length !== 2) return null
  const [packageId, slug] = parts
  if (!packageId || !slug) return null
  return { packageId, slug }
}

export type ProgressionChoice = {
  // A stable id for WHICH mechanic this choice resolves -- never a class
  // name, never spell-specific, mirroring SpellChoice's own identical rule.
  // Character Progression Phase 1B: this is exactly
  // `progressionChoiceKey(slot, row.at, choiceSetId)`
  // (app/lib/characters/rules-choices.ts) -- the SAME identity the choice
  // answer is (or will be) persisted under, so a client never has to
  // reconstruct or guess the key it submits back at Confirm.
  id: string
  label: string
  options: ProgressionChoiceOption[]
  count: number
  // D&D 2024 Character Rules Phase 2A.1 -- the ChoiceSet id this choice
  // answers (e.g. `choice:feat.selection`, `choice:feat.asi-ability-
  // increase`). Restated from `ResolvableChoice.choiceSetId`
  // (app/lib/characters/rules-choices.ts) rather than re-derived from `id`
  // (the key's own suffix IS the choiceSetId, but parsing it back out would
  // duplicate `progressionChoiceKey`'s own format knowledge in a second
  // place). Needed by server/utils/character-progression-plan.ts's own
  // Confirm-time validation to recognize the feat-selector choice and to
  // look up an 'activate-source' choice's own declared `resultCap` via the
  // active package's registry, without this type itself needing to know
  // what either of those mean.
  choiceSetId: string
  // Character Progression Phase 1C -- the CLOSED, narrow answer-kind
  // discriminant this task's own CHOICE MODEL EXTENSION approved: 'content'
  // when this choice's options are Content Catalogue entries (their `id`
  // is a serializeContentRef-encoded string, resolved against
  // WorldGameplayCatalogue, e.g. subclass selection); 'definition'
  // (default reading when omitted, for every choice that predates this
  // phase) when `id` is a plain Definition id, unchanged. This tells a
  // consumer HOW to interpret `options`/`selected` without it needing to
  // parse the identifiers itself -- never a generic/unknown value system,
  // exactly the narrow union the approval specified.
  kind: 'definition' | 'content'
  // Character Progression Phase 1B -- this choice's own CURRENT selection,
  // whether persisted (a level already confirmed in the past) or merely
  // TENTATIVE (a preview-time answer this specific plan request supplied,
  // never persisted until Confirm -- see character-progression-plan.ts's
  // own CHOICE ANSWERS DURING PREVIEW header). `[]` when nothing has been
  // picked yet -- never omitted, the same "always-present, sometimes-empty"
  // rule `requiredChoices` itself already follows on `ProgressionLevelStep`.
  selected: string[]
  // Character Progression Phase 1B -- `true` only when `selected` VALIDLY
  // answers this choice (right count, every id a real offered option) --
  // the identical rule server/utils/character-actor-bridge.ts's own
  // `validateChoiceSelection` already enforces for every other choice in
  // this codebase, never re-derived a second way here. A choice with one of
  // two required picks made is still `false`.
  answered: boolean
  // D&D 2024 Character Rules Phase 2A.1 UX Correction -- mirrors the
  // ChoiceSet's own `distinct` flag (app/lib/rules/types.ts) through to the
  // client. `undefined`/`true` (every choice authored before this phase)
  // means the existing checkbox-list rendering (an option may be selected
  // at most once) stays correct unchanged; `false` is what tells
  // CharacterProgressionPanel.vue's generic renderer a choice's own
  // `selected` answer may legally contain the SAME option more than once,
  // and to render one control per required slot instead of a checkbox
  // list -- see app/components/characters/characterProgressionChoicePresentation.ts's
  // own header for the full reasoning.
  distinct?: boolean
}

// One Value/Table's before/after at one level step -- computed as a DIFF
// between two real Rules Engine evaluations (this level vs. the previous
// one), never as authored "this class grants X at this level" content. See
// character-progression-plan.ts's own header for why diffing, not
// authoring, is how this stays honest with zero level-gated package data.
export type ProgressionAutomaticConsequence = {
  id: string
  label?: string
  previousValue: unknown
  newValue: unknown
}

export type ProgressionLevelStep = {
  level: number
  automaticConsequences: ProgressionAutomaticConsequence[]
  // Always [] against the current Rules Package -- see this file's own
  // header. Never omitted (an always-present, sometimes-empty array, the
  // same "absence is legal, but still a real field" rule every other
  // optional-in-practice array in this codebase already follows) so a
  // future choice-bearing level slots into the EXACT same shape a client
  // already knows how to render, with no shape change on either side.
  requiredChoices: ProgressionChoice[]
}

import type { UnresolvedDecision } from '../content-rules/creation-completeness'
import type { SpellRequirementPoolKind } from '../content-rules/types'
// D&D 2024 Character Rules P3.4 -- type-only; `spell-acquisition-plan.ts` itself imports VALUES from
// this file (`serializeContentRef`, `progressionChoiceKey`'s wrapper `spellRequirementAnswerKey`),
// so only a type-only import back is safe here (erased before any runtime module cycle could form) --
// the same cross-import already established for `UnresolvedDecision` immediately above.
import type { SpellAcquisitionIssue, SpellAcquisitionOption } from './spell-acquisition-plan'

// D&D 2024 Character Rules P3.4 -- the Level Manager's own per-requirement row, restated (never
// cross-imported as a VALUE) from `SpellAcquisitionRequirementPlan` (P3.2) plus exactly two fields
// a creation-time consumer never needed: `label` (pool-kind English, so the panel names no class)
// and `answerKey` (the stable wire key this requirement's tentative answers live under -- see
// `spellRequirementAnswerKey`/`character-progression-spell-acquisition.ts`'s own header). `selectedRefs`
// is the WIRE-FORMAT subset of `selected` (P3.2's own catalogue-ref identities, converted back to
// `serializeContentRef` strings) -- a custom/homebrew identity has no ref and is never listed here.
export type ProgressionSpellRequirementPlan = {
  requirementId: string
  pool: SpellRequirementPoolKind
  label: string
  answerKey: string
  target: number
  legalCount: number
  missing: number
  satisfied: boolean
  selectedRefs: string[]
  options: SpellAcquisitionOption[]
  issues: SpellAcquisitionIssue[]
}

// `null` for a class with no `spellRequirements` at all (a non-caster) -- never an empty
// `{requirements: [], complete: true}`, so a caller can tell "this class has nothing to ask" apart
// from "nothing is missing right now" without inspecting the array.
export type ProgressionSpellPlan = {
  requirements: ProgressionSpellRequirementPlan[]
  complete: boolean
}

export type ProgressionPlan = {
  currentLevel: number
  targetLevel: number
  steps: ProgressionLevelStep[]
  // Every ProgressionChoice.id across every step with no answer yet.
  // Confirmation is blocked while this is non-empty (today: always empty,
  // so never blocking -- see this file's own header).
  unresolvedChoiceIds: string[]
  // PHASE 0 -- mandatory decisions the levels crossed contain that Eldra cannot record yet.
  // Presentation reads this; the server authority refuses Confirm independently.
  unresolvedDecisions?: UnresolvedDecision[]
  // D&D 2024 Character Rules P3.4 -- the TARGET-STATE spell acquisition plan for `targetLevel`
  // (never a per-level delta -- see character-progression-spell-acquisition.ts's own header). `null`
  // for a class with no spell requirements at all. Gates `valid` below exactly like
  // `unresolvedChoiceIds`/`unresolvedDecisions` already do.
  spellPlan: ProgressionSpellPlan | null
  valid: boolean
  // Stale-plan protection (this task's own explicit requirement) --
  // deliberately the smallest useful strategy, NOT a version/event-sourcing
  // system: a plain string recording the `currentLevel` this plan was built
  // from. `confirmProgression` re-reads the character's ACTUAL current
  // level fresh and rejects if it no longer matches this fingerprint --
  // the one fact that can go stale between preview and confirm (another
  // admin/tab levels the same character in the meantime), given there are
  // no choices today whose ANSWERS could also go stale independently.
  fingerprint: string
}
