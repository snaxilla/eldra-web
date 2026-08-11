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
//
// ---------------------------------------------------------------------------
// WORLD CONFIGURATION -- COMMIT 2 (world-configuration.md §15's ownership
// matrix; §D/§E/§F for the sections themselves)
// ---------------------------------------------------------------------------
// Extends this module to validate the three new manifest sections World
// Configuration Commit 1 added to the type contract only (requiredTraits,
// optionalRules, rollTypes -- ./types.ts), plus the `@world:` reference
// checks that need BOTH the manifest and a package's Expressions to decide,
// which is exactly why world-configuration.md §15 assigns them here rather
// than to reference-validation.ts (arity-only, already implemented in
// Commit 1) or world-config.ts (pure lookup, no manifest, no I/O). This
// commit validates package DECLARATIONS only -- no World Configuration
// storage, resolution, Directus, or server route exists yet, and none of
// that is touched or assumed by anything below.
//
// `checkWorldConfigReferences` walks every Expression in the package a
// second time (collectExpressions again, exactly as the existing Reference
// Validation loop above already does) rather than folding into that loop,
// because it needs `manifest.requiredTraits`/`manifest.optionalRules` --
// data `validateReferences(ast, registry)` deliberately does not take (its
// own design decision 1: it validates against a RulesRegistry, and
// requiredTraits/optionalRules are manifest-only declarations with no
// registry entry, exactly like semanticRoles). A reference whose arity is
// already wrong (`@world:oneSegment`, `@world:a.b.c`) was already reported
// by reference-validation.ts's own arity check (Commit 1) and is skipped
// here via `parseWorldTraitPath` returning `undefined` -- reporting it
// again under a second code would be duplicate noise for the same mistake.

import { DependencyGraph, collectExpressions } from './dependency-graph'
import { detectCycles } from './cycle-detection'
import { extractDependencies } from './dependencies'
import { validateReferences, validateSemanticRoles } from './reference-validation'
import { RulesRegistry } from './registry'
import { validateExpressionType } from './type-validation'
import { parseWorldTraitPath } from './world-config'
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

  // --- World Configuration manifest sections (world-configuration.md §D/§E/§F) ---
  checkRequiredTraits(manifest, issues)
  checkOptionalRules(manifest, issues)
  checkRollTypes(manifest, registry, issues)

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

  // --- World Configuration: @world:rules.X / @world:<kind>.<key> declaredness
  // (world-configuration.md §F.7, §15) -- a second Expression walk, deliberately;
  // see the file-header note above for why this cannot be folded into the
  // Reference Validation loop just above. ---
  checkWorldConfigReferences(manifest, registry, issues)

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

// ---------------------------------------------------------------------------
// World Configuration -- manifest section checks (Commit 2)
// ---------------------------------------------------------------------------

// world-configuration.md §E.4: the one engine-reserved world-config `kind`.
// Declared here, not in world-config.ts, per that file's own design decision
// 4 ("reserving the kind... belongs to Package Validation, commit 2").
const WORLD_CONFIG_RULES_KIND = 'rules'

// world-configuration.md §15: "optionalRules key does not collide with a
// real world-config kind." A single-member set today -- `rules` is the only
// kind the engine itself reserves -- kept as a list rather than one bare
// constant so a future second reserved kind is one array entry, not a
// second parallel check.
const RESERVED_WORLD_CONFIG_KINDS: readonly string[] = [WORLD_CONFIG_RULES_KIND]

// world-configuration.md §F.4: the closed valueType vocabulary a
// requiredTrait may declare, and the `typeof` its `default` must match.
const REQUIRED_TRAIT_DEFAULT_TYPEOF: Record<string, string> = {
  number: 'number',
  text: 'string',
  boolean: 'boolean'
}

// world-configuration.md §E.2: optionalRules are typed boolean | number |
// enum; an `enum`'s runtime value (and its `default`) is a plain string.
const OPTIONAL_RULE_DEFAULT_TYPEOF: Record<string, string> = {
  boolean: 'boolean',
  number: 'number',
  enum: 'string'
}

const KNOWN_ROLL_TYPE_SURFACES: readonly string[] = ['sheet', 'gm-toolbar', 'entity']
const KNOWN_ROLL_VISIBILITIES: readonly string[] = ['public', 'gm', 'self', 'blind']

