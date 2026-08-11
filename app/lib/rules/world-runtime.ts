// World Package Activation -- pure orchestration.
// See .github/docs/architecture/world-configuration.md §7 ("Runtime Flow")
// for the design this implements. §7's flow diagram is, verbatim, this
// module's entire job:
//
//   resolveWorldConfig(manifest, stored) -> { snapshot, ... }
//   RulesRegistry.create(definitions)
//   DependencyGraph.build(registry)
//   new EvaluationSession(registry, graph, actorState, { world: snapshot })
//
// World Configuration Commit 3 (world-config.ts) implemented the first
// step. World Configuration Commit 4 (rules-package.ts) implemented the
// middle two, bundled behind `loadRulesPackage`. This commit wires those
// two already-complete, already-tested functions together into the one
// call a future World activation path will actually make:
// `resolveWorldConfig` first, its output fed straight into
// `loadRulesPackage`. It adds no new capability -- only the sequencing.
//
// It performs NO I/O (no fetch, no file read, no Directus), NO
// persistence, and NO validation beyond what the two composed functions
// already perform themselves. `createWorldRuntime` is intentionally the
// smallest possible function that could plausibly be called "an
// orchestration": two calls, one dependency between them, nothing else.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. `createWorldRuntime` takes `(manifest, definitions, worldId, stored)`
//    -- a `worldId: string` parameter this task's own INPUT section does
//    not list alongside `RulesPackageManifest` / `Definition[]` /
//    `StoredWorldRulesConfig | null`. It is included anyway because
//    `resolveWorldConfig` -- the function this commit is explicitly told
//    to compose, unchanged -- has required a `worldId` as its own middle
//    parameter since Commit 3, for a reason that does not go away here:
//    `WorldConfigSnapshot.worldId` is mandatory, but `stored` can be
//    `null` (an unconfigured World being previewed), so there is no
//    `worldId` to read off `stored` in that case (world-config.ts design
//    decision 6). This task's INPUT list is the same shape as
//    world-configuration.md §6.3's own `resolveWorldConfig(manifest,
//    stored)` two-argument sketch, which Commit 3 already found
//    incomplete for the identical reason and resolved the identical way.
//    Omitting `worldId` here would mean either (a) this function cannot
//    call `resolveWorldConfig` at all when `stored` is `null`, or (b)
//    inventing a placeholder `worldId` (`stored?.worldId ?? ''`, or
//    similar) -- silently fabricating campaign identity, which is exactly
//    the kind of invented behavior the FAILURE MODEL section's "do not
//    invent new validation" spirit rules out one layer up from validation
//    itself. Passing it through explicitly is the only option that adds
//    no invented behavior.
//
// 2. Returns `RulesPackageLoadResult` (rules-package.ts) verbatim -- not a
//    new, orchestration-specific Result type. `resolveWorldConfig` is
//    TOTAL (Commit 3: "never throws... a well-formed result for every
//    input, including `stored: null`") -- it returns a `ResolvedWorldConfig`
//    directly, never a Result union, so it contributes no failure mode to
//    propagate. `loadRulesPackage` is therefore the ONLY step in this
//    composition that can fail, and its `RulesPackageLoadResult` (`{ ok:
//    true; runtimePackage } | { ok: false; stage; errors }`) already says
//    everything a caller needs: which stage failed and that stage's own
//    already-defined errors, unchanged. Wrapping it in a second type here
//    would rename the same two branches for no reason and would cut
//    against this commit's own "Do not duplicate logic. Compose existing
//    functions" instruction.
//
// 3. No `try`/`catch`, no defensive check that `resolveWorldConfig`
//    "might" fail. Per decision 2, it structurally cannot -- adding a
//    branch for a failure mode that does not exist in the current
//    contract would be inventing behavior the architecture never asked
//    for, which is precisely what the FAILURE MODEL section forbids
//    ("Do not invent new validation"). If a future commit ever gives
//    `resolveWorldConfig` a real failure path, that is a breaking change
//    to Commit 3's own contract and belongs in a commit that touches
//    world-config.ts, not here.
//
// 4. No caching, no memoization keyed on `(packageId, worldId, ...)`.
//    Every call fully re-resolves and re-loads, exactly matching this
//    commit's own IMMUTABILITY section ("Every World change creates a new
//    runtime package") and NON-GOALS ("Do not implement: ... Caching").
//    A cache is meaningful only once there is I/O to avoid repeating; this
//    function has none.

import { loadRulesPackage, type RulesPackageLoadResult } from './rules-package'
import { resolveWorldConfig } from './world-config'
import type { Definition, RulesPackageManifest, StoredWorldRulesConfig } from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// world-configuration.md §7's runtime flow, steps 1-3, composed: resolve
// the World's configuration against the package manifest, then load the
// runtime package (Registry + DependencyGraph) with that resolution
// attached. This is the one call a future World activation path makes --
// see the file header. Pure, total-except-for-`loadRulesPackage`'s-own-
// failure-modes, never throws.
export function createWorldRuntime(
  manifest: RulesPackageManifest,
  definitions: readonly Definition[],
  worldId: string,
  stored: StoredWorldRulesConfig | null
): RulesPackageLoadResult {
  const worldConfig = resolveWorldConfig(manifest, worldId, stored)
  return loadRulesPackage(manifest, definitions, worldConfig)
}
