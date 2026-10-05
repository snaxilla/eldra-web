// Canonical Feat Mechanics -- dnd5e resolver. The ONE place a 5etools feat
// JSON field name (`category`, `prerequisite`, `repeatable`, `ability`) is
// read. Mirrors app/lib/spell-mechanics/dnd5e.ts's own posture: a pure
// function of `data`, no I/O, no game knowledge leaking past this file.
//
// Real corpus shapes this resolver targets (verified this phase, feats.json,
// `source === 'XPHB'`, 77 entries; see types.ts's own header for the
// category/prerequisite census): `category` is one of `G | O | FS | FS:P |
// FS:R | EB`; `prerequisite` is an array of `{level?, ability?, proficiency?,
// spellcasting2020?}` objects (OR of AND, see types.ts); `repeatable` is a
// bare boolean or absent (absent means false); `ability` is an array whose
// shape this file's own `resolveAbilityIncrease` below fully enumerates.

import type {
  CanonicalFeatMechanics,
  FeatAbilityIncrease,
  FeatCategory,
  FeatPrerequisite,
  FeatVariant
} from './types'

const CATEGORY_MAP: Record<string, FeatCategory> = {
  G: 'general',
  O: 'origin',
  FS: 'fighting-style',
  'FS:P': 'fighting-style',
  'FS:R': 'fighting-style',
  EB: 'epic-boon'
}

function resolveCategory(raw: unknown): FeatCategory | null {
  if (typeof raw !== 'string') return null
  return CATEGORY_MAP[raw] ?? null
}

// The raw key IS the variant identity (see types.ts's FeatVariant header).
// Only the six keys the corpus contains are accepted; anything else resolves
// the whole feat to null, the same fail-closed posture as an unknown category.
function resolveVariant(raw: unknown): FeatVariant | null {
  if (raw === 'G' || raw === 'O' || raw === 'FS' || raw === 'FS:P' || raw === 'FS:R' || raw === 'EB') return raw
  return null
}

// Prerequisite keys this engine can evaluate. Anything else on a group is
// reported as unsupported rather than dropped (see CanonicalFeatMechanics).
const SUPPORTED_PREREQUISITE_KEYS = new Set(['level', 'ability', 'proficiency', 'spellcasting2020'])

type ResolvedPrerequisites = {
  groups: FeatPrerequisite[][]
  unsupported: string[]
}

function resolvePrerequisiteGroups(raw: unknown): ResolvedPrerequisites {
  const result: ResolvedPrerequisites = { groups: [], unsupported: [] }
  if (!Array.isArray(raw)) return result

  const reportUnsupported = (key: string) => {
    if (!result.unsupported.includes(key)) result.unsupported.push(key)
  }

  for (const group of raw) {
    if (!group || typeof group !== 'object') continue
    const record = group as Record<string, unknown>
    const requirements: FeatPrerequisite[] = []

    // Fail closed on any key this resolver has no primitive for. A key that
    // is recognized but malformed is also unsupported, never silently
    // ignored -- ignoring it would read as "no prerequisite".
    for (const key of Object.keys(record)) {
      if (!SUPPORTED_PREREQUISITE_KEYS.has(key)) reportUnsupported(key)
    }

    if (typeof record.level === 'number') {
      requirements.push({ kind: 'level', level: record.level })
    } else if (record.level !== undefined) {
      reportUnsupported('level')
    }

    // Real shape: `ability: [{ <abilityKey>: <minimum> }]` -- a
    // single-element array carrying one ability/minimum pair (every one of
    // the 43 General feats' own prerequisite entries uses exactly this
    // shape when an ability minimum applies at all; never modeled as
    // anything richer than that, matching "do not invent shapes absent from
    // the corpus").
    if (record.ability !== undefined) {
      const abilityEntry = Array.isArray(record.ability) ? record.ability[0] : undefined
      const pair = abilityEntry && typeof abilityEntry === 'object'
        ? Object.entries(abilityEntry as Record<string, unknown>)[0]
        : undefined
      if (pair && typeof pair[0] === 'string' && typeof pair[1] === 'number') {
        requirements.push({ kind: 'ability', ability: pair[0], minimum: pair[1] })
      } else {
        reportUnsupported('ability')
      }
    }

    // Real shape: `proficiency: [{ armor: 'light' | 'medium' | 'heavy' }]`
    // (Heavily Armored/Heavy Armor Master/Moderately Armored/Medium Armor
    // Master) or `[{ armor: 'shield' }]` (Shield Master) -- the only
    // `proficiency` shape the real corpus contains.
    if (record.proficiency !== undefined) {
      const profEntry = Array.isArray(record.proficiency) ? record.proficiency[0] : undefined
      const tier = profEntry && typeof profEntry === 'object'
        ? (profEntry as Record<string, unknown>).armor
        : undefined
      if (tier === 'light' || tier === 'medium' || tier === 'heavy' || tier === 'shield') {
        requirements.push({ kind: 'armor-proficiency', tier })
      } else {
        reportUnsupported('proficiency')
      }
    }

    if (record.spellcasting2020 === true) {
      requirements.push({ kind: 'spellcasting' })
    } else if (record.spellcasting2020 !== undefined) {
      reportUnsupported('spellcasting2020')
    }

    // An OR-group that carries no requirement at all is still reported
    // above when it had unknown keys; a genuinely empty group is skipped.
    if (requirements.length) result.groups.push(requirements)
  }

  return result
}

