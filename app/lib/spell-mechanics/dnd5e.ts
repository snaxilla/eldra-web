// D&D 5e Canonical Spell Mechanics Resolver -- Character Sheet Body Phase
// 1B.1. See ./types.ts's own header for the layering this implements.
//
// Turns the RAW 5etools JSON a Content Pack stores (`ContentPublicationCandidate
// .data`, preserved verbatim -- see server/utils/content-pack-5etools-adapter.ts's
// own design decision 1) into ONE CanonicalSpellMechanics record. This is now
// the ONLY place that parses a spell's raw 5etools fields for mechanics;
// app/lib/content-actions/dnd5e.ts's `resolveSpellAction` calls this
// function and projects its result onto `ContentAction`'s generic shape,
// rather than re-parsing `raw` a second time.
//
// PURE: no I/O, no Directus, no filesystem -- identical constraint to every
// sibling resolver in this codebase (content-presentation/dnd5e.ts,
// content-actions/dnd5e.ts).
//
// ---------------------------------------------------------------------------
// MEASURED AGAINST THE REAL DATASET -- BOTH EDITIONS THIS APP ACTUALLY BINDS
// ---------------------------------------------------------------------------
// Verified directly against /opt/eldra/datasets/5etools-src/data/spells/
// spells-phb.json (SRD 5.1, `srd51Provider`) AND spells-xphb.json (2024,
// `xphbProvider`) -- both real, live, registered source collections
// (server/utils/content-sources/index.ts), not a hypothetical second
// format. Fireball, Cure Wounds, Shield, Fire Bolt, Magic Missile, and
// Bless were all read from the real XPHB file to build this resolver and
// its own tests (tests/lib/content-presentation/fixtures/5etools-real-rows.json
// carries the exact rows).
//
// ---------------------------------------------------------------------------
// CONCENTRATION -- A REAL BUG FOUND AND NOT REPEATED HERE
// ---------------------------------------------------------------------------
// app/lib/importers/5etools-spells.ts:230 reads concentration from
// `raw?.meta?.concentration || raw?.concentration` -- verified against BOTH
// Bless fixtures (2014 and 2024): neither field exists on real data.
// Concentration is a property of the SPELL'S DURATION entry
// (`duration: [{ ..., concentration: true }]`), never top-level and never
// under `meta`. That existing importer bug is OUT OF SCOPE for this phase
// (it belongs to the World-Entity/wiki import pipeline, Pipeline A, not the
// Content Pack catalogue path this phase touches) and is left unfixed, but
// this resolver reads the field CORRECTLY from the start, from `duration`.
//
// ---------------------------------------------------------------------------
// HEALING -- 1B.1's BLOCKER, RESOLVED IN 1B.4 BY A THREE-SIGNAL RULE
// ---------------------------------------------------------------------------
// 1B.1's own investigation (preserved here for the record) found no SINGLE
// reliable signal: 5etools has no `{@heal}`-equivalent tag (healing shares
// the generic `{@dice NdM}` tag with Bane's d4 penalty, Bless's own d4
// bonus, Sleep's 2014-era hit-point pool, False Life's temporary hit
// points, Reincarnate's d100 REINCARNATION-TABLE roll); `miscTags`' own
// `'HL'` theme tag is neither necessary (Vampiric Touch heals via "half the
// damage dealt", pure prose, no `{@dice}` tag of its own) nor sufficient
// (Reincarnate and Wish both carry `HL` alongside an unrelated `{@dice}`
// tag); and a bare phrase-adjacency check ("regain... hit points equal to
// {@dice ...}") silently breaks on real XPHB token-order variance (Prayer
// of Healing: "regain {@dice 2d8} {@variantrule Hit Points...}", dice
// BEFORE the Hit Points reference, reversed from Cure Wounds/Healing
// Word/Mass Cure Wounds/Mass Healing Word's own "regains ...{@variantrule
// Hit Points...} equal to {@dice ...}").
//
// Character Sheet Body Phase 1B.4 re-ran this investigation against the
// FULL real XPHB corpus (391 spells, not one hand-picked example) and found
// a THREE-signal combination that isolates exactly the right 5 spells with
// zero false positives/negatives across the entire corpus:
//
//   1. A `{@dice NdM}` tag within a bounded window (80 chars, either
//      direction -- fixes the Prayer of Healing token-order break above) of
//      a `{@variantrule Hit Point` reference tag -- narrower and more
//      reliable than matching the literal, translatable prose word
//      "hit points" (this IS the specific structural markup 5etools uses
//      for that exact rules-glossary entry, not incidental text). This tag
//      NAME match is itself already precise enough to exclude False Life's
//      own Temporary Hit Points for free: its real tag is
//      `{@variantrule Temporary Hit Points|XPHB}`, a DIFFERENT glossary
//      entry the "Hit Point" prefix match never fires on -- no separate
//      Temp-HP exclusion rule was needed.
//   2. `duration.type === 'instant'` (already read by `describeDuration`/
//      `isConcentration` below, no new parsing) -- excludes every spell
//      whose "Hit Points" mention describes something that happens LATER
//      or REPEATEDLY rather than immediately at cast time: Aura of
//      Vitality (a 1-minute-concentration aura granting a repeatable
//      bonus-action heal, not an instant one), Conjure Celestial (a
//      10-minute-concentration summon whose healing comes from the
//      conjured spirit's LATER turns), and Regenerate (a 1-hour-duration
//      spell whose printed healing is a genuine immediate-plus-ongoing
//      HYBRID -- correctly excluded rather than flattened into one number).
//   3. The RAW-defined "regain(s)" verb specifically, present within the
//      same local window as signal 1 -- the 2024 PHB's own Rules Glossary
//      reserves "regain" for recovering LOST hit points, distinct from
//      "gain" (acquiring NEW/Temporary ones -- False Life's own "You gain
//      2d4+4 Temporary Hit Points" uses "gain", though it is already
//      excluded by signal 1's own tag-name specificity regardless, see
//      below) or other verbs entirely. This is what correctly excludes
//      Heroes' Feast, the one
//      spell signals 1+2 alone do NOT: it has `duration: instant` AND a
//      dice-tag-near-Hit-Points-tag match ("it gains the same number of
//      Hit Points"), but states "gains", never "regains" -- a real,
//      book-consistent rules distinction (a creature must first spend an
//      hour partaking of the feast; the HP gain is not this spell's own
//      immediate effect), not incidental phrasing.
//
// Result, verified against the real corpus: Cure Wounds, Healing Word, Mass
// Cure Wounds, Mass Healing Word, and Prayer of Healing pass all three
// signals -- the entire required acceptance set, plus a bonus real spell
// Phase 1B.4 did not need to add fixtures for. Every other `{@dice}`-
// bearing, `Hit Point`-mentioning spell in the corpus (Aura of Vitality,
// Conjure Celestial, Regenerate, Heroes' Feast, plus every non-healing
// dice-bearing spell checked: Bane, Bless, Sleep, Wish, Reincarnate, ...)
// correctly resolves NO healing. Temp HP (False Life, a distinct
// `{@variantrule Temporary Hit Points}` tag), resurrection (Revivify/Raise
// Dead/Resurrection/True Resurrection, none of which even carry a
// `{@dice}` tag), and pure-prose healing (Vampiric Touch) are excluded
// structurally, never guessed.
//
// `usesSpellcastingModifier` (types.ts) is a SEPARATE, equally narrow
// check: the literal phrase "spellcasting ability modifier" within the same
// local window -- present for Cure Wounds/Healing Word/Mass Cure Wounds/
// Mass Healing Word, correctly absent for Prayer of Healing (RAW: it heals
// a flat 2d8 with no ability modifier added at all).
//
// ---------------------------------------------------------------------------
// SCALING -- 1B.5's OWN CORPUS AUDIT (EXECUTABLE DICE SCALING ONLY)
// ---------------------------------------------------------------------------
// The full real XPHB corpus (391 spells) was swept for every scaling shape.
// 154 spells declare `entriesHigherLevel` at all, split cleanly by its own
// `name` field into two, and only two, buckets: 20 'Cantrip Upgrade' and 134
// 'Using a Higher-Level Spell Slot' -- `resolveScaling` above already reads
// this same split for its own prose-only `SpellScaling.kind`.
//
// CANTRIP DICE (character-level trigger): 18 of the 20 Cantrip Upgrade
// spells (Fire Bolt, Acid Splash, Sacred Flame, ...) carry a SEPARATE,
// already-structured raw field this resolver had not read before --
// `scalingLevelDice: { label, scaling: { "1": "1d10", "5": "2d10", ... } }`
// -- a genuine level-threshold TABLE, not a linear formula (RAW cantrip
// damage is stepped at levels 1/5/11/17, never "+1 die per level"). The
// remaining 2 (Eldritch Blast: more attack-roll BEAMS, not bigger dice;
// Spare the Dying: range doubling, no damage at all) correctly have no
// `scalingLevelDice` and are left exactly as before -- prose-only, via the
// existing `scaling` field, never forced into a dice shape they do not have.
// Of the 18 WITH `scalingLevelDice`, exactly 16 cross-validate and attach
// `diceScaling` -- Shillelagh and True Strike are refused (see category H
// below): both modify a WEAPON's damage die, not a spell damage roll of
// their own, so `damage` is absent and there is nothing to attach scaling
// to.
//
// SLOT-LEVEL DICE (cast-level trigger): of the 134 Using-a-Higher-Level-
// Spell-Slot spells, 62 carry `{@scaledamage BASE|MIN-MAX|PERLEVEL}` and 6
// carry `{@scaledice BASE|MIN-MAX|PERLEVEL}` inside that entry's own prose
// -- e.g. Fireball's own `{@scaledamage 8d6|3-9|1d6}` (base 8d6 at the
// spell's own level 3, +1d6 per slot level above 3) and Cure Wounds' own
// `{@scaledice 2d8|1-9|2d8}`. Verified across every match: the per-level
// increment's own die SIZE always equals the base roll's die size (never a
// die-size change on upcast -- that only ever happens for a cantrip, see
// H below), and the increment's own die COUNT is NOT always 1 (Cure
// Wounds/Healing Word add 2 dice per level; Circle of Death/Cloud of
// Daggers/Vitriolic Sphere add 2, Disintegrate/Bigby's Hand/Wall of Ice
// would add 2 or 3 if their own base were parseable at all -- see
// CROSS-VALIDATION below for why those three specifically are refused
// anyway -- a linear formula with a per-spell coefficient, never hardcoded
// to "+1").
//
// CROSS-VALIDATION (why extraction refuses six of the 62 real
// `{@scaledamage}` spells, and one of the 6 real `{@scaledice}` ones): a
// tag's own BASE dice and MIN level are checked against this resolver's
// OWN independently-extracted `damage`/`healing` (the exact same "first
// tag in `entries`" roll every other caller already trusts) before the tag
// is ever trusted, and the tag's own BASE must parse as bare `NdM` -- no
// flat-modifier suffix, no multi-value shape -- before that comparison
// even runs. Six real spells fail one of these checks, each for a
// genuinely different reason, all correctly left prose-only rather than
// silently scaling the wrong (or an unparseable) number:
//   - Ice Knife: the tag describes a SECOND damage component (a 2d6 Cold
//     explosion), not the 1d10 Piercing hit this resolver's own "first
//     tag" rule extracts as `damage`.
//   - Ice Storm: the tag describes a component neither of its own two
//     SIMULTANEOUS `{@damage}` tags is (its own `damage` is the first,
//     2d10 Bludgeoning, per the existing Ice Storm precedent in
//     dnd5e.test.ts).
//   - Conjure Elemental, Lightning Arrow, Melf's Acid Arrow: each tag's
//     own BASE is a semicolon-separated DUAL value ("8d8;4d8", a hit/miss
//     or two-mode variant) -- not bare `NdM`, refused by the dice-notation
//     parser itself rather than guessing which half applies.
//   - Disintegrate: the tag's own BASE carries a flat "+40" modifier
//     suffix ("10d6 + 40") -- also not bare `NdM`, refused the same way.
// One real `{@scaledice}` spell, Heal, is refused for a related but
// distinct reason: its own tag BASE is a bare flat number ("70", no dice
// at all) -- but Heal was never in scope regardless, since it has no
// `{@dice}` tag in its main `entries` either and so never gets a `healing`
// roll to begin with (Character Sheet Body Phase 1B.4's own healing
// extraction). 56 of 62 damage spells and 5 of 6 healing spells
// cross-validate successfully. Two OTHER real spells (Bigby's Hand, Wall
// of Ice) have TWO `{@scaledamage}` tags each but PASS cross-validation on
// the first one (it genuinely does describe the same component `damage`
// extracted) -- multi-tag alone is never disqualifying, only a base-parse
// failure or a base-dice/min-level mismatch is.
//
// NON-DICE SCALING (target count, instance/projectile count, effect
// magnitude, range/area/duration, tiered thresholds): the remaining 66 of
// 134 slot-scaling spells (Bless: "+1 target"; Magic Missile: "+1 dart";
// Scorching Ray/Chain Lightning: "+1 ray"/"+1 bolt"; Aid/False Life/Armor of
// Agathys: flat "+5 HP"/"+5 Temp HP"; Animal Messenger/Magic Circle: "+N
// hours" duration; Confusion/Fog Cloud/Creation: "+N feet" radius; the
// Summon spells' "use the slot's level for the stat block's level"; and
// several genuinely tiered, non-arithmetic thresholds like Elemental
// Weapon's "+1 at level 3-5, +2 at level 6+") were swept for ANY other
// structured (non-prose) tag 5etools might use for a number -- there is
// none. Every `{@...}` tag appearing anywhere in `entriesHigherLevel`
// across the full corpus is one of `book`/`creature`/`damage`/
// `scaledamage`/`scaledice`/`status`/`variantrule` -- no `{@scaletarget}`,
// no structured instance-count tag, nothing. The per-level INCREMENT is
// reliable prose ("one additional", consistently), but the BASE quantity
// ("up to three creatures", "three darts") is stated only as an English
// number word with no consistent structural marker across this bucket --
// parsing it would mean parsing arbitrary prose at Cast runtime, exactly
// what this resolver's own established discipline (and this phase's own
// explicit instruction) refuses to do. These 66 spells are left exactly as
// 1B.1 already left them: prose-only, via the existing `scaling` field,
// with NO new structured field invented for target/instance count. See
// app/lib/spell-mechanics/effective-mechanics.ts's own header for how this
// shapes what 1B.5 can and cannot execute.
//
// CANTRIP DIE-SIZE CHANGE (category H): exactly one real spell,
// Shillelagh, whose own `scalingLevelDice` changes FACE size across tiers
// (1d8 -> 1d10 -> 1d12 -> 2d6) rather than just die COUNT -- but Shillelagh
// (and True Strike, whose own `scalingLevelDice` tiers start at level 5,
// no level-1 entry at all) modify a WEAPON's damage die, not a spell damage
// roll of their own; neither has an attack-roll/automatic resolution or a
// `damage` field under this resolver's existing rules (no `spellAttack`/
// `savingThrow` field, no `{@damage}` tag in their `entries`). Both are
// excluded from cantrip dice-scaling extraction "for free": the extractor
// below refuses to attach `diceScaling` whenever `damage` itself is absent,
// and separately cross-validates dice SHAPE, so a die-size-changing table
// could never silently masquerade as a same-size count-scaling one either.

