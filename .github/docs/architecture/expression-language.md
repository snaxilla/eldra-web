# The Eldra Expression Language (EEL)

Status: **Proposed.** Language design only. No parser, lexer, evaluator, printer, or validator
exists. No file under `app/lib/rules/` was modified to produce this document — see §9 for the one
place this design implies an AST change that has not been made.

Companion to [rules-engine.md](./rules-engine.md) §14 (Expression and Formula Model) and
[app/lib/rules/ast.ts](../../../app/lib/rules/ast.ts) (the canonical AST every EEL expression
compiles into). This document specifies the *surface syntax* a Game Master types; `ast.ts` already
specifies what that syntax must compile *into*. Every decision below was checked against `ast.ts`
before being written down — where a decision doesn't fit the deployed AST as-is, that's called out
explicitly rather than silently worked around.

---

## 1. Grammar Philosophy

EEL is written by Game Masters, not compiler engineers. Every decision in this document was made
against one question: **does this help a GM read someone else's formula correctly on the first
try?** Not "is this concise," not "is this powerful," not "is this what other languages do."

Four properties, in priority order:

1. **Readability.** A formula should read closer to a sentence than to code. `not(isDead)` reads;
   `!isDead` requires knowing `!` means "not," which is a real thing GMs have to learn and can
   mis-remember under table pressure.
2. **Predictability.** One way to write one thing. Two syntaxes for the same concept (`if(...)` and
   `?:`, `and()` and `&&`) is not flexibility — it's two things to learn, and it means the next
   formula you read might use the *other* one.
3. **Explainability.** Every construct must map to something a Trace step (rules-engine.md §27) can
   name. If a syntax form can't be explained in one sentence at the table, it doesn't belong here.
4. **Deterministic parsing.** No construct whose meaning depends on lookahead tricks, operator
   overloading, or context outside the expression itself (except the one explicitly-scoped exception
   in §4.6).

**Every feature in this document had to earn its place.** Where the architecture document's own
examples didn't need a feature, it isn't here unless a concrete, table-relevant use case justified
adding it (the `%` operator in §3.1 is the one case where this happened — flagged, not assumed).

EEL deliberately does not try to be a general-purpose programming language. §14.5 of the
architecture already establishes this is structural, not incidental: no loops, no recursion, no user
functions, no side effects. This document inherits that constraint and does not relitigate it.

---

## 2. Literals

**All four literal kinds exist.** Each is independently grounded in the architecture's own worked
examples; none is invented.

| Kind | Syntax | Grounded by |
|---|---|---|
| Number | `42`, `3.5`, `0.5` | `might - 10`, `* 6`, throughout |
| Text | `"hello"` | `"defeated"`, `"active"`, `"clean"` |
| Boolean | `true`, `false` | `{"text": "true"}` (unconditional outcome fallback) |
| Dice | `2d6`, `1d20`, `1d100` | throughout — see §6 |

### 2.1 Numbers

`[0-9]+(\.[0-9]+)?` — plain decimal only. No leading `+`, no scientific notation, no hex/octal, no
digit-group separators (`1_000`). None of these appear anywhere in the architecture's examples, and
a GM authoring a modifier value has no use for them. A negative number is not a numeric-literal
*token* — it's the unary-minus operator (§3.4) applied to a positive literal, keeping the lexer's job
simple and unambiguous.

### 2.2 Text

Double-quoted only: `"clean"`, `"defeated"`. **Single quotes are not supported.** Picking exactly one
quote character removes an entire category of "which quote did I use" mistakes; double quotes were
chosen because every text literal in the architecture's worked examples already uses them.

Escape sequences are minimal, by design: `\"` (embedded quote) and `\\` (literal backslash). Nothing
else — no `\n`, `\t`, or Unicode escapes. EEL string literals are short authoring tokens (skill
names, outcome labels, condition tags), not prose; multi-line or richly formatted text belongs in a
Definition's own `label`/`description` field (already part of the data model), never inside an
expression.

### 2.3 Booleans

`true` / `false`, lowercase, bare keywords — not string literals, not `1`/`0`. Matches the one
grounded example (`{"text": "true"}`) exactly.

### 2.4 Dice

Full treatment in §6 — dice literals are the one literal kind with real syntactic subtlety (two valid
surface forms compiling to one AST node).

---

## 3. Operators

### 3.1 Arithmetic

**Decision: `+ - * /` exist as infix operators. `%` should be added as a fifth operator. `^` should
not exist.**

`+ - * /` are directly and extensively grounded (`(@value:might - 10) / 2`,
`@value:rank * 6 + @value:hardiness.mod`, `"weightEach" * "quantity"`).

`^` (exponentiation): **rejected.** `pow(base, exponent)` is already in the architecture's function
whitelist (§14.5) and is the only exponentiation form any worked example implies. Adding `^` as a
second spelling for the same operation would be exactly the "two ways to write one thing" this
document's philosophy rejects outright. Use `pow(...)`.

`%` (modulo): **not present in the architecture, and I'm recommending it be added.** This is the one
place this document proposes new capability rather than transcribing existing examples. Rationale:
cyclic and parity mechanics ("every other level," "odd rounds only") are a completely ordinary GM
need, and without `%` the only way to express one is `a - floor(a / b) * b` — precisely the kind of
"clever syntax" §1 exists to prevent. **This requires adding `'%'` to `ast.ts`'s `BinaryOperator`
union — not done in this document, flagged for approval** (see §9).

### 3.2 Comparison

