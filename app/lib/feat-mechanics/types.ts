// Canonical Feat Mechanics -- D&D 2024 Character Rules Phase 2A.1.
//
// The feat counterpart of app/lib/spell-mechanics/types.ts: a small,
// system-agnostic shape a resolver produces from a Content Pack entry's raw
// `data`, computed at READ TIME (never at publish time, never persisted),
// mirroring exactly how `resolveSpellMechanics`/`resolveContentPresentation`
// already work for spells/species/classes/backgrounds. No 5etools field name
// reaches any consumer of this type -- only ./dnd5e.ts knows what
// `prerequisite[].ability[0].dex` means.
//
// WHY THIS EXISTS, NOT A STRUCTURAL CATALOGUE FIELD: the Phase 2A0 audit
// traced `parentClassSlug` (subclasses) as the precedent for "structural
// metadata a catalogue entry needs beyond identity" -- but that field is
// normalized ONCE at import/publish time because a Content Pack republish
// was already an accepted cost for that phase. Feat category/prerequisite/
// repeatable/ability-increase metadata is ALREADY present, verified this
// phase by a direct Directus read against the real published
// `eldra.solaris.xphb@1.0.6` content_packs row, inside every feat entry's
// existing `data` payload -- resolving it at read time (like spellMechanics)
// needs no republish, no provider change, and no new Content Source
// selection, which a structural field would have required.

// The real XPHB feat-category census this phase's own corpus trace
// established (feats.json, `source === 'XPHB'`): G=43, O=10, FS=10, FS:P=1,
// FS:R=1, EB=12. Fighting Style's two book-variant suffixes (`FS:P`/`FS:R`)
// collapse into the one 'fighting-style' category here -- nothing in this
// phase's scope (the ordinary ASI-tier General feat selector) distinguishes
// them, and a future Fighting Style Builder step can re-derive the variant
// from the resolved catalogue entry's own title/prerequisite if it ever
// needs to.
export type FeatCategory = 'general' | 'origin' | 'fighting-style' | 'epic-boon'

// The SOURCE variant -- the raw 5etools `category` key a feat was published
// under. Preserved alongside the semantic category, never collapsed into it:
// `FS`, `FS:P`, and `FS:R` are all `fighting-style`, but a Fighter may take
// only `FS` (its class text filters `category=FS`), while a Paladin/Ranger
// may also take their own `FS:P`/`FS:R` (Blessed/Druidic Warrior). Collapsing
// them would make a plain `fighting-style` filter offer Blessed Warrior to a
// Fighter. Fighting Style acquisition itself is NOT implemented by this type
// -- this only keeps the identity a later filter needs.
export type FeatVariant = 'G' | 'O' | 'FS' | 'FS:P' | 'FS:R' | 'EB'

// The ONE structurally-supported feat effect this phase implements -- see
// dnd5e-2024.ts's own FEAT AUDIT header for why every OTHER General feat
// mechanic (Crossbow Expert's loading-property text, Great Weapon Master's
// bonus-action attack, ...) is deliberately NOT modeled here. Every one of
// the 43 real General feats grants exactly one of these three shapes
// (verified this phase, feats.json `ability` field, all 43 entries):
//
//   'fixed'  -- a specific named ability, +1, no choice (e.g. Crossbow
//               Expert: dex+1).
//   'choose' -- +1 to ONE ability chosen from a short list (e.g. Athlete:
//               choose str or dex, +1).
//   'asi'    -- the Ability Score Improvement feat's own unique double
//               shape: EITHER +2 to one ability OR +1 to two DISTINCT
//               abilities, chosen from all six. Exactly one feat in the
//               entire 43-feat corpus has this shape.
export type FeatAbilityIncrease =
  | { mode: 'fixed'; ability: string }
  | { mode: 'choose'; from: readonly string[] }
  | { mode: 'asi'; from: readonly string[] }

// The real corpus prerequisite vocabulary this phase's own trace found
// (feats.json, all 43 General feats) -- exactly four shapes, no more:
// `level` (always 4 for every General feat), `ability` (a minimum score on
// one named ability), `proficiency` (armor-tier proficiency -- Heavily
// Armored/Heavy Armor Master/Moderately Armored/Medium Armor Master/Shield
// Master), and `spellcasting2020` (Elemental Adept/Spell Sniper/War
// Caster). Deliberately closed to exactly these four -- "Do not invent
// prerequisite types absent from the corpus" (this phase's own instruction).
export type FeatPrerequisite =
  | { kind: 'level'; level: number }
  | { kind: 'ability'; ability: string; minimum: number }
  | { kind: 'armor-proficiency'; tier: 'light' | 'medium' | 'heavy' | 'shield' }
  | { kind: 'spellcasting' }

// One feat's real structural shape. `prerequisiteGroups` mirrors the real
// corpus's own OR-of-AND shape exactly: 5etools' `prerequisite` field is an
// array of alternative requirement sets (e.g. Athlete's real prerequisite is
// "level 4 AND str>=13" OR "level 4 AND dex>=13") -- each inner array is a
// set of requirements that must ALL hold (AND); satisfying ANY one outer
// entry (OR) is enough. `[]` (no groups at all) means no prerequisite beyond
// what the feat-selection ChoiceSet's own level-gating already guarantees --
// the real corpus shows this for every Origin feat (never authored here,
// this phase only resolves General) and a handful of General feats (Chef,
// Crusher, Durable, Fey-Touched, ...).
export type CanonicalFeatMechanics = {
  category: FeatCategory
  variant: FeatVariant
  repeatable: boolean
  prerequisiteGroups: readonly (readonly FeatPrerequisite[])[]
  // Prerequisite keys the engine has NO primitive for (real corpus: `feature`
  // and `otherSummary` on the Fighting Style family). Kept, never dropped: a
  // feat with ANY unsupported prerequisite is not legally selectable, so a
  // missing primitive can never make a feat accidentally legal by vanishing
  // during normalization. Empty for every feat whose prerequisites are fully
  // representable.
  unsupportedPrerequisites: readonly string[]
  abilityIncrease?: FeatAbilityIncrease
  // The corpus `max` on an ability increase (Epic Boon: 30). Absent means the
  // feat uses the ordinary ability-increase cap its ChoiceSet declares.
  abilityCap?: number
}

export type FeatMechanicsResolver = (data: unknown) => CanonicalFeatMechanics | null