import { cleanText, flattenEntries } from '../content-presentation/dnd5e'
import type { AbilityKey } from '../characters/ability-scores'
import type {
  CanonicalSpellMechanics,
  SpellChoice,
  SpellDiceScaling,
  SpellResolutionKind,
  SpellRoll,
  SpellSaveOutcome,
  SpellScaling
} from './types'

const SCHOOL_LABELS: Record<string, string> = {
  A: 'Abjuration', C: 'Conjuration', D: 'Divination', E: 'Enchantment',
  V: 'Evocation', I: 'Illusion', N: 'Necromancy', T: 'Transmutation'
}

// 5etools' own damageInflict strings are lowercase ('lightning') -- the
// label a `SpellChoiceOption` shows a player is the same word, capitalized,
// never a second hand-typed vocabulary that could drift from the id.
function capitalizeWord(value: string): string {
  return value.length ? value[0]!.toUpperCase() + value.slice(1) : value
}

const CASTING_TIME_UNIT_LABELS: Record<string, string> = {
  action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction',
  minute: 'Minute', hour: 'Hour'
}

function describeRange(range: unknown): string | undefined {
  if (!range || typeof range !== 'object') return undefined
  const node = range as Record<string, unknown>
  if (node.type !== 'point') return 'Special'

  const distance = node.distance as Record<string, unknown> | undefined
  if (!distance) return undefined

  if (distance.type === 'self') return 'Self'
  if (distance.type === 'touch') return 'Touch'
  if (distance.type === 'feet' && typeof distance.amount === 'number') return `${distance.amount} ft.`
  return undefined
}

