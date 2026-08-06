// Rules Engine Dependency Graph construction.
// See .github/docs/architecture/rules-engine.md §14.7 (dependency
// extraction), §15.1 ("two-layer graph"), and §14.8 (cycles -- explicitly
// NOT this commit's job) for the design this implements.
//
// This module answers exactly the RESPONSIBILITY this task names: what
// does Definition X depend on, what depends on X, what are its incoming/
// outgoing edges. It performs NO computation, NO cycle detection, NO
// topological ordering, NO evaluation, NO scheduling, NO caching beyond the
// graph's own indexes. It is a pure, one-shot builder: RulesRegistry (+
// already-implemented Dependency Extraction) in, an immutable
// DependencyGraph out.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS AND GAPS FOUND (expanded in the commit Summary)
// ---------------------------------------------------------------------------
// 1. Two edge sources, both required for soundness. Expression-derived
//    edges (calling extractDependencies() (./dependencies.ts) on every
//    Expression embedded in a Definition) were the whole story in the prior
//    commit. That left the graph unsound for static cycle detection: a
//    Modifier's `target`, an Action's `roll`, and an ActionCost's
//    `resource` are direct DefinitionId links that never go through
//    Expression/EEL syntax, so a cycle routed through one of them (e.g. a
//    Modifier whose condition reads a Value that the Modifier itself
//    targets) was invisible. collectStructuralEdges() below adds exactly
//    these -- see decision 5 for the exhaustive field-by-field inspection
//    that produced this list, and decision 6 for why several
//    superficially-similar fields were deliberately excluded.
//
// 2. Namespace scoping (Expression-derived edges only) mirrors
//    reference-validation.ts exactly, for the same reason: of the six
//    ReferenceNamespace values, only 'value' and 'collection' ever
//    correspond to a Definition the registry can contain. A dependency in
//    the other four namespaces ('sources', 'ctx', 'world', 'choice') is
//    never turned into a graph edge -- not a gap, the same structural
//    boundary already established and tested there.
//
// 3. "Graph construction should fail cleanly if prerequisite validation has
//    not succeeded" is read literally and applies uniformly to BOTH edge
//    sources: if a 'value'/'collection' namespace dependency's key, a
//    Modifier's target, an Action's roll, or an ActionCost's resource does
//    not resolve via registry.has(...), that is treated as a broken
//    precondition and construction fails with a collected error -- unlike
//    reference-validation.ts itself, which silently reports non-existence
//    as its OWN diagnostic rather than failing outright, because at that
//    earlier stage an unresolved reference is the expected, ordinary thing
//    being checked for, not a violated precondition.
//
// 4. Expression.ast is still typed as the loose ExpressionNode placeholder
//    (types.ts), not the canonical RuleExpressionNode (ast.ts) -- flagged
//    as deliberately unwired when the AST landed ("wiring Expression.ast to
//    this stricter union is left to a later commit"), and still true.
//    collectExpressions() below therefore casts `expression.ast as
//    RuleExpressionNode` at the one call site that needs it, rather than
//    silently working around the mismatch or touching ast.ts/types.ts,
//    which this commit is not scoped to change.
//
// 5. Structural edges added, with direction, and why evaluation/validity
//    genuinely depends on each:
//      - ModifierDefinition.target -- INVERTED. §16.4's phase pipeline
//        means a Value's *resolved result* incorporates every active
//        Modifier targeting it, every time it is evaluated -- so the
//        target depends on the modifier, not the reverse
//        (`{dependent: modifier.target, dependency: modifier.id}`).
//        Applies to both standalone ModifierDefinitions (registry.listAll()
//        entries with kind 'modifier') and inline modifiers embedded in
//        SourceDefinition.modifiers[] -- an inline modifier has no id of
//        its own, so its target edge is attributed to the owning Source,
//        exactly matching how its Expression-derived value/condition
//        dependencies are already attributed to that Source
//        (collectExpressions' existing 'source' case).
//      - ActionDefinition.roll -- forward. An Action's own definition needs
//        its named RollSpec to exist to be invokable at all
//        (`{dependent: action.id, dependency: action.roll}`).
//      - ActionCost.resource -- forward, same reasoning, once per cost
//        entry (`{dependent: action.id, dependency: cost.resource}`).
//
// 6. Fields inspected and deliberately NOT turned into edges (the task's
//    own warning against inventing edges "merely because two definitions
//    reference each other" applies directly to several of these):
//      - CollectionFieldDefinition.refKind -- typed `string`, not
//        DefinitionId. It names a *category* a ref-typed item field points
//        at (analogous to ValueDefinition.valueType:'ref'), not a specific
//        Definition; which Definition an instance actually references is
//        chosen per-item at the ActorState/CollectionInstanceItem level
//        (runtime data), never declared statically in the package.
//      - SourceDefinition.suppresses -- typed `string[]`, and its own
//        existing comment says why: "Source IDs or tag predicates... kept
//        loose... since the predicate shape itself is not specified."
//        Entries are not reliably identifiable as DefinitionIds (some may
//        be tag predicates), so treating them uniformly as edges would be
//        exactly the invented-edge case this task warns against. Also
//        conceptually closer to §15.1's per-actor "dynamic overlay" (which
//        modifiers/sources are currently active) than to the static
//        formula-derivation skeleton this graph models.
//      - ActionEffect.target -- looks identical in shape to
//        ModifierDefinition.target, but is a fundamentally different kind
//        of relationship: a Modifier participates in a Value's derivation
//        *every time it is read* (§16.4's phase pipeline runs on every
//        evaluation), while an Action's effect is an imperative, one-shot
//        state mutation triggered by invocation (§17.1) that happens
//        entirely outside the pull-based derivation model (§15.2) this
//        graph exists to order. Evaluating `value:stress.current` does not
//        require knowing about `action:rage`'s effects the way it requires
//        knowing about an active Modifier targeting it. Whether the
//        effect's target even exists is a reference-validation concern
//        (already a known, separately-flagged gap there), not a dependency
//        edge here.
//      - ModifierDefinition.modifierType, ActionInputDefinition.kind,
//        RollSelection.keep, RollSuccessRule.kind -- open, package-defined
//        category strings (stacking-policy keys, input kinds, selection/
//        success-rule vocabulary), never DefinitionIds and never resolved
//        against the registry anywhere in the architecture.
//      - CollectionSlotDefinition.id, ActionInputDefinition.id,
//        RollDegree.id -- each is that structure's OWN local identifier
//        (a slot name, an input name, a degree label), not a reference to
//        another Definition.
//      - RollReroll.when -- typed `string`, not Expression (unlike
//        RollDegree.when, which is genuinely `Expression` and already
//        Expression-derived-handled) -- nothing to extract a dependency
//        from either way.

