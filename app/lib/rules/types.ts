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

// §16.4/§16.10 (revision 3): `base` is reserved for the Value's own
// formula/default -- a Modifier may never declare it (package validation
// error, not modeled by this type; see rules-engine.md §16.4). This is the
// phase vocabulary a Modifier itself may occupy: `set | add | scale | clamp
// | final`. Used below to build ModifierSpec's phase-discriminated union.
export type ModifierApplicationPhase = Exclude<ModifierPhase, 'base'>

// §16.12 (revision 3): a clamp modifier declares its bound explicitly --
// "min" (lower bound) or "max" (upper bound). No inference, ever; the
// evaluator never reads a label to decide which. Required whenever
// `phase === 'clamp'`, enforced structurally by ModifierSpec's
// discriminated union below, not by a runtime check.
export type ClampBound = 'min' | 'max'

// §16.3: modifier stacking policy, declared per `modifierType` at
// `manifest.modifierTypes` (revision 3; see ModifierTypeDeclaration below).
export type ModifierStacking = 'stack' | 'highest' | 'lowest' | 'exclusive'

// §16.3 (revision 3): one declaration in `RulesPackageManifest.modifierTypes`.
// `id` is the key `ModifierSpec.modifierType` names; `stacking` is the
// policy §16.11 applies when multiple candidates target the same
// `(target, phase, modifierType)` group. An undeclared `modifierType` is a
// package validation error -- not modeled by this type, which only carries
// the shape of a valid declaration.
export type ModifierTypeDeclaration = {
  id: string
  stacking: ModifierStacking
  label?: string
}

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

// §16.11A/§16.18 (revision 3): the Modifier Pipeline stage a RulesError
// originated in or was enriched at, for provenance attribution. Named
// exactly per §16.11A's stage list; 'overlay' is reserved for the not-yet-
// implemented Source Overlay (§16.8) and is included now so the type is
// complete rather than needing to grow again once that commit lands.
export type ModifierPipelineStage = 'overlay' | 'condition' | 'candidate-value' | 'clamp-bound' | 'application'

// §16.11A (revision 3): "enrich, never replace" -- provenance is attached
// alongside a RulesError's original `message`/`reason`, never by
// overwriting them. `sourceInstanceId`/`attachmentIndex` are optional
// because not every error has Source/attachment context (e.g. a plain
// unresolved-Definition error has none); `attachmentIndex` in particular
// has no producer yet -- it requires modifier attachment resolution
// (§16.10), which is a later commit.
export type RulesErrorProvenance = {
  targetId: DefinitionId
  stage: ModifierPipelineStage
  sourceDefinitionId?: DefinitionId
  sourceInstanceId?: string
  attachmentIndex?: number
}

// §16.11A/§16.9/§16.12 (revision 3): the closed set of stable, grep-able
// error codes this revision introduces. Declared as a type now so producers
// across the pipeline agree on one vocabulary; `source-field-absent` and
// `clamp-range-impossible` have no producer yet (they require §16.9's
// runtime `@source:` resolution and §16.12's clamp evaluation, both later
// commits) -- included for completeness of the approved contract, per this
// commit's own "types only" scope.
export type RulesErrorCode = 'modifier-condition-not-boolean' | 'source-field-absent' | 'clamp-range-impossible'

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
  code?: RulesErrorCode // NEW (revision 3, §16.18)
  provenance?: RulesErrorProvenance // NEW (revision 3, §16.18)
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
// World Configuration (§19; world-configuration.md §F and §6.1-6.2)
// ---------------------------------------------------------------------------
//
// World Configuration answers "which game are we playing in this world?" --
// it declares no mechanics, defines no Values, and computes nothing (§19.1,
// ADR-006: rules read world config; world config never reads rules). These
// are the types the ENGINE needs. Storage, loading, resolution, binding
// gaps, and defaults all live outside this commit (world-configuration.md
// §18, commits 3-5).

// world-configuration.md §F.4: the scalar subset only -- no lists, no
// `ref`, no `diceSpec` in V1. Lists are excluded for a concrete language
// reason rather than caution: EEL has no membership function, which is
// exactly why expression-language.md §8.1's revision-3 note had to retract
// a `tags`-based filter example as never-satisfiable. Every member is
// already a RuleValue, so a trait can be returned from the evaluator
// without conversion.
export type WorldTraitValue = number | string | boolean

