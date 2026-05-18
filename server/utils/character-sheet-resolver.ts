import { dxFetch } from './entity-factory'

function clean5eText(value: any): string {
  return String(value || '')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat|classFeature|subclassFeature)\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/g, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseJsonish(value: any): any {
  if (typeof value !== 'string') return value

  const trimmed = value.trim()
  if (!trimmed) return value

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }

  return value
}

function formatSimpleValue(value: any): string {
  value = parseJsonish(value)

  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'string') return clean5eText(value)
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  if (Array.isArray(value)) {
    return value
      .map(formatSimpleValue)
      .filter(Boolean)
      .join(', ')
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, entryValue]) => {
        if (entryValue === true) return clean5eText(key)
        if (entryValue === false || entryValue === null || entryValue === undefined) return ''
        if (typeof entryValue === 'number') return `${clean5eText(key)} x${entryValue}`
        return `${clean5eText(key)}: ${formatSimpleValue(entryValue)}`
      })
      .filter(Boolean)
      .join(', ')
  }

  return String(value)
}

function blockByKey(blocks: any[], key: string) {
  return blocks.find((block: any) => String(block?.block_key || block?.blockKey || '') === key) || null
}

function formatHitDie(value: any) {
  if (!value) return ''

  if (typeof value === 'string') return value

  if (typeof value === 'object') {
    const number = Number(value.number || 1)
    const faces = Number(value.faces || 0)
    if (faces) return number === 1 ? `d${faces}` : `${number}d${faces}`
  }

  return formatSimpleValue(value)
}


function resolveSkillChoices(value: any) {
  if (!Array.isArray(value)) return []

  const choices: any[] = []

  for (const entry of value) {
    const choose = entry?.choose
    if (choose) {
      choices.push({
        count: Number(choose.count || 1),
        options: Array.isArray(choose.from)
          ? choose.from.map((item: any) => String(item || '').trim()).filter(Boolean)
          : []
      })
      continue
    }

    if (entry?.any) {
      choices.push({
        count: Number(entry.any || 1),
        options: []
      })
    }
  }

  return choices
}

function resolveFeatChoices(value: any) {
  if (!Array.isArray(value)) return []

  const choices: any[] = []

  for (const entry of value) {
    const anyFromCategory = entry?.anyFromCategory
    if (anyFromCategory) {
      choices.push({
        count: Number(anyFromCategory.count || 1),
        category: Array.isArray(anyFromCategory.category)
          ? anyFromCategory.category.join(', ')
          : anyFromCategory.category || null,
        options: []
      })
    }
  }

  return choices
}

function featureCount(value: any) {
  return Array.isArray(value) ? value.length : 0
}

async function loadLinkedEntity(entityId: any) {
  if (!entityId) return null

  const entityRes = await dxFetch(`/items/entities/${entityId}?fields=id,title,slug,entity_type,summary`)
  const entity = entityRes?.data || null
  if (!entity) return null

  const blocksRes = await dxFetch(`/items/block_instances?filter[entity_id][_eq]=${entityId}&sort=sort&fields=*&limit=-1`)
  const blocks = Array.isArray(blocksRes?.data) ? blocksRes.data : []

  return {
    entity,
    blocks
  }
}

function resolveClass(entity: any, blocks: any[]) {
  const core = blockByKey(blocks, 'class_core')?.data || {}
  const raw = blockByKey(blocks, 'import_source')?.data?.raw_json || {}

  return {
    id: Number(entity.id),
    title: String(entity.title || core.name || raw.name || 'Class'),
    slug: entity.slug ? String(entity.slug) : null,
    hitDie: core.hit_die || formatHitDie(raw.hd),
    primaryAbility: core.primary_ability || formatSimpleValue(raw.primaryAbility),
    savingThrows: core.saving_throws || formatSimpleValue(raw.proficiency),
    armorProficiencies: core.armor_proficiencies || formatSimpleValue(raw.startingProficiencies?.armor),
    weaponProficiencies: core.weapon_proficiencies || formatSimpleValue(raw.startingProficiencies?.weapons),
    toolProficiencies: core.tool_proficiencies || formatSimpleValue(raw.startingProficiencies?.tools),
    skillChoices: resolveSkillChoices(raw.startingProficiencies?.skills),
    featureCount: featureCount(raw.classFeatures),
    source: raw.source || null,
    page: raw.page || null
  }
}

