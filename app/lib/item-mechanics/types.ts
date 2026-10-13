// Canonical Item Mechanics -- Weapon Mastery phase.
//
// The item counterpart of app/lib/feat-mechanics/types.ts and
// app/lib/spell-mechanics/types.ts: a small, system-agnostic shape a resolver
// produces from a Content Pack entry's raw `data`, computed at READ TIME
// (never at publish time, never persisted), mirroring exactly how
// `resolveFeatMechanics`/`resolveSpellMechanics` already work. No 5etools
// field name reaches any consumer of this type -- only ./dnd5e.ts knows what
// `weaponCategory`/`mastery`/`property` mean.
//
// MILESTONE A SCOPE: only WEAPONS are resolved. A non-weapon item (armor, a
// tool, a trade good) resolves to `null` here -- "this entry is not a
// weapon" -- the same fail-closed, "absent entirely means not even a
// candidate" posture `featMechanics`/`spellMechanics` already establish.
// `kind: 'weapon'` is a discriminant on purpose, not a bare flat shape, so a
// future item kind (e.g. 'armor', for an armor-category choice) can be added
// as a sibling without reshaping this one.

// The real XPHB weapon property vocabulary this phase's own corpus trace
// found (items-base.json, all 40 weapons): exactly nine property codes are
// used (A, F, H, L, LD, R, T, V, 2H) -- Special ('S') appears in the wider
// item corpus but not on any of the 40 base weapons, so it is deliberately
// not modeled here; a future item whose raw `property` contains it resolves
// that one entry's `properties` without it (never invented, never guessed).
export type WeaponProperty =
  | 'ammunition' | 'finesse' | 'heavy' | 'light' | 'loading'
  | 'reach' | 'thrown' | 'two-handed' | 'versatile'

// The real XPHB Weapon Mastery property vocabulary (8 kinds, items-base.json
// `mastery` field, every one of the 40 base weapons carries exactly one).
export type WeaponMasteryProperty =
  | 'Cleave' | 'Graze' | 'Nick' | 'Push' | 'Sap' | 'Slow' | 'Topple' | 'Vex'

export type CanonicalItemMechanics = {
  kind: 'weapon'
  weaponCategory: 'simple' | 'martial'
  range: 'melee' | 'ranged'
  properties: readonly WeaponProperty[]
  masteryProperty: WeaponMasteryProperty
  // GENERIC weapon-proficiency-group identity, never a class name: the
  // `value:weapon.<group>.proficient` GROUP SUFFIXES (P1's own vocabulary,
  // app/lib/content-rules/proficiency-vocabulary.ts's WEAPON_GROUPS) this
  // exact weapon satisfies, derived purely from its own weaponCategory and
  // properties -- a Simple weapon always satisfies only `simple`; a Martial
  // weapon always satisfies `martial`, plus `martial_light` when it has the
  // Light property and `martial_finesse_light` when it has the Finesse OR
  // Light property (the real corpus's own filtered-proficiency text for
  // Monk/Rogue, confirmed this phase against class-monk.json/class-
  // rogue.json's own `startingProficiencies.weapons` text). A character is
  // proficient with this weapon when ANY one of these groups is active on
  // their own derived state -- the caller's job (item-mechanics/eligibility.ts),
  // never this resolver's.
  proficiencyGroups: readonly string[]
}

export type ItemMechanicsResolver = (data: unknown) => CanonicalItemMechanics | null
