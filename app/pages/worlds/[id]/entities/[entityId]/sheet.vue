<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const router = useRouter()
const worldId = computed(() => String(route.params.id || ''))
const entityId = computed(() => String(route.params.entityId || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const sheetSaving = ref(false)
const sheetSaveError = ref('')
const sheetSaveSuccess = ref('')

const choiceSaving = ref(false)
const choiceSaveError = ref('')
const choiceSaveSuccess = ref('')

const spellSaving = ref(false)
const spellSaveError = ref('')
const spellSaveSuccess = ref('')
const spellKnownDraft = ref<string[]>([])
const spellPreparedDraft = ref<string[]>([])
const choiceDrafts = ref<Record<string, string[]>>({})

const SHEET_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'stats', label: 'Stats' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'spells', label: 'Spells' },
  { key: 'features', label: 'Features' },
  { key: 'notes', label: 'Notes' }
] as const

type SheetTab = typeof SHEET_TABS[number]['key']

function normalizeSheetTab(value: any): SheetTab {
  const tab = String(Array.isArray(value) ? value[0] : value || 'overview')
  return SHEET_TABS.some((option) => option.key === tab) ? tab as SheetTab : 'overview'
}

const activeSheetTab = computed<SheetTab>(() => normalizeSheetTab(route.query.tab))

function setSheetTab(tab: SheetTab) {
  router.replace({
    path: route.path,
    query: {
      ...route.query,
      tab: tab === 'overview' ? undefined : tab
    }
  })
}

const sheetForm = reactive({
  name: '',
  level: '1',
  className: '',
  subclassName: '',
  speciesName: '',
  backgroundName: '',
  classEntityId: '',
  speciesEntityId: '',
  backgroundEntityId: '',
  abilityScores: {
    str: '10',
    dex: '10',
    con: '10',
    int: '10',
    wis: '10',
    cha: '10'
  },
  combatStats: {
    armorClass: '',
    maxHp: '',
    currentHp: '',
    tempHp: '0',
    initiative: '',
    speed: '',
    hitDice: ''
  }
})

