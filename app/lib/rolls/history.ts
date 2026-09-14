// Roll System -- pure roll-list operations. Eldra Roll System Phase 2D
// (realtime broadcast, .github/docs/architecture/eldra-roll-system.md §10).
//
// `useWorldRolls.ts` inserts a new RollEventRecord into `history` from TWO
// places -- a POST /rolls response, and an SSE broadcast of a roll (its
// own, echoed back by the server, or another player's `table` roll) --
// and Phase 2D's own CLIENT section is explicit: "Do not duplicate
// insertion logic." This is the one function both call.
//
// Pure, zero I/O, zero Vue reactivity -- matches this file's siblings
// (types.ts, dice-adapter.ts, format.ts) in being independently testable
// under plain Vitest, without a component-rendering harness this repo
// does not have.

import type { RollEventRecord } from './types'

// Prepends `roll` unless a roll with the same id is already present --
// the server broadcasts a `table` roll to EVERY connected client for a
// World, including the one that just requested it, so the requester's own
// POST response and its own SSE echo of that exact roll must collapse
// into a single history entry, never two (Phase 2D's own "duplicate
// suppression" testing requirement). Returns the SAME array reference
// unchanged for a duplicate, rather than a needless copy.
export function prependUniqueRoll(history: RollEventRecord[], roll: RollEventRecord): RollEventRecord[] {
  if (history.some((existing) => existing.id === roll.id)) return history
  return [roll, ...history]
}
