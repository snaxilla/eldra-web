// Rules Engine Definition Registry.
// See .github/docs/architecture/rules-engine.md §11 ("Rules Package Model")
// and §11.4 ("Ownership matrix" — the registry is what makes "Definition
// identity" queryable) for the design this implements.
//
// This module answers exactly three questions: does a Definition exist,
// what kind is it, and give me Definition X (plus enumeration and Semantic
// Role lookup, which are the same question asked differently). It performs
// NO semantic validation (a dangling reference is not detected here), NO
// expression validation, NO evaluation, NO dependency graph construction,
// NO package loading from JSON/disk, and NO migrations. It only indexes an
// already-in-memory list of Definitions for O(1) lookup.
//
// ---------------------------------------------------------------------------
// ARCHITECTURAL GAP FOUND (see the commit Summary for the full writeup)
// ---------------------------------------------------------------------------
// §11.1-11.3 describe "a Rules Package" as a manifest (RulesPackageManifest,
// already in ./types) plus a `definitions/` directory tree of individual
// Definition documents -- but no in-memory TypeScript type anywhere in
// ./types.ts bundles "a manifest together with its Definitions" into one
// value. ./types.ts's own Definition union (ValueDefinition | ... |
// SourceDefinition) is the *item* shape; nothing aggregates many of them
// with a manifest into a single "RulesPackage" object.
//
// Per this task's explicit instruction ("If the architecture lacks a
// Definition shape needed by the registry: Stop. Report it. Do not extend
// the model casually"), this file does NOT invent a new `RulesPackage`
// aggregate type. `RulesRegistry.create` instead takes the manifest and the
// Definition list as two separate parameters, built entirely from types
// that already exist in ./types.ts. This satisfies "construct from a Rules
// Package" at the level of what data is needed, without committing to a
// specific bundled shape (array vs. Record-by-id, whether Definitions are
// grouped by directory, etc.) that a future package-loader-from-JSON phase
// is better positioned to decide, since it will need to answer exactly that
// shape question anyway.

import type { Definition, DefinitionId, RulesPackageManifest, SemanticRole } from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Derived, not hand-duplicated. NonNullable because ModifierDefinition.kind
// is optional in ./types.ts (its own comment: standalone modifiers have a
// populated kind; only the inline, embedded-in-a-Source form omits it, and
// that form never appears in a top-level Definition list -- see
// isIndexable below).
export type DefinitionKind = NonNullable<Definition['kind']>

// Reported at construction time only for structural indexing problems --
// never for cross-reference validity (e.g. an Action's `roll` pointing at a
// Roll Spec that doesn't exist). Checking that is Semantic Validation's job
// (explicitly out of scope here); this registry only rejects a package it
// is physically unable to index.
export type RegistryConstructionError = {
  message: string
  definitionId?: DefinitionId
}

export type RegistryConstructionResult =
  | { ok: true; registry: RulesRegistry }
  | { ok: false; errors: RegistryConstructionError[] }

// The in-memory Definition Registry (§11.4: "the registry owns Definition
// identity"). Immutable once constructed: no method here ever adds,
// removes, or replaces an entry. Construct only via RulesRegistry.create --
// the constructor is private so an instance can never exist with
// hand-assembled (and therefore possibly inconsistent) internal indexes.
export class RulesRegistry {
  private static readonly EMPTY: readonly Definition[] = Object.freeze([])

  private constructor(
    private readonly byId: ReadonlyMap<DefinitionId, Definition>,
    private readonly byKind: ReadonlyMap<DefinitionKind, readonly Definition[]>,
    private readonly byRole: ReadonlyMap<SemanticRole, Definition>
  ) {}

  // Builds a RulesRegistry from a manifest and its Definitions. Rejects
  // (rather than throwing) when the input cannot be indexed at all -- every
  // Definition must have both a populated `id` and a populated `kind` to
  // participate (§11.1's "standalone form" requirement), and no two
  // Definitions may share an `id` (identity must be unique to be owned).
  // Every offending Definition is reported, not just the first.
  static create(manifest: RulesPackageManifest, definitions: readonly Definition[]): RegistryConstructionResult {
    const errors: RegistryConstructionError[] = []
    const byId = new Map<DefinitionId, Definition>()
    const byKind = new Map<DefinitionKind, Definition[]>()

    for (const definition of definitions) {
      if (!definition.kind) {
        errors.push({ message: 'Definition has no kind and cannot be indexed (not a standalone Definition)' })
        continue
      }
      if (!definition.id) {
        errors.push({ message: `Definition of kind '${definition.kind}' has no id and cannot be indexed` })
        continue
      }
      if (byId.has(definition.id)) {
        errors.push({ message: `Duplicate DefinitionId '${definition.id}'`, definitionId: definition.id })
        continue
      }

      byId.set(definition.id, definition)
      const group = byKind.get(definition.kind)
      if (group) group.push(definition)
      else byKind.set(definition.kind, [definition])
    }

    if (errors.length > 0) {
      return { ok: false, errors }
    }

    for (const group of byKind.values()) Object.freeze(group)

    // §12.4: semanticRoles maps SemanticRole -> DefinitionId, not directly
    // to a Definition. A role bound to an id that isn't among `definitions`
    // is a dangling reference -- deliberately not a construction error (see
    // the file header): it just means getBySemanticRole(role) returns
    // undefined for that role, the same as any other failed lookup.
    const byRole = new Map<SemanticRole, Definition>()
    if (manifest.semanticRoles) {
      for (const [role, targetId] of Object.entries(manifest.semanticRoles) as [SemanticRole, DefinitionId][]) {
        const target = byId.get(targetId)
        if (target) byRole.set(role, target)
      }
    }

    return { ok: true, registry: new RulesRegistry(byId, byKind, byRole) }
  }

  has(id: DefinitionId): boolean {
    return this.byId.has(id)
  }

  getById(id: DefinitionId): Definition | undefined {
    return this.byId.get(id)
  }

  getBySemanticRole(role: SemanticRole): Definition | undefined {
    return this.byRole.get(role)
  }

  // A fresh, frozen snapshot each call -- callers can never mutate registry
  // state through the returned array.
  listAll(): readonly Definition[] {
    return Object.freeze([...this.byId.values()])
  }

  listByKind(kind: DefinitionKind): readonly Definition[] {
    return this.byKind.get(kind) ?? RulesRegistry.EMPTY
  }
}
