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
  FeatPrerequisite
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

function resolvePrerequisiteGroups(raw: unknown): FeatPrerequisite[][] {
  if (!Array.isArray(raw)) return []

  const groups: FeatPrerequisite[][] = []

  for (const group of raw) {
    if (!group || typeof group !== 'object') continue
    const record = group as Record<string, unknown>
    const requirements: FeatPrerequisite[] = []

    if (typeof record.level === 'number') {
      requirements.push({ kind: 'level', level: record.level })
    }

    // Real shape: `ability: [{ <abilityKey>: <minimum> }]` -- a
    // single-element array carrying one ability/minimum pair (every one of
    // the 43 General feats' own prerequisite entries uses exactly this
    // shape when an ability minimum applies at all; never modeled as
    // anything richer than that, matching "do not invent shapes absent from
    // the corpus").
    if (Array.isArray(record.ability) && record.ability.length) {
      const abilityEntry = record.ability[0]
      if (abilityEntry && typeof abilityEntry === 'object') {
        const [abilityKey, minimum] = Object.entries(abilityEntry as Record<string, unknown>)[0] ?? []
        if (typeof abilityKey === 'string' && typeof minimum === 'number') {
          requirements.push({ kind: 'ability', ability: abilityKey, minimum })
        }
      }
    }

    // Real shape: `proficiency: [{ armor: 'light' | 'medium' | 'heavy' }]`
    // (Heavily Armored/Heavy Armor Master/Moderately Armored/Medium Armor
    // Master) or `[{ armor: 'shield' }]` (Shield Master) -- the only
    // `proficiency` shape the real corpus contains.
    if (Array.isArray(record.proficiency) && record.proficiency.length) {
      const profEntry = record.proficiency[0]
      const tier = profEntry && typeof profEntry === 'object'
        ? (profEntry as Record<string, unknown>).armor
        : undefined
      if (tier === 'light' || tier === 'medium' || tier === 'heavy' || tier === 'shield') {
        requirements.push({ kind: 'armor-proficiency', tier })
      }
    }

    if (record.spellcasting2020 === true) {
      requirements.push({ kind: 'spellcasting' })
    }

    if (requirements.length) groups.push(requirements)
  }

  return groups
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
  const fixedEntries = Object.entries(entry).filter(([key]) => key !== 'choose' && key !== 'hidden')
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

export function resolveDnd5eFeatMechanics(data: unknown): CanonicalFeatMechanics | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>

  const category = resolveCategory(record.category)
  if (!category) return null

  return {
    category,
    repeatable: record.repeatable === true,
    prerequisiteGroups: resolvePrerequisiteGroups(record.prerequisite),
    abilityIncrease: resolveAbilityIncrease(record.ability)
  }
}
