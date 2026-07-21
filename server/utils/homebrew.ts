import { createError } from 'h3'
import { directusServiceRequest } from './directus'

type HomebrewType =
  | 'spell'
  | 'item'
  | 'enemy'
  | 'species'
  | 'class'
  | 'feat'
  | 'background'

type TypeConfig = {
  key: HomebrewType
  label: string
  entityTypes: string[]
  coreBlocks: string[]
}

const TYPE_CONFIGS: Record<HomebrewType, TypeConfig> = {
  spell: {
    key: 'spell',
    label: 'Spell',
    entityTypes: ['spell'],
    coreBlocks: ['spell_core']
  },
  item: {
    key: 'item',
    label: 'Item',
    entityTypes: ['item'],
    coreBlocks: ['item_core']
  },
  enemy: {
    key: 'enemy',
    label: 'Enemy',
    entityTypes: ['enemy', 'monster'],
    coreBlocks: ['statblock', 'monster_profile', 'monster_core', 'enemy_core', 'actions', 'monster_actions']
  },
  species: {
    key: 'species',
    label: 'Species',
    entityTypes: ['species', 'race'],
    coreBlocks: ['species_core', 'race_core']
  },
  class: {
    key: 'class',
    label: 'Class',
    entityTypes: ['class'],
    coreBlocks: ['class_core']
  },
  feat: {
    key: 'feat',
    label: 'Feat',
    entityTypes: ['feat'],
    coreBlocks: ['feat_core']
  },
  background: {
    key: 'background',
    label: 'Background',
    entityTypes: ['background'],
    coreBlocks: ['background_core']
  }
}

const ENTITY_FALLBACK_FIELDS = new Set([
  'id',
  'title',
  'slug',
  'world_id',
  'system_key',
  'entity_type',
  'status',
  'visibility',
  'summary',
  'image',
  'created_at',
  'updated_at'
])

const BLOCK_FALLBACK_FIELDS = new Set([
  'id',
  'entity_id',
  'block_key',
  'label',
  'repeatable',
  'sort',
  'data'
])

const collectionFieldCache = new Map<string, Set<string>>()

function worldValue(worldId: string | number) {
  const parsed = Number(worldId)
  return Number.isFinite(parsed) ? parsed : String(worldId)
}

function cleanText(value: any) {
  return String(value ?? '').trim()
}

function titleCase(value: any) {
  return cleanText(value)
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function slugify(value: any) {
  const slug = cleanText(value)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)

  return slug || `homebrew-${Date.now()}`
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null))
}

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function blockKey(block: any) {
  return cleanText(block?.block_key ?? block?.blockKey ?? block?.key)
}

function blockData(block: any) {
  return asObject(block?.data)
}

function normalizeHomebrewType(value: any): HomebrewType {
  const key = cleanText(value).toLowerCase()

  if (key === 'monster') return 'enemy'
  if (key === 'race') return 'species'

  if (Object.prototype.hasOwnProperty.call(TYPE_CONFIGS, key)) {
    return key as HomebrewType
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid homebrew type'
  })
}

async function collectionFields(collection: string, fallback: Set<string>) {
  if (collectionFieldCache.has(collection)) {
    return collectionFieldCache.get(collection)!
  }

  try {
    const res = await directusServiceRequest(`/fields/${collection}`, {
      method: 'GET'
    })

    const fields = new Set(
      (Array.isArray(res?.data) ? res.data : [])
        .map((field: any) => cleanText(field?.field))
        .filter(Boolean)
    )

    if (fields.size) {
      collectionFieldCache.set(collection, fields)
      return fields
    }
  } catch {}

  collectionFieldCache.set(collection, fallback)
  return fallback
}

function pickSupported(fields: Set<string>, payload: Record<string, any>) {
  const picked: Record<string, any> = {}

  for (const [key, value] of Object.entries(payload)) {
    if (fields.has(key)) {
      picked[key] = value
    }
  }

  return picked
}

async function entitySlugExists(worldId: string | number, slug: string) {
  const res = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { world_id: { _eq: worldValue(worldId) } },
          { slug: { _eq: slug } }
        ]
      },
      limit: 1,
      fields: 'id'
    }
  })

  return Array.isArray(res?.data) && res.data.length > 0
}

async function uniqueEntitySlug(worldId: string | number, baseTitle: string) {
  const base = slugify(baseTitle)
  let candidate = base
  let index = 2

  while (await entitySlugExists(worldId, candidate)) {
    candidate = `${base}-${index}`
    index++
  }

  return candidate
}

