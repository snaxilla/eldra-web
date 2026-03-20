import type { EldraSystemSchema } from './types'

const importSourceBlock = {
  key: 'import_source',
  label: 'Import Source',
  icon: 'i-lucide-database-zap',
  category: 'import',
  importTarget: false,
  description: 'Metadata used to track provenance, updates, and de-duping of imported content.',
  fields: [
    { key: 'provider', label: 'Provider', type: 'text', default: 'manual', importAliases: ['provider'] },
    { key: 'external_id', label: 'External ID', type: 'text', default: '', importAliases: ['id', 'uid'] },
    { key: 'source_book', label: 'Source Book', type: 'text', default: '', importAliases: ['source', 'book'] },
    { key: 'source_page', label: 'Source Page', type: 'text', default: '', importAliases: ['page'] },
    { key: 'source_url', label: 'Source URL', type: 'text', default: '', importAliases: ['url'] },
    { key: 'imported_at', label: 'Imported At', type: 'text', default: '' },
    { key: 'import_version', label: 'Import Version', type: 'text', default: '' },
    { key: 'hash', label: 'Content Hash', type: 'text', default: '' },
    { key: 'raw_json', label: 'Raw Source JSON', type: 'json', default: {} }
  ]
} as const

const characterIdentityBlock = {
  key: 'character_identity',
  label: 'Character Identity',
  icon: 'i-lucide-user-round',
  category: 'core',
  importTarget: true,
  description: 'Core identifying info for a character.',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, default: '', importAliases: ['name'] },
    { key: 'title', label: 'Title', type: 'text', default: '' },
    { key: 'ancestry', label: 'Species / Ancestry', type: 'text', default: '', importAliases: ['race', 'species'] },
    { key: 'class_name', label: 'Class', type: 'text', default: '', importAliases: ['class', 'className'] },
    { key: 'subclass_name', label: 'Subclass', type: 'text', default: '', importAliases: ['subclass'] },
    { key: 'level', label: 'Level', type: 'number', min: 1, max: 20, step: 1, default: 1, importAliases: ['level'] },
    { key: 'background', label: 'Background', type: 'text', default: '', importAliases: ['background'] },
    { key: 'alignment', label: 'Alignment', type: 'text', default: '', importAliases: ['alignment'] },
    { key: 'portrait', label: 'Portrait Image', type: 'image', default: '' },
    { key: 'summary', label: 'Summary', type: 'textarea', default: '' }
  ]
} as const

const characterAbilitiesBlock = {
  key: 'character_abilities',
  label: 'Ability Scores',
  icon: 'i-lucide-dumbbell',
  category: 'rules',
  importTarget: true,
  description: 'Core 5e ability scores.',
  fields: [
    { key: 'strength', label: 'Strength', type: 'number', min: 1, max: 30, step: 1, default: 10, importAliases: ['str', 'strength'] },
    { key: 'dexterity', label: 'Dexterity', type: 'number', min: 1, max: 30, step: 1, default: 10, importAliases: ['dex', 'dexterity'] },
    { key: 'constitution', label: 'Constitution', type: 'number', min: 1, max: 30, step: 1, default: 10, importAliases: ['con', 'constitution'] },
    { key: 'intelligence', label: 'Intelligence', type: 'number', min: 1, max: 30, step: 1, default: 10, importAliases: ['int', 'intelligence'] },
    { key: 'wisdom', label: 'Wisdom', type: 'number', min: 1, max: 30, step: 1, default: 10, importAliases: ['wis', 'wisdom'] },
    { key: 'charisma', label: 'Charisma', type: 'number', min: 1, max: 30, step: 1, default: 10, importAliases: ['cha', 'charisma'] }
  ]
} as const

