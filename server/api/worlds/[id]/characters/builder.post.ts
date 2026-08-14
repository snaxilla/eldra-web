import { dxFetch, slugify } from '../../../../utils/entity-factory'
import { requireCapability } from '../../../../utils/authorization'

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
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
      return JSON.parse(
        trimmed
          .replace(/:\s*True\b/g, ': true')
          .replace(/:\s*False\b/g, ': false')
          .replace(/:\s*None\b/g, ': null')
      )
    } catch {
      return value
    }
  }

  return value
}

function cleanText(value: any) {
  return String(value ?? '').trim()
}

function clean5eText(value: any) {
  return cleanText(value)
    .replace(/\{@(?:feat|skill|item|spell|filter|book|action|variantrule|condition|class|race|creature|damage|sense|status)\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/gi, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleCase(value: any) {
  return clean5eText(value)
    .replace(/\|[A-Za-z0-9_.:-]+(?:\|[^,\n;)]*)?/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\b([A-Za-z]+)'S\b/g, "$1's")
}

function cleanBuilderCarryoverText(value: any) {
  return clean5eText(value)
    .replace(/\|[A-Za-z0-9_.:-]+(?:\|[^,\n;)]*)?/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

function itemNameFromRef(value: any) {
  return cleanBuilderCarryoverText(String(value || '').split('|')[0])
}

function integerOrNull(value: any) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null
}

function abilityModifier(score: any) {
  const parsed = Number(score)
  if (!Number.isFinite(parsed)) return 0
  return Math.floor((parsed - 10) / 2)
}

function isAbilityName(value: any) {
  const key = cleanBuilderCarryoverText(value).toLowerCase()

  return [
    'str',
    'dex',
    'con',
    'int',
    'wis',
    'cha',
    'strength',
    'dexterity',
    'constitution',
    'intelligence',
    'wisdom',
    'charisma'
  ].includes(key)
}

function isSkillName(value: any) {
  const key = cleanBuilderCarryoverText(value).toLowerCase()

  return [
    'acrobatics',
    'animal handling',
    'arcana',
    'athletics',
    'deception',
    'history',
    'insight',
    'intimidation',
    'investigation',
    'medicine',
    'nature',
    'perception',
    'performance',
    'persuasion',
    'religion',
    'sleight of hand',
    'stealth',
    'survival'
  ].includes(key)
}

function looksLikeNonEquipmentItem(value: any) {
  const text = cleanBuilderCarryoverText(value)
  const key = text.toLowerCase()
  const compact = key.replace(/[^a-z0-9]+/g, '')

  if (!key) return true
  if (isAbilityName(text)) return true
  if (isSkillName(text)) return true

  return key === 'or' ||
    key === 'and' ||
    key === 'any' ||
    key === 'or b' ||
    key === 'same as above' ||
    key.includes('same as above') ||
    compact === 'anygamingset' ||
    compact === 'anymusicalinstrument' ||
    compact === 'anyartisantool' ||
    compact === 'anyartisanstool' ||
    compact === 'anyartisanstools' ||
    compact === 'gamingsetsameasabove' ||
    compact === 'gamingset' ||
    key.includes('ability score') ||
    key.includes('ability scores') ||
    key.includes('background ability') ||
    key.includes('skill proficiency') ||
    key.includes('skill proficiencies') ||
    key.includes('background skill') ||
    key.includes('background feat') ||
    key.startsWith('feat ') ||
    key.includes('magic initiate') ||
    key === 'crafter' ||
    key === 'gold only' ||
    key === 'skilled' ||
    key === 'savage attacker' ||
    key.includes('choose one kind') ||
    key.includes('choose a kind') ||
    key.includes('choose one type') ||
    key.includes('choose a type') ||
    key.includes('choose a or b') ||
    key.includes('choose one of')
}

function normalizeChoiceGroups(value: any) {
  const raw = asObject(value)
  const out: Record<string, any> = {}

  for (const [key, choice] of Object.entries(raw)) {
    const safeKey = cleanText(key)
    const data = asObject(choice)

    if (!safeKey) continue

    const values = Array.isArray(data.values)
      ? data.values.map(cleanText).filter(Boolean)
      : Array.isArray(data.selected)
        ? data.selected.map(cleanText).filter(Boolean)
        : data.value
          ? [cleanText(data.value)]
          : []

    if (!values.length) continue

    out[safeKey] = {
      label: cleanText(data.label || safeKey),
      values,
      value: values[0] || '',
      valueLabel: cleanText(data.valueLabel || data.selectedLabel || ''),
      detail: cleanText(data.detail || ''),
      note: cleanText(data.note || ''),
      meta: asObject(data.meta)
    }
  }

  return out
}

function normalizeSpeciesChoices(value: any) {
  return normalizeChoiceGroups(value)
}

function normalizeClassChoices(value: any) {
  return normalizeChoiceGroups(value)
}

function normalizeBackgroundChoices(value: any) {
  return normalizeChoiceGroups(value)
}

function normalizeAbilityScores(value: any) {
  const raw = asObject(value)
  const scores: Record<string, number> = {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10
  }

  for (const key of Object.keys(scores)) {
    const parsed = Number(raw[key])
    scores[key] = Number.isFinite(parsed)
      ? Math.min(30, Math.max(1, Math.floor(parsed)))
      : 10
  }

  return scores
}

function fixedHitDieAverage(faces: number) {
  const fixed: Record<number, number> = {
    4: 3,
    6: 4,
    8: 5,
    10: 6,
    12: 7
  }

  return fixed[faces] || Math.floor(faces / 2) + 1
}

function startingHp(level: number, hitDieFaces: number, conScore: number) {
  const conMod = abilityModifier(conScore)
  const firstLevel = Math.max(1, hitDieFaces + conMod)
  const laterLevelGain = Math.max(1, fixedHitDieAverage(hitDieFaces) + conMod)

  return Math.max(1, firstLevel + Math.max(0, level - 1) * laterLevelGain)
}

function blockData(blocks: any[], key: string) {
  const block = blocks.find((item: any) =>
    String(item?.block_key || item?.blockKey || '') === key
  )

  return asObject(block?.data)
}

function rawJsonFromBlocks(blocks: any[]) {
  const source = blockData(blocks, 'import_source')
  return asObject(parseJsonish(source.raw_json ?? source.rawJson))
}

async function linkedEntityTitle(id: any) {
  const entityId = integerOrNull(id)
  if (!entityId) return ''

  try {
    const res = await dxFetch(`/items/entities/${entityId}?fields=id,title,entity_type`)
    return cleanText(res?.data?.title)
  } catch {
    return ''
  }
}

async function linkedEntityBlocks(id: any) {
  const entityId = integerOrNull(id)
  if (!entityId) return []

  try {
    const params = new URLSearchParams()
    params.set('filter[entity_id][_eq]', String(entityId))
    params.set('fields', 'block_key,data')
    params.set('limit', '-1')

    const res = await dxFetch(`/items/block_instances?${params.toString()}`)
    return Array.isArray(res?.data) ? res.data : []
  } catch {
    return []
  }
}

function parseHitDieFaces(blocks: any[]) {
  const core = blockData(blocks, 'class_core')
  const raw = rawJsonFromBlocks(blocks)

  const candidates = [
    core.hit_die,
    core.hitDie,
    raw?.hd?.faces ? `d${raw.hd.faces}` : '',
    raw?.hitDie,
    raw?.hit_die
  ]

  for (const candidate of candidates) {
    const match = String(candidate || '').toLowerCase().match(/d(\d+)/)
    if (!match) continue

    const faces = Number(match[1])
    if (Number.isFinite(faces) && faces > 0) return faces
  }

  return 6
}

function parseSpeciesSpeed(blocks: any[]) {
  const core = blockData(blocks, 'species_core')
  const raw = rawJsonFromBlocks(blocks)

  const coreSpeed = Number(core.speed)
  if (Number.isFinite(coreSpeed) && coreSpeed > 0) return Math.floor(coreSpeed)

  const rawSpeed = raw.speed

  if (typeof rawSpeed === 'number' && rawSpeed > 0) return Math.floor(rawSpeed)

  if (rawSpeed && typeof rawSpeed === 'object') {
    const walk = Number(rawSpeed.walk ?? rawSpeed.walking ?? rawSpeed.base)
    if (Number.isFinite(walk) && walk > 0) return Math.floor(walk)
  }

  return 30
}

function choiceValuesFromAny(value: any): string[] {
  const parsed = parseJsonish(value)

  if (!parsed) return []

  if (Array.isArray(parsed)) {
    return parsed.flatMap(choiceValuesFromAny).filter(Boolean)
  }

  if (typeof parsed === 'object') {
    if (Array.isArray(parsed.values)) return choiceValuesFromAny(parsed.values)
    if (Array.isArray(parsed.selected)) return choiceValuesFromAny(parsed.selected)
    if (parsed.value) return choiceValuesFromAny(parsed.value)
    if (parsed.choose) return choiceValuesFromAny(parsed.choose)
    if (Array.isArray(parsed.from)) return choiceValuesFromAny(parsed.from)

    const truthyKeys = Object.entries(parsed)
      .filter(([, item]) => item === true || item === 'true' || item === 1)
      .map(([key]) => titleCase(key))
      .filter(Boolean)

    if (truthyKeys.length) return truthyKeys

    return Object.values(parsed).flatMap(choiceValuesFromAny).filter(Boolean)
  }

  const text = cleanBuilderCarryoverText(parsed)
  if (!text) return []

  if (text.includes(',')) {
    return text
      .split(',')
      .map((item) => titleCase(item))
      .filter(Boolean)
  }

  return [titleCase(text)]
}

function featValuesFromAny(value: any): string[] {
  const parsed = parseJsonish(value)

  if (!parsed) return []

  if (Array.isArray(parsed)) {
    return parsed.flatMap(featValuesFromAny).filter(Boolean)
  }

  if (typeof parsed === 'object') {
    if (parsed.name) return [titleCase(parsed.name)]
    if (parsed.feat) return featValuesFromAny(parsed.feat)
    if (parsed.feats) return featValuesFromAny(parsed.feats)
    if (parsed.value) return featValuesFromAny(parsed.value)
    if (Array.isArray(parsed.from)) return featValuesFromAny(parsed.from)

    const out: string[] = []

    for (const [key, item] of Object.entries(parsed)) {
      if (item === true || item === 'true' || item === 1) {
        out.push(titleCase(key))
        continue
      }

      if (typeof item === 'string') {
        out.push(`${titleCase(key)} (${titleCase(item)})`)
        continue
      }

      if (Array.isArray(item)) {
        out.push(...featValuesFromAny(item))
      }
    }

    if (out.length) return out

    return Object.values(parsed).flatMap(featValuesFromAny).filter(Boolean)
  }

  const text = cleanBuilderCarryoverText(parsed)
  if (!text) return []

  if (text.includes(',')) {
    return text
      .split(',')
      .map((item) => titleCase(item))
      .filter(Boolean)
  }

  return [titleCase(text)]
}

function backgroundFeatValuesFromRaw(raw: any) {
  const candidates = [
    raw?.feat,
    raw?.feats,
    raw?.additionalFeat,
    raw?.additionalFeats
  ]

  for (const candidate of candidates) {
    const values = featValuesFromAny(candidate)
    if (values.length) return values
  }

  return []
}

function equipmentValuesFromText(value: any): string[] {
  const parsed = parseJsonish(value)

  if (!parsed) return []

  if (Array.isArray(parsed)) {
    return parsed.flatMap(equipmentValuesFromText).filter(Boolean)
  }

  if (typeof parsed === 'object') {
    if (Array.isArray(parsed._)) return equipmentValuesFromText(parsed._)
    if (Array.isArray(parsed.a)) return equipmentValuesFromText(parsed.a)
    if (Array.isArray(parsed.items)) return equipmentValuesFromText(parsed.items)
    if (Array.isArray(parsed.entries)) return equipmentValuesFromText(parsed.entries)
    if (Array.isArray(parsed.defaultData)) return equipmentValuesFromText(parsed.defaultData)
    if (Array.isArray(parsed.equipment)) return equipmentValuesFromText(parsed.equipment)
    if (parsed.entry) return equipmentValuesFromText(parsed.entry)

    if (parsed.item) {
      const name = itemNameFromRef(parsed.item)
      const quantity = Math.max(1, Number(parsed.quantity || parsed.count || 1) || 1)
      const label = quantity > 1 ? `${quantity} ${name}` : name

      return [label].filter((item) => item && !looksLikeNonEquipmentItem(item))
    }

    if (parsed.special) {
      const label = cleanBuilderCarryoverText(parsed.special)
      return [label].filter((item) => item && !looksLikeNonEquipmentItem(item))
    }

    return []
  }

  let raw = String(parsed || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\{@(?:feat|skill|item|spell|filter|book|action|variantrule|condition|class|race|creature|damage|sense|status)\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/gi, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/^\s*[-*]\s*/gm, '')
    .trim()

  if (!raw) return []

  const equipmentLabel = raw.match(/(?:^|\n)\s*(?:equipment|starting equipment)\s*:\s*/i)
  if (equipmentLabel?.index !== undefined) {
    raw = raw.slice(equipmentLabel.index + equipmentLabel[0].length)
  }

  raw = raw
    .replace(/\(A\)\s*/gi, '')
    .replace(/\(B\).*$/gis, '')
    .replace(/choose\s+a\s+or\s+b\s*:\s*/gi, '')
    .replace(/choose\s+one\s+of\s+the\s+following\s*:\s*/gi, '')
    .replace(/choose\s+one\s+kind\s+of\s+[^,;\n]+/gi, '')
    .replace(/;?\s*or\s+\d+\s+(?:GP|Gold Pieces?)\b.*$/gis, '')

  const hardStop = raw.search(/\n\s*(?:ability scores?|feat|skill proficiencies?|tool proficienc(?:y|ies)|languages?|feature)\s*:/i)
  if (hardStop > 0) {
    raw = raw.slice(0, hardStop)
  }

  const seen = new Set<string>()

  return raw
    .split(/\n|,|;/)
    .map((item) => cleanBuilderCarryoverText(item))
    .map((item) => item.replace(/^and\s+/i, '').trim())
    .map((item) => item.replace(/^equipment\s*:\s*/i, '').trim())
    .filter(Boolean)
    .filter((item) => !looksLikeNonEquipmentItem(item))
    .filter((item) => !/^\d+\s*(?:GP|SP|CP|PP|Gold Pieces?)$/i.test(item))
    .filter((item) => {
      const key = item.toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function backgroundChoiceGroupsFromBlocks(blocks: any[]) {
  const core = blockData(blocks, 'background_core')
  const raw = rawJsonFromBlocks(blocks)
  const out: Record<string, any> = {}

  const skills = choiceValuesFromAny(core.skill_proficiencies || raw.skillProficiencies)
  const tools = choiceValuesFromAny(core.tool_proficiencies || raw.toolProficiencies)
  const languages = choiceValuesFromAny(core.languages || raw.languageProficiencies || raw.languages)
  const feats = backgroundFeatValuesFromRaw(raw)
  const abilities = choiceValuesFromAny(raw.ability || raw.abilityScores || raw.abilityScoreIncrease)

  let equipment = equipmentValuesFromText(core.equipment)

  if (!equipment.length) {
    equipment = equipmentValuesFromText(raw.startingEquipment || raw.equipment)
  }

  if (skills.length) {
    out['background-skills'] = {
      label: 'Background Skills',
      values: skills,
      note: 'Granted by background.'
    }
  }

  if (tools.length) {
    out['background-tools'] = {
      label: 'Background Tools',
      values: tools,
      note: 'Granted by background.'
    }
  }

  if (languages.length) {
    out['background-languages'] = {
      label: 'Background Languages',
      values: languages,
      note: 'Granted by background.'
    }
  }

  if (feats.length) {
    out['background-feat'] = {
      label: 'Background Feat',
      values: feats,
      note: 'Granted by background.'
    }
  }

  if (abilities.length) {
    out['background-abilities'] = {
      label: 'Background Ability Scores',
      values: Array.from(new Set(abilities)),
      note: 'Suggested by background.'
    }
  }

  if (equipment.length) {
    out['background-equipment'] = {
      label: 'Background Equipment',
      values: equipment,
      note: 'Granted by background.'
    }
  }

  return out
}

function mergeChoiceGroups(primary: Record<string, any>, fallback: Record<string, any>) {
  return {
    ...fallback,
    ...primary
  }
}

function featNameForLookup(value: any) {
  const text = cleanBuilderCarryoverText(value)
  if (!text) return ''

  const withoutSource = text.split('|')[0] || text
  const withoutChoice = withoutSource.split(';')[0] || withoutSource
  const withoutParenthetical = withoutChoice.replace(/\([^)]*\)/g, '').trim()

  return titleCase(withoutParenthetical)
}

async function findWorldEntityByTitle(worldId: string, entityType: string, title: string) {
  const cleanTitle = cleanText(title)
  if (!cleanTitle) return null

  async function query(params: URLSearchParams) {
    const res = await dxFetch(`/items/entities?${params.toString()}`).catch(() => null)
    return Array.isArray(res?.data) ? res.data : []
  }

  const exactTyped = new URLSearchParams()
  exactTyped.set('filter[world_id][_eq]', String(worldId))
  exactTyped.set('filter[entity_type][_eq]', entityType)
  exactTyped.set('filter[title][_eq]', cleanTitle)
  exactTyped.set('limit', '1')
  exactTyped.set('fields', 'id,title,entity_type')

  const exactTypedRows = await query(exactTyped)
  if (exactTypedRows[0]?.id) return exactTypedRows[0]

  const exactAny = new URLSearchParams()
  exactAny.set('filter[world_id][_eq]', String(worldId))
  exactAny.set('filter[title][_eq]', cleanTitle)
  exactAny.set('limit', '10')
  exactAny.set('fields', 'id,title,entity_type')

  const exactAnyRows = await query(exactAny)
  const preferredExact = exactAnyRows.find((row: any) =>
    String(row?.entity_type || '').toLowerCase().includes(entityType.toLowerCase())
  ) || exactAnyRows[0]

  if (preferredExact?.id) return preferredExact

  const fuzzy = new URLSearchParams()
  fuzzy.set('filter[world_id][_eq]', String(worldId))
  fuzzy.set('filter[title][_contains]', cleanTitle)
  fuzzy.set('limit', '25')
  fuzzy.set('fields', 'id,title,entity_type')

  const rows = await query(fuzzy)
  const needle = cleanTitle.toLowerCase()

  return rows.find((row: any) =>
    String(row?.entity_type || '').toLowerCase().includes(entityType.toLowerCase()) &&
    cleanText(row?.title).toLowerCase() === needle
  ) ||
    rows.find((row: any) => cleanText(row?.title).toLowerCase() === needle) ||
    rows.find((row: any) =>
      String(row?.entity_type || '').toLowerCase().includes(entityType.toLowerCase()) &&
      cleanText(row?.title).toLowerCase().includes(needle)
    ) ||
    rows.find((row: any) => cleanText(row?.title).toLowerCase().includes(needle)) ||
    null
}

async function featIdsFromChoiceGroups(worldId: string, choiceGroups: Record<string, any>, sourceNeedle: string) {
  const ids: string[] = []
  const seen = new Set<string>()

  for (const [key, rawGroup] of Object.entries(choiceGroups)) {
    const group = asObject(rawGroup)
    const meta = asObject(group.meta)
    const text = `${key} ${group.label || ''} ${group.note || ''} ${meta.choiceType || ''}`.toLowerCase()

    if (!text.includes(sourceNeedle.toLowerCase()) && !text.includes('feat')) continue

    const values = Array.isArray(group.values)
      ? group.values
      : group.value
        ? [group.value]
        : []

    for (const value of values) {
      const directId = integerOrNull(value)
      let id = directId ? String(directId) : ''

      if (!id) {
        const name = featNameForLookup(value)
        const entity = await findWorldEntityByTitle(worldId, 'feat', name)
        id = entity?.id ? String(entity.id) : ''
      }

      if (!id || seen.has(id)) continue

      seen.add(id)
      ids.push(id)
    }
  }

  return ids
}

function normalizeItemLookupText(value: any) {
  return cleanBuilderCarryoverText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function inventoryItemQuantityAndName(value: any) {
  let text = cleanBuilderCarryoverText(value)
    .replace(/\((?:same as above|see above)\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  let quantity = 1

  const leadingQuantity = text.match(/^(\d+)\s+(.+)$/)
  if (leadingQuantity) {
    quantity = Math.max(1, Number(leadingQuantity[1]) || 1)
    text = leadingQuantity[2].trim()
  } else {
    const trailingQuantity = text.match(/^(.+?)\s*(?:x\s*(\d+)|\((\d+)\))$/i)
    if (trailingQuantity) {
      quantity = Math.max(1, Number(trailingQuantity[2] || trailingQuantity[3]) || 1)
      text = trailingQuantity[1].trim()
    }
  }

  text = text
    .replace(/^a\s+/i, '')
    .replace(/^an\s+/i, '')
    .replace(/^one\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    quantity,
    name: titleCase(text)
  }
}

function itemLookupCandidateTitles(value: any) {
  const parsed = inventoryItemQuantityAndName(value)
  const name = parsed.name
  const out = new Set<string>()

  function add(candidate: any) {
    const text = titleCase(candidate)
    if (text && !looksLikeNonEquipmentItem(text)) out.add(text)
  }

  add(name)

  const lower = name.toLowerCase()

  if (lower === 'arrows') add('Arrow')
  if (lower === 'arrow') add('Arrows')
  if (lower === 'crossbow bolts') add('Crossbow Bolt')
  if (lower === 'bolts') add('Crossbow Bolt')

  if (lower === "traveler's clothes" || lower === 'travelers clothes') add("Clothes, Traveler's")
  if (lower === 'common clothes') add('Clothes, Common')
  if (lower === 'fine clothes') add('Clothes, Fine')
  if (lower === 'costume clothes') add('Clothes, Costume')

  return Array.from(out)
}

function itemLookupScore(wanted: any, title: any) {
  const wantedText = normalizeItemLookupText(wanted)
  const titleText = normalizeItemLookupText(title)

  if (!wantedText || !titleText) return 0
  if (wantedText === titleText) return 100

  const wantedTokens = wantedText.split(/\s+/).filter((token) =>
    token.length > 1 && !['the', 'and', 'with', 'set', 'kit'].includes(token)
  )

  if (!wantedTokens.length) return 0

  const matches = wantedTokens.filter((token) => titleText.includes(token)).length
  if (matches !== wantedTokens.length) return 0

  return Math.round((matches / wantedTokens.length) * 80)
}

async function queryWorldItems(worldId: string, params: URLSearchParams) {
  params.set('filter[world_id][_eq]', String(worldId))
  params.set('filter[entity_type][_eq]', 'item')
  params.set('fields', 'id,title,entity_type')
  params.set('limit', params.get('limit') || '25')

  const res = await dxFetch(`/items/entities?${params.toString()}`).catch(() => null)
  return Array.isArray(res?.data) ? res.data : []
}

async function findWorldItemByName(worldId: string, name: string) {
  const candidates = itemLookupCandidateTitles(name)

  for (const candidate of candidates) {
    const exactParams = new URLSearchParams()
    exactParams.set('filter[title][_eq]', candidate)
    exactParams.set('limit', '1')

    const exactRows = await queryWorldItems(worldId, exactParams)
    if (exactRows[0]?.id) return exactRows[0]
  }

  const parsed = inventoryItemQuantityAndName(name)
  const tokens = normalizeItemLookupText(parsed.name)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !['the', 'and', 'with', 'set', 'kit'].includes(token))

  const searchToken = tokens[0]
  if (!searchToken) return null

  const fuzzyParams = new URLSearchParams()
  fuzzyParams.set('filter[title][_contains]', searchToken)
  fuzzyParams.set('limit', '25')

  const rows = await queryWorldItems(worldId, fuzzyParams)

  const ranked = rows
    .map((row: any) => ({
      row,
      score: Math.max(...candidates.map((candidate) => itemLookupScore(candidate, row?.title)))
    }))
    .filter((entry: any) => entry.score > 0)
    .sort((a: any, b: any) => b.score - a.score)

  return ranked[0]?.row || null
}

function toolInventoryItemsFromChoices(classChoices: Record<string, any>, backgroundChoices: Record<string, any>) {
  const items: Array<{ name: string; source: string }> = []

  function collect(groups: Record<string, any>, source: string) {
    for (const [key, rawGroup] of Object.entries(groups)) {
      const group = asObject(rawGroup)
      const text = `${key} ${group.label || ''} ${group.note || ''}`.toLowerCase()

      if (!text.includes('tool') && !text.includes('instrument')) continue

      const values = Array.isArray(group.values)
        ? group.values
        : group.value
          ? [group.value]
          : []

      for (const value of values) {
        const name = titleCase(value)
        if (name && !looksLikeNonEquipmentItem(name)) {
          items.push({ name, source })
        }
      }
    }
  }

  collect(classChoices, 'Class Tools')
  collect(backgroundChoices, 'Background Tools')

  const seen = new Set<string>()

  return items.filter((item) => {
    const key = normalizeItemLookupText(item.name)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function backgroundEquipmentValuesFromChoices(backgroundChoices: Record<string, any>) {
  const out: string[] = []

  for (const [key, rawGroup] of Object.entries(backgroundChoices)) {
    const group = asObject(rawGroup)
    const text = `${key} ${group.label || ''}`.toLowerCase()

    if (!text.includes('equipment')) continue

    const values = Array.isArray(group.values)
      ? group.values
      : group.value
        ? [group.value]
        : []

    out.push(...values.map(cleanBuilderCarryoverText).filter(Boolean))
  }

  const seen = new Set<string>()

  return out
    .filter((item) => !looksLikeNonEquipmentItem(item))
    .filter((item) => !/^\d+\s*(?:GP|SP|CP|PP|Gold Pieces?)$/i.test(item))
    .filter((item) => {
      const key = normalizeItemLookupText(inventoryItemQuantityAndName(item).name)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function classEquipmentValuesFromChoices(classChoices: Record<string, any>) {
  const out: string[] = []

  for (const [key, rawGroup] of Object.entries(classChoices)) {
    const group = asObject(rawGroup)
    const text = `${key} ${group.label || ''}`.toLowerCase()

    if (!text.includes('equipment')) continue
    if (text.includes('currency') || text.includes('coin')) continue

    const values = Array.isArray(group.values)
      ? group.values
      : group.value
        ? [group.value]
        : []

    out.push(...values.map(cleanBuilderCarryoverText).filter(Boolean))
  }

  const seen = new Set<string>()

  return out
    .filter((item) => !looksLikeNonEquipmentItem(item))
    .filter((item) => !/^\d+\s*(?:GP|SP|CP|PP|Gold Pieces?)$/i.test(item))
    .filter((item) => {
      const key = normalizeItemLookupText(inventoryItemQuantityAndName(item).name)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function currencyBagFromText(value: any) {
  const bag = {
    pp: 0,
    gp: 0,
    sp: 0,
    cp: 0
  }

  const text = cleanBuilderCarryoverText(value)
  const matches = Array.from(text.matchAll(/(\d+)\s*(PP|GP|SP|CP|Gold Pieces?|Silver Pieces?|Copper Pieces?|Platinum Pieces?)/gi))

  for (const match of matches) {
    const amount = Math.max(0, Number(match[1] || 0) || 0)
    const unitText = String(match[2] || '').toLowerCase()

    if (!amount) continue

    if (unitText.startsWith('platinum') || unitText === 'pp') bag.pp += amount
    else if (unitText.startsWith('silver') || unitText === 'sp') bag.sp += amount
    else if (unitText.startsWith('copper') || unitText === 'cp') bag.cp += amount
    else bag.gp += amount
  }

  return bag
}

function addCurrencyBags(a: any, b: any) {
  return {
    pp: Math.max(0, Number(a?.pp || 0) || 0) + Math.max(0, Number(b?.pp || 0) || 0),
    gp: Math.max(0, Number(a?.gp || 0) || 0) + Math.max(0, Number(b?.gp || 0) || 0),
    sp: Math.max(0, Number(a?.sp || 0) || 0) + Math.max(0, Number(b?.sp || 0) || 0),
    cp: Math.max(0, Number(a?.cp || 0) || 0) + Math.max(0, Number(b?.cp || 0) || 0)
  }
}

function backgroundCurrencyFromChoices(backgroundChoices: Record<string, any>) {
  let bag = {
    pp: 0,
    gp: 0,
    sp: 0,
    cp: 0
  }

  for (const [key, rawGroup] of Object.entries(backgroundChoices)) {
    const group = asObject(rawGroup)
    const text = `${key} ${group.label || ''}`.toLowerCase()

    if (!text.includes('currency') && !text.includes('coin')) continue

    const values = Array.isArray(group.values)
      ? group.values
      : group.value
        ? [group.value]
        : []

    for (const value of values) {
      bag = addCurrencyBags(bag, currencyBagFromText(value))
    }
  }

  return bag
}

function existingCurrencyFromResources(resources: any) {
  const data = asObject(resources)
  const nested = asObject(data.currency || data.coins || data.coinage)

  return {
    pp: Math.max(0, Number(nested.pp ?? data.pp ?? 0) || 0),
    gp: Math.max(0, Number(nested.gp ?? data.gp ?? 0) || 0),
    sp: Math.max(0, Number(nested.sp ?? data.sp ?? 0) || 0),
    cp: Math.max(0, Number(nested.cp ?? data.cp ?? 0) || 0)
  }
}

function currencyHasAnyValue(currency: any) {
  return Boolean(
    Number(currency?.pp || 0) ||
    Number(currency?.gp || 0) ||
    Number(currency?.sp || 0) ||
    Number(currency?.cp || 0)
  )
}

function mergeBuilderCurrency(resources: any, backgroundCurrency: any) {
  const base = existingCurrencyFromResources(resources)
  return addCurrencyBags(base, backgroundCurrency)
}

async function directusFieldSet(collection: string) {
  try {
    const res = await dxFetch(`/fields/${collection}`)
    const fields = Array.isArray(res?.data) ? res.data : []

    return new Set(fields.map((field: any) => String(field?.field || '')).filter(Boolean))
  } catch {
    return new Set<string>()
  }
}

function onlyKnownFields(payload: Record<string, any>, fields: Set<string>) {
  if (!fields.size) return payload

  const out: Record<string, any> = {}

  for (const [key, value] of Object.entries(payload)) {
    if (fields.has(key)) out[key] = value
  }

  return out
}

async function loadExistingInventoryRows(sheetId: any) {
  try {
    const params = new URLSearchParams()
    params.set('filter[sheet_id][_eq]', String(sheetId))
    params.set('limit', '-1')
    params.set('fields', '*')

    const res = await dxFetch(`/items/character_sheet_inventory?${params.toString()}`)
    return Array.isArray(res?.data) ? res.data : []
  } catch {
    return []
  }
}

function rowInventoryName(row: any) {
  return cleanText(
    row?.custom_name ||
    row?.customName ||
    row?.name ||
    row?.title ||
    row?.label ||
    row?.data?.custom_name ||
    row?.data?.name
  )
}

async function seedInventoryItems(worldId: string, sheetId: any, items: Array<{ name: string; source: string; itemType: string }>) {
  if (!sheetId || !items.length) return

  const fields = await directusFieldSet('character_sheet_inventory')
  const existingRows = await loadExistingInventoryRows(sheetId)
  const existingNames = new Set(existingRows.map(rowInventoryName).filter(Boolean).map((name) => normalizeItemLookupText(name)))

  let sort = 8800

  for (const item of items) {
    const parsed = inventoryItemQuantityAndName(item.name)
    const requestedName = parsed.name

    if (!requestedName || looksLikeNonEquipmentItem(requestedName)) continue

    const linkedItem = await findWorldItemByName(worldId, requestedName)
    const linkedIdRaw = linkedItem?.id
    const linkedIdNumber = Number(linkedIdRaw)
    const linkedId = linkedIdRaw
      ? Number.isFinite(linkedIdNumber) ? linkedIdNumber : String(linkedIdRaw)
      : null

    const name = titleCase(linkedItem?.title || requestedName)
    const existingKey = normalizeItemLookupText(name)

    if (!name || existingNames.has(existingKey) || looksLikeNonEquipmentItem(name)) continue

    const basePayload: Record<string, any> = {
      sheet_id: Number(sheetId),
      sheet: Number(sheetId),
      custom_name: name,
      customName: name,
      name,
      title: name,
      quantity: parsed.quantity,
      equipped: false,
      carried: true,
      item_type: item.itemType,
      itemType: item.itemType,
      source: 'guided_builder',
      source_type: item.source,
      notes: `Added by Guided Builder: ${item.source}`,
      sort,
      data: {
        custom_name: name,
        item_type: item.itemType,
        source: 'guided_builder',
        source_type: item.source,
        linked_item_title: linkedItem?.title || null
      }
    }

    if (linkedId !== null) {
      basePayload.item_entity_id = linkedId
      basePayload.itemEntityId = linkedId
      basePayload.entity_item_id = linkedId
      basePayload.item_id = linkedId
      basePayload.linked_item_entity_id = linkedId
      basePayload.linkedItemId = linkedId
      basePayload.data.item_entity_id = linkedId
    }

    const payload = onlyKnownFields(basePayload, fields)

    if (!payload.sheet_id && fields.has('sheet_id')) payload.sheet_id = Number(sheetId)
    if (!payload.sheet && fields.has('sheet')) payload.sheet = Number(sheetId)

    try {
      await dxFetch('/items/character_sheet_inventory', {
        method: 'POST',
        body: JSON.stringify(payload)
      })

      existingNames.add(existingKey)
      sort += 10
    } catch (error) {
      console.error('[guided-character-builder] failed to seed inventory item', name, error)
    }
  }
}

async function findActiveSheet(worldId: string, entityId: string) {
  const params = new URLSearchParams()
  params.set('filter[world_id][_eq]', String(worldId))
  params.set('filter[entity_id][_eq]', String(entityId))
  params.set('filter[is_active][_eq]', 'true')
  params.set('sort', '-id')
  params.set('limit', '1')
  params.set('fields', '*')

  const res = await dxFetch(`/items/character_sheets?${params.toString()}`)
  return Array.isArray(res?.data) ? (res.data[0] || null) : null
}

async function upsertCharacterCoreSheetLink(entityId: string, sheetId: any) {
  const params = new URLSearchParams()
  params.set('filter[entity_id][_eq]', String(entityId))
  params.set('filter[block_key][_eq]', 'character_core')
  params.set('limit', '1')
  params.set('fields', 'id,data')

  const res = await dxFetch(`/items/block_instances?${params.toString()}`)
  const existing = Array.isArray(res?.data) ? (res.data[0] || null) : null
  const existingData = asObject(existing?.data)

  const data = {
    ...existingData,
    characterType: 'pc',
    linkedSheetId: sheetId,
    playerName: existingData.playerName ?? existingData.player_name ?? null,
    pronouns: existingData.pronouns ?? null,
    publicRole: existingData.publicRole ?? existingData.public_role ?? null
  }

  if (existing?.id) {
    await dxFetch(`/items/block_instances/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data })
    }).catch(() => null)

    return
  }

  await dxFetch('/items/block_instances', {
    method: 'POST',
    body: JSON.stringify({
      entity_id: Number(entityId),
      block_key: 'character_core',
      label: 'Character Core',
      sort: 10,
      repeatable: false,
      data
    })
  }).catch(() => null)
}

async function createOrPatchCharacterSheet(options: {
  worldId: string
  entityId: string
  name: string
  level: number
  className: string
  speciesName: string
  backgroundName: string
  classEntityId: number
  speciesEntityId: number
  backgroundEntityId: number | null
  abilityScores: Record<string, number>
  maxHp: number
  speed: number
  hitDieFaces: number
  speciesChoices: Record<string, any>
  classChoices: Record<string, any>
  backgroundChoices: Record<string, any>
}) {
  const now = new Date().toISOString()
  const speciesFeatIds = await featIdsFromChoiceGroups(options.worldId, options.speciesChoices, 'feat')
  const backgroundFeatIds = await featIdsFromChoiceGroups(options.worldId, options.backgroundChoices, 'feat')
  const existing = await findActiveSheet(options.worldId, options.entityId)
  const existingCombatStats = asObject(existing?.combat_stats)
  const existingChoices = asObject(existing?.choices)
  const existingSpellcasting = asObject(existing?.spellcasting)
  const existingResources = asObject(existing?.resources)
  const backgroundCurrency = addCurrencyBags(backgroundCurrencyFromChoices(options.backgroundChoices), backgroundCurrencyFromChoices(options.classChoices))
  const mergedCurrency = mergeBuilderCurrency(existingResources, backgroundCurrency)

  const payload = {
    world_id: Number(options.worldId),
    entity_id: Number(options.entityId),
    is_active: true,
    name: options.name,
    level: options.level,
    class_name: options.className,
    subclass_name: existing?.subclass_name || '',
    species_name: options.speciesName,
    background_name: options.backgroundName,
    class_entity_id: options.classEntityId,
    species_entity_id: options.speciesEntityId,
    background_entity_id: options.backgroundEntityId,
    ability_scores: options.abilityScores,
    combat_stats: {
      ...existingCombatStats,
      armorClass: existingCombatStats.armorClass || '',
      maxHp: String(options.maxHp),
      currentHp: String(options.maxHp),
      tempHp: String(existingCombatStats.tempHp || '0'),
      initiative: existingCombatStats.initiative || '',
      speed: String(options.speed),
      hitDice: `d${options.hitDieFaces}`
    },
    spellcasting: {
      ...existingSpellcasting,
      knownSpellIds: Array.isArray(existingSpellcasting.knownSpellIds) ? existingSpellcasting.knownSpellIds : [],
      preparedSpellIds: Array.isArray(existingSpellcasting.preparedSpellIds) ? existingSpellcasting.preparedSpellIds : [],
      alwaysPreparedSpellIds: Array.isArray(existingSpellcasting.alwaysPreparedSpellIds) ? existingSpellcasting.alwaysPreparedSpellIds : [],
      usedSlots: asObject(existingSpellcasting.usedSlots)
    },
    resources: {
      ...existingResources,
      currency: mergedCurrency,
      coins: mergedCurrency,
      coinage: mergedCurrency,
      pp: mergedCurrency.pp,
      gp: mergedCurrency.gp,
      sp: mergedCurrency.sp,
      cp: mergedCurrency.cp,
      builderBackgroundCurrency: currencyHasAnyValue(backgroundCurrency)
        ? backgroundCurrency
        : asObject(existingResources.builderBackgroundCurrency)
    },
    choices: {
      ...existingChoices,
      builderSpeciesChoices: options.speciesChoices,
      ...(speciesFeatIds.length ? {
        builderSpeciesFeat: {
          type: 'feat',
          label: 'Species Feat',
          selected: speciesFeatIds
        }
      } : {}),
      builderClassChoices: options.classChoices,
      builderBackgroundChoices: options.backgroundChoices,
      ...(backgroundFeatIds.length ? {
        builderBackgroundFeat: {
          type: 'feat',
          label: 'Background Feat',
          selected: backgroundFeatIds
        }
      } : {})
    },
    updated_at: now
  }

  const savedSheet = existing?.id
    ? (await dxFetch(`/items/character_sheets/${existing.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }))?.data || { ...existing, ...payload }
    : (await dxFetch('/items/character_sheets', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          created_at: now
        })
      }))?.data

  if (!savedSheet?.id) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Character sheet was not created correctly'
    })
  }

  await upsertCharacterCoreSheetLink(options.entityId, savedSheet.id)

  const toolItems = toolInventoryItemsFromChoices(options.classChoices, options.backgroundChoices)
    .map((item) => ({
      name: item.name,
      source: item.source,
      itemType: 'Tool'
    }))

  const equipmentItems = [...classEquipmentValuesFromChoices(options.classChoices), ...backgroundEquipmentValuesFromChoices(options.backgroundChoices)]
    .map((name) => ({
      name,
      source: 'Background Equipment',
      itemType: 'Gear'
    }))

  await seedInventoryItems(options.worldId, savedSheet.id, [...toolItems, ...equipmentItems])

  return savedSheet
}

export default defineEventHandler(async (event) => {
  try {
    const worldId = String(getRouterParam(event, 'id') || '')
    const body = await readBody(event)

    if (!worldId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing world id'
      })
    }

    const name = cleanText(body?.name || body?.title)

    if (!name) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Character name is required'
      })
    }

    const principal = event.context.principal ?? null
    if (!principal) {
      throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
    }
    // The guided builder always creates a PC (entity_type: 'pc' below).
    requireCapability(principal, 'world.character.create', { kind: 'world', worldId })

    const level = Math.min(20, Math.max(1, Number(body?.level || 1)))
    const classEntityId = integerOrNull(body?.classEntityId)
    const speciesEntityId = integerOrNull(body?.speciesEntityId)
    const backgroundEntityId = integerOrNull(body?.backgroundEntityId)
    const abilityScores = normalizeAbilityScores(body?.abilityScores)
    const speciesChoices = normalizeSpeciesChoices(body?.speciesChoices)
    const classChoices = normalizeClassChoices(body?.classChoices)
    let backgroundChoices = normalizeBackgroundChoices(body?.backgroundChoices)

    if (!classEntityId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Choose a class before creating this character'
      })
    }

    if (!speciesEntityId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Choose a species before creating this character'
      })
    }

    const [
      className,
      speciesName,
      backgroundName,
      classBlocks,
      speciesBlocks,
      backgroundBlocks
    ] = await Promise.all([
      linkedEntityTitle(classEntityId),
      linkedEntityTitle(speciesEntityId),
      linkedEntityTitle(backgroundEntityId),
      linkedEntityBlocks(classEntityId),
      linkedEntityBlocks(speciesEntityId),
      linkedEntityBlocks(backgroundEntityId)
    ])

    backgroundChoices = mergeChoiceGroups(backgroundChoices, backgroundChoiceGroupsFromBlocks(backgroundBlocks))

    const hitDieFaces = parseHitDieFaces(classBlocks)
    const maxHp = startingHp(level, hitDieFaces, abilityScores.con)
    const speed = parseSpeciesSpeed(speciesBlocks)
    const now = new Date().toISOString()
    const slug = `${slugify(name)}-${Date.now().toString(36)}`

    const created = await dxFetch('/items/entities', {
      method: 'POST',
      body: JSON.stringify({
        title: name,
        slug,
        world_id: Number(worldId),
        system_key: 'dnd5e',
        entity_type: 'pc',
        status: 'draft',
        visibility: 'world',
        summary: cleanText(body?.summary || `${speciesName || 'Adventurer'}${className ? ` • ${className}` : ''}`),
        created_at: now,
        updated_at: now
      })
    })

    const entity = created?.data

    if (!entity?.id) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Character entity was not created correctly'
      })
    }

    const characterSheet = await createOrPatchCharacterSheet({
      worldId,
      entityId: String(entity.id),
      name,
      level,
      className,
      speciesName,
      backgroundName,
      classEntityId,
      speciesEntityId,
      backgroundEntityId,
      abilityScores,
      maxHp,
      speed,
      hitDieFaces,
      speciesChoices,
      classChoices,
      backgroundChoices
    })

    return {
      ok: true,
      id: entity.id,
      entity,
      sheet: characterSheet
    }
  } catch (error: any) {
    console.error('[guided-character-builder]', error)

    throw createError({
      statusCode: error?.statusCode || error?.response?.status || 500,
      statusMessage:
        error?.statusMessage ||
        error?.data?.message ||
        error?.message ||
        'Guided character builder failed'
    })
  }
})