// world-configuration.md §19.2/§6.1, §15: "unique (kind, trait); valid
// valueType; default present; default matches declared valueType." Runtime-
// value checks throughout (not leaning on RequiredTraitDeclaration's own TS
// shape), for the identical reason checkPhaseAndClamp above re-checks
// `modifier.phase` defensively: this function's job is to catch the package
// that violates what the type claims, for data that will eventually arrive
// as deserialized JSON.
function checkRequiredTraits(manifest: RulesPackageManifest, issues: PackageValidationIssue[]): void {
  const seen = new Set<string>()

  for (const declaration of manifest.requiredTraits ?? []) {
    const key = `${declaration.kind} ${declaration.trait}`
    if (seen.has(key)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-required-trait',
        message: `manifest.requiredTraits declares (kind:'${declaration.kind}', trait:'${declaration.trait}') more than once`
      })
    }
    seen.add(key)

    const valueType = declaration.valueType as string
    const expectedTypeof = REQUIRED_TRAIT_DEFAULT_TYPEOF[valueType]
    if (expectedTypeof === undefined) {
      issues.push({
        severity: 'error',
        code: 'invalid-required-trait-value-type',
        message: `requiredTrait '${declaration.kind}.${declaration.trait}' declares unsupported valueType '${valueType}'`
      })
    }

    const defaultValue = (declaration as { default: unknown }).default
    if (defaultValue === undefined) {
      issues.push({
        severity: 'error',
        code: 'missing-required-trait-default',
        message: `requiredTrait '${declaration.kind}.${declaration.trait}' has no default`
      })
    } else if (expectedTypeof !== undefined && typeof defaultValue !== expectedTypeof) {
      issues.push({
        severity: 'error',
        code: 'required-trait-default-type-mismatch',
        message: `requiredTrait '${declaration.kind}.${declaration.trait}' declares valueType '${valueType}' but its default is '${typeof defaultValue}'`
      })
    }
  }
}

// world-configuration.md §E.1-§E.2, §15: "unique key; default matches
// declared valueType; enum declarations provide options; enum default
// exists in options; key does not collide with reserved world kinds."
function checkOptionalRules(manifest: RulesPackageManifest, issues: PackageValidationIssue[]): void {
  const seen = new Set<string>()

  for (const rule of manifest.optionalRules ?? []) {
    if (seen.has(rule.key)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-optional-rule',
        message: `manifest.optionalRules declares key '${rule.key}' more than once`
      })
    }
    seen.add(rule.key)

    if (RESERVED_WORLD_CONFIG_KINDS.includes(rule.key)) {
      issues.push({
        severity: 'error',
        code: 'optional-rule-reserved-key-collision',
        message: `manifest.optionalRules key '${rule.key}' collides with the engine-reserved world-config kind '${rule.key}'`
      })
    }

    const valueType = rule.valueType as string
    const defaultValue = (rule as { default: unknown }).default
    const expectedTypeof = OPTIONAL_RULE_DEFAULT_TYPEOF[valueType]
    if (expectedTypeof !== undefined && typeof defaultValue !== expectedTypeof) {
      issues.push({
        severity: 'error',
        code: 'optional-rule-default-type-mismatch',
        message: `optionalRule '${rule.key}' declares valueType '${valueType}' but its default is '${typeof defaultValue}'`
      })
    }

    if (valueType === 'enum') {
      const options = (rule as { options?: unknown }).options
      if (!Array.isArray(options) || options.length === 0) {
        issues.push({
          severity: 'error',
          code: 'optional-rule-enum-missing-options',
          message: `optionalRule '${rule.key}' is valueType:'enum' but declares no options`
        })
      } else if (!options.includes(defaultValue)) {
        issues.push({
          severity: 'error',
          code: 'optional-rule-enum-default-not-in-options',
          message: `optionalRule '${rule.key}' default '${String(defaultValue)}' is not among its declared options`
        })
      }
    }
  }
}

