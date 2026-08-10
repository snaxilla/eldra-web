// Rules Engine Package Validation.
// See .github/docs/architecture/rules-engine.md §16.14 ("Validation
// ownership" -- the authoritative table this module implements the
// "package structural validation" column of), §16.10 decision 6
// (unattached-modifier warning), §16.9 (engine-reserved `@source:`
// fields), §16.8 (`sourceRefField`), and §16.3 (modifierTypes
// declaration) for the design this implements.
//
// This is the single entry point ("Package Validation is responsible for
// rejecting malformed Rules Packages before they are used at runtime")
// that COMPOSES the four already-approved, already-shipped validation/
// indexing modules named in this task's own IMPLEMENTATION section --
// RulesRegistry, reference-validation.ts, type-validation.ts,
// DependencyGraph, and cycle-detection.ts -- plus a small set of genuinely
// new structural checks that §16.14's table assigns to "package structural
// validation" and that no existing module owns. It does NOT parse, does
// NOT evaluate expressions, does NOT perform runtime evaluation, and does
// NOT execute Actions or Rolls -- every diagnostic below is either produced
// by calling an existing module's own public API unchanged, or is a new,
// narrowly-scoped structural check with no dependency on any of that.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS AND GAPS FOUND (expanded in the commit Summary)
// ---------------------------------------------------------------------------
// 1. Result shape: ONE `issues: readonly PackageValidationIssue[]` array on
//    both the ok:true and ok:false branches, not two separate `errors`/
//    `warnings` arrays. `PackageValidationIssue.severity` (types.ts, named
//    directly by the architecture's own "Validation results" type sketch)
//    already self-labels each issue -- splitting into two arrays would
//    duplicate that distinction for no benefit and risk the two falling
//    out of sync. `ok` is computed as "no issue has severity 'error'"; an
//    ok:true result may still carry warnings (§16.10 decision 6's
//    unattached-modifier case is the one producer of these today).
//
// 2. Composition order, and why registry construction is the one true
//    early-return: every other check below (reference existence, type
//    checking, dependency-graph construction, cycle detection, and every
//    new structural check) needs a working RulesRegistry to query against.
//    A malformed enough package to fail RulesRegistry.create (duplicate
//    ids, an unindexable Definition) cannot be meaningfully checked any
//    further, so that failure alone short-circuits the rest. Every
//    subsequent stage runs and accumulates diagnostics regardless of
//    whether an earlier stage found problems (matching this session's own
//    established convention in registry.ts/dependency-graph.ts/
//    cycle-detection.ts: collect every error, never stop at the first) --
//    a package author fixing issues one at a time should see everything
//    wrong in one pass, not be forced to fix-and-rerun repeatedly. The one
//    exception is cycle detection, which is skipped (not "failed") when
//    DependencyGraph.build itself did not produce a graph to check.
//
// 3. Reference existence is composed broadly (every Expression field in
//    every Definition, via dependency-graph.ts's own exported
//    `collectExpressions` -- see that file's new comment on why this is
//    the one enumeration, not a second one reimplemented here), but Type
//    Validation is composed NARROWLY: only the two rules §16.14's table
//    explicitly assigns to "type validation" at the PACKAGE level --
//    "Modifier condition is boolean wherever statically knowable" and
//    "add/scale/clamp operands are numeric (static)". A broader "every
//    formula must type-check against its declared valueType" sweep is
//    real, plausible future work, but it is not named anywhere in this
//    task's RESPONSIBILITY list or TESTING section, and inventing it now
//    would be scope creep beyond "Revision 3 package-level validation
//    rules" -- flagged as deferred in the commit Summary, not built.
//    (validateExpressionType's own internal diagnostics -- e.g. a genuine
//    `1 + "text"` type error inside a condition/value expression -- are
//    still surfaced as a side effect of calling it for these two checks;
//    that is not new scope, it is what the function already returns.)
//
// 4. §16.14 lists several rules this module's own composed calls do NOT
//    yet cover, because they belong to reference-validation.ts/
//    type-validation.ts's OWN domains and are not implemented there today
//    -- extending those files is outside this task's file scope ("Reuse
//    the existing... Compose them. Do not duplicate existing validation"):
//      - `@source:` used outside a ModifierSpec expression (reference
//        validation) -- reference-validation.ts's own KNOWN_NAMESPACES
//        does not yet include `'source'` (its own header already flags
//        this: "a hand-built AST node with namespace: 'source' is
//        therefore still reported as 'unknown-namespace'").
//      - `suppresses.sources` entries resolve to `kind: "source"`
//        (reference validation) -- SourceSuppression.sources is a plain
//        DefinitionId[], never routed through an Expression AST, so
//        reference-validation.ts's Expression-only `validateReferences`
//        never sees it.
//      - `ActionEffect.target` resolves to a Value or Resource (reference
//        validation) -- same reason; already flagged as a gap in
//        rules-engine.md §16.16 itself ("a gap in the current
//        implementation").
//      - `@source:` engine-field types (type validation) --
//        type-validation.ts's `typeOfReference` only resolves 'value'/
//        'collection' namespaces; `@source:` fields are statically
//        unknown by construction (§16.9) and the architecture is explicit
//        this is a runtime-only check (evaluator.ts already implements
//        it).
//    All four are genuine, pre-existing gaps in modules this task does not
//    own -- flagged here and in the commit Summary, not silently patched
//    by reaching into those files.

