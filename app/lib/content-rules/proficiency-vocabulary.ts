// D&D 2024 Character Rules -- PROFICIENCY / TRAINING VOCABULARY (P1).
//
// The one place that maps the corpus's proficiency tokens to package Value ids. Discovery
// (mandatory-decisions.ts) records the tokens of each proficiency decision in its `detail`; the
// coverage contract resolves them here and checks that the owning facet really grants or offers
// those Values. A token with no mapping resolves to nothing, and that decision stays blocked.
//
// SEMANTIC FAMILIES (deliberately separate, never merged because English calls them all
// "proficiency"):
//   skill     value:skill.<x>.proficient      (unchanged; Phase 2B duplicate rules apply)
//   save      value:save.<x>.proficient       (unchanged; one saving-throw model)
//   armor     value:armor.<category>.proficient   armor TRAINING (light, medium, heavy, shield)
//   weapon    value:weapon.<group>.proficient     weapon TRAINING (broad groups and filtered groups)
//   tool      value:tool.<identity>.proficient    TOOL proficiency (artisan's tools, instruments,
//                                                 gaming sets, other tools), one Value per identity
//
// Weapon Mastery is NOT here. It is a separate mechanic whose later phase may reuse weapon
// identities; P1 never applies mastery properties.
//
// Languages and damage types are not here (see §25.23 of the completeness audit).

// Tool identities, by the corpus family. Names are the corpus item names (items-base.json for
// artisan's tools and instruments, items.json for gaming sets and other tools).
export const TOOL_FAMILIES = {
  artisan: [
    "Alchemist's Supplies", "Brewer's Supplies", "Calligrapher's Supplies", "Carpenter's Tools",
    "Cartographer's Tools", "Cobbler's Tools", "Cook's Utensils", "Glassblower's Tools",
    "Jeweler's Tools", "Leatherworker's Tools", "Mason's Tools", "Painter's Supplies",
    "Potter's Tools", "Smith's Tools", "Tinker's Tools", "Weaver's Tools", "Woodcarver's Tools"
  ],
  instrument: ['Bagpipes', 'Drum', 'Dulcimer', 'Flute', 'Horn', 'Lute', 'Lyre', 'Pan Flute', 'Shawm', 'Viol'],
  'gaming-set': ['Dice Set', 'Dragonchess Set', 'Playing Cards', 'Three-Dragon Ante Set'],
  other: ['Disguise Kit', 'Forgery Kit', 'Herbalism Kit', "Navigator's Tools", "Poisoner's Kit", "Thieves' Tools"]
} as const

export type ToolFamily = keyof typeof TOOL_FAMILIES

export const ARMOR_CATEGORIES = ['light', 'medium', 'heavy', 'shield'] as const
export const WEAPON_GROUPS = ['simple', 'martial', 'improvised', 'martial_light', 'martial_finesse_light'] as const
export const SKILLS = [
  'acrobatics', 'animal_handling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation',
  'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion',
  'sleight_of_hand', 'stealth', 'survival'
] as const
export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

// The stable identity of a tool name: lowercase, apostrophes removed, other runs as underscores.
export function toolSlugOf(name: string): string {
  return name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export function toolValueId(name: string): string {
  return `value:tool.${toolSlugOf(name)}.proficient`
}

export function armorValueId(category: string): string {
  return `value:armor.${category}.proficient`
}

export function weaponValueId(group: string): string {
  return `value:weapon.${group}.proficient`
}

export function familyToolIds(family: ToolFamily): string[] {
  return TOOL_FAMILIES[family].map(toolValueId)
}

export function allToolIds(): string[] {
  return (Object.keys(TOOL_FAMILIES) as ToolFamily[]).flatMap(familyToolIds)
}

export function skillValueId(skill: string): string {
  return `value:skill.${skill}.proficient`
}

export function saveValueId(ability: string): string {
  return `value:save.${ability}.proficient`
}

// Resolves one discovery token to the Value ids it stands for. Tokens are written by discovery as
// `family:payload`, and several are joined by "," (see mandatory-decisions.ts). Unknown tokens
// resolve to an empty list, so they can never accidentally be satisfied.
export function valueIdsOfToken(token: string): string[] {
  const [kind, payload = ''] = token.split(/:(.*)/s)
  switch (kind) {
    case 'armor':
      return payload.split(',').filter((c) => (ARMOR_CATEGORIES as readonly string[]).includes(c)).map(armorValueId)
    case 'weapon':
      return payload.split(',').filter((g) => (WEAPON_GROUPS as readonly string[]).includes(g)).map(weaponValueId)
    case 'tool':
      return [toolValueId(payload)]
    case 'tools-from':
      return payload.split('|').map(toolValueId)
    case 'tools-choice': {
      return payload.split(',').flatMap((family) => (family in TOOL_FAMILIES ? familyToolIds(family as ToolFamily) : []))
    }
    case 'skill-tool':
      return payload === 'any' ? [...SKILLS.map(skillValueId), ...allToolIds()] : []
    case 'save':
      return payload.split(',').filter((a) => (ABILITY_KEYS as readonly string[]).includes(a)).map(saveValueId)
    default:
      return []
  }
}

export function valueIdsOfDetail(detail: string | undefined): string[] {
  if (!detail) return []
  // Only the proficiency tokens carry a family prefix; anything else is not a proficiency detail.
  return detail.split(';').flatMap((token) => valueIdsOfToken(token.trim()))
}
