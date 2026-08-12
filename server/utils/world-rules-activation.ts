// World Rules Activation.
// See .github/docs/architecture/rules-package-infrastructure.md Q6
// ("How should package activation work?") and Q6's own activation
// pseudocode for the design this implements, verbatim:
//
//   load the rules_packages row for (packageId, version)
//   assert status === 'published'                      reject if draft
//   assert engineApiVersion is satisfied by the engine  reject if not
//   recompute integrity; assert it matches integrity_hash   reject if not
//   upsert world_rules_config for this world:
//         active_package_id / active_package_version / active_package_integrity
//         world_config_version += 1
//   return the resolved summary (roll types, gaps, unbound roles)
//
// This module is the write path onto world_rules_config -- activation
// (binding a World to a package) and config updates (settings/roll-type
// overrides on an already-activated World). Nothing here constructs a
// runtime itself; every verification and every summary comes from calls
// to already-built, already-tested modules.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. Activation performs ZERO of its own verification. `loadPublishedPackage`
//    (server/utils/rules-packages.ts) ALREADY checks status === 'published',
//    engineApiVersion compatibility, and integrity -- that is its entire
//    job (see that file's own header). Re-implementing any of those three
//    checks here would be exactly the "duplicate runtime construction"
//    this task's own instruction forbids, one layer earlier. If
//    `loadPublishedPackage` fails for any reason, activation rejects
//    without writing anything -- see `activated: false` below.
//
// 2. Activation performs ZERO of its own runtime construction. After a
//    successful write, the resolved summary comes from
//    `getWorldRuntime`/`summarizeWorldRuntime`
//    (server/utils/world-runtime-service.ts) -- the exact same call the
//    GET /rules/summary route makes. This task's own instruction: "Reuse
//    getWorldRuntime(). Do not duplicate runtime construction."
//
// 3. `activated: true` does NOT imply `summary.ok: true`. The write to
//    world_rules_config can succeed while the resulting runtime is still
//    broken (rules-package-infrastructure.md §5.1's own warning:
//    "configured but broken" must never be hidden). Concretely: nothing in
//    this V1 activation path re-validates a published package's content
//    (Package Validation is a publish-time gate, not re-run here per
//    rules-packages.ts's own "a package that reaches this loader is
//    trusted" stance) -- if a row's content were somehow malformed despite
//    being `status: 'published'`, `getWorldRuntime` would report
//    `ok: false` for the World that just activated it, and this module
//    hands that straight through rather than reporting a false "ready".
//
// 4. Switching an already-activated World to a different package (or a
//    different version of the same package) is UNRESTRICTED in V1 --
//    rules-package-infrastructure.md Q6: "Switching and rolling back are
//    both free... §A.2's own condition evaluating to 'free'" because
//    `actor_rules_state` does not exist yet, so the gate that would
//    protect it has nothing to protect. This is not a loosening of the
//    architecture; it is exactly what the architecture specifies for this
//    milestone. Reset Rules State (a different, destructive operation)
//    ships alongside `actor_rules_state`, not before it -- explicitly out
//    of scope here (NON-GOALS).
//
// 5. Config updates (settings/rollTypes) REQUIRE an existing row.
//    `saveWorldRulesConfig` already refuses to fabricate
//    activePackageId/activePackageVersion for a brand-new row (world-
//    rules-config.ts design decision 3); this module surfaces that as an
//    explicit `updated: false, stage: 'unconfigured'` result checked
//    BEFORE attempting the write (via `loadWorldRulesConfig`), rather than
//    relying on catching a thrown error from the persistence layer --
//    "never silently activate" applies here too: a settings patch must
//    never have the side effect of creating a World's very first
//    configuration.
//
// 6. `world_config_version` is never caller-suppliable, in either
//    function -- both call `saveWorldRulesConfig` with a patch that never
//    includes `worldConfigVersion` (the type does not even allow it; see
//    `WorldRulesConfigPatch`), so the version always comes from
//    `saveWorldRulesConfig`'s own unconditional increment (world-rules-
//    config.ts design decision 4).
//
// 7. No HTTP concerns here (no `createError`, no status codes) -- these
//    functions return pure discriminated results, exactly like
//    rules-packages.ts and world-runtime-service.ts already do, so they
//    are fully unit-testable without a Nuxt/H3 runtime. The two route
//    files (server/api/worlds/[id]/rules/activate.post.ts,
//    config.patch.ts) are the only place that translates a rejection into
//    an HTTP status, matching this codebase's own established convention
//    (server/utils/entity-relationships.ts: routes stay thin, `createError`
//    lives at the boundary that actually needs it).

import { loadPublishedPackage, type PublishedPackageLoadFailure } from './rules-packages'
import { getWorldRuntime, summarizeWorldRuntime, type WorldRulesSummary } from './world-runtime-service'
import { loadWorldRulesConfig, saveWorldRulesConfig } from './world-rules-config'
import type { StoredWorldRulesConfig, WorldRollTypeOverride } from '../../app/lib/rules/types'

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export type WorldRulesActivationResult =
  | { activated: false; stage: 'package-load'; failure: PublishedPackageLoadFailure }
  | { activated: true; summary: WorldRulesSummary }

// Binds a World to a published (packageId, version). Rejects (writes
// nothing) if the package is missing, draft, engine-incompatible, or
// integrity-mismatched -- see design decision 1. On success, upserts
// world_rules_config and returns the freshly resolved summary -- see
// design decisions 2-3.
export async function activateWorldRulesPackage(
  worldId: string | number,
  packageId: string,
  version: string
): Promise<WorldRulesActivationResult> {
  const packageResult = await loadPublishedPackage(packageId, version)

  if (!packageResult.ok) {
    const { ok: _ok, ...failure } = packageResult
    return { activated: false, stage: 'package-load', failure }
  }

  await saveWorldRulesConfig(worldId, {
    activePackageId: packageResult.package.packageId,
    activePackageVersion: packageResult.package.version,
    activePackageIntegrity: packageResult.package.integrityHash
  })

  const runtime = await getWorldRuntime(worldId)
  return { activated: true, summary: summarizeWorldRuntime(runtime) }
}

// ---------------------------------------------------------------------------
// Config updates (settings / roll-type overrides)
// ---------------------------------------------------------------------------

export type WorldRulesConfigUpdateInput = {
  settings?: StoredWorldRulesConfig['settings']
  rollTypes?: Record<string, WorldRollTypeOverride>
}

export type WorldRulesConfigUpdateResult =
  | { updated: false; stage: 'unconfigured' }
  | { updated: true; summary: WorldRulesSummary }

// Updates settings and/or roll-type overrides on an ALREADY-activated
// World. Rejects (writes nothing) if the World has no configuration yet --
// see design decision 5. Never touches active_package_id/version/integrity
// -- only `settings`/`rollTypes` are ever forwarded to saveWorldRulesConfig,
// regardless of what else `input` might contain.
export async function updateWorldRulesConfig(
  worldId: string | number,
  input: WorldRulesConfigUpdateInput
): Promise<WorldRulesConfigUpdateResult> {
  const existing = await loadWorldRulesConfig(worldId)
  if (!existing) {
    return { updated: false, stage: 'unconfigured' }
  }

  await saveWorldRulesConfig(worldId, {
    settings: input.settings,
    rollTypes: input.rollTypes
  })

  const runtime = await getWorldRuntime(worldId)
  return { updated: true, summary: summarizeWorldRuntime(runtime) }
}
