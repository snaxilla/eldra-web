function plainObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function numberOrNull(value: any) {
  if (value === null || value === undefined || value === '') return null

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null

  return parsed
}

function integerOrNull(value: any) {
  const parsed = numberOrNull(value)
  return parsed === null ? null : Math.floor(parsed)
}

function positiveIntegerOrNull(value: any) {
  const parsed = integerOrNull(value)
  if (parsed === null || parsed <= 0) return null
  return parsed
}

function nonZeroTextOrNull(value: any) {
  const text = String(value ?? '').trim()
  if (!text || text === '0') return null
  return text
}

function abilityModifier(score: any) {
  const parsed = numberOrNull(score)
  if (parsed === null) return 0

  return Math.floor((parsed - 10) / 2)
}

function signed(value: any) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '—'
  return `${parsed >= 0 ? '+' : ''}${parsed}`
}

function proficiencyBonusForLevel(level: any) {
  const parsed = Math.max(1, Math.min(20, integerOrNull(level) || 1))
  return Math.min(6, Math.max(2, Math.ceil(parsed / 4) + 1))
}

const ABILITIES = [
  { key: 'str', label: 'Strength' },
  { key: 'dex', label: 'Dexterity' },
  { key: 'con', label: 'Constitution' },
  { key: 'int', label: 'Intelligence' },
  { key: 'wis', label: 'Wisdom' },
  { key: 'cha', label: 'Charisma' }
]

const SAVE_ALIASES: Record<string, string> = {
  str: 'str',
  strength: 'str',
  dex: 'dex',
  dexterity: 'dex',
  con: 'con',
  constitution: 'con',
  int: 'int',
  intelligence: 'int',
  wis: 'wis',
  wisdom: 'wis',
  cha: 'cha',
  charisma: 'cha'
}

const SKILLS = [
  { key: 'acrobatics', label: 'Acrobatics', ability: 'dex' },
  { key: 'animal handling', label: 'Animal Handling', ability: 'wis' },
  { key: 'arcana', label: 'Arcana', ability: 'int' },
  { key: 'athletics', label: 'Athletics', ability: 'str' },
  { key: 'deception', label: 'Deception', ability: 'cha' },
  { key: 'history', label: 'History', ability: 'int' },
  { key: 'insight', label: 'Insight', ability: 'wis' },
  { key: 'intimidation', label: 'Intimidation', ability: 'cha' },
  { key: 'investigation', label: 'Investigation', ability: 'int' },
  { key: 'medicine', label: 'Medicine', ability: 'wis' },
  { key: 'nature', label: 'Nature', ability: 'int' },
  { key: 'perception', label: 'Perception', ability: 'wis' },
  { key: 'performance', label: 'Performance', ability: 'cha' },
  { key: 'persuasion', label: 'Persuasion', ability: 'cha' },
  { key: 'religion', label: 'Religion', ability: 'int' },
  { key: 'sleight of hand', label: 'Sleight of Hand', ability: 'dex' },
  { key: 'stealth', label: 'Stealth', ability: 'dex' },
  { key: 'survival', label: 'Survival', ability: 'wis' }
]

function normalizeToken(value: any) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function builderClassChoiceGroups(sheet: any) {
  const choices = plainObject(sheet?.choices)
  return plainObject(choices.builderClassChoices ?? choices.builder_class_choices)
}

function builderClassSkillChoiceSet(sheet: any) {
  const groups = builderClassChoiceGroups(sheet)
  const selected = new Set<string>()

  for (const [key, rawGroup] of Object.entries(groups) as any[]) {
    const group = plainObject(rawGroup)
    const groupText = normalizeToken(`${key} ${group.label || ''}`)

    if (!groupText.includes('skill')) continue

    const values = Array.isArray(group.values)
      ? group.values
      : Array.isArray(group.selected)
        ? group.selected
        : []

    for (const value of values) {
      const token = normalizeToken(value)
      if (token) selected.add(token)
    }
  }

  return selected
}

function builderClassSkillChoiceMatches(selected: Set<string>, skill: any) {
  const candidates = [
    skill?.key,
    skill?.label,
    skill?.name,
    skill?.slug
  ]

  return candidates.some((candidate) => {
    const token = normalizeToken(candidate)
    return Boolean(token && selected.has(token))
  })
}

