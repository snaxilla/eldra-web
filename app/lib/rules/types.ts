// Shared Rules Engine types.
// See .github/docs/architecture/rules-engine.md for the canonical design.
//
// This is the first Rules Engine commit, mirroring how the Scene Graph began
// with app/lib/eldra/scene.ts: shared types only, before any parser,
// evaluator, dependency graph, persistence, or UI exists. Nothing in this
// file has executable behavior. No consumer imports it yet.
//
// A few fields are deliberately loose (`[key: string]: any`, bare `string`
// instead of a literal union) rather than invented, matching the same
// permissiveness Scene Graph uses for LayerObjectGeometry/Properties/Style.
// This happens in two situations:
//   1. The architecture document describes the *shape* but was never
//      explicit that a field's value set is closed (e.g. RollSpec's
//      `successRule.kind`, `selection.keep`). Only fields the document
//      explicitly calls a "closed registry" or a fixed/named list (Semantic
//      Roles, Visibility, Modifier phases, Source duration kinds) are
//      modeled as literal unions here.
//   2. The full shape is explicitly out of scope for this commit (the
//      expression grammar/AST beyond the one required `unresolved` node
//      kind -- see ExpressionNode below).
// See the commit's Summary for the complete list of ambiguities this
// surfaced, so a future commit resolves them deliberately rather than by
// accident.

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

// Format: `<kind>:<slug>` (e.g. `value:might`, `action:strike`,
// `collection:inventory`). Opaque and permanent -- never derived from a
// label, and renaming one is a breaking change requiring a migration step
// (architecture §12.6, §25.3).
export type DefinitionId = string

// ---------------------------------------------------------------------------
// Closed vocabularies (architecture explicitly describes these as fixed)
// ---------------------------------------------------------------------------

// §24.3: "Every Value Definition, Action, and Roll declares
// visibility: 'public' | 'owner' | 'gm'."
export type Visibility = 'public' | 'owner' | 'gm'

// §16.4: six phases, applied in this fixed order. "Fixed phase order is a
// deliberate constraint." Reused by TraceStep.op, since a trace step's
// operation is drawn from the same fixed set.
export type ModifierPhase = 'base' | 'set' | 'add' | 'scale' | 'clamp' | 'final'

// §16.3: modifier stacking policy. "Unknown types default to `stack` with a
// validation warning" -- so ModifierDefinition.modifierType itself stays a
// plain string (open, package-defined key), but the stacking policy value a
// package may declare for a given modifierType is this closed set.
export type ModifierStacking = 'stack' | 'highest' | 'lowest' | 'exclusive'

// §16.7: "Declared on the Source instance (`rounds`, `minutes`,
// `until-rest`, `permanent`, `custom`)."
export type SourceDurationKind = 'rounds' | 'minutes' | 'until-rest' | 'permanent' | 'custom'

// §12.4: "Eldra Core defines a **closed registry of roles**." Adding a role
// is a minor engine version bump (rule 5); binding to one is always
// optional at the package level.
export type SemanticRole =
  | 'vitality'
  | 'movement.speed'
  | 'initiative'
  | 'encumbrance.capacity'
  | 'encumbrance.load'
  | 'currency'
  | 'identity.name'
  | 'identity.portrait'
  | 'level'
  | 'proficiency'

// §11.8: draft is a mutable workspace; published is immutable and the only
// status that can be bound to a campaign or evaluated.
export type PackageStatus = 'draft' | 'published'

// Authorable field/value types (§12.1's ValueDefinition example comment).
// Distinct from RuleValue below, which is the runtime value union -- not
// every RuleValue shape (e.g. RulesError) is something a package can
// declare a field as.
export type RuleValueType = 'number' | 'text' | 'boolean' | 'enum' | 'ref' | 'diceSpec'

// ---------------------------------------------------------------------------
// Expressions (§14) -- text + AST are both canonical (§14.1); this commit
// declares the container and the one required node kind only. The full
// expression grammar (literals, references, calls, operators, ...) is
// parser/AST work, explicitly out of scope here.
// ---------------------------------------------------------------------------

// Deliberately permissive, matching Scene Graph's LayerObjectGeometry
// pattern: a known discriminant plus an index signature for whatever the
// eventual parser/AST commit adds. UnresolvedExpressionNode below is the
// only concrete node kind this commit defines.
export type ExpressionNode = {
  kind: string
  [key: string]: any
}

// §14.12. Marks a formula a translation adapter could not produce. Type-
// checks and evaluates as `error` (§14.4), contributes no dependency edges,
// cannot participate in a cycle, and blocks publication (§11.8) -- a
// published package can never contain one. `hint` is inert: a suggestion
// for a human, never evaluated.
export type UnresolvedExpressionNode = {
  kind: 'unresolved'
  reason: string
  note?: string
  hint?: Expression
}