const characterCombatBlock = {
  key: 'character_combat',
  label: 'Combat Stats',
  icon: 'i-lucide-shield',
  category: 'rules',
  importTarget: true,
  description: 'Core combat-facing values.',
  fields: [
    { key: 'armor_class', label: 'Armor Class', type: 'number', min: 0, max: 99, step: 1, default: 10, importAliases: ['ac', 'armorClass'] },
    { key: 'initiative_bonus', label: 'Initiative Bonus', type: 'number', min: -20, max: 20, step: 1, default: 0, importAliases: ['initiative'] },
    { key: 'speed_walk', label: 'Walk Speed', type: 'number', min: 0, max: 300, step: 5, default: 30, importAliases: ['speed', 'walk'] },
    { key: 'hit_point_max', label: 'Max Hit Points', type: 'number', min: 1, max: 999, step: 1, default: 1, importAliases: ['hp', 'hitPointsMax'] },
    { key: 'hit_point_current', label: 'Current Hit Points', type: 'number', min: 0, max: 999, step: 1, default: 1 },
    { key: 'hit_dice', label: 'Hit Dice', type: 'text', default: '' },
    { key: 'proficiency_bonus', label: 'Proficiency Bonus', type: 'number', min: 0, max: 12, step: 1, default: 2, importAliases: ['pb', 'proficiency'] },
    { key: 'passive_perception', label: 'Passive Perception', type: 'number', min: 0, max: 99, step: 1, default: 10 }
  ]
} as const

const characterPersonalityBlock = {
  key: 'character_personality',
  label: 'Personality',
  icon: 'i-lucide-scroll-text',
  category: 'flavor',
  importTarget: true,
  description: 'Narrative fields from a typical character sheet.',
  fields: [
    { key: 'traits', label: 'Personality Traits', type: 'textarea', default: '' },
    { key: 'ideals', label: 'Ideals', type: 'textarea', default: '' },
    { key: 'bonds', label: 'Bonds', type: 'textarea', default: '' },
    { key: 'flaws', label: 'Flaws', type: 'textarea', default: '' },
    { key: 'appearance', label: 'Appearance', type: 'textarea', default: '' },
    { key: 'backstory', label: 'Backstory', type: 'markdown', default: '' }
  ]
} as const

const spellCoreBlock = {
  key: 'spell_core',
  label: 'Spell Core',
  icon: 'i-lucide-wand-sparkles',
  category: 'core',
  importTarget: true,
  description: 'Core spell definition used for compendium import.',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, default: '', importAliases: ['name'] },
    { key: 'level', label: 'Level', type: 'number', min: 0, max: 9, step: 1, default: 0, importAliases: ['level'] },
    { key: 'school', label: 'School', type: 'text', default: '', importAliases: ['school'] },
    { key: 'casting_time', label: 'Casting Time', type: 'text', default: '', importAliases: ['time', 'castingTime'] },
    { key: 'range', label: 'Range', type: 'text', default: '', importAliases: ['range'] },
    { key: 'duration', label: 'Duration', type: 'text', default: '', importAliases: ['duration'] },
    { key: 'components', label: 'Components', type: 'text', default: '', importAliases: ['components'] },
    { key: 'ritual', label: 'Ritual', type: 'boolean', default: false, importAliases: ['ritual'] },
    { key: 'concentration', label: 'Concentration', type: 'boolean', default: false, importAliases: ['concentration'] },
    { key: 'description', label: 'Description', type: 'markdown', default: '', importAliases: ['entries', 'description'] },
    { key: 'higher_level', label: 'At Higher Levels', type: 'markdown', default: '', importAliases: ['entriesHigherLevel'] }
  ]
} as const

