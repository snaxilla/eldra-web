// Character Progression -- Character Progression Phase 1A (Game Admin Level
// Manager + Authoritative Level Transition Engine + Package-Declared Level
// Choices).
//
// ---------------------------------------------------------------------------
// THE GAP THIS FILE FILLS
// ---------------------------------------------------------------------------
// `value:level` (packages/eldra-dnd5e-2024/definitions.json) is declared
// `storage: 'stored'`, `default: 1` -- a real, per-character-overridable Rules
// Engine input, not a formula. But nothing in the current architecture ever
// writes a per-character override for it: `character-actor-bridge.ts`'s
// `buildActorState` copies ability scores, health, and rules-choice answers
// verbatim from the assembled blueprint, but has no equivalent field for
// level at all. Every character today therefore silently evaluates at
// `value:level`'s own default of 1, forever, with no existing mutable
// source -- confirmed by tracing every write path into `ActorState.values`
// before writing a single line here. This file is that missing mutable
// source's STORED shape; character-actor-bridge.ts (see its own new
// `levelDefinitionId`/`levelOverride` inputs) is what actually feeds it into
// an evaluation.
//
// ---------------------------------------------------------------------------
// WHY `classes: []`, NOT A BARE `level: number`
// ---------------------------------------------------------------------------
// Every character in this app has exactly one class today -- but the user's
// own explicit multiclass intent ("do not build a Level Manager whose
// persistence contract assumes one character = exactly one class forever")
// means TOTAL CHARACTER LEVEL must be structurally distinct from CLASS
// LEVEL even while they are numerically identical for every character that
// exists right now. A bare `level: number` field would need a breaking
// migration the day a second class entry exists; an array whose sum IS the
// total needs no migration at all -- `totalCharacterLevel` below already
// means "sum of every class entry's level," today over an array of length
// one, later over an array of length two or three, with no consumer of this
// file needing to change when that day comes.
//
// `classRef` is included on each entry (rather than only a level number)
// because a genuine multiclass character needs to know WHICH class each
// level entry belongs to -- Sorcerer 5 / Bard 3 is not expressible as two
// bare numbers. It deliberately mirrors the exact `{packageId, slug}` shape
// `catalogue_selection`'s own class/species/background refs already use
// (see server/utils/character-assembly.ts's own `StoredChoiceRef`) --
// restated here rather than cross-imported, the same "restate the tiny ref
// shape" convention every sibling module in this family (inventory.ts,
// spellcasting.ts) already follows for their own catalogue references.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE DOES NOT DO
// ---------------------------------------------------------------------------
// It stores WHICH levels this character has in WHICH classes -- nothing
// about HOW leveling works (what a level grants, what choices it requires,
// how HP/proficiency/spell slots change). Those are Rules Engine/package
// facts (formulas, tables, and -- currently absent, see
// server/utils/character-progression-plan.ts's own header -- level-gated
// facet grants), never generic app knowledge. This file is pure data, no
// formulas, no game rules, exactly like ability-scores.ts/health.ts beside
// it in this same directory.

export type ClassRef = {
  packageId: string
  slug: string
}

export type StoredClassLevel = {
  classRef: ClassRef
  level: number
  // Character Progression Phase 1C -- the SOLE authoritative record of this
  // class entry's selected subclass, scoped PER class entry (never
  // character-global) specifically so a future multiclass character can
  // hold `Wizard 5 { subclassRef: evoker }` and `Fighter 3 { subclassRef:
  // champion }` simultaneously without a redesign. Reuses the identical
  // `ClassRef` shape every other catalogue reference in this file already
  // uses -- a subclass is, structurally, exactly the same kind of fact a
  // class or background reference already is.
  //
  // This is the ONLY durable store for a confirmed subclass selection --
  // `rules_choices` never independently records one (see
  // server/utils/character-progression-plan.ts's own SUBCLASS AUTHORITY
  // header for why: a Content reference is not a Definition answer, and
  // this field already exists as its correct home). There is therefore
  // nothing for a second persisted copy to drift from.
  subclassRef?: ClassRef | null
}