// Both forms are canonical (§14.1): text is what humans author/diff, ast is
// what the engine evaluates and extracts dependencies from. Neither is
// derived from a stored copy of the other at read time -- a parser keeps
// them in sync when one changes.
export type Expression = {
  text: string
  ast: ExpressionNode
}

// ---------------------------------------------------------------------------
// Runtime values (§14.3, §14.4, §14.6)
// ---------------------------------------------------------------------------

// §14.5: dice() constructs this; it is never rolled during derived-value
// evaluation (§14.6) -- only the (not-yet-built) Roll Engine consumes one.
// Loosely typed beyond count/faces because keepHighest/keepLowest/explode/
// reroll modifiers (§14.5) are not modeled in this commit.
export type DiceSpec = {
  count: number
  faces: number
  [key: string]: any
}

// §14.3's type list (number/text/boolean/enum/ref/list/diceSpec/error),
// encoded directly: `enum`/`ref` are represented as `string` at the value
// level (their authored domain is a RuleValueType concern, not a distinct
// runtime shape), `list<T>` is `RuleValue[]`, and per §14.4 ("errors
// propagate as a distinct `error` value carrying a reason and the
// definition ID") RulesError itself doubles as the error-value variant --
// no separate wrapper is introduced. `1 + error` staying `error` therefore
// falls out of RuleValue's own shape rather than a special evaluator case.
export type RuleValue =
  | number
  | string
  | boolean
  | RuleValue[]
  | DiceSpec
  | RulesError

// ---------------------------------------------------------------------------
// Errors and traces (§14.4, §14.11, §15.5, §27, §28)
// ---------------------------------------------------------------------------

export type SourceSpan = {
  start: number
  end: number
}

// Combines §14.11's authoring-error shape ({definitionId, span, message,
// suggestion}) with §14.4's runtime-error description ("a reason and the
// definition ID"). Used both when validation rejects a package and as the
// `error` variant of RuleValue during evaluation -- span is only ever
// populated for the former.
export type RulesError = {
  definitionId: DefinitionId
  message: string
  reason?: string
  span?: SourceSpan
  suggestion?: string
}

// §27.1's worked example, cross-referenced against §15.5's field list
// ({step, label, sourceId, operation, operand, runningValue}) -- the two
// disagree on field names. §27.1 is the concrete, fully worked JSON example
// and is used here; see the commit Summary for this discrepancy.
export type TraceStep = {
  op: ModifierPhase
  label: string
  value: RuleValue
  running: RuleValue
  sourceId?: DefinitionId
  modifierType?: string
  // §27.3: a GM-only source appears as `{label: "Hidden", redacted: true}`
  // to non-GM viewers, computed server-side -- never naming the real source.
  redacted?: boolean
}

export type Trace = {
  path: DefinitionId
  result: RuleValue
  steps: TraceStep[]
}

// ---------------------------------------------------------------------------
// Evaluation (§15)
// ---------------------------------------------------------------------------

// §15.6: `actors`/`world` are reserved for cross-actor evaluation (opposed
// checks, party travel) and are unused in V1, which only ever populates
// "self". ActorStateRef/WorldConfigSnapshotRef are referenced by the
// architecture but never given a shape -- declared as opaque records
// pending that decision; see the commit Summary.
export type ActorStateRef = Record<string, any>
export type WorldConfigSnapshotRef = Record<string, any>

export type EvaluationContext = {
  purpose?: string
  actors?: Record<string, ActorStateRef>
  world?: WorldConfigSnapshotRef
  tags?: string[]
  seed?: string
}

// Named by the architecture (§34) but never given an explicit shape.
// Modeled as "the resolved value, plus a trace when tracing was on" --
// tracing is off by default and costs nothing until requested (§15.5,
// §27.2), so `trace` is optional rather than always present.
export type EvaluationResult = {
  value: RuleValue
  trace?: Trace
}

// ---------------------------------------------------------------------------
// Definitions (§12) -- the five primitives (Value, Collection, Modifier,
// Action, Roll) plus Source and Resource, which have concrete worked JSON
// shapes elsewhere in the architecture. Table, Progression, and ChoiceSet
// are named as "kept" supporting types (§12.2) but no shape for any of the
// three appears anywhere in the architecture document -- they are
// deliberately NOT modeled here rather than invented; see the commit
// Summary.
// ---------------------------------------------------------------------------

export type ValueStorage = 'stored' | 'derived'

export type ValueConstraints = {
  min?: number
  max?: number
  [key: string]: any
}