const itemCoreBlock = {
  key: 'item_core',
  label: 'Item Core',
  icon: 'i-lucide-backpack',
  category: 'core',
  importTarget: true,
  description: 'Core item definition for compendium import.',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, default: '', importAliases: ['name'] },
    { key: 'item_type', label: 'Item Type', type: 'text', default: '', importAliases: ['type'] },
    { key: 'rarity', label: 'Rarity', type: 'text', default: '', importAliases: ['rarity'] },
    { key: 'weight', label: 'Weight', type: 'number', min: 0, max: 9999, step: 0.1, default: 0, importAliases: ['weight'] },
    { key: 'value', label: 'Value', type: 'text', default: '', importAliases: ['value'] },
    { key: 'attunement', label: 'Requires Attunement', type: 'boolean', default: false, importAliases: ['reqAttune', 'attunement'] },
    { key: 'damage', label: 'Damage', type: 'text', default: '' },
    { key: 'damage_type', label: 'Damage Type', type: 'text', default: '' },
    { key: 'armor_class', label: 'Armor Class', type: 'number', min: 0, max: 99, step: 1, default: 0 },
    { key: 'description', label: 'Description', type: 'markdown', default: '', importAliases: ['entries', 'description'] }
  ]
} as const

const featCoreBlock = {
  key: 'feat_core',
  label: 'Feat Core',
  icon: 'i-lucide-badge-plus',
  category: 'core',
  importTarget: true,
  description: 'Core feat definition for compendium import.',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, default: '', importAliases: ['name'] },
    { key: 'prerequisites', label: 'Prerequisites', type: 'textarea', default: '', importAliases: ['prerequisite'] },
    { key: 'benefits', label: 'Benefits', type: 'markdown', default: '', importAliases: ['entries', 'description'] }
  ]
} as const

const speciesCoreBlock = {
  key: 'species_core',
  label: 'Species Core',
  icon: 'i-lucide-user',
  category: 'core',
  importTarget: true,
  description: 'Core species definition.',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, default: '', importAliases: ['name'] },
    { key: 'size', label: 'Size', type: 'text', default: '', importAliases: ['size'] },
    { key: 'speed', label: 'Speed', type: 'text', default: '', importAliases: ['speed'] },
    { key: 'ability_score_increase', label: 'Ability Score Increase', type: 'textarea', default: '', importAliases: ['ability'] },
    { key: 'traits', label: 'Traits', type: 'markdown', default: '', importAliases: ['entries', 'description'] }
  ]
} as const

const backgroundCoreBlock = {
  key: 'background_core',
  label: 'Background Core',
  icon: 'i-lucide-scroll',
  category: 'core',
  importTarget: true,
  description: 'Core background definition.',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, default: '', importAliases: ['name'] },
    { key: 'skill_proficiencies', label: 'Skill Proficiencies', type: 'textarea', default: '' },
    { key: 'tool_proficiencies', label: 'Tool Proficiencies', type: 'textarea', default: '' },
    { key: 'languages', label: 'Languages', type: 'textarea', default: '' },
    { key: 'equipment', label: 'Equipment', type: 'markdown', default: '' },
    { key: 'feature_name', label: 'Feature Name', type: 'text', default: '' },
    { key: 'feature_description', label: 'Feature Description', type: 'markdown', default: '' }
  ]
} as const

const classCoreBlock = {
  key: 'class_core',
  label: 'Class Core',
  icon: 'i-lucide-swords',
  category: 'core',
  importTarget: true,
  description: 'Core class definition.',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, default: '', importAliases: ['name'] },
    { key: 'hit_die', label: 'Hit Die', type: 'text', default: '', importAliases: ['hd'] },
    { key: 'primary_ability', label: 'Primary Ability', type: 'text', default: '' },
    { key: 'saving_throws', label: 'Saving Throws', type: 'textarea', default: '' },
    { key: 'armor_proficiencies', label: 'Armor Proficiencies', type: 'textarea', default: '' },
    { key: 'weapon_proficiencies', label: 'Weapon Proficiencies', type: 'textarea', default: '' },
    { key: 'tool_proficiencies', label: 'Tool Proficiencies', type: 'textarea', default: '' },
    { key: 'description', label: 'Description', type: 'markdown', default: '', importAliases: ['entries', 'description'] }
  ]
} as const

