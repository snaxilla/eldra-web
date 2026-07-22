function cleanText(value: any) {
  return String(value ?? '').trim()
}

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null))
}

function numberOrDefault(value: any, fallback = 10) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback
}

function compactPreviewText(value: any, limit = 420) {
  const text = cleanText(value)
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text
}

export function enemyValueText(value: any): string {
  if (value === null || value === undefined || value === '') return ''

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return cleanText(value)
  }

  if (Array.isArray(value)) {
    return value.map(enemyValueText).filter(Boolean).join(' / ')
  }

  if (typeof value === 'object') {
    if (value.average !== undefined && value.formula !== undefined) {
      return `${value.average} (${value.formula})`
    }

    if (value.ac !== undefined) return enemyValueText(value.ac)

    if (value.type !== undefined && Array.isArray(value.tags) && value.tags.length) {
      return `${enemyValueText(value.type)} (${value.tags.map(enemyValueText).filter(Boolean).join(', ')})`
    }

    if (value.type !== undefined) return enemyValueText(value.type)

    const speedParts = Object.entries(value)
      .map(([key, entryValue]) => `${key} ${enemyValueText(entryValue)}`)
      .filter(Boolean)

    if (speedParts.length) return speedParts.join(', ')
  }

  return ''
}

export function enemyEntriesToText(value: any): string {
  if (value === null || value === undefined || value === '') return ''

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return cleanText(value)
  }

  if (Array.isArray(value)) {
    return value.map(enemyEntriesToText).filter(Boolean).join('\n\n')
  }

  if (typeof value === 'object') {
    const name = cleanText(value.name)
    const body = enemyEntriesToText(value.entry ?? value.entries ?? value.items ?? value.rows ?? '')

    if (name && body) return `${name}: ${body}`
    if (name) return name
    if (body) return body
  }

  return ''
}

function enemyAbilityValue(core: any, abilities: any, raw: any, key: string) {
  const upper = key.toUpperCase()

  return cleanText(
    core?.[key] ??
    core?.[upper] ??
    abilities?.[key] ??
    abilities?.[upper] ??
    raw?.[key] ??
    raw?.[upper] ??
    ''
  )
}

