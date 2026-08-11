// Rules Engine Reference Resolution and Validation.
// See .github/docs/architecture/rules-engine.md §14.7 (dependency
// extraction), §14.11 (authoring UX / validation errors), and §11.4 (the
// registry owns Definition identity) for the design this implements.
//
// This module answers exactly the questions §"RESPONSIBILITY" of this
// task's own spec names: does a referenced Definition exist, is its
// namespace valid, can the Registry resolve it, and do a package's Semantic
// Role bindings resolve. It does NOT type-check, does NOT validate
// arithmetic or function signatures, does NOT evaluate anything, does NOT
// build a dependency graph, and does NOT detect cycles.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS AND GAPS FOUND (expanded in the commit Summary)
// ---------------------------------------------------------------------------
// 1. Public API shape: validateReferences takes (ast, registry), not
//    (ast, dependencies, registry). extractDependencies(ast) is called
//    internally rather than accepting a second, independently-suppliable
//    dependency list -- extraction is pure and already implemented
//    (./dependencies.ts), so accepting a separately-passed list would only
//    risk it silently diverging from the ast actually being validated, for
//    no benefit. This also directly produces the task's own required
//    "duplicate diagnostics suppressed naturally": extractDependencies
//    already deduplicates by reference key, so at most one diagnostic can
//    ever be emitted per distinct reference.
//
// 2. Which namespaces the Registry can actually resolve: of the (now seven,
//    as of revision 3's type-contract delta -- see KNOWN_NAMESPACES below)
//    ReferenceNamespace values (ast.ts), only 'value' and 'collection'
//    correspond to a Definition kind the registry can index
//    (ValueDefinition/ResourceDefinition, CollectionDefinition -- ./types.ts
//    §12). The rest are structurally outside the registry's domain, not
//    merely unchecked by omission:
//      - 'sources' and 'ctx' reference runtime data (ActorState.sources,
//        EvaluationContext -- ./types.ts §13, §15.6), never a package
//        Definition.
//      - 'world' references World Configuration traits (§19), a separate
//        system entirely (see CLAUDE.md's "Setting vocabulary... World
//        Configuration | §19"), not part of the Rules Package/Registry.
//      - 'choice' references a ChoiceSet, a primitive §12.2 names as
//        "kept" but which types.ts explicitly declines to model yet
//        ("Table, Progression, and ChoiceSet are deliberately NOT modeled
//        here rather than invented"). Treating every @choice: reference as
//        an automatic "Unknown Definition" (since no ChoiceSet Definition
//        kind can ever exist in the registry today) would be actively
//        wrong, not merely incomplete -- so, per this task's "Stop. Report
//        it. Do not extend the model casually" discipline (established in
//        the registry commit), @choice: existence-checking is left
//        unimplemented rather than faked, pending ChoiceSet being modeled.
//      - 'source' (§16.9) refers to runtime Source-instance data, never a
//        Definition -- rules-engine.md §16.9 is explicit that dependency
//        extraction must emit no graph edge for it, exactly like 'sources'/
//        'ctx'/'world'/'choice'. Not yet reachable in practice: parser.ts
//        does not produce it (see KNOWN_NAMESPACES below).
//    isRegistryCheckedNamespace() below is the single place this scoping
//    decision lives.
//
// 3. Semantic Role validation needs the manifest, not just the registry:
//    RulesRegistry (../registry.ts) intentionally does not expose its
//    manifest, and its own construction step already silently drops
//    dangling semantic-role bindings when building its internal `byRole`
//    index (a role bound to a nonexistent id just never enters that map --
//    see registry.ts's own comment on this). That means, by the time a
//    RulesRegistry exists, the information needed to report *which* role
//    bindings were dangling is already gone. validateSemanticRoles
//    therefore takes the original RulesPackageManifest as a separate
//    parameter (the same value the caller already passed to
//    RulesRegistry.create) rather than requiring a change to registry.ts,
//    keeping this commit's diff scoped to new files only.

import type { RuleExpressionNode } from './ast'
import { extractDependencies } from './dependencies'
import type { RulesRegistry } from './registry'
import type { DefinitionId, RulesPackageManifest } from './types'
import { parseWorldTraitPath } from './world-config'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ReferenceDiagnosticKind =
  | 'unknown-namespace'
  | 'unknown-definition'
  | 'unknown-semantic-role'
  | 'invalid-world-reference'

export type ReferenceDiagnostic = {
  kind: ReferenceDiagnosticKind
  message: string
  namespace?: string
  path?: string
  definitionId?: DefinitionId
  role?: string
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; diagnostics: ReferenceDiagnostic[] }

// expression-language.md §8.1 / ast.ts's own ReferenceNamespace comment
// described six reference namespaces as "a complete, closed enumeration"
// through revision 2. The parser already rejects anything else as a syntax
// error at parse time (parser.ts's REFERENCE_NAMESPACES), so this list is
// re-declared locally (not imported from parser.ts, which does not export
// it, and which this task does not touch) purely as a defensive runtime
// check for AST that did not come through the parser -- rules-engine.md
// §14.1 names a future visual editor as another legitimate AST producer,
// and nothing at runtime prevents a hand-built or deserialized
// ReferenceExpressionNode from carrying a namespace value outside this set
// despite the TypeScript type claiming otherwise.
//
// Six, not seven: `ast.ts`'s `ReferenceNamespace` type gained `'source'` as
// a seventh member in revision 3's type-contract delta (§16.9, ADR-020),
// but this list intentionally still reflects only what the parser can
// currently produce (parser.ts's REFERENCE_NAMESPACES is unchanged this
// commit) -- a hand-built AST node with `namespace: 'source'` is therefore
// still reported as 'unknown-namespace' here, not silently accepted, until
// the parser/grammar commit and this list are updated together.
const KNOWN_NAMESPACES: readonly string[] = ['value', 'collection', 'sources', 'choice', 'world', 'ctx']