`= != < <= > >=` — exactly matches `ast.ts`'s already-committed `BinaryOperator` set, no changes
needed. Grounded throughout (`@value:hull.current <= 0`, `@ctx:successes >= 3`,
`@ctx:degree = "clean"`).

**Comparisons do not chain.** `1 < a < 3` is not valid EEL — write `and(1 < a, a < 3)` (§3.3). Every
comparison operator is non-associative: `a < b < c` is a syntax error, not "whatever C does with it."
This removes an entire class of subtle bugs (`1 < 2 < 3` evaluating to `true` in JavaScript because
it's `(1 < 2) < 3` → `true < 3` → `1 < 3` is the canonical example of exactly the surprise this
language exists to prevent) at zero authoring cost, since the function-call form for combining
comparisons already exists.

### 3.3 Logical

**Decision: `and`, `or`, `not` as function calls. No `&&`, `||`, `!`.**

This is close to already-decided by the architecture and by this task's own stated style goal
("Prefer `not(isDead)` over `!isDead`"). §14.5 lists `if not and or` together under "Logic," which —
consistent with how `if(...)` is written everywhere — means all four are **function calls**, not
operators: `and(a, b)`, `or(a, b)`, `not(a)`. No worked example anywhere shows infix `&&`/`||`, and no
example shows a bare `!` token.

Confirmed here rather than reopened: symbolic logical operators do not exist in EEL at all. This also
means logical operations participate in the grammar exactly like every other function call (§4) —
one less category of special-case syntax to specify or to learn.

### 3.4 Unary operators

**Decision: unary `-` exists. Unary `+` does not.**

`ast.ts`'s `UnaryExpressionNode.operator` was deliberately left as an open `string` when the AST
landed, because no worked example anywhere shows *any* unary operator syntax. This document resolves
that ambiguity:

- **Unary minus (`-x`) is supported.** Arithmetic negation is an unavoidable, ordinary need (a
  penalty expressed as `-@value:something`, negating a derived value) even though it happens not to
  appear in any of the architecture's specific worked examples. Its absence would make simple,
  common formulas impossible to write without an awkward `0 - x` workaround.
- **Unary plus (`+x`) is rejected.** It is a no-op in every language that has it, exists nowhere in
  the architecture, and — per §1's rule 1 — has no readability benefit over simply not writing it.
- **Unary boolean negation does not exist as an operator.** `not(x)` (§3.3) already covers this; a
  second, symbolic spelling (`!x`) would violate "one way to write one thing."

**This resolves `UnaryExpressionNode.operator` from `string` to effectively a single-member closed
set, `'-'`. Recommended AST tightening, not made in this document — see §9.**

---

## 4. Functions

### 4.1 Call syntax

**`name(arg, arg, ...)` — the only call form.** No method-call syntax (`x.floor()`), no
operator-spelled functions, no argument-less calls without parentheses. This is deliberately the
one universally familiar pattern to a non-programmer audience — it's the same shape as every
spreadsheet function a GM has likely already used (`SUM(...)`, `IF(...)`), which is a genuine,
concrete readability asset worth choosing deliberately rather than by accident.

### 4.2 Whitespace inside calls

**Insignificant.** `floor( x , y )` and `floor(x,y)` parse identically. Unsurprising, standard, and
consistent with §5's whitespace decision for the rest of the language.

### 4.3 Trailing commas

**Not permitted.** `floor(x,)` is a syntax error. Trailing commas exist in other languages to make
multi-line lists diff cleanly in version control; EEL expressions are always short, single-line
formulas, so that justification doesn't transfer, and permitting them adds a grammar rule with no
corresponding benefit here.

### 4.4 Nesting

**Unrestricted.** Every worked example already nests freely
(`sum(@collection:rig[equipped], "bonusDice")` inside a larger expression;
`if(@choice:trained.climb, @value:rank, 0)` inside an addition). There is no language-level nesting
depth limit — resource limits belong to the evaluator's step budget (§14.9 of the architecture), a
runtime concern, not a grammar concern.

### 4.5 Case sensitivity

**Case-sensitive**, and uniformly so across the whole language (§8 makes this explicit for
identifiers too). The whitelist itself uses meaningful mixed casing (`toNumber`, `keepHighest`) —
case-insensitive matching would require inventing a canonicalization rule the architecture never
specifies, purely to solve a problem (`ToNumber` vs `tonumber`) that consistent case-sensitivity
avoids for free.

### 4.6 Package-defined functions

**No.** This is explicitly the task's own expected answer, and it is also exactly what §14.5 of the
architecture already states: *"Closed set, versioned with the engine. No user-defined functions in
V1."* Confirmed, not reopened. Allowing package-authored functions would reintroduce exactly the
security and complexity problem the whole non-Turing-complete design exists to avoid (rules-engine.md
§14.9, §23).

---

## 5. Whitespace

