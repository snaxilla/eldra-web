// D&D 5e Content Action Resolver -- the Character Actions System.
//
// Turns the RAW 5etools JSON a Content Pack stores into the ContentAction
// models of ./types.ts. Shaped exactly like
// app/lib/content-presentation/dnd5e.ts -- the SAME source data
// (`ContentPublicationCandidate.data`), the SAME text-cleaning primitives
// (imported from there, not re-implemented), and the SAME posture: this is
// the only place that knows a 5etools field name exists, for actions.
// Neither server/utils/character-actions.ts, sheet-v2.vue, nor
// CharacterActionsPanel.vue ever sees `dmg1`, `weaponCategory`, or a raw
// `range` object -- they receive `name`, `actionType`, `range`, `damage`,
// `description`, `usage` and render them generically.
//
// PURE: no I/O, no Directus, no filesystem, no framework -- identical
// constraint to content-presentation/dnd5e.ts, for the identical reason.
//
// ---------------------------------------------------------------------------
// MEASURED AGAINST THE REAL XPHB DATASET
// ---------------------------------------------------------------------------
// Weapon fields (`type`, `weapon`, `dmg1`/`dmg2`, `dmgType`, `range`,
// `property`) verified against Longsword, Dagger, and Longbow. Spell fields
// (`range`, `time`, `entries`) verified against Fireball, Cure Wounds, and
// Shield. Species trait extraction and class feature name/level extraction
// reuse content-presentation/dnd5e.ts's OWN already-measured logic verbatim
// (`sectionsFromEntries`, the `classFeatures` ref format) rather than
// re-deriving it -- see this file's header.
//
// ---------------------------------------------------------------------------
// WHAT IS DELIBERATELY NOT EXTRACTED, AND WHY
// ---------------------------------------------------------------------------
// CLASS FEATURE ACTION-VS-PASSIVE. 5etools' `classFeatures` array carries
// only a name and the level it is gained (content-presentation/dnd5e.ts's own
// MEASURED note 2: the feature's rules text lives in a sibling file family
// this importer does not walk). Nothing in the published data marks a
// feature as "this is an action" versus "this is a passive trait" -- that
// distinction exists only inside the missing prose. Guessing from a
// feature's NAME (e.g. treating anything containing "Attack" as an action)
// would be exactly the kind of D&D-specific hardcoding this task forbids, so
// every class feature is surfaced uniformly as `actionType: 'Feature'`,
// honestly labelled rather than sorted by a guess.
//
// SPELL DAMAGE EXPRESSIONS. A spell's damage dice ("{@damage 8d6}") are
// embedded inside its free-form `entries` prose, not a structured field --
// unlike a weapon's `dmg1`, there is no reliable extraction point. Rather
// than regex-scrape prose for a dice pattern (fragile, and wrong for spells
// with multiple damage rolls or none), a spell's full `description` already
// carries this same information in the pack's own words; `damage` is left
// absent for every spell action, an honest omission over an invented one.
//
// BACKGROUND ACTIONS. A 2024 Background grants an Origin Feat by name only
// (content-rules/dnd5e-2024.ts's own header: "Origin Feats need feat
// Definitions, which the Core Character Rules package does not declare").
// The feat's own mechanical text is not part of the Background's data at
// all, so a Background action carries only the feat's name, exactly as
// `resolveBackground`'s own "Origin Feat" fact already does.

import {
  asArray,
  cleanText,
  describeProficiencyGroups,
  flattenEntries,
  readPrintedItem,
  sectionsFromEntries
} from '../content-presentation/dnd5e'
import type { ContentAction, ContentSourceCategory } from './types'

function sourceBookOf(raw: Record<string, unknown>): string | undefined {
  return raw.source ? String(raw.source) : undefined
}

// ---------------------------------------------------------------------------
// Weapons (and, by the same shape, Unarmed Strike is synthesized elsewhere)
// ---------------------------------------------------------------------------

const DAMAGE_TYPE_LABELS: Record<string, string> = {
  B: 'bludgeoning', P: 'piercing', S: 'slashing'
}

// 5etools weapon `property` codes carry a `|SOURCE` suffix
// ("V|XPHB") -- the code itself is the first segment.
function propertyCode(entry: unknown): string {
  return String(entry ?? '').split('|')[0] ?? ''
}

function resolveWeaponAction(raw: Record<string, unknown>): ContentAction | null {
  if (raw.weapon !== true) return null

  const typeCode = String(raw.type ?? '').split('|')[0]
  const isRanged = typeCode === 'R'
  const properties = asArray(raw.property).map(propertyCode)
  const isThrown = properties.includes('T')

  const actionType = isRanged ? 'Ranged Attack' : isThrown ? 'Melee or Thrown Attack' : 'Melee Attack'

  // A melee-only weapon's range is its 5-foot reach; a ranged or thrown
  // weapon's is the book's own printed normal/long distance.
  const range = isRanged || isThrown
    ? (typeof raw.range === 'string' ? `${raw.range} ft.` : undefined)
    : '5 ft.'

  const dmg1 = typeof raw.dmg1 === 'string' ? raw.dmg1 : ''
  const dmgTypeLabel = DAMAGE_TYPE_LABELS[String(raw.dmgType)] ?? ''
  const dmg2 = typeof raw.dmg2 === 'string' ? raw.dmg2 : ''

  let damage = dmg1 ? `${dmg1}${dmgTypeLabel ? ` ${dmgTypeLabel}` : ''}` : undefined
  if (damage && dmg2) damage += ` (${dmg2} versatile, two-handed)`

  return {
    name: cleanText(raw.name),
    category: 'weapon',
    actionType,
    range,
    damage,
    sourceBook: sourceBookOf(raw)
  }
}

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------