// §12.1: attributes, skills, saves, defenses, and derived values are all
// this one type -- the difference is `storage`, `tags`, and whether
// `formula` is present. There is no separate AttributeDefinition.
export type ValueDefinition = {
  id: DefinitionId
  kind: 'value'
  valueType: RuleValueType
  storage: ValueStorage
  default?: RuleValue
  constraints?: ValueConstraints
  visibility?: Visibility
  label?: string
  tags?: string[]
  formula?: Expression
}

// §12.5: "kind: 'resource' is declared sugar that the loader expands into
// two Values plus a constraint plus a resourceOf back-link." Modeled as its
// own Definition variant (not just documented in prose) because the
// architecture's own worked proof-package examples author it directly with
// its own `id`/`kind`, and this commit's contract must be able to represent
// those examples faithfully.
export type ResourceDefinition = {
  id: DefinitionId
  kind: 'resource'
  label?: string
  visibility?: Visibility
  max: Expression | RuleValue
}

export type CollectionFieldDefinition = {
  key: string
  valueType: RuleValueType
  default?: RuleValue
  refKind?: string
}

export type CollectionSlotDefinition = {
  id: string
  capacity: number
}

// §12.3: kept as a primitive (not "a Value of type list") because
// collection items are addressable by modifiers/expressions, sheets render
// them as repeating structures, and items need per-item identity stable
// across reordering -- the same reasoning as Scene Graph Layer Objects.
export type CollectionDefinition = {
  id: DefinitionId
  kind: 'collection'
  label?: string
  itemSchema: CollectionFieldDefinition[]
  slots?: CollectionSlotDefinition[]
}

// §16.1/§16.5. `id`/`kind` are optional: the architecture shows two distinct
// authoring shapes -- a standalone reusable template under
// definitions/modifiers/ (has its own id, e.g. `mod:shield.defense`) and a
// modifier embedded inline inside a SourceDefinition.modifiers[] (no id of
// its own, scoped to that Source). Both are the same type; only the
// standalone form participates in the Definition union with a populated id.
export type ModifierDefinition = {
  id?: DefinitionId
  kind?: 'modifier'
  target: DefinitionId
  phase: ModifierPhase
  modifierType?: string
  value: Expression | RuleValue
  condition?: Expression
  order?: number
  label?: string
  suppressible?: boolean
}

// §16.1, §16.6, §16.7: what Modifiers attach to. Items, conditions,
// features, progression grants, and campaign extensions are all Sources.
export type SourceDuration = {
  kind: SourceDurationKind
  remaining?: number
}

export type SourceDefinition = {
  id: DefinitionId
  kind: 'source'
  label?: string
  modifiers: ModifierDefinition[]
  duration?: SourceDuration
  // §16.6: Source IDs or tag predicates this Source suppresses. Not
  // transitive in V1 -- kept loose (not modeled further) since the
  // predicate shape itself is not specified in the architecture.
  suppresses?: string[]
}

// §17.3. One structure serving all three proof families (d20 roll-over/
// advantage, percentile roll-under, dice pool) plus manual/GM-narrated
// resolution -- see `successRule.kind: 'manual'`. `selection.keep` and
// `successRule.kind` are left as `string` rather than literal unions: the
// architecture shows concrete values ('all', 'highest', 'atLeast',
// 'atMost', 'countAtLeast', 'manual') but never states this vocabulary is
// closed, unlike ModifierPhase/SemanticRole/Visibility/SourceDurationKind
// above.
export type RollSelection = {
  keep: string
  count?: number
}

export type RollReroll = {
  when: string
  limit?: number
}

export type RollSuccessRule = {
  kind: string
  threshold?: Expression | RuleValue
}

export type RollDegree = {
  id: string
  when: Expression
}

export type RollSpec = {
  id: DefinitionId
  kind: 'roll'
  label?: string
  // §14.6: constructs a diceSpec; never rolled during derived-value
  // evaluation. §17.7 describes a future generalization of this field into
  // a `randomizer` union with `dice`/`table`/`card` kinds -- not modeled
  // here since every concrete worked example still shows a plain `dice`
  // Expression field.
  dice: Expression
  selection?: RollSelection
  reroll?: RollReroll | null
  successRule: RollSuccessRule
  degrees?: RollDegree[]
}

export type ActionCost = {
  resource: DefinitionId
  amount: Expression
}

// §17.1: `kind` here is the action-input's own kind (e.g. "actor"), a
// separate concept from Definition.kind. Left as `string`: only one example
// value appears in the architecture and it is not described as closed.
export type ActionInputDefinition = {
  id: string
  kind: string
  optional?: boolean
}