// world-configuration.md §F.2/§F.3: `@world:<kind>.<key>` is a fixed
// TWO-segment lookup, resolved as `traits[kind][key]`. This is the
// decision evaluator.ts previously (and correctly) refused to guess at --
// it is neither arbitrary nested drilling NOR a flat opaque key, but a
// fixed two-level lookup. §19's whole contract is `{kind, traits}`, so a
// one-segment reference has no `kind` and therefore nowhere to resolve.
//
// `traits` is deliberately open (`Record<string, ...>`) rather than a
// closed union of kinds: §19's kinds are setting vocabulary a world
// declares (roadType, calendar, currency, ...), not an engine vocabulary.
// One kind IS engine-reserved -- `rules`, holding optional-rule values
// (world-configuration.md §E.4) -- but reserving it is Package
// Validation's job (commit 2), not this type's.
//
// The snapshot is FROZEN for a session (§F.5): EvaluationSession holds one
// EvaluationContext for its lifetime, so a trait cannot change mid-
// evaluation and memoized values can never go stale within a session --
// the same discipline `sourceOverlay` already follows.
export type WorldConfigSnapshot = {
  worldId: string
  packageId: string
  packageVersion: string
  worldConfigVersion: number
  traits: Record<string, Record<string, WorldTraitValue>>
}

// §19.2: what a Rules Package declares it NEEDS from a world's setting
// vocabulary. `default` is REQUIRED, and that is the whole mechanism
// behind §19.3 -- an unsupplied trait degrades to a named, user-resolvable
// Binding Gap using this default, never a runtime failure. Declared here
// as a manifest field (see RulesPackageManifest below); nothing in this
// commit reads it (that is commit 2's package validation and commit 3's
// resolution).
export type RequiredTraitDeclaration = {
  kind: string
  trait: string
  valueType: 'number' | 'text' | 'boolean'
  default: WorldTraitValue
}

// world-configuration.md §E: optional rules (flanking, gritty rest,
// encumbrance variants, ...) are package-DECLARED and world-SUPPLIED, read
// through the engine-reserved `rules` kind: `@world:rules.<key>`. Typed --
// boolean | number | enum -- never free-form JSON, which is what makes
// both the declaration and the world's supplied value validatable.
//
// Discriminated on `valueType` so `default` cannot disagree with the
// declared type and an `enum` cannot omit its `options` -- a type-level
// guarantee, in the same spirit as ModifierSpec's phase/clamp union above.
export type OptionalRuleDeclaration = {
  key: string
  label: string
  description?: string
} & (
  | { valueType: 'boolean'; default: boolean }
  | { valueType: 'number'; default: number; min?: number; max?: number }
  | { valueType: 'enum'; default: string; options: string[] }
)

// world-configuration.md §J.4-§J.5: BROADCAST policy -- who sees a roll
// when it happens. Deliberately NOT the same vocabulary as `Visibility`
// (§24.3, `public | owner | gm`), which classifies DATA: `blind` (rolled
// now, revealed later) has no meaning as a data classification, and
// collapsing the two into one enum would lose that distinction. Inert in
// V1 -- there are no users, sessions, or multiplayer to enforce it
// against; carried so the RollSpec/roll-type contract does not have to
// change shape when there are.
export type RollVisibility = 'public' | 'gm' | 'self' | 'blind'

// world-configuration.md §D.6-§D.7: where a roll type is offered. This is
// how a future GM toolbar and the Character Sheet DISCOVER roll types
// declaratively, without either one reading the package directly.
export type RollTypeSurface = 'sheet' | 'gm-toolbar' | 'entity'

// world-configuration.md §D: a package-declared default roll type ("Luck
// Roll", "Initiative", "Morale Check"). Explicitly NOT a Semantic Role:
// §12.4's role registry is closed and versioned with the engine, whereas
// roll types are open and package-invented, so routing them through roles
// would mean an engine version bump per roll type -- precisely the
// coupling Semantic Roles exist to prevent.
//
// The engine never reads `id` or `label`; it executes `rollSpec` through
// the existing Roll Service. That is what keeps "Luck Roll" out of the
// engine entirely, per the Roll Service commit's standing constraint
// ("Do not hardcode: Luck Roll, Initiative, Death Saves, Attack Rolls").
export type RollTypeDeclaration = {
  id: string
  label: string
  rollSpec: DefinitionId
  surfaces: RollTypeSurface[]
  visibility?: RollVisibility
  order?: number
}

