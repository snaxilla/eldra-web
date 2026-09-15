// useDiceRendererMode -- a SIMPLE, DEVELOPMENT-ONLY selector for which
// DiceRendererAdapter WorldDiceOverlay.vue registers with the shared
// animation queue. Roll System Phase 4B.1 (Authored Three.js d20 Proof of
// Concept, ADR-024 Option 2).
//
// EXTENDS, RATHER THAN REPLACES, PHASE 4B'S OWN FLAG MECHANISM. Phase 4B
// introduced `useAuthoredDiceRendererFlag()` -- a plain boolean choosing
// between the physics renderer and its own CSS/DOM proof of concept. That
// composable is gone (not merely deprecated) -- this phase's own FEATURE
// FLAG / COMPARISON section is explicit: "If the current Phase 4B flag is
// the right mechanism, extend/reuse it rather than inventing another flag
// system." A boolean is no longer sufficient once a THIRD renderer exists
// to choose between, and a boolean named `...Enabled` stops making sense
// the moment "enabled" could mean either of two different renderers --
// so the SAME single mechanism (one `useState`, one call site in
// WorldDiceOverlay.vue, one dev-facing control in AdminRollSandbox.vue)
// is kept, widened from a boolean to a three-way mode. This is an
// in-place evolution of last phase's own uncommitted scaffolding, not a
// second, competing flag system living alongside the first.
//
// THREE FULL RENDERER IMPLEMENTATIONS COEXIST, UNCONDITIONALLY, for the
// lifetime of this phase (and, per ADR-024 §13's own migration plan,
// through Phase 4F):
//   'physics'        -- WorldDiceThreeRenderer.client.vue /
//                        worldDiceThreeRendererAdapter.ts. UNCHANGED, the
//                        default, still fully selectable for comparison
//                        (this phase's own ACCEPTANCE GATE item 9).
//   'authored-css'   -- WorldAuthoredDiceRenderer.vue /
//                        worldAuthoredDiceRendererAdapter.ts. Phase 4B's
//                        own CSS/DOM proof of concept. UNCHANGED, RETAINED
//                        (not deleted) -- see WorldDiceOverlay.vue's own
//                        header and this phase's own summary for why:
//                        its purpose (validating the authored-presentation
//                        architecture) is done, but the component and its
//                        exhaustive orientation tests remain genuine,
//                        useful evidence and a genuine three-way
//                        comparison option, not dead code.
//   'authored-three' -- WorldAuthoredThreeDiceRenderer.client.vue /
//                        worldAuthoredThreeDiceRendererAdapter.ts. THIS
//                        phase's own new renderer (ADR-024 Option 2).
//
// `useDiceAnimationQueue.ts` only ever holds ONE registered renderer at a
// time (`setRenderer()` replaces, never adds) -- this mode is what
// decides which one that is; it does not mean the other two stop
// existing or stop working.
//
// A plain `useState`, matching this codebase's own established pattern
// for cross-component/SSR-safe shared toggles (`world-workspace.vue`'s
// own `mode`/`showPins`) -- no persistence, no cookie, no server round
// trip: choosing a mode is a developer action for the current browser tab
// only. Defaults to `'physics'` so nobody who never touches this control
// sees any behavior change from this phase landing.
export type DiceRendererMode = 'physics' | 'authored-css' | 'authored-three'

export function useDiceRendererMode() {
  return useState<DiceRendererMode>('dice-renderer-mode', () => 'physics')
}
