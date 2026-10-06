# Character Decisions / Acquired Features -- Presentation Backlog

Status: **deferred beauty-pass item. No UI is implemented.** Recorded during
Phase 2C.2B acceptance and Phase 2C.3A so the work is not lost when the
feature-correctness phases end.

## Problem

The Character Sheet shows class feature *opportunities*, not the player's
*decisions*. A Fighter who chose Archery as a Level-1 Fighting Style passed
browser acceptance, but the Sheet does not clearly show which style was chosen.
The same gap will apply to the fixed Origin Feat once 2C.3A is in use.

## Scope (presentation only -- derive, do not persist)

Every item below must be derived from canonical state that already exists. No
new persistence store, no new block, no duplicated copy of a decision.

| Decision | Canonical source |
|---|---|
| Selected Subclass | `progression.classes[].subclassRef` |
| Selected Fighting Style | `progression.feats[]` entry whose `choiceKey` is the class Fighting Style key (`class:progression:<level>:choice:feat.fighting-style.*`) |
| Acquired Origin Feat | `progression.feats[]` entry whose `choiceKey` is `background:progression:1:grant:origin` |
| Acquired General Feats | `progression.feats[]` entries whose `choiceKey` is the General feat selection key (`choice:feat.selection`) |
| Epic Boon | `progression.feats[]` entry whose `choiceKey` is the Level-19 Epic Boon key |
| Nested decisions (ASI ability distribution, feat-granted choices) | `rules_choices` block, `progression` block, and the ASI row of the Level Manager plan |

Read `progression.feats[]` and `progression.classes[].subclassRef` directly. Do
not infer a decision from the Background's display prose, the class feature
list, or a feature Value's presence.

## Why this is separate from the feature phases

- 2C.2B / 2C.3A make the decisions **correct and persisted**. This item only
  makes them **visible**.
- The Fighter Level-1 Fighting Style passed browser acceptance, so the data is
  trustworthy; only its display is missing.

## Constraints when this is picked up

- Presentation only. No new Directus collection, block, or column.
- Reuse the existing Sheet components (`app/components/characters/Sheet*.vue`)
  and the Sheet's existing tab/section pattern. Do not add a parallel panel.
- Keep business logic out of `app/pages/worlds/[id]/entities/[entityId]/sheet.vue`
  (about 8,900 lines). Put any derivation in a composable or a pure `app/lib`
  module, and render it from a small component.
- Do not implement during feature-correctness phases.

## Out of scope for this item

- Choosing or changing a decision (that is the Level Manager / Builder).
- Runtime effects of an acquired feat (tracked in the progression coverage
  ledger, `app/lib/content-rules/dnd5e-2024-progression-coverage.ts`).

## Related

- Fixed Origin acquisition: `app/lib/characters/creation-origin-feat.ts`
- Creation content choices: `app/lib/characters/creation-content-choices.ts`
- Ledger: `app/lib/content-rules/dnd5e-2024-progression-coverage.ts`
