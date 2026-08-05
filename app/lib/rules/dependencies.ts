// Rules Engine dependency extraction.
// See .github/docs/architecture/rules-engine.md §14.7 for the canonical
// design: "Walking the AST for reference nodes yields the exact dependency
// set, for free, at validation time. No author annotation, no runtime
// discovery, no Roll20-style manual `getAttrs` lists."
//
// This module answers exactly one question: "which references does this
// already-parsed RuleExpressionNode touch?" It performs NO evaluation, NO
// type checking, NO package/definition lookup, NO semantic validation, NO
// cycle detection, and builds NO dependency graph (§14.7 is one step of a
// larger §15 "Dependency and Evaluation Engine" this commit does not
// implement). It consumes an AST the parser already produced; it does not
// parse text and does not change the parser or the AST.

import type { ReferenceNamespace, RuleExpressionNode } from './ast'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Mirrors ReferenceExpressionNode's own shape (ast.ts) rather than inventing
// a new one: a dependency *is* a reference the expression contains. `key` is
// the normalized, deduplication-ready identity -- `${namespace}:${path}` when
// a path is present, or just `namespace` for the pathless `@sources` form --
// chosen so a future evaluator/cache/graph consumer can use it directly as a
// Map/Set key without re-deriving its own normalization rule.
export type Dependency = {
  namespace: ReferenceNamespace
  path?: string
  key: string
}

function dependencyKey(namespace: ReferenceNamespace, path: string | undefined): string {
  return path === undefined ? namespace : `${namespace}:${path}`
}

// Walks `node` and returns every reference it depends on, deduplicated by
// `key` and ordered by first occurrence (a fixed AST always visits its
// fields in the same order, so this ordering is deterministic -- not sorted,
// just stable).
//
// Only ReferenceExpressionNode contributes a Dependency. Two things that
// might look like dependencies deliberately do not:
//   - Bare identifiers used inside a collection predicate/aggregate (e.g.
//     the `weight` in `@collection:equipment[weight > 0]`) parse as
//     LiteralExpressionNode{valueType:'text'} (parser.ts's own
//     parseIdentifierAtom comment), not ReferenceExpressionNode -- so they
//     are correctly skipped without any special-casing here. This matches
//     §14.7's "collection filters create a dependency on the whole
//     collection" framing: the source reference is the dependency, not each
//     field name mentioned inside the filter.
//   - LookupExpressionNode.table (e.g. `table:proficiency`) is a bare
//     DefinitionId string, not a ReferenceExpressionNode (ast.ts's own
//     LookupExpressionNode comment: "written bare, with no `@` sigil...
//     modeled as a direct DefinitionId rather than a ReferenceExpressionNode").
//     §14.7 frames extraction as "walking the AST for reference nodes";
//     table is structurally not one. This is a real, known gap -- an
//     expression's dependency on the Table definition it looks up is not
//     surfaced by this function today -- left deliberately unaddressed
//     rather than folded in ad hoc; see the commit Summary.
export function extractDependencies(node: RuleExpressionNode): Dependency[] {
  const seen = new Map<string, Dependency>()
  visit(node, seen)
  return [...seen.values()]
}

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

// One generic recursive descent, one branch per RuleExpressionNode kind,
// visiting every child expression position that kind defines (ast.ts is the
// source of truth for what those positions are). `literal` and `unresolved`
// are the two leaf cases: a literal has no children, and an unresolved node
// "contributes no dependency edges" by explicit architecture decision
// (§14.12) -- its optional `hint` is inert and is not walked.
function visit(node: RuleExpressionNode, seen: Map<string, Dependency>): void {
  switch (node.kind) {
    case 'literal':
      return

    case 'reference': {
      const key = dependencyKey(node.namespace, node.path)
      if (!seen.has(key)) {
        seen.set(key, { namespace: node.namespace, path: node.path, key })
      }
      return
    }

    case 'unary':
      visit(node.operand, seen)
      return

    case 'binary':
      visit(node.left, seen)
      visit(node.right, seen)
      return

    case 'call':
      for (const arg of node.args) visit(arg, seen)
      return

    case 'conditional':
      visit(node.condition, seen)
      visit(node.whenTrue, seen)
      visit(node.whenFalse, seen)
      return

    case 'collection':
      visit(node.source, seen)
      if (node.predicate) visit(node.predicate, seen)
      if (node.aggregate) visit(node.aggregate, seen)
      return

    case 'lookup':
      // node.table is intentionally not visited -- see extractDependencies'
      // doc comment above.
      visit(node.key, seen)
      return

    case 'dice':
      visit(node.count, seen)
      visit(node.faces, seen)
      return

    case 'unresolved':
      return

    default: {
      // Exhaustiveness guard: if RuleExpressionNode ever gains a new member,
      // this fails to typecheck rather than silently under-walking it.
      const exhaustive: never = node
      return exhaustive
    }
  }
}