function builderBackgroundChoiceGroups(sheet: any) {
  const choices = plainObject(sheet?.choices)
  return plainObject(choices.builderBackgroundChoices ?? choices.builder_background_choices)
}

function builderBackgroundSkillChoiceSet(sheet: any) {
  const groups = builderBackgroundChoiceGroups(sheet)
  const selected = new Set<string>()

  for (const [key, rawGroup] of Object.entries(groups) as any[]) {
    const group = plainObject(rawGroup)
    const groupText = normalizeToken(`${key} ${group.label || ''}`)

    if (!groupText.includes('skill')) continue

    const values = Array.isArray(group.values)
      ? group.values
      : Array.isArray(group.selected)
        ? group.selected
        : group.value
          ? [group.value]
          : []

    for (const value of values) {
      const token = normalizeToken(value)
      if (token) selected.add(token)
    }
  }

  return selected
}

function builderClassSkillChoiceValues(sheet: any) {
  return Array.from(builderClassSkillChoiceSet(sheet))
}

function pendingChoiceLooksLikeClassSkillChoice(sheet: any, choice: any) {
  if (normalizeToken(choice?.type) !== 'skill') return false

  const className = normalizeToken(sheet?.class_name ?? sheet?.className)
  const text = normalizeToken([
    choice?.sourceKey,
    choice?.source_key,
    choice?.label,
    choice?.category,
    choice?.sourceType,
    choice?.source_type
  ].filter(Boolean).join(' '))

  if (!text.includes('skill')) return false
  if (text.includes('species') || text.includes('background') || text.includes('feat')) return false
  if (text.includes('class')) return true
  if (className && text.includes(className)) return true

  return false
}

function applyBuilderClassChoicesToPendingChoices(sheet: any, pendingChoices: any[]) {
  if (!Array.isArray(pendingChoices) || !pendingChoices.length) return pendingChoices

  const selectedSkills = builderClassSkillChoiceValues(sheet)
  if (!selectedSkills.length) return pendingChoices

  return pendingChoices.map((choice: any) => {
    if (!pendingChoiceLooksLikeClassSkillChoice(sheet, choice)) return choice

    const count = Math.max(1, Number(choice?.count || choice?.slots || selectedSkills.length || 1))
    const existing = Array.isArray(choice?.selected) ? choice.selected : []
    const merged = Array.from(new Set([...existing, ...selectedSkills])).slice(0, count)
    const remaining = Math.max(0, count - merged.length)

    return {
      ...choice,
      selected: merged,
      remaining,
      complete: remaining === 0
    }
  })
}

function splitTokens(value: any): string[] {
  if (!value) return []

  if (Array.isArray(value)) {
    return value.flatMap(splitTokens)
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, entryValue]) => entryValue === true || typeof entryValue === 'number' || typeof entryValue === 'string')
      .map(([key]) => normalizeToken(key))
      .filter(Boolean)
  }

  return String(value)
    .split(/[,;\n]/g)
    .map(normalizeToken)
    .filter(Boolean)
}

function addTokens(target: Set<string>, value: any, aliases: Record<string, string> = {}) {
  for (const token of splitTokens(value)) {
    target.add(aliases[token] || token)
  }
}

function abilityScoresForSheet(sheet: any) {
  const source = plainObject(sheet?.ability_scores)

  return {
    str: integerOrNull(source.str) ?? 10,
    dex: integerOrNull(source.dex) ?? 10,
    con: integerOrNull(source.con) ?? 10,
    int: integerOrNull(source.int) ?? 10,
    wis: integerOrNull(source.wis) ?? 10,
    cha: integerOrNull(source.cha) ?? 10
  }
}

function collectProficiencies(sheet: any, resolved: any) {
  const saveProfs = new Set<string>()
  const skillProfs = new Set<string>()
  const proficiencies = plainObject(sheet?.proficiencies)
  const choices = plainObject(sheet?.choices)

  addTokens(saveProfs, resolved?.class?.savingThrows, SAVE_ALIASES)
  addTokens(saveProfs, proficiencies.savingThrows || proficiencies.saves, SAVE_ALIASES)
  addTokens(saveProfs, proficiencies.class?.savingThrows || proficiencies.class?.saves, SAVE_ALIASES)

  addTokens(skillProfs, resolved?.background?.skillProficiencies)
  addTokens(skillProfs, proficiencies.skills)
  addTokens(skillProfs, proficiencies.background?.skills)

  for (const choiceValue of Object.values(choices)) {
    const choice = plainObject(choiceValue)
    if (choice.type === 'skill') {
      addTokens(skillProfs, choice.selected)
    }
  }

  return {
    saveProfs,
    skillProfs
  }
}

