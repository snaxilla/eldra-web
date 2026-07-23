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

function parseEnemyMaybeJson(value: any) {
  if (typeof value !== 'string') return value

  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function enemyBlockDataByKey(blocks: any[], key: string) {
  const found = blocks.find((block: any) =>
    String(block?.block_key || block?.blockKey || '') === key
  )

  return asObject(found?.data)
}

function enemyFirstText(...values: any[]) {
  for (const value of values) {
    const parsed = parseEnemyMaybeJson(value)
    const text = enemyValueText(parsed)

    if (text) return text
  }

  return ''
}

function enemyAbilityFromStructured(statblock: any, raw: any, key: string) {
  const field = `${key}_score`
  const upper = key.toUpperCase()

  return cleanText(
    statblock?.[field] ??
    statblock?.[key] ??
    statblock?.[upper] ??
    raw?.[key] ??
    raw?.[upper] ??
    ''
  )
}

function enemyHitPointsFromStructured(statblock: any, raw: any) {
  const average =
    statblock?.hit_points_average ??
    statblock?.hitPointsAverage ??
    raw?.hp?.average ??
    ''

  const formula =
    statblock?.hit_points_formula ??
    statblock?.hitPointsFormula ??
    raw?.hp?.formula ??
    ''

  if (average && formula) return `${average} (${formula})`
  if (average) return cleanText(average)
  if (formula) return cleanText(formula)

  return enemyValueText(raw?.hp)
}

function enemyActionRowsToText(actionRows: any[], type: string, rawEntries: any) {
  const rows = actionRows
    .filter((row: any) => String(row?.action_type || row?.actionType || '').toLowerCase() === type)
    .sort((a: any, b: any) => Number(a?.sort_order || a?.sortOrder || 0) - Number(b?.sort_order || b?.sortOrder || 0))

  if (rows.length) {
    return rows
      .map((row: any, index: number) => {
        const raw = parseEnemyMaybeJson(row?.raw_json ?? row?.rawJson)
        const name = cleanText(row?.name || raw?.name || `Entry ${index + 1}`)
        const detail = cleanText(row?.text) || enemyEntriesToText(raw?.entries ?? raw?.entry ?? raw)

        if (name && detail) return `${name}: ${detail}`
        return name || detail
      })
      .filter(Boolean)
      .join('\n\n')
  }

  return enemyEntriesToText(rawEntries)
}

function enemyDescriptionFromStructured(entity: any, blocks: any[], monsterProfile: any, raw: any) {
  const overview = enemyBlockDataByKey(blocks, 'overview')
  const fluff = parseEnemyMaybeJson(
    monsterProfile?.fluff_json ??
    monsterProfile?.fluffJson ??
    raw?.fluff
  )

  return cleanText(
    monsterProfile?.fluff_markdown ??
    monsterProfile?.fluffMarkdown ??
    ''
  ) ||
    enemyEntriesToText(fluff?.entries) ||
    cleanText(overview?.text) ||
    cleanText(entity?.summary)
}

export function homebrewEnemyCoreFromStructuredRows(
  entityValue: any,
  blocksValue: any,
  statblockValue: any,
  actionRowsValue: any,
  monsterProfileValue: any
) {
  const entity = asObject(entityValue)
  const blocks = Array.isArray(blocksValue) ? blocksValue : []
  const statblock = asObject(statblockValue)
  const actionRows = Array.isArray(actionRowsValue) ? actionRowsValue : []
  const monsterProfile = asObject(monsterProfileValue)

  const raw = asObject(parseEnemyMaybeJson(
    statblock?.raw_payload_json ??
    statblock?.rawPayloadJson ??
    monsterProfile?.raw_payload_json ??
    monsterProfile?.rawPayloadJson
  ))

  const name = cleanText(
    raw?.name ||
    entity?.title ||
    entity?.name
  )

  return {
    name,
    size: enemyFirstText(statblock?.size_json, statblock?.sizeJson, raw?.size),
    creature_type: enemyFirstText(statblock?.creature_type, statblock?.creatureType, raw?.type),
    creatureType: enemyFirstText(statblock?.creature_type, statblock?.creatureType, raw?.type),
    alignment: enemyFirstText(statblock?.alignment_json, statblock?.alignmentJson, raw?.alignment),
    challenge_rating: enemyFirstText(statblock?.challenge_rating, statblock?.challengeRating, raw?.cr),
    challengeRating: enemyFirstText(statblock?.challenge_rating, statblock?.challengeRating, raw?.cr),
    xp: enemyFirstText(statblock?.xp, raw?.xp),
    armor_class: enemyFirstText(statblock?.armor_class, statblock?.armorClass, statblock?.armor_class_json, statblock?.armorClassJson, raw?.ac),
    armorClass: enemyFirstText(statblock?.armor_class, statblock?.armorClass, statblock?.armor_class_json, statblock?.armorClassJson, raw?.ac),
    hit_points: enemyHitPointsFromStructured(statblock, raw),
    hitPoints: enemyHitPointsFromStructured(statblock, raw),
    speed: enemyFirstText(statblock?.speed_json, statblock?.speedJson, raw?.speed),

    str: enemyAbilityFromStructured(statblock, raw, 'str'),
    dex: enemyAbilityFromStructured(statblock, raw, 'dex'),
    con: enemyAbilityFromStructured(statblock, raw, 'con'),
    int: enemyAbilityFromStructured(statblock, raw, 'int'),
    wis: enemyAbilityFromStructured(statblock, raw, 'wis'),
    cha: enemyAbilityFromStructured(statblock, raw, 'cha'),

    savingThrows: enemyFirstText(statblock?.saving_throws_json, statblock?.savingThrowsJson, raw?.save),
    skills: enemyFirstText(statblock?.skills_json, statblock?.skillsJson, raw?.skill),
    senses: enemyFirstText(statblock?.senses_json, statblock?.sensesJson, raw?.senses),
    languages: enemyFirstText(statblock?.languages_json, statblock?.languagesJson, raw?.languages),

    vulnerabilities: enemyFirstText(statblock?.vulnerabilities_json, statblock?.vulnerabilitiesJson, raw?.vulnerable),
    resistances: enemyFirstText(statblock?.resistances_json, statblock?.resistancesJson, raw?.resist),
    immunities: enemyFirstText(statblock?.immunities_json, statblock?.immunitiesJson, raw?.immune),
    conditionImmunities: enemyFirstText(statblock?.condition_immunities_json, statblock?.conditionImmunitiesJson, raw?.conditionImmune),

    traits: enemyActionRowsToText(actionRows, 'trait', raw?.trait),
    actions: enemyActionRowsToText(actionRows, 'action', raw?.action),
    bonusActions: enemyActionRowsToText(actionRows, 'bonus', raw?.bonus),
    reactions: enemyActionRowsToText(actionRows, 'reaction', raw?.reaction),
    legendaryActions: enemyActionRowsToText(actionRows, 'legendary', raw?.legendary),

    description: enemyDescriptionFromStructured(entity, blocks, monsterProfile, raw)
  }
}

function splitEnemyListText(value: any) {
  return cleanText(value)
    .split(/[,;]/)
    .map((item) => cleanText(item))
    .filter(Boolean)
}

function enemyFirstNumber(value: any) {
  const match = cleanText(value).match(/-?\d+/)
  if (!match) return null

  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function enemySizeJson(value: any) {
  const text = cleanText(value)
  if (!text) return []

  return text
    .split(/[\/,]/)
    .map((item) => cleanText(item).toUpperCase())
    .filter(Boolean)
}

function enemyAlignmentJson(value: any) {
  const text = cleanText(value)
  if (!text) return []

  if (/unaligned|any/i.test(text)) return []

  return text
    .split(/[\/,]/)
    .map((item) => cleanText(item).toUpperCase())
    .filter(Boolean)
}

function enemyArmorClassJson(value: any) {
  const text = cleanText(value)
  if (!text) return []

  const parsed = enemyFirstNumber(text)

  return parsed === null
    ? [text]
    : [{ ac: parsed, from: text === String(parsed) ? [] : [text] }]
}

function enemyHitPointsParts(value: any) {
  const text = cleanText(value)

  if (!text) {
    return {
      average: null,
      formula: ''
    }
  }

  const withFormula = text.match(/^(\d+)\s*\(([^)]+)\)/)

  if (withFormula) {
    return {
      average: Number(withFormula[1]),
      formula: cleanText(withFormula[2])
    }
  }

  return {
    average: enemyFirstNumber(text),
    formula: ''
  }
}

function enemySpeedJson(value: any) {
  const text = cleanText(value)
  if (!text) return {}

  const speed: Record<string, any> = {}

  for (const part of text.split(',')) {
    const chunk = cleanText(part)
    if (!chunk) continue

    const named = chunk.match(/^(walk|burrow|climb|fly|swim)\s+(\d+)/i)
    if (named) {
      speed[named[1].toLowerCase()] = Number(named[2])
      continue
    }

    const walk = chunk.match(/(\d+)/)
    if (walk && speed.walk === undefined) {
      speed.walk = Number(walk[1])
      continue
    }

    if (!speed.special) speed.special = []
    speed.special.push(chunk)
  }

  return Object.keys(speed).length
    ? speed
    : { text }
}

function enemyKeyValueJson(value: any) {
  const text = cleanText(value)
  if (!text) return {}

  const result: Record<string, any> = {}

  for (const part of text.split(',')) {
    const chunk = cleanText(part)
    if (!chunk) continue

    const match = chunk.match(/^([A-Za-z][A-Za-z\s'()-]*?)\s*[: ]\s*([+-]?\d+)$/)

    if (!match) {
      result[chunk] = true
      continue
    }

    const key = cleanText(match[1]).toLowerCase().replace(/\s+/g, '_')
    const parsed = Number(match[2])

    result[key] = Number.isFinite(parsed) ? parsed : match[2]
  }

  return result
}

function enemyPassivePerception(value: any) {
  const match = cleanText(value).match(/passive\s+perception\s+(\d+)/i)
  if (!match) return null

  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

function enemyDamageTagsJson(enemy: any) {
  return {
    vulnerabilities: splitEnemyListText(enemy.vulnerabilities),
    resistances: splitEnemyListText(enemy.resistances),
    immunities: splitEnemyListText(enemy.immunities),
    conditionImmunities: splitEnemyListText(enemy.condition_immunities)
  }
}

function enemyRawPayloadFromPatch(enemy: any) {
  const hp = enemyHitPointsParts(enemy.hit_points)

  return {
    name: enemy.name,
    source: 'ELDRA',
    size: enemySizeJson(enemy.size),
    type: enemy.creature_type || 'creature',
    alignment: enemyAlignmentJson(enemy.alignment),
    ac: enemyArmorClassJson(enemy.armor_class),
    hp: {
      average: hp.average,
      formula: hp.formula
    },
    speed: enemySpeedJson(enemy.speed),
    cr: enemy.challenge_rating || undefined,
    xp: enemy.xp || undefined,
    str: enemy.str,
    dex: enemy.dex,
    con: enemy.con,
    int: enemy.int,
    wis: enemy.wis,
    cha: enemy.cha,
    save: enemyKeyValueJson(enemy.saving_throws),
    skill: enemyKeyValueJson(enemy.skills),
    senses: enemy.senses || undefined,
    languages: splitEnemyListText(enemy.languages),
    vulnerable: splitEnemyListText(enemy.vulnerabilities),
    resist: splitEnemyListText(enemy.resistances),
    immune: splitEnemyListText(enemy.immunities),
    conditionImmune: splitEnemyListText(enemy.condition_immunities),
    trait: parseEnemyEntryList(enemy.traits),
    action: parseEnemyEntryList(enemy.actions),
    bonus: parseEnemyEntryList(enemy.bonus_actions),
    reaction: parseEnemyEntryList(enemy.reactions),
    legendary: parseEnemyEntryList(enemy.legendary_actions),
    entries: enemy.description ? [enemy.description] : [],
    homebrew: true,
    homebrewBuilder: enemy
  }
}

function enemyActionRowsFromPatch(enemy: any) {
  const groups = [
    ['trait', enemy.traits],
    ['action', enemy.actions],
    ['bonus', enemy.bonus_actions],
    ['reaction', enemy.reactions],
    ['legendary', enemy.legendary_actions]
  ]

  const rows: any[] = []

  for (const [actionType, text] of groups) {
    const entries = parseEnemyEntryList(text)

    entries.forEach((entry, index) => {
      rows.push({
        action_type: actionType,
        name: entry.name || `Entry ${index + 1}`,
        sort_order: rows.length * 10 + 10,
        text: entry.detail || enemyEntriesToText(entry.entries),
        raw_json: {
          name: entry.name,
          entries: entry.entries || (entry.detail ? [entry.detail] : [])
        }
      })
    })
  }

  return rows
}

export function homebrewEnemyStructuredRowsForDraft(value: any, fallbackTitle = '') {
  const enemy = normalizeHomebrewEnemyPatch(value, fallbackTitle)
  const hp = enemyHitPointsParts(enemy.hit_points)
  const raw = enemyRawPayloadFromPatch(enemy)

  return {
    statblock: {
      profile_kind: 'monster',
      size_json: enemySizeJson(enemy.size),
      creature_type: enemy.creature_type,
      alignment_json: enemyAlignmentJson(enemy.alignment),
      armor_class: enemyFirstNumber(enemy.armor_class),
      armor_class_json: enemyArmorClassJson(enemy.armor_class),
      hit_points_average: hp.average,
      hit_points_formula: hp.formula,
      speed_json: enemySpeedJson(enemy.speed),
      str_score: enemy.str,
      dex_score: enemy.dex,
      con_score: enemy.con,
      int_score: enemy.int,
      wis_score: enemy.wis,
      cha_score: enemy.cha,
      saving_throws_json: enemyKeyValueJson(enemy.saving_throws),
      skills_json: enemyKeyValueJson(enemy.skills),
      senses_json: enemy.senses ? splitEnemyListText(enemy.senses) : [],
      passive_perception: enemyPassivePerception(enemy.senses),
      languages_json: splitEnemyListText(enemy.languages),
      challenge_rating: enemy.challenge_rating,
      level: null,
      damage_tags_json: enemyDamageTagsJson(enemy),
      raw_payload_json: raw
    },
    actions: enemyActionRowsFromPatch(enemy),
    monsterProfile: {
      source: 'ELDRA',
      page: null,
      environment_json: [],
      treasure_json: [],
      reference_sources_json: {},
      sound_clip_url: null,
      token_name: '',
      token_source: '',
      has_fluff: Boolean(enemy.description),
      has_fluff_images: false,
      fluff_json: enemy.description
        ? { entries: [enemy.description] }
        : null,
      action_tags_json: [],
      language_tags_json: splitEnemyListText(enemy.languages),
      misc_tags_json: [],
      raw_payload_json: raw
    }
  }
}

