// D&D 5e Item Mechanics Editing -- Items Mechanics Editing, release one.
// The rules/provider boundary the generic override machinery
// (content-authoring/overrides.ts) and the generic editor UI never cross:
// this is the ONE place that knows a mechanics override path named
// "damage" means 5etools' `dmg1`/`dmgType`, or that "attunement" means
// `reqAttune`/`attunement`. Mirrors ./dnd5e.ts's own posture (a pure
// function of raw data, no I/O) and its own closed vocabularies
// (PROPERTY_MAP) exactly, rather than inventing a second one.
//
// APPROVED FIELD SET (release one; see the Items Mechanics Editing brief):
// rarity, weight, attunement (+ optional restriction text), primary weapon
// damage dice + damage type, weapon properties. Deliberately EXCLUDED:
// item type/category, weaponCategory, mastery, range, versatile/secondary
// damage, Armor Class, attack/damage bonuses, monetary value -- either out
// of scope for this release or unsafe to edit in isolation (type especially
// -- see this module's own header note on resolveDnd5eItemMechanics's three
// independent weapon discriminators).
//
// LOGICAL FIELDS, NOT RAW KEYS. `attunement` and `damage` are each ONE
// override path whose value expands to TWO raw keys at merge time
// (reqAttune+attunement; dmg1+dmgType) -- "treat related raw-key changes as
// one logical field operation" is satisfied structurally: there is no way
// to store a half-applied state, since a single override entry always
// carries both raw keys' new values together.

import type { FieldOverride } from '../content-authoring/overrides'

export const ITEM_MECHANICS_OVERRIDE_PATHS = ['rarity', 'weight', 'attunement', 'damage', 'property'] as const
export type ItemMechanicsOverridePath = typeof ITEM_MECHANICS_OVERRIDE_PATHS[number]

export function isItemMechanicsOverridePath(path: string): path is ItemMechanicsOverridePath {
  return (ITEM_MECHANICS_OVERRIDE_PATHS as readonly string[]).includes(path)
}