async function loadBlocksForEntityIds(entityIds: any[], allowedBlockKeys?: string[]) {
  const ids = entityIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id))

  if (!ids.length) return []

  const filter: any = {
    entity_id: { _in: ids }
  }

  if (Array.isArray(allowedBlockKeys) && allowedBlockKeys.length) {
    filter.block_key = { _in: allowedBlockKeys }
  }

  const res = await directusServiceRequest('/items/block_instances', {
    method: 'GET',
    query: {
      filter,
      sort: 'entity_id,sort,id',
      limit: -1,
      fields: '*'
    }
  })

  return Array.isArray(res?.data) ? res.data : []
}

function blocksByEntityId(blocks: any[]) {
  const map = new Map<string, any[]>()

  for (const block of blocks) {
    const id = cleanText(block?.entity_id)
    if (!id) continue

    if (!map.has(id)) map.set(id, [])
    map.get(id)!.push(block)
  }

  return map
}

function findBlock(blocks: any[], keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()))

  return blocks.find((block) =>
    wanted.has(blockKey(block).toLowerCase())
  ) || null
}

function sourceFromBlocks(blocks: any[]) {
  const source = blockData(findBlock(blocks, ['import_source']))

  return {
    sourceBook: cleanText(source.source_book ?? source.sourceBook ?? source.source ?? ''),
    sourcePage: cleanText(source.source_page ?? source.sourcePage ?? ''),
    provider: cleanText(source.provider ?? '')
  }
}


function templateCoreForBuilder(config: TypeConfig, blocks: any[]) {
  const core = blockData(findBlock(blocks, config.coreBlocks))
  const source = blockData(findBlock(blocks, ['import_source']))
  const raw = asObject(source.raw_json ?? source.rawJson)

  if (config.key === 'spell') {
    return {
      name: cleanText(core.name),
      level: core.level ?? 0,
      school: cleanText(core.school),
      casting_time: cleanText(core.casting_time ?? core.castingTime),
      castingTime: cleanText(core.casting_time ?? core.castingTime),
      range: cleanText(core.range),
      duration: cleanText(core.duration),
      components: cleanText(core.components),
      ritual: Boolean(core.ritual),
      concentration: Boolean(core.concentration),
      description: cleanText(core.description),
      higher_level: cleanText(core.higher_level ?? core.higherLevel),
      higherLevel: cleanText(core.higher_level ?? core.higherLevel),
      damage: cleanText(core.damage),
      damage_type: cleanText(core.damage_type ?? core.damageType),
      damageType: cleanText(core.damage_type ?? core.damageType),
      save_ability: cleanText(core.save_ability ?? core.saveAbility),
      saveAbility: cleanText(core.save_ability ?? core.saveAbility),
      attack_type: cleanText(core.attack_type ?? core.attackType),
      attackType: cleanText(core.attack_type ?? core.attackType),
      classes: cleanText(core.classes)
    }
  }

  if (config.key === 'item') {
    const weapon = asObject(core.weapon)
    const armor = asObject(core.armor)
    const firstAction = Array.isArray(core.grantedActions) ? asObject(core.grantedActions[0]) : {}
    const modifiers = Array.isArray(core.modifiers) ? core.modifiers : []

    function modifierValue(type: string) {
      const found = modifiers.find((modifier: any) => String(modifier?.type || '') === type)
      return found?.value ?? ''
    }

    return {
      name: cleanText(core.name || raw.name),
      item_type: cleanText(core.item_type ?? core.itemType ?? raw.type),
      itemType: cleanText(core.item_type ?? core.itemType ?? raw.type),
      rarity: cleanText(core.rarity ?? raw.rarity),
      requiresAttunement: Boolean(core.requiresAttunement ?? core.requires_attunement ?? raw.reqAttune ?? raw.attunement),
      attunementText: cleanText(core.attunementText ?? core.attunement_text ?? (typeof raw.reqAttune === 'string' ? raw.reqAttune : '')),
      equippable: Boolean(core.equippable ?? raw.weapon ?? raw.armor ?? weapon.kind ?? armor.baseAc),
      equipSlot: cleanText(core.equipSlot ?? core.equip_slot),
      weight: core.weight ?? raw.weight ?? '',
      value: core.value ?? raw.value ?? '',
      description: cleanText(core.description),
      damage: cleanText(core.damage ?? weapon.damage ?? raw.dmg1 ?? raw.damage),
      damage_type: cleanText(core.damage_type ?? core.damageType ?? weapon.damageType ?? raw.dmgType ?? raw.damageType),
      damageType: cleanText(core.damage_type ?? core.damageType ?? weapon.damageType ?? raw.dmgType ?? raw.damageType),
      weaponKind: cleanText(core.weaponKind ?? core.weapon_kind ?? weapon.kind ?? (raw.weapon ? 'weapon' : '')),
      weaponCategory: cleanText(core.weaponCategory ?? core.weapon_category ?? weapon.category),
      weaponRange: cleanText(core.weaponRange ?? core.weapon_range ?? weapon.range ?? raw.range),
      weaponProperties: Array.isArray(weapon.properties)
        ? weapon.properties.map((property: any) => cleanText(property?.code || property?.label || property)).filter(Boolean).join(', ')
        : cleanText(core.weaponProperties ?? core.weapon_properties ?? raw.property),
      magicBonus: core.magicBonus ?? core.magic_bonus ?? weapon.magicBonus ?? raw.bonusWeapon ?? '',
      attackBonus: core.attackBonus ?? core.attack_bonus ?? weapon.attackBonus ?? raw.bonusWeaponAttack ?? modifierValue('weapon_attack_bonus'),
      damageBonus: core.damageBonus ?? core.damage_bonus ?? weapon.damageBonus ?? raw.bonusWeaponDamage ?? modifierValue('weapon_damage_bonus'),
      armorClass: core.armorClass ?? core.armor_class ?? armor.baseAc ?? armor.ac ?? raw.ac ?? '',
      armorType: cleanText(core.armorType ?? core.armor_type ?? armor.type),
      dexCap: core.dexCap ?? core.dex_cap ?? armor.dexCap ?? '',
      strength: core.strength ?? armor.strength ?? raw.strength ?? '',
      stealthDisadvantage: Boolean(core.stealthDisadvantage ?? core.stealth_disadvantage ?? armor.stealthDisadvantage ?? raw.stealth),
      acBonus: core.acBonus ?? core.ac_bonus ?? modifierValue('ac_bonus') ?? raw.bonusAc ?? '',
      saveBonus: core.saveBonus ?? core.save_bonus ?? modifierValue('saving_throw_bonus') ?? raw.bonusSavingThrow ?? '',
      spellAttackBonus: core.spellAttackBonus ?? core.spell_attack_bonus ?? modifierValue('spell_attack_bonus') ?? raw.bonusSpellAttack ?? '',
      spellSaveDcBonus: core.spellSaveDcBonus ?? core.spell_save_dc_bonus ?? modifierValue('spell_save_dc_bonus') ?? raw.bonusSpellSaveDc ?? '',
      grantedActionName: cleanText(firstAction.name),
      grantedActionTiming: cleanText(firstAction.timing ?? firstAction.actionKind),
      grantedActionDetail: cleanText(firstAction.detail),
      grantedActionUses: firstAction.uses ?? firstAction.maxUses ?? '',
      grantedActionRecharge: cleanText(firstAction.recharge)
    }
  }

  return {}
}