// ---------------------------------------------------------------------------
// Evaluation (§15)
// ---------------------------------------------------------------------------

// §15.6: `actors` is reserved for cross-actor evaluation (opposed checks,
// party travel) and is unused in V1, which only ever populates "self".
// ActorStateRef is referenced by the architecture but never given a shape
// -- still declared as an opaque record pending that decision.
export type ActorStateRef = Record<string, any>

// `world` is no longer opaque. It was `WorldConfigSnapshotRef`
// (`Record<string, any>`) precisely because resolving `@world:` required a
// decision nobody had made yet; world-configuration.md §F makes it, so the
// placeholder type is removed rather than left as a second, meaningless
// name for the same field. `undefined` means the world is UNCONFIGURED --
// a legal, meaningful state (world-configuration.md §3.3), not an error:
// every `@world:` reference then produces a RulesError, exactly as it did
// before this commit.
export type EvaluationContext = {
  purpose?: string
  actors?: Record<string, ActorStateRef>
  world?: WorldConfigSnapshot
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
  // §16.8 (revision 3): names the `itemSchema` key whose value references a
  // SourceDefinition -- every item whose field resolves instantiates a
  // Source instance in the dynamic overlay (§16.8's Path 2). Schema-
  // declared, not a hardcoded/conventional key name. Type-only in this
  // commit: nothing yet reads this field (the overlay builder is a later
  // commit; see source-overlay.ts).
  sourceRefField?: string
}

// §16.1/§16.10 (revision 3): `ModifierSpec` is the shape a Modifier has
// wherever it is AUTHORED -- inline inside a SourceDefinition.modifiers[],
// or as the body of a standalone, reusable Definition. It carries no
// identity of its own. Revision 2 modeled this as `ModifierDefinition` with
// optional `id`/`kind`, which forced every consumer (registry, dependency
// graph, evaluator) to carry an unreachable "no kind" branch for the inline
// case. Revision 3 splits the type instead: ModifierSpec has no identity;
// ModifierDefinition (below) adds the identity a standalone Definition
// requires. See rules-engine.md §16.10 decision 10.
//
// Discriminated on `phase`: a clamp Modifier must declare its `clamp` bound
// (§16.12) and cannot be constructed without one -- a type-level guarantee,
// not a runtime check. `base` is excluded from the phases a Modifier may
// declare at all (§16.4) via ModifierApplicationPhase.
type ModifierSpecBase = {
  target: DefinitionId
  value: Expression | RuleValue
  condition?: Expression
  modifierType?: string
  order?: number
  label?: string
  suppressible?: boolean
}

export type ModifierSpec =
  | (ModifierSpecBase & { phase: Exclude<ModifierApplicationPhase, 'clamp'> })
  | (ModifierSpecBase & { phase: 'clamp'; clamp: ClampBound })

// The standalone, reusable form (§16.1's "definitions/modifiers/" template,
// e.g. `mod:shield.defense`): everything ModifierSpec has, plus the
// identity every other Definition union member already requires
// unconditionally. `id`/`kind` are no longer optional -- see the comment on
// ModifierSpec above for why revision 2's optionality was removed. This is
// a BREAKING change to a field no shipped package uses (no package format
// has ever shipped).
export type ModifierDefinition = ModifierSpec & {
  id: DefinitionId
  kind: 'modifier'
}

// §16.10 (revision 3): the attachment representation -- a SourceDefinition
// references a standalone ModifierDefinition by id rather than embedding it
// inline. Type-only in this commit: nothing yet resolves `{ ref }` entries
// into the ModifierDefinition they name (§16.10's "activation" is a later
// commit; modifier discovery in this commit still only sees inline
// ModifierSpec entries -- see modifier-pipeline.ts).
export type ModifierReference = {
  ref: DefinitionId
}

// §16.1, §16.6, §16.7: what Modifiers attach to. Items, conditions,
// features, progression grants, and campaign extensions are all Sources.
export type SourceDuration = {
  kind: SourceDurationKind
  remaining?: number
}

