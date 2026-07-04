function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function asArray(value: any) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
}

function cleanText(value: any): string {
  return String(value ?? '')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat|classFeature|subclassFeature|optionalfeature|status|itemProperty)\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/gi, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function entriesToText(value: any): string {
  if (value === null || value === undefined || value === '') return ''

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return cleanText(value)
  }

  if (Array.isArray(value)) {
    return value.map(entriesToText).filter(Boolean).join('\n\n')
  }

  if (typeof value === 'object') {
    const parts: string[] = []

    if (value.name) parts.push(cleanText(value.name))
    if (value.entry) parts.push(entriesToText(value.entry))
    if (value.entries) parts.push(entriesToText(value.entries))
    if (value.items) parts.push(entriesToText(value.items))
    if (value.rows) parts.push(entriesToText(value.rows))

    return parts.filter(Boolean).join('\n\n')
  }

  return cleanText(value)
}

function numberOrNull(value: any) {
  if (value === null || value === undefined || value === '') return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function booleanValue(value: any) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function firstCode(value: any) {
  const text = cleanText(value)
  if (!text) return ''

  return text
    .split('|')[0]
    .trim()
    .toUpperCase()
}

function sourceCode(value: any) {
  const text = cleanText(value)
  const parts = text.split('|')
  return parts[1]?.trim()?.toUpperCase() || ''
}

function propertyCode(value: any) {
  return firstCode(value)
}

function unique(values: any[]) {
  return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean)))
}

