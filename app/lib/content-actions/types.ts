// Content Action Models -- the Character Actions System.
//
// The vocabulary the Character Sheet's Actions panel speaks, shaped
// deliberately like app/lib/content-presentation/types.ts's own
// `PresentationEntry`: one system-agnostic shape every content category
// resolves to, so ONE consumer (the Actions panel) renders a weapon, a
// spell, and a species trait without knowing which kind it is looking at or
// which game system produced it.
//
// ---------------------------------------------------------------------------
// PRESENTATION, NOT RULES -- THE SAME BOUNDARY, ONE LAYER OVER
// ---------------------------------------------------------------------------
// A resolver here states what a Content Pack already publishes about
// something a character can DO: its name, what kind of action it is, its
// range, and its damage EXPRESSION (a string like "1d8 slashing" -- never a
// rolled number, never resolved). Nothing here computes gameplay: no hit is
// resolved, no damage is applied, no save is rolled. `content-presentation`'s
// own header states this for narrative facts; the identical rule applies
// here to action facts.
//
// `attackBonus` and `saveDc` are deliberately ABSENT from this type. Both are
// Rules Engine output (packages/eldra-dnd5e-2024's `combat`/`spellcasting`
// categories) attached by server/utils/character-actions.ts AFTER a
// ContentAction is resolved -- this module knows nothing about a character's
// ability scores or proficiency bonus, only about what a piece of content
// says an action does.
//
// ---------------------------------------------------------------------------
// `resolution`/`damageRoll`/`damageType` -- COMBAT RESOLUTION SYSTEM ADDITION
// ---------------------------------------------------------------------------
// Still presentation, not rules, by the same test the fields above already
// pass: `resolution` restates a FACT the book already prints ("this spell
// forces a Dexterity saving throw", "this weapon is a ranged attack"), never
// a computed outcome -- no roll happens here, no hit is decided, no HP
// changes. `damageRoll` is the STRUCTURED counterpart of the already-existing
// presentation-only `damage` STRING immediately below: the string is what a
// player reads ("1d8 slashing"), the struct is what
// server/utils/character-combat.ts rolls when a player asks it to resolve
// this action -- kept separate on purpose, the same way a RuleValue and its
// display text are already two different things everywhere else in this
// codebase. Absent for any action with nothing to resolve (a passive Species
// trait, Shield's self-only reaction, a Class Feature with no rules text) --
// Combat Resolution has nothing to do with those, and a consumer offering a
// "Resolve" control reads this field's absence to know not to.

import type { AbilityKey } from '../characters/ability-scores'

// The catalogue category raw content comes from -- what a resolver is asked
// to translate. Matches the catalogue categories world-content-catalogue.ts
// already declares (minus feats/monsters, which grant no actions this task
// scopes).
export type ContentSourceCategory = 'item' | 'spell' | 'species' | 'class' | 'background'

// What KIND of action a resolved ContentAction is -- broader than
// ContentSourceCategory in one direction ('unarmed' is never a resolver
// input; it is synthesized directly by server/utils/character-actions.ts,
// the same way Armor Class's 10-plus-Dex baseline is a structural default
// rather than something any Content Pack publishes) and narrower in another
// ('item' input only ever produces a 'weapon' action or no action at all --
// most items are not weapons).
export type ActionCategory = 'weapon' | 'unarmed' | 'spell' | 'species' | 'class' | 'background'

// Which RAW mechanic resolves this action, and the one piece of information
// each mechanic needs beyond what the Rules Engine already derives.
// 'attack-roll': d20 + the relevant Attack Bonus vs the target's Armor
// Class -- `attackKind` says WHICH Attack Bonus (melee/ranged weapon Attack
// Bonus, or Spell Attack Bonus), all three already Rules Engine output.
// 'saving-throw': the TARGET rolls d20 + their own save bonus for
// `savingAbility` against this action's Spell Save DC -- the target's save
// bonus (`value:save.<key>.bonus`) is also already Rules Engine output, for
// the target's own character.
export type ActionResolution =
  | { kind: 'attack-roll'; attackKind: 'melee' | 'ranged' | 'spell' }
  | { kind: 'saving-throw'; savingAbility: AbilityKey }

export type ContentAction = {
  name: string
  category: ActionCategory
  // A short presentation label -- "Melee Attack", "Ranged Attack",
  // "Cantrip (Evocation)", "Feature". Never branched on structurally by a
  // consumer beyond display; it is words, not an enum with behavior.
  actionType: string
  range?: string
  // A presentation-only expression, never rolled or computed -- "1d8
  // slashing", "2d6 fire". Absent when the pack does not state one.
  damage?: string
  description?: string
  // When the pack states it -- a spell's casting time, a class feature's
  // granted level, a limited-use trait's recharge. Absent, never invented.
  usage?: string
  sourceBook?: string
  // See this file's own header note on the three fields below.
  resolution?: ActionResolution
  // The dice `damage` (above) is the presentation of, ready to roll --
  // absent whenever `damage` itself is (no dice stated, or a flat,
  // non-dice expression like Unarmed Strike's, which
  // server/utils/character-actions.ts handles as its own special case
  // rather than forcing a `{count:1,faces:1}` fiction here).
  damageRoll?: { count: number; faces: number }
  // The word a damage total is reported in -- "slashing", "fire". Absent
  // exactly when `damageRoll` is.
  damageType?: string
}

// One game system's translation of raw Content Pack `data` into the actions
// it grants. Returns [] when the data yields none -- most items are not
// weapons, most content grants no action at all, and an empty list is a
// legitimate, common result, not a degraded one.
export type ContentActionResolver = (
  category: ContentSourceCategory,
  data: unknown
) => ContentAction[]
