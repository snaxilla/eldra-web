// Rules Engine Runtime Package Loader.
// See .github/docs/architecture/world-configuration.md §7 ("Runtime Flow")
// and rules-engine.md §11 ("Rules Package Model") for the design this
// implements -- §7's own flow diagram is the direct source for this
// module's shape:
//
//   RulesRegistry.create(definitions)
//   DependencyGraph.build(registry)
//   resolveWorldConfig(manifest, stored) -> { snapshot, ... }
//   new EvaluationSession(registry, graph, actorState, { world: snapshot })
//
// This module is exactly the middle two steps of that flow, bundled into
// one call and one immutable result: RulesRegistry.create then
// DependencyGraph.build, composed with an ALREADY-RESOLVED
// ResolvedWorldConfig (world-config.ts, World Configuration Commit 3) into
// one runtime object -- RuntimeRulesPackage -- that EvaluationSession, the
// Roll Service, and every future consumer named in this commit's task
// (Character Sheet bridge, Action Engine) can be constructed from directly.
//
// It performs NO I/O (no fetch, no file read, no Directus), NO validation
// (Package Validation -- package-validation.ts -- is assumed to have
// already passed; a package that reaches this loader is trusted), NO
// persistence, NO activation decision, and NO caching. It is a pure
// assembly step: given already-loaded inputs, produce one immutable
// runtime object or fail loudly.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. `loadRulesPackage` takes `(manifest, definitions, worldConfig)` --
//    exactly this task's INPUT section, in that order -- rather than a
//    single bundled "package" parameter. registry.ts's own header already
//    identified the gap this mirrors: no type in ./types.ts aggregates "a
//    manifest plus its Definitions" into one input shape, and this
//    module's job is to CONSUME that gap the same way registry.ts and
//    DependencyGraph.build already do (two parameters, not an invented
//    aggregate), not to retroactively invent the aggregate registry.ts
//    explicitly declined to invent. `RuntimeRulesPackage` (this module's
//    own new type) is the OUTPUT-side aggregate the task asks for; nothing
//    equivalent is added on the input side.
//
// 2. `worldConfig: ResolvedWorldConfig` is a required parameter, not
//    computed here. Composing a manifest with a World's stored
//    configuration is `resolveWorldConfig`'s job alone (world-config.ts,
//    Commit 3) -- this loader's RESPONSIBILITY is "ResolvedWorldConfig
//    INTEGRATION," not resolution. A caller builds one
//    (`resolveWorldConfig(manifest, worldId, stored)`) and hands it in,
//    exactly as world-configuration.md §7's flow diagram sequences it:
//    resolveWorldConfig happens independently, ahead of this loader.
//
// 3. Registry construction is attempted first, and a registry failure
//    short-circuits before DependencyGraph.build is ever called --
//    DependencyGraph.build's own signature takes a `RulesRegistry`, so
//    there is no graph to attempt without one. This is not a design
//    choice so much as the only order the two APIs make possible; stated
//    explicitly here because the task's ERROR MODEL section asks for it
//    by name ("If Registry creation fails: fail" listed before the
//    DependencyGraph case).
//
// 4. Failure is reported as a discriminated union on `stage`
//    (`'registry' | 'dependency-graph'`), carrying that stage's own
//    already-defined error type verbatim (`RegistryConstructionError[]` /
//    `GraphConstructionError[]`) -- not a new, flattened "loader error"
//    shape. This loader introduces no new failure vocabulary; it only
//    reports WHICH already-existing failure occurred and passes the
//    underlying diagnostics through unchanged, so a caller debugging a
//    load failure sees exactly the same error shape they would get
//    calling RulesRegistry.create/DependencyGraph.build directly.
//
// 5. `RuntimeRulesPackage` is frozen with a single `Object.freeze` at the
//    top level, not deep-frozen field by field. This mirrors
//    EvaluationSession's own design decision 2 exactly: `RulesRegistry`
//    and `DependencyGraph` are themselves already fully immutable classes
//    (private constructor, no mutating method), `ResolvedWorldConfig` is
//    already deep-frozen by `resolveWorldConfig` (world-config.ts), and
//    `RulesPackageManifest` is plain data this loader never mutates and
//    never needs to protect beyond "this specific runtime package's own
//    fields cannot be reassigned." Freezing deeper than that would be
//    reproducing protection each nested type already fully provides
//    itself.
//
// 6. `packageId`/`packageVersion` are read from `manifest`, not from
//    `worldConfig.snapshot`. Both already agree by construction --
//    `resolveWorldConfig` itself sets `snapshot.packageId`/
//    `snapshot.packageVersion` from the very same manifest fields
//    (world-config.ts design decision 6) -- so this is not a second,
//    possibly-divergent source; it is the same manifest-is-authoritative
//    choice world-config.ts already made, applied consistently one layer
//    up.
//
// 7. No consistency check between `manifest` and `worldConfig.snapshot`
//    (e.g. asserting `worldConfig.snapshot.packageId === manifest.packageId`)
//    is performed. Per design decision 2, `worldConfig` is expected to
//    have been produced by calling `resolveWorldConfig(manifest, ...)`
//    with this exact manifest -- the two cannot disagree unless a caller
//    manually constructs a mismatched pair, which is a caller-side
//    programming error this task's ERROR MODEL section does not ask this
//    loader to guard against (it names exactly two failure modes:
//    Registry construction, DependencyGraph construction). Adding a
//    third, unrequested validation path here would also cut against
//    "assume Package Validation has already been performed" --
//    cross-checking two already-trusted inputs against each other is
//    exactly the kind of validation this commit's NON-GOALS excludes.