// The same closed rarity vocabulary Homebrew's own item builder already
// offers (AdminHomebrewForgePanel.vue's ITEM_RARITY_OPTIONS) -- reused, not
// reinvented, so the two admin surfaces never disagree about what "a
// supported rarity" means.
export const ITEM_RARITY_OPTIONS = ['none', 'common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] as const

// Weapon damage types, 5etools codes -- the full legitimate set for a
// WEAPON specifically (unlike the wider item corpus's damage-type vocabulary
// for spells/traps), matching app/lib/content-actions/dnd5e.ts's own
// DAMAGE_TYPE_LABELS exactly.
export const WEAPON_DAMAGE_TYPE_OPTIONS = [
  { code: 'B', label: 'Bludgeoning' },
  { code: 'P', label: 'Piercing' },
  { code: 'S', label: 'Slashing' }
] as const
const WEAPON_DAMAGE_TYPE_CODES: ReadonlySet<string> = new Set(WEAPON_DAMAGE_TYPE_OPTIONS.map((option) => option.code as string))

// The real XPHB weapon property vocabulary, by SEMANTIC name -- mirrors
// ./dnd5e.ts's own PROPERTY_MAP values exactly (its keys are raw codes;
// this module edits by the resolved semantic name, the same shape
// CanonicalItemMechanics.properties already exposes to every other
// consumer). Reusing WeaponProperty as the type, not redeclaring it.
export const WEAPON_PROPERTY_EDIT_OPTIONS: ReadonlyArray<{ code: string; property: string; label: string }> = [
  { code: 'A', property: 'ammunition', label: 'Ammunition' },
  { code: 'F', property: 'finesse', label: 'Finesse' },
  { code: 'H', property: 'heavy', label: 'Heavy' },
  { code: 'L', property: 'light', label: 'Light' },
  { code: 'LD', property: 'loading', label: 'Loading' },
  { code: 'R', property: 'reach', label: 'Reach' },
  { code: 'T', property: 'thrown', label: 'Thrown' },
  { code: 'V', property: 'versatile', label: 'Versatile' },
  { code: '2H', property: 'two-handed', label: 'Two-Handed' }
]

// Mirrors app/lib/content-actions/dnd5e.ts's own parseDiceExpression
// EXACTLY (same regex, same positive-integer requirement) plus a sane
// upper bound neither that parser nor anything else currently enforces --
// a defensive sanity limit on admin-entered values, not a rule the real
// corpus is known to need. A value this rejects can never silently produce
// "no roll" the way an unbounded modifier-bearing expression ("1d8+2")
// already does at resolveWeaponAction's own parse step.
const MAX_DICE_COUNT = 100
const MAX_DICE_FACES = 1000

export function isSupportedDamageDiceExpression(text: string): boolean {
  const match = /^(\d+)d(\d+)$/.exec(text.trim())
  if (!match) return false
  const count = Number(match[1])
  const faces = Number(match[2])
  return Number.isInteger(count) && count > 0 && count <= MAX_DICE_COUNT
    && Number.isInteger(faces) && faces > 0 && faces <= MAX_DICE_FACES
}

export type ItemAttunementOverrideValue = { required: boolean; text: string | null }
export type ItemDamageOverrideValue = { dice: string; damageType: string | null }

export type ValueValidation = { ok: true } | { ok: false; problems: string[] }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Server-side path+value validation -- the authoritative check (client-side
// validation mirrors this for usability only, see
// StudioEntityEditor.vue's own field inputs). Never throws; every problem
// is collected so the route can reject the WHOLE request on any invalid
// operation, per the brief's "reject the whole request if any operation is
// invalid."
export function validateItemMechanicsOverrideValue(path: string, value: unknown): ValueValidation {
  switch (path) {
    case 'rarity': {
      if (typeof value !== 'string' || !value.trim()) return { ok: false, problems: ['rarity must be non-empty text'] }
      return { ok: true }
    }
    case 'weight': {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return { ok: false, problems: ['weight must be a finite number >= 0'] }
      }
      return { ok: true }
    }
    case 'property': {
      if (!Array.isArray(value)) return { ok: false, problems: ['property must be an array'] }
      return { ok: true }
    }
    case 'attunement': {
      if (!isPlainObject(value)) return { ok: false, problems: ['attunement must be an object with required/text'] }
      if (typeof value.required !== 'boolean') return { ok: false, problems: ['attunement.required must be true or false'] }
      if (value.text !== null && typeof value.text !== 'string') return { ok: false, problems: ['attunement.text must be text or null'] }
      return { ok: true }
    }
    case 'damage': {
      if (!isPlainObject(value)) return { ok: false, problems: ['damage must be an object with dice/damageType'] }
      if (typeof value.dice !== 'string' || !isSupportedDamageDiceExpression(value.dice)) {
        return { ok: false, problems: ["damage.dice must be a dice expression like '1d8' (no modifiers; the roll resolver does not support them)"] }
      }
      if (value.damageType !== null && !WEAPON_DAMAGE_TYPE_CODES.has(String(value.damageType))) {
        return { ok: false, problems: ['damage.damageType must be B, P, S, or null'] }
      }
      return { ok: true }
    }
    default:
      return { ok: false, problems: [`'${path}' is not an editable item mechanics field`] }
  }
}

// Pure merge: applies this entity's `mechanics`-channel FieldOverrides onto
// its raw 5etools-shaped item data. Returns a NEW object (never mutates
// `rawData`), preserves every field this release does not edit (spread,
// never a field-by-field reconstruction), and respects explicit false/
// zero/empty-array values -- there is no `|| default` coalescing anywhere
// in this function.
export function applyDnd5eItemMechanicsOverrides(rawData: unknown, mechanicsOverrides: readonly FieldOverride[]): unknown {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return rawData
  if (!mechanicsOverrides.length) return rawData

  const next: Record<string, unknown> = { ...(rawData as Record<string, unknown>) }
  let changed = false

  for (const override of mechanicsOverrides) {
    switch (override.path) {
      case 'rarity': {
        next.rarity = override.value
        changed = true
        break
      }
      case 'weight': {
        next.weight = override.value
        changed = true
        break
      }
      case 'property': {
        next.property = override.value
        changed = true
        break
      }
      case 'attunement': {
        const value = override.value as ItemAttunementOverrideValue | null
        if (value && value.required) {
          const text = typeof value.text === 'string' ? value.text.trim() : ''
          next.reqAttune = text ? value.text : true
        } else {
          next.reqAttune = false
        }
        // Both legacy raw keys are ALWAYS written together once an
        // authored opinion exists, whether enabling or disabling --
        // `attunement` (the independent legacy boolean) is never left for
        // resolveDnd5eItemAttunementRequired's OR to re-derive from, which
        // is exactly what would let "disabled" silently re-enable itself
        // if the base record's own `attunement` happened to be truthy.
        next.attunement = false
        changed = true
        break
      }
      case 'damage': {
        const value = override.value as ItemDamageOverrideValue
        next.dmg1 = value.dice
        if (value.damageType === null) delete next.dmgType
        else next.dmgType = value.damageType
        changed = true
        break
      }
      default:
        // An unrecognized path should never reach this function (validated
        // earlier, at write time) -- ignored defensively rather than
        // thrown, consistent with every other resolver in this file family
        // degrading rather than throwing on unexpected shape.
        break
    }
  }

  return changed ? next : rawData
}

// ---------------------------------------------------------------------------
// Lossless weapon-property editing -- shared by the editor UI (StudioEntityEditor.vue)
// and its own tests. Extracted here (rather than left inline in the SFC)
// so the lossless-round-trip guarantee is unit-testable as plain
// TypeScript, consistent with this project's own "business logic in
// composables/lib, not components" convention.
// ---------------------------------------------------------------------------

export type PropertyRowState = 'off' | 'on' | 'locked'
export type PropertyRow = { code: string; property: string; label: string; state: PropertyRowState; note?: string }

// A raw property/mastery entry is either a bare `'<CODE>|XPHB'` string or an
// object carrying `uid` in the identical pipe-suffixed shape -- mirrors
// ./dnd5e.ts's own `rawCode` exactly (duplicated, not imported, since that
// one is deliberately unexported -- same tolerance this file's header
// already extends to the duplicated attunement OR-check).
function rawPropertyCode(entry: unknown): string | null {
  if (typeof entry === 'string') return entry.split('|')[0] ?? null
  if (entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).uid === 'string') {
    return ((entry as Record<string, unknown>).uid as string).split('|')[0] ?? null
  }
  return null
}

