import type { EldraWorld, EldraEntity, EldraEntityBlockInstance } from './types'
import { buildDefaultEntityData } from '../systems'

const now = new Date().toISOString()

export const devWorlds: EldraWorld[] = [
  {
    id: 'world_samdra',
    name: 'Samdra',
    slug: 'samdra',
    systemKey: 'dnd5e',
    description: 'Primary 5e campaign world for Eldra development.',
    visibility: 'private',
    ownerId: 'dev-user'
  },
  {
    id: 'world_georgia',
    name: 'Georgia',
    slug: 'georgia',
    systemKey: 'pf2e',
    description: 'Future Pathfinder world placeholder.',
    visibility: 'private',
    ownerId: 'dev-user'
  }
]

export const devEntities: EldraEntity[] = [
  {
    id: 'entity_spell_magic_missile',
    worldId: 'world_samdra',
    systemKey: 'dnd5e',
    entityType: 'spell',
    title: 'Magic Missile',
    slug: 'magic-missile',
    status: 'draft',
    visibility: 'world',
    summary: 'Three glowing darts of magical force.',
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'entity_item_longsword',
    worldId: 'world_samdra',
    systemKey: 'dnd5e',
    entityType: 'item',
    title: 'Longsword',
    slug: 'longsword',
    status: 'draft',
    visibility: 'world',
    summary: 'A versatile martial melee weapon.',
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'entity_article_eldra',
    worldId: 'world_samdra',
    systemKey: 'dnd5e',
    entityType: 'article',
    title: 'Eldra',
    slug: 'eldra',
    status: 'published',
    visibility: 'world',
    summary: 'A magical fantasy world, roughly 2x Earth.',
    createdAt: now,
    updatedAt: now
  }
]

const defaultSpellBlocks = buildDefaultEntityData('dnd5e', 'spell')
const defaultItemBlocks = buildDefaultEntityData('dnd5e', 'item')

export const devBlocks: EldraEntityBlockInstance[] = [
  ...defaultSpellBlocks.map((block, index) => ({
    id: `block_spell_magic_missile_${index + 1}`,
    entityId: 'entity_spell_magic_missile',
    blockKey: block.blockKey,
    label: block.label,
    sort: block.sort,
    repeatable: block.repeatable,
    data: {
      ...block.data,
      ...(block.blockKey === 'import_source'
        ? {
            provider: 'manual',
            external_id: 'magic-missile',
            source_book: 'PHB',
            source_page: '257'
          }
        : {}),
      ...(block.blockKey === 'spell_core'
        ? {
            name: 'Magic Missile',
            level: 1,
            school: 'E',
            casting_time: '1 action',
            range: '120 feet',
            duration: 'Instantaneous',
            components: 'V, S',
            ritual: false,
            concentration: false,
            description: 'You create three glowing darts of magical force.',
            higher_level: 'Creates one more dart per slot level above 1st.'
          }
        : {})
    }
  })),
  ...defaultItemBlocks.map((block, index) => ({
    id: `block_item_longsword_${index + 1}`,
    entityId: 'entity_item_longsword',
    blockKey: block.blockKey,
    label: block.label,
    sort: block.sort,
    repeatable: block.repeatable,
    data: {
      ...block.data,
      ...(block.blockKey === 'import_source'
        ? {
            provider: 'manual',
            external_id: 'longsword',
            source_book: 'PHB',
            source_page: '149'
          }
        : {}),
      ...(block.blockKey === 'item_core'
        ? {
            name: 'Longsword',
            item_type: 'M',
            rarity: '',
            weight: 3,
            value: '15 gp',
            attunement: false,
            damage: '1d8',
            damage_type: 'slashing',
            armor_class: 0,
            description: 'A versatile martial melee weapon.'
          }
        : {})
    }
  }))
]