function describeCastingTime(time: unknown): string | undefined {
  const first = Array.isArray(time) ? (time[0] as Record<string, unknown> | undefined) : undefined
  if (!first) return undefined

  const unitLabel = CASTING_TIME_UNIT_LABELS[String(first.unit)] ?? cleanText(first.unit)
  const number = typeof first.number === 'number' ? first.number : 1
  const label = number > 1 ? `${number} ${unitLabel}s` : unitLabel
  const condition = typeof first.condition === 'string' ? cleanText(first.condition) : ''

  return condition ? `${label} (${condition})` : label
}

function describeComponents(components: unknown): string | undefined {
  if (!components || typeof components !== 'object') return undefined
  const node = components as Record<string, unknown>
  const parts: string[] = []
  if (node.v) parts.push('V')
  if (node.s) parts.push('S')
  if (node.m) {
    const material = typeof node.m === 'string' ? node.m : (node.m as Record<string, unknown>)?.text
    parts.push(typeof material === 'string' && material ? `M (${cleanText(material)})` : 'M')
  }
  return parts.length ? parts.join(', ') : undefined
}

// 5etools' own duration shapes are a small closed set
// ('instant'|'timed'|'permanent'|'special'|...); this restates only the
// SHAPE, never the game-specific meaning of what a duration DOES.
function describeDuration(duration: unknown): string | undefined {
  const first = Array.isArray(duration) ? (duration[0] as Record<string, unknown> | undefined) : undefined
  if (!first) return undefined

  if (first.type === 'instant') return 'Instantaneous'
  if (first.type === 'permanent') return 'Until dispelled'
  if (first.type === 'special') return 'Special'

  if (first.type === 'timed') {
    const timed = first.duration as Record<string, unknown> | undefined
    const amount = typeof timed?.amount === 'number' ? timed.amount : undefined
    const unit = typeof timed?.type === 'string' ? timed.type : ''
    if (amount === undefined || !unit) return undefined
    const unitLabel = amount > 1 ? `${unit}s` : unit
    return `${amount} ${unitLabel}`
  }

  return undefined
}