function buildAbilityRows(scores: Record<string, number>) {
  return ABILITIES.map((ability) => {
    const score = scores[ability.key]
    const modifier = abilityModifier(score)

    return {
      key: ability.key,
      label: ability.label,
      shortLabel: ability.key.toUpperCase(),
      score,
      modifier,
      modifierText: signed(modifier)
    }
  })
}

function buildSaveRows(scores: Record<string, number>, saveProfs: Set<string>, proficiencyBonus: number) {
  return ABILITIES.map((ability) => {
    const modifier = abilityModifier(scores[ability.key])
    const proficient = saveProfs.has(ability.key)
    const total = modifier + (proficient ? proficiencyBonus : 0)

    return {
      key: ability.key,
      label: ability.label,
      shortLabel: ability.key.toUpperCase(),
      modifier,
      proficient,
      total,
      totalText: signed(total)
    }
  })
}

function buildSkillRows(sheet: any, scores: Record<string, number>, skillProfs: Set<string>, proficiencyBonus: number) {
  const builderClassSkillChoices = builderClassSkillChoiceSet(sheet)
  const builderBackgroundSkillChoices = builderBackgroundSkillChoiceSet(sheet)
  return SKILLS.map((skill) => {
    const modifier = abilityModifier(scores[skill.ability])
    const proficient = builderClassSkillChoiceMatches(builderBackgroundSkillChoices, skill) || builderClassSkillChoiceMatches(builderClassSkillChoices, skill) || skillProfs.has(skill.key)
    const total = modifier + (proficient ? proficiencyBonus : 0)

    return {
      ...skill,
      abilityLabel: skill.ability.toUpperCase(),
      modifier,
      proficient,
      total,
      totalText: signed(total)
    }
  })
}

function inventoryItemCore(row: any) {
  return plainObject(row?.item_core ?? row?.itemCore)
}

function inventoryItemRaw(row: any) {
  return plainObject(row?.item_raw_json ?? row?.itemRawJson)
}

function inventoryItemTypeCode(row: any) {
  const core = inventoryItemCore(row)
  const raw = inventoryItemRaw(row)
  const type = String(
    row?.item_type ??
    row?.itemType ??
    core?.item_type ??
    core?.itemType ??
    raw?.type ??
    ''
  ).trim()

  return type.split('|')[0].trim().toUpperCase()
}

function inventoryItemName(row: any) {
  return String(
    row?.name ||
    row?.linked_item?.title ||
    row?.linkedItem?.title ||
    inventoryItemCore(row)?.name ||
    'Item'
  )
}

function inventoryItemArmorClass(row: any) {
  const core = inventoryItemCore(row)
  const raw = inventoryItemRaw(row)

  const value = row?.armor_class ??
    row?.armorClass ??
    core?.armor_class ??
    core?.armorClass ??
    raw?.ac ??
    raw?.armorClass

  if (Array.isArray(value) && value.length) {
    const first = value[0]
    if (typeof first === 'number') return first
    if (first && typeof first === 'object' && typeof first.ac === 'number') return first.ac
  }

  const parsed = positiveIntegerOrNull(value)
  return parsed
}

function equippedInventoryItems(inventory: any[]) {
  return (Array.isArray(inventory) ? inventory : []).filter((row: any) =>
    row?.equipped === true ||
    row?.equipped === 'true' ||
    row?.equipped === 1 ||
    row?.equipped === '1'
  )
}

function isShieldInventoryItem(row: any) {
  return inventoryItemTypeCode(row) === 'S'
}

function isArmorInventoryItem(row: any) {
  return ['LA', 'MA', 'HA'].includes(inventoryItemTypeCode(row))
}

