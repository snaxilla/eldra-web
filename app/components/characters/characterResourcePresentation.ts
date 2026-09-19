// Character Resource Presentation -- Character Sheet Caster Pass 0.1.
//
// PRESENTATION ONLY. This file introduces exactly one thing: a small,
// game-agnostic VIEW MODEL a Character Sheet can render any number of
// trackable resource pools through (Spell Slots today; Sorcery Points,
// Bardic Inspiration, Rage, Ki, or any future rules-package resource
// later) -- and one adapter that produces it from the ONE resource this
// codebase actually has today, `slotLevels`.
//
// Extracted into a plain module beside its consuming components, the same
// reason characterDerivedValues.ts already gives (a `<script setup>` block
// cannot export a type; a shape shared across components needs a real
// module).
//
// ---------------------------------------------------------------------------
// WHY THIS IS PRESENTATION-ONLY, NOT A NEW PERSISTENCE MODEL
// ---------------------------------------------------------------------------
// `CharacterResourceGroup`/`CharacterResourcePool` below are never stored,
// never sent to a server, and never read back. They exist purely so a
// renderer can loop over "some pools, each with a max and an expended
// count" without caring whether that data came from Spell Slots, Pact
// Magic, or a resource that does not exist in this codebase yet. The
// PERSISTED shape spell slots actually use -- `expendedSlots: Record<string,
// number>` (app/lib/characters/spellcasting.ts), read through
// useCharacterSheet.ts's own `slotLevels` computed (Rules Engine Table rows
// + that persisted record) -- is completely unchanged by this file. This
// module only ever RESHAPES already-derived numbers for rendering; it
// computes no maximum, expends nothing itself, and owns no mutation.
//
// This is the deliberate scope boundary this task draws: generalize the
// PRESENTATION contract now (multiple resource groups, multiple pools per
// group, orbs that don't assume "1-9 spell levels") because the RENDERING
// problem (a caster's header growing unpredictably) is real today. Do NOT
// generalize PERSISTENCE (no `resources: Record<string, ...>` schema, no
// migration of `expendedSlots`) because exactly ONE resource model exists
// to generalize FROM -- a second and third real implementation (Sorcery
// Points, Rage, ...) will supply the evidence a persistence-layer
// abstraction needs to be designed correctly, not imagined ahead of time.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE DOES NOT KNOW
// ---------------------------------------------------------------------------
// No spell level range (1-9), no class name, no resource name
// ("Sorcery Points"/"Rage"), no rest-recovery rule, and no rule about which
// resources share a pool under multiclassing. Every one of those facts
// belongs to the active rules/content package and whatever future adapter
// reads its output -- this module only shapes `{max, expended}` numbers a
// caller already computed into something a generic orb renderer can loop
// over.

// One trackable pool of consumable units within a resource group -- a
// single spell level, a Ki pool, a Rage pool, etc. `id` is stable across
// re-renders (used for :key and for routing an orb click back to the right
// pool) but carries no meaning a renderer is allowed to parse -- it is an
// opaque identifier, not a spell level number to compute with.
export type CharacterResourcePool = {
  id: string
  // Absent when a group has exactly one undifferentiated pool (e.g. a
  // future single-pool Sorcery Points resource) -- there is nothing useful
  // to label beyond the group's own label in that case.
  label?: string
  max: number
  expended: number
  // Whether clicking an orb may expend/restore a unit. `true` for every
  // pool this phase produces; kept explicit (not assumed) because a FUTURE
  // resource might be read-only from this surface (e.g. a resource only a
  // future Cast action can spend, never a manual click).
  adjustable: boolean
}

// One labeled group of pools -- "Spell Slots" (one pool per spell level
// present), or, in the future, "Sorcery Points" (one pool) or "Ki" (one
// pool). A character with no groups renders nothing (see
// CharacterResourceOrbs.vue's own v-if) -- there is no placeholder
// "Resources" container for a non-caster.
export type CharacterResourceGroup = {
  id: string
  label: string
  pools: CharacterResourcePool[]
}

// ---------------------------------------------------------------------------
// The one adapter this phase ships: Spell Slots -> Character Resources.
// ---------------------------------------------------------------------------
// Reshapes useCharacterSheet.ts's existing `slotLevels` (already Rules
// Engine-derived, already computed -- see that composable's own header)
// into the generic shape above. Computes nothing about spellcasting: no
// slot maximum, no level range, no recovery rule. A slot level becomes a
// pool labeled "L<n>"; the pool's stable `id` is the level number itself
// (a naturally stable, already-meaningful identifier -- not a spell-domain
// fact a caller needs to decode, just a string a click handler can parse
// back into the same `number` `expend-slot`/`restore-slot` already expect).
//
// Returns an EMPTY array for a non-caster (or a caster with no levels this
// character currently has) -- never a group with zero pools, so a renderer
// never has to invent an empty-state message for "Spell Slots" specifically.
// ---------------------------------------------------------------------------
// Orb rendering rules -- pure, shared with CharacterResourceOrbs.vue.
// ---------------------------------------------------------------------------
// Extracted here (rather than left inline in the component's own
// `<script setup>`) for the same reason every OTHER pure rule in this
// family lives in a plain module: this repo's Vitest setup has no Vue
// component-rendering harness, so a rule worth testing has to be a plain
// function a test can call directly. These two are the entire "ordering
// and accessible naming" contract CharacterResourceOrbs.vue renders
// through -- nothing else in that component is meaningfully testable
// without mounting it.

// AVAILABLE-FIRST, EXPENDED-LAST -- this task's own explicit convention
// (max 4/expended 1 -> "three available, one expended", in that visual
// order). `position` is the 1-indexed orb slot being rendered; it is NEVER
// a stored identity -- a pool's `expended` COUNT is the only authoritative
// fact, so this function answers "is the orb at this POSITION currently in
// the available zone", not "is orb #N specifically spent."
export function isResourceUnitAvailable(
  pool: Pick<CharacterResourcePool, 'max' | 'expended'>,
  position: number
): boolean {
  return position <= pool.max - pool.expended
}

// One accessible name per orb, used as BOTH the button's `aria-label` and a
// redundant `sr-only` span (CharacterResourceOrbs.vue's own header
// explains why both -- V1's weaker pip UIs relied on `title` alone).
// States "available"/"expended" in words, never color alone.
export function resourceUnitAriaLabel(
  groupLabel: string,
  pool: Pick<CharacterResourcePool, 'label' | 'max' | 'expended'>,
  position: number
): string {
  const poolLabel = pool.label ? `${pool.label} ` : ''
  const state = isResourceUnitAvailable(pool, position) ? 'available' : 'expended'
  return `${groupLabel} ${poolLabel}unit ${position} of ${pool.max}: ${state}`
}

export function spellSlotsToCharacterResources(
  slotLevels: readonly { level: number; max: number; expended: number }[]
): CharacterResourceGroup[] {
  if (!slotLevels.length) return []

  return [
    {
      id: 'spell-slots',
      label: 'Spell Slots',
      pools: slotLevels.map((slot) => ({
        id: String(slot.level),
        label: `L${slot.level}`,
        max: slot.max,
        expended: slot.expended,
        adjustable: true
      }))
    }
  ]
}