import { DependencyGraph, type GraphConstructionError } from './dependency-graph'
import { RulesRegistry, type RegistryConstructionError } from './registry'
import type { Definition, ResolvedWorldConfig, RulesPackageManifest } from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// world-configuration.md §7's runtime flow, bundled: a manifest, its
// indexed Registry, the DependencyGraph built from that same Registry, and
// an already-resolved World Configuration -- everything EvaluationSession,
// the Roll Service, and future consumers (Character Sheet bridge, Action
// Engine) need to be constructed, with nothing left to load. `packageId`/
// `packageVersion` are surfaced directly (not just nested inside
// `manifest`) because they are the identity a caller keys a cache or a log
// line on -- reading through `manifest.packageId` every time would work
// but makes every call site repeat the same path.
export type RuntimeRulesPackage = {
  packageId: string
  packageVersion: string
  manifest: RulesPackageManifest
  registry: RulesRegistry
  dependencyGraph: DependencyGraph
  worldConfig: ResolvedWorldConfig
}

// See design decision 4: each variant carries its own stage's own
// already-defined error type, unchanged.
export type RulesPackageLoadFailure =
  | { stage: 'registry'; errors: readonly RegistryConstructionError[] }
  | { stage: 'dependency-graph'; errors: readonly GraphConstructionError[] }

export type RulesPackageLoadResult =
  | { ok: true; runtimePackage: RuntimeRulesPackage }
  | ({ ok: false } & RulesPackageLoadFailure)

// world-configuration.md §7's runtime flow, steps 2-3 (Registry, then
// DependencyGraph), composed with an already-resolved ResolvedWorldConfig
// (step 4) into one immutable RuntimeRulesPackage. Pure: no I/O, no
// validation, no caching (see the file header and this commit's
// NON-GOALS). Never throws -- every failure mode either underlying type
// already reports (RegistryConstructionResult / GraphConstructionResult)
// is surfaced as a Result, not an exception.
export function loadRulesPackage(
  manifest: RulesPackageManifest,
  definitions: readonly Definition[],
  worldConfig: ResolvedWorldConfig
): RulesPackageLoadResult {
  const registryResult = RulesRegistry.create(manifest, definitions)
  if (!registryResult.ok) {
    return { ok: false, stage: 'registry', errors: registryResult.errors }
  }

  const graphResult = DependencyGraph.build(registryResult.registry)
  if (!graphResult.ok) {
    return { ok: false, stage: 'dependency-graph', errors: graphResult.errors }
  }

  const runtimePackage: RuntimeRulesPackage = {
    packageId: manifest.packageId,
    packageVersion: manifest.version,
    manifest,
    registry: registryResult.registry,
    dependencyGraph: graphResult.graph,
    worldConfig
  }

  return { ok: true, runtimePackage: Object.freeze(runtimePackage) }
}