import { DependencyGraph, collectExpressions } from './dependency-graph'
import { detectCycles } from './cycle-detection'
import { validateReferences, validateSemanticRoles } from './reference-validation'
import { RulesRegistry } from './registry'
import { validateExpressionType } from './type-validation'
import type { RuleExpressionNode } from './ast'
import type {
  CollectionDefinition,
  Definition,
  DefinitionId,
  Expression,
  ModifierSpec,
  PackageValidationIssue,
  RulesPackageManifest
} from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type PackageValidationResult =
  | { ok: true; issues: readonly PackageValidationIssue[] }
  | { ok: false; issues: readonly PackageValidationIssue[] }

// The canonical entry point (this module's own header). `definitions` is
// already-in-memory Definition objects, exactly like every other module
// this composes -- loading a package from JSON/disk is explicitly out of
// scope (this task's own NON-GOALS: no networking, no package loading).
export function validatePackage(manifest: RulesPackageManifest, definitions: readonly Definition[]): PackageValidationResult {
  const issues: PackageValidationIssue[] = []

  const registryResult = RulesRegistry.create(manifest, definitions)
  if (!registryResult.ok) {
    for (const error of registryResult.errors) {
      issues.push({ severity: 'error', code: 'registry-construction-error', message: error.message, definitionId: error.definitionId })
    }
    return { ok: false, issues }
  }
  const registry = registryResult.registry

  // --- New structural checks (§16.14's "package structural validation" column) ---
  checkDuplicateModifierTypeDeclarations(manifest, issues)
  const declaredModifierTypes = new Set((manifest.modifierTypes ?? []).map((declaration) => declaration.id))
  const referencedModifierIds = collectReferencedModifierIds(registry)

  for (const { ownerId, modifier } of collectModifierSpecsWithOwner(registry)) {
    checkModifierType(modifier, ownerId, declaredModifierTypes, issues)
    checkPhaseAndClamp(modifier, ownerId, issues)
    checkModifierConditionType(modifier, ownerId, registry, issues)
    checkModifierValueType(modifier, ownerId, registry, issues)
  }

  for (const definition of registry.listAll()) {
    if (definition.kind !== 'modifier') continue
    if (!referencedModifierIds.has(definition.id)) {
      issues.push({
        severity: 'warning',
        code: 'unattached-modifier',
        message: `Modifier '${definition.id}' is never referenced by any Source's modifiers array (§16.10 decision 6: dead content, not an error)`,
        definitionId: definition.id
      })
    }
  }

  for (const definition of registry.listAll()) {
    if (definition.kind !== 'collection') continue
    checkSourceRefField(definition, issues)
    checkReservedItemFields(definition, issues)
  }

  // --- Composed: Reference Validation (existence) across every Expression field ---
  for (const definition of registry.listAll()) {
    for (const expression of collectExpressions(definition)) {
      const result = validateReferences(expression.ast as RuleExpressionNode, registry)
      if (!result.ok) {
        for (const diagnostic of result.diagnostics) {
          issues.push({ severity: 'error', code: diagnostic.kind, message: diagnostic.message, definitionId: definition.id })
        }
      }
    }
  }

  // --- Composed: Semantic Role bindings ---
  const roleResult = validateSemanticRoles(manifest, registry)
  if (!roleResult.ok) {
    for (const diagnostic of roleResult.diagnostics) {
      issues.push({ severity: 'error', code: diagnostic.kind, message: diagnostic.message, definitionId: diagnostic.definitionId })
    }
  }

  // --- Composed: Dependency Graph construction (also covers unresolved/
  // wrong-kind ModifierReference targets -- dependency-graph.ts's own
  // collectStructuralEdges already implements both, see that file) ---
  const graphResult = DependencyGraph.build(registry)
  if (!graphResult.ok) {
    for (const error of graphResult.errors) {
      issues.push({ severity: 'error', code: 'dependency-graph-error', message: error.message, definitionId: error.definitionId })
    }
  } else {
    // --- Composed: Static Cycle Detection (only meaningful once a graph exists) ---
    const cycleResult = detectCycles(graphResult.graph)
    if (!cycleResult.ok) {
      for (const cycle of cycleResult.cycles) {
        issues.push({
          severity: 'error',
          code: 'dependency-cycle',
          message: `Dependency cycle detected: ${cycle.path.join(' -> ')}`
        })
      }
    }
  }

  const ok = !issues.some((issue) => issue.severity === 'error')
  return ok ? { ok: true, issues } : { ok: false, issues }
}