function compactPreviewText(value: any, limit = 320) {
  const text = cleanText(value)
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function numberOrDefault(value: any, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function booleanish(value: any) {
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'on'
}

function normalizeSpellSchool(value: any) {
  const raw = cleanText(value)
  const normalized = raw.toUpperCase()

  const schoolMap: Record<string, string> = {
    A: 'A',
    ABJURATION: 'A',
    C: 'C',
    CONJURATION: 'C',
    D: 'D',
    DIVINATION: 'D',
    E: 'E',
    ENCHANTMENT: 'E',
    V: 'V',
    EVOCATION: 'V',
    I: 'I',
    ILLUSION: 'I',
    N: 'N',
    NECROMANCY: 'N',
    T: 'T',
    TRANSMUTATION: 'T'
  }

  return schoolMap[normalized] || raw
}

function normalizeHomebrewSpellPatch(value: any, fallbackTitle = '') {
  const spell = asObject(value)

  return {
    name: cleanText(spell.name) || cleanText(fallbackTitle),
    level: numberOrDefault(spell.level, 0),
    school: normalizeSpellSchool(spell.school),
    casting_time: cleanText(spell.castingTime ?? spell.casting_time),
    range: cleanText(spell.range),
    duration: cleanText(spell.duration),
    components: cleanText(spell.components),
    ritual: booleanish(spell.ritual),
    concentration: booleanish(spell.concentration),
    description: cleanText(spell.description),
    higher_level: cleanText(spell.higherLevel ?? spell.higher_level),
    damage: cleanText(spell.damage),
    damage_type: cleanText(spell.damageType ?? spell.damage_type),
    save_ability: cleanText(spell.saveAbility ?? spell.save_ability),
    attack_type: cleanText(spell.attackType ?? spell.attack_type),
    classes: cleanText(spell.classes)
  }
}

function homebrewSpellSummary(value: any) {
  const spell = normalizeHomebrewSpellPatch(value)
  return compactPreviewText(spell.description, 420)
}

function applyHomebrewSpellPatch(core: any, value: any, fallbackTitle: string) {
  const data = deepClone(asObject(core))
  const spell = normalizeHomebrewSpellPatch(value, fallbackTitle)

  if (spell.name) data.name = spell.name
  data.level = spell.level
  data.school = spell.school
  data.casting_time = spell.casting_time
  data.castingTime = spell.casting_time
  data.range = spell.range
  data.duration = spell.duration
  data.components = spell.components
  data.ritual = spell.ritual
  data.concentration = spell.concentration
  data.description = spell.description
  data.higher_level = spell.higher_level
  data.higherLevel = spell.higher_level
  data.damage = spell.damage
  data.damage_type = spell.damage_type
  data.damageType = spell.damage_type
  data.save_ability = spell.save_ability
  data.saveAbility = spell.save_ability
  data.attack_type = spell.attack_type
  data.attackType = spell.attack_type
  data.classes = spell.classes

  data.homebrew = true
  data.source_kind = 'homebrew'
  data.sourceKind = 'homebrew'

  data.mechanics = {
    ...(asObject(data.mechanics)),
    attackType: spell.attack_type,
    saveAbility: spell.save_ability,
    damage: spell.damage,
    damageType: spell.damage_type,
    classes: spell.classes
  }

  return data
}

function splitListText(value: any) {
  return cleanText(value)
    .split(/[,\n]/)
    .map((item) => cleanText(item))
    .filter(Boolean)
}

function numberOrBlank(value: any) {
  const text = cleanText(value)
  if (!text) return ''

  const parsed = Number(text.replace(/^\+/, ''))
  return Number.isFinite(parsed) ? parsed : text
}

function normalizeHomebrewItemType(value: any) {
  const raw = cleanText(value).toUpperCase()

  const aliases: Record<string, string> = {
    WEAPON: 'M',
    MELEE: 'M',
    MELEE_WEAPON: 'M',
    RANGED: 'R',
    RANGED_WEAPON: 'R',
    ARMOR: 'LA',
    LIGHT_ARMOR: 'LA',
    MEDIUM_ARMOR: 'MA',
    HEAVY_ARMOR: 'HA',
    SHIELD: 'S',
    POTION: 'P',
    ROD: 'RD',
    WAND: 'WD',
    STAFF: 'ST',
    RING: 'RG',
    SCROLL: 'SC',
    GEAR: 'G',
    WONDROUS: 'G',
    TOOL: 'T',
    AMMUNITION: 'A'
  }

  return aliases[raw] || raw || 'G'
}

function normalizeHomebrewItemPatch(value: any, fallbackTitle = '') {
  const item = asObject(value)

  return {
    name: cleanText(item.name) || cleanText(fallbackTitle),
    item_type: normalizeHomebrewItemType(item.itemType ?? item.item_type),
    rarity: cleanText(item.rarity || 'common'),
    requires_attunement: booleanish(item.requiresAttunement ?? item.requires_attunement),
    attunement_text: cleanText(item.attunementText ?? item.attunement_text),
    equippable: booleanish(item.equippable),
    equip_slot: cleanText(item.equipSlot ?? item.equip_slot),
    weight: numberOrBlank(item.weight),
    value: numberOrBlank(item.value),
    description: cleanText(item.description),
    damage: cleanText(item.damage),
    damage_type: cleanText(item.damageType ?? item.damage_type),
    weapon_enabled: booleanish(item.weaponEnabled ?? item.weapon_enabled),
    weapon_kind: cleanText(item.weaponKind ?? item.weapon_kind),
    weapon_category: cleanText(item.weaponCategory ?? item.weapon_category),
    weapon_range: cleanText(item.weaponRange ?? item.weapon_range),
    weapon_properties: cleanText(item.weaponProperties ?? item.weapon_properties),
    magic_bonus: numberOrBlank(item.magicBonus ?? item.magic_bonus),
    attack_bonus: numberOrBlank(item.attackBonus ?? item.attack_bonus),
    damage_bonus: numberOrBlank(item.damageBonus ?? item.damage_bonus),
    armor_enabled: booleanish(item.armorEnabled ?? item.armor_enabled),
    armor_class: numberOrBlank(item.armorClass ?? item.armor_class),
    armor_type: cleanText(item.armorType ?? item.armor_type),
    dex_cap: numberOrBlank(item.dexCap ?? item.dex_cap),
    strength: numberOrBlank(item.strength),
    stealth_disadvantage: booleanish(item.stealthDisadvantage ?? item.stealth_disadvantage),
    ac_bonus: numberOrBlank(item.acBonus ?? item.ac_bonus),
    save_bonus: numberOrBlank(item.saveBonus ?? item.save_bonus),
    spell_attack_bonus: numberOrBlank(item.spellAttackBonus ?? item.spell_attack_bonus),
    spell_save_dc_bonus: numberOrBlank(item.spellSaveDcBonus ?? item.spell_save_dc_bonus),
    granted_action_name: cleanText(item.grantedActionName ?? item.granted_action_name),
    granted_action_timing: cleanText(item.grantedActionTiming ?? item.granted_action_timing),
    granted_action_detail: cleanText(item.grantedActionDetail ?? item.granted_action_detail),
    granted_action_uses: numberOrBlank(item.grantedActionUses ?? item.granted_action_uses),
    granted_action_recharge: cleanText(item.grantedActionRecharge ?? item.granted_action_recharge)
  }
}

function homebrewItemSummary(value: any) {
  const item = normalizeHomebrewItemPatch(value)
  return compactPreviewText(item.description, 420)
}

function normalizedNumber(value: any) {
  const parsed = Number(cleanText(value).replace(/^\+/, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizedOptionalNumber(value: any) {
  const text = cleanText(value)
  if (!text) return null

  const parsed = Number(text.replace(/^\+/, ''))
  return Number.isFinite(parsed) ? parsed : text
}

function homebrewItemModifiers(item: any) {
  const modifiers: any[] = []

  const pairs = [
    ['ac_bonus', item.ac_bonus],
    ['saving_throw_bonus', item.save_bonus],
    ['spell_attack_bonus', item.spell_attack_bonus],
    ['spell_save_dc_bonus', item.spell_save_dc_bonus],
    ['weapon_attack_bonus', item.attack_bonus || item.magic_bonus],
    ['weapon_damage_bonus', item.damage_bonus || item.magic_bonus]
  ]

  for (const [type, value] of pairs) {
    const parsed = normalizedNumber(value)

    if (parsed) {
      modifiers.push({
        type,
        value: parsed,
        source: 'homebrew'
      })
    }
  }

  return modifiers
}

function homebrewGrantedActions(item: any) {
  if (!item.granted_action_name && !item.granted_action_detail) return []

  const uses = normalizedOptionalNumber(item.granted_action_uses)

  return [
    {
      id: 'homebrew-item-action-main',
      name: item.granted_action_name || item.name || 'Item Action',
      timing: item.granted_action_timing || 'Action',
      actionKind: item.granted_action_timing || 'Action',
      detail: item.granted_action_detail || item.description || '',
      uses,
      maxUses: uses,
      recharge: item.granted_action_recharge || '',
      consumesResource: Boolean(uses)
    }
  ]
}

function applyHomebrewItemPatch(core: any, value: any, fallbackTitle: string) {
  const data = deepClone(asObject(core))
  const item = normalizeHomebrewItemPatch(value, fallbackTitle)

  data.name = item.name || fallbackTitle
  data.item_type = item.item_type
  data.itemType = item.item_type
  data.rarity = item.rarity
  data.requiresAttunement = item.requires_attunement
  data.requires_attunement = item.requires_attunement
  data.attunementText = item.attunement_text
  data.attunement_text = item.attunement_text
  data.equippable = item.equippable
  data.equipSlot = item.equip_slot
  data.equip_slot = item.equip_slot
  data.weight = item.weight
  data.value = item.value
  data.description = item.description
  data.damage = item.damage
  data.damage_type = item.damage_type
  data.damageType = item.damage_type

  if (item.weapon_enabled || item.damage || item.weapon_kind || item.weapon_category) {
    const properties = splitListText(item.weapon_properties).map((property) => ({
      code: property.toUpperCase(),
      label: property
    }))

    data.weapon = {
      ...(asObject(data.weapon)),
      kind: item.weapon_kind || (item.item_type === 'R' ? 'ranged' : 'melee'),
      category: item.weapon_category || '',
      damage: item.damage,
      damageType: item.damage_type,
      range: item.weapon_range,
      properties,
      propertyCodes: properties.map((property) => property.code),
      magicBonus: normalizedNumber(item.magic_bonus),
      attackBonus: normalizedNumber(item.attack_bonus || item.magic_bonus),
      damageBonus: normalizedNumber(item.damage_bonus || item.magic_bonus)
    }
  } else {
    data.weapon = null
  }

  if (item.armor_enabled || item.armor_class || ['LA', 'MA', 'HA', 'S'].includes(item.item_type)) {
    data.armor = {
      ...(asObject(data.armor)),
      type: item.armor_type || (item.item_type === 'S' ? 'shield' : 'armor'),
      baseAc: normalizedOptionalNumber(item.armor_class),
      ac: normalizedOptionalNumber(item.armor_class),
      dexCap: normalizedOptionalNumber(item.dex_cap),
      strength: normalizedOptionalNumber(item.strength),
      stealthDisadvantage: item.stealth_disadvantage
    }
  } else {
    data.armor = null
  }

  data.modifiers = homebrewItemModifiers(item)
  data.grantedActions = homebrewGrantedActions(item)
  data.homebrew = true
  data.source_kind = 'homebrew'
  data.sourceKind = 'homebrew'

  return data
}

function homebrewItemRawJson(value: any, fallbackTitle = '') {
  const item = normalizeHomebrewItemPatch(value, fallbackTitle)
  const raw: Record<string, any> = {
    name: item.name || fallbackTitle,
    source: 'ELDRA',
    type: item.item_type,
    rarity: item.rarity || 'common',
    weight: item.weight || undefined,
    value: item.value || undefined,
    reqAttune: item.requires_attunement ? item.attunement_text || true : undefined,
    entries: item.description ? [item.description] : [],
    homebrew: true
  }

  if (item.weapon_enabled || item.damage || item.weapon_kind || item.weapon_category) {
    raw.weapon = true
    raw.dmg1 = item.damage || undefined
    raw.dmgType = item.damage_type || undefined
    raw.range = item.weapon_range || undefined
    raw.property = splitListText(item.weapon_properties)
    raw.bonusWeapon = item.magic_bonus || undefined
    raw.bonusWeaponAttack = item.attack_bonus || item.magic_bonus || undefined
    raw.bonusWeaponDamage = item.damage_bonus || item.magic_bonus || undefined
  }

  if (item.armor_enabled || item.armor_class || ['LA', 'MA', 'HA', 'S'].includes(item.item_type)) {
    raw.armor = true
    raw.ac = item.armor_class || undefined
    raw.stealth = item.stealth_disadvantage || undefined
    raw.strength = item.strength || undefined
  }

  if (item.ac_bonus) raw.bonusAc = item.ac_bonus
  if (item.save_bonus) raw.bonusSavingThrow = item.save_bonus
  if (item.spell_attack_bonus) raw.bonusSpellAttack = item.spell_attack_bonus
  if (item.spell_save_dc_bonus) raw.bonusSpellSaveDc = item.spell_save_dc_bonus

  raw.homebrewBuilder = item

  return raw
}

function prepareHomebrewBlockData(key: string, data: any, type: HomebrewType, body: any, title: string) {
  const normalizedKey = cleanText(key)

  if (type === 'spell' && normalizedKey === 'spell_core') {
    return applyHomebrewSpellPatch(data, body?.spell || {}, title)
  }

  if (type === 'spell' && normalizedKey === 'overview') {
    const next = deepClone(asObject(data))
    const description = homebrewSpellSummary(body?.spell)

    if (description) {
      next.text = description
    }

    return next
  }

  if (type === 'item' && normalizedKey === 'item_core') {
    return applyHomebrewItemPatch(data, body?.item || {}, title)
  }

  if (type === 'item' && normalizedKey === 'overview') {
    const next = deepClone(asObject(data))
    const description = homebrewItemSummary(body?.item)

    if (description) {
      next.text = description
    }

    return next
  }

  return data
}


function templateMetaLine(config: TypeConfig, blocks: any[]) {
  const source = sourceFromBlocks(blocks)
  const sourcePart = source.sourceBook
    ? source.sourcePage
      ? `${source.sourceBook} p.${source.sourcePage}`
      : source.sourceBook
    : ''

  const core = blockData(findBlock(blocks, config.coreBlocks))
  const summaryParts = [
    sourcePart,
    core.level !== undefined ? `Level ${core.level}` : '',
    core.school ? titleCase(core.school) : '',
    core.rarity ? titleCase(core.rarity) : '',
    core.size ? `Size ${core.size}` : '',
    core.challenge_rating ? `CR ${core.challenge_rating}` : '',
    core.cr ? `CR ${core.cr}` : ''
  ].filter(Boolean)

  return summaryParts.join(' · ')
}

function templateSummary(row: any, config: TypeConfig, blocks: any[]) {
  const direct = cleanText(row?.summary)
  if (direct) return direct

  const core = blockData(findBlock(blocks, config.coreBlocks))
  const overview = blockData(findBlock(blocks, ['overview']))

  return cleanText(
    overview.text ||
    core.description ||
    core.summary ||
    core.entries ||
    ''
  )
}

function retitleCoreBlockData(block: any, title: string, templateEntityId: any) {
  const key = blockKey(block)
  const data = deepClone(blockData(block))

  if ('name' in data) data.name = title
  if ('title' in data) data.title = title

  data.homebrew = true
  data.source_kind = 'homebrew'
  data.sourceKind = 'homebrew'
  data.template_entity_id = templateEntityId
  data.templateEntityId = templateEntityId

  if ('source' in data) data.source = 'Eldra Homebrew'
  if ('source_book' in data) data.source_book = 'Eldra Homebrew'
  if ('sourceBook' in data) data.sourceBook = 'Eldra Homebrew'

  return {
    key,
    data
  }
}

function cloneableBlocksForType(config: TypeConfig, blocks: any[]) {
  const allowed = new Set([
    ...config.coreBlocks,
    'overview'
  ].map((key) => key.toLowerCase()))

  return blocks.filter((block) =>
    allowed.has(blockKey(block).toLowerCase())
  )
}

function homebrewImportSourceData(template: any, type: HomebrewType, body: any = {}, title = '') {
  const fallbackRawJson = {
    homebrew: true,
    spell: type === 'spell'
      ? normalizeHomebrewSpellPatch(body?.spell || {}, title || template.title)
      : null,
    item: type === 'item'
      ? normalizeHomebrewItemPatch(body?.item || {}, title || template.title)
      : null,
    templateEntityId: template.id,
    templateTitle: template.title,
    templateType: template.entity_type
  }

  const rawJson = type === 'item'
    ? homebrewItemRawJson(body?.item || {}, title || template.title)
    : fallbackRawJson

  return {
    provider: 'eldra-homebrew',
    source_kind: 'homebrew',
    sourceKind: 'homebrew',
    source_book: 'Eldra Homebrew',
    sourceBook: 'Eldra Homebrew',
    source_page: '',
    source_url: '',
    external_id: `homebrew__${type}__template_${template.id}__${Date.now()}`,
    imported_at: new Date().toISOString(),
    import_version: 'homebrew-forge-v1',
    template_entity_id: template.id,
    templateEntityId: template.id,
    template_title: template.title,
    templateTitle: template.title,
    template_type: template.entity_type,
    templateType: template.entity_type,
    raw_json: rawJson
  }
}


function homebrewMetaData(template: any, type: HomebrewType, title: string) {
  return {
    source_kind: 'homebrew',
    sourceKind: 'homebrew',
    status: 'draft',
    type,
    title,
    template_entity_id: template.id,
    templateEntityId: template.id,
    template_title: template.title,
    templateTitle: template.title,
    template_type: template.entity_type,
    templateType: template.entity_type,
    created_at: new Date().toISOString(),
    builder_version: 'homebrew-forge-v1'
  }
}

async function createBlock(entityId: any, block: {
  key: string
  label?: string
  repeatable?: boolean
  sort?: number
  data: any
}) {
  const fields = await collectionFields('block_instances', BLOCK_FALLBACK_FIELDS)

  const payload = pickSupported(fields, {
    entity_id: Number(entityId),
    block_key: block.key,
    label: block.label || titleCase(block.key),
    repeatable: block.repeatable ?? false,
    sort: block.sort ?? 100,
    data: block.data
  })

  return await directusServiceRequest('/items/block_instances', {
    method: 'POST',
    body: payload
  })
}

export function homebrewTypeOptions() {
  return Object.values(TYPE_CONFIGS).map((config) => ({
    key: config.key,
    label: config.label,
    entityTypes: config.entityTypes,
    coreBlocks: config.coreBlocks
  }))
}

export async function listHomebrewTemplates(worldId: string | number, rawType: any) {
  const type = normalizeHomebrewType(rawType || 'spell')
  const config = TYPE_CONFIGS[type]

  const res = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { world_id: { _eq: worldValue(worldId) } },
          { entity_type: { _in: config.entityTypes } }
        ]
      },
      sort: 'title',
      limit: -1,
      fields: [
        'id',
        'title',
        'slug',
        'world_id',
        'system_key',
        'entity_type',
        'status',
        'visibility',
        'summary',
        'image',
        'created_at',
        'updated_at'
      ].join(',')
    }
  })

  const rows = Array.isArray(res?.data) ? res.data : []
  const blockKeys = Array.from(new Set([
    'import_source',
    'overview',
    ...config.coreBlocks
  ]))

  const blocks = await loadBlocksForEntityIds(rows.map((row: any) => row.id), blockKeys)
  const blockMap = blocksByEntityId(blocks)

  const templates = rows.map((row: any) => {
    const rowBlocks = blockMap.get(cleanText(row.id)) || []
    const source = sourceFromBlocks(rowBlocks)

    return {
      id: cleanText(row.id),
      title: cleanText(row.title) || 'Untitled Template',
      slug: cleanText(row.slug),
      entityType: cleanText(row.entity_type),
      systemKey: cleanText(row.system_key),
      summary: templateSummary(row, config, rowBlocks),
      sourceBook: source.sourceBook,
      sourcePage: source.sourcePage,
      provider: source.provider,
      metaLine: templateMetaLine(config, rowBlocks),
      blockCount: rowBlocks.length,
      coreBlockKeys: rowBlocks.map(blockKey).filter(Boolean),
      core: templateCoreForBuilder(config, rowBlocks)
    }
  })

  return {
    ok: true,
    type,
    label: config.label,
    templates
  }
}

