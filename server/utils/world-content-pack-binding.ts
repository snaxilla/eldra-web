// World <-> Content Pack Binding -- business logic.
// See .github/docs/architecture/ownership-and-permissions.md (Revision 2)
// §7.5 ("installing a pack is a Platform action; binding one to a world is
// a World action") and this task's own DESIGN GOAL: mirror
// server/utils/world-rules-activation.ts's split between verification
// (loadPublishedPackage) and persistence (saveWorldRulesConfig),
// generalized to Content Packs' many-bindings-per-world shape.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. bindContentPackToWorld performs ZERO of its own verification.
//    loadPublishedContentPack (server/utils/content-packs.ts) ALREADY
//    checks status and integrity -- that is its entire job. If it fails
//    for any reason, binding rejects without writing anything, exactly
//    like activateWorldRulesPackage's own rejection posture.
//
// 2. Unlike activateWorldRulesPackage, there is no "resolved runtime
//    summary" to return after a successful bind -- content resolution is
//    explicitly out of scope for this phase (task NON-GOALS), so there is
//    no equivalent of getWorldRuntime/summarizeWorldRuntime to compose
//    here. A successful bind returns the binding record itself; nothing
//    more exists yet to build on top of it.
//
// 3. No activation-style "switch gate" (rules-package-infrastructure.md
//    §A.2's actor_rules_state-protected gate). Nothing analogous to actor
//    state exists for Content Packs in this phase, and binding is
//    additive (a World may hold many bindings) rather than exclusive (one
//    active package) -- repinning one binding's version has no
//    cross-binding effect to gate against.
//
// 4. No HTTP concerns here (no createError, no status codes) -- pure
//    discriminated results, exactly like world-rules-activation.ts, so
//    this stays fully unit-testable without a Nuxt/H3 runtime. The API
//    route is the only place that translates a rejection into an HTTP
//    status.

import { loadPublishedContentPack, type ContentPackLoadFailure } from './content-packs'
import {
  removeContentPackBinding,
  saveContentPackBinding,
  type WorldContentPackBindingRecord
} from './world-content-packs'

export type ContentPackBindResult =
  | { bound: false; stage: 'package-load'; failure: ContentPackLoadFailure }
  | { bound: true; binding: WorldContentPackBindingRecord }

// Binds a World to a published (packageId, version), or repins an existing
// binding to a different version of the same package. Rejects (writes
// nothing) if the pack is missing, draft, or integrity-mismatched -- see
// design decision 1.
export async function bindContentPackToWorld(
  worldId: string | number,
  packageId: string,
  version: string
): Promise<ContentPackBindResult> {
  const packResult = await loadPublishedContentPack(packageId, version)

  if (!packResult.ok) {
    const { ok: _ok, ...failure } = packResult
    return { bound: false, stage: 'package-load', failure }
  }

  const binding = await saveContentPackBinding(worldId, packResult.package.packageId, {
    version: packResult.package.version,
    integrity: packResult.package.integrityHash
  })

  return { bound: true, binding }
}

export type ContentPackUnbindResult =
  | { unbound: false; stage: 'not-bound' }
  | { unbound: true }

// Removes a World's binding to a Content Pack. Reports `unbound: false`
// (never a throw) if the World was never bound to that packageId --
// mirrors updateWorldRulesConfig's "never silently succeed on nothing to
// do" posture, generalized to a removal instead of an update.
export async function unbindContentPackFromWorld(
  worldId: string | number,
  packageId: string
): Promise<ContentPackUnbindResult> {
  const removed = await removeContentPackBinding(worldId, packageId)
  return removed ? { unbound: true } : { unbound: false, stage: 'not-bound' }
}
