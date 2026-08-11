// Rules Engine World Configuration lookup.
// See .github/docs/architecture/world-configuration.md §F (@world and
// Evaluation Context) and rules-engine.md §19 (World Configuration
// Contract) for the design this implements.
//
// This module owns two things: what `@world:<kind>.<key>` MEANS
// (`parseWorldTraitPath`/`lookupWorldTrait`, Commit 1), and how a
// `WorldConfigSnapshot` (plus the rest of a `ResolvedWorldConfig`) gets
// BUILT in the first place (`resolveWorldConfig`, this commit). It is pure
// -- no I/O, no Directus, no fetch, no server imports, no application
// imports -- and it holds no state. It does NOT load a world configuration
// (that reads a stored row from Directus -- a later commit's
// `server/utils/world-rules-config.ts`), does NOT validate a world's
// supplied values against their declared type/options (a later "World
// Config Validation" concern this commit's own RESPONSIBILITY section does
// not list), does NOT apply the closed WorldOverride set (§21.5/ADR-012 --
// a later commit; see the `StoredWorldRulesConfig` comment below), and does
// NOT know a Rules Package's Definitions exist (`resolveWorldConfig` takes
// a manifest, never a `RulesRegistry` or a `Definition[]` -- see design
// decision 6). Package activation, package loading, actor state, Game
// Admin, and the Character Sheet bridge are still untouched by this file.
//
// `lookupWorldTrait` reads an ALREADY-RESOLVED WorldConfigSnapshot; that
// separation is the point and does not change in this commit: §19.3's
// "changes produce binding gaps, not runtime failures" works precisely
// because defaulting happens during resolution, ahead of time, so by the
// time the evaluator reads a snapshot there is nothing left to decide -- a
// trait is present or it is absent. `resolveWorldConfig` is exactly the
// function that does that defaulting, once, before any snapshot exists.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS (expanded in the commit Summary)
// ---------------------------------------------------------------------------
// 1. `parseWorldTraitPath` lives here, not in reference-validation.ts or
//    evaluator.ts, even though both are its only callers today. The
//    two-segment rule IS the `@world:` grammar contract, and it must mean
//    the same thing at validation time and at evaluation time -- if the two
//    ever disagreed, an expression could validate cleanly and then fail at
//    runtime (or worse, the reverse). One function, two callers, no
//    drift-prone twin. This mirrors the Package Validation commit's reuse
//    of dependency-graph.ts's `collectExpressions` for the same reason.
//
// 2. `lookupWorldTrait` returns `undefined` for absent rather than a
//    RulesError. It has no DefinitionId to attribute an error to (it is a
//    plain lookup, not an evaluation step), and §14.4's error values carry
//    one unconditionally. The evaluator, which does have the DefinitionId,
//    turns absence into a RulesError -- see evaluator.ts's
//    evaluateWorldReference. Keeping this function total and
//    error-free also makes it directly reusable by the non-evaluator
//    consumers this commit adds (`resolveWorldConfig` itself reuses the
//    same own-property-checked lookup against a World's raw stored
//    `settings`, via the shared `readTraitValue` helper below -- see design
//    decision 5), and by the admin surfaces a future commit will add
//    ("is this trait bound?"), which also want the absence, not a
//    diagnostic.
//
// 3. Both lookup levels use an own-property check rather than a bare index
//    read. `traits` and its inner records are `Record<string, ...>` keyed
//    by author-supplied kind/key strings, so a reference like
//    `@world:constructor.x` or `@world:rules.toString` would otherwise
//    resolve up the prototype chain and return a Function -- not a
//    WorldTraitValue at all, despite the type. This is the same defensive
//    posture reference-validation.ts and evaluator.ts already take toward
//    "AST that did not come through the parser": the type system's claim
//    is not enforceable at runtime for data that will eventually arrive as
//    deserialized JSON.
//
// 4. `WORLD_CONFIG_RULES_KIND` IS now declared and exported here (it was
//    deliberately withheld from Commit 1 -- see that commit's own note,
//    superseded by this one). This module, not package-validation.ts, is
//    its home: package-validation.ts already imports `parseWorldTraitPath`
//    FROM this file, so this file importing anything back FROM
//    package-validation.ts would be a circular dependency. Package
//    Validation (Commit 2) independently declared its own local copy of
//    this same literal for exactly that reason -- this commit's own scope
//    is explicitly "do not touch Package Validation," so the two are left
//    as a small, deliberate, commented duplication (one string constant)
//    rather than a cross-file import or an unrequested edit to committed
//    Commit 2 code. A future commit that touches both files together can
//    collapse this into one export.
//
// 5. `readTraitValue` (private) is the shared implementation behind BOTH
//    `lookupWorldTrait` (reads an already-resolved snapshot's `traits`) and
//    `resolveWorldConfig` (reads a stored World's raw `settings`, which is
//    the identical `Record<string, Record<string, WorldTraitValue>>` shape
//    by construction -- `settings` IS what becomes `traits` once defaulting
//    is applied). One function, two callers, no drift-prone twin -- the
//    same reasoning design decision 1 already gives for
//    `parseWorldTraitPath`.
//
// 6. `resolveWorldConfig` takes `(manifest, worldId, stored)`, not the
//    two-argument `(manifest, stored)` world-configuration.md §6.3
//    sketches. That sketch is explicitly "Proposed... Not implemented," and
//    implementing it literally has a real gap: `WorldConfigSnapshot.worldId`
//    is mandatory, but `StoredWorldRulesConfig | null` can be `null` --
//    §6.3's own "resolveWorldConfig is TOTAL -- it never throws" design
//    intent, and this commit's DEFAULTS section, both require a well-formed
//    result even when nothing is stored yet. There is no `worldId` to read
//    off a `null`. `packageId`/`packageVersion` do NOT have the same
//    problem -- `manifest.packageId`/`manifest.version` are read straight
//    off the (always-present) manifest rather than off `stored`, which is
//    both simpler and more correct: the manifest passed in IS the active
//    package by construction (an earlier, not-yet-implemented step already
//    loaded it), so there is no reason to prefer a second, possibly-stale
//    copy of the same two strings off a stored row.
//
// 7. `StoredWorldRulesConfig` (./types.ts) is deliberately narrower than
//    world-configuration.md §6.3's full sketch: it omits `overrides` (the
//    closed WorldOverride set) and `bindings` (previously-resolved Binding
//    Gap answers from Game Admin). Neither is read by `resolveWorldConfig`
//    in this commit -- WorldOverride application and Binding-resolution
//    persistence are both later, Game-Admin-adjacent commits this task's
//    NON-GOALS explicitly exclude. Adding `WorldOverride`'s own four-variant
//    union now, for a field nothing in this commit consumes, would repeat
//    the exact "type declared, no reader yet" situation Commit 1 avoided by
//    leaving `requiredTraits`/`optionalRules`/`rollTypes` type-only until
//    Commit 2 actually read them.
//
// 8. Optional rules resolve to `traits.rules[key]` using the SAME
//    supplied-else-default rule as requiredTraits, but never produce a
//    Binding Gap. world-configuration.md §F.6's own three-case table lists
//    a Binding Gap only for "declared in requiredTraits, world supplies
//    nothing" -- an unsupplied optional rule is not one of the three listed
//    cases, and unlike a requiredTrait (whose `default` exists purely as an
//    evaluation-continuity fallback for what is meant to be world-authored
//    data -- a Road Type's `quality`), an `OptionalRuleDeclaration.default`
//    IS the package's own normal, expected, unremarkable value for a rule
//    almost every World will never touch. Flagging every unset optional
//    rule as a gap would flood a World with noise for the ordinary case,
//    not the exceptional one Binding Gaps exist to surface (§28's "visible
//    degradation, not silent corruption" is about surfacing genuine content
//    gaps -- a road with no quality -- not about narrating every default a
//    package already declared as fine to use as-is).

