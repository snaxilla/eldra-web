// Category-summary meta-lines (e.g. "Damage: 1d6 Piercing", "Level 3",
// "Hit Die d10") shown on a category card/context rail and now, by the
// direct-edit consolidation pass, reused verbatim in the Studio editor's
// preview -- the SAME presentation Items/Spells/etc. cards already show,
// per content-workspaces-and-studio.md's own "include existing item
// mechanics in the shared editor preview through established helpers"
// requirement, so Studio can never show a different damage/weight/rarity
// line than the category page already does.
//
// Extracted from server/api/worlds/[id]/entities.get.ts (where this was
// previously local, unexported business logic -- a route file, not a
// util, contrary to this codebase's own documented convention of keeping
// server/api/** thin). No behavior changed by the move; every helper and
// every mapping table below is copied verbatim.

function sourceFromSlug(slug: string) {
  const parts = String(slug || '').split('-')
  const last = parts.at(-1) ?? ''
  return last ? last.toUpperCase() : ''
}

function collectionBlockKey(block: any) {
  return String(block?.block_key || block?.blockKey || '').trim()
}

function collectionBlockData(blocks: any[] = [], key: string) {
  return blocks.find((block: any) => collectionBlockKey(block) === key)?.data || null
}

function collectionClean(value: any) {
  return String(value ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat)\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/g, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\|/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectionTitleCase(value: any) {
  return collectionClean(value)
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function collectionTypeCodeLabel(value: any) {
  const code = String(value || '').split('|')[0].trim().toUpperCase()

  const labels: Record<string, string> = {
    M: 'Melee Weapon',
    R: 'Ranged Weapon',
    A: 'Ammunition',
    LA: 'Light Armor',
    MA: 'Medium Armor',
    HA: 'Heavy Armor',
    S: 'Shield',
    RD: 'Rod',
    WD: 'Wand',
    SC: 'Scroll',
    RG: 'Ring',
    G: 'Gear',
    T: 'Tool',
    P: 'Potion',
    INS: 'Instrument',
    SCF: 'Spellcasting Focus'
  }

  return labels[code] || collectionTitleCase(code || value || 'Item')
}

function collectionSpellLevelLabel(value: any) {
  if (value === null || value === undefined || value === '') return ''

  const parsed = Number(value)

  if (Number.isFinite(parsed)) {
    return parsed <= 0 ? 'Cantrip' : `Level ${Math.floor(parsed)}`
  }

  return collectionTitleCase(value)
}

function collectionValueLine(label: string, value: any) {
  const clean = collectionClean(value)
  return clean ? `${label}: ${clean}` : ''
}

function collectionSummaryCoreForType(row: any, blocks: any[]) {
  const type = String(row?.entity_type || '').trim().toLowerCase()

  if (type === 'spell') return collectionBlockData(blocks, 'spell_core')
  if (type === 'item') return collectionBlockData(blocks, 'item_core')
  if (type === 'location') return collectionBlockData(blocks, 'location_core')
  if (type === 'species' || type === 'race') return collectionBlockData(blocks, 'species_core') || collectionBlockData(blocks, 'race_core')
  if (type === 'class') return collectionBlockData(blocks, 'class_core')
  if (type === 'background') return collectionBlockData(blocks, 'background_core')
  if (type === 'feat') return collectionBlockData(blocks, 'feat_core')
  if (type.includes('character') || type.includes('npc') || type === 'pc') return collectionBlockData(blocks, 'character_core')

  return null
}

export function collectionSummaryDisplayType(row: any, blocks: any[]) {
  const type = String(row?.entity_type || '').trim().toLowerCase()
  const core = collectionSummaryCoreForType(row, blocks) || {}

  if (type === 'item') {
    return collectionTypeCodeLabel(core.item_type || core.itemType || core.type || type)
  }

  if (type === 'spell') return 'Spell'

  if (type === 'location') {
    return collectionTitleCase(core.location_type || core.locationType || core.type || 'Location')
  }

  if (type === 'species' || type === 'race') return 'Species'
  if (type === 'class') return 'Class'
  if (type === 'background') return 'Background'
  if (type === 'feat') return 'Feat'

  return collectionTitleCase(type || 'Entity')
}

export function collectionSummaryFacet(row: any, blocks: any[]) {
  const type = String(row?.entity_type || '').trim().toLowerCase()
  const core = collectionSummaryCoreForType(row, blocks) || {}

  if (type === 'spell') {
    return collectionSpellLevelLabel(core.level ?? core.spell_level ?? core.spellLevel) || 'Unknown Level'
  }

  if (type === 'item') {
    return collectionTypeCodeLabel(core.item_type || core.itemType || core.type || 'Item')
  }

  if (type === 'location') {
    return collectionTitleCase(core.location_type || core.locationType || core.type || 'Location')
  }

  if (type === 'species' || type === 'race') {
    const size = collectionClean(core.size || core.size_json || core.race_size || '')
    return size ? `Size ${size}` : 'Species'
  }

  if (type === 'class') {
    const hitDie = collectionClean(core.hit_die || core.hitDie || core.hd || '')
    return hitDie ? `Hit Die ${hitDie}` : 'Class'
  }

  if (type === 'feat') {
    return collectionTitleCase(core.category || core.feat_type || core.featType || 'Feat')
  }

  if (type === 'background') {
    return core.feature || core.feature_name || core.featureName ? 'Has Feature' : 'Background'
  }

  return collectionTitleCase(type || 'Entity')
}

export function collectionSummaryMetaLines(row: any, blocks: any[]) {
  const type = String(row?.entity_type || '').trim().toLowerCase()
  const core = collectionSummaryCoreForType(row, blocks) || {}
  const source = sourceFromSlug(row?.slug)

  if (type === 'spell') {
    return [
      collectionValueLine('Level', collectionSpellLevelLabel(core.level ?? core.spell_level ?? core.spellLevel)),
      collectionValueLine('School', core.school),
      collectionValueLine('Casting', core.casting_time || core.castingTime || core.time),
      collectionValueLine('Range', core.range),
      collectionValueLine('Duration', core.duration),
      collectionValueLine('Components', core.components),
      core.ritual ? 'Ritual' : '',
      core.concentration ? 'Concentration' : '',
      source ? `Source: ${source}` : ''
    ].filter(Boolean)
  }

  if (type === 'item') {
    const damage = collectionClean(core.damage)
    const damageType = collectionClean(core.damage_type || core.damageType)

    return [
      collectionValueLine('Type', collectionTypeCodeLabel(core.item_type || core.itemType || core.type)),
      collectionValueLine('Rarity', core.rarity),
      damage ? `Damage: ${damage}${damageType ? ` ${collectionTitleCase(damageType)}` : ''}` : '',
      collectionValueLine('Weight', core.weight),
      collectionValueLine('Value', core.value),
      source ? `Source: ${source}` : ''
    ].filter(Boolean)
  }

  if (type === 'location') {
    return [
      collectionValueLine('Type', core.location_type || core.locationType || core.type),
      collectionValueLine('Population', core.population),
      core.linkedMapId || core.linked_map_id ? 'Linked Map' : '',
      core.parentLocationId || core.parent_location_id ? 'Has Parent Location' : ''
    ].filter(Boolean)
  }

  if (type === 'species' || type === 'race') {
    return [
      collectionValueLine('Size', core.size || core.size_json || core.race_size),
      collectionValueLine('Speed', core.speed),
      collectionValueLine('Traits', core.rawTraitCount || core.trait_count),
      source ? `Source: ${source}` : ''
    ].filter(Boolean)
  }

  if (type === 'class') {
    return [
      collectionValueLine('Hit Die', core.hit_die || core.hitDie || core.hd),
      collectionValueLine('Saves', core.savingThrows || core.saving_throws || core.saves),
      collectionValueLine('Primary', core.primaryAbility || core.primary_ability),
      source ? `Source: ${source}` : ''
    ].filter(Boolean)
  }

  if (type === 'feat') {
    return [
      collectionValueLine('Category', core.category || core.feat_type || core.featType),
      collectionValueLine('Prerequisite', core.prerequisite || core.prerequisites),
      source ? `Source: ${source}` : ''
    ].filter(Boolean)
  }

  if (type === 'background') {
    return [
      collectionValueLine('Feature', core.featureName || core.feature_name || core.feature),
      collectionValueLine('Skills', core.skillProficiencies || core.skill_proficiencies),
      collectionValueLine('Tools', core.toolProficiencies || core.tool_proficiencies),
      source ? `Source: ${source}` : ''
    ].filter(Boolean)
  }

  return [
    collectionSummaryDisplayType(row, blocks),
    source ? `Source: ${source}` : ''
  ].filter(Boolean)
}