function armorCandidateValue(baseAc: number, dexMod: number, shieldBonus: number, armorType: string) {
  if (armorType === 'LA') return baseAc + dexMod + shieldBonus
  if (armorType === 'MA') return baseAc + Math.min(dexMod, 2) + shieldBonus
  if (armorType === 'HA') return baseAc + shieldBonus
  return baseAc + shieldBonus
}

function armorCandidateNote(baseAc: number, dexMod: number, shieldBonus: number, armorType: string, shieldNames: string[]) {
  const shieldText = shieldBonus
    ? ` + ${shieldBonus} shield bonus${shieldNames.length ? ` (${shieldNames.join(', ')})` : ''}`
    : ''

  if (armorType === 'LA') return `${baseAc} + DEX modifier (${signed(dexMod)})${shieldText}.`
  if (armorType === 'MA') return `${baseAc} + DEX modifier max 2 (${signed(Math.min(dexMod, 2))})${shieldText}.`
  if (armorType === 'HA') return `${baseAc}${shieldText}.`

  return `${baseAc}${shieldText}.`
}

function buildArmorClassCandidates(sheet: any, scores: Record<string, number>, resolved: any, inventory: any[] = []) {
  const combatStats = plainObject(sheet?.combat_stats)
  const dexMod = abilityModifier(scores.dex)
  const conMod = abilityModifier(scores.con)
  const wisMod = abilityModifier(scores.wis)
  const candidates: Array<{ label: string; value: number; note: string; active?: boolean }> = []

  const equippedItems = equippedInventoryItems(inventory)
  const shields = equippedItems.filter(isShieldInventoryItem)
  const shieldBonus = shields.reduce((total: number, shield: any) => total + (inventoryItemArmorClass(shield) || 2), 0)
  const shieldNames = shields.map(inventoryItemName).filter(Boolean)

  const shieldNote = shieldBonus
    ? ` + ${shieldBonus} shield bonus${shieldNames.length ? ` (${shieldNames.join(', ')})` : ''}`
    : ''

  const manualAc = positiveIntegerOrNull(combatStats.armorClass ?? combatStats.armor_class)
  if (manualAc !== null) {
    candidates.push({
      label: 'Sheet Armor Class',
      value: manualAc,
      note: 'Saved on the character sheet.'
    })
  }

  candidates.push({
    label: shieldBonus ? 'Unarmored + Shield' : 'Unarmored Base',
    value: 10 + dexMod + shieldBonus,
    note: `10 + DEX modifier (${signed(dexMod)})${shieldNote}.`
  })

  if (normalizeToken(resolved?.class?.title) === 'barbarian') {
    candidates.push({
      label: shieldBonus ? 'Barbarian Unarmored Defense + Shield' : 'Barbarian Unarmored Defense',
      value: 10 + dexMod + conMod + shieldBonus,
      note: `10 + DEX modifier (${signed(dexMod)}) + CON modifier (${signed(conMod)})${shieldNote}.`
    })
  }

  if (normalizeToken(resolved?.class?.title) === 'monk') {
    candidates.push({
      label: shieldBonus ? 'Monk Unarmored Defense + Shield' : 'Monk Unarmored Defense',
      value: 10 + dexMod + wisMod + shieldBonus,
      note: `10 + DEX modifier (${signed(dexMod)}) + WIS modifier (${signed(wisMod)})${shieldNote}.`
    })
  }

  for (const armor of equippedItems.filter(isArmorInventoryItem)) {
    const baseAc = inventoryItemArmorClass(armor)
    if (!baseAc) continue

    const armorType = inventoryItemTypeCode(armor)
    const name = inventoryItemName(armor)
    const value = armorCandidateValue(baseAc, dexMod, shieldBonus, armorType)

    candidates.push({
      label: name,
      value,
      note: armorCandidateNote(baseAc, dexMod, shieldBonus, armorType, shieldNames)
    })
  }

  const best = candidates.reduce((currentBest, candidate) => {
    if (!currentBest || candidate.value > currentBest.value) return candidate
    return currentBest
  }, null as null | { label: string; value: number; note: string; active?: boolean })

  if (manualAc === null && best) {
    best.active = true
  }

  for (const candidate of candidates) {
    candidate.active = false
  }

  if (best) best.active = true

  return {
    current: best?.value ?? manualAc,
    best,
    candidates
  }
}