import type {
  BindingGap,
  PackageValidationIssue,
  ResolvedRollType,
  ResolvedWorldConfig,
  RulesPackageManifest,
  SemanticRole,
  StoredWorldRulesConfig,
  WorldConfigSnapshot,
  WorldTraitValue
} from './types'

// ---------------------------------------------------------------------------
// Path arity (world-configuration.md §F.2)
// ---------------------------------------------------------------------------

// The two halves of a valid `@world:` reference path. `kind` names a
// World Configuration definition kind (`rules`, `roadType`, `calendar`,
// ...); `key` names one trait within it.
export type WorldTraitPath = {
  kind: string
  key: string
}

// Splits a `@world:` reference path into its `kind` and `key`, or returns
// `undefined` if the path is not exactly two segments.
//
// Valid:    rules.flanking          calendar.currentSeason
// Invalid:  restVariant  (one)      a.b.c  (three)      undefined  (bare @world)
//
// §19's entire contract is `{kind, traits}` -- a one-segment reference
// carries no `kind`, so there is nowhere in the data model for it to
// resolve; a three-segment one implies a nesting depth the model does not
// have. Fixing the depth at two is what makes resolution TOTAL: every
// syntactically valid `@world:` reference names exactly one slot, which
// either holds a value or does not.
//
// Empty segments are rejected as well. The parser cannot produce one (a
// path segment is `[a-zA-Z_][a-zA-Z0-9_]*`, expression-language.md §8.4),
// so this only guards hand-built or deserialized AST -- the same producer
// class rules-engine.md §14.1 names when it describes a future visual
// editor emitting AST directly.
export function parseWorldTraitPath(path: string | undefined): WorldTraitPath | undefined {
  if (path === undefined) {
    return undefined
  }

  const segments = path.split('.')
  if (segments.length !== 2) {
    return undefined
  }

  const kind = segments[0]!
  const key = segments[1]!
  if (kind === '' || key === '') {
    return undefined
  }

  return { kind, key }
}

