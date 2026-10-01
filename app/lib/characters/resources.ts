// Character Resources -- D&D 2024 Character Rules Phase 2A.2.
//
// The player-authored half of the Generic Character Resource system: how
// much of each acquired resource (Rage, Bardic Inspiration, Channel
// Divinity, Superiority Dice, ...) is currently EXPENDED. Shaped after
// app/lib/characters/spellcasting.ts's own `expendedSlots` field -- this is
// deliberately the identical persistence model, generalized from "keyed by
// spell slot level" to "keyed by Resource Definition id."
//
// ---------------------------------------------------------------------------
// WHY "PERSIST EXPENDITURE, DERIVE MAXIMUM" -- NOT "PERSIST CURRENT/MAX"
// ---------------------------------------------------------------------------
// This is the spell-slot precedent, deliberately reused rather than
// reinvented: `expendedSlots` never stores a slot's maximum, only how many
// are spent, because the maximum is ALWAYS Rules Engine output
// (`table:spellcasting.slots_full` etc.) and storing a second copy of it
// would let a stale character disagree with a repinned/leveled-up package
// about its own maximum. The exact same argument applies to every other
// Resource: a Barbarian's Rage maximum changes at levels 3/6/12/17 (a
// `table:` lookup), and a GM who edits that table (or re-levels the
// character) must see the new maximum on the very next Sheet read, with
// nothing to migrate on this side. Persisting `current`/`max` together
// would require a write every time a Resource's package-declared maximum
// changes for ANY reason, including ones nothing on the character's own
// record caused -- exactly the "silently diverges" failure
// character-actor-bridge.ts's own header warns ActorState itself must never
// risk, generalized one layer over from Values to Resources.
//
// ---------------------------------------------------------------------------
// WHAT IS STORED, AND WHAT IS DELIBERATELY NOT
// ---------------------------------------------------------------------------
// Exactly one fact per acquired resource: how many units are currently
// spent. Never a label (the Resource Definition's own `label` is the single
// source of that), never a maximum (Rules Engine `evaluate()` output,
// server/utils/character-derived.ts), never a recovery rule (the Resource
// Definition's own `recovery`, package-authored). This file is pure
// persisted-fact bookkeeping, identical in spirit to `expendedSlots` --
// nothing here computes a maximum, resolves a Definition, or decides
// whether a character has even acquired a given resource (that is
// `character-actor-bridge.ts`'s `acquiredResourceIds`, built from the
// character's own facets/progression, entirely independent of this file).

import type { DefinitionId } from '../rules/types'

export type StoredCharacterResources = {
  // Resource Definition id -> count currently expended. An absent key means
  // zero expended, not "unknown" -- the same "absence is legal" reading
  // `expendedSlots` already establishes. Deliberately keyed by the stable
  // DefinitionId (never a display label, never a class/feature name) --
  // Package Identity requirement: the durable key for a Rules Definition is
  // its DefinitionId, mirroring every other persisted reference in this
  // codebase (ContentRef's own packageId+slug, a progression choiceKey's
  // own stable ChoiceSet id).
  expended: Record<DefinitionId, number>
}

export function emptyCharacterResources(): StoredCharacterResources {
  return { expended: {} }
}

function normalizeExpended(value: unknown): Record<DefinitionId, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const result: Record<DefinitionId, number> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key) continue
    const count = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(count) || count <= 0) continue
    result[key] = Math.trunc(count)
  }
  return result
}

// Re-validated on read, never trusted -- the same posture
// normalizeStoredSpellcasting already takes. UNRESOLVED RESOURCE IDS: a key
// naming a Definition the active package no longer declares is NOT
// filtered out here -- this function is STRUCTURAL ONLY (does this look
// like a map of id -> positive integer?), exactly the same boundary
// normalizeStoredRulesChoices draws for the identical reason (see that
// module's own Phase 2A.1 header on why a registry-aware decision does not
// belong in a pure, registry-free normalizer). Whether a key still
// resolves against the CURRENT active package is decided downstream, where
// the registry is actually available -- see character-derived.ts's own
// resource-resolution loop, which silently skips an expended entry whose
// id no longer resolves to a real `kind: 'resource'` Definition, rather
// than crashing or guessing.
export function normalizeStoredResources(value: unknown): StoredCharacterResources | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  return { expended: normalizeExpended(input.expended) }
}

// ---------------------------------------------------------------------------
// Mutations -- pure, total, and the only place this shape changes. Mirrors
// expendSlot/restoreSlot (spellcasting.ts) exactly, generalized from a
// numeric slot level to a DefinitionId key.
// ---------------------------------------------------------------------------

// A no-op past `max` -- the disabled-button-guards-the-action shape every
// sibling mutation in this family already uses. `max` is the caller's own
// already-evaluated Rules Engine output (this module never evaluates
// anything itself).
export function expendResource(
  expended: Record<DefinitionId, number>,
  resourceId: DefinitionId,
  max: number,
  amount = 1
): Record<DefinitionId, number> {
  if (amount <= 0) return { ...expended }
  const current = expended[resourceId] ?? 0
  if (current >= max) return { ...expended }
  const next = Math.min(max, current + amount)
  return { ...expended, [resourceId]: next }
}

export function restoreResource(
  expended: Record<DefinitionId, number>,
  resourceId: DefinitionId,
  amount = 1
): Record<DefinitionId, number> {
  if (amount <= 0) return { ...expended }
  const current = expended[resourceId] ?? 0
  if (current <= 0) return { ...expended }
  const next = Math.max(0, current - amount)
  const result = { ...expended }
  if (next === 0) delete result[resourceId]
  else result[resourceId] = next
  return result
}

// LEVEL SCALING / MAX-CHANGE SAFETY -- "expended > reduced max normalizes
// safely" (this phase's own explicit requirement). Never produces a
// negative `remaining`: when a package change or a level-down-adjacent
// event leaves `expended` above the CURRENT authoritative `max`, this clamps
// the value this function returns down to `max` -- it does NOT rewrite the
// stored record (persistence is untouched; the next real expend/restore/
// recovery write naturally re-saves a clamped value). Called by
// character-derived.ts on every read, exactly mirroring how a stored
// ability-score/choice answer is always re-validated against the CURRENT
// package rather than trusted, never by a background migration job.
export function clampExpendedToMaximum(expended: number, max: number): number {
  if (!Number.isFinite(max) || max < 0) return 0
  return Math.min(Math.max(0, expended), max)
}

// REST RECOVERY -- the generic trigger-driven reset this phase's own REST
// INTEGRATION section requires: "resolve character resources -> inspect
// package recovery declarations -> apply recovery -> persist," with ZERO
// resource-id or class-name branching here. `amount: 'full'` zeroes the
// entry outright; a numeric amount reduces it by that many (never below
// zero), reusing `restoreResource`'s own clamping for the identical reason.
// A resource with NO recovery rule for this trigger is left completely
// untouched -- "Short Rest does NOT recover a Long-Rest-only resource" is
// not a special case this function detects, it is simply the absence of a
// matching rule.
export function applyResourceRecovery(
  expended: Record<DefinitionId, number>,
  recoveries: readonly { resourceId: DefinitionId; amount: 'full' | number }[]
): Record<DefinitionId, number> {
  let next = { ...expended }
  for (const { resourceId, amount } of recoveries) {
    if (amount === 'full') {
      if (resourceId in next) {
        const { [resourceId]: _removed, ...rest } = next
        next = rest
      }
      continue
    }
    next = restoreResource(next, resourceId, amount)
  }
  return next
}