function parseHitDieFaces(value: any) {
  if (!value) return null

  if (typeof value === 'object') {
    const faces = integerOrNull(value.faces)
    return faces && faces > 0 ? faces : null
  }

  const text = String(value || '').trim().toLowerCase()
  const match = text.match(/d(\d+)/)

  if (!match) return null

  const faces = Number(match[1])
  return Number.isFinite(faces) && faces > 0 ? faces : null
}

function fixedAverageHitDieValue(faces: number) {
  const averages: Record<number, number> = {
    4: 3,
    6: 4,
    8: 5,
    10: 6,
    12: 7
  }

  return averages[faces] || Math.floor(faces / 2) + 1
}

function calculatedMaxHpForSheet(level: any, hitDie: any, conModifier: number) {
  const parsedLevel = Math.max(1, integerOrNull(level) || 1)
  const faces = parseHitDieFaces(hitDie)

  if (!faces) return null

  const firstLevelHp = Math.max(1, faces + conModifier)
  const laterLevelHp = Math.max(1, fixedAverageHitDieValue(faces) + conModifier)

  return firstLevelHp + Math.max(0, parsedLevel - 1) * laterLevelHp
}

function buildHitPoints(sheet: any, level: number, scores: Record<string, number>, resolved: any) {
  const combatStats = plainObject(sheet?.combat_stats)
  const conModifier = abilityModifier(scores.con)
  const calculatedMax = calculatedMaxHpForSheet(level, resolved?.class?.hitDie, conModifier)
  const manualMax = positiveIntegerOrNull(combatStats.maxHp ?? combatStats.max_hp)
  const max = calculatedMax ?? manualMax
  const rawCurrent = integerOrNull(combatStats.currentHp ?? combatStats.current_hp)
  const temp = Math.max(0, integerOrNull(combatStats.tempHp ?? combatStats.temp_hp) ?? 0)

  let current = rawCurrent ?? max ?? null

  if (current !== null && max !== null) {
    current = Math.max(0, Math.min(current, max))
  }

  return {
    current,
    max,
    temp,
    calculatedMax,
    manualMax,
    conModifier,
    hitDie: resolved?.class?.hitDie || null
  }
}

function defaultSkillOptions() {
  return SKILLS.map((skill) => skill.key)
}

function savedChoiceFor(choices: any, sourceKey: string) {
  const saved = plainObject(choices?.[sourceKey])
  const type = normalizeToken(saved.type)
  const selected = Array.isArray(saved.selected)
    ? saved.selected
        .map((value: any) => type === 'feat' || type === 'spell' ? String(value || '').trim() : normalizeToken(value))
        .filter(Boolean)
    : []

  return {
    ...saved,
    selected
  }
}

function choiceRow(args: {
  choices: any
  sourceKey: string
  sourceType: string
  sourceName: string
  type: string
  label: string
  count: number
  options?: string[]
  category?: string | null
}) {
  const saved = savedChoiceFor(args.choices, args.sourceKey)
  const selected = saved.selected || []
  const count = Number(args.count || 1)
  const remaining = Math.max(0, count - selected.length)

  return {
    sourceKey: args.sourceKey,
    sourceType: args.sourceType,
    sourceName: args.sourceName,
    type: args.type,
    label: args.label,
    count,
    selected,
    remaining,
    complete: remaining === 0,
    options: Array.isArray(args.options) ? args.options : [],
    category: args.category || null
  }
}