export function homebrewEnemyCoreForBuilder(coreValue: any, rawValue: any) {
  const core = asObject(coreValue)
  const raw = asObject(rawValue)
  const rawStatblock = raw?.monster && typeof raw.monster === 'object'
    ? raw.monster
    : raw

  const abilities = asObject(
    core.abilities ??
    core.ability_scores ??
    core.abilityScores ??
    rawStatblock.abilities ??
    rawStatblock.ability_scores ??
    rawStatblock.abilityScores
  )

  return {
    name: cleanText(core.name || core.title || rawStatblock.name),
    size: enemyValueText(core.size ?? rawStatblock.size),
    creature_type: enemyValueText(core.creature_type ?? core.creatureType ?? core.type ?? rawStatblock.type),
    creatureType: enemyValueText(core.creature_type ?? core.creatureType ?? core.type ?? rawStatblock.type),
    alignment: enemyValueText(core.alignment ?? rawStatblock.alignment),
    challenge_rating: enemyValueText(core.challenge_rating ?? core.challengeRating ?? core.cr ?? rawStatblock.cr),
    challengeRating: enemyValueText(core.challenge_rating ?? core.challengeRating ?? core.cr ?? rawStatblock.cr),
    xp: enemyValueText(core.xp ?? core.experience ?? rawStatblock.xp),
    armor_class: enemyValueText(core.armor_class ?? core.armorClass ?? core.ac ?? rawStatblock.ac),
    armorClass: enemyValueText(core.armor_class ?? core.armorClass ?? core.ac ?? rawStatblock.ac),
    hit_points: enemyValueText(core.hit_points ?? core.hitPoints ?? core.hp ?? rawStatblock.hp),
    hitPoints: enemyValueText(core.hit_points ?? core.hitPoints ?? core.hp ?? rawStatblock.hp),
    speed: enemyValueText(core.speed ?? rawStatblock.speed),
    str: enemyAbilityValue(core, abilities, rawStatblock, 'str'),
    dex: enemyAbilityValue(core, abilities, rawStatblock, 'dex'),
    con: enemyAbilityValue(core, abilities, rawStatblock, 'con'),
    int: enemyAbilityValue(core, abilities, rawStatblock, 'int'),
    wis: enemyAbilityValue(core, abilities, rawStatblock, 'wis'),
    cha: enemyAbilityValue(core, abilities, rawStatblock, 'cha'),
    savingThrows: enemyValueText(core.savingThrows ?? core.saving_throws ?? rawStatblock.save),
    skills: enemyValueText(core.skills ?? rawStatblock.skill),
    senses: enemyValueText(core.senses ?? rawStatblock.senses),
    languages: enemyValueText(core.languages ?? rawStatblock.languages),
    vulnerabilities: enemyValueText(core.vulnerabilities ?? core.damage_vulnerabilities ?? rawStatblock.vulnerable),
    resistances: enemyValueText(core.resistances ?? core.damage_resistances ?? rawStatblock.resist),
    immunities: enemyValueText(core.immunities ?? core.damage_immunities ?? rawStatblock.immune),
    conditionImmunities: enemyValueText(core.conditionImmunities ?? core.condition_immunities ?? rawStatblock.conditionImmune),
    traits: enemyEntriesToText(core.traits ?? core.trait ?? rawStatblock.trait),
    actions: enemyEntriesToText(core.actions ?? core.action ?? rawStatblock.action),
    bonusActions: enemyEntriesToText(core.bonusActions ?? core.bonus_actions ?? rawStatblock.bonus),
    reactions: enemyEntriesToText(core.reactions ?? core.reaction ?? rawStatblock.reaction),
    legendaryActions: enemyEntriesToText(core.legendaryActions ?? core.legendary_actions ?? rawStatblock.legendary),
    description: cleanText(core.description || core.summary || rawStatblock.fluff || '')
  }
}

function parseEnemyEntryList(value: any) {
  const text = cleanText(value)
  if (!text) return []

  return text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index) => {
      const split = chunk.match(/^([^:\n-]{2,80})\s*[:\-]\s*([\s\S]+)$/)
      const name = cleanText(split?.[1] || `Entry ${index + 1}`)
      const detail = cleanText(split?.[2] || chunk)

      return {
        name,
        detail,
        entries: [detail]
      }
    })
}

export function normalizeHomebrewEnemyPatch(value: any, fallbackTitle = '') {
  const enemy = asObject(value)

  return {
    name: cleanText(enemy.name) || cleanText(fallbackTitle),
    size: cleanText(enemy.size),
    creature_type: cleanText(enemy.creatureType ?? enemy.creature_type ?? enemy.type),
    alignment: cleanText(enemy.alignment),
    challenge_rating: cleanText(enemy.challengeRating ?? enemy.challenge_rating ?? enemy.cr),
    xp: cleanText(enemy.xp),
    armor_class: cleanText(enemy.armorClass ?? enemy.armor_class ?? enemy.ac),
    hit_points: cleanText(enemy.hitPoints ?? enemy.hit_points ?? enemy.hp),
    speed: cleanText(enemy.speed),
    str: numberOrDefault(enemy.str, 10),
    dex: numberOrDefault(enemy.dex, 10),
    con: numberOrDefault(enemy.con, 10),
    int: numberOrDefault(enemy.int, 10),
    wis: numberOrDefault(enemy.wis, 10),
    cha: numberOrDefault(enemy.cha, 10),
    saving_throws: cleanText(enemy.savingThrows ?? enemy.saving_throws),
    skills: cleanText(enemy.skills),
    senses: cleanText(enemy.senses),
    languages: cleanText(enemy.languages),
    vulnerabilities: cleanText(enemy.vulnerabilities),
    resistances: cleanText(enemy.resistances),
    immunities: cleanText(enemy.immunities),
    condition_immunities: cleanText(enemy.conditionImmunities ?? enemy.condition_immunities),
    description: cleanText(enemy.description),
    traits: cleanText(enemy.traits),
    actions: cleanText(enemy.actions),
    bonus_actions: cleanText(enemy.bonusActions ?? enemy.bonus_actions),
    reactions: cleanText(enemy.reactions),
    legendary_actions: cleanText(enemy.legendaryActions ?? enemy.legendary_actions)
  }
}