// ---------------------------------------------------------------------------
// New structural checks
// ---------------------------------------------------------------------------

function checkDuplicateModifierTypeDeclarations(manifest: RulesPackageManifest, issues: PackageValidationIssue[]): void {
  const seen = new Set<string>()
  for (const declaration of manifest.modifierTypes ?? []) {
    if (seen.has(declaration.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-modifier-type-declaration',
        message: `manifest.modifierTypes declares '${declaration.id}' more than once`
      })
    }
    seen.add(declaration.id)
  }
}

// Every ModifierSpec in the package, paired with the DefinitionId
// diagnostics should attribute it to: a standalone ModifierDefinition's
// own id, or -- for an inline entry -- the owning SourceDefinition's id
// (an inline modifier has no id of its own; dependency-graph.ts's own
// structural edges use the identical attribution, see that file's design
// decision 5). `{ ref }` entries are skipped here: the ModifierDefinition
// they point at is already visited independently via its own standalone
// entry, and a dangling/wrong-kind `{ ref }` itself is DependencyGraph's
// job (already composed below), not this walk's.
function collectModifierSpecsWithOwner(registry: RulesRegistry): Array<{ ownerId: DefinitionId; modifier: ModifierSpec }> {
  const result: Array<{ ownerId: DefinitionId; modifier: ModifierSpec }> = []

  for (const definition of registry.listAll()) {
    if (definition.kind === 'modifier') {
      result.push({ ownerId: definition.id, modifier: definition })
      continue
    }
    if (definition.kind === 'source') {
      for (const entry of definition.modifiers) {
        if ('ref' in entry) continue
        result.push({ ownerId: definition.id, modifier: entry })
      }
    }
  }

  return result
}

function collectReferencedModifierIds(registry: RulesRegistry): Set<DefinitionId> {
  const referenced = new Set<DefinitionId>()
  for (const definition of registry.listAll()) {
    if (definition.kind !== 'source') continue
    for (const entry of definition.modifiers) {
      if ('ref' in entry) referenced.add(entry.ref)
    }
  }
  return referenced
}

// §16.3: "modifierType names a declared manifest.modifierTypes entry" --
// checked only when a modifierType is actually declared (§16.3: an omitted
// modifierType means the modifier does not participate in typed stacking
// at all, "the common case," and is never checked against this table).
function checkModifierType(
  modifier: ModifierSpec,
  ownerId: DefinitionId,
  declaredModifierTypes: ReadonlySet<string>,
  issues: PackageValidationIssue[]
): void {
  if (modifier.modifierType === undefined) return
  if (declaredModifierTypes.has(modifier.modifierType)) return
  issues.push({
    severity: 'error',
    code: 'undeclared-modifier-type',
    message: `Modifier on '${ownerId}' declares modifierType '${modifier.modifierType}', which is not declared in manifest.modifierTypes`,
    definitionId: ownerId
  })
}

// §16.4/§16.14: "Modifier phase is not base" and "phase: clamp carries a
// clamp bound". Both are already enforced by ModifierSpec's own
// discriminated union for a hand-authored TypeScript package -- but
// Package Validation's whole purpose is checking packages the type system
// cannot protect (JSON deserialized from disk/network, exactly what a
// real package loader will one day produce), so both are re-checked here
// defensively against the runtime value, not assumed from the static
// type. `phase`/`clamp` are read through a loose cast for exactly that
// reason: this function's job is to catch the package that VIOLATES what
// ModifierSpec claims, so it cannot lean on that same type to prove the
// violation can't happen.
function checkPhaseAndClamp(modifier: ModifierSpec, ownerId: DefinitionId, issues: PackageValidationIssue[]): void {
  const phase = modifier.phase as string

  if (phase === 'base') {
    issues.push({
      severity: 'error',
      code: 'illegal-base-phase',
      message: `Modifier on '${ownerId}' declares phase 'base', which is reserved for the Value's own formula/default and is not a legal Modifier phase`,
      definitionId: ownerId
    })
    return
  }

  if (phase === 'clamp') {
    const clamp = (modifier as { clamp?: unknown }).clamp
    if (clamp !== 'min' && clamp !== 'max') {
      issues.push({
        severity: 'error',
        code: 'missing-clamp-bound',
        message: `Modifier on '${ownerId}' has phase 'clamp' but no valid clamp bound ('min' | 'max')`,
        definitionId: ownerId
      })
    }
  }
}

