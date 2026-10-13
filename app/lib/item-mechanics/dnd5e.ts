// Canonical Item Mechanics -- dnd5e resolver. The ONE place a 5etools
// `baseitem` JSON field name (`weaponCategory`, `type`, `property`,
// `mastery`) is read. Mirrors app/lib/feat-mechanics/dnd5e.ts's own posture:
// a pure function of `data`, no I/O, no game knowledge leaking past this
// file.
//
// Real corpus shape this resolver targets (verified this phase,
// items-base.json, `source === 'XPHB'`, 40 base weapons): `weaponCategory`
// is `'simple' | 'martial'`; `type` is `'M|XPHB'` (melee) or `'R|XPHB'`
// (ranged); `property` is an array whose entries are either a bare
// `'<CODE>|XPHB'` string (or, on Staff/Wooden Staff specifically, a bare
// code with no `|XPHB` suffix at all -- `rawCode` below handles both) or
// `{ uid: '<CODE>|XPHB', note?: string }` (Lance's own real shape -- `note`
// is prose, dropped); `mastery` is a one-element array of the identical
// `string | {uid}` shape, always present on a true weapon, always exactly
// one entry.
//
// STAFF / WOODEN STAFF, traced this phase: two entries in the SAME dataset
// carry `type: 'SCF|XPHB'` (Spellcasting Focus, not `'M'`/`'R'`) YET still
// carry a full, real weapon stat block -- `weaponCategory: 'simple'`,
// `mastery: ['Topple|XPHB']`, `property: ['V']`, identical damage dice
// (`dmg1: '1d6'`, `dmg2: '1d8'`, `dmgType: 'B'`) to the ordinary Quarterstaff
// entry (`type: 'M|XPHB'`). This is RAW's real intent, not a data error: a
// Staff/Wooden Staff IS a Quarterstaff-shaped weapon that doubles as an
// Arcane/Druidic Focus, published under its focus identity (`type: SCF`)
// because that is its primary equipment-list role -- confirmed by checking
// every one of the 12 real SCF-typed items in the dataset: the other 10
// (Crystal, Orb, Rod, Wand, each PHB/XPHB) carry NO `weaponCategory` at
// all, so `weaponCategory` presence is the real, structural signal that an
// SCF item ALSO has weapon stats, never a name check. `type` therefore
// decides melee/ranged ONLY when it names one explicitly (`M`/`R`); an
// item whose own `type` names neither BUT which carries `weaponCategory`
// is melee -- the only shape ANY corpus entry with this combination has
// ever taken (no ranged weapon/focus hybrid exists in the dataset).

import type { CanonicalItemMechanics, WeaponMasteryProperty, WeaponProperty } from './types'

// The real corpus's own property-code vocabulary -- closed to exactly the
// nine codes the 40 base weapons use (see types.ts's own WeaponProperty
// header for why Special is deliberately absent).
const PROPERTY_MAP: Record<string, WeaponProperty> = {
  A: 'ammunition',
  F: 'finesse',
  H: 'heavy',
  L: 'light',
  LD: 'loading',
  R: 'reach',
  T: 'thrown',
  V: 'versatile',
  '2H': 'two-handed'
}

const MASTERY_PROPERTIES: readonly WeaponMasteryProperty[] = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex']

// A raw property/mastery entry is either a bare `'<CODE>|XPHB'` string or an
// object carrying `uid` in the identical pipe-suffixed shape (Lance's own
// `{uid: '2H|XPHB', note: 'unless mounted'}`) -- `note` is prose and is
// never read here.
function rawCode(entry: unknown): string | null {
  if (typeof entry === 'string') return entry.split('|')[0] ?? null
  if (entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).uid === 'string') {
    return ((entry as Record<string, unknown>).uid as string).split('|')[0] ?? null
  }
  return null
}

function resolveProperties(raw: unknown): WeaponProperty[] {
  if (!Array.isArray(raw)) return []
  const out: WeaponProperty[] = []
  for (const entry of raw) {
    const code = rawCode(entry)
    const mapped = code ? PROPERTY_MAP[code] : undefined
    if (mapped && !out.includes(mapped)) out.push(mapped)
  }
  return out
}

function resolveMasteryProperty(raw: unknown): WeaponMasteryProperty | null {
  if (!Array.isArray(raw) || raw.length !== 1) return null
  const code = rawCode(raw[0])
  const match = MASTERY_PROPERTIES.find((candidate) => candidate === code)
  return match ?? null
}

// GENERIC weapon-proficiency-group derivation (see types.ts's own
// `proficiencyGroups` header) -- the one place the real XPHB filtered-group
// taxonomy (martial_light / martial_finesse_light) is encoded, by PROPERTY,
// never by weapon name or owning class.
function resolveProficiencyGroups(weaponCategory: 'simple' | 'martial', properties: readonly WeaponProperty[]): string[] {
  if (weaponCategory === 'simple') return ['simple']
  const groups = ['martial']
  if (properties.includes('light')) groups.push('martial_light')
  if (properties.includes('light') || properties.includes('finesse')) groups.push('martial_finesse_light')
  return groups
}

export function resolveDnd5eItemMechanics(data: unknown): CanonicalItemMechanics | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>

  const weaponCategory = record.weaponCategory === 'simple' || record.weaponCategory === 'martial' ? record.weaponCategory : null
  if (!weaponCategory) return null

  const typeCode = typeof record.type === 'string' ? record.type.split('|')[0] : null
  // `weaponCategory` already guards this whole function (above) -- an item
  // whose own `type` names neither 'M' nor 'R' but which still carries
  // `weaponCategory` (Staff, Wooden Staff) is melee, the only shape this
  // combination has ever taken in the real corpus (see this file's own
  // header).
  const range = typeCode === 'R' ? 'ranged' : 'melee'
  const masteryProperty = resolveMasteryProperty(record.mastery)
  if (!masteryProperty) return null

  const properties = resolveProperties(record.property)

  return {
    kind: 'weapon',
    weaponCategory,
    range,
    properties,
    masteryProperty,
    proficiencyGroups: resolveProficiencyGroups(weaponCategory, properties)
  }
}