function isKnownNamespace(namespace: string): boolean {
  return KNOWN_NAMESPACES.includes(namespace)
}

// See design decision 2 above: only these two namespaces map onto a
// Definition kind the registry can ever contain.
const REGISTRY_CHECKED_NAMESPACES: readonly string[] = ['value', 'collection']

function isRegistryCheckedNamespace(namespace: string): boolean {
  return REGISTRY_CHECKED_NAMESPACES.includes(namespace)
}

// §12.4's closed Semantic Role registry, re-declared locally for the same
// defensive-runtime-check reason as KNOWN_NAMESPACES above (types.ts's
// SemanticRole union is not itself iterable at runtime).
const KNOWN_SEMANTIC_ROLES: readonly string[] = [
  'vitality',
  'movement.speed',
  'initiative',
  'encumbrance.capacity',
  'encumbrance.load',
  'currency',
  'identity.name',
  'identity.portrait',
  'level',
  'proficiency'
]

function isKnownSemanticRole(role: string): boolean {
  return KNOWN_SEMANTIC_ROLES.includes(role)
}

// Validates every reference an Expression AST depends on against a
// RulesRegistry. Extracts dependencies internally (see design decision 1
// above) -- callers only need an already-parsed AST and a constructed
// registry, exactly the two inputs a package validator would have on hand
// for one Expression field (a `formula`, a `condition`, ...).
export function validateReferences(ast: RuleExpressionNode, registry: RulesRegistry): ValidationResult {
  const diagnostics: ReferenceDiagnostic[] = []

  for (const dependency of extractDependencies(ast)) {
    if (!isKnownNamespace(dependency.namespace)) {
      diagnostics.push({
        kind: 'unknown-namespace',
        message: `Unknown reference namespace '${dependency.namespace}'`,
        namespace: dependency.namespace,
        path: dependency.path
      })
      continue
    }

    // world-configuration.md §F.2/§F.7: `@world:` carries a grammar rule
    // no other namespace does -- its path must be exactly two segments
    // (`<kind>.<key>`), because §19's data model is `{kind, traits}` and a
    // path of any other arity names no slot in it. This is ARITY ONLY.
    // Whether `rules.flanking` is a declared optional rule, or
    // `calendar.currentSeason` is declared in `manifest.requiredTraits`,
    // is Package Validation's (world-configuration.md §15) -- both need
    // the manifest, which this function does not take, and both are the
    // next commit.
    if (dependency.namespace === 'world' && !parseWorldTraitPath(dependency.path)) {
      diagnostics.push({
        kind: 'invalid-world-reference',
        message: `'@world${dependency.path === undefined ? '' : `:${dependency.path}`}' must have exactly two path segments -- '@world:<kind>.<key>' (for example '@world:rules.flanking')`,
        namespace: dependency.namespace,
        path: dependency.path
      })
      continue
    }

    if (!isRegistryCheckedNamespace(dependency.namespace)) {
      // sources / ctx / world / choice -- not registry-resolvable by
      // design or by current model gap; see design decision 2 above.
      // A `world` reference that reached here passed the arity check
      // above; its kind/key are still not registry-resolvable (World
      // Configuration is a separate system, §19).
      continue
    }

    if (!registry.has(dependency.key)) {
      diagnostics.push({
        kind: 'unknown-definition',
        message: `Unknown Definition '${dependency.key}'`,
        namespace: dependency.namespace,
        path: dependency.path,
        definitionId: dependency.key
      })
    }
  }

  return diagnostics.length > 0 ? { ok: false, diagnostics } : { ok: true }
}

// Validates that every Semantic Role binding in a package's manifest
// (§12.4) resolves to a Definition actually present in the registry built
// from that same manifest's definitions. See design decision 3 above for
// why this takes the manifest directly rather than reading it off the
// registry.
export function validateSemanticRoles(
  manifest: RulesPackageManifest,
  registry: RulesRegistry
): ValidationResult {
  const diagnostics: ReferenceDiagnostic[] = []
  const semanticRoles = manifest.semanticRoles

  if (semanticRoles) {
    for (const [role, targetId] of Object.entries(semanticRoles) as Array<[string, DefinitionId]>) {
      if (!isKnownSemanticRole(role)) {
        diagnostics.push({
          kind: 'unknown-semantic-role',
          message: `Unknown Semantic Role '${role}'`,
          role
        })
        continue
      }

      if (!registry.has(targetId)) {
        diagnostics.push({
          kind: 'unknown-semantic-role',
          message: `Semantic Role '${role}' is bound to unknown Definition '${targetId}'`,
          role,
          definitionId: targetId
        })
      }
    }
  }

  return diagnostics.length > 0 ? { ok: false, diagnostics } : { ok: true }
}