function isExpression(value: unknown): value is Expression {
  return typeof value === 'object' && value !== null && 'text' in value && 'ast' in value
}

// §16.14: "Modifier condition is boolean wherever its type is statically
// knowable" -- type validation's own rule, composed here at the point
// Package Validation actually knows a given Expression IS a Modifier's
// condition (type-validation.ts itself has no such field-role concept; it
// only ever type-checks one Expression in isolation).
function checkModifierConditionType(
  modifier: ModifierSpec,
  ownerId: DefinitionId,
  registry: RulesRegistry,
  issues: PackageValidationIssue[]
): void {
  if (!modifier.condition) return

  const { type, diagnostics } = validateExpressionType(modifier.condition.ast as RuleExpressionNode, registry)
  for (const diagnostic of diagnostics) {
    issues.push({ severity: 'error', code: diagnostic.kind, message: diagnostic.message, definitionId: ownerId })
  }

  if (type !== undefined && type !== 'boolean') {
    issues.push({
      severity: 'error',
      code: 'modifier-condition-not-statically-boolean',
      message: `Modifier condition on '${ownerId}' must be boolean, but statically resolves to '${type}'`,
      definitionId: ownerId
    })
  }
}

// §16.14: "add/scale/clamp operands are numeric (static)". Only checked
// when `.value` is an Expression -- a literal RuleValue is already a
// concrete, correctly-typed value with nothing to statically infer.
function checkModifierValueType(
  modifier: ModifierSpec,
  ownerId: DefinitionId,
  registry: RulesRegistry,
  issues: PackageValidationIssue[]
): void {
  const phase = modifier.phase as string
  if (phase !== 'add' && phase !== 'scale' && phase !== 'clamp') return
  if (!isExpression(modifier.value)) return

  const { type, diagnostics } = validateExpressionType(modifier.value.ast as RuleExpressionNode, registry)
  for (const diagnostic of diagnostics) {
    issues.push({ severity: 'error', code: diagnostic.kind, message: diagnostic.message, definitionId: ownerId })
  }

  if (type !== undefined && type !== 'number') {
    issues.push({
      severity: 'error',
      code: 'modifier-value-not-statically-numeric',
      message: `Modifier value on '${ownerId}' (phase '${phase}') must be numeric, but statically resolves to '${type}'`,
      definitionId: ownerId
    })
  }
}

const RESERVED_ITEM_FIELD_KEYS: readonly string[] = ['instanceId', 'definitionId', 'duration', 'origin']

// §16.8/§16.14: "Collection sourceRefField names a declared itemSchema
// key" and "that key's field is valueType: 'ref', refKind: 'source'".
function checkSourceRefField(collection: CollectionDefinition, issues: PackageValidationIssue[]): void {
  if (!collection.sourceRefField) return

  const field = collection.itemSchema.find((candidate) => candidate.key === collection.sourceRefField)
  if (!field) {
    issues.push({
      severity: 'error',
      code: 'invalid-source-ref-field',
      message: `Collection '${collection.id}' declares sourceRefField '${collection.sourceRefField}', which is not a key in itemSchema`,
      definitionId: collection.id
    })
    return
  }

  if (field.valueType !== 'ref' || field.refKind !== 'source') {
    issues.push({
      severity: 'error',
      code: 'invalid-source-ref-field',
      message: `Collection '${collection.id}'s sourceRefField '${collection.sourceRefField}' must be declared valueType:'ref', refKind:'source' (got valueType:'${field.valueType}', refKind:'${field.refKind ?? ''}')`,
      definitionId: collection.id
    })
  }
}

// §16.9/§16.14: "itemSchema must not declare an engine-reserved key" --
// instanceId/definitionId/duration/origin share the flat `@source:`
// namespace with item fields (§16.9), so a colliding key would make that
// namespace ambiguous.
function checkReservedItemFields(collection: CollectionDefinition, issues: PackageValidationIssue[]): void {
  for (const field of collection.itemSchema) {
    if (RESERVED_ITEM_FIELD_KEYS.includes(field.key)) {
      issues.push({
        severity: 'error',
        code: 'reserved-field-collision',
        message: `Collection '${collection.id}'s itemSchema declares reserved key '${field.key}' (engine-reserved: ${RESERVED_ITEM_FIELD_KEYS.join(', ')})`,
        definitionId: collection.id
      })
    }
  }
}