const SCHOOL_LABELS: Record<string, string> = {
  A: 'Abjuration', C: 'Conjuration', D: 'Divination', E: 'Enchantment',
  V: 'Evocation', I: 'Illusion', N: 'Necromancy', T: 'Transmutation'
}

const CASTING_TIME_UNIT_LABELS: Record<string, string> = {
  action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction',
  minute: 'Minute', hour: 'Hour'
}

function describeSpellRange(range: unknown): string | undefined {
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

function describeSpellTime(time: unknown): string | undefined {
  const first = asArray(time)[0] as Record<string, unknown> | undefined
  if (!first) return undefined

  const unitLabel = CASTING_TIME_UNIT_LABELS[String(first.unit)] ?? cleanText(first.unit)
  const number = typeof first.number === 'number' ? first.number : 1
  const label = number > 1 ? `${number} ${unitLabel}s` : unitLabel
  const condition = typeof first.condition === 'string' ? cleanText(first.condition) : ''

  return condition ? `${label} (${condition})` : label
}

function resolveSpellAction(raw: Record<string, unknown>): ContentAction | null {
  const name = cleanText(raw.name)
  if (!name) return null

  const level = typeof raw.level === 'number' ? raw.level : 0
  const levelLabel = level === 0 ? 'Cantrip' : `Level ${level} Spell`
  const school = SCHOOL_LABELS[String(raw.school)]

  return {
    name,
    category: 'spell',
    actionType: school ? `${levelLabel} (${school})` : levelLabel,
    range: describeSpellRange(raw.range),
    usage: describeSpellTime(raw.time),
    description: flattenEntries(raw.entries).join(' ') || undefined,
    sourceBook: sourceBookOf(raw)
  }
}

// ---------------------------------------------------------------------------
// Species -- every named trait, uniformly. See this file's header on why
// passive traits (Darkvision) are not filtered out from action-granting ones
// (Breath Weapon): nothing in the data distinguishes them, and a trait's own
// description text already makes that plain to a reader.
// ---------------------------------------------------------------------------

function resolveSpeciesActions(raw: Record<string, unknown>): ContentAction[] {
  return sectionsFromEntries(raw.entries).map((section) => ({
    name: section.title,
    category: 'species',
    actionType: 'Feature',
    description: section.paragraphs.join(' ') || undefined,
    sourceBook: sourceBookOf(raw)
  }))
}

// ---------------------------------------------------------------------------
// Class -- names and granted levels only. See this file's header note on
// why rules text and action-vs-passive are both absent.
// ---------------------------------------------------------------------------

function parseClassFeatureRef(value: unknown): { name: string; level: number } | null {
  const ref = typeof value === 'string'
    ? value
    : typeof (value as Record<string, unknown>)?.classFeature === 'string'
      ? String((value as Record<string, unknown>).classFeature)
      : ''

  if (!ref) return null

  const parts = ref.split('|')
  const name = (parts[0] ?? '').trim()
  if (!name) return null

  const level = Number(parts[3] ?? parts[parts.length - 1])
  return { name, level: Number.isFinite(level) ? level : 0 }
}

function resolveClassActions(raw: Record<string, unknown>): ContentAction[] {
  const seen = new Set<string>()
  const actions: ContentAction[] = []

  for (const ref of asArray(raw.classFeatures)) {
    const parsed = parseClassFeatureRef(ref)
    if (!parsed) continue

    const key = `${parsed.level}:${parsed.name}`
    if (seen.has(key)) continue
    seen.add(key)

    actions.push({
      name: parsed.name,
      category: 'class',
      actionType: 'Feature',
      usage: parsed.level ? `Class Feature (Level ${parsed.level})` : 'Class Feature',
      description: 'This Content Pack publishes this feature\'s name and level, but not its rules text.',
      sourceBook: sourceBookOf(raw)
    })
  }

  return actions
}

// ---------------------------------------------------------------------------
// Background -- the granted Origin Feat, by name only. See this file's
// header note on why no further detail is available.
// ---------------------------------------------------------------------------

function resolveBackgroundActions(raw: Record<string, unknown>): ContentAction[] {
  const originFeat = readPrintedItem(raw, 'Feat') || describeProficiencyGroups(raw.feats)
  if (!originFeat) return []

  return [{
    name: originFeat,
    category: 'background',
    actionType: 'Feature',
    usage: 'Granted by Background',
    sourceBook: sourceBookOf(raw)
  }]
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

// Pure: raw pack data in, the actions it grants out. Returns [] when the
// data is unusable (absent, not a JSON object) or grants none -- both
// legitimate, common results, never an error. `category === 'item'`
// produces a 'weapon' action only when the item actually is one (most items
// are not, and correctly produce nothing).
export function resolveDnd5eActions(category: ContentSourceCategory, data: unknown): ContentAction[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []

  const raw = data as Record<string, unknown>

  if (category === 'item') {
    const action = resolveWeaponAction(raw)
    return action ? [action] : []
  }
  if (category === 'spell') {
    const action = resolveSpellAction(raw)
    return action ? [action] : []
  }
  if (category === 'species') return resolveSpeciesActions(raw)
  if (category === 'class') return resolveClassActions(raw)
  if (category === 'background') return resolveBackgroundActions(raw)
  return []
}