function buildPendingChoices(sheet: any, resolved: any) {
  const choices = plainObject(sheet?.choices)
  const rows: any[] = []

  for (const choice of Array.isArray(resolved?.class?.skillChoices) ? resolved.class.skillChoices : []) {
    const count = Number(choice.count || 1)
    rows.push(choiceRow({
      choices,
      sourceKey: `class-skill:${resolved.class.id}`,
      sourceType: 'class',
      sourceName: resolved.class.title,
      type: 'skill',
      label: `${resolved.class.title}: choose ${count} skill${count === 1 ? '' : 's'}`,
      count,
      options: Array.isArray(choice.options) && choice.options.length ? choice.options.map(normalizeToken) : defaultSkillOptions()
    }))
  }

  for (const choice of Array.isArray(resolved?.species?.skillChoices) ? resolved.species.skillChoices : []) {
    const count = Number(choice.count || 1)
    rows.push(choiceRow({
      choices,
      sourceKey: `species-skill:${resolved.species.id}`,
      sourceType: 'species',
      sourceName: resolved.species.title,
      type: 'skill',
      label: `${resolved.species.title}: choose ${count} skill${count === 1 ? '' : 's'}`,
      count,
      options: Array.isArray(choice.options) && choice.options.length ? choice.options.map(normalizeToken) : defaultSkillOptions()
    }))
  }

  for (const choice of Array.isArray(resolved?.species?.featChoices) ? resolved.species.featChoices : []) {
    const count = Number(choice.count || 1)
    rows.push(choiceRow({
      choices,
      sourceKey: `species-feat:${resolved.species.id}`,
      sourceType: 'species',
      sourceName: resolved.species.title,
      type: 'feat',
      label: `${resolved.species.title}: choose ${count} feat${count === 1 ? '' : 's'}`,
      count,
      options: Array.isArray(choice.options) ? choice.options : [],
      category: choice.category || null
    }))
  }



    for (const feat of Array.isArray(resolved?.feats) ? resolved.feats : []) {
      const spellListOptions = Array.isArray(feat?.spellListOptions)
        ? feat.spellListOptions.map(normalizeToken).filter(Boolean)
        : []
      const abilityOptions = Array.isArray(feat?.spellAbilityOptions)
        ? feat.spellAbilityOptions.map(normalizeToken).filter(Boolean)
        : []

      const spellListSourceKey = `feat-spell-list:${feat.id}`
      const selectedSpellList = spellListOptions.length === 1
        ? spellListOptions[0]
        : savedChoiceFor(choices, spellListSourceKey).selected?.[0] || ''

      if (spellListOptions.length > 1) {
        rows.push(choiceRow({
          choices,
          sourceKey: spellListSourceKey,
          sourceType: 'feat',
          sourceName: feat.title,
          type: 'spell-list',
          label: `${feat.title}: choose spell list`,
          count: 1,
          options: spellListOptions
        }))
      }

      if (abilityOptions.length > 1) {
        rows.push(choiceRow({
          choices,
          sourceKey: `feat-spell-ability:${feat.id}`,
          sourceType: 'feat',
          sourceName: feat.title,
          type: 'ability',
          label: `${feat.title}: choose spellcasting ability`,
          count: 1,
          options: abilityOptions
        }))
      }

      for (const [index, choice] of (Array.isArray(feat?.spellChoices) ? feat.spellChoices : []).entries()) {
        const requiredLists = Array.isArray(choice.requiresList)
          ? choice.requiresList.map(normalizeToken).filter(Boolean)
          : []

        if (spellListOptions.length > 1 && requiredLists.length && !selectedSpellList) {
          continue
        }

        if (selectedSpellList && requiredLists.length && !requiredLists.includes(selectedSpellList)) {
          continue
        }

        const count = Number(choice.count || 1)
        const filterNote = choice.filter ? ` (${choice.filter})` : ''

        rows.push(choiceRow({
          choices,
          sourceKey: `feat-spell:${feat.id}:${index}`,
          sourceType: 'feat',
          sourceName: feat.title,
          type: 'spell',
          label: `${feat.title}: choose ${count} spell${count === 1 ? '' : 's'}${filterNote}`,
          count,
          options: [],
          category: choice.filter || null
        }))
      }
    }

  return rows
}

const FULL_CASTER_SPELL_SLOTS: Record<number, number[]> = {
  1: [2],
  2: [3],
  3: [4, 2],
  4: [4, 3],
  5: [4, 3, 2],
  6: [4, 3, 3],
  7: [4, 3, 3, 1],
  8: [4, 3, 3, 2],
  9: [4, 3, 3, 3, 1],
  10: [4, 3, 3, 3, 2],
  11: [4, 3, 3, 3, 2, 1],
  12: [4, 3, 3, 3, 2, 1],
  13: [4, 3, 3, 3, 2, 1, 1],
  14: [4, 3, 3, 3, 2, 1, 1],
  15: [4, 3, 3, 3, 2, 1, 1, 1],
  16: [4, 3, 3, 3, 2, 1, 1, 1],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
  20: [4, 3, 3, 3, 3, 2, 2, 1, 1]
}

