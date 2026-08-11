// Rules Engine World Configuration lookup.
// See .github/docs/architecture/world-configuration.md §F (@world and
// Evaluation Context) and rules-engine.md §19 (World Configuration
// Contract) for the design this implements.
//
// This module owns exactly one thing: what `@world:<kind>.<key>` MEANS.
// It is pure -- no I/O, no Directus, no fetch, no server imports, no
// application imports -- and it holds no state. It does NOT load a world
// configuration, does NOT resolve one (defaults, Binding Gaps, roll-type
// composition, override application), does NOT validate a world's supplied
// values against a package's declarations, and does NOT know a Rules
// Package exists. Those are world-configuration.md commits 3-5.
//
// It reads an ALREADY-RESOLVED WorldConfigSnapshot. That separation is the
// point: §19.3's "changes produce binding gaps, not runtime failures"
// works precisely because defaulting happens during resolution, ahead of
// time, so by the time the evaluator reads a snapshot there is nothing
// left to decide -- a trait is present or it is absent.
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
//    consumers commit 3 will add (admin surfaces asking "is this trait
//    bound?"), which want the absence, not a diagnostic.
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
// 4. No `WORLD_CONFIG_RULES_KIND` constant is exported, despite `rules`
//    being the engine-reserved kind for optional rules
//    (world-configuration.md §E.4). Nothing in THIS commit reads it --
//    reserving the kind, and checking `@world:rules.X` against
//    `manifest.optionalRules`, both belong to Package Validation (commit
//    2). Declaring it now would add an export with no consumer and imply a
//    check that does not exist yet.

import type { WorldConfigSnapshot, WorldTraitValue } from './types'

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
  const traits = snapshot.traits
  if (!traits || !Object.prototype.hasOwnProperty.call(traits, kind)) {
    return undefined
  }

  const traitsForKind = traits[kind]
  if (!traitsForKind || !Object.prototype.hasOwnProperty.call(traitsForKind, key)) {
    return undefined
  }

  return traitsForKind[key]
}