// §17.1's example elides the effect shape with `/* … */`; the only
// concrete effect shown anywhere in the architecture is
// { op: "adjust", target: "value:stress.current", by: { text: "1" } }
// (§22A Appendix). `op` is left as `string` (open) since the architecture
// makes no claim this is a closed vocabulary.
export type ActionEffect = {
  op: string
  target: DefinitionId
  by?: Expression
  [key: string]: any
}

export type ActionOutcome = {
  when: Expression
  effects: ActionEffect[]
}

// §17.6: `template` names an Eldra-provided output template. Four are
// named in prose (check/damage/simple/table-result) but, consistent with
// this file's closed-vs-open rule, that list is not stated as exhaustive,
// so `template` stays `string`.
export type ActionPresentation = {
  template: string
  title?: string
}

export type ActionDefinition = {
  id: DefinitionId
  kind: 'action'
  label?: string
  costs?: ActionCost[]
  prerequisites?: Expression[]
  inputs?: ActionInputDefinition[]
  roll?: DefinitionId
  outcomes?: ActionOutcome[]
  presentation?: ActionPresentation
}

// The nine authorable kinds this commit can represent. Table, Progression,
// and ChoiceSet are deliberately absent -- see the block comment above this
// section.
export type Definition =
  | ValueDefinition
  | ResourceDefinition
  | CollectionDefinition
  | ModifierDefinition
  | ActionDefinition
  | RollSpec
  | SourceDefinition

// ---------------------------------------------------------------------------
// Package manifest (§11.2, §11.8, §11.9)
// ---------------------------------------------------------------------------

// §11.9: package-level identity only -- "who produced this package, from
// what, at what version." Per-definition provenance, confidence, review
// state, and diagnostics live in the Translation Receipt (§22A.3), which
// is stored alongside a package and is explicitly out of scope for this
// commit. `kind: 'authored'` is named by the architecture; in practice
// `origin` is described as entirely absent for hand-authored packages, so
// 'authored' may end up unused -- kept because the architecture states it.
export type PackageOrigin = {
  kind: 'authored' | 'translated'
  adapterId?: string
  adapterVersion?: string
  sourceId?: string
  sourceHash?: string
  receiptRef?: string
}

export type PackageAuthor = {
  name: string
  url?: string
}

export type PackageLicense = {
  id: string
  notice?: string
  attribution?: string
}

export type PackageModule = {
  id: string
  title: string
  default?: boolean
}

export type PackageLocalization = {
  default: string
  available: string[]
}

// §11.2. `capabilities`/`dependencies` must be empty in V1 (§11.5, §23.4) --
// that constraint is enforced by a future validator, not by this type.
// `integrity` is optional: per §11.8, a draft package has none; only a
// published package's integrity hash is its identity.
export type RulesPackageManifest = {
  packageId: string
  version: string
  status: PackageStatus
  engineApiVersion: string
  stateSchemaVersion: number
  origin?: PackageOrigin
  title: string
  description?: string
  authors?: PackageAuthor[]
  license: PackageLicense
  integrity?: string
  capabilities: string[]
  dependencies: string[]
  modules?: PackageModule[]
  semanticRoles?: Partial<Record<SemanticRole, DefinitionId>>
  localization?: PackageLocalization
}

// ---------------------------------------------------------------------------
// Character/Actor state (§13)
// ---------------------------------------------------------------------------

// §13.5: user-created values the package never defined. Never referenced by
// package expressions; survive package upgrades untouched.
export type CustomValue = {
  valueType: RuleValueType
  value: RuleValue
}

// Item shape is defined per-Collection by that CollectionDefinition's
// itemSchema (§13.1), so beyond instanceId this is intentionally as loose
// as Scene Graph's LayerObjectProperties.
export type CollectionInstanceItem = {
  instanceId: string
  [key: string]: any
}

// §13.1, §16.7: an active modifier-carrying Source not held in a Collection
// (an active condition, an equipped-independent effect, ...).
export type SourceInstance = {
  instanceId: string
  sourceRef: DefinitionId
  duration?: SourceDuration
}

// §13.2: only user decisions are stored here. Anything recomputable from
// stored state + package + world config is derived and never appears in
// this type -- there is deliberately no "derived values" field.
export type ActorState = {
  actorId: string
  packageId: string
  packageVersion: string
  stateSchemaVersion: number
  enabledModules?: string[]
  values: Record<DefinitionId, RuleValue>
  collections: Record<DefinitionId, CollectionInstanceItem[]>
  choices: Record<DefinitionId, RuleValue>
  sources: SourceInstance[]
  custom?: Record<string, CustomValue>
  // §13.6: campaign-scoped additions, keyed `campaign:<campaignId>:<slug>`
  // so they can never collide with package-defined IDs.
  campaignExtensions?: Record<string, any>
}