const FULL_CASTER_CLASS_KEYS = new Set([
  'bard',
  'cleric',
  'druid',
  'sorcerer',
  'wizard'
])

const HALF_CASTER_CLASS_KEYS = new Set([
  'artificer',
  'paladin',
  'ranger'
])

function classCasterProgression(value: any) {
  const key = normalizeToken(value)

  if (FULL_CASTER_CLASS_KEYS.has(key)) return 'full'
  if (HALF_CASTER_CLASS_KEYS.has(key)) return 'half'

  return 'none'
}

function effectiveCasterLevel(level: number, className: any) {
  const progression = classCasterProgression(className)
  const classKey = normalizeToken(className)

  if (progression === 'full') return level

  if (progression === 'half') {
    if ((classKey === 'paladin' || classKey === 'ranger') && level < 2) return 0
    return Math.max(1, Math.ceil(level / 2))
  }

  return 0
}

function usedSpellSlotsForSheet(sheet: any) {
  const spellcasting = plainObject(sheet?.spellcasting)
  const usedSlots = plainObject(spellcasting.usedSlots ?? spellcasting.used_slots)

  const normalized: Record<string, number> = {}

  for (const [level, used] of Object.entries(usedSlots)) {
    const parsedLevel = integerOrNull(level)
    const parsedUsed = integerOrNull(used)

    if (!parsedLevel || parsedLevel < 1 || parsedLevel > 9) continue
    normalized[String(parsedLevel)] = Math.max(0, parsedUsed ?? 0)
  }

  return normalized
}

function buildSpellSlotRows(sheet: any, level: number, resolved: any) {
  const className = resolved?.class?.title || sheet?.class_name || ''
  const casterLevel = effectiveCasterLevel(level, className)

  if (!casterLevel) return []

  const slotTable = FULL_CASTER_SPELL_SLOTS[Math.max(1, Math.min(20, casterLevel))]
  if (!slotTable) return []

  const usedSlots = usedSpellSlotsForSheet(sheet)

  return slotTable
    .map((max, index) => {
      const slotLevel = index + 1
      const used = Math.max(0, Math.min(Number(max || 0), Number(usedSlots[String(slotLevel)] || 0)))

      return {
        level: slotLevel,
        max: Number(max || 0),
        used,
        available: Math.max(0, Number(max || 0) - used)
      }
    })
    .filter((row) => row.max > 0)
}

export function computeCharacterSheetMath(sheet: any, resolved: any = {}, inventory: any[] = []) {
  const level = integerOrNull(sheet?.level) ?? 1
  const proficiencyBonus = proficiencyBonusForLevel(level)
  const scores = abilityScoresForSheet(sheet)
  const { saveProfs, skillProfs } = collectProficiencies(sheet, resolved)
  const combatStats = plainObject(sheet?.combat_stats)

  const dexMod = abilityModifier(scores.dex)
  const savedInitiative = integerOrNull(combatStats.initiative)
  const initiative = savedInitiative === null || savedInitiative === 0 ? dexMod : savedInitiative
  const speed = nonZeroTextOrNull(combatStats.speed) || resolved?.species?.speed || null
  const hitDice = nonZeroTextOrNull(combatStats.hitDice || combatStats.hit_dice) || resolved?.class?.hitDie || null
  const hitPoints = buildHitPoints(sheet, level, scores, resolved)
  const spellSlots = buildSpellSlotRows(sheet, level, resolved)

  return {
    level,
    proficiencyBonus,
    proficiencyBonusText: signed(proficiencyBonus),
    abilities: buildAbilityRows(scores),
    saves: buildSaveRows(scores, saveProfs, proficiencyBonus),
    skills: buildSkillRows(sheet, scores, skillProfs, proficiencyBonus),
    combat: {
      initiative,
      initiativeText: signed(initiative),
      speed,
      hitDice,
      hitPoints,
      armorClass: buildArmorClassCandidates(sheet, scores, resolved, inventory)
    },
      spellcasting: {
        slots: spellSlots
      },
    pendingChoices: buildPendingChoices(sheet, resolved)
  }
}
