// World Runtime Assembly Service.
// See .github/docs/architecture/rules-package-infrastructure.md §5 ("Module
// Map" -- world-runtime-service.ts named directly as "the single most
// important new module and the only one that knows both halves exist") and
// §6 ("Runtime Flow") for the design this implements. §5's own pseudocode
// is this module's entire job, verbatim:
//
//   const stored = await loadWorldRulesConfig(worldId)
//   if (!stored) return { configured: false }
//   const pkg = await loadPublishedPackage(stored.activePackageId, stored.activePackageVersion)
//   const result = createWorldRuntime(pkg.manifest, pkg.definitions, worldId, stored)
//   if (!result.ok) return { configured: true, ok: false, stage: result.stage, errors: result.errors }
//   return { configured: true, ok: true, runtime: result.runtimePackage }
//
// This is the FIRST place the three already-independently-built,
// already-independently-tested layers -- persistence (world-rules-
// config.ts), the package loader (rules-packages.ts), and the pure runtime
// assembler (app/lib/rules/world-runtime.ts) -- run together. It composes;
// it does not reimplement any of the three. No activation (never calls
// saveWorldRulesConfig), no caching, no I/O beyond what the two composed
// loaders already perform themselves.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. THREE states, not two -- "configured but broken" is a first-class,
//    distinct branch from "unconfigured", never collapsed into it.
//    rules-package-infrastructure.md §5.1 names this explicitly as "the
//    single most likely implementation mistake in this milestone -- it
//    would turn a corrupt package into 'no rules configured' and hide the
//    failure." A World whose `world_rules_config` row exists but whose
//    package fails to load or fails runtime construction is CONFIGURED
//    (`configured: true`) and BROKEN (`ok: false`) -- never silently
//    reported as unconfigured, and no default is ever substituted in its
//    place.
//
// 2. Failure carries a `stage` telling the caller WHICH of the two
//    composed calls broke ('package-load' | 'runtime-construction'), with
//    that call's own already-defined failure shape nested under `failure`,
//    verbatim and unmodified -- not flattened into a new error vocabulary.
//    Nesting (rather than spreading, the way rules-package.ts's own
//    `RulesPackageLoadFailure` spreads `errors` alongside its `stage`) is
//    required here specifically because `PublishedPackageLoadFailure`
//    already has its OWN `stage` field with an unrelated vocabulary
//    ('not-found' | 'not-published' | ...) -- spreading would collide two
//    different meanings of `stage` into one key. Nesting keeps both
//    intact: this module's `stage` says WHERE in getWorldRuntime's own
//    composition the break happened; `failure.stage` (when the failure is
//    a package-load one) says WHY, in the loader's own already-diagnosed
//    vocabulary.
//
// 3. No caching of any kind. This task's own NON-GOALS list "Runtime
//    cache" explicitly, and each composed step already has its own
//    caching story (or deliberate lack of one) -- getWorldRuntime adds no
//    memoization on top.
//
// 4. No writes. This module never imports or calls saveWorldRulesConfig --
//    it is a read-only assembly path. Activation (the write that sets
//    active_package_id/version/integrity) is explicitly a later commit.
//
// 5. (Added for Infra 8, the Game Admin Rules tab) `integrityHash` is
//    surfaced on the ready branch of both `WorldRuntimeResult` and
//    `WorldRulesSummary`. It is NOT a new fact this module computes --
//    `loadPublishedPackage` already recomputes and verifies it on every
//    call (rules-packages.ts); this only stops discarding a value that
//    was already sitting in `packageResult.package.integrityHash`. The
//    Rules Admin tab needs to display "Integrity" alongside Package/
//    Version, and the task's own constraint ("everything displayed comes
//    exclusively from GET /rules/summary") makes exposing the existing,
//    already-verified value here the correct fix rather than a second
//    endpoint or a client-side recomputation.

