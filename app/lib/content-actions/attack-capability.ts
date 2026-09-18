// Attack/Damage roll capability -- Character Sheet Body Phase 1A
// (Authoritative Attack + Damage Rolls).
//
// The one predicate both the client (CharacterActionsPanel.vue, deciding
// whether to show Attack/Damage controls at all) and the server
// (server/utils/character-actions.ts's `resolveAttackAction`, deciding
// whether to actually roll) use to answer "is this a weapon or unarmed
// attack this phase can roll." Pure and zero-I/O, matching this directory's
// own `types.ts` -- restated on both sides of the app/server boundary would
// be exactly the kind of drift `content-actions/types.ts`'s own header
// warns against elsewhere.
//
// Spell actions (`category: 'spell'`, including a spell attack roll,
// `resolution.attackKind === 'spell'`) are deliberately excluded -- Phase 1A
// scope is weapon/unarmed only; spell attack/save resolution stays on the
// existing Combat Resolution "Resolve" control (server/utils/character-combat.ts),
// untouched by this phase.

import type { ActionCategory, ActionResolution } from './types'

export function isAttackCapableAction(action: {
  category: ActionCategory
  resolution?: ActionResolution
}): boolean {
  const isWeaponOrUnarmed = action.category === 'weapon' || action.category === 'unarmed'
  return (
    isWeaponOrUnarmed &&
    action.resolution?.kind === 'attack-roll' &&
    (action.resolution.attackKind === 'melee' || action.resolution.attackKind === 'ranged')
  )
}
