// Cast Capability -- Character Sheet Body Phase 1B.2 (Authoritative Cast
// Foundation).
//
// The one predicate BOTH the client (CharacterActionsPanel.vue, deciding
// whether a spell row gets the Cast affordance at all) and the server
// (server/utils/character-cast.ts, deciding whether to actually execute)
// use to answer "can Phase 1B.2 honestly execute this spell." Pure and
// zero-I/O, mirroring app/lib/content-actions/attack-capability.ts's own
// `isAttackCapableAction` exactly -- restated on both sides of the
// app/server boundary would be exactly the kind of drift that file's own
// header warns against, and this task's own explicit instruction ("the UI
// and server should consume the SAME canonical capability logic... do not
// allow the client and server to independently invent different support
// rules") makes that precedent binding here too.
//
// A function of `CanonicalSpellMechanics` ALONE, never of a spell's name,
// id, or raw source data -- this is the one place "is this spell
// castable yet" is decided, and it decides it from Eldra's own normalized
// facts, never by asking "is this Fire Bolt."

import type { CanonicalSpellMechanics } from './types'

// A closed, exhaustive classification -- every kind Phase 1B.2 and its
// immediate successors need a name for, not a boolean. `supported-*`
// members are the only ones this phase's Cast runtime will execute;
// every `unsupported-*` member exists so a caller can say WHY, not just
// "no" -- both for an honest UI (§ "UNSUPPORTED SPELL UX") and for a
// future phase to know which bucket it is closing.
export type SpellCastCapability =
  | { kind: 'supported-spell-attack' }
  | { kind: 'supported-automatic-damage' }
  | { kind: 'unsupported-save' }
  | { kind: 'unsupported-healing' }
  | { kind: 'unsupported-effect' }
  | { kind: 'unsupported-choice' }
  | { kind: 'unsupported-mechanic' }

// `null` for anything that is not even a spell action (weapon/unarmed/
// species/class/background) -- mirroring `isAttackCapableAction`'s own
// "wrong category" early return, except this predicate answers a
// three-or-more-way question, so `null` (not `false`) is the honest "not
// applicable" result. A spell with no resolved `spellMechanics` at all
// (an unpublished/broken Content Pack reference, or a homebrew entry with
// no canonical shape yet) is `unsupported-mechanic` -- absence of data is
// exactly as unexecutable as data this phase does not yet understand.
export function classifySpellCastCapability(
  // `category` is typed as a plain string, not imported from
  // app/lib/content-actions/types.ts's own `ActionCategory` -- this
  // module only ever compares it to the one literal it cares about
  // ('spell'), the same "restate rather than cross-import a sibling's
  // type for one string comparison" discipline this codebase already
  // applies elsewhere (e.g. worldAuthoredThreeDiceRendererAdapter.ts's
  // own header).
  action: { category: string; spellMechanics?: CanonicalSpellMechanics | null }
): SpellCastCapability | null {
  if (action.category !== 'spell') return null

  const mechanics = action.spellMechanics
  if (!mechanics) return { kind: 'unsupported-mechanic' }

  // Checked BEFORE resolution kind, on purpose: an unresolved source
  // choice (Chromatic Orb's damage type) makes a spell unexecutable
  // regardless of whether its RESOLUTION shape looks supported. This
  // phase's own explicit preference is the whole spell staying
  // referenceable-but-uncastable, not a half-working Attack with no
  // Damage -- see this module's own file header and the task's own
  // CHROMATIC ORB section.
  if (mechanics.hasUnresolvedChoice) return { kind: 'unsupported-choice' }

  if (mechanics.resolution?.kind === 'attack-roll') {
    return { kind: 'supported-spell-attack' }
  }

  if (mechanics.resolution?.kind === 'saving-throw') {
    return { kind: 'unsupported-save' }
  }

  if (mechanics.resolution?.kind === 'automatic') {
    if (mechanics.damage) return { kind: 'supported-automatic-damage' }
    if (mechanics.healing) return { kind: 'unsupported-healing' }
    return { kind: 'unsupported-mechanic' }
  }

  // `resolution === null` -- no attack, no save, no automatic damage.
  // Still distinguished from "healing" for the day `healing` actually
  // gets populated (1B.4): a spell whose ONLY resolved mechanic is
  // healing reports that specifically, rather than the generic
  // "effect-only" bucket every other utility/buff spell (Shield, Bless)
  // falls into today.
  if (mechanics.healing) return { kind: 'unsupported-healing' }
  return { kind: 'unsupported-effect' }
}
