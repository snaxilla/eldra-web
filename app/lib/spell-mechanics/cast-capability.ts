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
//
// Character Sheet Body Phase 1B.3 (Saving-Throw Spell Casting) --
// `unsupported-save` is RETIRED (no code path below produces it anymore),
// replaced by two supported kinds. A saving-throw spell's Cast operation
// (validate, consume the selected resource, return the authoritative Save
// DC/ability -- never a caster d20, never a target save, never HP
// mutation) is EQUALLY honest whether or not the spell has damage to roll
// independently afterward: Fireball's Cast is no more or less truthful
// than Hold Person's, only Fireball also gets a row-level Damage control.
// `supported-save-damage` vs `supported-save-context` exists so a consumer
// (CharacterActionsPanel.vue's own `showsIndependentSpellDamage`) can tell
// the two apart without re-deriving `Boolean(mechanics.damage)` itself.
//
// Character Sheet Body Phase 1B.4 (Healing Spell Foundation) --
// `unsupported-healing` is likewise RETIRED. It existed only as a
// placeholder for the day `CanonicalSpellMechanics.healing` became
// reliably populated (1B.1's own explicit deferral); now that it is (see
// app/lib/spell-mechanics/dnd5e.ts's own HEALING header for the
// three-signal evidence), a spell whose immediate healing is structurally
// known is honestly Cast-capable, exactly the same "resource + roll,
// never a fabricated target effect" posture every other supported kind
// already has.
export type SpellCastCapability =
  | { kind: 'supported-spell-attack' }
  | { kind: 'supported-automatic-damage' }
  | { kind: 'supported-save-damage' }
  | { kind: 'supported-save-context' }
  | { kind: 'supported-healing' }
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

  // Character Sheet Body Phase 1B.3: an untargeted, no-caster-d20 Cast is
  // honestly executable for EVERY well-formed saving-throw spell -- the
  // operation only ever claims "spell was cast, resource consumed, here is
  // the authoritative Save DC/ability", never "the target failed" or "the
  // target took damage" (that stays entirely with the existing targeted
  // Resolve control, character-combat.ts, untouched). Whether the spell
  // ALSO exposes an independent Damage roll depends only on whether it has
  // structured damage at all -- see this file's own header.
  if (mechanics.resolution?.kind === 'saving-throw') {
    return mechanics.damage ? { kind: 'supported-save-damage' } : { kind: 'supported-save-context' }
  }

  // Not part of the required 1B.4 corpus (no real spell combines a
  // `{@damage}` automatic-damage roll with a structurally-recognized
  // healing roll), but handled honestly rather than assumed impossible --
  // the same posture `resolveCastConfiguration`'s own "not part of the
  // required corpus" branches already take elsewhere in this family.
  if (mechanics.resolution?.kind === 'automatic') {
    if (mechanics.damage) return { kind: 'supported-automatic-damage' }
    if (mechanics.healing) return { kind: 'supported-healing' }
    return { kind: 'unsupported-mechanic' }
  }

  // `resolution === null` -- no attack, no save, no automatic damage.
  // Character Sheet Body Phase 1B.4: Cure Wounds/Healing Word/Mass Cure
  // Wounds/Mass Healing Word/Prayer of Healing all land here (their own
  // canonical `resolution` is `null` -- pure utility spells with a
  // separately-normalized `healing` roll, never miscoded as 'automatic'
  // just because they resolve something).
  if (mechanics.healing) return { kind: 'supported-healing' }
  return { kind: 'unsupported-effect' }
}