export function homebrewEnemySummary(value: any) {
  const enemy = normalizeHomebrewEnemyPatch(value)
  return compactPreviewText(enemy.description, 420)
}

export function applyHomebrewEnemyPatch(core: any, value: any, fallbackTitle: string) {
  const data = deepClone(asObject(core))
  const enemy = normalizeHomebrewEnemyPatch(value, fallbackTitle)

  data.name = enemy.name || fallbackTitle
  data.title = enemy.name || fallbackTitle

  data.size = enemy.size
  data.creature_type = enemy.creature_type
  data.creatureType = enemy.creature_type
  data.type = enemy.creature_type
  data.alignment = enemy.alignment

  data.challenge_rating = enemy.challenge_rating
  data.challengeRating = enemy.challenge_rating
  data.cr = enemy.challenge_rating
  data.xp = enemy.xp

  data.armor_class = enemy.armor_class
  data.armorClass = enemy.armor_class
  data.ac = enemy.armor_class

  data.hit_points = enemy.hit_points
  data.hitPoints = enemy.hit_points
  data.hp = enemy.hit_points
  data.speed = enemy.speed

  data.abilities = {
    str: enemy.str,
    dex: enemy.dex,
    con: enemy.con,
    int: enemy.int,
    wis: enemy.wis,
    cha: enemy.cha
  }

  data.str = enemy.str
  data.dex = enemy.dex
  data.con = enemy.con
  data.int = enemy.int
  data.wis = enemy.wis
  data.cha = enemy.cha

  data.saving_throws = enemy.saving_throws
  data.savingThrows = enemy.saving_throws
  data.skills = enemy.skills
  data.senses = enemy.senses
  data.languages = enemy.languages

  data.vulnerabilities = enemy.vulnerabilities
  data.damage_vulnerabilities = enemy.vulnerabilities
  data.resistances = enemy.resistances
  data.damage_resistances = enemy.resistances
  data.immunities = enemy.immunities
  data.damage_immunities = enemy.immunities
  data.condition_immunities = enemy.condition_immunities
  data.conditionImmunities = enemy.condition_immunities

  data.description = enemy.description
  data.summary = enemy.description

  data.traits = parseEnemyEntryList(enemy.traits)
  data.trait = data.traits
  data.actions = parseEnemyEntryList(enemy.actions)
  data.action = data.actions
  data.bonusActions = parseEnemyEntryList(enemy.bonus_actions)
  data.bonus_actions = data.bonusActions
  data.bonus = data.bonusActions
  data.reactions = parseEnemyEntryList(enemy.reactions)
  data.reaction = data.reactions
  data.legendaryActions = parseEnemyEntryList(enemy.legendary_actions)
  data.legendary_actions = data.legendaryActions
  data.legendary = data.legendaryActions

  data.homebrew = true
  data.source_kind = 'homebrew'
  data.sourceKind = 'homebrew'

  return data
}

export function isEnemyHomebrewCoreBlock(key: any) {
  const normalized = cleanText(key)

  return [
    'statblock',
    'monster_profile',
    'monster_core',
    'enemy_core',
    'actions',
    'monster_actions'
  ].includes(normalized)
}
