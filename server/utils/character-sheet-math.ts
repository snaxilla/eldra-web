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

function buildSkillRows(scores: Record<string, number>, skillProfs: Set<string>, proficiencyBonus: number) {
  return SKILLS.map((skill) => {
    const modifier = abilityModifier(scores[skill.ability])
    const proficient = skillProfs.has(skill.key)
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

function buildArmorClassCandidates(sheet: any, scores: Record<string, number>, resolved: any) {
  const combatStats = plainObject(sheet?.combat_stats)
  const dexMod = abilityModifier(scores.dex)
  const conMod = abilityModifier(scores.con)
  const candidates: Array<{ label: string; value: number; note: string; active?: boolean }> = []

  const manualAc = positiveIntegerOrNull(combatStats.armorClass ?? combatStats.armor_class)
  if (manualAc !== null) {
    candidates.push({
      label: 'Sheet Armor Class',
      value: manualAc,
      note: 'Saved on the character sheet.',
      active: true
    })
  }

  candidates.push({
    label: 'Unarmored Base',
    value: 10 + dexMod,
    note: '10 + DEX modifier.'
  })

  if (normalizeToken(resolved?.class?.title) === 'barbarian') {
    candidates.push({
      label: 'Barbarian Unarmored Defense',
      value: 10 + dexMod + conMod,
      note: '10 + DEX modifier + CON modifier.'
    })
  }

  const best = candidates.reduce((currentBest, candidate) => {
    if (!currentBest || candidate.value > currentBest.value) return candidate
    return currentBest
  }, null as null | { label: string; value: number; note: string; active?: boolean })

  return {
    current: manualAc,
    best,
    candidates
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
      for (const [index, choice] of (Array.isArray(feat?.spellChoices) ? feat.spellChoices : []).entries()) {
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

export function computeCharacterSheetMath(sheet: any, resolved: any = {}) {
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

  return {
    level,
    proficiencyBonus,
    proficiencyBonusText: signed(proficiencyBonus),
    abilities: buildAbilityRows(scores),
    saves: buildSaveRows(scores, saveProfs, proficiencyBonus),
    skills: buildSkillRows(scores, skillProfs, proficiencyBonus),
    combat: {
      initiative,
      initiativeText: signed(initiative),
      speed,
      hitDice,
      armorClass: buildArmorClassCandidates(sheet, scores, resolved)
    },
    pendingChoices: buildPendingChoices(sheet, resolved)
  }
}
