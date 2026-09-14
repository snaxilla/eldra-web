// Eldra Dice Presentation Layer -- Roll System Phase 3A
// (.github/docs/architecture/eldra-roll-system.md §11, and
// adr-023-server-authoritative-gameplay-events.md). Separates GAMEPLAY
// TRUTH (a `RollEventRecord` -- already decided, already persisted, by
// the time anything in this directory ever sees it) from DICE
// PRESENTATION (how that already-decided result gets celebrated on
// screen).
//
// CORE PRINCIPLE, restated as a type-level fact: nothing in this file (or
// anywhere in app/lib/dice-presentation/**) can construct a result. Every
// type here either WRAPS an already-authoritative `RollEventRecord`
// (`DiceAnimationRequest`/`DiceAnimationResult`) or describes PURELY
// presentational state (`DiceAnimationState`) that has no bearing on what
// actually happened. The dice celebrate reality; they never determine it.
//
// SHAPED LIKE app/lib/rolls/dice-adapter.ts's OWN "restate, don't import a
// third party" discipline -- there is no third party to restate FROM yet
// (Phase 3A installs no renderer), but the same posture holds in advance:
// once a real renderer is adopted (Phase 3B), its own result/event shapes
// get adapted INTO these types at the renderer-adapter boundary
// (./renderer.ts), never leaked out of it. Nothing outside
// app/lib/dice-presentation/** and the eventual renderer-adapter
// implementation may import a renderer package directly.

import type { RollEventRecord } from '~/lib/rolls/types'

// One request to animate an already-persisted, already-authoritative
// roll. The overlay consumes ONLY this -- never OpenDice, never a
// Character Sheet action row, never a raw dice notation string. It knows
// nothing about where the roll came from (an ability click, a saving
// throw, a skill check, a future Combat action, another player's `table`
// roll arriving over SSE) -- only that this ONE already-decided result
// should be celebrated.
export type DiceAnimationRequest = {
  // Stable identity for queueing/deduplication -- always the
  // RollEventRecord's own `id`, never separately generated, so a request
  // enqueued twice (e.g. this client's own POST response AND its SSE
  // echo, per Phase 2D's own "duplicate suppression") collapses into one
  // queued animation rather than two.
  id: string
  roll: RollEventRecord
}

// The lifecycle stage the animation HOST (useDiceAnimationQueue.ts) is
// currently in for its `current` request -- see that file's own header
// for the full state machine and this document's own LIFECYCLE section:
//
//   Roll requested        -> enqueue() called (may sit in queue if busy)
//   Roll pending    ('pending')   -> popped off the queue, about to animate
//   Animation begins ('animating') -> the placeholder (or, later, a real
//                                      renderer) is actively playing
//   Animation completes ('complete') -> held briefly so the reveal has a
//                                        beat, then the queue advances
//   (idle) -> nothing queued, nothing animating
//
// "Roll Tray entry becomes visible" and "Overlay clears" are NOT overlay
// states -- they are what the CALLER (useWorldRolls.ts, which owns
// history) does in response to the Promise `enqueue()` resolves with. The
// overlay itself only ever reports these five states.
export type DiceAnimationState = 'idle' | 'pending' | 'animating' | 'complete'

// What `useDiceAnimationQueue().enqueue()` resolves with once a request's
// turn is fully processed. `completed` distinguishes "the dice actually
// played" from "the queue was cleared out from under this request" (e.g.
// the overlay unmounted mid-animation) -- a caller awaiting `enqueue()`
// can tell the difference without a separate error channel, since neither
// case is truly an error: the roll itself is unaffected either way.
export type DiceAnimationResult = {
  id: string
  roll: RollEventRecord
  completed: boolean
}