const subclassCoreBlock = {
  key: 'subclass_core',
  label: 'Subclass Core',
  icon: 'i-lucide-shield-plus',
  category: 'core',
  importTarget: true,
  description: 'Core subclass definition.',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, default: '', importAliases: ['name'] },
    { key: 'class_name', label: 'Parent Class', type: 'text', default: '', importAliases: ['className', 'class'] },
    { key: 'description', label: 'Description', type: 'markdown', default: '', importAliases: ['entries', 'description'] }
  ]
} as const

const monsterCoreBlock = {
  key: 'monster_core',
  label: 'Monster Core',
  icon: 'i-lucide-drama',
  category: 'core',
  importTarget: true,
  description: 'Core monster definition.',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, default: '', importAliases: ['name'] },
    { key: 'size', label: 'Size', type: 'text', default: '', importAliases: ['size'] },
    { key: 'creature_type', label: 'Creature Type', type: 'text', default: '', importAliases: ['type'] },
    { key: 'alignment', label: 'Alignment', type: 'text', default: '', importAliases: ['alignment'] },
    { key: 'armor_class', label: 'Armor Class', type: 'number', min: 0, max: 99, step: 1, default: 10, importAliases: ['ac'] },
    { key: 'hit_points', label: 'Hit Points', type: 'number', min: 0, max: 9999, step: 1, default: 1, importAliases: ['hp'] },
    { key: 'speed', label: 'Speed', type: 'text', default: '', importAliases: ['speed'] },
    { key: 'challenge_rating', label: 'Challenge Rating', type: 'text', default: '', importAliases: ['cr'] },
    { key: 'description', label: 'Description', type: 'markdown', default: '' }
  ]
} as const

export const dnd5eSystem: EldraSystemSchema = {
  key: 'dnd5e',
  label: 'Dungeons & Dragons 5e',
  version: '0.2.0',
  description: 'Schema-first 5e registry designed for import adapters and flexible block-based storage.',
  importerSupport: ['manual', '5etools-json', 'foundry-pack'],
  entityTypes: [
    {
      entityType: 'character',
      label: 'Character',
      description: 'Player characters, NPCs, and named personas.',
      blocks: [
        'import_source',
        'character_identity',
        'character_abilities',
        'character_combat',
        'character_personality'
      ]
    },
    {
      entityType: 'spell',
      label: 'Spell',
      description: 'Spell compendium entries.',
      blocks: [
        'import_source',
        'spell_core'
      ]
    },
    {
      entityType: 'item',
      label: 'Item',
      description: 'Weapons, armor, gear, and magic items.',
      blocks: [
        'import_source',
        'item_core'
      ]
    },
    {
      entityType: 'feat',
      label: 'Feat',
      description: 'Feat compendium entries.',
      blocks: [
        'import_source',
        'feat_core'
      ]
    },
    {
      entityType: 'background',
      label: 'Background',
      description: 'Background definitions and features.',
      blocks: [
        'import_source',
        'background_core'
      ]
    },
    {
      entityType: 'species',
      label: 'Species',
      description: 'Species definitions and ancestry traits.',
      blocks: [
        'import_source',
        'species_core'
      ]
    },
    {
      entityType: 'class',
      label: 'Class',
      description: 'Base class definitions.',
      blocks: [
        'import_source',
        'class_core'
      ]
    },
    {
      entityType: 'subclass',
      label: 'Subclass',
      description: 'Subclass definitions.',
      blocks: [
        'import_source',
        'subclass_core'
      ]
    },
    {
      entityType: 'monster',
      label: 'Monster',
      description: 'Creature and NPC stat entries.',
      blocks: [
        'import_source',
        'monster_core'
      ]
    }
  ],
  sharedBlocks: [
    importSourceBlock,
    characterIdentityBlock,
    characterAbilitiesBlock,
    characterCombatBlock,
    characterPersonalityBlock,
    spellCoreBlock,
    itemCoreBlock,
    featCoreBlock,
    backgroundCoreBlock,
    speciesCoreBlock,
    classCoreBlock,
    subclassCoreBlock,
    monsterCoreBlock
  ]
}
