// useDiceRendererMode -- a SIMPLE, DEVELOPMENT-ONLY selector for which
// DiceRendererAdapter WorldDiceOverlay.vue registers with the shared
// animation queue. Roll System Phase 4B.1 (Authored Three.js d20 Proof of
// Concept, ADR-024 Option 2); narrowed by this phase's own deployment fix
// (see that fix's own summary for the full root-cause account).
//
// EXTENDS, RATHER THAN REPLACES, PHASE 4B'S OWN FLAG MECHANISM. Phase 4B
// introduced `useAuthoredDiceRendererFlag()` -- a plain boolean choosing
// between the physics renderer and its own CSS/DOM proof of concept. That
// composable is gone (not merely deprecated) -- Phase 4B.1's own FEATURE
// FLAG / COMPARISON section is explicit: "If the current Phase 4B flag is
// the right mechanism, extend/reuse it rather than inventing another flag
// system." This is the SAME single mechanism (one `useState`, one call
// site in WorldDiceOverlay.vue, one dev-facing control in
// AdminRollSandbox.vue), not a second, competing flag system.
//
// TWO FULL RENDERER IMPLEMENTATIONS COEXIST, UNCONDITIONALLY:
//   'physics'        -- WorldDiceThreeRenderer.client.vue /
//                        worldDiceThreeRendererAdapter.ts. UNCHANGED,
//                        still fully selectable for comparison or rollback.
//   'authored-three' -- WorldAuthoredThreeDiceRenderer.client.vue /
//                        worldAuthoredThreeDiceRendererAdapter.ts. Phase
//                        4B.1's own renderer (ADR-024 Option 2), THE
//                        DEFAULT as of the Phase 4B.3 deployment repair
//                        (see this file's own header, below, for why).
//
// WHY THERE IS NO THIRD `'authored-css'` MODE HERE. Phase 4B's own CSS/DOM
// proof of concept (`WorldAuthoredDiceRenderer.vue`) was never committed
// to git -- it existed only as an untracked working-tree file. This
// composable, and WorldDiceOverlay.vue's own registration logic, briefly
// carried a THIRD `'authored-css'` mode that imported that uncommitted
// component directly, which made a from-git production build fail with
// `ENOENT` (Dokploy builds from a fresh checkout of git HEAD; local builds
// kept passing only because the untracked file was still sitting on the
// developer's own disk). Proven directly via `git ls-tree`/`git status`
// during this phase's own deployment-fix audit, not merely suspected.
// Removing the mode (rather than committing the rejected CSS renderer
// just to satisfy the import) is the fix: committed code must only ever
// depend on committed code. The CSS renderer's design lesson and tests
// remain available locally/in conversation history if useful later: see
// WorldDiceOverlay.vue's own header for the fuller account, including why
// re-adding it as a real mode is a distinct, future, "commit it for real
// first" decision, not an automatic consequence of the file still
// existing somewhere.
//
// `useDiceAnimationQueue.ts` only ever holds ONE registered renderer at a
// time (`setRenderer()` replaces, never adds) -- this mode is what
// decides which one that is; it does not mean the other stops existing or
// stops working.
//
// A plain `useState`, matching this codebase's own established pattern
// for cross-component/SSR-safe shared toggles (`world-workspace.vue`'s
// own `mode`/`showPins`) -- no persistence, no cookie, no server round
// trip: choosing a mode is a developer action for the current browser tab
// only.
//
// PHASE 4B.3 DEPLOYMENT REPAIR -- DEFAULT PROMOTED TO 'authored-three'.
// From Phase 4B.1 through Phase 4B.3, this default stayed `'physics'` so
// nobody who never touched this control saw any behavior change while the
// authored renderer was still an unreviewed proof of concept. Phase 4B.3
// (charcoal/gold skin, hardened show/hide lifecycle) was implemented,
// reviewed, and approved -- but this default was never flipped as part of
// that approval, so a normal player's roll (and the reviewer's own
// post-deploy browser check) kept registering the OLD `'physics'`
// renderer instead, which is a completely separate, untouched
// implementation with its own pale `theme_colorset: 'white'` die and its
// own independent show/hide logic. Neither of Phase 4B.3's two
// accepted, observable changes could ever appear in an ordinary browser
// session while this default pointed at the other renderer -- this was
// the FIRST point production diverged from the accepted implementation,
// traced and proven (not guessed) during this repair: git HEAD and the
// production bundle both contain Phase 4B.3 correctly; only this
// selection default stood between them and an ordinary roll. `'physics'`
// remains fully implemented and selectable below, for comparison or as
// an instant rollback, exactly as it always was.
export type DiceRendererMode = 'physics' | 'authored-three'

export function useDiceRendererMode() {
  return useState<DiceRendererMode>('dice-renderer-mode', () => 'authored-three')
}