// ---------------------------------------------------------------------------
// Trait lookup (world-configuration.md §F.3)
// ---------------------------------------------------------------------------

// Reads one trait out of an already-resolved snapshot:
// `snapshot.traits[kind][key]`.
//
// Returns `undefined` when the kind or the key is absent. Never throws,
// and never invents a value -- no zero, no `false`, no declared default.
// Defaults belong to resolution (world-configuration.md §F.6: a declared
// trait a world did not supply is filled in with the package's required
// default and recorded as a Binding Gap, before any snapshot exists), so
// absence HERE means genuinely absent, and the evaluator is right to treat
// it as an error rather than silently computing a number a player would
// see (§28's "visible degradation over silent corruption").
export function lookupWorldTrait(
  snapshot: WorldConfigSnapshot,
  kind: string,
  key: string
): WorldTraitValue | undefined {
  return readTraitValue(snapshot.traits, kind, key)
}

// Shared by `lookupWorldTrait` above and `resolveWorldConfig` below -- see
// design decision 5. `traits` is optional only so a stored World's raw
// `settings` (which may itself be absent -- an unconfigured/empty World) can
// be passed through without every caller writing its own `?? {}` guard.
function readTraitValue(
  traits: Record<string, Record<string, WorldTraitValue>> | undefined,
  kind: string,
  key: string
): WorldTraitValue | undefined {
  if (!traits || !Object.prototype.hasOwnProperty.call(traits, kind)) {
    return undefined
  }

  const traitsForKind = traits[kind]
  if (!traitsForKind || !Object.prototype.hasOwnProperty.call(traitsForKind, key)) {
    return undefined
  }

  return traitsForKind[key]
}

// ---------------------------------------------------------------------------
// Resolution (world-configuration.md §6.3, §D, §E, §F.6; §15's "world config
// validation" row for Binding Gap generation) -- World Configuration Commit 3
// ---------------------------------------------------------------------------

// world-configuration.md §E.4: the one engine-reserved world-config `kind`,
// under which every optional rule's value lives (`@world:rules.<key>`). See
// design decision 4 above for why this is a small, deliberate duplicate of
// package-validation.ts's own identically-named, identically-valued local
// constant rather than a shared import.
const WORLD_CONFIG_RULES_KIND = 'rules'

