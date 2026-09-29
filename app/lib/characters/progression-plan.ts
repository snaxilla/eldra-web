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
// WHY `requiredChoices` IS (HONESTLY) ALWAYS EMPTY TODAY
// ---------------------------------------------------------------------------
// See server/utils/character-progression-plan.ts's own header for the full
// corpus evidence: the active Rules Package declares no level-gated choice
// of any kind (no subclass-choice point, no ASI, no feat, no spell-learn
// trigger) -- `RulesFacetChoice` (the ONLY choice mechanism that exists
// today) has no level/trigger field at all and is creation-time-only. This
// type is shaped to CARRY a real choice the moment content declares one
// (mirroring `SpellChoice`, app/lib/spell-mechanics/types.ts's own generic
// "package declares id/label/options" shape exactly), not because one
// exists now.

export type ProgressionChoiceOption = {
  id: string
  label: string
}

export type ProgressionChoice = {
  // A stable id for WHICH mechanic this choice resolves -- never a class
  // name, never spell-specific, mirroring SpellChoice's own identical rule.
  id: string
  label: string
  options: ProgressionChoiceOption[]
  count: number
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

export type ProgressionPlan = {
  currentLevel: number
  targetLevel: number
  steps: ProgressionLevelStep[]
  // Every ProgressionChoice.id across every step with no answer yet.
  // Confirmation is blocked while this is non-empty (today: always empty,
  // so never blocking -- see this file's own header).
  unresolvedChoiceIds: string[]
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