// Concentration lives on the DURATION entry, never top-level and never
// under `meta` -- see this file's own header on the importer bug this
// deliberately does not repeat.
function isConcentration(duration: unknown): boolean {
  if (!Array.isArray(duration)) return false
  return duration.some((entry) => entry && typeof entry === 'object' && (entry as Record<string, unknown>).concentration === true)
}

// Character Sheet Body Phase 1B.4 -- signal 2 of `extractHealingRoll`'s own
// three-signal rule (see this file's own HEALING header). Reads the exact
// same `duration` array `describeDuration`/`isConcentration` already read,
// never a second duration parse.
function isInstantDuration(duration: unknown): boolean {
  const first = Array.isArray(duration) ? (duration[0] as Record<string, unknown> | undefined) : undefined
  return first?.type === 'instant'
}

const SAVING_THROW_ABILITY_KEYS: Record<string, AbilityKey> = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha'
}

// A spell attack and a saving throw are mutually exclusive mechanics --
// `spellAttack` wins if a row somehow carries both, a definite answer
// rather than an object-key-order guess (mirrors resolveSpellAction's own
// prior identical tie-break, now here instead).
function resolveResolution(raw: Record<string, unknown>, hasDamage: boolean): SpellResolutionKind | null {
  const spellAttack = Array.isArray(raw.spellAttack) ? raw.spellAttack[0] : undefined
  if (typeof spellAttack === 'string') return { kind: 'attack-roll' }

  const savingThrow = Array.isArray(raw.savingThrow) ? raw.savingThrow[0] : undefined
  if (typeof savingThrow === 'string') {
    const ability = SAVING_THROW_ABILITY_KEYS[savingThrow.toLowerCase()]
    if (ability) return { kind: 'saving-throw', savingAbility: ability }
  }

  // Magic Missile: deals damage with neither an attack roll nor a saving
  // throw. This is the real, required third case -- never left as `null`
  // (which would mean "no mechanical hook found at all", the Shield case)
  // and never miscoded as attack-roll/saving-throw to force it into the
  // other two buckets.
  if (hasDamage) return { kind: 'automatic' }

  return null
}