import { loadPublishedPackage, type PublishedPackageLoadFailure } from './rules-packages'
import { loadWorldRulesConfig } from './world-rules-config'
import { createWorldRuntime } from '../../app/lib/rules/world-runtime'
import type { RulesPackageLoadFailure, RuntimeRulesPackage } from '../../app/lib/rules/rules-package'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type WorldRuntimeFailure =
  | { stage: 'package-load'; failure: PublishedPackageLoadFailure }
  | { stage: 'runtime-construction'; failure: RulesPackageLoadFailure }

// Exactly three states -- see design decision 1. Nothing else this module
// returns collapses one into another.
export type WorldRuntimeResult =
  | { configured: false }
  | ({ configured: true; ok: false } & WorldRuntimeFailure)
  | { configured: true; ok: true; runtime: RuntimeRulesPackage; integrityHash: string }

// The canonical entry point for obtaining a World's active Rules Runtime.
// Composes loadWorldRulesConfig -> loadPublishedPackage -> createWorldRuntime,
// in that order, and nothing else. Never throws for an expected failure --
// every branch a composed call can report is surfaced as a WorldRuntimeResult.
export async function getWorldRuntime(worldId: string | number): Promise<WorldRuntimeResult> {
  const stored = await loadWorldRulesConfig(worldId)
  if (!stored) {
    return { configured: false }
  }

  const packageResult = await loadPublishedPackage(stored.activePackageId, stored.activePackageVersion)
  if (!packageResult.ok) {
    const { ok: _ok, ...failure } = packageResult
    return { configured: true, ok: false, stage: 'package-load', failure }
  }

  const runtimeResult = createWorldRuntime(
    packageResult.package.manifest,
    packageResult.package.definitions,
    stored.worldId,
    stored
  )
  if (!runtimeResult.ok) {
    const { ok: _ok, ...failure } = runtimeResult
    return { configured: true, ok: false, stage: 'runtime-construction', failure }
  }

  return { configured: true, ok: true, runtime: runtimeResult.runtimePackage, integrityHash: packageResult.package.integrityHash }
}

// ---------------------------------------------------------------------------
// GET /api/worlds/:id/rules/summary response shaping
// ---------------------------------------------------------------------------
//
// Pulled out as its own pure function (rather than left inline in the
// route handler) so it is directly unit-testable without a Nuxt/H3 runtime
// -- server/api/worlds/[id]/rules/summary.get.ts calls this and returns
// its result verbatim. Deliberately narrow: only ever reads
// packageId/packageVersion/worldConfig.{rollTypes,gaps,unboundRecommendedRoles,issues}
// off a RuntimeRulesPackage -- never `manifest`, `registry`, or
// `dependencyGraph`, so a Registry/DependencyGraph/Definition can never
// reach a serialized response by accident (SUMMARY ENDPOINT: "Do not
// expose Definitions. Do not expose Registry. Do not expose
// DependencyGraph. Do not expose RuntimeRulesPackage internals.").
export type WorldRulesSummary =
  | { configured: false }
  | ({ configured: true; ok: false } & WorldRuntimeFailure)
  | {
      configured: true
      packageId: string
      packageVersion: string
      integrityHash: string
      rollTypes: RuntimeRulesPackage['worldConfig']['rollTypes']
      bindingGaps: RuntimeRulesPackage['worldConfig']['gaps']
      unboundRecommendedRoles: RuntimeRulesPackage['worldConfig']['unboundRecommendedRoles']
      issues: RuntimeRulesPackage['worldConfig']['issues']
    }

export function summarizeWorldRuntime(result: WorldRuntimeResult): WorldRulesSummary {
  if (!result.configured) {
    return { configured: false }
  }

  if (!result.ok) {
    // `result` is already exactly WorldRulesSummary's broken-branch shape
    // ({ configured: true; ok: false } & WorldRuntimeFailure) -- returned
    // verbatim rather than rebuilt field-by-field.
    return result
  }

  const { runtime } = result

  return {
    configured: true,
    packageId: runtime.packageId,
    packageVersion: runtime.packageVersion,
    integrityHash: result.integrityHash,
    rollTypes: runtime.worldConfig.rollTypes,
    bindingGaps: runtime.worldConfig.gaps,
    unboundRecommendedRoles: runtime.worldConfig.unboundRecommendedRoles,
    issues: runtime.worldConfig.issues
  }
}
