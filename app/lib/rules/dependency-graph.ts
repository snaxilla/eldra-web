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
// 1. Only Expression-derived edges are captured. "Implement a graph builder
//    using: RulesRegistry, Dependency Extraction... Do not walk raw ASTs
//    outside the existing extraction APIs" scopes edge discovery to calling
//    extractDependencies() (./dependencies.ts) on every Expression embedded
//    in a Definition -- nothing more. Several Definition fields are direct
//    DefinitionId links that do NOT go through Expression/EEL syntax at
//    all, and are therefore NOT represented as edges here:
//    ModifierDefinition.target, ActionDefinition.roll, ActionCost.resource.
//    These are real, structural dependency relationships (a Modifier
//    genuinely affects its target; an Action genuinely needs its Roll and
//    its cost's Resource to exist) that a complete evaluation-ordering
//    graph would eventually need -- deliberately left out rather than
//    invented, since capturing them would mean writing new traversal logic
//    the task explicitly asks this commit not to write.
//
// 2. Namespace scoping mirrors reference-validation.ts exactly, for the
//    same reason: of the six ReferenceNamespace values, only 'value' and
//    'collection' ever correspond to a Definition the registry can
//    contain. A dependency in the other four namespaces ('sources', 'ctx',
//    'world', 'choice') is never turned into a graph edge -- not a gap,
//    the same structural boundary already established and tested there.
//
// 3. "Graph construction should fail cleanly if prerequisite validation has
//    not succeeded" is read literally: if a 'value'/'collection' namespace
//    dependency's key does not resolve via registry.has(...), that is
//    treated as a broken precondition (reference validation should have
//    already caught this and never handed a package on to graph
//    construction) and construction fails with a collected error --
//    unlike reference-validation.ts itself, which silently reports
//    non-existence as its OWN diagnostic rather than failing outright,
//    because at that earlier stage an unresolved reference is the expected,
//    ordinary thing being checked for, not a violated precondition.
//
// 4. Expression.ast is still typed as the loose ExpressionNode placeholder
//    (types.ts), not the canonical RuleExpressionNode (ast.ts) -- flagged
//    as deliberately unwired when the AST landed ("wiring Expression.ast to
//    this stricter union is left to a later commit"), and still true.
//    collectExpressions() below therefore casts `expression.ast as
//    RuleExpressionNode` at the one call site that needs it, rather than
//    silently working around the mismatch or touching ast.ts/types.ts,
//    which this commit is not scoped to change.

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
// registry's Definitions and the edges their Expressions imply. Construct
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