import type { RuleExpressionNode } from './ast'
import { extractDependencies } from './dependencies'
import type { RulesRegistry } from './registry'
import type {
  ActionDefinition,
  Definition,
  DefinitionId,
  Expression,
  ModifierDefinition,
  RollSpec
} from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type DependencyGraphNode = {
  id: DefinitionId
  dependencies: readonly DefinitionId[]
  dependents: readonly DefinitionId[]
}

export type GraphConstructionError = {
  message: string
  definitionId?: DefinitionId
  dependencyKey?: string
}

export type GraphConstructionResult =
  | { ok: true; graph: DependencyGraph }
  | { ok: false; errors: GraphConstructionError[] }

// The Dependency Graph (§15.1): an immutable, indexed view over a
// registry's Definitions and the edges their Expressions and direct
// DefinitionId links imply. Construct
// only via DependencyGraph.build -- the constructor is private so an
// instance can never exist with a hand-assembled (and therefore possibly
// inconsistent) index, matching RulesRegistry's own established pattern.
export class DependencyGraph {
  private static readonly EMPTY: readonly DefinitionId[] = Object.freeze([])

  private constructor(private readonly nodes: ReadonlyMap<DefinitionId, DependencyGraphNode>) {}

  // Builds a DependencyGraph from every Definition in `registry`. Every
  // Definition gets a node, even one with zero edges in either direction
  // (an isolated Definition, or one in its own disconnected component).
  // Collects every construction error rather than failing on the first,
  // matching this session's established registry/validation pattern.
  static build(registry: RulesRegistry): GraphConstructionResult {
    const errors: GraphConstructionError[] = []
    // ModifierDefinition.id is optional at the type level (./types.ts), but
    // RulesRegistry.create already rejects any Definition lacking one
    // (registry.ts) -- ids() pairs each Definition with its guaranteed-
    // populated id once, rather than re-asserting it at every use site.
    const definitions = ids(registry.listAll())

    const dependencies = new Map<DefinitionId, Set<DefinitionId>>()
    const dependents = new Map<DefinitionId, Set<DefinitionId>>()
    for (const { id } of definitions) {
      dependencies.set(id, new Set())
      dependents.set(id, new Set())
    }

    for (const { id, definition } of definitions) {
      for (const expression of collectExpressions(definition)) {
        for (const dependency of extractDependencies(expression.ast as RuleExpressionNode)) {
          if (dependency.namespace !== 'value' && dependency.namespace !== 'collection') {
            // sources / ctx / world / choice -- never a Definition edge;
            // see design decision 2 above.
            continue
          }
          if (!registry.has(dependency.key)) {
            errors.push({
              message: `Definition '${id}' depends on '${dependency.key}', which does not exist in the registry -- graph construction requires reference validation to have already passed`,
              definitionId: id,
              dependencyKey: dependency.key
            })
            continue
          }
          dependencies.get(id)!.add(dependency.key)
          dependents.get(dependency.key)!.add(id)
        }
      }

      for (const edge of collectStructuralEdges(id, definition)) {
        if (!registry.has(edge.dependent) || !registry.has(edge.dependency)) {
          errors.push({
            message: edge.message,
            definitionId: id,
            dependencyKey: registry.has(edge.dependency) ? edge.dependent : edge.dependency
          })
          continue
        }
        dependencies.get(edge.dependent)!.add(edge.dependency)
        dependents.get(edge.dependency)!.add(edge.dependent)
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors }
    }

    const nodes = new Map<DefinitionId, DependencyGraphNode>()
    for (const { id } of definitions) {
      nodes.set(id, {
        id,
        dependencies: Object.freeze([...dependencies.get(id)!]),
        dependents: Object.freeze([...dependents.get(id)!])
      })
    }

    return { ok: true, graph: new DependencyGraph(nodes) }
  }

