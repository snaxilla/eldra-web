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
// HEALING -- INVESTIGATED, NOT GUESSED (see this phase's own required
// clarification)
// ---------------------------------------------------------------------------
// 5etools has no `{@heal}`-equivalent tag -- healing rolls share the same
// generic `{@dice NdM}` tag used for many unrelated non-damage rolls (Bane's
// d4 penalty, Bless's own d4 bonus, Sleep's hit-point pool, False Life's
// temporary hit points, Reincarnate's d100 REINCARNATION-TABLE roll).
// `miscTags` does carry an `'HL'` ("healing") theme tag, but it is neither
// necessary (Vampiric Touch heals via "half the damage dealt", stated only
// in prose, with no `{@dice}` tag of its own to find) nor sufficient
// (Reincarnate and Wish both carry `HL` AND an unrelated `{@dice}` tag that
// is NOT a healing amount) to safely identify which specific tag, if any,
// is the healing roll. A phrase-adjacency heuristic ("regain... hit points
// equal to {@dice ...}") was tested against the real dataset and found to
// work for 2014-era text but to FAIL SILENTLY against 2024/XPHB phrasing,
// which replaces the literal words "hit points" with a `{@variantrule Hit
// Points|XPHB}` reference tag -- and even within XPHB alone, Prayer of
// Healing reverses the token order ("regain {@dice 2d8} {@variantrule Hit
// Points...}") relative to Cure Wounds/Healing Word/Mass Cure Wounds
// ("regains ...{@variantrule Hit Points...} equal to {@dice ...}"). No
// single reliable rule was found across the two real, live source
// collections this app already binds. Per this phase's own explicit
// instruction, this is reported rather than shipped as a guess:
// `healing` is a real field on CanonicalSpellMechanics (see ./types.ts) but
// this resolver NEVER populates it in 1B.1. A future phase with a larger,
// curated spell sample (or a per-book-version rule, verified the same way)
// is the correct place to revisit this, not a heuristic added under time
// pressure here.

import { cleanText, flattenEntries } from '../content-presentation/dnd5e'
import type { AbilityKey } from '../characters/ability-scores'
import type { CanonicalSpellMechanics, SpellResolutionKind, SpellRoll, SpellScaling } from './types'

const SCHOOL_LABELS: Record<string, string> = {
  A: 'Abjuration', C: 'Conjuration', D: 'Divination', E: 'Enchantment',
  V: 'Evocation', I: 'Illusion', N: 'Necromancy', T: 'Transmutation'
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

export function resolveDnd5eSpellMechanics(data: unknown): CanonicalSpellMechanics | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null

  const raw = data as Record<string, unknown>
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null

  const level = typeof raw.level === 'number' ? raw.level : 0
  const school = SCHOOL_LABELS[String(raw.school)]

  // Character Sheet Body Phase 1B.2 -- THE CHROMATIC ORB FINDING. 5etools'
  // `damageInflict` names every LEGAL damage type a spell can deal, not
  // necessarily one authoritative type -- Chromatic Orb states
  // `["acid","cold","fire","lightning","poison","thunder"]`, one of which
  // the PLAYER chooses at cast time. Picking `[0]` unconditionally (this
  // module's own 1B.1 behavior, corrected here) would silently assert
  // "acid" as if the choice had already been made -- exactly the invented
  // fact this phase's own investigation was scoped to catch. A single
  // listed type (Magic Missile: `["force"]`, Fireball: `["fire"]`) is
  // unambiguous and used directly; more than one sets `hasUnresolvedChoice`
  // and leaves `damage.type` honestly `undefined` instead of guessing.
  const damageInflict = Array.isArray(raw.damageInflict)
    ? raw.damageInflict.filter((entry): entry is string => typeof entry === 'string')
    : []
  const hasUnresolvedChoice = damageInflict.length > 1
  const damageType = damageInflict.length === 1 ? damageInflict[0] : undefined

  const damage = extractDamageRoll(raw.entries, damageType)

  return {
    level,
    school,
    castingTime: describeCastingTime(raw.time),
    range: describeRange(raw.range),
    components: describeComponents(raw.components),
    duration: describeDuration(raw.duration),
    concentration: isConcentration(raw.duration),
    ritual: Boolean((raw.meta as Record<string, unknown> | undefined)?.ritual),
    description: flattenEntries(raw.entries).join(' ') || undefined,
    resolution: resolveResolution(raw, Boolean(damage)),
    damage,
    // Never populated in 1B.1/1B.2 -- see this file's own header.
    healing: undefined,
    scaling: resolveScaling(raw.entriesHigherLevel),
    ...(hasUnresolvedChoice ? { hasUnresolvedChoice: true } : {})
  }
}