// world-configuration.md §C.3's recommended set: "vitality, level,
// identity.name, and (proposed below) inventory." Only the first three are
// included here -- `inventory` is the architecture's own PROPOSED fourth
// addition to the closed `SemanticRole` registry (./types.ts), not yet made.
// Treating it as recommended here would mean checking a role this module
// could never find bound (or unbound) correctly, since it does not exist in
// the type this function's input is actually typed against. Extending
// `SemanticRole` is an engine-version-bump decision (§12.4 rule 5) outside
// this commit's file scope (types.ts "only if required" -- this is not
// required by anything RESPONSIBILITY lists), so the gap is flagged, not
// silently closed by inventing the role.
const RECOMMENDED_SEMANTIC_ROLES: readonly SemanticRole[] = ['vitality', 'level', 'identity.name']

// world-configuration.md §6.3: composes a package's declared World
// Configuration surface (`requiredTraits`, `optionalRules`, `rollTypes`,
// `semanticRoles`) with what a World has actually stored, into one
// immutable `ResolvedWorldConfig`. TOTAL -- never throws, and produces a
// well-formed result for every input, including `stored: null` (an
// unconfigured-but-being-previewed World: see design decision 6 for why
// `worldId` is a separate parameter rather than read off `stored`).
//
// Three independent composition passes, each already specified by a
// dedicated section of this commit's task (DEFAULTS/BINDING GAPS,
// ROLL TYPES, RECOMMENDED ROLES) and by this file's own design decisions
// 6-8 above:
//   1. `requiredTraits` + `optionalRules` -> `snapshot.traits`, with
//      Binding Gaps for unsupplied requiredTraits only (decision 8).
//   2. `manifest.rollTypes` + `stored.rollTypes` -> the ordered, filtered
//      `rollTypes` list (see composeRollTypes below).
//   3. `manifest.semanticRoles` -> `unboundRecommendedRoles` (a pure
//      declared-or-not check against the manifest; no registry/Definitions
//      needed, since a package that reached this point already passed
//      Package Validation's own `validateSemanticRoles`, which is the check
//      that a BOUND role resolves to a real Definition -- this function
//      only asks whether the recommended ones are bound AT ALL).
export function resolveWorldConfig(
  manifest: RulesPackageManifest,
  worldId: string,
  stored: StoredWorldRulesConfig | null
): ResolvedWorldConfig {
  const settings = stored?.settings

  const traits: Record<string, Record<string, WorldTraitValue>> = {}
  const gaps: BindingGap[] = []

  for (const declaration of manifest.requiredTraits ?? []) {
    const supplied = readTraitValue(settings, declaration.kind, declaration.trait)
    const resolved = supplied !== undefined ? supplied : declaration.default
    setTraitValue(traits, declaration.kind, declaration.trait, resolved)

    if (supplied === undefined) {
      gaps.push({
        kind: declaration.kind,
        trait: declaration.trait,
        declaredDefault: declaration.default,
        reason: `World did not supply a value for '${declaration.kind}.${declaration.trait}'; using the package's declared default.`
      })
    }
  }

  for (const rule of manifest.optionalRules ?? []) {
    const supplied = readTraitValue(settings, WORLD_CONFIG_RULES_KIND, rule.key)
    const resolved = supplied !== undefined ? supplied : rule.default
    setTraitValue(traits, WORLD_CONFIG_RULES_KIND, rule.key, resolved)
  }

  const snapshot: WorldConfigSnapshot = Object.freeze({
    worldId,
    packageId: manifest.packageId,
    packageVersion: manifest.version,
    worldConfigVersion: stored?.worldConfigVersion ?? 0,
    traits: freezeTraits(traits)
  })

  const { rollTypes, issues } = composeRollTypes(manifest, stored)
  const unboundRecommendedRoles = detectUnboundRecommendedRoles(manifest)

  return Object.freeze({
    snapshot,
    rollTypes: Object.freeze(rollTypes),
    gaps: Object.freeze(gaps),
    unboundRecommendedRoles: Object.freeze(unboundRecommendedRoles),
    issues: Object.freeze(issues)
  })
}

function setTraitValue(
  traits: Record<string, Record<string, WorldTraitValue>>,
  kind: string,
  key: string,
  value: WorldTraitValue
): void {
  const traitsForKind = traits[kind] ?? {}
  traitsForKind[key] = value
  traits[kind] = traitsForKind
}