const {
  data,
  pending,
  error,
  refresh
} = await useAsyncData(
  () => `character-sheet-${worldId.value}-${entityId.value}`,
  () => $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/sheet`, {
    method: 'POST'
  }),
  {
    watch: [worldId, entityId]
  }
)

const { data: worldEntities } = await useFetch(() => `/api/worlds/${worldId.value}/entities`, {
  default: () => [],
  watch: [worldId]
})

const entity = computed(() => data.value?.entity || null)
const sheet = computed(() => data.value?.sheet || null)
const inventory = computed(() => Array.isArray(data.value?.inventory) ? data.value.inventory : [])
const inventoryCount = computed(() => inventory.value.length)
const featureCount = computed(() => {
  let count = 0
  if (resolvedClass.value?.featureCount) count += Number(resolvedClass.value.featureCount || 0)
  if (resolvedSpecies.value?.rawTraitCount) count += Number(resolvedSpecies.value.rawTraitCount || 0)
  if (resolvedBackground.value?.featureName) count += 1
  if (resolvedFeats.value?.length) count += Number(resolvedFeats.value.length || 0)
  return count
})
const resolved = computed(() => data.value?.resolved || null)
const math = computed(() => data.value?.math || null)
const mathSaves = computed(() => Array.isArray(math.value?.saves) ? math.value.saves : [])
const mathSkills = computed(() => Array.isArray(math.value?.skills) ? math.value.skills : [])
const mathArmorClassCandidates = computed(() => Array.isArray(math.value?.combat?.armorClass?.candidates) ? math.value.combat.armorClass.candidates : [])
const mathPendingChoices = computed(() => Array.isArray(math.value?.pendingChoices) ? math.value.pendingChoices : [])
const resolvedClass = computed(() => resolved.value?.class || null)
const resolvedSpecies = computed(() => resolved.value?.species || null)
const resolvedBackground = computed(() => resolved.value?.background || null)
const resolvedFeats = computed(() => Array.isArray(resolved.value?.feats) ? resolved.value.feats : [])

const entityImageUrl = computed(() => {
  if (entity.value?.imageUrl) return String(entity.value.imageUrl)
  if (entity.value?.image_url) return String(entity.value.image_url)
  if (entity.value?.image) return `/api/assets/${entity.value.image}`
  return ''
})

function normalizeEntityType(value: any) {
  return String(value || '').trim().toLowerCase()
}

function optionBlockByKey(option: any, key: string) {
  const blocks = Array.isArray(option?.entity?.blocks) ? option.entity.blocks : []

  return blocks.find((block: any) => String(block?.block_key || block?.blockKey || '') === key) || null
}

function optionCore(option: any, key: string) {
  return optionBlockByKey(option, key)?.data || null
}

function optionRawJson(option: any) {
  return optionCore(option, 'import_source')?.raw_json || null
}
function entityOptionsForTypes(types: string[]) {
  const wanted = new Set(types.map(normalizeEntityType))

  return (Array.isArray(worldEntities.value) ? worldEntities.value : [])
    .filter((option: any) => wanted.has(normalizeEntityType(option?.entity_type)))
    .map((option: any) => ({
      id: String(option?.id || ''),
      title: String(option?.title || 'Untitled'),
      entity: option
    }))
    .filter((option: any) => option.id)
    .sort((a: any, b: any) => a.title.localeCompare(b.title))
}

const classOptions = computed(() => entityOptionsForTypes(['class']))
const speciesOptions = computed(() => entityOptionsForTypes(['species', 'race']))
const backgroundOptions = computed(() => entityOptionsForTypes(['background']))
const featOptions = computed(() => entityOptionsForTypes(['feat']))
const spellOptions = computed(() => entityOptionsForTypes(['spell']))

function optionTitle(options: any[], id: any) {
  const needle = String(id || '')
  if (!needle) return ''
  return options.find((option: any) => String(option.id) === needle)?.title || ''
}
function featTitleById(id: any) {
  return optionTitle(featOptions.value, id)
}
function spellTitleById(id: any) {
  return optionTitle(spellOptions.value, id)
}

function spellOptionById(id: any) {
  const needle = String(id || '')
  if (!needle) return null
  return spellOptions.value.find((option: any) => String(option.id) === needle) || null
}

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}
function idList(value: any): string[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item: any) => String(item || '').trim())
    .filter(Boolean)
}

const sheetSpellcasting = computed(() => asObject(sheet.value?.spellcasting))

const knownSpellIds = computed(() =>
  idList(sheetSpellcasting.value.knownSpellIds ?? sheetSpellcasting.value.known_spell_ids)
)

const preparedSpellIds = computed(() =>
  idList(sheetSpellcasting.value.preparedSpellIds ?? sheetSpellcasting.value.prepared_spell_ids)
)

const alwaysPreparedSpellIds = computed(() =>
  idList(sheetSpellcasting.value.alwaysPreparedSpellIds ?? sheetSpellcasting.value.always_prepared_spell_ids)
)

function spellOptionsByIds(ids: string[]) {
  return ids
    .map((id) => spellOptionById(id))
    .filter(Boolean)
}

const knownSpells = computed(() => spellOptionsByIds(knownSpellIds.value))
const preparedSpells = computed(() => spellOptionsByIds(preparedSpellIds.value))
const alwaysPreparedSpells = computed(() => spellOptionsByIds(alwaysPreparedSpellIds.value))

const selectedSpellCount = computed(() => {
  const ids = new Set([
    ...knownSpellIds.value,
    ...preparedSpellIds.value,
    ...alwaysPreparedSpellIds.value,
    ...selectedChoiceSpellIds.value
  ])

  return ids.size
})

function syncSpellDraftsFromSheet() {
  spellKnownDraft.value = [...knownSpellIds.value]
  spellPreparedDraft.value = [...preparedSpellIds.value]
}

function stringValue(value: any, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value)
}
function shortText(value: any, limit = 320) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text
}

function syncFormFromSheet() {
  const currentSheet = sheet.value
  if (!currentSheet) return

  const abilityScores = asObject(currentSheet.ability_scores)
  const combatStats = asObject(currentSheet.combat_stats)

  sheetForm.name = stringValue(currentSheet.name || entity.value?.title || '')
  sheetForm.level = stringValue(currentSheet.level || 1)
  sheetForm.className = stringValue(currentSheet.class_name)
  sheetForm.subclassName = stringValue(currentSheet.subclass_name)
  sheetForm.speciesName = stringValue(currentSheet.species_name)
  sheetForm.backgroundName = stringValue(currentSheet.background_name)
  sheetForm.classEntityId = stringValue(currentSheet.class_entity_id)
  sheetForm.speciesEntityId = stringValue(currentSheet.species_entity_id)
  sheetForm.backgroundEntityId = stringValue(currentSheet.background_entity_id)

  sheetForm.abilityScores.str = stringValue(abilityScores.str, '10')
  sheetForm.abilityScores.dex = stringValue(abilityScores.dex, '10')
  sheetForm.abilityScores.con = stringValue(abilityScores.con, '10')
  sheetForm.abilityScores.int = stringValue(abilityScores.int, '10')
  sheetForm.abilityScores.wis = stringValue(abilityScores.wis, '10')
  sheetForm.abilityScores.cha = stringValue(abilityScores.cha, '10')

  sheetForm.combatStats.armorClass = stringValue(combatStats.armorClass)
  sheetForm.combatStats.maxHp = stringValue(combatStats.maxHp)
  sheetForm.combatStats.currentHp = stringValue(combatStats.currentHp)
  sheetForm.combatStats.tempHp = stringValue(combatStats.tempHp, '0')
  sheetForm.combatStats.initiative = stringValue(combatStats.initiative)
  sheetForm.combatStats.speed = stringValue(combatStats.speed)
  sheetForm.combatStats.hitDice = stringValue(combatStats.hitDice)
}

watch(
  () => sheet.value?.id,
  () => {
    syncFormFromSheet()
      syncSpellDraftsFromSheet()
  },
  { immediate: true }
)

const abilityScores = computed(() => {
  const scores = sheet.value?.ability_scores
  return asObject(scores)
})

const combatStats = computed(() => {
  const stats = sheet.value?.combat_stats
  return asObject(stats)
})

function shownAbilityScore(key: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha') {
  if (mode.value === 'build') return sheetForm.abilityScores[key]

  const score = abilityScores.value[key]
  return score === null || score === undefined || score === '' ? 10 : score
}

function isBlankCombatValue(value: any) {
  return value === null || value === undefined || value === '' || value === 0 || value === '0'
}

function shownCombatStat(key: string) {
  if (mode.value === 'build') {
    return (sheetForm.combatStats as any)[key]
  }

  const value = combatStats.value[key]
  if (!isBlankCombatValue(value)) return value

  if (key === 'armorClass') {
    return math.value?.combat?.armorClass?.current ||
      math.value?.combat?.armorClass?.best?.value ||
      ''
  }

  if (key === 'initiative') {
    return math.value?.combat?.initiativeText || ''
  }

  if (key === 'speed') {
    return math.value?.combat?.speed || resolvedSpecies.value?.speed || ''
  }

  if (key === 'hitDice') {
    return math.value?.combat?.hitDice || resolvedClass.value?.hitDie || ''
  }

  return ''
}

function abilityMod(value: any) {
  const score = Number(value)
  if (!Number.isFinite(score)) return '—'

  const mod = Math.floor((score - 10) / 2)
  return `${mod >= 0 ? '+' : ''}${mod}`
}

const abilityList = computed(() => [
  { key: 'str', label: 'STR', value: shownAbilityScore('str') },
  { key: 'dex', label: 'DEX', value: shownAbilityScore('dex') },
  { key: 'con', label: 'CON', value: shownAbilityScore('con') },
  { key: 'int', label: 'INT', value: shownAbilityScore('int') },
  { key: 'wis', label: 'WIS', value: shownAbilityScore('wis') },
  { key: 'cha', label: 'CHA', value: shownAbilityScore('cha') }
])


const selectedChoiceSpellIds = computed(() => {
  const ids = new Set<string>()
  const choices = asObject(sheet.value?.choices)

  for (const choice of Object.values(choices) as any[]) {
    if (choice?.type !== 'spell') continue

    for (const selected of Array.isArray(choice?.selected) ? choice.selected : []) {
      const id = String(selected || '').trim()
      if (id) ids.add(id)
    }
  }

  return Array.from(ids)
})

const featChoiceSpells = computed(() =>
  selectedChoiceSpellIds.value
    .map((id) => spellOptionById(id))
    .filter(Boolean)
)
const selectedFeatIds = computed(() => {
  const ids = new Set<string>()
  const choices = asObject(sheet.value?.choices)

  for (const choice of Object.values(choices) as any[]) {
    if (choice?.type !== 'feat') continue

    for (const selected of Array.isArray(choice?.selected) ? choice.selected : []) {
      const id = String(selected || '').trim()
      if (id) ids.add(id)
    }
  }

  return Array.from(ids)
})

const selectedFeatOptions = computed(() =>
  selectedFeatIds.value
    .map((id) => featOptions.value.find((option: any) => String(option.id) === String(id)))
    .filter(Boolean)
)

const selectedFeats = computed(() =>
  resolvedFeats.value.length ? resolvedFeats.value : selectedFeatOptions.value
)

function choiceSlots(choice: any) {
  const count = Math.max(1, Number(choice?.count || 1))
  return Array.from({ length: count }, (_, index) => index)
}

function normalizeFilterToken(value: any) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function parseSpellChoiceFilter(value: any) {
  const filter = String(value || '').trim()
  const result: Record<string, string[]> = {}

  if (!filter) return result

  for (const part of filter.split('|')) {
    const trimmed = part.trim()
    if (!trimmed) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = normalizeFilterToken(trimmed.slice(0, eqIndex))
    const rawValue = trimmed.slice(eqIndex + 1).trim()

    if (!key || !rawValue) continue

    result[key] = rawValue
      .split(/[,;]/g)
      .map(normalizeFilterToken)
      .filter(Boolean)
  }

  return result
}

function spellLevelForOption(option: any) {
  const core = optionCore(option, 'spell_core')
  const raw = optionRawJson(option)
  const level = Number(core?.level ?? raw?.level)

  return Number.isFinite(level) ? level : null
}

function spellClassesForOption(option: any) {
  const raw = optionRawJson(option)
  const classes = raw?.classes || {}
  const values: string[] = []

  function addEntries(entries: any) {
    if (!Array.isArray(entries)) return

    for (const entry of entries) {
      if (typeof entry === 'string') {
        values.push(entry)
      } else if (entry?.name) {
        values.push(entry.name)
      } else if (entry?.class?.name) {
        values.push(entry.class.name)
      }
    }
  }

  addEntries(classes.fromClassList)
  addEntries(classes.fromClassListVariant)
  addEntries(classes.fromClassListLegacy)

  if (Array.isArray(classes.fromSubclass)) {
    for (const entry of classes.fromSubclass) {
      if (entry?.class?.name) values.push(entry.class.name)
      if (entry?.subclass?.name) values.push(entry.subclass.name)
    }
  }

  return Array.from(new Set(values.map(normalizeFilterToken).filter(Boolean)))
}

function spellOptionMatchesChoice(option: any, choice: any) {
  if (choice?.type !== 'spell') return true

  const rules = parseSpellChoiceFilter(choice.category || choice.filter || '')
  const levelRules = rules.level || []
  const classRules = rules.class || []

  if (levelRules.length) {
    const spellLevel = spellLevelForOption(option)
    const allowedLevels = levelRules
      .map((level) => Number(level))
      .filter((level) => Number.isFinite(level))

    if (allowedLevels.length && !allowedLevels.includes(Number(spellLevel))) {
      return false
    }
  }

  if (classRules.length) {
    const classes = spellClassesForOption(option)

    if (classes.length && !classRules.some((klass) => classes.includes(klass))) {
      return false
    }
  }

  return true
}

function spellRestrictionLabel(choice: any) {
  if (choice?.type !== 'spell') return ''

  const rules = parseSpellChoiceFilter(choice.category || choice.filter || '')
  const parts: string[] = []

  if (rules.level?.length) {
    parts.push(`Level ${rules.level.join(', ')}`)
  }

  if (rules.class?.length) {
    parts.push(`${rules.class.map((item) => item.replace(/\b\w/g, (char) => char.toUpperCase())).join(', ')} list`)
  }

  return parts.join(' · ')
}
function choiceOptions(choice: any) {
  if (choice?.type === 'feat') {
    return featOptions.value.map((option: any) => String(option.id))
  }

  if (choice?.type === 'spell') {
    return spellOptions.value
      .filter((option: any) => spellOptionMatchesChoice(option, choice))
      .map((option: any) => String(option.id))
  }

  return Array.isArray(choice?.options) ? choice.options : []
}

function prettyChoiceValue(value: any) {
  const raw = String(value || '').trim()
  const featTitle = featTitleById(raw)
  const spellTitle = spellTitleById(raw)

  if (featTitle) return featTitle
  if (spellTitle) return spellTitle

  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function normalizeChoiceValue(value: any) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function selectedChoiceSkillSet() {
  const selected = new Set<string>()

  for (const choice of mathPendingChoices.value) {
    if (choice?.type !== 'skill') continue

    for (const value of Array.isArray(choice?.selected) ? choice.selected : []) {
      const normalized = normalizeChoiceValue(value)
      if (normalized) selected.add(normalized)
    }
  }

  return selected
}

function isChoiceOptionDisabled(choice: any, slot: number, option: any) {
  const sourceKey = String(choice?.sourceKey || '')

  if (choice?.type === 'feat' || choice?.type === 'spell') {
    const optionKey = String(option || '').trim()
    if (!optionKey) return false

    const currentValue = String(choiceDrafts.value[sourceKey]?.[slot] || '').trim()
    if (currentValue === optionKey) return false

    for (const otherChoice of mathPendingChoices.value) {
      if (otherChoice?.type !== choice?.type) continue

      const otherSourceKey = String(otherChoice?.sourceKey || '')
      const drafts = choiceDrafts.value[otherSourceKey] || []

      for (let index = 0; index < drafts.length; index++) {
        if (otherSourceKey === sourceKey && index === slot) continue
        if (String(drafts[index] || '').trim() === optionKey) return true
      }
    }

    return choice?.type === 'feat'
      ? selectedFeatIds.value.includes(optionKey)
      : selectedChoiceSpellIds.value.includes(optionKey)
  }

  if (choice?.type !== 'skill') return false

  const optionKey = normalizeChoiceValue(option)
  if (!optionKey) return false

  const currentValue = normalizeChoiceValue(choiceDrafts.value[sourceKey]?.[slot])

  if (currentValue === optionKey) return false

  for (const otherChoice of mathPendingChoices.value) {
    if (otherChoice?.type !== 'skill') continue

    const otherSourceKey = String(otherChoice?.sourceKey || '')
    const drafts = choiceDrafts.value[otherSourceKey] || []

    for (let index = 0; index < drafts.length; index++) {
      if (otherSourceKey === sourceKey && index === slot) continue
      if (normalizeChoiceValue(drafts[index]) === optionKey) return true
    }
  }

  const selectedBySavedChoice = selectedChoiceSkillSet().has(optionKey)
  const alreadyProficient = mathSkills.value.some((skill: any) =>
    normalizeChoiceValue(skill?.key) === optionKey &&
    skill?.proficient === true
  )

  return alreadyProficient && !selectedBySavedChoice
}

function choiceOptionLabel(choice: any, slot: number, option: any) {
  const label = choice?.type === 'feat'
    ? (featTitleById(option) || `Feat ${option}`)
    : choice?.type === 'spell'
      ? (spellTitleById(option) || `Spell ${option}`)
      : prettyChoiceValue(option)

  if (!isChoiceOptionDisabled(choice, slot, option)) return label

  if (choice?.type === 'feat') return `${label} (already selected)`
  if (choice?.type === 'spell') return `${label} (already selected)`

  return `${label} (already known)`
}

function syncChoiceDrafts() {
  const next: Record<string, string[]> = {}

  for (const choice of mathPendingChoices.value) {
    const key = String(choice?.sourceKey || '')
    if (!key) continue

    const selected = Array.isArray(choice?.selected) ? choice.selected : []
    next[key] = choiceSlots(choice).map((index) => String(selected[index] || ''))
  }

  choiceDrafts.value = next
}

watch(
  mathPendingChoices,
  () => {
    syncChoiceDrafts()
  },
  { immediate: true, deep: true }
)

async function saveChoices() {
  if (choiceSaving.value) return

  choiceSaving.value = true
  choiceSaveError.value = ''
  choiceSaveSuccess.value = ''

  try {
    const nextChoices: Record<string, any> = {
      ...asObject(sheet.value?.choices)
    }

    const usedSkillChoices = new Set<string>()
    const usedFeatChoices = new Set<string>()
    const usedSpellChoices = new Set<string>()

    for (const choice of mathPendingChoices.value) {
      const key = String(choice?.sourceKey || '')
      if (!key) continue

      const rawSelected = (choiceDrafts.value[key] || [])
        .map((item) => (choice?.type === 'feat' || choice?.type === 'spell') ? String(item || '').trim() : normalizeChoiceValue(item))
        .filter(Boolean)

      const selected: string[] = []
      for (const item of rawSelected) {
        if (choice?.type === 'skill') {
          if (usedSkillChoices.has(item)) continue
          usedSkillChoices.add(item)
        }

        if (choice?.type === 'feat') {
          if (usedFeatChoices.has(item)) continue
          usedFeatChoices.add(item)
        }

        if (choice?.type === 'spell') {
          if (usedSpellChoices.has(item)) continue
          usedSpellChoices.add(item)
        }

        selected.push(item)
      }

      nextChoices[key] = {
        sourceKey: key,
        sourceType: choice.sourceType || null,
        sourceName: choice.sourceName || null,
        type: choice.type || null,
        label: choice.label || null,
        count: Number(choice.count || 1),
        options: Array.isArray(choice.options) ? choice.options : [],
        category: choice.category || null,
        selected
      }
    }

    const saved = await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/sheet`, {
      method: 'PATCH',
      body: {
        name: sheetForm.name,
        level: sheetForm.level,
        className: optionTitle(classOptions.value, sheetForm.classEntityId) || sheetForm.className,
        subclassName: sheetForm.subclassName,
        speciesName: optionTitle(speciesOptions.value, sheetForm.speciesEntityId) || sheetForm.speciesName,
        backgroundName: optionTitle(backgroundOptions.value, sheetForm.backgroundEntityId) || sheetForm.backgroundName,
        classEntityId: sheetForm.classEntityId || null,
        speciesEntityId: sheetForm.speciesEntityId || null,
        backgroundEntityId: sheetForm.backgroundEntityId || null,
        abilityScores: { ...sheetForm.abilityScores },
        combatStats: { ...sheetForm.combatStats },
        choices: nextChoices
      }
    })

    data.value = saved as any
    syncFormFromSheet()
    syncChoiceDrafts()
    choiceSaveSuccess.value = 'Choices saved.'
  } catch (err: any) {
    choiceSaveError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to save choices.'
  } finally {
    choiceSaving.value = false
  }
}