// The real `ability` field's three shapes -- see types.ts's own
// FeatAbilityIncrease header for which real feats produce each one. Ability
// Score Improvement is discriminated structurally (two `choose` entries,
// the second carrying `count: 2`), never by feat NAME -- see this phase's
// own explicit "do not special-case this feat by display name" instruction.
function resolveAbilityIncrease(raw: unknown): FeatAbilityIncrease | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined

  // The ASI shape: exactly two entries, both `choose`-shaped, the second
  // one declaring `count: 2` (the real corpus's own literal encoding of
  // "OR +1 to two distinct abilities" as a second, alternative grant
  // entry). No other feat in the 43-entry General corpus has more than one
  // `ability` array entry.
  if (raw.length === 2) {
    const [first, second] = raw as Record<string, unknown>[]
    const firstChoose = first?.choose as Record<string, unknown> | undefined
    const secondChoose = second?.choose as Record<string, unknown> | undefined

    if (
      firstChoose && Array.isArray(firstChoose.from) && typeof firstChoose.amount === 'number'
      && secondChoose && Array.isArray(secondChoose.from) && typeof secondChoose.count === 'number'
    ) {
      return { mode: 'asi', from: firstChoose.from.filter((key): key is string => typeof key === 'string') }
    }
  }

  const entry = raw[0] as Record<string, unknown>

  // Fixed: `[{ <abilityKey>: 1 }]` -- e.g. Crossbow Expert's `[{dex: 1}]`.
  // `max` is the ability CAP that rides alongside a `choose` (Epic Boon:
  // `[{ choose: {...}, max: 30 }]`), never an ability key -- reading it as one
  // produced `fixed: 'max'`, the defect this branch used to have. Only a
  // numeric value under a real ability key can be a fixed increase.
  const fixedEntries = Object.entries(entry).filter(([key]) => key !== 'choose' && key !== 'hidden' && key !== 'max')
  if (fixedEntries.length === 1) {
    const [abilityKey, amount] = fixedEntries[0]!
    if (typeof amount === 'number' && amount > 0) {
      return { mode: 'fixed', ability: abilityKey }
    }
  }

  // Choose: `[{ choose: { from: [...] } }]` (amount absent means 1) -- e.g.
  // Athlete's `[{ choose: { from: ['str','dex'] } }]`.
  const choose = entry.choose as Record<string, unknown> | undefined
  if (choose && Array.isArray(choose.from)) {
    return { mode: 'choose', from: choose.from.filter((key): key is string => typeof key === 'string') }
  }

  return undefined
}

// The corpus cap on an ability increase (`max` on the first `ability` entry).
// Absent for every General and Origin feat; 30 for every Epic Boon.
function resolveAbilityCap(raw: unknown): number | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined
  const entry = raw[0] as Record<string, unknown> | undefined
  return entry && typeof entry.max === 'number' ? entry.max : undefined
}

export function resolveDnd5eFeatMechanics(data: unknown): CanonicalFeatMechanics | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>

  const category = resolveCategory(record.category)
  const variant = resolveVariant(record.category)
  if (!category || !variant) return null

  const prerequisites = resolvePrerequisiteGroups(record.prerequisite)
  const abilityCap = resolveAbilityCap(record.ability)

  return {
    category,
    variant,
    repeatable: record.repeatable === true,
    prerequisiteGroups: prerequisites.groups,
    unsupportedPrerequisites: prerequisites.unsupported,
    abilityIncrease: resolveAbilityIncrease(record.ability),
    ...(abilityCap !== undefined ? { abilityCap } : {})
  }
}
