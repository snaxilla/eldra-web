// Content Action Models -- the Character Actions System.
//
// The vocabulary the Character Sheet's Actions panel speaks, shaped
// deliberately like app/lib/content-presentation/types.ts's own
// `PresentationEntry`: one system-agnostic shape every content category
// resolves to, so ONE consumer (the Actions panel) renders a weapon, a
// spell, and a species trait without knowing which kind it is looking at or
// which game system produced it.
//
// ---------------------------------------------------------------------------
// PRESENTATION, NOT RULES -- THE SAME BOUNDARY, ONE LAYER OVER
// ---------------------------------------------------------------------------
// A resolver here states what a Content Pack already publishes about
// something a character can DO: its name, what kind of action it is, its
// range, and its damage EXPRESSION (a string like "1d8 slashing" -- never a
// rolled number, never resolved). Nothing here computes gameplay: no hit is
// resolved, no damage is applied, no save is rolled. `content-presentation`'s
// own header states this for narrative facts; the identical rule applies
// here to action facts.
//
// `attackBonus` and `saveDc` are deliberately ABSENT from this type. Both are
// Rules Engine output (packages/eldra-dnd5e-2024's `combat`/`spellcasting`
// categories) attached by server/utils/character-actions.ts AFTER a
// ContentAction is resolved -- this module knows nothing about a character's
// ability scores or proficiency bonus, only about what a piece of content
// says an action does.

// The catalogue category raw content comes from -- what a resolver is asked
// to translate. Matches the catalogue categories world-content-catalogue.ts
// already declares (minus feats/monsters, which grant no actions this task
// scopes).
export type ContentSourceCategory = 'item' | 'spell' | 'species' | 'class' | 'background'

// What KIND of action a resolved ContentAction is -- broader than
// ContentSourceCategory in one direction ('unarmed' is never a resolver
// input; it is synthesized directly by server/utils/character-actions.ts,
// the same way Armor Class's 10-plus-Dex baseline is a structural default
// rather than something any Content Pack publishes) and narrower in another
// ('item' input only ever produces a 'weapon' action or no action at all --
// most items are not weapons).
export type ActionCategory = 'weapon' | 'unarmed' | 'spell' | 'species' | 'class' | 'background'

export type ContentAction = {
  name: string
  category: ActionCategory
  // A short presentation label -- "Melee Attack", "Ranged Attack",
  // "Cantrip (Evocation)", "Feature". Never branched on structurally by a
  // consumer beyond display; it is words, not an enum with behavior.
  actionType: string
  range?: string
  // A presentation-only expression, never rolled or computed -- "1d8
  // slashing", "2d6 fire". Absent when the pack does not state one.
  damage?: string
  description?: string
  // When the pack states it -- a spell's casting time, a class feature's
  // granted level, a limited-use trait's recharge. Absent, never invented.
  usage?: string
  sourceBook?: string
}

// One game system's translation of raw Content Pack `data` into the actions
// it grants. Returns [] when the data yields none -- most items are not
// weapons, most content grants no action at all, and an empty list is a
// legitimate, common result, not a degraded one.
export type ContentActionResolver = (
  category: ContentSourceCategory,
  data: unknown
) => ContentAction[]