// A known property code already carrying a note (Lance's own real shape,
// `{uid:'2H|XPHB', note:'unless mounted'}`) is reported LOCKED (read-only)
// -- toggling it off would silently delete real rules text, which this
// pass refuses to do. An unrecognized code (not one of the nine editable
// ones) is not represented as a row at all; it is preserved automatically
// by buildPropertyOverrideArray below without ever being shown as editable.
export function propertyRows(rawProperty: readonly unknown[]): PropertyRow[] {
  return WEAPON_PROPERTY_EDIT_OPTIONS.map((option) => {
    const entry = rawProperty.find((candidate) => rawPropertyCode(candidate) === option.code)
    if (!entry) return { ...option, state: 'off' as const }
    if (typeof entry === 'object' && entry !== null && typeof (entry as Record<string, unknown>).note === 'string' && (entry as Record<string, unknown>).note) {
      return { ...option, state: 'locked' as const, note: (entry as Record<string, unknown>).note as string }
    }
    return { ...option, state: 'on' as const }
  })
}

// Read-modify-write against the EFFECTIVE raw property array the caller
// loaded (never recomputed from checkbox state alone) -- every
// locked/unrecognized entry passes through verbatim, unreordered relative
// to itself; only the editable (non-locked) rows actually toggled change
// shape. `checked` is keyed by WeaponProperty semantic name (PropertyRow.property).
export function buildPropertyOverrideArray(rawProperty: readonly unknown[], checked: Readonly<Record<string, boolean>>): unknown[] {
  const editableCodes = new Set(WEAPON_PROPERTY_EDIT_OPTIONS.map((option) => option.code))
  const preserved = rawProperty.filter((entry) => {
    const code = rawPropertyCode(entry)
    if (!code || !editableCodes.has(code)) return true // unrecognized -- always preserved
    return typeof entry === 'object' && entry !== null && Boolean((entry as Record<string, unknown>).note) // locked/note-bearing -- always preserved
  })
  const toggledOn = WEAPON_PROPERTY_EDIT_OPTIONS.filter((option) => checked[option.property]).map((option) => option.code)
  return [...preserved, ...toggledOn]
}

// Effective-value helpers for the editor's own draft seeding -- reading
// the CURRENT (already-merged, i.e. effective) raw record back into the
// same logical shape the override value takes, so "preserve existing
// restriction text unless the user explicitly changes it" has a concrete
// source to seed from. Mirrors server/utils/dnd5e-items.ts's own
// attunement-text extraction (lines ~295-297) exactly -- the one existing
// place in this codebase that already solved "show the real restriction
// text," reused rather than reimplemented.
export function effectiveAttunementValue(effectiveData: unknown): ItemAttunementOverrideValue {
  if (!effectiveData || typeof effectiveData !== 'object') return { required: false, text: null }
  const record = effectiveData as Record<string, unknown>
  const required = Boolean(record.reqAttune) || Boolean(record.attunement)
  const text = typeof record.reqAttune === 'string' ? record.reqAttune : null
  return { required, text }
}

export function effectiveDamageValue(effectiveData: unknown): ItemDamageOverrideValue | null {
  if (!effectiveData || typeof effectiveData !== 'object') return null
  const record = effectiveData as Record<string, unknown>
  if (typeof record.dmg1 !== 'string' || !record.dmg1) return null
  return { dice: record.dmg1, damageType: typeof record.dmgType === 'string' ? record.dmgType : null }
}
