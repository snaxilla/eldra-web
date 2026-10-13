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

## Weapon Mastery / generic content-picker filtering (recorded 2026-10-13, post-Weapon-Mastery live acceptance)

Live browser acceptance of Weapon Mastery (Barbarian/Fighter/Paladin/Ranger/Rogue, §25.38)
exposed a presentation-only gap in the generic content-choice picker shared by the Builder and
Level Manager (the same picker `feats`/`spells`/`items` content choices all render through).

**Problem**: the Weapon Mastery picker currently renders the ENTIRE bound item catalogue for the
choice, not just weapons. Structurally irrelevant options -- Alchemist's Supplies, Bagpipes,
Breastplate, and every other tool/armor/non-weapon item in the catalogue -- appear in the list,
disabled, with a generic `no-mechanics` reason. The authoritative resolver
(`itemFilterVerdict`/`itemOptionVerdict`, `app/lib/item-mechanics/eligibility.ts`) already
correctly prevents selecting any of them -- **this is not a server correctness hole**, purely a
presentation density problem: a player sees forty-plus irrelevant disabled rows before reaching
the real weapon options.

**Desired future presentation** (two distinct kinds of "can't pick this," which must stay
visually distinct):
- An option **structurally outside** the choice's declared filter universe (e.g. Breastplate for
  an `ItemCatalogueFilter{itemKind:'weapon'}` choice) should be **omitted from the list entirely**
  -- it is not a legal candidate for this choice in any actor state, ever.
- An option **inside** the structural universe but failing actor-specific eligibility (e.g. a
  martial weapon offered to an actor who lacks martial proficiency) **may remain visible,
  disabled, with a useful reason** -- this is a real "not for you, specifically" state worth
  showing.

**Derive, do not persist (same constraint this document keeps elsewhere)**: the structural/
actor-specific split already exists in the two-layer eligibility design --
`itemFilterVerdict` (package-only, no actor state) vs. `itemOptionVerdict` (caller-evaluated
`proficient()`) -- the picker only needs to consume that existing split to decide
omit-vs-show-disabled; no new filter concept, no new eligibility layer.

**Future beauty, not required for the omit/disabled split above**: search, filter by weapon
category, filter by mastery property, surface damage/property metadata on each row.

**Do NOT, when this is picked up:**
- Weaken or duplicate `itemFilterVerdict`/`itemOptionVerdict` in the picker component.
- Hardcode "weapon" filtering logic specific to Weapon Mastery -- the picker is the SAME generic
  component every content-choice category (`feats`/`spells`/`items`) renders through; the
  omit-vs-disabled split must be driven by the choice's own declared filter, not a Weapon-Mastery
  special case.
- Change `ItemCatalogueFilter`, `CanonicalItemMechanics`, or persistence in any way.

This is presentation only, exactly like every other item in this document, and is not implemented
here.

## Persistent currency header (recorded 2026-10-13, post-P8 live acceptance)

P8 currency storage exists and its automated persistence tests are green (see the progression
coverage ledger), but live browser acceptance of the Character Sheet found no obvious persistent
currency presentation anywhere on the sheet.

**Problem**: a character's canonical currency state (whatever denominations the bound Rules/
Content package declares) is only readable, if at all, by navigating into Inventory. There is no
always-visible balance, so a player cannot glance at "how much money do I have" the way they can
glance at HP or AC.

**Desired Player UX**: canonical currency state should remain visible in the Character Sheet's
header/top area (the same always-visible surface HP/AC/conditions already occupy) across every
tab -- Actions, Spells, Inventory, Character, Notes -- not just inside Inventory.

**Derive, do not persist, and do not hardcode denominations**: generic sheet code must NOT name
`GP`/`SP`/`CP`/"gold"/"copper" anywhere. Denomination identity, display label, and ordering are
owned entirely by the Rules/Content package (the same posture `CharacterResourcePips`-style
generic components already take for spell slots) -- the header renders whatever denominations the
package's own currency category declares, in the order and with the labels the package gives,
and renders nothing when the package declares none.

**Do NOT, when this is picked up:**
- Hardcode any denomination name, symbol, or ordering in Vue.
- Duplicate or bypass the existing P8 currency persistence/derivation -- this is a read-only
  presentation surface.
- Build this as part of Inventory; Inventory may later gain detailed currency controls (add/
  spend/convert), but the persistent current balance belongs on the always-visible sheet header,
  independent of which tab is active.

This is presentation only, exactly like every other item in this document, and is not implemented
here.

## Related

- Fixed Origin acquisition: `app/lib/characters/creation-origin-feat.ts`
- Creation content choices: `app/lib/characters/creation-content-choices.ts`
- Ledger: `app/lib/content-rules/dnd5e-2024-progression-coverage.ts`