  has(id: DefinitionId): boolean {
    return this.nodes.has(id)
  }

  getNode(id: DefinitionId): DependencyGraphNode | undefined {
    return this.nodes.get(id)
  }

  getDependencies(id: DefinitionId): readonly DefinitionId[] {
    return this.nodes.get(id)?.dependencies ?? DependencyGraph.EMPTY
  }

  getDependents(id: DefinitionId): readonly DefinitionId[] {
    return this.nodes.get(id)?.dependents ?? DependencyGraph.EMPTY
  }

  // Every Definition the graph has a node for -- the starting point any
  // future graph algorithm (DFS, Kahn's, Tarjan's) would iterate from.
  // Not itself a graph algorithm: plain enumeration of what's already
  // indexed.
  listNodes(): readonly DefinitionId[] {
    return Object.freeze([...this.nodes.keys()])
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ids(definitions: readonly Definition[]): Array<{ id: DefinitionId; definition: Definition }> {
  const result: Array<{ id: DefinitionId; definition: Definition }> = []
  for (const definition of definitions) {
    if (definition.id) result.push({ id: definition.id, definition })
  }
  return result
}

// ---------------------------------------------------------------------------
// Expression collection (design decision 1: Expression-derived edges only)
// ---------------------------------------------------------------------------

function isExpression(value: unknown): value is Expression {
  return typeof value === 'object' && value !== null && 'text' in value && 'ast' in value
}

function collectModifierExpressions(modifier: ModifierDefinition): Expression[] {
  const expressions: Expression[] = []
  if (isExpression(modifier.value)) expressions.push(modifier.value)
  if (modifier.condition) expressions.push(modifier.condition)
  return expressions
}

function collectActionExpressions(action: ActionDefinition): Expression[] {
  const expressions: Expression[] = []
  for (const cost of action.costs ?? []) expressions.push(cost.amount)
  for (const prerequisite of action.prerequisites ?? []) expressions.push(prerequisite)
  for (const outcome of action.outcomes ?? []) {
    expressions.push(outcome.when)
    for (const effect of outcome.effects) {
      if (effect.by) expressions.push(effect.by)
    }
  }
  return expressions
}

function collectRollExpressions(roll: RollSpec): Expression[] {
  const expressions: Expression[] = [roll.dice]
  if (isExpression(roll.successRule.threshold)) expressions.push(roll.successRule.threshold)
  for (const degree of roll.degrees ?? []) expressions.push(degree.when)
  return expressions
}

// ---------------------------------------------------------------------------
// Structural edge collection (design decisions 5 and 6: direct DefinitionId
// links that never go through Expression/EEL syntax)
// ---------------------------------------------------------------------------

// `dependent`/`dependency` match DependencyGraphNode's own vocabulary
// exactly (`dependencies[X] ∋ Y` means "X depends on Y") -- deliberately
// not `from`/`to`, which would invite exactly the directionality mistake
// design decision 5 above warns about for ModifierDefinition.target.
// `message` is pre-formatted per edge kind so a missing target produces a
// clear, specific diagnostic rather than one generic sentence reused for
// every case.
type StructuralEdge = {
  dependent: DefinitionId
  dependency: DefinitionId
  message: string
}

function collectStructuralEdges(id: DefinitionId, definition: Definition): StructuralEdge[] {
  switch (definition.kind) {
    case 'value':
    case 'resource':
    case 'collection':
    case 'roll':
      return []

    case 'modifier':
      return [
        {
          dependent: definition.target,
          dependency: id,
          message: `Modifier '${id}' targets '${definition.target}', which does not exist in the registry`
        }
      ]

    case 'source':
      return definition.modifiers.map((modifier) => ({
        dependent: modifier.target,
        dependency: id,
        message: `Source '${id}' has a modifier targeting '${modifier.target}', which does not exist in the registry`
      }))

    case 'action': {
      const edges: StructuralEdge[] = []
      if (definition.roll) {
        edges.push({
          dependent: id,
          dependency: definition.roll,
          message: `Action '${id}' uses Roll '${definition.roll}', which does not exist in the registry`
        })
      }
      for (const cost of definition.costs ?? []) {
        edges.push({
          dependent: id,
          dependency: cost.resource,
          message: `Action '${id}' has a cost referencing Resource '${cost.resource}', which does not exist in the registry`
        })
      }
      return edges
    }

    case undefined:
      // Unreachable -- see the identical note in collectExpressions below.
      return []

    default: {
      const exhaustive: never = definition
      return exhaustive
    }
  }
}

// Every Expression embedded anywhere inside one Definition -- the complete
// set of formulas whose references become that Definition's outgoing
// edges. CollectionDefinition contributes none (its itemSchema's
// `default?` fields are RuleValue, never Expression).
function collectExpressions(definition: Definition): Expression[] {
  switch (definition.kind) {
    case 'value':
      return definition.formula ? [definition.formula] : []
    case 'resource':
      return isExpression(definition.max) ? [definition.max] : []
    case 'collection':
      return []
    case 'modifier':
      return collectModifierExpressions(definition)
    case 'action':
      return collectActionExpressions(definition)
    case 'roll':
      return collectRollExpressions(definition)
    case 'source':
      return definition.modifiers.flatMap(collectModifierExpressions)
    case undefined:
      // Unreachable: RulesRegistry.create rejects any Definition without a
      // populated `kind` at construction time (registry.ts), so nothing
      // registry.listAll() returns can reach this branch. Present only
      // because ModifierDefinition.kind is optional at the type level.
      return []
    default: {
      const exhaustive: never = definition
      return exhaustive
    }
  }
}