// D&D 2024 Character Rules Phase 2A.1 -- the smallest generic, durable
// record of "this character has this feat," deliberately NOT scoped to "the
// feat chosen at Level 4" (this phase's own explicit instruction). A flat,
// top-level list rather than nested under a class entry, because a feat can
// come from a Background's Origin slot (not class-scoped at all), a class's
// ASI progression, or a future Epic Boon/Fighting Style grant -- the same
// `ClassRef` shape every other catalogue reference in this file already
// uses, restated here rather than cross-imported (this family's own
// established convention).
//
// `choiceKey` is the progression-choice key that granted this feat (e.g.
// `class:progression:4:choice:feat.selection`) -- carried so a later
// confirm can recognize "this exact acquisition was already recorded" (idempotent
// retry) and so a repeatable feat (Ability Score Improvement) can be
// acquired again at a LATER choiceKey (a different level) without colliding
// with an earlier acquisition of the identical featRef. Two entries may
// legally share a `featRef` (a repeatable feat taken twice); no two may
// share a `choiceKey` (one acquisition per progression choice).
export type StoredAcquiredFeat = {
  featRef: ClassRef
  choiceKey: string
}

export type StoredCharacterProgression = {
  classes: StoredClassLevel[]
  // Always present (never omitted), the same "always-present, sometimes-
  // empty" rule this file's sibling arrays already follow. `[]` for every
  // character created before this phase -- a legal, common state, not a
  // migration target.
  feats: StoredAcquiredFeat[]
}

export function emptyCharacterProgression(): StoredCharacterProgression {
  return { classes: [], feats: [] }
}

// A valid class level is 1-20, matching `value:level`'s own declared
// `constraints: {min:1, max:20}` (definitions.json) -- restated here as a
// plain number check rather than importing anything Rules-Engine-shaped,
// the same "app/ never imports server/, and neither imports the engine for
// one constant pair" boundary this codebase already draws everywhere else.
export function isValidClassLevel(value: unknown): value is number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readClassRef(value: unknown): ClassRef | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const packageId = trimmed(record.packageId)
  const slug = trimmed(record.slug)
  if (!packageId || !slug) return null
  return { packageId, slug }
}

// Re-validated on read, never trusted -- the same posture every sibling
// stored-record normalizer in this family (spellcasting.ts's
// `normalizeStoredSpellcasting`, inventory.ts's `normalizeStoredInventory`)
// already takes. A malformed ENTRY is dropped rather than failing the whole
// record; a malformed ENVELOPE still returns null.
export function normalizeStoredProgression(value: unknown): StoredCharacterProgression | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const input = value as Record<string, unknown>
  if (!Array.isArray(input.classes)) return null

  const classes: StoredClassLevel[] = []
  for (const raw of input.classes) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const record = raw as Record<string, unknown>
    const classRef = readClassRef(record.classRef)
    if (!classRef) continue
    if (!isValidClassLevel(record.level)) continue
    // `readClassRef` returns `null` for anything malformed or absent -- a
    // stored `subclassRef` is therefore always re-validated the same way
    // every other stored reference in this file already is, never trusted.
    classes.push({ classRef, level: Number(record.level), subclassRef: readClassRef(record.subclassRef) })
  }

  // D&D 2024 Character Rules Phase 2A.1 -- re-validated on read, same
  // posture as `classes` immediately above. A malformed ENTRY is dropped
  // rather than failing the whole record; `input.feats` absent (every
  // record predating this phase) normalizes to `[]`, never `null`.
  const feats: StoredAcquiredFeat[] = []
  if (Array.isArray(input.feats)) {
    for (const raw of input.feats) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
      const record = raw as Record<string, unknown>
      const featRef = readClassRef(record.featRef)
      if (!featRef) continue
      const choiceKey = trimmed(record.choiceKey)
      if (!choiceKey) continue
      feats.push({ featRef, choiceKey })
    }
  }

  return { classes, feats }
}

// Sum across every class entry -- see this file's own header on why this,
// not a bare stored number, is the authoritative "total character level"
// today and after a future multiclass phase alike. Defaults to 1 (never 0)
// when there are no entries at all -- the same number `value:level`'s own
// `default: 1` already asserts for a character this file has never been
// written for, so a caller reads the identical fact whether it comes from
// this function or (absent any override) from the Rules Engine's own
// default.
export function totalCharacterLevel(progression: StoredCharacterProgression | null | undefined): number {
  if (!progression || !progression.classes.length) return 1
  return progression.classes.reduce((sum, entry) => sum + entry.level, 0)
}