function resolveSpecies(entity: any, blocks: any[]) {
  const core = blockByKey(blocks, 'species_core')?.data || {}
  const raw = blockByKey(blocks, 'import_source')?.data?.raw_json || {}

  return {
    id: Number(entity.id),
    title: String(entity.title || core.name || raw.name || 'Species'),
    slug: entity.slug ? String(entity.slug) : null,
    size: core.size || formatSimpleValue(raw.size),
    speed: core.speed || formatSimpleValue(raw.speed),
    traits: clean5eText(core.traits || ''),
    skillChoices: resolveSkillChoices(raw.skillProficiencies),
    featChoices: resolveFeatChoices(raw.feats),
    rawTraitCount: Array.isArray(raw.entries) ? raw.entries.length : 0,
    source: raw.source || null,
    page: raw.page || null
  }
}

function resolveBackground(entity: any, blocks: any[]) {
  const core = blockByKey(blocks, 'background_core')?.data || {}
  const raw = blockByKey(blocks, 'import_source')?.data?.raw_json || {}

  return {
    id: Number(entity.id),
    title: String(entity.title || core.name || raw.name || 'Background'),
    slug: entity.slug ? String(entity.slug) : null,
    skillProficiencies: formatSimpleValue(core.skill_proficiencies || raw.skillProficiencies),
    toolProficiencies: formatSimpleValue(core.tool_proficiencies || raw.toolProficiencies),
    languages: formatSimpleValue(core.languages || raw.languageProficiencies),
    equipment: clean5eText(core.equipment || ''),
    featureName: clean5eText(core.feature_name || ''),
    featureDescription: clean5eText(core.feature_description || ''),
    source: raw.source || null,
    page: raw.page || null
  }
}


function selectedFeatIdsFromChoices(sheet: any) {
  const ids = new Set<string>()
  const choices = sheet?.choices && typeof sheet.choices === 'object' && !Array.isArray(sheet.choices)
    ? sheet.choices
    : {}

  for (const choice of Object.values(choices) as any[]) {
    if (choice?.type !== 'feat') continue

    for (const selected of Array.isArray(choice?.selected) ? choice.selected : []) {
      const id = String(selected || '').trim()
      if (id) ids.add(id)
    }
  }

  return Array.from(ids)
}

function resolveFeat(entity: any, blocks: any[]) {
  const core = blockByKey(blocks, 'feat_core')?.data || {}
  const raw = blockByKey(blocks, 'import_source')?.data?.raw_json || {}

  const benefits = String(core.benefits || '').trim() || formatSimpleValue(raw.entries)
  const prerequisites = String(core.prerequisites || '').trim() || formatSimpleValue(raw.prerequisite)
  const abilityScoreIncrease = String(core.ability_score_increase || core.abilityScoreIncrease || '').trim() || formatSimpleValue(raw.ability)
  const additionalSpells = String(core.additional_spells || core.additionalSpells || '').trim() || formatSimpleValue(raw.additionalSpells)

  return {
    id: Number(entity.id),
    title: String(entity.title || core.name || raw.name || 'Feat'),
    slug: entity.slug ? String(entity.slug) : null,
    category: core.category || raw.category || null,
    prerequisites,
    benefits,
    repeatable: core.repeatable === true || core.repeatable === 'true' || raw.repeatable === true,
    abilityScoreIncrease,
    additionalSpells,
    source: core.source || raw.source || null,
    page: core.page || raw.page || null
  }
}

export async function resolveCharacterSheetSources(sheet: any) {
  if (!sheet) {
    return {
      class: null,
      species: null,
      background: null,
      feats: []
    }
  }

  const selectedFeatIds = selectedFeatIdsFromChoices(sheet)

  const [
    classLinked,
    speciesLinked,
    backgroundLinked,
    featLinkedList
  ] = await Promise.all([
    loadLinkedEntity(sheet.class_entity_id),
    loadLinkedEntity(sheet.species_entity_id),
    loadLinkedEntity(sheet.background_entity_id),
    Promise.all(selectedFeatIds.map((id) => loadLinkedEntity(id)))
  ])

  const feats = (Array.isArray(featLinkedList) ? featLinkedList : [])
    .filter(Boolean)
    .map((linked: any) => resolveFeat(linked.entity, linked.blocks))

  return {
    class: classLinked ? resolveClass(classLinked.entity, classLinked.blocks) : null,
    species: speciesLinked ? resolveSpecies(speciesLinked.entity, speciesLinked.blocks) : null,
    background: backgroundLinked ? resolveBackground(backgroundLinked.entity, backgroundLinked.blocks) : null,
    feats
  }
}
