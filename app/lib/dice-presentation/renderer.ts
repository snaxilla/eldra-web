// Eldra Dice Presentation Layer -- the renderer seam. Roll System
// Phase 3A. THIS FILE HAS NO IMPLEMENTATION. It exists so Phase 3B (or
// whichever later phase actually adopts a 3D dice library) has an
// already-designed, already-reviewed contract to implement against,
// instead of inventing one under the pressure of also wiring a real
// renderer at the same time -- the exact reason app/lib/rolls/dice-adapter.ts
// exists as its own file, separate from the route that first needed it.
//
// DOCUMENTING EXACTLY WHERE A RENDERER PLUGS IN: `useDiceAnimationQueue.ts`
// (the animation host) accepts a `DiceRendererAdapter | null` via its
// `setRenderer()` function. When none is registered -- true for the
// entire lifetime of Phase 3A, since this phase installs no renderer
// library at all -- the queue runs its own built-in placeholder timing
// instead (a plain, tasteful CSS fade/scale, see WorldDiceAnimation.vue).
// The day a real adapter is registered, EVERY existing call site
// (useWorldRolls.ts's `enqueue()` calls, WorldDiceStage.vue's own
// rendering) needs zero changes -- this is the entire point of the seam
// existing now, before there is anything on the other side of it.
//
// NO THIRD-PARTY RENDERER TYPE MAY CROSS THIS BOUNDARY. A real
// implementation of this interface (e.g. one wrapping `@3d-dice/dice-box`,
// the library EldraDiceBox.client.vue already uses for the OLDER,
// Rules-Engine RollEvent pipeline -- see that file's own header) is
// exactly where a `DieGroup`/`RollResult`-shaped OpenDice value gets
// translated into this document's own `RollEventRecord` shape, or where a
// dice-box `.roll()` call gets issued and awaited -- never the other way
// around, and never visible to anything that imports from
// app/lib/dice-presentation/** itself.

import type { DiceAnimationRequest } from './types'

export interface DiceRendererAdapter {
  // Prepares whatever the renderer needs before its first `play()` --
  // loading assets, mounting a canvas, warming a WebGL context. May be a
  // no-op for a renderer with nothing to preload. Called once, lazily, by
  // the animation host before the first request it actually needs to
  // render (mirroring EldraDiceBox.client.vue's own `prewarmDiceBox`
  // idle-callback convention, without adopting its implementation).
  prepare(): Promise<void>

  // Plays the animation for ONE already-decided result and resolves once
  // it is visually complete. The adapter is never asked to decide
  // anything -- `request.roll` is already the final, authoritative total,
  // dice, and modifier; a real implementation may run physics or any
  // other spectacle purely for show, exactly as EldraDiceBox.client.vue's
  // own `rollResult()` already documents doing for the older pipeline
  // ("the individual tumbling dice may visually settle on different pips
  // than the authoritative result reports... its own settled values are
  // never read, trusted, or displayed anywhere").
  play(request: DiceAnimationRequest): Promise<void>

  // Releases whatever `prepare()`/`play()` allocated (a mounted canvas, a
  // physics world, event listeners) -- called when the animation host
  // itself is torn down (e.g. WorldDiceOverlay.vue unmounting).
  dispose(): void
}
