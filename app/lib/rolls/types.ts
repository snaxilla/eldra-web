// Roll System -- shared data shapes. Phase 0 of
// .github/docs/architecture/eldra-roll-system.md (see that document's §6
// for the design these restate, and its Phase 0 entry, §14, for what this
// file is scoped to).
//
// Shaped like the app/lib/characters/*.ts / app/lib/encounters/*.ts family:
// pure, zero I/O, zero Directus/H3 imports, zero import of `opendice`
// itself -- this file only ever describes shapes, it never rolls anything.
// `app/lib/rolls/dice-adapter.ts` is the one module allowed to know
// `opendice` exists at all; everything else in this app, present and
// future, imports types FROM HERE, never from the package directly.
//
// RESTATED, NOT IMPORTED. `RollDieGroup` below is field-for-field the same
// shape OpenDice's own `DieGroup` reports, and that is deliberate, not
// coincidental -- but it is written out here by hand rather than imported,
// the same discipline `characterDerivedValues.ts` already applies to
// `server/utils/character-derived.ts`'s `DerivedValue` ("app code must not
// import from server/utils... restated... for the same reason"), applied
// here to a third-party package instead of a server module. If OpenDice
// ever renames, adds, or removes a field, exactly one file
// (`dice-adapter.ts`) needs to change to keep this shape stable for every
// caller in the app -- that is the whole point of drawing the line here.
//
// PHASE 0 SCOPE. Every type below is named because
// eldra-roll-system.md §6 already named it as part of the Roll Event data
// model, and that document's own Phase 0 file list says this file carries
// "§6's types" in full -- not because Phase 0 uses all of them yet.
// `RollEventRecord` in particular has no reader or writer until Phase 1
// (the `roll_events` persistence layer, `server/utils/roll-events.ts`) --
// declaring it now, alongside the pieces that already exist, is what lets
// Phase 1 consume a stable contract instead of inventing one under time
// pressure. Nothing here performs persistence, and nothing here is wired
// to a route, a component, or a Directus collection.

// ---------------------------------------------------------------------------
// Roll sources -- eldra-roll-system.md §4
// ---------------------------------------------------------------------------

export type RollSourceType =
  | 'ability'
  | 'saving_throw'
  | 'skill'
  | 'action_attack'
  | 'spell_attack'
  | 'spell_save'
  | 'damage'
  | 'custom'

// ---------------------------------------------------------------------------
// Visibility -- eldra-roll-system.md §5. Only the two Phase 1 states are
// real; the rest are named so a future phase never has to invent a third,
// incompatible vocabulary for the same idea.
// ---------------------------------------------------------------------------

export type RollVisibility = 'private' | 'table'
// Future, named but not implemented (§5): 'gm_only' | 'party' | 'whisper' | 'blind_dm' | 'encounter_only'

// ---------------------------------------------------------------------------
// Dice mechanics -- eldra-roll-system.md §1/§6. `RollAdvantageState` names
// what a die GROUP reports having happened; requesting one is a narrower
// thing (see dice-adapter.ts's own `RollFormulaContext` -- you ask for
// 'advantage'/'disadvantage', never 'normal', which is simply the absence
// of either).
// ---------------------------------------------------------------------------

export type RollAdvantageState = 'normal' | 'advantage' | 'disadvantage'

// One die-group as OpenDice reports it, restated -- see this file's own
// header for why. A formula like "1d8+1d4+3" produces two of these; every
// roll source type in the current plan (§4) happens to produce exactly one,
// but `RollEventRecord.dice` is an array for the day a `custom` roll
// doesn't.
export type RollDieGroup = {
  sides: number
  sign: 1 | -1
  // Every die rolled, including ones a keep rule/advantage/bound dropped --
  // never trimmed down to just the kept ones, so a future renderer can dim
  // the dropped dice instead of hiding them.
  results: number[]
  // One marker per `results` entry, aligned by position.
  keptFlags: boolean[]
  kept: number[]
  advantageState: RollAdvantageState
  multiplier: number
  // This group's own signed contribution to the roll's total.
  total: number
  // True only when exactly one die was kept and it showed its top face --
  // never true for a bound-satisfied keep (e.g. `1d20min20`) that kept a
  // face without a die actually landing on it.
  naturalHigh: boolean
  naturalLow: boolean
}

// ---------------------------------------------------------------------------
// The persisted shape -- eldra-roll-system.md §6/§7. Declared now (Phase 0)
// so Phase 1's persistence layer has a stable target; nothing in this repo
// creates, stores, or reads one of these yet.
// ---------------------------------------------------------------------------

export type RollEventRecord = {
  id: string
  worldId: string
  encounterId: string | null
  // null for a bare custom roll with no associated character.
  actorCharacterId: string | null
  // The authenticated Directus user who requested the roll -- never
  // client-asserted; a future write path stamps this from the resolved
  // Principal, the same way every other Eldra mutation already does.
  rollerUserId: string
  // Display only, e.g. "Stealth Check", "Longsword Attack" -- never parsed
  // back into meaning by anything that reads this record.
  label: string
  sourceType: RollSourceType
  // The Rules Engine id this bonus was read from, e.g.
  // 'value:skill.stealth.bonus' -- null for sources with none (custom).
  sourceKey: string | null
  // e.g. a CharacterAction id, for action_attack/spell_attack/damage.
  sourceId: string | null
  // The formula actually rolled, e.g. "1d20", "2d6+3".
  expression: string
  dice: RollDieGroup[]
  // Sum of flat numeric modifiers (dice are not counted here).
  modifier: number
  // Each flat modifier separately, in the order it was applied, so "+1 -6"
  // can be shown rather than collapsed to "-5".
  modifiers: number[]
  total: number
  visibility: RollVisibility
  // ISO 8601, server-stamped -- never client-supplied.
  createdAt: string
  // Free-form, extensible without a schema change -- e.g. spell_save's
  // { dc, spellName, savingAbility }.
  metadata: Record<string, unknown>
}