export async function createHomebrewDraft(worldId: string | number, body: any = {}) {
  const type = normalizeHomebrewType(body?.type || 'spell')
  const config = TYPE_CONFIGS[type]
  const templateEntityId = Number(body?.templateEntityId ?? body?.template_entity_id ?? 0)

  if (!templateEntityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Template entity is required'
    })
  }

  const templateRes = await directusServiceRequest('/items/entities', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { id: { _eq: templateEntityId } },
          { world_id: { _eq: worldValue(worldId) } },
          { entity_type: { _in: config.entityTypes } }
        ]
      },
      limit: 1,
      fields: '*'
    }
  })

  const template = Array.isArray(templateRes?.data) ? templateRes.data[0] : null

  if (!template?.id) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Template entity was not found for this world/type'
    })
  }

  const title = cleanText(body?.title) ||
    (type === 'spell' ? cleanText(body?.spell?.name) : '') ||
    (type === 'item' ? cleanText(body?.item?.name) : '') ||
    `Homebrew: ${template.title || config.label}`
  const slug = await uniqueEntitySlug(worldId, title)
  const summary = cleanText(body?.summary) ||
    (type === 'spell' ? homebrewSpellSummary(body?.spell) : '') ||
    (type === 'item' ? homebrewItemSummary(body?.item) : '') ||
    `Homebrew ${config.label.toLowerCase()} draft based on ${template.title || 'a template'}.`

  const entityFields = await collectionFields('entities', ENTITY_FALLBACK_FIELDS)

  const entityPayload = pickSupported(entityFields, {
    world_id: worldValue(worldId),
    title,
    slug,
    system_key: cleanText(template.system_key) || 'dnd5e',
    entity_type: type === 'species' ? 'species' : type,
    status: 'draft',
    visibility: 'world',
    summary,
    image: template.image || null
  })

  const createdRes = await directusServiceRequest('/items/entities', {
    method: 'POST',
    body: entityPayload
  })

  const created = createdRes?.data || null

  if (!created?.id) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Homebrew entity was not created'
    })
  }

  const templateBlocks = await loadBlocksForEntityIds([template.id])
  const cloneBlocks = cloneableBlocksForType(config, templateBlocks)

  const blocksToCreate: Array<{
    key: string
    label?: string
    repeatable?: boolean
    sort?: number
    data: any
  }> = [
    {
      key: 'homebrew_meta',
      label: 'Homebrew Metadata',
      sort: 5,
      data: homebrewMetaData(template, type, title)
    },
    {
      key: 'import_source',
      label: 'Import Source',
      sort: 10,
      data: homebrewImportSourceData(template, type, body, title)
    }
  ]

  let sort = 20
  for (const block of cloneBlocks) {
    const cloned = retitleCoreBlockData(block, title, template.id)

    blocksToCreate.push({
      key: cloned.key,
      label: cleanText(block.label) || titleCase(cloned.key),
      repeatable: Boolean(block.repeatable),
      sort: Number(block.sort) || sort,
      data: prepareHomebrewBlockData(cloned.key, cloned.data, type, body, title)
    })

    sort += 10
  }

  if (!blocksToCreate.some((block) => block.key === 'overview')) {
    blocksToCreate.push({
      key: 'overview',
      label: 'Overview',
      sort: 30,
      data: {
        text: summary
      }
    })
  }

  const createdBlocks = []

  for (const block of blocksToCreate) {
    const createdBlock = await createBlock(created.id, block)
    if (createdBlock?.data) createdBlocks.push(createdBlock.data)
  }

  return {
    ok: true,
    type,
    template: {
      id: cleanText(template.id),
      title: cleanText(template.title),
      entityType: cleanText(template.entity_type)
    },
    entity: {
      ...created,
      imageUrl: created.image ? `/api/assets/${created.image}` : '',
      image_url: created.image ? `/api/assets/${created.image}` : '',
      blocks: createdBlocks
    },
    blocksCreated: createdBlocks.length
  }
}