async function saveSpells() {
  if (spellSaving.value) return

  spellSaving.value = true
  spellSaveError.value = ''
  spellSaveSuccess.value = ''

  try {
    const saved = await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/sheet`, {
      method: 'PATCH',
      body: {
        name: sheetForm.name,
        level: sheetForm.level,
        className: optionTitle(classOptions.value, sheetForm.classEntityId) || sheetForm.className,
        subclassName: sheetForm.subclassName,
        speciesName: optionTitle(speciesOptions.value, sheetForm.speciesEntityId) || sheetForm.speciesName,
        backgroundName: optionTitle(backgroundOptions.value, sheetForm.backgroundEntityId) || sheetForm.backgroundName,
        classEntityId: sheetForm.classEntityId || null,
        speciesEntityId: sheetForm.speciesEntityId || null,
        backgroundEntityId: sheetForm.backgroundEntityId || null,
        abilityScores: { ...sheetForm.abilityScores },
        combatStats: { ...sheetForm.combatStats },
        spellcasting: {
          knownSpellIds: [...spellKnownDraft.value],
          preparedSpellIds: [...spellPreparedDraft.value],
          alwaysPreparedSpellIds: [...alwaysPreparedSpellIds.value]
        }
      }
    })

    data.value = saved as any
    syncFormFromSheet()
    syncChoiceDrafts()
    syncSpellDraftsFromSheet()
    spellSaveSuccess.value = 'Spells saved.'
  } catch (err: any) {
    spellSaveError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to save spells.'
  } finally {
    spellSaving.value = false
  }
}

async function saveSheet() {
  if (sheetSaving.value) return

  sheetSaving.value = true
  sheetSaveError.value = ''
  sheetSaveSuccess.value = ''

  try {
    const saved = await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/sheet`, {
      method: 'PATCH',
      body: {
        name: sheetForm.name,
        level: sheetForm.level,
        className: optionTitle(classOptions.value, sheetForm.classEntityId) || sheetForm.className,
        subclassName: sheetForm.subclassName,
        speciesName: optionTitle(speciesOptions.value, sheetForm.speciesEntityId) || sheetForm.speciesName,
        backgroundName: optionTitle(backgroundOptions.value, sheetForm.backgroundEntityId) || sheetForm.backgroundName,
        classEntityId: sheetForm.classEntityId || null,
        speciesEntityId: sheetForm.speciesEntityId || null,
        backgroundEntityId: sheetForm.backgroundEntityId || null,
        abilityScores: { ...sheetForm.abilityScores },
        combatStats: { ...sheetForm.combatStats }
      }
    })

    data.value = saved as any
    syncFormFromSheet()
    sheetSaveSuccess.value = 'Sheet saved.'
  } catch (err: any) {
    sheetSaveError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to save sheet.'
  } finally {
    sheetSaving.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[80] h-[100dvh] overflow-y-auto bg-[#09111a] md:relative md:z-auto md:h-full md:bg-transparent">
    <div class="mx-auto max-w-[1100px] p-3 pb-28 md:p-6">
        <!-- Mobile Sheet Header -->
        <div class="sticky top-0 z-40 -mx-3 mb-3 border-b border-[rgba(201,164,90,0.24)] bg-[linear-gradient(to_bottom,rgba(9,17,26,0.98),rgba(9,17,26,0.90))] px-3 py-3 backdrop-blur md:hidden">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-[10px] uppercase tracking-[0.28em] text-[#9f9278]">Character Sheet</div>
              <div class="mt-1 truncate text-xl font-semibold text-white">
                {{ sheet?.name || entity?.title || 'Character' }}
              </div>
              <div class="mt-1 truncate text-xs text-[#d8ceb8]">
                {{ sheet?.class_name || 'Class' }} · {{ sheet?.species_name || 'Species' }} · Level {{ sheet?.level || 1 }}
              </div>
            </div>

            <div class="flex shrink-0 gap-2">
              <NuxtLink
                :to="`/worlds/${worldId}/entities/${entityId}`"
                class="rounded-none border border-[rgba(201,164,90,0.32)] bg-[rgba(20,17,12,0.82)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
              >
                Back
              </NuxtLink>

              <button
                v-if="mode === 'build'"
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.32)] bg-[rgba(201,164,90,0.14)] px-3 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-50"
                :disabled="sheetSaving"
                @click="saveSheet"
              >
                Save
              </button>
            </div>
          </div>

          <div class="mt-3 grid grid-cols-5 gap-1 text-center text-[11px]">
            <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.58)] px-2 py-1">
              <div class="text-[#9f9278]">AC</div>
              <div class="font-semibold text-white">{{ shownCombatStat('armorClass') || '—' }}</div>
            </div>
            <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.58)] px-2 py-1">
              <div class="text-[#9f9278]">HP</div>
              <div class="font-semibold text-white">{{ shownCombatStat('currentHp') || '—' }}/{{ shownCombatStat('maxHp') || '—' }}</div>
            </div>
            <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.58)] px-2 py-1">
              <div class="text-[#9f9278]">Init</div>
              <div class="font-semibold text-white">{{ shownCombatStat('initiative') || '—' }}</div>
            </div>
            <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.58)] px-2 py-1">
              <div class="text-[#9f9278]">Spd</div>
              <div class="font-semibold text-white">{{ shownCombatStat('speed') || '—' }}</div>
            </div>
            <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.58)] px-2 py-1">
              <div class="text-[#9f9278]">PB</div>
              <div class="font-semibold text-white">{{ math?.proficiencyBonusText || '+2' }}</div>
            </div>
          </div>
            <!-- Mobile Sheet Tabs -->
            <nav class="mt-3 overflow-x-auto border-t border-[rgba(201,164,90,0.20)] pt-2 md:hidden">
            <div class="grid min-w-max grid-cols-6 gap-1">
              <button
                v-for="tab in SHEET_TABS"
                :key="`mobile-${tab.key}`"
                type="button"
                class="min-w-0 rounded-none border px-1.5 py-2 text-[11px] font-semibold transition"
                :class="activeSheetTab === tab.key
                  ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.18)] text-[#fff7df]'
                  : 'border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.72)] text-[#d8ceb8]'"
                @click="setSheetTab(tab.key)"
              >
                <span class="block truncate">{{ tab.label }}</span>
                <span v-if="tab.key === 'stats' && mathPendingChoices.length" class="text-[10px] text-[#9f9278]">({{ mathPendingChoices.length }})</span>
                <span v-else-if="tab.key === 'inventory'" class="text-[10px] text-[#9f9278]">({{ inventoryCount }})</span>
                <span v-else-if="tab.key === 'spells'" class="text-[10px] text-[#9f9278]">({{ selectedSpellCount }})</span>
                <span v-else-if="tab.key === 'features' && featureCount" class="text-[10px] text-[#9f9278]">({{ featureCount }})</span>
              </button>
            </div>
            </nav>
        </div>

      <div class="mb-4 hidden flex-wrap items-center justify-between gap-3 md:flex">
        <NuxtLink
          :to="`/worlds/${worldId}/entities/${entityId}`"
          class="eldra-button rounded-none px-4 py-2 text-sm"
        >
          Back to Article
        </NuxtLink>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="eldra-button rounded-none px-4 py-2 text-sm"
            @click="refresh()"
          >
            Refresh Sheet
          </button>

          <button
            v-if="mode === 'build'"
            type="button"
            class="eldra-button rounded-none px-4 py-2 text-sm font-semibold disabled:opacity-50"
            :disabled="sheetSaving"
            @click="saveSheet"
          >
            {{ sheetSaving ? 'Saving...' : 'Save Sheet' }}
          </button>
        </div>
      </div>

        <div class="mb-4 hidden overflow-x-auto md:block">
          <div class="flex min-w-max gap-2">
            <button
              v-for="tab in SHEET_TABS"
              :key="tab.key"
              type="button"
              class="rounded-none border px-4 py-2 text-sm font-semibold transition"
              :class="activeSheetTab === tab.key
                ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.18)] text-[#fff7df]'
                : 'border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] text-[#d8ceb8] hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]'"
              @click="setSheetTab(tab.key)"
            >
              <span>{{ tab.label }}</span>
              <span v-if="tab.key === 'stats' && mathPendingChoices.length" class="ml-1 text-[#9f9278]">({{ mathPendingChoices.length }})</span>
              <span v-if="tab.key === 'inventory'" class="ml-1 text-[#9f9278]">({{ inventoryCount }})</span>
              <span v-if="tab.key === 'spells'" class="ml-1 text-[#9f9278]">({{ selectedSpellCount }})</span>
              <span v-if="tab.key === 'features' && featureCount" class="ml-1 text-[#9f9278]">({{ featureCount }})</span>
            </button>
          </div>
        </div>

      <section class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes rounded-none border p-5 shadow-xl">
        <div v-if="pending" class="text-[#d8ceb8]">
          Loading character sheet...
        </div>

        <div v-else-if="error" class="rounded-none border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          {{ error?.data?.statusMessage || error?.message || 'Failed to load sheet.' }}
        </div>

        <template v-else>
          <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div class="min-w-0 flex-1">
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Character Sheet</div>

              <input
                v-if="mode === 'build'"
                v-model="sheetForm.name"
                class="eldra-input mt-2 w-full rounded-none px-4 py-2 text-2xl font-semibold text-white sm:text-4xl"
                placeholder="Character name"
              >

              <h1 v-else class="mt-2 text-3xl font-semibold text-white sm:text-4xl">
                {{ sheet?.name || entity?.title || 'Character' }}
              </h1>

              <p class="mt-2 text-sm text-[#d8ceb8]">
                Mobile-first mechanical sheet foundation.
              </p>
            </div>

            <div class="eldra-gold-chip rounded-none border px-3 py-1.5 text-xs uppercase tracking-[0.18em]">
              {{ sheet?.sheet_type || 'dnd5e' }}
            </div>
          </div>

          <div
            v-if="activeSheetTab === 'overview' && entityImageUrl"
            class="eldra-image-frame mt-6 overflow-hidden rounded-none border bg-black/20"
          >
            <img
              :src="entityImageUrl"
              :alt="sheet?.name || entity?.title || 'Character Portrait'"
              class="max-h-[260px] w-full object-cover object-[center_15%] md:max-h-[420px]"
            >
          </div>

          <div v-if="sheetSaveError" class="mt-4 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
            {{ sheetSaveError }}
          </div>

          <div v-if="sheetSaveSuccess" class="mt-4 rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {{ sheetSaveSuccess }}
          </div>

          <div v-if="activeSheetTab === 'overview'" class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
              <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Level</div>
              <input
                v-if="mode === 'build'"
                v-model="sheetForm.level"
                inputmode="numeric"
                class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-2xl font-semibold text-white"
              >
              <div v-else class="mt-2 text-2xl font-semibold text-white">{{ sheet?.level || 1 }}</div>
            </label>

            <label class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
              <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Class</div>
              <select
                v-if="mode === 'build'"
                v-model="sheetForm.classEntityId"
                class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-lg text-white"
              >
                <option value="" class="bg-[#090909] text-[#f5e7bd]">No linked class</option>
                <option
                  v-for="option in classOptions"
                  :key="option.id"
                  :value="option.id"
                  class="bg-[#090909] text-[#f5e7bd]"
                >
                  {{ option.title }}
                </option>
              </select>
              <div v-else class="mt-2 text-lg font-semibold text-white">{{ sheet?.class_name || '—' }}</div>

              <div v-if="resolvedClass" class="mt-4 space-y-1.5 border-t border-[rgba(201,164,90,0.16)] pt-3 text-xs leading-5 text-[#d8ceb8]">
                <div v-if="resolvedClass.hitDie"><span class="text-[#9f9278]">Hit Die:</span> {{ resolvedClass.hitDie }}</div>
                <div v-if="resolvedClass.savingThrows"><span class="text-[#9f9278]">Saves:</span> {{ resolvedClass.savingThrows }}</div>
                <div v-if="resolvedClass.armorProficiencies"><span class="text-[#9f9278]">Armor:</span> {{ resolvedClass.armorProficiencies }}</div>
                <div v-if="resolvedClass.weaponProficiencies"><span class="text-[#9f9278]">Weapons:</span> {{ resolvedClass.weaponProficiencies }}</div>
              </div>
            </label>

            <label class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
              <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Species</div>
              <select
                v-if="mode === 'build'"
                v-model="sheetForm.speciesEntityId"
                class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-lg text-white"
              >
                <option value="" class="bg-[#090909] text-[#f5e7bd]">No linked species</option>
                <option
                  v-for="option in speciesOptions"
                  :key="option.id"
                  :value="option.id"
                  class="bg-[#090909] text-[#f5e7bd]"
                >
                  {{ option.title }}
                </option>
              </select>
              <div v-else class="mt-2 text-lg font-semibold text-white">{{ sheet?.species_name || '—' }}</div>

              <div v-if="resolvedSpecies" class="mt-4 space-y-1.5 border-t border-[rgba(201,164,90,0.16)] pt-3 text-xs leading-5 text-[#d8ceb8]">
                <div v-if="resolvedSpecies.size"><span class="text-[#9f9278]">Size:</span> {{ resolvedSpecies.size }}</div>
                <div v-if="resolvedSpecies.speed"><span class="text-[#9f9278]">Speed:</span> {{ resolvedSpecies.speed }}</div>
                <div v-if="resolvedSpecies.rawTraitCount"><span class="text-[#9f9278]">Traits:</span> {{ resolvedSpecies.rawTraitCount }}</div>
              </div>
            </label>

            <label class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
              <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Background</div>
              <select
                v-if="mode === 'build'"
                v-model="sheetForm.backgroundEntityId"
                class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-lg text-white"
              >
                <option value="" class="bg-[#090909] text-[#f5e7bd]">No linked background</option>
                <option
                  v-for="option in backgroundOptions"
                  :key="option.id"
                  :value="option.id"
                  class="bg-[#090909] text-[#f5e7bd]"
                >
                  {{ option.title }}
                </option>
              </select>
              <div v-else class="mt-2 text-lg font-semibold text-white">{{ sheet?.background_name || '—' }}</div>

              <div v-if="resolvedBackground" class="mt-4 space-y-1.5 border-t border-[rgba(201,164,90,0.16)] pt-3 text-xs leading-5 text-[#d8ceb8]">
                <div v-if="resolvedBackground.skillProficiencies"><span class="text-[#9f9278]">Skills:</span> {{ resolvedBackground.skillProficiencies }}</div>
                <div v-if="resolvedBackground.toolProficiencies"><span class="text-[#9f9278]">Tools:</span> {{ resolvedBackground.toolProficiencies }}</div>
                <div v-if="resolvedBackground.featureName"><span class="text-[#9f9278]">Feature:</span> {{ resolvedBackground.featureName }}</div>
              </div>
            </label>
          </div>


          <div v-if="activeSheetTab === 'overview' && mode === 'build'" class="mt-3 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
            <label class="block">
              <span class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Subclass</span>
              <input
                v-model="sheetForm.subclassName"
                class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-sm text-white"
                placeholder="Optional subclass"
              >
            </label>
          </div>

          <section v-if="activeSheetTab === 'overview'" class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label
              v-for="ability in abilityList"
              :key="ability.key"
              class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4 text-center"
            >
              <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">{{ ability.label }}</div>

              <input
                v-if="mode === 'build'"
                v-model="sheetForm.abilityScores[ability.key]"
                inputmode="numeric"
                class="eldra-input mx-auto mt-2 w-24 rounded-none px-3 py-2 text-center text-3xl font-semibold text-white"
              >

              <div v-else class="mt-2 text-3xl font-semibold text-white">{{ ability.value ?? 10 }}</div>
              <div class="mt-1 text-sm text-[#d8ceb8]">{{ abilityMod(ability.value) }}</div>
            </label>
          </section>

          <section v-if="activeSheetTab === 'overview'" class="mt-6 grid gap-4">
            <div class="eldra-codex-soft rounded-none p-4">
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Combat</div>

              <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
                <label class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                  <div class="text-[#9f9278]">Armor Class</div>
                  <input
                    v-if="mode === 'build'"
                    v-model="sheetForm.combatStats.armorClass"
                    inputmode="numeric"
                    class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-xl text-white"
                  >
                  <div v-else class="mt-1 text-xl font-semibold text-white">{{ shownCombatStat('armorClass') || '—' }}</div>
                </label>

                <label class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                  <div class="text-[#9f9278]">Hit Points</div>
                  <div v-if="mode === 'build'" class="mt-2 grid grid-cols-2 gap-2">
                    <input
                      v-model="sheetForm.combatStats.currentHp"
                      inputmode="numeric"
                      placeholder="Current"
                      class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                    >
                    <input
                      v-model="sheetForm.combatStats.maxHp"
                      inputmode="numeric"
                      placeholder="Max"
                      class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                    >
                  </div>
                  <div v-else class="mt-1 text-xl font-semibold text-white">
                    {{ shownCombatStat('currentHp') || '—' }} / {{ shownCombatStat('maxHp') || '—' }}
                  </div>
                </label>

                <label class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                  <div class="text-[#9f9278]">Initiative</div>
                  <input
                    v-if="mode === 'build'"
                    v-model="sheetForm.combatStats.initiative"
                    inputmode="numeric"
                    class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-xl text-white"
                  >
                  <div v-else class="mt-1 text-xl font-semibold text-white">{{ shownCombatStat('initiative') || '—' }}</div>
                </label>

                <label class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                  <div class="text-[#9f9278]">Speed</div>
                  <input
                    v-if="mode === 'build'"
                    v-model="sheetForm.combatStats.speed"
                    class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-xl text-white"
                    placeholder="30 ft"
                  >
                  <div v-else class="mt-1 text-xl font-semibold text-white">{{ shownCombatStat('speed') || '—' }}</div>
                </label>

                <label class="col-span-2 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                  <div class="text-[#9f9278]">Hit Dice</div>
                  <input
                    v-if="mode === 'build'"
                    v-model="sheetForm.combatStats.hitDice"
                    class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-sm text-white"
                    placeholder="e.g. 1d10"
                  >
                  <div v-else class="mt-1 text-xl font-semibold text-white">{{ shownCombatStat('hitDice') || '—' }}</div>
                </label>
              </div>
            </div>

          </section>
            <section
              v-else-if="activeSheetTab === 'stats'"
              class="mt-6 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]"
            >
              <div class="eldra-codex-soft rounded-none p-4">
                <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Stats Math</div>

                <div class="mt-4 grid grid-cols-2 gap-3">
                  <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                    <div class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">Level</div>
                    <div class="mt-1 text-2xl font-semibold text-white">{{ math?.level || sheet?.level || 1 }}</div>
                  </div>

                  <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                    <div class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">Proficiency</div>
                    <div class="mt-1 text-2xl font-semibold text-white">{{ math?.proficiencyBonusText || '+2' }}</div>
                  </div>

                  <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                    <div class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">Initiative</div>
                    <div class="mt-1 text-2xl font-semibold text-white">{{ math?.combat?.initiativeText || shownCombatStat('initiative') || '—' }}</div>
                  </div>

                  <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                    <div class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">Speed</div>
                    <div class="mt-1 text-2xl font-semibold text-white">{{ math?.combat?.speed || shownCombatStat('speed') || '—' }}</div>
                  </div>
                </div>

                <div v-if="mathPendingChoices.length" class="mt-4 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.52)] p-3">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Pending Choices</div>

                    <button
                      v-if="mode === 'build'"
                      type="button"
                      class="eldra-button rounded-none px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      :disabled="choiceSaving"
                      @click="saveChoices"
                    >
                      {{ choiceSaving ? 'Saving...' : 'Save Choices' }}
                    </button>
                  </div>

                  <div v-if="choiceSaveError" class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                    {{ choiceSaveError }}
                  </div>

                  <div v-if="choiceSaveSuccess" class="mt-3 rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                    {{ choiceSaveSuccess }}
                  </div>

                  <div class="mt-3 space-y-3 text-sm text-[#d8ceb8]">
                    <div
                      v-for="choice in mathPendingChoices"
                      :key="choice.sourceKey"
                      class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.42)] p-3"
                    >
                      <div class="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div class="font-medium text-white">{{ choice.label }}</div>
                              <div v-if="spellRestrictionLabel(choice)" class="mt-1 text-xs text-[#9f9278]">
                                {{ spellRestrictionLabel(choice) }}
                              </div>
                          <div v-if="choice.remaining" class="mt-1 text-xs text-[#9f9278]">
                            {{ choice.remaining }} selection{{ choice.remaining === 1 ? '' : 's' }} remaining.
                          </div>
                          <div v-else class="mt-1 text-xs text-emerald-200">
                            Complete.
                          </div>
                        </div>

                        <div v-if="choice.complete" class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]">
                          Chosen
                        </div>
                      </div>

                      <div v-if="mode === 'build'" class="mt-3 grid gap-2">
                        <label
                          v-for="slot in choiceSlots(choice)"
                          :key="`${choice.sourceKey}-${slot}`"
                          class="block"
                        >
                          <span class="mb-1 block text-xs uppercase tracking-[0.18em] text-[#9f9278]">
                            Pick {{ slot + 1 }}
                          </span>

                          <select
                            v-if="choiceOptions(choice).length"
                            v-model="choiceDrafts[choice.sourceKey][slot]"
                            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                          >
                            <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose...</option>
                            <option
                              v-for="option in choiceOptions(choice)"
                              :key="option"
                              :value="option"
                              :disabled="isChoiceOptionDisabled(choice, slot, option)"
                              class="bg-[#090909] text-[#f5e7bd] disabled:text-[#756a57]"
                            >
                              {{ choiceOptionLabel(choice, slot, option) }}
                            </option>
                          </select>

                          <input
                            v-else
                            v-model="choiceDrafts[choice.sourceKey][slot]"
                            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                            :placeholder="choice.category ? `Choose from category ${choice.category}` : 'Type choice...'"
                          >
                        </label>
                      </div>

                      <div v-else class="mt-3 text-xs text-[#9f9278]">
                        Selected:
                        <span v-if="choice.selected?.length" class="text-[#d8ceb8]">
                          {{ choice.selected.map(prettyChoiceValue).join(', ') }}
                        </span>
                        <span v-else>None yet.</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="grid gap-4">
                <div class="eldra-codex-soft rounded-none p-4">
                  <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Saving Throws</div>

                  <div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <div
                      v-for="save in mathSaves"
                      :key="save.key"
                      class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <div class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">{{ save.shortLabel }}</div>
                        <div v-if="save.proficient" class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]">Prof</div>
                      </div>
                      <div class="mt-2 text-2xl font-semibold text-white">{{ save.totalText }}</div>
                      <div class="mt-1 text-xs text-[#9f9278]">{{ save.label }}</div>
                    </div>
                  </div>
                </div>

                <div class="eldra-codex-soft rounded-none p-4">
                  <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Skills</div>

                  <div class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    <div
                      v-for="skill in mathSkills"
                      :key="skill.key"
                      class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <div class="text-sm font-medium text-white">{{ skill.label }}</div>
                        <div class="text-xs text-[#9f9278]">{{ skill.abilityLabel }}</div>
                      </div>
                      <div class="mt-2 flex items-center justify-between gap-3">
                        <div class="text-xl font-semibold text-white">{{ skill.totalText }}</div>
                        <div v-if="skill.proficient" class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]">Prof</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="eldra-codex-soft rounded-none p-4">
                  <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Armor Class Candidates</div>

                  <div class="mt-4 grid gap-2 md:grid-cols-3">
                    <div
                      v-for="candidate in mathArmorClassCandidates"
                      :key="candidate.label"
                      class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <div class="text-sm font-medium text-white">{{ candidate.label }}</div>
                        <div v-if="candidate.active" class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]">Active</div>
                      </div>
                      <div class="mt-2 text-2xl font-semibold text-white">{{ candidate.value }}</div>
                      <div class="mt-1 text-xs leading-5 text-[#9f9278]">{{ candidate.note }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

          <section
            v-else-if="activeSheetTab === 'inventory'"
            class="mt-6"
          >

              <div class="eldra-codex-soft rounded-none p-4 lg:col-span-2">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Feat Choice Spells</div>
                    <div class="mt-1 text-sm text-[#d8ceb8]">Spells selected from feat-driven choices like Magic Initiate.</div>
                  </div>

                  <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                    {{ featChoiceSpells.length }} Spell{{ featChoiceSpells.length === 1 ? '' : 's' }}
                  </div>
                </div>

                <div v-if="featChoiceSpells.length" class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <NuxtLink
                    v-for="spell in featChoiceSpells"
                    :key="spell.id"
                    :to="`/worlds/${worldId}/entities/${spell.id}`"
                    class="block rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3 text-sm text-[#d8ceb8] transition hover:border-[rgba(201,164,90,0.42)] hover:bg-[rgba(201,164,90,0.10)]"
                  >
                    <div class="font-medium text-white">{{ spell.title }}</div>
                    <div class="mt-1 text-xs text-[#9f9278]">Open spell article</div>
                  </NuxtLink>
                </div>

                <div v-else class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]">
                  No feat-granted spell choices selected yet.
                </div>
              </div>

            <div class="eldra-codex-soft rounded-none p-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Inventory</div>
                  <div class="mt-1 text-sm text-[#d8ceb8]">Equipment, carried items, containers, and later DM/Admin item assignments.</div>
                </div>

                <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                  {{ inventoryCount }} Item{{ inventoryCount === 1 ? '' : 's' }}
                </div>
              </div>

              <div v-if="inventory.length" class="mt-4 space-y-2">
                <div
                  v-for="item in inventory"
                  :key="item.id"
                  class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3 text-sm text-[#d8ceb8]"
                >
                  <div class="flex items-center justify-between gap-3">
                    <span class="font-medium text-white">{{ item.name }}</span>
                    <span>x{{ item.quantity || 1 }}</span>
                  </div>

                  <div class="mt-2 flex flex-wrap gap-2 text-xs text-[#9f9278]">
                    <span v-if="item.equipped" class="eldra-gold-chip rounded-none border px-2 py-0.5">Equipped</span>
                    <span v-if="item.attuned" class="eldra-gold-chip rounded-none border px-2 py-0.5">Attuned</span>
                    <span v-if="item.container">Container: {{ item.container }}</span>
                  </div>

                  <div v-if="item.notes" class="mt-2 text-xs leading-5 text-[#9f9278]">{{ item.notes }}</div>
                </div>
              </div>

              <div v-else class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]">
                Inventory is empty. Starting package and DM/Admin item assignment hooks will land here.
              </div>
            </div>
          </section>

            <section
              v-else-if="activeSheetTab === 'spells'"
              class="mt-6 grid gap-4 lg:grid-cols-2"
            >
              <div
                v-if="mode === 'build'"
                class="eldra-codex-soft rounded-none p-4 lg:col-span-2"
              >
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Spellbook Builder</div>
                    <div class="mt-1 text-sm text-[#d8ceb8]">Select imported spell articles for this sheet. Spell-slot math comes next.</div>
                  </div>

                  <button
                    type="button"
                    class="eldra-button rounded-none px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    :disabled="spellSaving"
                    @click="saveSpells"
                  >
                    {{ spellSaving ? 'Saving...' : 'Save Spells' }}
                  </button>
                </div>

                <div v-if="spellSaveError" class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {{ spellSaveError }}
                </div>

                <div v-if="spellSaveSuccess" class="mt-3 rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  {{ spellSaveSuccess }}
                </div>

                <div class="mt-4 grid gap-4 md:grid-cols-2">
                  <label class="block">
                    <span class="mb-2 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Known / Spellbook Spells</span>
                    <select
                      v-model="spellKnownDraft"
                      multiple
                      size="10"
                      class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                    >
                      <option
                        v-for="option in spellOptions"
                        :key="option.id"
                        :value="option.id"
                        class="bg-[#090909] text-[#f5e7bd]"
                      >
                        {{ option.title }}
                      </option>
                    </select>
                  </label>

                  <label class="block">
                    <span class="mb-2 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Prepared Spells</span>
                    <select
                      v-model="spellPreparedDraft"
                      multiple
                      size="10"
                      class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                    >
                      <option
                        v-for="option in spellOptions"
                        :key="option.id"
                        :value="option.id"
                        class="bg-[#090909] text-[#f5e7bd]"
                      >
                        {{ option.title }}
                      </option>
                    </select>
                  </label>
                </div>
              </div>

              <div class="eldra-codex-soft rounded-none p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Known Spells</div>
                  <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                    {{ knownSpells.length }} Spell{{ knownSpells.length === 1 ? '' : 's' }}
                  </div>
                </div>

                <div v-if="knownSpells.length" class="mt-4 space-y-2">
                  <NuxtLink
                    v-for="spell in knownSpells"
                    :key="spell.id"
                    :to="`/worlds/${worldId}/entities/${spell.id}`"
                    class="block rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3 text-sm text-[#d8ceb8] transition hover:border-[rgba(201,164,90,0.42)] hover:bg-[rgba(201,164,90,0.10)]"
                  >
                    <div class="font-medium text-white">{{ spell.title }}</div>
                    <div class="mt-1 text-xs text-[#9f9278]">Open spell article →</div>
                  </NuxtLink>
                </div>

                <div v-else class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]">
                  No known spells selected yet.
                </div>
              </div>

              <div class="eldra-codex-soft rounded-none p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Prepared Spells</div>
                  <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                    {{ preparedSpells.length }} Prepared
                  </div>
                </div>

                <div v-if="preparedSpells.length" class="mt-4 space-y-2">
                  <NuxtLink
                    v-for="spell in preparedSpells"
                    :key="spell.id"
                    :to="`/worlds/${worldId}/entities/${spell.id}`"
                    class="block rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3 text-sm text-[#d8ceb8] transition hover:border-[rgba(201,164,90,0.42)] hover:bg-[rgba(201,164,90,0.10)]"
                  >
                    <div class="font-medium text-white">{{ spell.title }}</div>
                    <div class="mt-1 text-xs text-[#9f9278]">Open spell article →</div>
                  </NuxtLink>
                </div>

                <div v-else class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]">
                  No prepared spells selected yet.
                </div>
              </div>
            </section>

          <section
            v-else-if="activeSheetTab === 'features'"
            class="mt-6 grid gap-4 lg:grid-cols-3"
          >
              <div class="eldra-codex-soft rounded-none p-4 lg:col-span-3">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Selected Feats</div>
                    <div class="mt-1 text-sm text-[#d8ceb8]">Resolved from imported feat articles saved on this sheet.</div>
                  </div>

                  <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                    {{ selectedFeats.length }} Feat{{ selectedFeats.length === 1 ? '' : 's' }}
                  </div>
                </div>

                <div v-if="selectedFeats.length" class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <article
                    v-for="feat in selectedFeats"
                    :key="feat.id"
                    class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-4 text-sm text-[#d8ceb8]"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="text-base font-semibold text-white">{{ feat.title }}</div>
                        <div class="mt-1 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-[#9f9278]">
                          <span v-if="feat.source">{{ feat.source }}</span>
                          <span v-if="feat.page">p. {{ feat.page }}</span>
                          <span v-if="feat.category">Category: {{ feat.category }}</span>
                        </div>
                      </div>

                      <NuxtLink
                        :to="`/worlds/${worldId}/entities/${feat.id}`"
                        class="eldra-button shrink-0 rounded-none px-3 py-1.5 text-xs"
                      >
                        Article
                      </NuxtLink>
                    </div>

                    <div v-if="feat.prerequisites" class="mt-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3 text-xs leading-5 text-[#9f9278]">
                      <span class="text-[#d8ceb8]">Prerequisites:</span> {{ feat.prerequisites }}
                    </div>

                    <p v-if="feat.benefits" class="mt-3 text-sm leading-6 text-[#d8ceb8]">
                      {{ shortText(feat.benefits, 360) }}
                    </p>

                    <div class="mt-3 flex flex-wrap gap-2">
                      <span v-if="feat.repeatable" class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]">Repeatable</span>
                      <span v-if="feat.abilityScoreIncrease" class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]">Ability</span>
                      <span v-if="feat.additionalSpells" class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]">Spell Choice</span>
                    </div>
                  </article>
                </div>

                <div v-else class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]">
                  No feat choices selected yet.
                </div>
              </div>
            <div class="eldra-codex-soft rounded-none p-4">
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Class Features</div>
              <div class="mt-2 text-xl font-semibold text-white">{{ resolvedClass?.title || 'No linked class' }}</div>
              <p class="mt-3 text-sm leading-6 text-[#d8ceb8]">
                {{ resolvedClass?.featureCount ? `${resolvedClass.featureCount} imported class feature references are available.` : 'Select a class to resolve class features.' }}
              </p>
            </div>

            <div class="eldra-codex-soft rounded-none p-4">
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Species Traits</div>
              <div class="mt-2 text-xl font-semibold text-white">{{ resolvedSpecies?.title || 'No linked species' }}</div>
              <p class="mt-3 text-sm leading-6 text-[#d8ceb8]">
                {{ resolvedSpecies?.traits || 'Select a species to resolve species traits.' }}
              </p>
            </div>

            <div class="eldra-codex-soft rounded-none p-4">
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Background Feature</div>
              <div class="mt-2 text-xl font-semibold text-white">{{ resolvedBackground?.featureName || resolvedBackground?.title || 'No linked background' }}</div>
              <p class="mt-3 text-sm leading-6 text-[#d8ceb8]">
                {{ resolvedBackground?.featureDescription || 'Select a background to resolve its feature.' }}
              </p>
            </div>
          </section>

          <section
            v-else
            class="mt-6"
          >
            <div class="eldra-codex-soft rounded-none p-4">
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Notes</div>
              <p class="mt-3 text-sm leading-6 text-[#d8ceb8]">
                Notes and custom sheet annotations will live here after the next data pass.
              </p>
            </div>
          </section>
        </template>
      </section>
    </div>
  </div>
</template>