// SNAPSHOT's own "immutable" rule, applied two levels deep: the outer
// `traits` record and every per-kind inner record are each frozen
// independently, so neither `snapshot.traits.rules.flanking = x` nor
// `snapshot.traits.rules = {}` can silently succeed.
function freezeTraits(
  traits: Record<string, Record<string, WorldTraitValue>>
): Record<string, Record<string, WorldTraitValue>> {
  for (const kind of Object.keys(traits)) {
    Object.freeze(traits[kind])
  }
  return Object.freeze(traits)
}

// world-configuration.md §D.5/§10: composes `manifest.rollTypes` (what the
// package declared) with `stored.rollTypes` (the World's overrides) into
// the ordered, filtered list a GM toolbar or Character Sheet can read
// directly. Exactly the four approved operations apply --
// `enabled`/`order`/`rollSpec`/`visibility` -- and `id`/`label`/`surfaces`
// are never touched by an override: a World can surface, hide, reorder, or
// rebind a package-declared roll type, never invent or relabel one. Neither
// `manifest.rollTypes` nor any of its entries is ever mutated -- every
// ResolvedRollType below is a fresh object.
function composeRollTypes(
  manifest: RulesPackageManifest,
  stored: StoredWorldRulesConfig | null
): { rollTypes: ResolvedRollType[]; issues: PackageValidationIssue[] } {
  const declarations = manifest.rollTypes ?? []
  const overrides = stored?.rollTypes ?? {}
  const declaredIds = new Set(declarations.map((declaration) => declaration.id))
  const issues: PackageValidationIssue[] = []

  // world-configuration.md §10: "resolvedRollTypes = manifest.rollTypes
  // composed with world.rollTypes, dropping enabled:false, sorted by world
  // order then declaration order then declaration index." The three-way
  // fallback chain is computed once per item as a single `order` number;
  // pushing in declaration order before sorting, plus a stable sort, is
  // what makes "declaration index" the correct final tiebreak with no
  // second sort key needed (Array#sort has been stability-guaranteed since
  // ES2019, which this project's target engines satisfy).
  const resolved: ResolvedRollType[] = []
  declarations.forEach((declaration, index) => {
    const override = overrides[declaration.id]
    const enabled = override?.enabled ?? true
    if (!enabled) return

    resolved.push({
      id: declaration.id,
      label: declaration.label,
      rollSpec: override?.rollSpec ?? declaration.rollSpec,
      surfaces: Object.freeze([...declaration.surfaces]),
      visibility: override?.visibility ?? declaration.visibility,
      order: override?.order ?? declaration.order ?? index
    })
  })
  resolved.sort((a, b) => a.order - b.order)

  // world-configuration.md §10's own validation table: "World references a
  // roll type the package doesn't declare -- World Config Validation
  // (warning -- stale config after upgrade, not corruption)." Composition
  // is exactly where this is decidable (both `manifest.rollTypes` and
  // `stored.rollTypes` are in hand), and per "do not allow creation of new
  // roll types," a stale override contributes NOTHING to `resolved` above --
  // this is purely a diagnostic, not a fallback path.
  for (const id of Object.keys(overrides)) {
    if (!declaredIds.has(id)) {
      issues.push({
        severity: 'warning',
        code: 'undeclared-world-roll-type-override',
        message: `World roll-type override references '${id}', which this package version does not declare (stale config after a package upgrade)`
      })
    }
  }

  return { rollTypes: resolved.map((rollType) => Object.freeze(rollType)), issues }
}

// world-configuration.md §C.3/§C.5: "Unbound role? Visible degradation,
// never an error" -- a warning-only signal, never a resolution failure. Does
// NOT consult a RulesRegistry: whether a BOUND role resolves to a real
// Definition is Package Validation's job (`validateSemanticRoles`, already
// implemented) and is assumed already-passed by the time a manifest reaches
// resolution. This only asks "is the role key present in
// `manifest.semanticRoles` at all."
function detectUnboundRecommendedRoles(manifest: RulesPackageManifest): SemanticRole[] {
  const bound = manifest.semanticRoles ?? {}
  return RECOMMENDED_SEMANTIC_ROLES.filter((role) => bound[role] === undefined)
}