function parseBonus(value: any) {
  if (value === true) return 1
  if (value === false || value === null || value === undefined || value === '') return 0

  const parsed = Number(String(value).replace(/^\+/, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function valueCp(raw: any, core: any) {
  const rawValue = raw?.value ?? core?.value
  const parsed = numberOrNull(rawValue)

  return parsed
}

function displayValue(raw: any, core: any) {
  const rawValue = raw?.value ?? core?.value

  if (rawValue === null || rawValue === undefined || rawValue === '') return ''

  if (typeof rawValue === 'number') {
    if (rawValue >= 100) return `${rawValue / 100} gp`
    if (rawValue >= 10) return `${rawValue / 10} sp`
    return `${rawValue} cp`
  }

  if (typeof rawValue === 'object') {
    const amount = rawValue.amount ?? rawValue.value ?? ''
    const coin = rawValue.coin ?? rawValue.unit ?? rawValue.currency ?? ''
    return cleanText(`${amount} ${coin}`)
  }

  return cleanText(rawValue)
}

const TYPE_LABELS: Record<string, string> = {
  A: 'Ammunition',
  AT: "Artisan's Tool",
  EXP: 'Explosive',
  G: 'Adventuring Gear',
  GS: 'Gaming Set',
  HA: 'Heavy Armor',
  INS: 'Instrument',
  LA: 'Light Armor',
  M: 'Melee Weapon',
  MA: 'Medium Armor',
  P: 'Potion',
  R: 'Ranged Weapon',
  RD: 'Rod',
  RG: 'Ring',
  S: 'Shield',
  SC: 'Scroll',
  SCF: 'Spellcasting Focus',
  ST: 'Staff',
  T: 'Tool',
  TG: 'Trade Good',
  WD: 'Wand'
}

const DAMAGE_TYPE_LABELS: Record<string, string> = {
  A: 'acid',
  B: 'bludgeoning',
  C: 'cold',
  F: 'fire',
  O: 'force',
  L: 'lightning',
  N: 'necrotic',
  P: 'piercing',
  I: 'poison',
  Y: 'psychic',
  R: 'radiant',
  S: 'slashing',
  T: 'thunder'
}

const PROPERTY_LABELS: Record<string, string> = {
  A: 'Ammunition',
  F: 'Finesse',
  H: 'Heavy',
  L: 'Light',
  LD: 'Loading',
  R: 'Reach',
  S: 'Special',
  T: 'Thrown',
  V: 'Versatile',
  '2H': 'Two-Handed'
}

function itemTypeCode(raw: any, core: any) {
  return firstCode(
    core?.item_type ??
    core?.itemType ??
    raw?.type ??
    raw?.itemType ??
    ''
  )
}

function itemSource(raw: any, core: any, entity: any) {
  return cleanText(
    raw?.source ??
    core?.source ??
    sourceCode(core?.item_type ?? core?.itemType ?? raw?.type) ??
    entity?.source ??
    ''
  )
}

function itemTypeLabel(code: string, raw: any, core: any) {
  const rawType = cleanText(core?.item_type ?? core?.itemType ?? raw?.type ?? '')
  return TYPE_LABELS[code] || rawType || 'Item'
}

function damageTypeLabel(value: any) {
  const code = firstCode(value)
  if (!code) return ''
  return DAMAGE_TYPE_LABELS[code] || cleanText(value).toLowerCase()
}

function propertyLabels(raw: any, core: any) {
  const rawProperties = [
    ...asArray(raw?.property),
    ...asArray(raw?.properties),
    ...asArray(core?.property),
    ...asArray(core?.properties)
  ]

  return rawProperties.map((value) => {
    const code = propertyCode(value)

    return {
      code,
      label: PROPERTY_LABELS[code] || cleanText(value)
    }
  }).filter((item) => item.code || item.label)
}

function itemCategory(code: string, raw: any, description: string) {
  const text = `${cleanText(raw?.name)} ${description}`.toLowerCase()

  if (raw?.weapon === true || code === 'M' || code === 'R') return 'weapon'
  if (code === 'LA' || code === 'MA' || code === 'HA' || raw?.armor === true) return 'armor'
  if (code === 'S') return 'shield'
  if (code === 'A') return 'ammunition'
  if (code === 'P') return 'consumable'
  if (code === 'SC') return 'scroll'
  if (code === 'SCF') return 'spellcasting_focus'
  if (code === 'WD') return 'wand'
  if (code === 'RD') return 'rod'
  if (code === 'ST' || raw?.staff) return 'staff'
  if (code === 'RG') return 'ring'
  if (code === 'AT' || code === 'T' || code === 'GS' || code === 'INS') return 'tool'
  if (code === 'G' && (raw?.containerCapacity || text.includes('holds up to'))) return 'container'
  if (String(code || '').startsWith('$')) return 'treasure'
  if (raw?.wondrous) return 'wondrous'
  if (raw?.attachedSpells || raw?.charges) return 'magic_item'

  return 'generic'
}

function equipSlot(category: string, raw: any, description: string) {
  const name = cleanText(raw?.name).toLowerCase()
  const text = `${name} ${description}`.toLowerCase()

  if (category === 'armor') return 'body'
  if (category === 'shield') return 'off_hand'
  if (category === 'weapon') return 'hand'
  if (category === 'ammunition') return 'ammo'
  if (category === 'ring') return 'ring'
  if (category === 'wand' || category === 'rod' || category === 'staff' || category === 'spellcasting_focus') return 'hand'

  if (name.includes('cloak')) return 'shoulders'
  if (name.includes('amulet') || name.includes('necklace') || name.includes('periapt')) return 'neck'
  if (name.includes('boots')) return 'feet'
  if (name.includes('gloves') || name.includes('gauntlets')) return 'hands'
  if (name.includes('belt')) return 'waist'
  if (name.includes('helm') || name.includes('hat') || name.includes('headband')) return 'head'

  if (text.includes('while wearing') || text.includes('while you wear')) return 'worn'
  if (text.includes('while holding') || text.includes('while you hold')) return 'hand'

  return ''
}

function requiresAttunement(raw: any, core: any) {
  return booleanValue(core?.attunement) || Boolean(raw?.reqAttune || raw?.attunement)
}

function attunementText(raw: any) {
  if (!raw?.reqAttune) return ''
  if (raw.reqAttune === true) return 'Requires attunement'
  return `Requires attunement ${cleanText(raw.reqAttune)}`
}

function weaponProfile(code: string, raw: any, core: any) {
  if (!(raw?.weapon === true || code === 'M' || code === 'R')) return null

  const damage = cleanText(core?.damage ?? raw?.dmg1 ?? raw?.damage ?? '')
  const versatileDamage = cleanText(raw?.dmg2 ?? raw?.versatileDamage ?? '')
  const damageType = damageTypeLabel(core?.damage_type ?? core?.damageType ?? raw?.dmgType ?? raw?.damageType ?? '')
  const properties = propertyLabels(raw, core)
  const magicBonus = parseBonus(raw?.bonusWeapon ?? raw?.bonusWeaponAttack ?? raw?.bonusWeaponDamage ?? core?.bonusWeapon)

  const category = cleanText(raw?.weaponCategory ?? raw?.weapon_category ?? '')
    .toLowerCase()

  return {
    kind: code === 'R' ? 'ranged' : 'melee',
    category,
    damage,
    versatileDamage,
    damageType,
    range: cleanText(raw?.range ?? core?.range ?? ''),
    properties,
    propertyCodes: properties.map((item) => item.code),
    mastery: cleanText(raw?.mastery ?? core?.mastery ?? ''),
    magicBonus,
    attackBonus: parseBonus(raw?.bonusWeaponAttack ?? raw?.bonusWeapon),
    damageBonus: parseBonus(raw?.bonusWeaponDamage ?? raw?.bonusWeapon)
  }
}

function armorProfile(code: string, raw: any, core: any) {
  const isArmor = code === 'LA' || code === 'MA' || code === 'HA'
  const isShield = code === 'S'

  if (!isArmor && !isShield && !raw?.armor) return null

  const baseAc = numberOrNull(core?.armor_class ?? core?.armorClass ?? raw?.ac ?? raw?.armorClass)
  const bonusAc = parseBonus(raw?.bonusAc ?? core?.bonusAc)
  const shieldBonus = isShield ? (baseAc || bonusAc || 2) : 0

  return {
    armorType: isShield ? 'shield' : code === 'LA' ? 'light' : code === 'MA' ? 'medium' : code === 'HA' ? 'heavy' : 'armor',
    baseAc,
    bonusAc,
    shieldBonus,
    stealthDisadvantage: Boolean(raw?.stealth),
    strengthRequirement: cleanText(raw?.strength ?? raw?.strRequirement ?? ''),
    isShield,
    isArmor
  }
}

function modifiers(raw: any, profile: any) {
  const out: any[] = []

  if (raw?.bonusAc !== undefined || profile?.armor?.bonusAc) {
    const value = parseBonus(raw?.bonusAc ?? profile?.armor?.bonusAc)
    if (value) out.push({ type: 'ac_bonus', value, source: 'item' })
  }

  if (raw?.bonusSavingThrow !== undefined) {
    const value = parseBonus(raw.bonusSavingThrow)
    if (value) out.push({ type: 'saving_throw_bonus', value, source: 'item' })
  }

  if (raw?.modifySpeed) {
    out.push({ type: 'speed_modifier', value: raw.modifySpeed, source: 'item' })
  }

  for (const resistance of asArray(raw?.resist)) {
    const label = cleanText(resistance)
    if (label) out.push({ type: 'resistance', value: label, source: 'item' })
  }

  return out
}

function resources(raw: any) {
  const charges = numberOrNull(raw?.charges)

  if (!charges && !raw?.recharge && !raw?.rechargeAmount) {
    return []
  }

  return [{
    key: 'charges',
    label: 'Charges',
    max: charges,
    recharge: cleanText(raw?.recharge ?? ''),
    rechargeAmount: cleanText(raw?.rechargeAmount ?? '')
  }]
}

function actionTiming(text: string) {
  const lower = text.toLowerCase()

  if (lower.includes('bonus action')) return 'Bonus Action'
  if (lower.includes('reaction')) return 'Reaction'
  if (lower.includes('magic action')) return 'Magic Action'
  if (lower.includes('as an action') || lower.includes('take an action') || lower.includes('use an action')) return 'Action'

  return ''
}

function grantedActions(raw: any, description: string) {
  const out: any[] = []
  const timing = actionTiming(description)

  if (timing) {
    out.push({
      id: 'item-action-main',
      name: cleanText(raw?.name || 'Item Action'),
      timing,
      actionKind: timing,
      detail: description.slice(0, 700),
      consumesResource: Boolean(raw?.charges)
    })
  }

  for (const spell of asArray(raw?.attachedSpells)) {
    const label = cleanText(spell)
    if (!label) continue

    out.push({
      id: `item-spell-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: label,
      timing: 'Magic Action',
      actionKind: 'Spell',
      detail: `Cast ${label} from this item.`,
      spell: label,
      consumesResource: Boolean(raw?.charges)
    })
  }

  return out
}

function searchTags(profile: any, raw: any) {
  return unique([
    profile.category,
    profile.displayType,
    profile.rarity,
    profile.source,
    profile.requiresAttunement ? 'attunement' : '',
    profile.equippable ? 'equippable' : '',
    profile.weapon ? 'weapon' : '',
    profile.armor?.isArmor ? 'armor' : '',
    profile.armor?.isShield ? 'shield' : '',
    raw?.wondrous ? 'wondrous' : '',
    raw?.weaponCategory,
    ...asArray(raw?.lootTables),
    ...asArray(raw?.reqAttuneTags).map((item) => typeof item === 'object' ? Object.keys(item).join(' ') : item)
  ])
}

export function normalizeDnd5eItem(input: {
  entity?: any
  core?: any
  raw?: any
} = {}) {
  const entity = asObject(input.entity)
  const core = asObject(input.core)
  const raw = asObject(input.raw)

  const name = cleanText(core?.name || raw?.name || entity?.title || 'Untitled Item')
  const code = itemTypeCode(raw, core)
  const description = cleanText(core?.description || entriesToText(raw?.entries))
  const category = itemCategory(code, raw, description)
  const slot = equipSlot(category, raw, description)
  const weapon = weaponProfile(code, raw, core)
  const armor = armorProfile(code, raw, core)

  const profile: any = {
    id: String(entity?.id || raw?.id || ''),
    name,
    source: itemSource(raw, core, entity),
    page: cleanText(raw?.page ?? core?.page ?? ''),
    importKind: cleanText(core?.import_kind || raw?.__importKind || 'item'),
    rawType: cleanText(core?.item_type ?? core?.itemType ?? raw?.type ?? ''),
    typeCode: code,
    displayType: itemTypeLabel(code, raw, core),
    category,
    rarity: cleanText(core?.rarity || raw?.rarity || ''),
    description,
    value: displayValue(raw, core),
    valueCp: valueCp(raw, core),
    weight: numberOrNull(core?.weight ?? raw?.weight) ?? 0,
    requiresAttunement: requiresAttunement(raw, core),
    attunementText: attunementText(raw),
    equippable: Boolean(slot || weapon || armor || category === 'wondrous' || category === 'magic_item'),
    equipSlot: slot,
    consumable: category === 'consumable' || category === 'scroll',
    container: Boolean(raw?.containerCapacity),
    containerCapacity: raw?.containerCapacity ?? null,
    weapon,
    armor,
    resources: resources(raw),
    grantedActions: grantedActions(raw, description),
    attachedSpells: asArray(raw?.attachedSpells).map(cleanText).filter(Boolean),
    modifiers: [] as any[],
    tags: [] as string[]
  }

  profile.modifiers = modifiers(raw, profile)
  profile.tags = searchTags(profile, raw)

  return profile
}

export function normalizeDnd5eItemFromEntity(entity: any) {
  const blocks = Array.isArray(entity?.blocks) ? entity.blocks : []

  function blockData(key: string) {
    return blocks.find((block: any) =>
      String(block?.block_key || block?.blockKey || '') === key
    )?.data || {}
  }

  return normalizeDnd5eItem({
    entity,
    core: blockData('item_core'),
    raw: blockData('import_source')?.raw_json || {}
  })
}

export function isNormalizedWeapon(profile: any) {
  return profile?.category === 'weapon' || Boolean(profile?.weapon)
}

export function isNormalizedArmor(profile: any) {
  return profile?.category === 'armor' || profile?.armor?.isArmor === true
}

export function isNormalizedShield(profile: any) {
  return profile?.category === 'shield' || profile?.armor?.isShield === true
}