**Insignificant everywhere, including across what would be a "line."** `1+2` and `1 + 2` parse
identically. There is no meaningful newline in EEL: expressions are conceptually single formulas
(they're authored as one JSON string value, per `Expression.text`), and a newline inside one is
treated exactly like any other whitespace — never a statement terminator.

This is a direct consequence of a fact worth stating plainly: **EEL has no statement concept at
all.** There is no `;`, no sequencing, no "do this, then that." Every `Expression` is exactly one
value-producing tree. This isn't an omission — §14.5 of the architecture already excludes loops and
procedures structurally, and a language with no loops or procedures has nothing for a statement
separator to separate.

---

## 6. Dice

**Both `NdF` shorthand and `dice(count, faces)` exist. `dice(count, faces)` is canonical; `NdF` is
sugar that desugars to it.**

This directly answers the task's question, and the reasoning is grounded rather than a coin flip:
every worked *content* example (`1d20`, `1d100`, `2d6`) uses `NdF` shorthand, but the two proof
packages that need a **variable** die count use the function form instead —
`dice(@value:pool, 6)`, `dice(@value:pool.systems, 6)`. That's not incidental: `NdF` is lexically
`<int>d<int>` — it can only ever express a literal count and a literal face count, because the
grammar has no way to splice a reference into the middle of a single token. `dice(count, faces)` is
the general form because `count`/`faces` are each a full sub-expression (§ast.ts:
`DiceExpressionNode.count: RuleExpressionNode`, `.faces: RuleExpressionNode`) — capable of holding a
literal, a reference, or an arithmetic expression.

So: `NdF` is recognized shorthand for the common case (both operands are literal integers) that
**desugars at parse time** into the same `DiceExpressionNode` `dice(count, faces)` would produce.
Neither the AST nor the evaluator ever needs to know which spelling a GM used — `Expression.text`
preserves that; `Expression.ast` does not. This matches this task's own framing exactly: *"The AST
represents `dice(2, 6)`, not `'roll 2d6'`."*

### 6.1 Dice modifiers (`keepHighest`, `keepLowest`, `explode`, `reroll`)

§14.5 lists these under "Dice construction" alongside `dice(n, faces)` itself, but no worked example
anywhere shows how they combine with it syntactically. `ast.ts` flagged this as an open ambiguity
when the AST landed; this document proposes a resolution rather than leaving it open indefinitely,
since dice syntax is squarely this document's job to specify.

**Proposal: these remain ordinary function calls (already true in `ast.ts`'s
`FunctionCallExpressionNode`/`RuleFunctionName`) that wrap a dice expression as their first
argument** — e.g. `keepHighest(dice(4, 6), 3)` for the classic "roll 4d6, keep the highest 3"
ability-generation mechanic. This requires no new grammar: nesting is already unrestricted (§4.4),
and a function taking a `DiceExpressionNode` as an argument is not a special case.

This is a genuine design decision this document is making, not a transcription of an existing
example — noted as such rather than presented as settled architecture. A future parser
implementation should confirm this reading before relying on it.

**§16.5 of the architecture models "advantage" (keep-highest on a *roll*, not a dice-value
expression) via `RollSpec.selection`, a completely separate mechanism from this one.** The two are
not in tension: `keepHighest(...)` here operates on a `diceSpec` *value* (e.g., for generating a
derived stat), while `RollSpec.selection` governs how a *roll's own dice* are kept once actually
rolled. Worth stating explicitly since the same English phrase ("keep highest") describes two
distinct mechanisms at two distinct layers.

---

## 7. Conditionals

**Decision: `if(condition, whenTrue, whenFalse)` only. No `condition ? a : b` ternary.**

`if(...)` is directly grounded (`if(@value:hull.current <= 0, "defeated", "active")`) and already has
its own AST node (`ConditionalExpressionNode`). Ternary syntax is rejected for three concrete
reasons, not just "we already have one way":

1. **§1's predictability rule directly forbids it** — two syntaxes for one concept.
2. **A real, concrete collision risk**: `?:`'s colon (`:`) is visually adjacent to reference syntax's
   own colon (`@value:x`). A formula like `cond ? @value:x : @value:y` is legal-looking but genuinely
   harder to scan at a glance than `if(cond, @value:x, @value:y)` — the exact opposite of what a
   terser syntax is supposed to buy you.
3. **`if(...)` is already the more familiar form** to the target audience — it's the same word
   non-programmers already know from spreadsheet formulas, which is a real readability asset ternary
   syntax doesn't have.

### 7.1 Boolean contexts — no truthiness, ever *(added in revision 3)*

Two places in the language require a `boolean` rather than merely accepting one:

1. the first argument of `if(condition, whenTrue, whenFalse)`;
2. a **Modifier `condition`** (`rules-engine.md` §16.1, §16.11A) — an expression whose entire job is
   to answer yes or no.

**EEL has no truthiness.** There is no rule by which `0`, `""`, or an empty list is "falsy", and
none by which a non-empty value is "truthy". A boolean context that receives a non-boolean produces
an `error`, exactly as `1 + "text"` does. This is §14.3's no-implicit-coercion rule applied to
gating rather than to arithmetic — the same rule, not a new one, and stating it here closes the gap
that let an implementation read a number as a condition.

**`error` in a boolean context is `error`, never `false`.** This is the more important half. A
boolean context is not a filter that absorbs failures: whatever an `error` flows into is an `error`,
and gating is not an exception. Reading `error` as `false` would make every diagnostic this language
produces — an absent `@source:` field (§8.2), a runtime dependency cycle, an evaluation-budget abort —
silently disappear at exactly the point a package author most needs to see it. `rules-engine.md`
§16.11A specifies the consequences for the Modifier Pipeline, where the distinction has teeth.

A package that genuinely wants "treat undeterminable as inactive" writes it explicitly:
`if(@source:duration.remaining > 0, @source:equipped, false)`. The engine never assumes that intent.

**Static checking.** Where the condition's type is statically knowable, type validation rejects a
non-boolean at *package validation* — `"condition": { "text": "@value:might" }` on a `number` Value
never reaches a session. Where it is not knowable — `@source:<itemField>` types are statically
unknown by construction (§8.2) — the failure surfaces at evaluation. Both checks are required;
neither subsumes the other.

---

## 8. References

Full reconsideration of `@value:x`-style syntax, as requested. Six namespaces are directly and
completely grounded by §14.2 of the architecture's own bullet list; a seventh (`@source:`) was found
during this review, flagged rather than silently folded in, and **resolved in revision 3** (§8.2).

### 8.1 The seven namespaces

```
@value:might           @value:hull.current
@collection:inventory  @collection:rig
@sources               @sources[definitionId = "source:condition.stressed"]
@choice:origin
@world:roadType.speedFactor
@ctx:successes
@source:equipped       @source:duration.remaining      (revision 3 — §8.2)
```

§14.2 presents the first six as a complete enumerated bullet list ("`@value:x`, `@collection:x`,
`@sources`, `@choice:x` — actor state references"; "`@world:x`"; "`@ctx:x`"), and they stand
unchanged. `@source:` is added as the seventh (§8.2), making `ReferenceNamespace` in `ast.ts`
`'value' | 'collection' | 'sources' | 'choice' | 'world' | 'ctx' | 'source'` — still closed.

> **Revision 3 repairs a stale example.** §8.1 previously showed `@sources[tag = "stressed"]`.
> `SourceDefinition.tags` is a *list* and EEL has no membership function, so a scalar `tag = …`
> comparison was never satisfiable. `@sources` items expose exactly `instanceId`, `definitionId`, and
> `tags`; the canonical filter is on `definitionId`. Tag-based filtering of `@sources` is deferred to
> V2 together with a membership function.

### 8.2 `@source:` — the seventh namespace *(resolved in revision 3)*

**Canonical syntax: `@source:<path>`.** Colon-separated like every other namespace, never
dot-accessed.

Revision 2 of `rules-engine.md` wrote this as `@source.equipped` in two places (§16.1's shield
modifier and the Appendix's armour modifier). That form was never legal: it would have made `source`
the only namespace whose separator is `.` rather than `:`, creating two namespace rules where §1's
philosophy demands one. Both occurrences are now corrected in `rules-engine.md`, and `@source:` is
specified here in full.

**Concept.** `@source:` (singular) is a **different concept** from `@sources` (plural). `@sources` is
the actor's whole set of active Source instances, filterable with `[...]`. `@source:` is *the one
Source instance through which the enclosing modifier was activated* — always exactly one, guaranteed
by `rules-engine.md` §16.1's activation invariant.

**Lexical scope.** `@source:` is legal **only** inside a `ModifierSpec`'s `value` and `condition`
expressions. In a `ValueDefinition.formula`, a `RollSpec.dice`, a `ResourceDefinition.max`, or any
`ActionDefinition` expression it is a **reference-validation error** — not a syntax error. The parser
accepts it anywhere, exactly as it accepts `banana(2)`: the parser understands grammar, not context.

**Grammar.**

```
sourceReference := "@" "source" ":" path
path            := identifier ("." identifier)*
```

**The path is mandatory.** This is what makes `@source` and `@sources` impossible to confuse despite
differing by one character:

| Input | Result |
|---|---|
| `@source:equipped` | Valid — namespace `source`, path `equipped` |
| `@source` | **Syntax error**: "`@source` requires a path (did you mean `@sources`?)" |
| `@sources` | Valid — namespace `sources`, no path |
| `@sources:equipped` | **Syntax error**: "`@sources` takes no path (did you mean `@source:equipped`?)" |

Both diagnostics name the other form explicitly, so either typo is caught at parse time with a
one-step fix.

**Tokenizer.** No changes. `@source:equipped` already lexes as `at · identifier("source") ·
colon · identifier("equipped")` — the tokenizer never knew the namespace list, and still doesn't.
`source` and `sources` are simply different `identifier` tokens.

**AST.** No new node kind. `'source'` becomes the seventh member of `ReferenceNamespace`, and
`@source:equipped` produces the ordinary `reference(source, "equipped")` node. Adding a node kind
would mean auditing every exhaustive `switch` in the parser, type checker, dependency extractor, and
evaluator for no gain (`rules-engine.md` §14.12 makes the same argument about `unresolved`).

**Path resolution.** One flat namespace, two groups of fields:

| Path | Type | Availability |
|---|---|---|
| `@source:instanceId` | `text` | always |
| `@source:definitionId` | `text` | always |
| `@source:duration.kind` | `text` | always (`""` when the instance has no duration) |
| `@source:duration.remaining` | `number` | always (`0` when the instance has no duration) |
| `@source:<itemField>` | declared by the collection's `itemSchema` | only when the instance came from a collection item |

`duration.kind` and `duration.remaining` are the **only** nested paths. Item fields are exposed flat
(`@source:equipped`, not `@source:item.equipped`) because a collection item *is* the record — there
is no sub-object to reach into, and inventing one would add a path level with no referent.

`instanceId`, `definitionId`, `duration`, and `origin` are **engine-reserved**: an `itemSchema` that
declares any of them is a package validation error (`rules-engine.md` §16.9). That rule is what keeps
one flat namespace unambiguous.

**Static typing.** The four engine-reserved paths have known types and are checked statically. Item
fields are **statically unknown** — the same treatment `@world:`, `@ctx:`, `@choice:`, and `@sources`
already receive — because which collection (if any) activates a given Source is not knowable from the
package alone. Type validation therefore neither accepts nor rejects an expression on the basis of an
item field's type; it propagates "unknown" and defers to runtime.

**Runtime failure.** An absent field evaluates to `error`, never to a type-appropriate zero:

- `@source:equipped` on a *declared* (non-item) instance → `error`. A condition has no `equipped`.
- `@source:equiped` (misspelled) → `error`.

This is a deliberate exception to §11's "every value has a type-appropriate zero": that rule applies
where the type is known, and an absent field has none. Returning `false` for a misspelling would
disable a modifier permanently with no diagnostic.

**That error must then survive the boolean context it lands in.** Per §7.1, an `error` in a
condition is an `error`, never `false`: it propagates out and makes the modified value visibly
`error`, naming the modifier and the Source instance (`rules-engine.md` §16.11A). Producing an error
here and having the pipeline read it as "not true" would deliver precisely the silent permanent
deactivation this rule exists to prevent — this paragraph and §7.1 are load-bearing for each other,
and neither works alone.

**Dependency extraction.** `@source:` contributes **no** static dependency edge — it reads runtime
instance data, never a Definition. It joins `ctx`, `world`, `sources`, and `choice` in the
never-an-edge set (`rules-engine.md` §16.9).

**Valid examples**

```
@source:equipped
@source:quantity
@source:instanceId
@source:duration.remaining > 0
if(@source:equipped, 2, 0)
@value:might.mod + @source:enhancementBonus
```

**Invalid examples**

```
@source                      // no path — did you mean @sources?
@sources:equipped            // @sources takes no path — did you mean @source:equipped?
@source.equipped             // '.' is a path separator, not a namespace separator
@source:                     // path segment expected
@source:item.weight          // no 'item' sub-object; item fields are flat
@source:equipped             // valid syntax, but a reference-validation ERROR
                             //   inside a ValueDefinition.formula (§8.2 lexical scope)
```

### 8.2.1 `@self` — still unresolved

**`@self`** — bare, no colon, no path. Appears once, in a migration `transformValue` step's `using`
expression (`rules-engine.md` §25.3): `{ "op": "transformValue", "id": "value:defense", "using":
{ "text": "@self + 1" } }`. Unlike the seven established namespaces, this is a single occurrence in a
context (data migration, not live actor evaluation) that may have its own, narrower expression
grammar entirely — migrations transform one stored value using its own prior value, which is
conceptually different from any of §14.2's namespaces. **This document still does not resolve whether
`@self` belongs to EEL proper or to a separate migration-step grammar.** Revision 3 deliberately did
not fold it in: `@source:` was resolved because the modifier system is blocked without it, while
`@self` blocks only a migration feature that does not yet exist.

The open question is unchanged: **does `@self` belong to EEL proper as an eighth reference namespace,
or is it a keyword scoped only to the migration-step DSL with its own separate grammar?** This is
exactly the kind of ambiguity §1's philosophy says to document and not silently decide — flagged for
an explicit architecture decision before a parser can treat it either way.

### 8.3 Case sensitivity

**Case-sensitive**, matching §4.5's identical decision for functions, and for the same underlying
reason: `DefinitionId` (`app/lib/rules/types.ts`) is a plain string used as an exact-match join key
across actor state, traces, and bindings (rules-engine.md §12.6: *"IDs are the join key... this is
the single most expensive thing to get wrong"*). Case-insensitive reference resolution would require
inventing a canonicalization rule with no textual grounding anywhere, purely to solve a problem
strict case-sensitivity avoids by construction.

### 8.4 Identifier rules for reference paths

A path segment is `[a-zA-Z_][a-zA-Z0-9_]*`; a full path is one or more segments joined by `.`
(`might`, `hull.current`, `roadType.speedFactor`). See §10 for the single identifier grammar shared
by reference paths, function names, and item-field names — deliberately one rule, not three.

### 8.5 Escaping

**None exists, and none is needed.** Because reference paths are restricted to the identifier
grammar in §8.4, a path can never contain a character that would need escaping (no spaces, no
quotes, no brackets). Anything that isn't a valid identifier simply cannot be part of a reference —
there is no mechanism for a "dynamic" or computed reference path.

### 8.6 Nested references

**Not supported, by deliberate design, not oversight.** No worked example anywhere shows a reference
whose *path* is itself computed (e.g., something like `@value:@somethingElse`). Every reference path
in every example is a static literal string. This is required, not merely convenient: §14.7 of the
architecture states dependency extraction happens *"by walking the AST for reference nodes... for
free, at validation time"* — that only works if every reference's target is knowable without running
anything. A computed reference path would make static dependency extraction impossible and reopen
exactly the "author-annotated dependency list" problem (§14.7's own explicit rejection of Roll20's
`getAttrs` pattern) this whole design exists to avoid.

### 8.7 Indexing

**Positional indexing (`@collection:x[0]`) is not supported.** No worked example shows it — every
bracket use is a filter predicate (§8.8), never a numeric position. Collections are modeled and
described throughout as filterable sets, not ordered arrays a formula reaches into by position;
`first(...)` (already in the function whitelist) covers "get one item" without needing index syntax
at all.

### 8.8 Filtering

**`[predicate]` bracket syntax, attached directly to a collection-shaped reference — already the
established convention, not proposed here.** Grounded by both forms actually used:

- **Bare field-name shorthand**: `[equipped]` — means "where the current item's `equipped` field is
  truthy."
- **Full comparison**: `[quantity > 1]` — an ordinary EEL boolean expression over the item's fields.

> **Revision 3** replaced the previous full-comparison example, `[tag = "stressed"]`. It filtered
> `@sources` on a scalar `tag` field that no modeled type ever had (`SourceDefinition.tags` is a
> list — see §8.1), so it was not a satisfiable expression.

**Generalization (not textually shown beyond these two forms, but the natural and minimal reading):**
the predicate inside `[...]` is any valid EEL expression producing a boolean, evaluated once per
item, with that item's own fields available as **bare identifiers** — not `@`-prefixed — scoped only
to the predicate. This is why `equipped` and `tag` never carry an `@value:` prefix even though they
clearly resolve to something: inside a filter (and inside an aggregate expression, §8.9), a bare
identifier means "this field of the current item," a completely different, narrower scope than the
six global `@`-namespaces in §8.1. This scoping rule is implicit in the two grounded examples and is
made explicit here because a parser needs it stated unambiguously to know when a bare word is a
field reference versus a syntax error.

The `[...]` filter is **optional**, matching `ast.ts`'s `CollectionExpressionNode.predicate?`
already being optional: `count(@sources)` (no filter — count everything) is valid EEL, even though
no worked example happens to omit one.

### 8.9 Aggregation

`sum`, `max_of`, `min_of` take a second argument identifying which per-item field to aggregate,
written as a **string literal**: `sum(@collection:inventory[equipped], "weightEach" * "quantity")`.
Per §14.2's own note (*"'key' inside an aggregate — the item field being aggregated"*), a text
literal used as an aggregate operand means "read this field from the current item," not the literal
string itself — the same bare-item-scope idea as §8.8's filter predicates, just spelled with quotes
instead of a bare word because it's the *value* of an existing `LiteralExpressionNode`
(`valueType: 'text'`) being reinterpreted by the evaluator, not a new AST shape. This is an
evaluator-time interpretation rule, not a parser concern — the parser produces an ordinary text
literal either way.

---

## 9. Required AST Changes — Summary

Everything in this document was checked against `app/lib/rules/ast.ts` as committed. Three findings
require a change to that file before a parser can implement this specification faithfully.

| # | Finding | Proposed change | Where | Status |
|---|---|---|---|---|
| 1 | `%` (modulo) is a genuine, justified gap (§3.1) | Add `'%'` to `BinaryOperator` | `ast.ts` | Still proposed, unapproved |
| 2 | Unary operator vocabulary was left open pending this document (§3.4) | Narrow `UnaryExpressionNode.operator` from `string` to `'-'` | `ast.ts` | Still proposed, unapproved |
| 3 | `@source:` is real syntax distinct from `@sources` (§8.2) | Add `'source'` to `ReferenceNamespace` | `ast.ts` | **Approved in revision 3** — the modifier system is unimplementable without it (`rules-engine.md` §16.9, ADR-020) |

Finding 3 is now a required change rather than a proposal, and it is the *only* AST change revision 3
authorizes. Findings 1 and 2 remain independent decisions and must not be bundled into the same
commit.

Two further changes revision 3 requires live outside `ast.ts` and so are not AST changes at all,
listed here so no one goes looking for them in the wrong file:

| Finding | Change | Where |
|---|---|---|
| `@source` must never be bare; `@sources` must never take a path (§8.2) | Namespace-specific path arity check with paired suggestions | `parser.ts` |
| `@source:` is legal only inside `ModifierSpec` expressions (§8.2) | Owning-Definition-aware scope check | reference validation |
| A Modifier `condition` is a boolean context (§7.1) | Reject a statically non-boolean condition at package validation | type validation |
| `error` and non-boolean results must not be read as `false` (§7.1) | Propagate rather than exclude; enrich with provenance | `modifier-pipeline.ts` (`rules-engine.md` §16.11A) |

None of these four touches `ast.ts`. The last one is a *behavioral* change to shipped code rather
than a new capability, and it is the one that must not be deferred: every diagnostic §8.2 and §12
promise is unobservable while a boolean context absorbs errors.

One finding remains **unresolved** and is deliberately not an AST change: `@self` (§8.2.1) may belong
to EEL's `ReferenceNamespace` as a context-scoped form, or may belong entirely to a separate, narrower
migration-step grammar. This needs a decision before either path is taken, not a guess baked into the
AST.

---

## 10. Identifiers — the single grammar

One identifier grammar, used uniformly for reference path segments (§8.4), function/keyword names
(§4), and item-field names inside filters/aggregates (§8.8–8.9). Using one rule everywhere, rather
than three similar-but-different rules, is itself a predictability decision (§1).

```
identifier := [a-zA-Z_][a-zA-Z0-9_]*
```

| Question | Decision | Rationale |
|---|---|---|
| Hyphens? | **No.** | Real, concrete ambiguity with the arithmetic minus: `my-value` is genuinely unparseable as "one identifier" vs. "`my` minus `value`" without extra lookahead rules this language deliberately avoids. |
| Periods? | Only as a **path separator** between segments (`might.mod`), never inside a single segment. | Matches every example; a period is a separate grammar token, not an identifier character. |
| Colons? | Only inside the fixed `@namespace:path` reference form (§8) and the `table:slug` lookup form; never an ordinary identifier character. | Matches every example — no identifier ever contains a bare colon. |
| Underscores? | **Yes**, freely within a segment. | Grounded directly: `max_of`, `min_of` in the function whitelist. |
| Unicode? | **No — ASCII letters/digits/underscore only.** | `DefinitionId` is used as an exact-match join key and is hashed for package `integrity` (§11.2). ASCII-only avoids an entire class of Unicode normalization/lookalike-character hazards for something acting as a security-relevant identity key. Every example is plain ASCII regardless. **This restriction applies only to identifiers** — a Definition's `label` (a display string, localizable) is completely unconstrained text and is not affected. |

---

## 11. Nullability

**Confirmed, not rejected: there is no `null` in EEL.** This isn't a new decision — §14.4 of the
architecture already states it plainly (*"There is no `null`. Every value has a type-appropriate
zero"*), and this document's job is to confirm the language design carries that through consistently
rather than reopen it.

Practical consequence for the *language* specifically: there is no null-coalescing operator (`??`)
and no optional-chaining syntax (`?.`), because there is nothing to coalesce away from or chain
safely past. A reference to a Value that happens to be unset simply evaluates to its type's zero
(`0`, `""`, `false`) — a type-checker concern (a later, not-yet-built phase), not a parser concern.
`error` (§14.4) is the one distinguished "something went wrong" value, and it is not null-like: it
propagates deliberately (`1 + error` is `error`) rather than being silently absorbed.

**And it propagates in boolean position too** *(revision 3)*. `error` is not a falsy value, and no
context in this language may treat it as one — see §7.1. This is where "not null-like" stops being a
turn of phrase: a null-like value would naturally be absorbed by a conditional, which is exactly the
behavior that made a `RulesError` in a Modifier `condition` disappear.

---

## 12. Errors — Parser Philosophy

Not covered by the architecture document (parser design wasn't in scope there); this section is this
document's own reasoned recommendation, grounded in §28's stated principle ("visible degradation,
never silent corruption") rather than in a pre-existing worked example.

**Within one expression: a syntax error stops parsing that expression entirely. No partial AST.** A
syntactically broken formula has no well-defined "mostly correct" tree — producing one anyway risks
silently evaluating something the author never intended, which is precisely the "silent corruption"
§28 exists to prevent. One `RulesError` (already in `types.ts`) is produced, and that Definition
fails validation.

**Across a package: one broken expression must not stop the parser from checking every other
expression.** A package typically contains many independent Definitions, each with its own
`Expression`. Stopping at the first syntax error found anywhere in the package and forcing a
fix-resubmit-hit-the-next-error cycle would be a genuinely poor authoring experience — collecting
every syntax error across the whole package in one pass and reporting all of them together is
dramatically more usable, and costs nothing extra: each `Expression.text` already parses
independently of every other one.

**A syntax error must never be silently converted into an `UnresolvedExpressionNode`.** These are
two different failure modes and conflating them would erase a real distinction: `unresolved`
(§14.12) means *no formula was ever written* — a translation gap the source adapter honestly
reported. A syntax error means *a formula was written, but it's broken* — an authoring mistake. The
former is expected and blocks publication gracefully; the latter is a defect that should be reported
as a `RulesError` and fixed, never silently substituted with an inert placeholder node.

---

## 13. Comments

**Not supported. No `//`, `#`, or `/* */`.**

Every EEL expression is a short, single-purpose formula string embedded as one JSON value
(`Expression.text`) — not a source file. A GM who wants to explain *why* a formula does something
already has a place to put that: the surrounding Definition's own `label`/`description` field, which
already exists in the data model precisely for human-facing explanation and is far more discoverable
(shown in a sheet, an editor, a trace) than a comment buried inside a formula string would ever be.
Adding comment syntax here would be a feature with no example that needs it and an existing,
better-suited mechanism already covering the same need — the two things §1 says disqualify a
feature.

---

## 14. Precedence Table

Because logical operations (`and`/`or`/`not`), conditionals (`if`), and collection/lookup/dice
operations are **all function calls** (§3.3, §4, §6, §7, §8.8–8.9) rather than operators, they never
participate in operator precedence at all — a function call's own parentheses are the only grouping
that matters for its arguments. This collapses what would otherwise be a long precedence table (most
C-family languages have 15–20 levels) down to five:

| Level | Category | Operators | Associativity |
|---|---|---|---|
| 1 (tightest) | Atoms | literals, references, function calls, dice expressions, `(...)` grouping | — |
| 2 | Unary | `-` (negation) | right (single operand) |
| 3 | Multiplicative | `*` `/` `%`¹ | left |
| 4 | Additive | `+` `-` (binary) | left |
| 5 (loosest) | Comparison | `=` `!=` `<` `<=` `>` `>=` | **non-associative — no chaining (§3.2)** |

¹ Pending the `BinaryOperator` change proposed in §9.

There is no level for logical AND/OR, no level for a conditional/ternary operator, and no level for
assignment — none of those exist in EEL at all. **This is a deliberate design win worth stating
explicitly**: a five-level precedence table with one non-associative level is something a GM can
actually hold in their head, which a JavaScript-sized table never could be.

Explicit parentheses always override precedence, exactly as in every worked example
(`(@value:might - 10) / 2`).

---

## 15. Parser Notes

No parser is implemented by this document. These are design notes for whoever implements one next,
not an implementation.

**Recommended strategy: hand-written recursive-descent, one function per precedence level.** With
only five precedence levels (§14), no operator overloading, no context-sensitive tokens outside of
§6's one lexical rule below, and every non-operator construct being an ordinary function call, a
parser-generator (Yacc/PEG/etc.) would add tooling and build-step complexity this grammar doesn't
need. A recursive-descent parser mapping directly to §14's table (`parseComparison` →
`parseAdditive` → `parseMultiplicative` → `parseUnary` → `parseAtom`) is simple enough to be
reviewable by hand, which matters for a language whose evaluator (a future phase) must be fully
auditable (rules-engine.md §14.9, §23).

**One real lexical ambiguity to resolve deliberately: dice literals vs. numbers followed by an
identifier.** `2d6` must lex as one dice-literal token, not as the number `2` followed by an
identifier `d6`. The tokenizer should greedily match the pattern `<digits>d<digits>` *before*
falling back to plain number lexing, so `2d6` is recognized as a dice literal and (for example) a
hypothetical `2days` would correctly fail to lex as a dice literal (only one `d`-followed-by-digits
group, then non-digit characters) rather than partially matching. This is the one place this
language's lexer needs a rule more specific than "the obvious thing," and it's worth writing down now
so it isn't rediscovered as a bug later.

**Each `Expression.text` parses independently.** Per §12's error philosophy, the natural
implementation is: the package-level validator calls `parse(text)` once per `Expression` found across
every Definition, collects every `RulesError` produced, and reports all of them together — no
special "keep going after an error" logic needs to live inside the parser itself, since each call is
already isolated.

**Desugaring belongs in the parser, not the AST.** `NdF` shorthand (§6) should be recognized at parse
time and immediately produce the same `DiceExpressionNode` the function form would — there is no
"sugared" AST node kind, and `ast.ts` should not gain one. The AST stays exactly as canonical as
`rules-engine.md` §14.1 requires; only the parser needs to know two spellings exist.

---

## 16. Rejected Alternatives

Consolidated from the reasoning above, for quick reference:

| Rejected | In favor of | Why (see) |
|---|---|---|
| `condition ? a : b` | `if(condition, a, b)` | §7 |
| `&&` `\|\|` `!` | `and(...)`, `or(...)`, `not(...)` | §3.3 |
| `^` exponent operator | `pow(base, exp)` | §3.1 |
| `where(predicate)` collection filter | `[predicate]` | §8.8 |
| Unicode identifiers | ASCII-only identifiers | §10 |
| Hyphens in identifiers | rejected entirely | §10 |
| Comments (`//`, `#`, `/* */`) | `label`/`description` fields | §13 |
| Trailing commas in calls | rejected entirely | §4.3 |
| Multiple statements / `;` sequencing | not applicable — no statement concept | §5 |
| Single-quoted strings | double-quoted only | §2.2 |
| Chained comparisons (`1 < a < 3`) | `and(1 < a, a < 3)` | §3.2 |
| Unary `+` | rejected entirely | §3.4 |
| Positional collection indexing (`x[0]`) | `first(...)`, `[predicate]` filters only | §8.7 |
| Null / `??` / `?.` | type-appropriate zeros (§14.4 of the architecture) | §11 |

---

## 17. Worked Examples, Annotated

All drawn directly from the architecture document, confirming this specification produces the AST
`ast.ts` already expects for every example that motivated it.

```
floor((@value:might - 10) / 2)
```
`call(floor, [binary(/, binary(-, reference(value, "might"), literal(number, 10)), literal(number, 2))])`

```
if(@value:hull.current <= 0, "defeated", "active")
```
`conditional(binary(<=, reference(value, "hull.current"), literal(number, 0)), literal(text, "defeated"), literal(text, "active"))`

```
sum(@collection:inventory[equipped], "weightEach" * "quantity")
```
`collection(sum, reference(collection, "inventory"), predicate: reference(item-field, "equipped"), aggregate: binary(*, literal(text, "weightEach"), literal(text, "quantity")))`

```
2d6 + @value:might.mod
```
`binary(+, dice(literal(number, 2), literal(number, 6)), reference(value, "might.mod"))`
— identical AST to `dice(2, 6) + @value:might.mod`, per §6.

```
lookup(table:proficiency, @value:level)
```
`lookup("table:proficiency", reference(value, "level"))`

---

## Project Knowledge Review

**1. Does this language remain approachable for non-programmer GMs?**
Yes, and every major decision was chosen to keep it that way rather than as an afterthought: five
precedence levels instead of fifteen-plus (§14), word-based logic instead of symbols (§3.3), a single
call syntax that matches spreadsheet-formula muscle memory (§4.1), and — critically — no construct in
this document that requires knowing *another* language to understand (no C-style operators, no
ternary, no method chains). The place most likely to still trip up a first-time author is dice-vs-
function-form ambiguity in edge cases (§15's lexer note) and the filter/aggregate bare-identifier
scoping rule (§8.8–8.9) — both are internally consistent once learned, but neither is something a GM
would guess unaided, so good parser error messages (a future phase) matter more here than anywhere
else in the spec.

**2. Which decisions intentionally differ from JavaScript?**
Almost every operator-level decision is a deliberate divergence, not an oversight: comparisons don't
chain (§3.2, directly naming JS's `1 < 2 < 3` surprise as the reason); logical AND/OR/NOT are
function calls, not `&&`/`||`/`!` (§3.3); there's no ternary operator (§7); there's no `%` yet but if
added it will be a true modulo, not JS's occasionally-surprising remainder-with-sign behavior for
negative operands (worth deciding explicitly whichever way when §9's proposal is approved); there's
no `null`/`undefined`/`??`/`?.` (§11); and there's no implicit type coercion at all (`"5" + 3` is not
defined behavior in EEL, unlike JS's string concatenation surprise) — coercion is always explicit via
`toNumber`/`toText`, already established by rules-engine.md §14.3 and simply carried through here
without exception.

**3. Which parser implementation strategy naturally follows from this language?**
Hand-written recursive-descent, one parsing function per precedence level, as detailed in §15. The
language was specifically kept simple enough (five precedence levels, no ambiguous grammar outside
the one dice-literal lexing rule, every "special" construct reduced to an ordinary function call) that
a parser-generator would add mechanical complexity without buying anything back — recursive-descent
maps directly and legibly onto §14's table, which matters because the parser needs to be as
auditable as the evaluator it feeds (rules-engine.md §23's security posture applies to the whole
pipeline, not just runtime evaluation).