// world-configuration.md §D.3, §D.5-§D.6, §15: "unique id; rollSpec
// resolves; rollSpec resolves specifically to kind:'roll'; surfaces contain
// only supported values; duplicate surface entries rejected; visibility
// values valid." `rollSpec` is a plain DefinitionId field, never routed
// through an Expression AST, so this existence/kind check belongs here --
// reference-validation.ts's Expression-only `validateReferences` never sees
// it (the same reasoning the file header already gives for
// `suppresses.sources`/`ActionEffect.target`).
function checkRollTypes(manifest: RulesPackageManifest, registry: RulesRegistry, issues: PackageValidationIssue[]): void {
  const seenIds = new Set<string>()

  for (const rollType of manifest.rollTypes ?? []) {
    if (seenIds.has(rollType.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-roll-type-id',
        message: `manifest.rollTypes declares id '${rollType.id}' more than once`
      })
    }
    seenIds.add(rollType.id)

    const target = registry.getById(rollType.rollSpec)
    if (!target) {
      issues.push({
        severity: 'error',
        code: 'unknown-roll-spec',
        message: `Roll type '${rollType.id}' declares rollSpec '${rollType.rollSpec}', which does not resolve to any Definition`,
        definitionId: rollType.rollSpec
      })
    } else if (target.kind !== 'roll') {
      issues.push({
        severity: 'error',
        code: 'roll-type-target-not-roll',
        message: `Roll type '${rollType.id}' declares rollSpec '${rollType.rollSpec}', which resolves to a '${target.kind}' Definition, not kind:'roll'`,
        definitionId: rollType.rollSpec
      })
    }

    const seenSurfaces = new Set<string>()
    for (const surface of (rollType.surfaces ?? []) as string[]) {
      if (!KNOWN_ROLL_TYPE_SURFACES.includes(surface)) {
        issues.push({
          severity: 'error',
          code: 'invalid-roll-type-surface',
          message: `Roll type '${rollType.id}' declares unsupported surface '${surface}' (supported: ${KNOWN_ROLL_TYPE_SURFACES.join(', ')})`
        })
      } else if (seenSurfaces.has(surface)) {
        issues.push({
          severity: 'error',
          code: 'duplicate-roll-type-surface',
          message: `Roll type '${rollType.id}' declares surface '${surface}' more than once`
        })
      }
      seenSurfaces.add(surface)
    }

    if (rollType.visibility !== undefined && !KNOWN_ROLL_VISIBILITIES.includes(rollType.visibility as string)) {
      issues.push({
        severity: 'error',
        code: 'invalid-roll-type-visibility',
        message: `Roll type '${rollType.id}' declares unsupported visibility '${rollType.visibility}' (supported: ${KNOWN_ROLL_VISIBILITIES.join(', ')})`
      })
    }
  }
}

// world-configuration.md §F.7, §15: "@world:rules.X" must name a declared
// optionalRules key; "@world:<kind>.<key>" (any other kind) must name a
// declared requiredTraits (kind, trait) pair. Both are checked from the
// SAME walk since the branch is decided per-reference by whether its parsed
// `kind` equals the one engine-reserved kind. A reference whose arity is
// already invalid (`parseWorldTraitPath` returns `undefined`) is skipped --
// reference-validation.ts's own arity check (Commit 1) already reports it.
function checkWorldConfigReferences(manifest: RulesPackageManifest, registry: RulesRegistry, issues: PackageValidationIssue[]): void {
  const optionalRuleKeys = new Set((manifest.optionalRules ?? []).map((rule) => rule.key))
  const requiredTraitKeys = new Set((manifest.requiredTraits ?? []).map((declaration) => `${declaration.kind} ${declaration.trait}`))

  for (const definition of registry.listAll()) {
    for (const expression of collectExpressions(definition)) {
      for (const dependency of extractDependencies(expression.ast as RuleExpressionNode)) {
        if (dependency.namespace !== 'world') continue

        const traitPath = parseWorldTraitPath(dependency.path)
        if (!traitPath) continue

        if (traitPath.kind === WORLD_CONFIG_RULES_KIND) {
          if (!optionalRuleKeys.has(traitPath.key)) {
            issues.push({
              severity: 'error',
              code: 'undeclared-optional-rule-reference',
              message: `'@world:rules.${traitPath.key}' on '${definition.id}' does not name a key declared in manifest.optionalRules`,
              definitionId: definition.id
            })
          }
          continue
        }

        if (!requiredTraitKeys.has(`${traitPath.kind} ${traitPath.key}`)) {
          issues.push({
            severity: 'error',
            code: 'undeclared-required-trait-reference',
            message: `'@world:${traitPath.kind}.${traitPath.key}' on '${definition.id}' does not name a (kind, trait) pair declared in manifest.requiredTraits`,
            definitionId: definition.id
          })
        }
      }
    }
  }
}