// §16.6 (revision 3): structured suppression -- `sources` holds Source
// DefinitionIds, `tags` holds tags matched against SourceDefinition.tags
// (exact match, no predicate language). Replaces the untyped `string[]`,
// which could not distinguish an id from a tag without guessing. Breaking
// change to a field no shipped package uses.
export type SourceSuppression = {
  sources?: DefinitionId[]
  tags?: string[]
}

export type SourceDefinition = {
  id: DefinitionId
  kind: 'source'
  label?: string
  // §16.6 (revision 3): matched against `SourceSuppression.tags`.
  tags?: string[]
  // §16.10 (revision 3): inline specs and references, in one array, in
  // author order -- author order is the final §15.3 ordering tiebreak
  // (`attachmentIndex`), so one mixed array avoids a merge rule a parallel
  // `modifierRefs` array would need. BREAKING: was `ModifierDefinition[]`.
  modifiers: Array<ModifierSpec | ModifierReference>
  duration?: SourceDuration
  // §16.6 (revision 3): structured suppression. BREAKING: was `string[]`.
  suppresses?: SourceSuppression
}

// §16.8 (revision 3): how a Source instance was activated -- one of the two
// V1 activation paths (declared in ActorState.sources, or derived from a
// collection item via CollectionDefinition.sourceRefField). Type-only in
// this commit: nothing yet derives a 'collection'-origin instance (that is
// the Source Overlay builder's job -- source-overlay.ts, a later commit).
export type SourceOrigin =
  | { kind: 'declared' }
  | { kind: 'collection'; collectionId: DefinitionId; itemInstanceId: string }

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
  // §16.3 (revision 3): the modifier-type stacking-policy declaration site.
  // Sits in the manifest for the same reason `semanticRoles` does -- package-
  // wide policy the engine must understand, not content, referenced by no
  // Expression, so it needs no DefinitionId/registry entry. Type-only in
  // this commit: nothing yet validates a ModifierSpec.modifierType against
  // this table (package validation is a later commit).
  modifierTypes?: ModifierTypeDeclaration[]
  // World Configuration (world-configuration.md §D, §E, §F). All three sit
  // in the manifest for the same reason `semanticRoles`/`modifierTypes` do:
  // package-wide declarations the engine or its consumers must understand,
  // referenced by no Expression, needing no DefinitionId/registry entry.
  //
  // Type-only in THIS commit, deliberately: nothing yet checks that a
  // `@world:rules.X` reference names a declared `optionalRules` key, that a
  // `@world:<kind>.<key>` reference is declared in `requiredTraits`, or that
  // a `rollTypes[].rollSpec` resolves to a `kind: 'roll'` Definition. All
  // three are Package Validation's (commit 2), per world-configuration.md
  // §15's ownership matrix -- this commit implements @world ARITY only.
  requiredTraits?: RequiredTraitDeclaration[]
  optionalRules?: OptionalRuleDeclaration[]
  rollTypes?: RollTypeDeclaration[]
}

// ---------------------------------------------------------------------------
// Package Validation results (§16.14, Revision 3 Package Validation commit)
// ---------------------------------------------------------------------------

// §16.10 decision 6: an unattached standalone Modifier is a validation
// *warning*, not an error -- "dead content, not incorrect content." This is
// the one severity distinction Package Validation makes; every other rule
// in §16.14's ownership table rejects the package.
export type PackageValidationSeverity = 'error' | 'warning'

// Named directly by the architecture's own "Validation results" type
// listing (rules-engine.md, end of §16). `code` is left as `string`
// (open), matching every other diagnostic-kind field in this file
// (RulesErrorCode is the one exception, and only because §16.18
// deliberately closes that specific vocabulary) -- package-validation.ts
// is free to grow new codes without a type-contract change.
export type PackageValidationIssue = {
  severity: PackageValidationSeverity
  code: string
  message: string
  definitionId?: DefinitionId
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
  // §16.8 (revision 3): absent in stored state means 'declared' -- a
  // pre-revision-3 SourceInstance with no `origin` is exactly a declared
  // instance, so this addition is non-breaking for existing stored state.
  origin?: SourceOrigin
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