// Character Sheet Body Phase 1B.3 -- see SpellSaveOutcome's own header
// (types.ts) for the corpus evidence behind these two patterns and why a
// third catch-all value is deliberately absent. Both patterns were verified
// against the real, live XPHB collection (154 saving-throw spells): 58
// match HALF_ON_SAVE, 12 match NO_DAMAGE_ON_SAVE, and the remaining ~21
// damage-bearing save spells (Disintegrate, the smite spells, ...) match
// neither and correctly resolve `undefined` here rather than guessing.
//
// HALF_ON_SAVE is intentionally broad ("half...damage" anywhere in the
// text) because 5etools' own phrasing varies ("half as much damage on a
// successful one", "half as much damage only") -- narrowing it to one exact
// phrase would silently under-classify real spells the corpus audit already
// confirmed say the same thing differently.
//
// NO_DAMAGE_ON_SAVE requires the disjunctive "saving throw or take(s) NdM"
// shape specifically -- the standard RAW phrasing for "nothing happens on a
// success" (Acid Splash, Sacred Flame, Toll the Dead, Vicious Mockery, ...).
// This is NOT run when HALF_ON_SAVE already matched (checked first, and
// mutually exclusive in every real spell examined).
const HALF_ON_SAVE_PATTERN = /half (as much )?damage/i
const NO_DAMAGE_ON_SAVE_PATTERN = /saving throw or takes? \d+d\d+/i

function resolveSaveOutcome(resolution: SpellResolutionKind | null, hasDamage: boolean, text: string): SpellSaveOutcome | undefined {
  if (resolution?.kind !== 'saving-throw' || !hasDamage) return undefined
  if (HALF_ON_SAVE_PATTERN.test(text)) return 'half-on-save'
  if (NO_DAMAGE_ON_SAVE_PATTERN.test(text)) return 'no-damage-on-save'
  return undefined
}

// A spell's damage/other-roll dice are TAGGED, not merely mentioned --
// `{@damage NdM ...}` specifically (as opposed to `{@dice NdM}`, used for
// many unrelated non-damage rolls -- see this file's own header on
// healing). Only the spell's BASE `entries` are scanned, never
// `entriesHigherLevel`'s upcast text, and only the FIRST tag found -- a
// stated simplification for the rare multi-damage-roll spell.
//
// Captures an optional trailing `+K`/`-K` so "1d4 + 1" is not truncated to
// "1d4" -- the Magic Missile regression this phase exists to fix. This is
// source normalization (one regex, one spell's stated dice), never a
// general-purpose dice engine.
const DAMAGE_TAG_PATTERN = /\{@damage\s+(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/

// Character Sheet Body Phase 1B.2.1's own corpus audit finding: several
// spells with `damageInflict.length > 1` are NOT a player choice at all --
// Ice Storm deals bludgeoning AND cold together (two `{@damage}` tags, one
// per component), Fire Shield deals cold OR fire depending on which of the
// spell's OWN two modes is active (also two tags), and so on. Counting every
// `{@damage}` tag (global, unlike DAMAGE_TAG_PATTERN's own single `.exec()`
// above) distinguishes that shape from Chromatic Orb's real one: a SINGLE
// roll whose type genuinely is the player's choice. Verified directly
// against the real XPHB spell corpus (see this file's own resolver header
// for the dataset) -- every `damageInflict.length > 1` spell with exactly
// one damage tag in its base entries (Chromatic Orb, Sorcerous Burst, and a
// handful of others whose resolution this phase does not otherwise support)
// is a genuine single-roll type choice; every one with two or more is a
// multi-component spell, never a choice.
const DAMAGE_TAG_PATTERN_GLOBAL = /\{@damage\s+\d+d\d+/g

function countDamageTags(entries: unknown): number {
  const text = JSON.stringify(entries ?? '')
  return text.match(DAMAGE_TAG_PATTERN_GLOBAL)?.length ?? 0
}

function extractDamageRoll(entries: unknown, damageType: string | undefined): SpellRoll | undefined {
  const text = JSON.stringify(entries ?? '')
  const match = DAMAGE_TAG_PATTERN.exec(text)
  if (!match) return undefined

  const count = Number(match[1])
  const faces = Number(match[2])
  if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(faces) || faces <= 0) return undefined

  const sign = match[3] === '-' ? -1 : 1
  const modifier = match[4] ? sign * Number(match[4]) : 0

  return { dice: { count, faces }, modifier, type: damageType }
}

// Character Sheet Body Phase 1B.4 -- see this file's own header (HEALING)
// for the full three-signal evidence this implements. `{@dice}`, not
// `{@damage}` -- healing is never tagged as damage in 5etools' own markup.
const HEALING_DICE_TAG_PATTERN = /\{@dice\s+(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/g
const HIT_POINT_VARIANTRULE_PATTERN = /\{@variantrule Hit Point/g
const REGAIN_VERB_PATTERN = /\bregains?\b/i
const SPELLCASTING_MODIFIER_PATTERN = /spellcasting ability modifier/i

// Signal 1+3 combined: a bounded proximity window (80 chars, order-
// independent -- fixes the real Prayer-of-Healing token-order reversal)
// between a healing dice tag and the Hit Point rules-glossary reference,
// with the RAW "regain(s)" verb confirmed in that same local neighborhood.
// Signal 2 (`duration.type === 'instant'`) is the caller's own job --
// this function is never even invoked otherwise, see its one call site.
const HEALING_PROXIMITY_WINDOW = 80

function extractHealingRoll(entries: unknown): SpellRoll | undefined {
  const text = JSON.stringify(entries ?? '')

  const diceMatches = [...text.matchAll(HEALING_DICE_TAG_PATTERN)]
  const hpMatches = [...text.matchAll(HIT_POINT_VARIANTRULE_PATTERN)]
  if (!diceMatches.length || !hpMatches.length) return undefined

  for (const dice of diceMatches) {
    const diceStart = dice.index ?? 0
    const nearbyHp = hpMatches.find((hp) => Math.abs((hp.index ?? 0) - diceStart) <= HEALING_PROXIMITY_WINDOW)
    if (!nearbyHp) continue

    const hpStart = nearbyHp.index ?? 0
    const windowStart = Math.max(0, Math.min(diceStart, hpStart) - HEALING_PROXIMITY_WINDOW)
    const windowEnd = Math.max(diceStart, hpStart) + HEALING_PROXIMITY_WINDOW
    const localText = text.slice(windowStart, windowEnd)

    // Signal 3 -- see this file's own header on why "regain(s)" (never
    // "gain(s)") is the deciding verb, not incidental phrasing.
    if (!REGAIN_VERB_PATTERN.test(localText)) continue

    const count = Number(dice[1])
    const faces = Number(dice[2])
    if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(faces) || faces <= 0) continue

    const sign = dice[3] === '-' ? -1 : 1
    const modifier = dice[4] ? sign * Number(dice[4]) : 0

    return {
      dice: { count, faces },
      modifier,
      ...(SPELLCASTING_MODIFIER_PATTERN.test(localText) ? { usesSpellcastingModifier: true } : {})
    }
  }

  return undefined
}

// Scaling/upcast text, tagged by its broad shape -- never computed. A
// cantrip's own "Cantrip Upgrade"/level-based entry is distinguished from a
// leveled spell's "Using a Higher-Level Spell Slot" entry by NAME, which is
// the one place this resolver reads a 5etools LABEL rather than a
// structural field -- both names are stable, printed section headers in
// this dataset (verified against Fire Bolt vs. Fireball/Magic Missile/
// Bless), not a guess. Anything else (an unnamed or differently-named
// higher-level entry) still degrades to 'prose-only' rather than being
// discarded.
function resolveScaling(entriesHigherLevel: unknown): SpellScaling | undefined {
  const first = Array.isArray(entriesHigherLevel) ? (entriesHigherLevel[0] as Record<string, unknown> | undefined) : undefined
  if (!first) return undefined

  const text = flattenEntries(first.entries).join(' ')
  if (!text) return undefined

  const name = typeof first.name === 'string' ? first.name : ''
  if (/cantrip upgrade/i.test(name)) return { kind: 'cantrip-level', text }
  if (/higher-level spell slot/i.test(name)) return { kind: 'slot-level', text }
  return { kind: 'prose-only', text }
}

// A bare `NdM` dice expression, nothing else -- every BASE and PER-LEVEL
// value this file's own scaling tags carry is plain (no `+K` modifier has
// ever been observed in a `scalingLevelDice`/`{@scaledamage}`/`{@scaledice}`
// value across the full corpus; a modifier lives on the base roll itself,
// untouched by scaling). Rejects anything else rather than guessing.
function parseDiceNotation(text: string): { count: number; faces: number } | undefined {
  const match = text.trim().match(/^(\d+)d(\d+)$/)
  if (!match) return undefined
  const count = Number(match[1])
  const faces = Number(match[2])
  if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(faces) || faces <= 0) return undefined
  return { count, faces }
}

// The one entriesHigherLevel block matching `blockName` exactly (5etools'
// own stable section name, the same field `resolveScaling` above already
// reads) -- never a second, looser text search across every block.
//
// RAW text, deliberately NOT `flattenEntries`/`cleanText` -- those strip a
// `{@tag ...}` down to its own first display segment for PROSE rendering
// (`{@scaledamage 8d6|3-9|1d6}` becomes the bare, unusable "8d6", discarding
// exactly the range/per-level fields this extraction needs), the same
// "tag, not mention" distinction `extractDamageRoll`/`extractHealingRoll`
// above already draw against `flattenEntries`' own stripped output by using
// `JSON.stringify(entries)` instead.
function entriesHigherLevelTextFor(entriesHigherLevel: unknown, blockName: string): string | undefined {
  if (!Array.isArray(entriesHigherLevel)) return undefined
  const block = entriesHigherLevel.find((entry) => (entry as Record<string, unknown> | undefined)?.name === blockName) as Record<string, unknown> | undefined
  if (!block) return undefined
  const text = JSON.stringify(block.entries ?? '')
  return text || undefined
}

// Character Sheet Body Phase 1B.5 -- Cantrip damage-dice scaling by
// character level (Fire Bolt/Acid Splash-shaped), see this file's own
// SCALING header for the full corpus evidence. `damage` is this resolver's
// OWN already-extracted roll (never re-derived here) -- `scalingLevelDice`
// is trusted ONLY when its own level-1 tier's dice exactly match `damage`,
// which is what excludes Shillelagh/True Strike (no `damage` to match at
// all) without any spell-name-specific code.
function extractCantripLevelScaling(raw: Record<string, unknown>, damage: SpellRoll | undefined): SpellDiceScaling | undefined {
  if (!damage?.dice) return undefined

  const rawScalingLevelDice = raw.scalingLevelDice
  const first = Array.isArray(rawScalingLevelDice) ? rawScalingLevelDice[0] : rawScalingLevelDice
  const scaling = (first as Record<string, unknown> | undefined)?.scaling
  if (!scaling || typeof scaling !== 'object' || Array.isArray(scaling)) return undefined

  const tiers = Object.entries(scaling as Record<string, unknown>)
    .map(([levelKey, diceText]) => {
      const level = Number(levelKey)
      const dice = typeof diceText === 'string' ? parseDiceNotation(diceText) : undefined
      return Number.isInteger(level) && dice ? { level, dice } : undefined
    })
    .filter((tier): tier is { level: number; dice: { count: number; faces: number } } => Boolean(tier))
    .sort((a, b) => a.level - b.level)

  if (!tiers.length) return undefined

  const baseTier = tiers[0]!
  // A level-1 character has never reached any upgrade threshold yet, so
  // the table's own lowest tier must genuinely BE level 1 -- not merely
  // "whatever this table's lowest entry happens to be" (True Strike's own
  // real table starts at level 5, no level-1 entry at all; without this
  // check, a table missing its floor could still cross-validate on dice
  // shape alone if its lowest listed tier happened to numerically match
  // `damage.dice`, which would silently under-represent every character
  // below that table's own first threshold).
  if (baseTier.level !== 1) return undefined
  if (baseTier.dice.count !== damage.dice.count || baseTier.dice.faces !== damage.dice.faces) return undefined

  return { trigger: 'character-level', tiers }
}

// Character Sheet Body Phase 1B.5 -- slot-level damage/healing-dice scaling
// (Fireball/Cure Wounds-shaped), see this file's own SCALING header for the
// full corpus evidence including the two real spells this cross-validation
// deliberately excludes (Ice Knife, Ice Storm). `roll` is this resolver's
// own already-extracted `damage` or `healing` (never re-derived); `tagName`
// selects `{@scaledamage}` (for damage) or `{@scaledice}` (for healing) --
// the same prose block, two different 5etools tag names for the same
// shape. Only the block named 'Using a Higher-Level Spell Slot' is ever
// read, matching `resolveScaling`'s own name-based split.
const SCALE_TAG_PATTERN_SOURCE = (tagName: string): RegExp =>
  new RegExp(`\\{@${tagName}\\s+([^|]+)\\|([^|]+)\\|([^}]+)\\}`)

function extractSlotLevelDiceScaling(
  raw: Record<string, unknown>,
  baseLevel: number,
  roll: SpellRoll | undefined,
  tagName: 'scaledamage' | 'scaledice'
): SpellDiceScaling | undefined {
  if (!roll?.dice) return undefined

  const text = entriesHigherLevelTextFor(raw.entriesHigherLevel, 'Using a Higher-Level Spell Slot')
  if (!text) return undefined

  const match = SCALE_TAG_PATTERN_SOURCE(tagName).exec(text)
  if (!match) return undefined

  const base = parseDiceNotation(match[1]!)
  const rangeMatch = match[2]!.trim().match(/^(\d+)-(\d+)$/)
  const perLevel = parseDiceNotation(match[3]!)
  if (!base || !rangeMatch || !perLevel) return undefined

  // Cross-validation: the tag's own stated base dice must be THIS roll's
  // own dice, and the tag's own stated minimum level must be this spell's
  // own base level -- both checked before the tag is trusted at all. This
  // is what correctly refuses Ice Knife (tag describes a different damage
  // component than `damage` extracted) and Ice Storm (tag describes a
  // third component neither of the spell's two simultaneous `{@damage}`
  // tags is) without any spell-name-specific code.
  if (base.count !== roll.dice.count || base.faces !== roll.dice.faces) return undefined
  if (Number(rangeMatch[1]) !== baseLevel) return undefined
  // The per-level increment's own die SIZE always matches the base roll's
  // die size across the entire verified corpus (never a die-size change on
  // upcast) -- refused rather than silently applied if that ever does not
  // hold, since this resolver has no real example to model such a case on.
  if (perLevel.faces !== roll.dice.faces) return undefined

  return { trigger: 'cast-level', perLevelDiceCount: perLevel.count }
}

export function resolveDnd5eSpellMechanics(data: unknown): CanonicalSpellMechanics | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null

  const raw = data as Record<string, unknown>
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null

  const level = typeof raw.level === 'number' ? raw.level : 0
  const school = SCHOOL_LABELS[String(raw.school)]

  // Character Sheet Body Phase 1B.2 -- THE CHROMATIC ORB FINDING, structured
  // by 1B.2.1. 5etools' `damageInflict` names every LEGAL damage type a
  // spell can deal, not necessarily one authoritative type -- Chromatic Orb
  // states `["acid","cold","fire","lightning","poison","thunder"]`, one of
  // which the PLAYER chooses at cast time. Picking `[0]` unconditionally
  // (this module's own 1B.1 behavior) would silently assert "acid" as if
  // the choice had already been made -- exactly the invented fact this
  // phase's own investigation was scoped to catch. A single listed type
  // (Magic Missile: `["force"]`, Fireball: `["fire"]`) is unambiguous and
  // used directly.
  //
  // More than one listed type is NOT automatically a player choice --
  // `countDamageTags`'s own header explains why: Ice Storm's two types are
  // two SIMULTANEOUS damage components, never a pick-one. Only when exactly
  // ONE `{@damage}` tag exists alongside multiple listed types is this
  // genuinely Chromatic Orb's shape, structurally represented in `choices`
  // below; damage.type stays honestly `undefined` either way (a choice this
  // phase cannot resolve, and a multi-component spell this phase was never
  // going to safely attribute a single type to).
  const damageInflict = Array.isArray(raw.damageInflict)
    ? raw.damageInflict.filter((entry): entry is string => typeof entry === 'string')
    : []
  const damageTagCount = countDamageTags(raw.entries)
  const isSingleRollTypeChoice = damageInflict.length > 1 && damageTagCount === 1
  const damageType = damageInflict.length === 1 ? damageInflict[0] : undefined

  const choices: SpellChoice[] = isSingleRollTypeChoice
    ? [{
        id: 'damage-type',
        label: 'Damage Type',
        options: damageInflict.map((type) => ({ id: type, label: capitalizeWord(type) }))
      }]
    : []

  // Derived, not independently computed -- see CanonicalSpellMechanics's
  // own header on `hasUnresolvedChoice` for why: true exactly when the
  // source shows a choice-shaped ambiguity `choices` above did not end up
  // structurally representing (the multi-component case).
  const hasUnresolvedChoice = damageInflict.length > 1 && choices.length === 0

  const descriptionText = flattenEntries(raw.entries).join(' ')
  const baseDamage = extractDamageRoll(raw.entries, damageType)
  const resolution = resolveResolution(raw, Boolean(baseDamage))

  // Character Sheet Body Phase 1B.3 -- attached to the damage roll itself
  // (SpellRoll.saveOutcome, never a second top-level field) since it
  // describes what happens to THIS roll on a successful save; see
  // SpellSaveOutcome's own header (types.ts) for the reliability rule.
  const saveOutcome = resolveSaveOutcome(resolution, Boolean(baseDamage), descriptionText)
  const damage = baseDamage && saveOutcome ? { ...baseDamage, saveOutcome } : baseDamage

  // Character Sheet Body Phase 1B.4 -- signal 2 (instant duration) gates
  // the call itself; signals 1 and 3 live inside `extractHealingRoll`. See
  // this file's own HEALING header for the full three-signal evidence.
  const healing = isInstantDuration(raw.duration) ? extractHealingRoll(raw.entries) : undefined

  // Character Sheet Body Phase 1B.5 -- executable dice scaling, attached
  // directly to the roll it scales (never a disconnected top-level field)
  // so a consumer never has to separately match a scaling record back to
  // "damage or healing." A cantrip (`level === 0`) can only ever scale by
  // character level; a leveled spell can only ever scale by cast level --
  // never both, matching the corpus's own mutually-exclusive
  // Cantrip-Upgrade/Using-a-Higher-Level-Spell-Slot split. See this file's
  // own SCALING header for the full evidence and cross-validation rules.
  const damageScaling = level === 0
    ? extractCantripLevelScaling(raw, damage)
    : extractSlotLevelDiceScaling(raw, level, damage, 'scaledamage')
  const healingScaling = level > 0 ? extractSlotLevelDiceScaling(raw, level, healing, 'scaledice') : undefined

  // D&D 2024 Character Rules P2 -- see CanonicalSpellMechanics.classLists's own header. Read only
  // from the already-compiled `data.classLists` (never a live corpus read here); absent when the
  // compile step found no membership or has not run this enrichment yet.
  const classLists = Array.isArray(raw.classLists)
    ? raw.classLists.filter((entry): entry is string => typeof entry === 'string')
    : undefined

  return {
    level,
    school,
    castingTime: describeCastingTime(raw.time),
    range: describeRange(raw.range),
    components: describeComponents(raw.components),
    duration: describeDuration(raw.duration),
    concentration: isConcentration(raw.duration),
    ritual: Boolean((raw.meta as Record<string, unknown> | undefined)?.ritual),
    description: descriptionText || undefined,
    resolution,
    damage: damage && damageScaling ? { ...damage, diceScaling: damageScaling } : damage,
    healing: healing && healingScaling ? { ...healing, diceScaling: healingScaling } : healing,
    scaling: resolveScaling(raw.entriesHigherLevel),
    ...(choices.length ? { choices } : {}),
    ...(hasUnresolvedChoice ? { hasUnresolvedChoice: true } : {}),
    ...(classLists && classLists.length > 0 ? { classLists } : {})
  }
}
