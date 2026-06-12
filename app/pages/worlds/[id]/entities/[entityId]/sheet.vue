<script setup lang="ts">
import { renderMarkdown } from '~/utils/renderMarkdown'
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const router = useRouter()
const worldId = computed(() => String(route.params.id || ''))
const entityId = computed(() => String(route.params.entityId || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')
const sheetViewportWidth = ref(0)
const sheetPointerCoarse = ref(false)

function updateSheetViewportMode() {
  if (!import.meta.client) return

  sheetViewportWidth.value = window.innerWidth || 0
  sheetPointerCoarse.value = window.matchMedia?.('(pointer: coarse)').matches || false
}

const useCompactSheetLayout = computed(() => {
  const width = Number(sheetViewportWidth.value || 0)
  if (!width) return false

  return width < 768 || (sheetPointerCoarse.value && width <= 1366)
})

onMounted(() => {
  updateSheetViewportMode()
  window.addEventListener('resize', updateSheetViewportMode)
  window.addEventListener('orientationchange', updateSheetViewportMode)
})

onBeforeUnmount(() => {
  if (!import.meta.client) return

  window.removeEventListener('resize', updateSheetViewportMode)
  window.removeEventListener('orientationchange', updateSheetViewportMode)
})

const sheetSaving = ref(false)
const sheetSaveError = ref('')
const sheetSaveSuccess = ref('')

const choiceSaving = ref(false)
const choiceSaveError = ref('')
const choiceSaveSuccess = ref('')

const spellSaving = ref(false)
const spellSaveError = ref('')
const spellSaveSuccess = ref('')
const restSaving = ref(false)
const restSaveError = ref('')
const restSaveSuccess = ref('')
const restPopoverOpen = ref(false)
const spellKnownDraft = ref<string[]>([])
const spellPreparedDraft = ref<string[]>([])
const spellSearch = ref('')
const spellBuilderOpen = ref(false)
const spellBuilderAdvanced = ref(false)
const spellBuilderSearch = ref('')
const spellBuilderLevelFilter = ref('all')
const actionSpellLevelFilter = ref('all')
const actionPanelsOpen = reactive<Record<string, boolean>>({
  weapons: true,
  spells: true,
  common: true,
  bonus: false,
  reactions: false
})

const featurePanelsOpen = reactive<Record<string, boolean>>({
  class: true,
  upcoming: false,
  subclass: true,
  species: true,
  background: true,
  feats: true
})

const subclassFeatureCardsOpen = reactive<Record<string, boolean>>({})

const spellPanelsOpen = reactive<Record<string, boolean>>({
  prepared: true,
  known: true
})
const portraitLightboxOpen = ref(false)
const portraitUploadInput = ref<HTMLInputElement | null>(null)
const portraitUploading = ref(false)
const portraitUploadError = ref('')
const portraitUploadSuccess = ref('')
const hpDrawerOpen = ref(false)
const hpSaving = ref(false)
const hpSaveError = ref('')
const hpSaveSuccess = ref('')
const hpAmountDraft = ref('')
const hpCurrentDraft = ref('')
const hpTempDraft = ref('0')
const selectedSpellEntityId = ref<string | null>(null)
const selectedItemDetail = ref<any | null>(null)
const selectedFeatureDetail = ref<any | null>(null)
const diceBoxRef = ref<any | null>(null)
const noteSearch = ref('')
const noteSaving = ref(false)
const noteSaveError = ref('')
const noteSaveSuccess = ref('')
const noteDrawerOpen = ref(false)
const noteDrawerMode = ref<'view' | 'edit'>('view')
const selectedNoteDetail = ref<any | null>(null)
const noteDraft = reactive({
  id: '',
  title: '',
  body: ''
})
const choiceDrafts = ref<Record<string, string[]>>({})

const SHEET_TABS = [
  { key: 'overview', label: 'Overview', icon: 'i-lucide-layout-dashboard' },
  { key: 'stats', label: 'Stats', icon: 'i-lucide-activity' },
  { key: 'actions', label: 'Actions', icon: 'i-lucide-swords' },
  { key: 'inventory', label: 'Inventory', icon: 'i-lucide-backpack' },
  { key: 'spells', label: 'Spells', icon: 'i-lucide-sparkles' },
  { key: 'features', label: 'Features', icon: 'i-lucide-badge-plus' },
  { key: 'notes', label: 'Notes', icon: 'i-lucide-scroll-text' }
] as const

const standardActionCards = [
  {
    name: 'Attack',
    timing: 'Action',
    icon: 'i-lucide-swords',
    detail: 'Make one weapon or unarmed attack. Equipment-generated attacks will land after inventory is wired.'
  },
  {
    name: 'Cast a Spell',
    timing: 'Action',
    icon: 'i-lucide-sparkles',
    detail: 'Use a prepared spell, known cantrip, or feat spell from the Spell Actions section below.'
  },
  {
    name: 'Dash',
    timing: 'Action',
    icon: 'i-lucide-footprints',
    detail: 'Gain extra movement for the current turn equal to your speed.'
  },
  {
    name: 'Disengage',
    timing: 'Action',
    icon: 'i-lucide-route-off',
    detail: 'Your movement does not provoke opportunity attacks for the rest of this turn.'
  },
  {
    name: 'Dodge',
    timing: 'Action',
    icon: 'i-lucide-shield',
    detail: 'Attackers you can see have disadvantage until your next turn, and you have advantage on Dexterity saves.'
  },
  {
    name: 'Help',
    timing: 'Action',
    icon: 'i-lucide-handshake',
    detail: 'Aid another creature with an ability check or distract a foe to help an ally attack.'
  },
  {
    name: 'Hide',
    timing: 'Action',
    icon: 'i-lucide-eye-off',
    detail: 'Make a Dexterity (Stealth) check when you have cover, concealment, or another valid hiding condition.'
  },
  {
    name: 'Ready',
    timing: 'Action',
    icon: 'i-lucide-clock',
    detail: 'Choose a trigger and prepare an action to use before your next turn.'
  },
  {
    name: 'Use Object',
    timing: 'Action',
    icon: 'i-lucide-box',
    detail: 'Interact with an object, tool, item, or environmental feature.'
  }
]

const bonusActionCards = [
  {
    name: 'Bonus Action',
    timing: 'Bonus',
    icon: 'i-lucide-plus',
    detail: 'Class features, spells, and equipment will add bonus actions here as those systems come online.'
  }
]

const reactionActionCards = [
  {
    name: 'Opportunity Attack',
    timing: 'Reaction',
    icon: 'i-lucide-rotate-ccw',
    detail: 'When a hostile creature you can see leaves your reach, use your reaction to make one melee attack.'
  },
  {
    name: 'Reaction',
    timing: 'Reaction',
    icon: 'i-lucide-zap',
    detail: 'Spells, feats, class features, and item reactions will appear here later.'
  }
]

type SheetTab = typeof SHEET_TABS[number]['key']

const mobileSheetTabs = computed(() =>
  mode.value === 'build'
    ? SHEET_TABS
    : SHEET_TABS.filter((tab) => tab.key !== 'stats')
)

function normalizeSheetTab(value: any): SheetTab {
  const tab = String(Array.isArray(value) ? value[0] : value || 'overview')
  return SHEET_TABS.some((option) => option.key === tab) ? tab as SheetTab : 'overview'
}

const activeSheetTab = computed<SheetTab>(() => normalizeSheetTab(route.query.tab))
const levelUpOpen = ref(false)
const levelUpSaving = ref(false)
const levelUpApplied = ref(false)
const levelUpError = ref('')
const levelUpSuccess = ref('')
const levelUpTargetLevel = ref('')
const levelUpStartingLevel = ref('')
const levelUpStartingMaxHp = ref('')
const levelUpSubclassDraft = ref('')
const levelUpHpMode = ref<'fixed' | 'manual'>('fixed')
const levelUpManualMaxHp = ref('')

function setSheetTab(tab: SheetTab) {
  router.replace({
    path: route.path,
    query: {
      ...route.query,
      tab: tab === 'overview' ? undefined : tab
    }
  })
}

function actionPanelOpen(key: string) {
  return actionPanelsOpen[key] !== false
}

function toggleActionPanel(key: string) {
  actionPanelsOpen[key] = !actionPanelOpen(key)
}

function actionPanelChevron(key: string) {
  return actionPanelOpen(key) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
}

function spellPanelOpen(key: string) {
  return spellPanelsOpen[key] !== false
}

function toggleSpellPanel(key: string) {
  spellPanelsOpen[key] = !spellPanelOpen(key)
}

function spellPanelChevron(key: string) {
  return spellPanelOpen(key) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
}

function featurePanelOpen(key: string) {
  return featurePanelsOpen[key] !== false
}

function toggleFeaturePanel(key: string) {
  featurePanelsOpen[key] = !featurePanelOpen(key)
}

function featurePanelChevron(key: string) {
  return featurePanelOpen(key) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
}

function subclassFeatureCardKey(scope: string, feature: any, index: any) {
  return [
    scope,
    String(feature?.title || 'feature').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    String(feature?.level || 'x'),
    String(index)
  ].join(':')
}

function subclassFeatureDefaultOpen(scope: string, feature: any) {
  const level = Number(feature?.level || 0)

  if (scope === 'level') {
    return level > 0 && level <= levelUpTargetNumber.value
  }

  if (scope === 'sheet') {
    return level > 0 && level <= currentLevelNumber.value
  }

  return false
}

function subclassFeatureCardOpen(scope: string, feature: any, index: any) {
  const key = subclassFeatureCardKey(scope, feature, index)

  if (!Object.prototype.hasOwnProperty.call(subclassFeatureCardsOpen, key)) {
    return subclassFeatureDefaultOpen(scope, feature)
  }

  return subclassFeatureCardsOpen[key] !== false
}

function toggleSubclassFeatureCard(scope: string, feature: any, index: any) {
  const key = subclassFeatureCardKey(scope, feature, index)
  subclassFeatureCardsOpen[key] = !subclassFeatureCardOpen(scope, feature, index)
}

function subclassFeatureCardChevron(scope: string, feature: any, index: any) {
  return subclassFeatureCardOpen(scope, feature, index) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
}

function openFeatureDrawer(feature: any) {
  selectedFeatureDetail.value = feature || null
}

function closeFeatureDrawer() {
  selectedFeatureDetail.value = null
}

function featureEntriesText(value: any) {
  return cleanSpellText(spellEntriesToMarkdown(value))
}

function featureDescription(value: any) {
  return cleanSpellText(
    String(
      value?.description ??
      value?.text ??
      value?.benefits ??
      value?.featureDescription ??
      ''
    ).trim()
  ) ||
    featureEntriesText(value?.entries) ||
    featureEntriesText(value?.raw?.entries) ||
    cleanSpellText(String(value?.summary || '').trim())
}

function normalizeFeatureCard(value: any, fallbackType = 'Feature') {
  const raw = value?.raw || value || {}
  const level = Number(value?.level ?? raw?.level ?? 0)
  const title = String(
    value?.title ??
    value?.name ??
    raw?.name ??
    fallbackType
  )

  return {
    id: value?.id ?? `${fallbackType}-${title}-${level}`,
    title,
    type: String(value?.type || fallbackType),
    level: Number.isFinite(level) ? level : 0,
    source: value?.source ?? raw?.source ?? '',
    page: value?.page ?? raw?.page ?? '',
    description: featureDescription(value),
    articleUrl: value?.articleUrl || value?.url || '',
    raw
  }
}

const classFeatureCards = computed(() => {
  const payload = asObject(classFeaturePayload.value)
  const features = Array.isArray(payload.features)
    ? payload.features
    : Array.isArray(payload.items)
      ? payload.items
      : []

  return features
    .map((feature: any) => normalizeFeatureCard(feature, 'Class Feature'))
    .filter((feature: any) => feature.title)
    .sort((a: any, b: any) => {
      if (a.level !== b.level) return a.level - b.level
      return a.title.localeCompare(b.title)
    })
})

const currentClassFeatureCards = computed(() =>
  classFeatureCards.value.filter((feature: any) => !feature.level || feature.level <= Number(math.value?.level || sheet.value?.level || 1))
)

const upcomingClassFeatureCards = computed(() =>
  classFeatureCards.value.filter((feature: any) => feature.level > Number(math.value?.level || sheet.value?.level || 1))
)

function speciesTraitTitleAndDescription(chunk: string, index: number) {
  const rawChunk = String(chunk || '').trim()
  const cleanedChunk = cleanSpellText(rawChunk).trim()

  const headingMatch = rawChunk.match(/^#+\s*([^\n]+)\n?([\s\S]*)$/)
  const colonMatch = rawChunk.match(/^([^:\n]{3,80}):\s*([\s\S]*)$/)

  let title = headingMatch?.[1]?.trim() ||
    colonMatch?.[1]?.trim() ||
    `${resolvedSpecies.value?.title || 'Species'} Trait ${index + 1}`

  let description = headingMatch?.[2]?.trim() ||
    colonMatch?.[2]?.trim() ||
    rawChunk

  const knownTraitTitles = [
    'Draconic Ancestry',
    'Breath Weapon',
    'Damage Resistance',
    'Darkvision',
    'Draconic Flight',
    'Creature Type',
    'Size',
    'Speed',
    'Languages'
  ]

  const titleText = cleanSpellText(title).trim()
  const knownTitle = knownTraitTitles.find((candidate) =>
    titleText.toLowerCase().startsWith(candidate.toLowerCase())
  )

  if (knownTitle && titleText.length > knownTitle.length + 8) {
    title = knownTitle
    description = titleText.slice(knownTitle.length).trim() || description || cleanedChunk
  } else if (titleText.length > 80) {
    title = shortText(titleText, 64)
    description = cleanedChunk
  } else {
    title = titleText
  }

  return {
    title,
    description: cleanSpellText(description).trim() || cleanedChunk
  }
}

const speciesTraitCards = computed(() => {
  const cards: any[] = []
  const traitsText = String(resolvedSpecies.value?.traits || '').trim()

  if (traitsText) {
    const chunks = traitsText
      .split(/\n(?=#+\s+)|\n{2,}(?=[A-Z][A-Za-z'’ -]{2,}:?\s)/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)

    for (const [index, chunk] of chunks.entries()) {
      const parsed = speciesTraitTitleAndDescription(chunk, index)

      cards.push({
        id: `species-trait-${index}`,
        title: parsed.title,
        type: 'Species Trait',
        level: 0,
        source: resolvedSpecies.value?.source || '',
        page: resolvedSpecies.value?.page || '',
        description: parsed.description
      })
    }
  }

  if (!cards.length && resolvedSpecies.value?.title) {
    cards.push({
      id: 'species-traits',
      title: resolvedSpecies.value.title,
      type: 'Species Traits',
      description: 'No imported trait text found yet.'
    })
  }

  return cards
})

const backgroundFeatureCard = computed(() => {
  if (!resolvedBackground.value) return null

  return {
    id: 'background-feature',
    title: resolvedBackground.value.featureName || resolvedBackground.value.title || 'Background Feature',
    type: 'Background Feature',
    source: resolvedBackground.value.source || '',
    page: resolvedBackground.value.page || '',
    description: resolvedBackground.value.featureDescription || 'No imported background feature text found yet.'
  }
})

function featFeatureCard(feat: any) {
  return {
    id: feat.id,
    title: feat.title,
    type: 'Feat',
    source: feat.source || '',
    page: feat.page || '',
    description: feat.benefits || 'No feat description available yet.',
    articleUrl: feat.id ? `/worlds/${worldId.value}/entities/${feat.id}` : '',
    raw: feat
  }
}

function toggleMobileBuildMode() {
  mode.value = mode.value === 'build' ? 'play' : 'build'
}

const levelOptions = computed(() =>
  Array.from({ length: 20 }, (_, index) => ({
    value: String(index + 1),
    label: `Level ${index + 1}`
  }))
)

const currentLevelNumber = computed(() => {
  const parsed = Number(sheet.value?.level || sheetForm.level || 1)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1
})

const nextLevelNumber = computed(() => Math.min(20, currentLevelNumber.value + 1))

const levelUpTargetNumber = computed(() => {
  const parsed = Number(levelUpTargetLevel.value || nextLevelNumber.value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(20, Math.max(1, Math.floor(parsed))) : nextLevelNumber.value
})

const levelUpFeatureCards = computed(() =>
  classFeatureCards.value.filter((feature: any) =>
    Number(feature?.level || 0) === levelUpTargetNumber.value
  )
)

const levelUpFutureFeatureCards = computed(() =>
  classFeatureCards.value.filter((feature: any) =>
    Number(feature?.level || 0) > currentLevelNumber.value &&
    Number(feature?.level || 0) <= levelUpTargetNumber.value
  )
)

const levelUpChoiceCount = computed(() => mathPendingChoices.value.length)

function openLevelUpDrawer() {
  levelUpStartingLevel.value = String(currentLevelNumber.value)
  levelUpStartingMaxHp.value = String(currentComputedMaxHpNumber() || sheetForm.combatStats.maxHp || '')
  levelUpTargetLevel.value = String(nextLevelNumber.value)
  levelUpSubclassDraft.value = String(sheetForm.subclassName || sheet.value?.subclass_name || '')
  levelUpHpMode.value = 'fixed'
  levelUpManualMaxHp.value = String(levelUpFixedProjectedMaxHp.value || '')
  levelUpApplied.value = false
  levelUpError.value = ''
  levelUpSuccess.value = ''
  levelUpOpen.value = true
}

function closeLevelUpDrawer() {
  levelUpOpen.value = false
}

const levelUpStartingLevelNumber = computed(() => {
  const parsed = Number(levelUpStartingLevel.value || currentLevelNumber.value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : currentLevelNumber.value
})

const levelUpLevelDelta = computed(() =>
  Math.max(0, levelUpTargetNumber.value - levelUpStartingLevelNumber.value)
)

function levelUpClassKey() {
  return String(
    resolvedClass.value?.title ||
    sheet.value?.class_name ||
    sheetForm.className ||
    ''
  )
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const SUBCLASS_LEVEL_BY_CLASS: Record<string, number> = {
  artificer: 3,
  barbarian: 3,
  bard: 3,
  cleric: 3,
  druid: 3,
  fighter: 3,
  monk: 3,
  paladin: 3,
  ranger: 3,
  rogue: 3,
  sorcerer: 3,
  warlock: 3,
  wizard: 3
}

const SUBCLASS_LABEL_BY_CLASS: Record<string, string> = {
  artificer: 'Artificer Specialist',
  barbarian: 'Primal Path',
  bard: 'Bard College',
  cleric: 'Divine Domain',
  druid: 'Druid Circle',
  fighter: 'Martial Archetype',
  monk: 'Monastic Tradition',
  paladin: 'Sacred Oath',
  ranger: 'Ranger Archetype',
  rogue: 'Roguish Archetype',
  sorcerer: 'Sorcerous Origin',
  warlock: 'Otherworldly Patron',
  wizard: 'Arcane Tradition / Wizard Subclass'
}

const levelUpSubclassLevel = computed(() =>
  SUBCLASS_LEVEL_BY_CLASS[levelUpClassKey()] || 3
)

const levelUpSubclassLabel = computed(() =>
  SUBCLASS_LABEL_BY_CLASS[levelUpClassKey()] || 'Subclass'
)

function featureLooksLikeSubclassUnlock(feature: any) {
  const title = String(feature?.title || '').toLowerCase()
  const description = String(feature?.description || '').toLowerCase()

  return [
    'subclass',
    'arcane tradition',
    'primal path',
    'bard college',
    'divine domain',
    'druid circle',
    'martial archetype',
    'monastic tradition',
    'sacred oath',
    'roguish archetype',
    'sorcerous origin',
    'otherworldly patron'
  ].some((needle) => title.includes(needle) || description.includes(needle))
}

const levelUpSubclassUnlocked = computed(() => {
  const level = levelUpSubclassLevel.value
  const crossesSubclassLevel =
    levelUpStartingLevelNumber.value < level &&
    levelUpTargetNumber.value >= level

  return crossesSubclassLevel ||
    levelUpFutureFeatureCards.value.some((feature: any) => featureLooksLikeSubclassUnlock(feature))
})

const levelUpSyntheticUnlockCards = computed(() => {
  if (!levelUpSubclassUnlocked.value) return []

  const alreadyHasSubclassCard = levelUpFutureFeatureCards.value.some((feature: any) =>
    featureLooksLikeSubclassUnlock(feature)
  )

  if (alreadyHasSubclassCard) return []

  return [{
    id: 'synthetic-subclass-choice',
    title: levelUpSubclassLabel.value,
    level: levelUpSubclassLevel.value,
    source: 'Build',
    description: `Choose this character's ${levelUpSubclassLabel.value}. Enter the chosen subclass/tradition below.`
  }]
})

const levelUpUnlockCards = computed(() => [
  ...levelUpFutureFeatureCards.value,
  ...levelUpSyntheticUnlockCards.value
])

const levelUpPendingChoiceCards = computed(() =>
  mathPendingChoices.value.filter((choice: any) => !choice.complete)
)

const levelUpCompletedChoiceCards = computed(() =>
  mathPendingChoices.value.filter((choice: any) => choice.complete)
)

function currentComputedMaxHpNumber() {
  const candidates = [
    math.value?.combat?.hitPoints?.max,
    sheetForm.combatStats.maxHp,
    sheet.value?.combat_stats?.maxHp,
    sheet.value?.combat_stats?.max_hp,
    shownCombatStat('maxHp')
  ]

  for (const candidate of candidates) {
    const parsed = Number(candidate)
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
  }

  return 0
}

function levelUpHitDieFaces() {
  const text = String(
    resolvedClass.value?.hitDie ||
    shownCombatStat('hitDice') ||
    ''
  ).toLowerCase()

  const match = text.match(/d(\d+)/)
  if (!match) return 6

  const faces = Number(match[1])
  return Number.isFinite(faces) && faces > 0 ? faces : 6
}

function levelUpFixedHitDieAverage(faces: number) {
  const fixedAverages: Record<number, number> = {
    4: 3,
    6: 4,
    8: 5,
    10: 6,
    12: 7
  }

  return fixedAverages[faces] || Math.floor(faces / 2) + 1
}

const levelUpHpGainPerLevel = computed(() =>
  Math.max(1, levelUpFixedHitDieAverage(levelUpHitDieFaces()) + abilityModifierNumberForKey('con'))
)

const levelUpFixedProjectedMaxHp = computed(() => {
  const base = Number(levelUpStartingMaxHp.value || currentComputedMaxHpNumber() || 0)
  return Math.max(1, Math.floor(base + (levelUpHpGainPerLevel.value * levelUpLevelDelta.value)))
})

const levelUpProjectedMaxHp = computed(() => {
  if (levelUpHpMode.value === 'manual') {
    const parsed = Number(levelUpManualMaxHp.value)
    return Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : levelUpFixedProjectedMaxHp.value
  }

  return levelUpFixedProjectedMaxHp.value
})

const selectedLevelUpSubclassOption = computed(() =>
  subclassOptions.value.find((option: any) =>
    String(option?.name || '') === String(levelUpSubclassDraft.value || '')
  ) || null
)

const selectedLevelUpSubclassFeatures = computed(() =>
  Array.isArray(selectedLevelUpSubclassOption.value?.features)
    ? selectedLevelUpSubclassOption.value.features
    : []
)

const selectedLevelUpSubclassDescription = computed(() =>
  String(selectedLevelUpSubclassOption.value?.description || '').trim()
)

function normalizeSubclassLookup(value: any) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const resolvedSubclassName = computed(() =>
  String(
    sheet.value?.subclass_name ||
    sheet.value?.subclassName ||
    sheetForm.subclassName ||
    ''
  ).trim()
)

const resolvedSubclassOption = computed(() => {
  const selected = normalizeSubclassLookup(resolvedSubclassName.value)
  if (!selected) return null

  return subclassOptions.value.find((option: any) =>
    normalizeSubclassLookup(option?.name) === selected ||
    normalizeSubclassLookup(option?.shortName) === selected
  ) || null
})

const resolvedSubclassFeatureCards = computed(() =>
  Array.isArray(resolvedSubclassOption.value?.features)
    ? resolvedSubclassOption.value.features
    : []
)

const resolvedSubclassDescription = computed(() =>
  String(resolvedSubclassOption.value?.description || '').trim()
)

function openSpellBuilderFromLevelUp() {
  levelUpOpen.value = false
  openSpellBuilder()
}

async function applyLevelUp() {
  if (levelUpSaving.value) return

  const target = levelUpTargetNumber.value

  if (target === levelUpStartingLevelNumber.value) {
    levelUpError.value = 'Choose a different target level.'
    return
  }

  levelUpSaving.value = true
  levelUpError.value = ''
  levelUpSuccess.value = ''

  const projectedMaxHp = levelUpProjectedMaxHp.value
  const nextCombatStats = {
    ...sheetForm.combatStats
  }

  if (Number.isFinite(projectedMaxHp) && projectedMaxHp > 0) {
    nextCombatStats.maxHp = String(projectedMaxHp)
    nextCombatStats.currentHp = String(projectedMaxHp)
    nextCombatStats.tempHp = String(nextCombatStats.tempHp || '0')
  }

  const subclassName = levelUpSubclassDraft.value.trim() || sheetForm.subclassName

  try {
    const saved = await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/sheet`, {
      method: 'PATCH',
      body: baseSheetPatchBody({
        level: String(target),
        subclassName,
        combatStats: nextCombatStats
      })
    })

    data.value = saved as any
    syncFormFromSheet()
    syncSpellDraftsFromSheet()

    await nextTick()
    syncChoiceDrafts()

    levelUpApplied.value = true
    levelUpSuccess.value = `Level ${target} applied. HP set to ${projectedMaxHp}/${projectedMaxHp}. Review choices and spells below.`
  } catch (err: any) {
    levelUpError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to apply level up.'
  } finally {
    levelUpSaving.value = false
  }
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

const { data: spellOptionPayload } = await useFetch(() => `/api/worlds/${worldId.value}/spell-options`, {
  default: () => ({ items: [] }),
  watch: [worldId]
})

const { data: classFeaturePayload } = await useFetch(() => `/api/worlds/${worldId.value}/entities/${entityId.value}/class-features`, {
  default: () => ({ features: [] }),
  watch: [worldId, entityId]
})

const { data: subclassOptionPayload } = await useFetch(() => `/api/worlds/${worldId.value}/entities/${entityId.value}/sheet/subclass-options`, {
  default: () => ({ className: '', preferredSource: '', count: 0, subclasses: [] }),
  watch: [worldId, entityId]
})

const subclassOptions = computed(() =>
  Array.isArray((subclassOptionPayload.value as any)?.subclasses)
    ? (subclassOptionPayload.value as any).subclasses
    : []
)
const { data: selectedSpellDetail, pending: selectedSpellPending } = await useFetch(
  () => selectedSpellEntityId.value ? `/api/worlds/${worldId.value}/entities/${selectedSpellEntityId.value}` : null,
  {
    default: () => null,
    watch: [selectedSpellEntityId, worldId]
  }
)
const { data: charactersPresentationState } = await useFetch(() => `/api/worlds/${worldId.value}/presentation/characters`, {
  default: () => null,
  watch: [worldId]
})

const mobileSheetBackgroundImageUrl = computed(() => {
  const state: any = charactersPresentationState.value || null

  if (state?.backgroundImageUrl) return String(state.backgroundImageUrl)
  if (state?.backgroundFileId) return `/api/assets/${state.backgroundFileId}`

  return ''
})

const mobileSheetBackgroundStyle = computed(() => {
  const url = mobileSheetBackgroundImageUrl.value
  return url ? { backgroundImage: `url(${url})` } : {}
})

const entity = computed(() => data.value?.entity || null)
const sheet = computed(() => data.value?.sheet || null)
const inventory = computed(() => Array.isArray(data.value?.inventory) ? data.value.inventory : [])
const CURRENCY_DENOMINATIONS = [
  {
    key: 'gp',
    label: 'Gold',
    short: 'GP',
    rowName: 'Currency: Gold',
    icon: 'i-lucide-coins'
  },
  {
    key: 'sp',
    label: 'Silver',
    short: 'SP',
    rowName: 'Currency: Silver',
    icon: 'i-lucide-circle-dollar-sign'
  },
  {
    key: 'cp',
    label: 'Copper',
    short: 'CP',
    rowName: 'Currency: Copper',
    icon: 'i-lucide-circle-dot'
  }
] as const

const currencySaving = ref(false)
const currencySaveError = ref('')
const currencySaveSuccess = ref('')
const currencyLedgerOpen = ref(false)
const currencyDrafts = reactive<Record<string, string>>({
  pp: '0',
  gp: '0',
  sp: '0',
  cp: '0'
})

function isCurrencyInventoryItem(item: any) {
  const name = String(item?.name || '').trim().toLowerCase()
  return name.startsWith('currency:')
}

const currencyInventoryRows = computed(() =>
  inventory.value.filter((item: any) => isCurrencyInventoryItem(item))
)

const carriedInventory = computed(() =>
  inventory.value.filter((item: any) => !isCurrencyInventoryItem(item))
)

const inventoryCount = computed(() => carriedInventory.value.length)

function currencyRowFor(key: any) {
  const denom = CURRENCY_DENOMINATIONS.find((item) => item.key === key)
  if (!denom) return null

  return currencyInventoryRows.value.find((row: any) =>
    String(row?.name || '').trim().toLowerCase() === denom.rowName.toLowerCase()
  ) || null
}

function rowQuantityAmount(row: any) {
  const parsed = Number(row?.quantity || 0)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

function legacyPlatinumCurrencyRow() {
  return currencyInventoryRows.value.find((row: any) =>
    String(row?.name || '').trim().toLowerCase() === 'currency: platinum'
  ) || null
}

function legacyPlatinumAsGold() {
  return rowQuantityAmount(legacyPlatinumCurrencyRow()) * 10
}

function currencyAmount(key: any) {
  const amount = rowQuantityAmount(currencyRowFor(key))
  return key === 'gp' ? amount + legacyPlatinumAsGold() : amount
}

const currencyTotalCoins = computed(() =>
  CURRENCY_DENOMINATIONS.reduce((total, denom) => total + currencyAmount(denom.key), 0)
)

const currencySnapshot = computed(() =>
  CURRENCY_DENOMINATIONS
    .map((denom) => `${denom.key}:${currencyRowFor(denom.key)?.id || ''}:${currencyAmount(denom.key)}`)
    .join('|')
)

function syncCurrencyDrafts() {
  for (const denom of CURRENCY_DENOMINATIONS) {
    currencyDrafts[denom.key] = String(currencyAmount(denom.key))
  }
}

watch(
  currencySnapshot,
  () => {
    if (!currencySaving.value) syncCurrencyDrafts()
  },
  { immediate: true }
)

async function saveCurrencyAmount(denom: any) {
  if (currencySaving.value) return

  const key = String(denom?.key || '')
  if (!key) return

  let amount = Number(currencyDrafts[key] || 0)
  amount = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0
  currencyDrafts[key] = String(amount)

  const row = currencyRowFor(key)

  currencySaving.value = true
  currencySaveError.value = ''
  currencySaveSuccess.value = ''

  try {
    let result: any = null

    if (amount <= 0) {
      if (row?.id) {
        result = await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/sheet/inventory/${row.id}`, {
          method: 'DELETE'
        })
      }
    } else if (row?.id) {
      result = await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/sheet/inventory/${row.id}`, {
        method: 'PATCH',
        body: {
          quantity: amount
        }
      })
    } else {
      result = await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/sheet/inventory`, {
        method: 'POST',
        body: {
          name: denom.rowName,
          quantity: amount,
          container: 'currency',
          notes: 'Currency'
        }
      })
    }


    if (key === 'gp') {
      const platinumRow = legacyPlatinumCurrencyRow()
      if (platinumRow?.id) {
        result = await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/sheet/inventory/${platinumRow.id}`, {
          method: 'DELETE'
        })
      }
    }

    if (result) {
      await applyInventoryResult(result)
    }

    currencySaveSuccess.value = 'Currency updated.'
  } catch (err: any) {
    currencySaveError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to update currency.'
  } finally {
    currencySaving.value = false
  }
}
const inventorySaving = ref(false)
const inventorySaveError = ref('')
const inventorySaveSuccess = ref('')
const inventoryItemSearch = ref('')
const inventoryAddForm = reactive({
  itemEntityId: '',
  customName: '',
  quantity: '1',
  notes: ''
})
const featureCount = computed(() => {
  let count = 0
  if (resolvedClass.value?.featureCount) count += Number(resolvedClass.value.featureCount || 0)
  if (resolvedSubclassFeatureCards.value.length) count += resolvedSubclassFeatureCards.value.length
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
const itemOptions = computed(() => entityOptionsForTypes(['item']))

const filteredInventoryItemOptions = computed(() => {
  const q = inventoryItemSearch.value.trim().toLowerCase()
  const options = itemOptions.value || []

  return options
    .filter((option: any) => {
      if (!q) return true
      return String(option.title || '').toLowerCase().includes(q)
    })
    .slice(0, 150)
})

function inventoryLinkedItemId(item: any) {
  return String(
    item?.item_entity_id ??
    item?.itemEntityId ??
    item?.entity_item_id ??
    item?.item_id ??
    item?.linked_item_entity_id ??
    ''
  ).trim()
}

function inventoryQuantity(item: any) {
  const parsed = Number(item?.quantity || 1)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1
}

function inventoryLinkedItemOption(item: any) {
  const linkedId = inventoryLinkedItemId(item)
  if (!linkedId) return null

  return itemOptions.value.find((option: any) => String(option.id) === String(linkedId)) || null
}

function inventoryItemCore(item: any) {
  const option = inventoryLinkedItemOption(item)
  return option ? optionCore(option, 'item_core') || {} : {}
}

function inventoryItemTypeCode(item: any) {
  const core = inventoryItemCore(item)
  const raw = inventoryItemRaw(item)
  const rawType = String(
    item?.item_type ??
    item?.itemType ??
    core?.item_type ??
    core?.itemType ??
    raw?.type ??
    ''
  ).trim()

  return rawType.split('|')[0].trim().toUpperCase()
}

function inventoryItemTypeLabel(item: any) {
  const core = inventoryItemCore(item)
  const raw = inventoryItemRaw(item)
  const rawType = String(
    item?.item_type ??
    item?.itemType ??
    core?.item_type ??
    core?.itemType ??
    raw?.type ??
    ''
  ).trim()

  const normalized = inventoryItemTypeCode(item)
  const labels: Record<string, string> = {
    M: 'Melee Weapon',
    R: 'Ranged Weapon',
    A: 'Ammunition',
    LA: 'Light Armor',
    MA: 'Medium Armor',
    HA: 'Heavy Armor',
    S: 'Shield'
  }

  return labels[normalized] || rawType
}

function inventoryItemDamage(item: any) {
  const core = inventoryItemCore(item)

  return {
    damage: String(item?.damage ?? core?.damage ?? '').trim(),
    damageType: String(item?.damage_type ?? item?.damageType ?? core?.damage_type ?? core?.damageType ?? '').trim()
  }
}

function inventoryItemDetail(item: any) {
  const core = inventoryItemCore(item)
  const damage = inventoryItemDamage(item)
  const linkedItemId = inventoryLinkedItemId(item)

  return {
    id: item?.id,
    name: String(item?.name || core?.name || 'Item'),
    itemType: inventoryItemTypeLabel(item) || 'Item',
    damage: damage.damage,
    damageType: damageTypeLabel(damage.damageType),
    linkedItemId,
    rarity: String(core?.rarity || item?.rarity || '').trim(),
    weight: core?.weight ?? item?.weight ?? '',
    value: core?.value ?? item?.value ?? '',
    description: String(core?.description || item?.description || '').trim(),
    notes: item?.notes || ''
  }
}

function signedNumberText(value: any) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '—'
  return `${parsed >= 0 ? '+' : ''}${parsed}`
}

function abilityScoreNumberForKey(key: string) {
  const row = Array.isArray(math.value?.abilities)
    ? math.value.abilities.find((ability: any) => String(ability?.key) === key)
    : null

  const parsed = Number(row?.score ?? (abilityScores.value as any)?.[key] ?? 10)
  return Number.isFinite(parsed) ? parsed : 10
}

function abilityModifierNumberForKey(key: string) {
  return Math.floor((abilityScoreNumberForKey(key) - 10) / 2)
}

function proficiencyBonusNumber() {
  const parsed = Number(math.value?.proficiencyBonus)
  return Number.isFinite(parsed) ? parsed : 2
}

function inventoryItemRaw(item: any) {
  const option = inventoryLinkedItemOption(item)
  return option ? optionRawJson(option) || {} : {}
}

function weaponToken(value: any) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inventoryWeaponProperties(item: any) {
  const raw = inventoryItemRaw(item)
  const core = inventoryItemCore(item)
  const values = [
    ...(Array.isArray(raw?.property) ? raw.property : []),
    ...(Array.isArray(raw?.properties) ? raw.properties : []),
    ...(Array.isArray(core?.properties) ? core.properties : [])
  ]

  return values
    .map((value: any) => String(value || '').split('|')[0].trim().toUpperCase())
    .filter(Boolean)
}

function weaponHasProperty(item: any, property: string) {
  const wanted = String(property || '').trim().toUpperCase()
  return inventoryWeaponProperties(item).includes(wanted)
}

function weaponCategoryForItem(item: any) {
  const raw = inventoryItemRaw(item)
  const core = inventoryItemCore(item)

  return String(
    item?.weapon_category ??
    item?.weaponCategory ??
    core?.weapon_category ??
    core?.weaponCategory ??
    raw?.weaponCategory ??
    raw?.weapon_category ??
    ''
  )
    .split('|')[0]
    .trim()
    .toLowerCase()
}

function characterWeaponProficiencyText() {
  const proficiencies = asObject(sheet.value?.proficiencies)
  const classProficiencies = asObject(proficiencies.class)

  return [
    resolvedClass.value?.weaponProficiencies,
    proficiencies.weapons,
    proficiencies.weaponProficiencies,
    proficiencies.weapon_proficiencies,
    classProficiencies.weapons,
    classProficiencies.weaponProficiencies,
    classProficiencies.weapon_proficiencies
  ]
    .map((value) => weaponToken(value))
    .filter(Boolean)
    .join(' ')
}

function weaponIsProficient(item: any) {
  if (String(item?.id) === 'unarmed-strike') return true

  const text = characterWeaponProficiencyText()
  if (!text) return false

  if (text.includes('all weapons')) return true

  const category = weaponCategoryForItem(item)
  const typeCode = inventoryItemTypeCode(item).toLowerCase()

  if (category === 'simple' && text.includes('simple weapons')) return true
  if (category === 'martial' && text.includes('martial weapons')) return true
  if (typeCode === 'r' && text.includes('ranged weapons')) return true
  if (typeCode === 'm' && text.includes('melee weapons')) return true

  const name = weaponToken(item?.name)
  if (!name) return false

  const plural = name.endsWith('s') ? name : `${name}s`

  return text.includes(name) || text.includes(plural)
}

function weaponAttackAbilityKey(item: any) {
  if (String(item?.id) === 'unarmed-strike') return 'str'

  if (weaponHasProperty(item, 'F')) {
    return abilityModifierNumberForKey('dex') > abilityModifierNumberForKey('str')
      ? 'dex'
      : 'str'
  }

  const typeCode = inventoryItemTypeCode(item)

  if (typeCode === 'R') return 'dex'

  return 'str'
}

function weaponMagicAttackBonus(item: any) {
  const raw = inventoryItemRaw(item)
  const values = [
    raw?.bonusWeapon,
    raw?.bonusWeaponAttack,
    raw?.bonus,
    item?.bonusWeapon,
    item?.bonus
  ]

  for (const value of values) {
    if (value === null || value === undefined || value === '') continue

    const match = String(value).match(/[+-]?\d+/)
    if (!match) continue

    const parsed = Number(match[0])
    if (Number.isFinite(parsed)) return parsed
  }

  const nameMatch = String(item?.name || '').trim().match(/^([+-]\d+)/)
  if (nameMatch) {
    const parsed = Number(nameMatch[1])
    if (Number.isFinite(parsed)) return parsed
  }

  return 0
}

function attackBonusForWeapon(item: any) {
  const abilityKey = weaponAttackAbilityKey(item)
  const abilityMod = abilityModifierNumberForKey(abilityKey)
  const proficient = weaponIsProficient(item)
  const proficiency = proficient ? proficiencyBonusNumber() : 0
  const magicBonus = weaponMagicAttackBonus(item)

  return {
    abilityKey,
    abilityLabel: abilityKey.toUpperCase(),
    abilityMod,
    proficient,
    proficiency,
    magicBonus,
    total: abilityMod + proficiency + magicBonus
  }
}

function damageRollText(baseDamage: any, bonus: any) {
  const base = String(baseDamage || '').trim()
  const parsedBonus = Number(bonus)

  if (!base) {
    return Number.isFinite(parsedBonus) && parsedBonus !== 0 ? signedNumberText(parsedBonus) : ''
  }

  if (!Number.isFinite(parsedBonus) || parsedBonus === 0) return base

  return `${base} ${parsedBonus >= 0 ? '+' : '-'} ${Math.abs(parsedBonus)}`
}

function damageRollForWeapon(item: any, baseDamage: any) {
  const abilityKey = weaponAttackAbilityKey(item)
  const abilityLabel = abilityKey.toUpperCase()
  const abilityMod = abilityModifierNumberForKey(abilityKey)
  const magicBonus = weaponMagicAttackBonus(item)
  const totalBonus = abilityMod + magicBonus

  const formulaParts = [abilityLabel]
  if (magicBonus) formulaParts.push(signedNumberText(magicBonus))

  return {
    abilityKey,
    abilityLabel,
    abilityMod,
    magicBonus,
    totalBonus,
    totalBonusText: signedNumberText(totalBonus),
    formula: formulaParts.join(' '),
    rollText: damageRollText(baseDamage, totalBonus)
  }
}

function normalizeDiceBoxNotation(value: any) {
  const abilityMap: Record<string, string> = {
    STR: signedNumberText(abilityModifierNumberForKey('str')),
    DEX: signedNumberText(abilityModifierNumberForKey('dex')),
    CON: signedNumberText(abilityModifierNumberForKey('con')),
    INT: signedNumberText(abilityModifierNumberForKey('int')),
    WIS: signedNumberText(abilityModifierNumberForKey('wis')),
    CHA: signedNumberText(abilityModifierNumberForKey('cha')),
    PB: signedNumberText(proficiencyBonusNumber())
  }

  return String(value || '')
    .replace(/[−–—]/g, '-')
    .replace(/\b(STR|DEX|CON|INT|WIS|CHA|PB)\b/g, (token) => abilityMap[token] || token)
    .replace(/\s+/g, '')
    .replace(/\+\-/g, '-')
    .replace(/\-\+/g, '-')
    .replace(/\+\+/g, '+')
}

function diceBoxNotationWithBonus(base: string, bonus: any) {
  const parsed = Number(bonus || 0)

  if (!Number.isFinite(parsed) || parsed === 0) return normalizeDiceBoxNotation(base)

  return normalizeDiceBoxNotation(`${base}${parsed >= 0 ? '+' : ''}${parsed}`)
}

function rollDiceBox(notation: any, label = 'Roll', kind = 'Roll') {
  diceBoxRef.value?.rollDice({
    notation: normalizeDiceBoxNotation(notation),
    label,
    kind
  })
}

function rollWeaponAttack(weapon: any) {
  rollDiceBox(
    diceBoxNotationWithBonus('1d20', weapon?.attackBonus || 0),
    `${weapon?.name || 'Weapon'} Attack`,
    'Attack'
  )
}

function rollWeaponDamage(weapon: any) {
  rollDiceBox(
    weapon?.damage || weapon?.baseDamage || '1',
    `${weapon?.name || 'Weapon'} Damage`,
    'Damage'
  )
}

function rollSpellAttack(spell: any) {
  rollDiceBox(
    diceBoxNotationWithBonus('1d20', spellAttackBonus.value || 0),
    `${spell?.title || 'Spell'} Attack`,
    'Spell Attack'
  )
}

function numberFromSignedText(value: any) {
  if (value === null || value === undefined || value === '') return null

  const direct = Number(value)
  if (Number.isFinite(direct)) return direct

  const match = String(value).match(/[+-]?\d+/)
  if (!match) return null

  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function rowDisplayLabel(row: any, fallback = 'Roll') {
  return String(
    row?.label ??
    row?.name ??
    row?.title ??
    row?.key ??
    row?.ability ??
    fallback
  ).trim()
}

function rowAbilityKey(row: any) {
  return String(
    row?.key ??
    row?.abilityKey ??
    row?.ability_key ??
    row?.ability ??
    ''
  )
    .trim()
    .slice(0, 3)
    .toLowerCase()
}

function firstNumberFromRow(row: any, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key]
    const parsed = numberFromSignedText(value)

    if (parsed !== null) return parsed
  }

  return null
}

function d20NotationForBonus(bonus: any) {
  const parsed = Number(bonus || 0)
  return `1d20${parsed >= 0 ? '+' : ''}${parsed}`
}

function rollAbilityCheck(row: any) {
  const label = rowDisplayLabel(row, 'Ability').toUpperCase()
  const key = rowAbilityKey(row)

  const bonus = firstNumberFromRow(row, [
    'modifier',
    'modifierText',
    'modifier_text',
    'mod',
    'modText',
    'total',
    'totalText',
    'total_text'
  ])

  const resolvedBonus = bonus !== null
    ? bonus
    : key
      ? abilityModifierNumberForKey(key)
      : 0

  rollDiceBox(
    d20NotationForBonus(resolvedBonus),
    `${label} Check`,
    'Ability Check'
  )
}

function rollSavingThrow(row: any) {
  const label = rowDisplayLabel(row, 'Save').toUpperCase()
  const key = rowAbilityKey(row)

  const bonus = firstNumberFromRow(row, [
    'total',
    'totalText',
    'total_text',
    'modifier',
    'modifierText',
    'modifier_text',
    'mod',
    'modText'
  ])

  const resolvedBonus = bonus !== null
    ? bonus
    : key
      ? abilityModifierNumberForKey(key)
      : 0

  rollDiceBox(
    d20NotationForBonus(resolvedBonus),
    `${label} Save`,
    'Saving Throw'
  )
}

function rollSkillCheck(row: any) {
  const label = rowDisplayLabel(row, 'Skill')

  const bonus = firstNumberFromRow(row, [
    'total',
    'totalText',
    'total_text',
    'modifier',
    'modifierText',
    'modifier_text',
    'mod',
    'modText'
  ]) ?? 0

  rollDiceBox(
    d20NotationForBonus(bonus),
    `${label} Check`,
    'Skill Check'
  )
}

function damageTypeLabel(value: any) {
  const code = String(value || '').split('|')[0].trim().toUpperCase()
  const labels: Record<string, string> = {
    A: 'acid',
    B: 'bludgeoning',
    C: 'cold',
    F: 'fire',
    N: 'necrotic',
    P: 'piercing',
    I: 'poison',
    R: 'radiant',
    S: 'slashing',
    T: 'thunder',
    Y: 'psychic',
    O: 'force',
    L: 'lightning'
  }

  return labels[code] || String(value || '').trim()
}

function isWeaponInventoryItem(item: any) {
  const damage = inventoryItemDamage(item)
  if (damage.damage) return true

  const type = String(inventoryItemTypeLabel(item) || '').toLowerCase()
  return type.includes('weapon') || type === 'm' || type === 'r'
}

const equippedWeaponActions = computed(() => {
  const unarmedSource = { id: 'unarmed-strike', name: 'Unarmed Strike' }
  const unarmedStats = attackBonusForWeapon(unarmedSource)
  const unarmedDamage = damageRollForWeapon(unarmedSource, '1')

  const unarmedStrike = {
    id: 'unarmed-strike',
    name: 'Unarmed Strike',
    quantity: 1,
    itemType: 'Natural Attack',
    damage: unarmedDamage.rollText || '1',
    baseDamage: '1',
    damageFormula: unarmedDamage.formula,
    damageBonusText: unarmedDamage.totalBonusText,
    damageType: 'bludgeoning',
    linkedItemId: '',
    rarity: '',
    weight: '',
    value: '',
    description: 'You can make an unarmed strike with a free hand, fist, kick, headbutt, or similar forceful blow.',
    notes: '',
    attackBonus: unarmedStats.total,
    attackBonusText: signedNumberText(unarmedStats.total),
    attackFormula: `${unarmedStats.abilityLabel}${unarmedStats.proficient ? ' + PB' : ''}`,
    attackAbility: unarmedStats.abilityLabel,
    proficient: unarmedStats.proficient,
    magicBonus: unarmedStats.magicBonus
  }

  const equippedWeapons = inventory.value
    .filter((item: any) => item?.equipped && isWeaponInventoryItem(item))
    .map((item: any) => {
      const core = inventoryItemCore(item)
      const damage = inventoryItemDamage(item)
      const linkedItemId = inventoryLinkedItemId(item)
      const attackStats = attackBonusForWeapon(item)
      const damageStats = damageRollForWeapon(item, damage.damage)
      const attackFormulaParts = [
        attackStats.abilityLabel,
        attackStats.proficient ? 'PB' : '',
        attackStats.magicBonus ? signedNumberText(attackStats.magicBonus) : ''
      ].filter(Boolean)

      return {
        id: item.id,
        name: String(item.name || 'Weapon'),
        quantity: inventoryQuantity(item),
        itemType: inventoryItemTypeLabel(item) || 'Weapon',
        damage: damageStats.rollText || damage.damage,
        baseDamage: damage.damage,
        damageFormula: damageStats.formula,
        damageBonusText: damageStats.totalBonusText,
        damageType: damageTypeLabel(damage.damageType),
        linkedItemId,
        rarity: String(core?.rarity || item?.rarity || '').trim(),
        weight: core?.weight ?? item?.weight ?? '',
        value: core?.value ?? item?.value ?? '',
        description: String(core?.description || item?.description || '').trim(),
        notes: item.notes || '',
        attackBonus: attackStats.total,
        attackBonusText: signedNumberText(attackStats.total),
        attackFormula: attackFormulaParts.join(' + ') || attackStats.abilityLabel,
        attackAbility: attackStats.abilityLabel,
        proficient: attackStats.proficient,
        magicBonus: attackStats.magicBonus
      }
    })

  return [unarmedStrike, ...equippedWeapons]
})

function inventoryArmorClassValue(item: any) {
  const core = inventoryItemCore(item)
  const raw = inventoryItemRaw(item)

  const value = item?.armor_class ??
    item?.armorClass ??
    core?.armor_class ??
    core?.armorClass ??
    raw?.ac ??
    raw?.armorClass

  if (Array.isArray(value) && value.length) {
    const first = value[0]

    if (typeof first === 'number') return first
    if (first && typeof first === 'object' && typeof first.ac === 'number') return first.ac
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function equippedInventoryRows() {
  return inventory.value.filter((item: any) =>
    item?.equipped === true ||
    item?.equipped === 'true' ||
    item?.equipped === 1 ||
    item?.equipped === '1'
  )
}

function isShieldInventoryItem(item: any) {
  return inventoryItemTypeCode(item) === 'S'
}

function isArmorInventoryItem(item: any) {
  return ['LA', 'MA', 'HA'].includes(inventoryItemTypeCode(item))
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

  if (armorType === 'LA') return `${baseAc} + DEX modifier (${signedNumberText(dexMod)})${shieldText}.`
  if (armorType === 'MA') return `${baseAc} + DEX modifier max 2 (${signedNumberText(Math.min(dexMod, 2))})${shieldText}.`
  if (armorType === 'HA') return `${baseAc}${shieldText}.`

  return `${baseAc}${shieldText}.`
}

const equippedArmorClassCandidates = computed(() => {
  const dexMod = abilityModifierNumberForKey('dex')
  const equipped = equippedInventoryRows()
  const shields = equipped.filter(isShieldInventoryItem)
  const shieldBonus = shields.reduce((total: number, shield: any) =>
    total + (inventoryArmorClassValue(shield) || 2),
    0
  )
  const shieldNames = shields.map((shield: any) => String(shield?.name || 'Shield')).filter(Boolean)
  const candidates: any[] = []

  if (shieldBonus) {
    candidates.push({
      label: 'Unarmored + Shield',
      value: 10 + dexMod + shieldBonus,
      note: `10 + DEX modifier (${signedNumberText(dexMod)}) + ${shieldBonus} shield bonus${shieldNames.length ? ` (${shieldNames.join(', ')})` : ''}.`
    })
  }

  for (const armor of equipped.filter(isArmorInventoryItem)) {
    const baseAc = inventoryArmorClassValue(armor)
    if (!baseAc) continue

    const armorType = inventoryItemTypeCode(armor)
    const value = armorCandidateValue(baseAc, dexMod, shieldBonus, armorType)

    candidates.push({
      label: String(armor?.name || 'Armor'),
      value,
      note: armorCandidateNote(baseAc, dexMod, shieldBonus, armorType, shieldNames)
    })
  }

  return candidates
})

const displayedArmorClassCandidates = computed(() => {
  const rows = [
    ...(Array.isArray(math.value?.combat?.armorClass?.candidates) ? math.value.combat.armorClass.candidates : []),
    ...equippedArmorClassCandidates.value
  ]

  const best = rows.reduce((currentBest: any, candidate: any) => {
    const value = Number(candidate?.value)
    if (!Number.isFinite(value)) return currentBest
    if (!currentBest || value > Number(currentBest.value)) return candidate
    return currentBest
  }, null)

  return rows.map((candidate: any) => ({
    ...candidate,
    active: best && candidate.label === best.label && Number(candidate.value) === Number(best.value)
  }))
})

function bestArmorClassCandidate() {
  return displayedArmorClassCandidates.value.reduce((currentBest: any, candidate: any) => {
    const value = Number(candidate?.value)
    if (!Number.isFinite(value)) return currentBest
    if (!currentBest || value > Number(currentBest.value)) return candidate
    return currentBest
  }, null)
}

function selectedInventoryItemTitle() {
  const id = String(inventoryAddForm.itemEntityId || '')
  if (!id) return ''

  return itemOptions.value.find((option: any) => String(option.id) === id)?.title || ''
}

function resetInventoryAddForm() {
  inventoryAddForm.itemEntityId = ''
  inventoryAddForm.customName = ''
  inventoryAddForm.quantity = '1'
  inventoryAddForm.notes = ''
  inventoryItemSearch.value = ''
}

async function applyInventoryResult(result: any) {
  data.value = {
    ...(data.value as any || {}),
    inventory: Array.isArray(result?.inventory) ? result.inventory : inventory.value
  } as any

  await refresh()
}

async function addInventoryItem() {
  if (inventorySaving.value) return

  const selectedTitle = selectedInventoryItemTitle()
  const customName = String(inventoryAddForm.customName || '').trim()

  if (!inventoryAddForm.itemEntityId && !customName) {
    inventorySaveError.value = 'Choose an imported item or enter a custom item name.'
    return
  }

  inventorySaving.value = true
  inventorySaveError.value = ''
  inventorySaveSuccess.value = ''

  try {
    const result = await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/sheet/inventory`, {
      method: 'POST',
      body: {
        itemEntityId: inventoryAddForm.itemEntityId || null,
        name: selectedTitle || customName,
        quantity: inventoryAddForm.quantity || 1,
        notes: inventoryAddForm.notes || null
      }
    })

    await applyInventoryResult(result)
    resetInventoryAddForm()
    inventorySaveSuccess.value = 'Item added.'
  } catch (err: any) {
    inventorySaveError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to add item.'
  } finally {
    inventorySaving.value = false
  }
}

async function updateInventoryItem(item: any, patch: Record<string, any>) {
  if (!item?.id || inventorySaving.value) return

  inventorySaving.value = true
  inventorySaveError.value = ''
  inventorySaveSuccess.value = ''

  try {
    const result = await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/sheet/inventory/${item.id}`, {
      method: 'PATCH',
      body: patch
    })

    await applyInventoryResult(result)
    inventorySaveSuccess.value = 'Inventory updated.'
  } catch (err: any) {
    inventorySaveError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to update inventory.'
  } finally {
    inventorySaving.value = false
  }
}

async function changeInventoryQuantity(item: any, delta: number) {
  const next = Math.max(1, inventoryQuantity(item) + delta)
  await updateInventoryItem(item, { quantity: next })
}

async function toggleInventoryEquipped(item: any) {
  await updateInventoryItem(item, { equipped: !item?.equipped })
}

async function toggleInventoryAttuned(item: any) {
  await updateInventoryItem(item, { attuned: !item?.attuned })
}

async function removeInventoryItem(item: any) {
  if (!item?.id || inventorySaving.value) return

  const ok = import.meta.client
    ? window.confirm(`Remove ${item.name || 'this item'} from inventory?`)
    : true

  if (!ok) return

  inventorySaving.value = true
  inventorySaveError.value = ''
  inventorySaveSuccess.value = ''

  try {
    const result = await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/sheet/inventory/${item.id}`, {
      method: 'DELETE'
    })

    await applyInventoryResult(result)
    inventorySaveSuccess.value = 'Item removed.'
  } catch (err: any) {
    inventorySaveError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to remove item.'
  } finally {
    inventorySaving.value = false
  }
}
const featOptions = computed(() => entityOptionsForTypes(['feat']))
const spellOptions = computed(() => {
  const items = Array.isArray(spellOptionPayload.value?.items) ? spellOptionPayload.value.items : []

  if (items.length) {
    return items
      .map((option: any) => ({
        id: String(option?.id || ''),
        title: String(option?.title || 'Untitled Spell'),
        level: option?.level ?? null,
        source: option?.source || null,
        classes: Array.isArray(option?.classes) ? option.classes : [],
        classKeys: Array.isArray(option?.classKeys) ? option.classKeys : [],
        hasLookup: option?.hasLookup === true
      }))
      .filter((option: any) => option.id)
      .sort((a: any, b: any) => {
        const levelA = a.level ?? 999
        const levelB = b.level ?? 999
        if (levelA !== levelB) return levelA - levelB
        return a.title.localeCompare(b.title)
      })
  }

  return entityOptionsForTypes(['spell'])
})

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
function entityBlockByKey(entity: any, key: string) {
  const blocks = Array.isArray(entity?.blocks) ? entity.blocks : []
  return blocks.find((block: any) => String(block?.block_key || block?.blockKey || '') === key) || null
}

const selectedSpellCore = computed(() => entityBlockByKey(selectedSpellDetail.value, 'spell_core')?.data || null)
const selectedSpellRaw = computed(() => entityBlockByKey(selectedSpellDetail.value, 'import_source')?.data?.raw_json || null)

function cleanSpellText(value: any): string {
  return String(value || '')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat|classFeature|subclassFeature)\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/g, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function spellEntriesToMarkdown(value: any): string {
  if (!value) return ''

  if (typeof value === 'string') return cleanSpellText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    return value.map((entry) => spellEntriesToMarkdown(entry)).filter(Boolean).join('\n\n')
  }

  if (typeof value === 'object') {
    if (value.type === 'table' && Array.isArray(value.rows)) {
      const labels = Array.isArray(value.colLabels) ? value.colLabels.map(cleanSpellText) : []
      const rows = value.rows.map((row: any) =>
        Array.isArray(row)
          ? row.map((cell: any) => cleanSpellText(spellEntriesToMarkdown(cell))).join(' | ')
          : cleanSpellText(spellEntriesToMarkdown(row))
      )

      if (labels.length) {
        return [
          value.caption ? `**${cleanSpellText(value.caption)}**` : '',
          `| ${labels.join(' | ')} |`,
          `| ${labels.map(() => '---').join(' | ')} |`,
          ...rows.map((row: string) => `| ${row} |`)
        ].filter(Boolean).join('\n')
      }

      return rows.join('\n')
    }

    const parts: string[] = []

    if (value.name) parts.push(`## ${cleanSpellText(value.name)}`)
    if (value.entry) parts.push(cleanSpellText(value.entry))
    if (value.entries) parts.push(spellEntriesToMarkdown(value.entries))
    if (value.items) {
      const items = Array.isArray(value.items) ? value.items : [value.items]
      parts.push(items.map((item: any) => `- ${cleanSpellText(spellEntriesToMarkdown(item))}`).filter(Boolean).join('\n'))
    }

    return parts.filter(Boolean).join('\n\n')
  }

  return ''
}

const selectedSpellTitle = computed(() =>
  String(
    selectedSpellDetail.value?.title ||
    selectedSpellCore.value?.name ||
    selectedSpellRaw.value?.name ||
    'Spell'
  )
)

const selectedSpellDescription = computed(() =>
  cleanSpellText(String(selectedSpellCore.value?.description || '').trim()) ||
  spellEntriesToMarkdown(selectedSpellRaw.value?.entries) ||
  cleanSpellText(String(selectedSpellDetail.value?.summary || '').trim())
)

const selectedSpellHigherLevel = computed(() =>
  cleanSpellText(String(selectedSpellCore.value?.higher_level || selectedSpellCore.value?.higherLevel || '').trim()) ||
  spellEntriesToMarkdown(selectedSpellRaw.value?.entriesHigherLevel)
)

const selectedSpellArticleUrl = computed(() =>
  selectedSpellEntityId.value ? `/worlds/${worldId.value}/entities/${selectedSpellEntityId.value}` : ''
)

function formatSpellSchool(value: any) {
  const raw = cleanSpellText(value)
  const key = raw.toUpperCase()

  const labels: Record<string, string> = {
    A: 'Abjuration',
    C: 'Conjuration',
    D: 'Divination',
    E: 'Enchantment',
    V: 'Evocation',
    I: 'Illusion',
    N: 'Necromancy',
    T: 'Transmutation'
  }

  return labels[key] || raw
}
const selectedSpellMetaLines = computed(() => {
  const core = selectedSpellCore.value || {}
  const raw = selectedSpellRaw.value || {}
  const level = core.level ?? raw.level
  const school = core.school ?? raw.school
  const castingTime = core.casting_time ?? core.castingTime
  const range = core.range ?? raw.range
  const duration = core.duration ?? raw.duration
  const components = core.components ?? raw.components

  return [
    level !== undefined && level !== null && level !== '' ? `Level: ${Number(level) === 0 ? 'Cantrip' : level}` : '',
    school ? `School: ${formatSpellSchool(school)}` : '',
    castingTime ? `Casting: ${cleanSpellText(castingTime)}` : '',
    range ? `Range: ${cleanSpellText(range)}` : '',
    duration ? `Duration: ${cleanSpellText(duration)}` : '',
    components ? `Components: ${cleanSpellText(components)}` : '',
    core.ritual || raw?.meta?.ritual ? 'Ritual' : '',
    core.concentration || raw?.meta?.concentration ? 'Concentration' : ''
  ].filter(Boolean)
})

function openSpellDrawer(spell: any) {
  const id = String(spell?.id || '').trim()
  if (!id) return
  selectedSpellEntityId.value = id
}

function closeSpellDrawer() {
  selectedSpellEntityId.value = null
}

function openItemDrawer(item: any) {
  selectedItemDetail.value = item || null
}

function closeItemDrawer() {
  selectedItemDetail.value = null
}

function portraitUploadCharacterType() {
  const raw = String(entity.value?.entity_type || entity.value?.entityType || '').toLowerCase()

  if (raw === 'pc' || raw === 'player_character') return 'pc'
  if (raw === 'npc_sheet') return 'npc_sheet'

  return 'npc'
}

function handlePortraitClick() {
  portraitUploadError.value = ''
  portraitUploadSuccess.value = ''

  if (mode.value === 'build') {
    portraitUploadInput.value?.click()
    return
  }

  if (entityImageUrl.value) {
    portraitLightboxOpen.value = true
  }
}

async function handlePortraitUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file || portraitUploading.value) return

  portraitUploading.value = true
  portraitUploadError.value = ''
  portraitUploadSuccess.value = ''

  try {
    const formData = new FormData()
    formData.append('title', String(sheet.value?.name || entity.value?.title || 'Character'))
    formData.append('summary', String(entity.value?.summary || ''))
    formData.append('characterType', portraitUploadCharacterType())
    formData.append('image', file)

    await $fetch(`/api/worlds/${worldId.value}/characters/${entityId.value}/update`, {
      method: 'POST',
      body: formData
    })

    await refresh()

    portraitUploadSuccess.value = 'Portrait updated.'
  } catch (err: any) {
    portraitUploadError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to update portrait.'
  } finally {
    portraitUploading.value = false
    if (portraitUploadInput.value) {
      portraitUploadInput.value.value = ''
    }
  }
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

function normalizeNoteCards(value: any) {
  let raw = value

  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      raw = []
    }
  }

  if (!Array.isArray(raw)) return []

  return raw
    .map((note: any) => ({
      id: String(note?.id || ''),
      title: String(note?.title || 'Untitled Note'),
      body: String(note?.body || note?.text || note?.content || ''),
      createdAt: String(note?.createdAt || note?.created_at || ''),
      updatedAt: String(note?.updatedAt || note?.updated_at || note?.createdAt || note?.created_at || '')
    }))
    .filter((note: any) => note.id)
}

const sheetNoteCards = computed(() => {
  const choices = asObject(sheet.value?.choices)

  return normalizeNoteCards(
    sheet.value?.notes ??
    sheet.value?.note_cards ??
    sheet.value?.sheet_notes ??
    choices.__notes
  )
})

const filteredNoteCards = computed(() => {
  const q = noteSearch.value.trim().toLowerCase()
  const notes = [...sheetNoteCards.value]
    .sort((a: any, b: any) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))

  if (!q) return notes

  return notes.filter((note: any) =>
    [note.title, note.body]
      .filter(Boolean)
      .some((value: any) => String(value).toLowerCase().includes(q))
  )
})

function formatNoteDate(value: any) {
  const date = new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function resetNoteDraft() {
  noteDraft.id = ''
  noteDraft.title = ''
  noteDraft.body = ''
}

function fillNoteDraft(note: any) {
  noteDraft.id = String(note?.id || '')
  noteDraft.title = String(note?.title || '')
  noteDraft.body = String(note?.body || '')
}

function openAddNoteDrawer() {
  selectedNoteDetail.value = null
  resetNoteDraft()
  noteDrawerMode.value = 'edit'
  noteDrawerOpen.value = true
  noteSaveError.value = ''
  noteSaveSuccess.value = ''
}

function openNoteDetail(note: any) {
  selectedNoteDetail.value = note
  fillNoteDraft(note)
  noteDrawerMode.value = 'view'
  noteDrawerOpen.value = true
  noteSaveError.value = ''
  noteSaveSuccess.value = ''
}

function editCurrentNote() {
  if (selectedNoteDetail.value) fillNoteDraft(selectedNoteDetail.value)
  noteDrawerMode.value = 'edit'
}

function closeNoteDrawer() {
  noteDrawerOpen.value = false
  selectedNoteDetail.value = null
  resetNoteDraft()
}

function applyNoteResult(result: any) {
  if (!result) return

  data.value = {
    ...(data.value as any || {}),
    sheet: result.sheet || {
      ...(sheet.value || {}),
      notes: Array.isArray(result.notes) ? result.notes : sheetNoteCards.value
    }
  } as any
}

async function saveNoteCard() {
  if (noteSaving.value) return

  const title = noteDraft.title.trim()
  const body = noteDraft.body.trim()

  if (!title && !body) {
    noteSaveError.value = 'Note title or body is required.'
    return
  }

  noteSaving.value = true
  noteSaveError.value = ''
  noteSaveSuccess.value = ''

  try {
    const isUpdate = Boolean(noteDraft.id)
    const endpoint = isUpdate
      ? `/api/worlds/${worldId.value}/entities/${entityId.value}/sheet/notes/${noteDraft.id}`
      : `/api/worlds/${worldId.value}/entities/${entityId.value}/sheet/notes`

    const result = await $fetch(endpoint, {
      method: isUpdate ? 'PATCH' : 'POST',
      body: {
        title: title || 'Untitled Note',
        body
      }
    })

    applyNoteResult(result)
    noteSaveSuccess.value = isUpdate ? 'Note updated.' : 'Note added.'
    closeNoteDrawer()
  } catch (err: any) {
    noteSaveError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to save note.'
  } finally {
    noteSaving.value = false
  }
}

async function removeNoteCard(note: any = selectedNoteDetail.value) {
  if (!note?.id || noteSaving.value) return

  const ok = import.meta.client
    ? window.confirm(`Delete note "${note.title || 'Untitled Note'}"?`)
    : true

  if (!ok) return

  noteSaving.value = true
  noteSaveError.value = ''
  noteSaveSuccess.value = ''

  try {
    const result = await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/sheet/notes/${note.id}`, {
      method: 'DELETE'
    })

    applyNoteResult(result)
    noteSaveSuccess.value = 'Note deleted.'
    closeNoteDrawer()
  } catch (err: any) {
    noteSaveError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to delete note.'
  } finally {
    noteSaving.value = false
  }
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
    const draftValue = (sheetForm.combatStats as any)[key]
    if (!isBlankCombatValue(draftValue)) return draftValue
  }

  if (key === 'maxHp') {
    return math.value?.combat?.hitPoints?.max ?? ''
  }

  if (key === 'currentHp') {
    return math.value?.combat?.hitPoints?.current ?? ''
  }

  if (key === 'tempHp') {
    return math.value?.combat?.hitPoints?.temp ?? ''
  }


  if (key === 'armorClass') {
    return bestArmorClassCandidate()?.value ||
      math.value?.combat?.armorClass?.best?.value ||
      math.value?.combat?.armorClass?.current ||
      combatStats.value[key] ||
      ''
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

function headerSignedValue(value: any, fallback = '') {
  if (value === null || value === undefined || value === '') return fallback

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return String(value)

  return `${parsed >= 0 ? '+' : ''}${parsed}`
}

function headerCombatFallback(key: string) {
  const combatStats = asObject(sheet.value?.combat_stats)

  const candidates: Record<string, any[]> = {
    armorClass: [
      math.value?.combat?.armorClass?.current,
      math.value?.combat?.armorClass?.best?.value,
      combatStats.armorClass,
      combatStats.armor_class
    ],
    initiative: [
      math.value?.combat?.initiativeText,
      combatStats.initiative,
      abilityMod(shownAbilityScore('dex'))
    ],
    speed: [
      math.value?.combat?.speed,
      combatStats.speed,
      30
    ],
    proficiencyBonus: [
      math.value?.proficiencyBonusText,
      headerSignedValue(math.value?.proficiencyBonus, ''),
      '+2'
    ]
  }

  for (const candidate of candidates[key] || []) {
    const text = String(candidate ?? '').trim()
    if (text) return text
  }

  return '—'
}

const mobileHeaderStatCards = computed(() => [
  {
    key: 'armorClass',
    label: 'AC',
    value: shownCombatStat('armorClass') || headerCombatFallback('armorClass')
  },
  {
    key: 'initiative',
    label: 'Init',
    value: shownCombatStat('initiative') || headerCombatFallback('initiative')
  },
  {
    key: 'speed',
    label: 'Spd',
    value: shownCombatStat('speed') || headerCombatFallback('speed')
  },
  {
    key: 'proficiencyBonus',
    label: 'PB',
    value: math.value?.proficiencyBonusText || headerCombatFallback('proficiencyBonus')
  }
])

const hitPointMath = computed(() => asObject(math.value?.combat?.hitPoints))

const hpCurrentDisplay = computed(() => shownCombatStat('currentHp') || '—')
const hpMaxDisplay = computed(() => shownCombatStat('maxHp') || '—')
const hpTempDisplay = computed(() => {
  const temp = shownCombatStat('tempHp')
  return temp === '' || temp === null || temp === undefined ? '0' : temp
})

function hpNumberOrNull(value: any) {
  if (value === null || value === undefined || value === '') return null

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null

  return Math.floor(parsed)
}

function hpMaxNumber() {
  return hpNumberOrNull(hitPointMath.value.max ?? combatStats.value.maxHp ?? combatStats.value.max_hp)
}

function hpCurrentNumber() {
  return hpNumberOrNull(hitPointMath.value.current ?? combatStats.value.currentHp ?? combatStats.value.current_hp)
}

function hpTempNumber() {
  return Math.max(0, hpNumberOrNull(hitPointMath.value.temp ?? combatStats.value.tempHp ?? combatStats.value.temp_hp) ?? 0)
}

function clampCurrentHp(value: any) {
  const max = hpMaxNumber()
  const parsed = hpNumberOrNull(value)

  if (parsed === null) return max ?? 0
  if (max === null) return Math.max(0, parsed)

  return Math.max(0, Math.min(parsed, max))
}

function syncHpDrafts() {
  hpCurrentDraft.value = String(hpCurrentNumber() ?? hpMaxNumber() ?? 0)
  hpTempDraft.value = String(hpTempNumber())
  hpAmountDraft.value = ''
  hpSaveError.value = ''
  hpSaveSuccess.value = ''
}

watch(
  () => [
    sheet.value?.id,
    hitPointMath.value.current,
    hitPointMath.value.max,
    hitPointMath.value.temp
  ],
  () => {
    if (!hpDrawerOpen.value) syncHpDrafts()
  },
  { immediate: true }
)

function openHpDrawer() {
  syncHpDrafts()
  hpDrawerOpen.value = true
}

function closeHpDrawer() {
  hpDrawerOpen.value = false
}

async function applyHpDamage() {
  const amount = Math.max(0, hpNumberOrNull(hpAmountDraft.value) ?? 0)
  if (!amount) return

  let temp = Math.max(0, hpNumberOrNull(hpTempDraft.value) ?? 0)
  let current = clampCurrentHp(hpCurrentDraft.value)

  const tempDamage = Math.min(temp, amount)
  temp -= tempDamage
  current = Math.max(0, current - Math.max(0, amount - tempDamage))

  hpTempDraft.value = String(temp)
  hpCurrentDraft.value = String(current)
  hpAmountDraft.value = ''
  hpSaveSuccess.value = ''

  await saveHp()
}

async function applyHpHealing() {
  const amount = Math.max(0, hpNumberOrNull(hpAmountDraft.value) ?? 0)
  if (!amount) return

  const max = hpMaxNumber()
  const current = clampCurrentHp(hpCurrentDraft.value)
  const healed = max === null
    ? current + amount
    : Math.min(max, current + amount)

  hpCurrentDraft.value = String(healed)
  hpAmountDraft.value = ''
  hpSaveSuccess.value = ''

  await saveHp()
}

async function saveHp() {
  if (hpSaving.value) return

  hpSaving.value = true
  hpSaveError.value = ''
  hpSaveSuccess.value = ''

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
        combatStats: {
          ...sheetForm.combatStats,
          currentHp: String(clampCurrentHp(hpCurrentDraft.value)),
          tempHp: String(Math.max(0, hpNumberOrNull(hpTempDraft.value) ?? 0))
        }
      }
    })

    data.value = saved as any
    syncFormFromSheet()
    syncHpDrafts()
    hpSaveSuccess.value = 'HP saved.'
  } catch (err: any) {
    hpSaveError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to save HP.'
  } finally {
    hpSaving.value = false
  }
}
const mobileSheetSubtitle = computed(() => {
  const className = sheet.value?.class_name || resolvedClass.value?.title || sheetForm.className || 'Class'
  const speciesName = sheet.value?.species_name || resolvedSpecies.value?.title || sheetForm.speciesName || 'Species'
  const level = sheet.value?.level || sheetForm.level || 1

  return `${className} • ${speciesName} • Level ${level}`
})

const mobileQuickStats = computed(() => [
  {
    label: 'AC',
    value: shownCombatStat('armorClass') || '—'
  },
  {
    label: 'Init',
    value: shownCombatStat('initiative') || '—'
  },
  {
    label: 'Spd',
    value: shownCombatStat('speed') || '—'
  },
  {
    label: 'PB',
    value: math.value?.proficiencyBonusText || '+2'
  }
])

function tabCountLabel(tabKey: any) {
  const key = String(tabKey || '')

  if (key === 'stats' && mathPendingChoices.value.length) {
    return String(mathPendingChoices.value.length)
  }

  if (key === 'actions') {
    const count = shownPreparedSpells.value.length + featChoiceSpells.value.length
    return count ? String(count) : ''
  }

  if (key === 'inventory') {
    return String(inventoryCount.value || 0)
  }

  if (key === 'spells') {
    return String(selectedSpellCount.value || 0)
  }

  if (key === 'features' && featureCount.value) {
    return String(featureCount.value)
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
  if (option?.level !== null && option?.level !== undefined && option?.level !== '') {
    const optionLevel = Number(option.level)
    if (Number.isFinite(optionLevel)) return optionLevel
  }

  const core = optionCore(option, 'spell_core')
  const raw = optionRawJson(option)
  const level = Number(core?.level ?? raw?.level)

  return Number.isFinite(level) ? level : null
}

function spellClassesForOption(option: any) {
  if (Array.isArray(option?.classKeys) && option.classKeys.length) {
    return option.classKeys.map(normalizeFilterToken).filter(Boolean)
  }

  if (Array.isArray(option?.classes) && option.classes.length) {
    return option.classes.map(normalizeFilterToken).filter(Boolean)
  }

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

    if (!classes.length) return false

    if (!classRules.some((klass) => classes.includes(klass))) {
      return false
    }
  }

  return true
}
function sheetClassListNames() {
  return [
    resolvedClass.value?.title,
    sheet.value?.class_name,
    sheetForm.className
  ]
    .map(normalizeFilterToken)
    .filter(Boolean)
}

function spellAccessibleBySheetClass(option: any) {
  const classNames = sheetClassListNames()
  if (!classNames.length) return false

  const spellClasses = spellClassesForOption(option)
  if (!spellClasses.length) return false

  return classNames.some((klass) => spellClasses.includes(klass))
}

const availableKnownSpellOptions = computed(() =>
  spellOptions.value.filter((option: any) => spellAccessibleBySheetClass(option))
)

const availablePreparedSpellOptions = computed(() => {
  const knownIds = mode.value === 'build' ? spellKnownDraft.value : knownSpellIds.value
  const known = spellOptionsByIds(knownIds)

  return known.length ? known : availableKnownSpellOptions.value
})

const spellSlotRows = computed(() =>
  Array.isArray(math.value?.spellcasting?.slots) ? math.value.spellcasting.slots : []
)

const SPELLCASTING_ABILITY_BY_CLASS: Record<string, 'int' | 'wis' | 'cha'> = {
  artificer: 'int',
  bard: 'cha',
  cleric: 'wis',
  druid: 'wis',
  paladin: 'cha',
  ranger: 'wis',
  sorcerer: 'cha',
  warlock: 'cha',
  wizard: 'int'
}

const SPELLCASTING_ABILITY_LABELS: Record<string, string> = {
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA'
}

function normalizeSpellcastingAbilityKey(value: any) {
  const text = String(value || '').trim().toLowerCase()

  if (['int', 'intelligence'].includes(text)) return 'int'
  if (['wis', 'wisdom'].includes(text)) return 'wis'
  if (['cha', 'charisma'].includes(text)) return 'cha'

  return ''
}

function spellcastingAbilityFromText(value: any) {
  const text = String(value || '').trim().toLowerCase()

  if (text.includes('intelligence') || text.includes('int')) return 'int'
  if (text.includes('wisdom') || text.includes('wis')) return 'wis'
  if (text.includes('charisma') || text.includes('cha')) return 'cha'

  return ''
}

function classSpellcastingAbilityKey(value: any) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return SPELLCASTING_ABILITY_BY_CLASS[key] || ''
}

const spellcastingAbilityKey = computed(() => {
  const spellcasting = sheetSpellcasting.value

  return normalizeSpellcastingAbilityKey(
    spellcasting.ability ??
    spellcasting.spellcastingAbility ??
    spellcasting.spellcasting_ability
  ) ||
    classSpellcastingAbilityKey(resolvedClass.value?.title) ||
    classSpellcastingAbilityKey(sheet.value?.class_name) ||
    classSpellcastingAbilityKey(sheetForm.className) ||
    spellcastingAbilityFromText(resolvedClass.value?.primaryAbility)
})

const spellcastingAbilityLabel = computed(() =>
  SPELLCASTING_ABILITY_LABELS[spellcastingAbilityKey.value] || ''
)

const spellcastingAbilityScore = computed(() =>
  spellcastingAbilityKey.value ? abilityScoreNumberForKey(spellcastingAbilityKey.value) : 10
)

const spellcastingAbilityModifier = computed(() =>
  spellcastingAbilityKey.value ? abilityModifierNumberForKey(spellcastingAbilityKey.value) : 0
)

const spellSaveDc = computed(() =>
  spellcastingAbilityKey.value ? 8 + proficiencyBonusNumber() + spellcastingAbilityModifier.value : null
)

const spellAttackBonus = computed(() =>
  spellcastingAbilityKey.value ? proficiencyBonusNumber() + spellcastingAbilityModifier.value : null
)

const hasSpellcastingMath = computed(() =>
  Boolean(spellcastingAbilityKey.value && (spellSlotRows.value.length || actionSpellCards.value.length || selectedSpellCount.value))
)

const spellcastingStatCards = computed(() => {
  if (!hasSpellcastingMath.value) return []

  return [
    {
      key: 'ability',
      label: 'Ability',
      value: spellcastingAbilityLabel.value,
      note: `${spellcastingAbilityScore.value} (${signedNumberText(spellcastingAbilityModifier.value)})`
    },
    {
      key: 'save-dc',
      label: 'Save DC',
      value: spellSaveDc.value,
      note: '8 + PB + ability'
    },
    {
      key: 'spell-attack',
      label: 'Spell Attack',
      value: signedNumberText(spellAttackBonus.value),
      note: 'PB + ability'
    }
  ]
})

function worldEntityById(id: any) {
  const needle = String(id || '')
  if (!needle) return null

  return (Array.isArray(worldEntities.value) ? worldEntities.value : [])
    .find((item: any) => String(item?.id || '') === needle) || null
}

function spellActionCore(spell: any) {
  const entity = spell?.entity || worldEntityById(spell?.id)
  return entity ? optionCore({ entity }, 'spell_core') || {} : {}
}

function spellActionRaw(spell: any) {
  const entity = spell?.entity || worldEntityById(spell?.id)
  return entity ? optionRawJson({ entity }) || {} : {}
}

function spellActionText(spell: any) {
  const core = spellActionCore(spell)
  const raw = spellActionRaw(spell)

  return cleanSpellText([
    core?.description,
    core?.higher_level,
    core?.higherLevel,
    spellEntriesToMarkdown(raw?.entries),
    spellEntriesToMarkdown(raw?.entriesHigherLevel)
  ].filter(Boolean).join('\n\n')).toLowerCase()
}

function saveAbilityLabel(value: any) {
  const key = String(value || '').trim().toLowerCase()

  const labels: Record<string, string> = {
    str: 'STR',
    strength: 'STR',
    dex: 'DEX',
    dexterity: 'DEX',
    con: 'CON',
    constitution: 'CON',
    int: 'INT',
    intelligence: 'INT',
    wis: 'WIS',
    wisdom: 'WIS',
    cha: 'CHA',
    charisma: 'CHA'
  }

  return labels[key] || ''
}

function spellSaveAbilityLabel(spell: any) {
  const core = spellActionCore(spell)
  const raw = spellActionRaw(spell)

  const directValues = [
    core?.saving_throw,
    core?.savingThrow,
    raw?.savingThrow,
    raw?.save,
    raw?.saving_throw
  ]

  for (const value of directValues) {
    const values = Array.isArray(value) ? value : [value]

    for (const item of values) {
      const label = saveAbilityLabel(item)
      if (label) return label
    }
  }

  const text = spellActionText(spell)
  const match = text.match(/\b(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+saving throw\b/i)

  return match ? saveAbilityLabel(match[1]) : ''
}

function spellUsesAttackRoll(spell: any) {
  const core = spellActionCore(spell)
  const raw = spellActionRaw(spell)
  const text = spellActionText(spell)

  if (core?.spell_attack || core?.spellAttack || raw?.spellAttack || raw?.attack) return true

  return /\bspell attack\b/i.test(text)
}

function spellActionMechanic(spell: any) {
  if (spellUsesAttackRoll(spell)) {
    return {
      label: 'Spell Attack',
      value: signedNumberText(spellAttackBonus.value),
      note: 'd20 + spell attack'
    }
  }

  const save = spellSaveAbilityLabel(spell)
  if (save) {
    return {
      label: 'Save DC',
      value: String(spellSaveDc.value ?? '—'),
      note: `${save} save`
    }
  }

  return {
    label: 'Roll',
    value: '—',
    note: 'No attack/save detected'
  }
}

const limitedResourceLabel = computed(() => {
  if (spellSlotRows.value.length) return 'Spell Slots'
  return 'Resources'
})

const hasLimitedResources = computed(() => spellSlotRows.value.length > 0)

function slotLevelLabel(level: any) {
  const parsed = Number(level)
  if (!Number.isFinite(parsed)) return ''

  if (parsed === 1) return '1st'
  if (parsed === 2) return '2nd'
  if (parsed === 3) return '3rd'

  return `${parsed}th`
}

function usedSlotsObject() {
  const spellcasting = asObject(sheet.value?.spellcasting)
  return {
    ...asObject(spellcasting.usedSlots ?? spellcasting.used_slots)
  }
}

function spellcastingWithUsedSlots(usedSlots: Record<string, number>) {
  return {
    ...asObject(sheet.value?.spellcasting),
    knownSpellIds: knownSpellIds.value,
    preparedSpellIds: preparedSpellIds.value,
    alwaysPreparedSpellIds: alwaysPreparedSpellIds.value,
    usedSlots
  }
}

async function saveSpellSlotUsage(level: any, nextUsed: number) {
  if (spellSaving.value) return

  const slotLevel = String(level || '')
  if (!slotLevel) return

  const usedSlots = usedSlotsObject()
  usedSlots[slotLevel] = Math.max(0, Math.floor(Number(nextUsed || 0)))

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
        spellcasting: spellcastingWithUsedSlots(usedSlots)
      }
    })

    data.value = saved as any
    syncFormFromSheet()
    syncSpellDraftsFromSheet()
    spellSaveSuccess.value = 'Resources updated.'
  } catch (err: any) {
    spellSaveError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to update resources.'
  } finally {
    spellSaving.value = false
  }
}

function baseSheetPatchBody(overrides: Record<string, any> = {}) {
  return {
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
    ...overrides
  }
}

async function takeShortRest() {
  restSaveError.value = ''
  restSaveSuccess.value = 'Short rest noted. Hit Dice spending and short-rest resources come next.'
}

function resetUsedSpellSlotsForRest() {
  const resetSlots: Record<string, number> = {}

  for (let level = 1; level <= 9; level++) {
    resetSlots[String(level)] = 0
  }

  for (const row of spellSlotRows.value) {
    resetSlots[String(row.level)] = 0
  }

  return resetSlots
}

function closeRestPopover() {
  restPopoverOpen.value = false
}

async function takeLongRest() {
  if (restSaving.value) return

  restSaving.value = true
  restSaveError.value = ''
  restSaveSuccess.value = ''

  const maxHp = Number(shownCombatStat('maxHp') || sheetForm.combatStats.maxHp || 0)
  const nextCombatStats = {
    ...sheetForm.combatStats,
    tempHp: '0'
  }

  if (Number.isFinite(maxHp) && maxHp > 0) {
    nextCombatStats.maxHp = String(maxHp)
    nextCombatStats.currentHp = String(maxHp)
  }

  try {
    const saved = await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/sheet`, {
      method: 'PATCH',
      body: baseSheetPatchBody({
        combatStats: nextCombatStats,
        spellcasting: spellcastingWithUsedSlots(resetUsedSpellSlotsForRest())
      })
    })

    data.value = saved as any
    syncFormFromSheet()
    syncSpellDraftsFromSheet()
    restSaveSuccess.value = 'Long rest complete.'
    closeRestPopover()
  } catch (err: any) {
    restSaveError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to complete long rest.'
  } finally {
    restSaving.value = false
  }
}

function slotGemAvailable(row: any, index: number) {
  return index >= Number(row?.used || 0)
}

function slotGemClass(row: any, index: number) {
  if (!slotGemAvailable(row, index)) {
    return 'border-[rgba(148,163,184,0.35)] bg-transparent opacity-50'
  }

  const level = Number(row?.level || 0)
  const colors: Record<number, string> = {
    1: 'border-sky-200/80 bg-sky-300/80 shadow-[0_0_10px_rgba(125,211,252,0.28)]',
    2: 'border-cyan-200/80 bg-cyan-300/80 shadow-[0_0_10px_rgba(103,232,249,0.26)]',
    3: 'border-emerald-200/80 bg-emerald-300/80 shadow-[0_0_10px_rgba(110,231,183,0.24)]',
    4: 'border-violet-200/80 bg-violet-300/80 shadow-[0_0_10px_rgba(196,181,253,0.24)]',
    5: 'border-fuchsia-200/80 bg-fuchsia-300/80 shadow-[0_0_10px_rgba(240,171,252,0.24)]',
    6: 'border-rose-200/80 bg-rose-300/80 shadow-[0_0_10px_rgba(253,164,175,0.24)]',
    7: 'border-amber-200/80 bg-amber-300/80 shadow-[0_0_10px_rgba(252,211,77,0.24)]',
    8: 'border-orange-200/80 bg-orange-300/80 shadow-[0_0_10px_rgba(253,186,116,0.24)]',
    9: 'border-white/80 bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.22)]'
  }

  return colors[level] || 'border-[#f5e7bd]/80 bg-[#c9a45a]/80'
}

async function toggleSpellSlot(row: any, index: number) {
  const max = Number(row?.max || 0)
  const used = Number(row?.used || 0)
  if (!max) return

  const nextUsed = slotGemAvailable(row, index)
    ? Math.min(max, used + 1)
    : Math.max(0, used - 1)

  await saveSpellSlotUsage(row.level, nextUsed)
}

function lowestAvailableSlotRowForSpell(spell: any) {
  const spellLevel = Number(spellLevelForOption(spell) || 0)
  if (!spellLevel) return null

  return spellSlotRows.value.find((row: any) =>
    Number(row.level) >= spellLevel &&
    Number(row.available || 0) > 0
  ) || null
}

function spellConsumesSlot(spell: any) {
  return Number(spellLevelForOption(spell) || 0) > 0
}

function canCastSpell(spell: any) {
  return !spellConsumesSlot(spell) || Boolean(lowestAvailableSlotRowForSpell(spell))
}

async function castSpell(spell: any) {
  const spellLevel = Number(spellLevelForOption(spell) || 0)

  if (spellLevel <= 0) {
    spellSaveError.value = ''
    spellSaveSuccess.value = 'Spell cast.'
    return
  }

  const row = lowestAvailableSlotRowForSpell(spell)
  if (!row) return

  await saveSpellSlotUsage(row.level, Number(row.used || 0) + 1)
}

const shownKnownSpells = computed(() =>
  mode.value === 'build' ? spellOptionsByIds(spellKnownDraft.value) : knownSpells.value
)

const shownPreparedSpells = computed(() =>
  mode.value === 'build' ? spellOptionsByIds(spellPreparedDraft.value) : preparedSpells.value
)

const actionSpellCards = computed(() => {
  const seen = new Set<string>()
  const cards: any[] = []

  function addSpell(spell: any, actionKind: string) {
    const id = String(spell?.id || '')
    if (!id || seen.has(id)) return

    seen.add(id)
    cards.push({
      ...spell,
      actionKind
    })
  }

  for (const spell of shownPreparedSpells.value) {
    addSpell(spell, 'Prepared')
  }

  for (const spell of shownKnownSpells.value) {
    if (Number(spellLevelForOption(spell)) === 0) {
      addSpell(spell, 'Cantrip')
    }
  }

  for (const spell of featChoiceSpells.value) {
    addSpell(spell, 'Feat')
  }

  return cards
})

const commonActionCards = computed(() => {
  let actions = [...standardActionCards]

  if (actionSpellCards.value.length) {
    actions = actions.filter((action) => action.name !== 'Cast a Spell')
  }

  if (equippedWeaponActions.value.length) {
    actions = actions.filter((action) => action.name !== 'Attack')
  }

  return actions
})

function actionSpellLevelKey(level: any) {
  const parsed = Number(level)
  return Number.isFinite(parsed) ? `level-${parsed}` : 'unknown'
}

function actionSpellLevelLabel(level: any) {
  const parsed = Number(level)

  if (!Number.isFinite(parsed)) return 'Unknown'
  if (parsed === 0) return 'Cantrips'
  if (parsed === 1) return '1st Level'
  if (parsed === 2) return '2nd Level'
  if (parsed === 3) return '3rd Level'

  return `${parsed}th Level`
}

const actionSpellLevelFilters = computed(() => {
  const counts = new Map<string, { key: string; label: string; level: number; count: number }>()

  for (const spell of actionSpellCards.value) {
    const level = Number(spellLevelForOption(spell) ?? -1)
    const key = actionSpellLevelKey(level)

    if (!counts.has(key)) {
      counts.set(key, {
        key,
        label: actionSpellLevelLabel(level),
        level,
        count: 0
      })
    }

    counts.get(key)!.count += 1
  }

  const levelFilters = Array.from(counts.values())
    .sort((a, b) => a.level - b.level)

  return [
    {
      key: 'all',
      label: 'All',
      count: actionSpellCards.value.length
    },
    ...levelFilters
  ]
})

const filteredActionSpellCards = computed(() => {
  if (actionSpellLevelFilter.value === 'all') return actionSpellCards.value

  return actionSpellCards.value.filter((spell: any) =>
    actionSpellLevelKey(spellLevelForOption(spell)) === actionSpellLevelFilter.value
  )
})

watch(
  actionSpellLevelFilters,
  (filters) => {
    if (!filters.some((filter) => filter.key === actionSpellLevelFilter.value)) {
      actionSpellLevelFilter.value = 'all'
    }
  },
  { immediate: true }
)

function removeKnownSpell(id: any) {
  const needle = String(id || '')
  if (!needle) return

  spellKnownDraft.value = spellKnownDraft.value.filter((spellId) => String(spellId) !== needle)
  spellPreparedDraft.value = spellPreparedDraft.value.filter((spellId) => String(spellId) !== needle)
}

function removePreparedSpell(id: any) {
  const needle = String(id || '')
  if (!needle) return

  spellPreparedDraft.value = spellPreparedDraft.value.filter((spellId) => String(spellId) !== needle)
}
const spellSearchQuery = computed(() => spellSearch.value.trim().toLowerCase())

function spellOptionLevelLabel(option: any) {
  const level = spellLevelForOption(option)

  if (level === null) return ''
  return level === 0 ? 'Cantrip' : `Level ${level}`
}

function spellSearchMatches(option: any) {
  const q = spellSearchQuery.value
  if (!q) return true

  return [
    option?.title,
    spellOptionLevelLabel(option),
    spellClassesForOption(option).join(' ')
  ]
    .filter(Boolean)
    .some((value: any) => String(value).toLowerCase().includes(q))
}

function isKnownSpell(id: any) {
  const needle = String(id || '')
  if (!needle) return false

  return spellKnownDraft.value.some((spellId) => String(spellId) === needle)
}

function isPreparedSpell(id: any) {
  const needle = String(id || '')
  if (!needle) return false

  return spellPreparedDraft.value.some((spellId) => String(spellId) === needle)
}

function addKnownSpell(id: any) {
  const needle = String(id || '')
  if (!needle || isKnownSpell(needle)) return

  spellKnownDraft.value = [...spellKnownDraft.value, needle]
}

function prepareSpell(id: any) {
  const needle = String(id || '')
  if (!needle) return

  if (!isKnownSpell(needle)) {
    spellKnownDraft.value = [...spellKnownDraft.value, needle]
  }

  if (!isPreparedSpell(needle)) {
    spellPreparedDraft.value = [...spellPreparedDraft.value, needle]
  }
}

const availableSpellCards = computed(() => {
  const known = new Set(spellKnownDraft.value.map((id) => String(id)))

  return availableKnownSpellOptions.value
    .filter((option: any) => !known.has(String(option.id)))
    .filter((option: any) => spellSearchMatches(option))
})

function openSpellBuilder() {
  spellBuilderOpen.value = true
  spellSaveError.value = ''
  spellSaveSuccess.value = ''

  // The legacy desktop builder uses spellSearch. Keep the mobile drawer independent,
  // but clear the legacy filter so Recommended spells are not accidentally hidden.
  spellSearch.value = ''
}

function closeSpellBuilder() {
  spellBuilderOpen.value = false
}

function spellBuilderSpellId(spell: any) {
  return String(spell?.id ?? spell?.entity?.id ?? '').trim()
}

function spellBuilderTitle(spell: any) {
  return String(spell?.title ?? spell?.entity?.title ?? spell?.name ?? 'Spell')
}

function spellBuilderCore(spell: any) {
  if (spell?.entity) return optionCore({ entity: spell.entity }, 'spell_core') || {}
  return optionCore(spell, 'spell_core') || {}
}

function spellBuilderRaw(spell: any) {
  if (spell?.entity) return optionRawJson({ entity: spell.entity }) || {}
  return optionRawJson(spell) || {}
}

function spellBuilderLevel(spell: any) {
  const core = spellBuilderCore(spell)
  const raw = spellBuilderRaw(spell)
  const value = spell?.level ?? core?.level ?? raw?.level
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : -1
}

function spellBuilderLevelText(spell: any) {
  const level = spellBuilderLevel(spell)
  if (level === 0) return 'Cantrip'
  if (level > 0) return `${level}${level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th'} Level`

  return spellOptionLevelLabel(spell) || 'Spell'
}

function spellBuilderIsRecommended(spell: any) {
  const id = spellBuilderSpellId(spell)
  if (!id) return false

  return availableSpellCards.value.some((option: any) =>
    String(option?.id || option?.entity?.id || '') === id
  )
}

function spellBuilderIsKnown(spell: any) {
  const id = spellBuilderSpellId(spell)
  return Boolean(id && knownSpellIds.value.includes(id))
}

function spellBuilderIsPrepared(spell: any) {
  const id = spellBuilderSpellId(spell)
  return Boolean(id && preparedSpellIds.value.includes(id))
}

const allImportedSpellCards = computed(() => {
  const entities = Array.isArray(worldEntities.value) ? worldEntities.value : []

  return entities
    .filter((entity: any) => String(entity?.entity_type || entity?.entityType || '').toLowerCase() === 'spell')
    .map((entity: any) => ({
      id: entity.id,
      title: entity.title,
      entity
    }))
    .sort((a: any, b: any) => spellBuilderTitle(a).localeCompare(spellBuilderTitle(b)))
})

const spellBuilderLevelOptions = computed(() => {
  const source = spellBuilderAdvanced.value ? allImportedSpellCards.value : availableSpellCards.value
  const levels = Array.from(new Set(
    source
      .map((spell: any) => spellBuilderLevel(spell))
      .filter((level: any) => Number.isFinite(Number(level)) && Number(level) >= 0)
      .map((level: any) => Number(level))
  )).sort((a, b) => a - b)

  return [
    { key: 'all', label: 'All' },
    ...levels.map((level) => ({
      key: String(level),
      label: level === 0 ? 'Cantrips' : `${level}${level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th'}`
    }))
  ]
})

const filteredSpellBuilderCards = computed(() => {
  const q = spellBuilderSearch.value.trim().toLowerCase()
  const levelFilter = spellBuilderLevelFilter.value
  const source = spellBuilderAdvanced.value ? allImportedSpellCards.value : availableSpellCards.value

  return source
    .filter((spell: any) => {
      if (!q) return true
      return spellBuilderTitle(spell).toLowerCase().includes(q)
    })
    .filter((spell: any) => {
      if (levelFilter === 'all') return true
      return String(spellBuilderLevel(spell)) === String(levelFilter)
    })
    .slice(0, 200)
})

function confirmOffListSpell(spell: any, action: string) {
  if (spellBuilderIsRecommended(spell)) return true

  if (!import.meta.client) return true

  return window.confirm(
    `${spellBuilderTitle(spell)} is not normally available to ${resolvedClass.value?.title || sheet.value?.class_name || 'this class'}. ${action} anyway as an advanced override?`
  )
}

function addSpellFromBuilder(spell: any) {
  const id = spellBuilderSpellId(spell)
  if (!id) return

  if (!confirmOffListSpell(spell, 'Add')) return

  addKnownSpell(id)
}

function prepareSpellFromBuilder(spell: any) {
  const id = spellBuilderSpellId(spell)
  if (!id) return

  if (!confirmOffListSpell(spell, 'Prepare')) return

  if (!knownSpellIds.value.includes(id)) {
    addKnownSpell(id)
  }

  prepareSpell(id)
}

const knownSpellCards = computed(() =>
  shownKnownSpells.value.filter((option: any) => spellSearchMatches(option))
)

const preparedSpellCards = computed(() =>
  shownPreparedSpells.value.filter((option: any) => spellSearchMatches(option))
)

const featChoiceSpellCards = computed(() =>
  featChoiceSpells.value.filter((option: any) => spellSearchMatches(option))
)

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

  <input
    ref="portraitUploadInput"
    type="file"
    accept="image/*"
    class="hidden"
    @change="handlePortraitUpload"
  >
  <div
    :class="{ 'eldra-sheet-compact': useCompactSheetLayout }"
    class="eldra-mobile-sheet-root fixed inset-0 z-[9999] h-[100dvh] overflow-y-auto bg-[#05080d] md:relative md:inset-auto md:z-auto md:h-full md:bg-transparent"
  >

    <!-- Mobile Sheet Owned Background -->
    <div class="sheet-owned-bg pointer-events-none fixed inset-0 z-0 md:hidden">
      <div
        v-if="mobileSheetBackgroundImageUrl"
        class="absolute inset-0 bg-cover bg-center opacity-95"
        :style="mobileSheetBackgroundStyle"
      ></div>

      <div
        v-else
        class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(48,68,92,0.48),rgba(5,10,16,1)_62%)]"
      ></div>

      <div class="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(3,6,10,0.18),rgba(3,6,10,0.36))]"></div>
      <div class="absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(to_top,rgba(3,6,10,0.48),transparent)]"></div>
    </div>
    <div
        :class="(selectedSpellEntityId || selectedItemDetail) ? 'md:pr-[460px]' : ''"
        class="relative z-10 mx-auto w-full max-w-[1100px] p-3 pb-28 transition-all duration-200 md:p-6"
      >


        <!-- Mobile Sheet Header -->
        <div class="sheet-mobile-only sticky top-0 z-40 -mx-3 mb-3 border-b border-[rgba(201,164,90,0.20)] bg-[rgba(7,13,20,0.90)] px-3 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur md:hidden">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-[10px] uppercase tracking-[0.32em] text-[#9f9278]">Character Sheet</div>
              <div class="mt-1 truncate text-2xl font-semibold leading-tight text-white">
                {{ sheet?.name || entity?.title || 'Character' }}
              </div>
              <div class="mt-1 truncate text-xs text-[#d8ceb8]">
                {{ mobileSheetSubtitle }}
              </div>
            </div>

            <div class="flex shrink-0 items-start gap-1.5">
              <!-- Mobile Header Action Buttons -->
              <div class="flex shrink-0 flex-col items-end gap-1.5">
                <div class="flex items-start justify-end gap-1.5">
                <NuxtLink
                  :to="`/worlds/${worldId}/entities/${entityId}`"
                  class="rounded-none border border-[rgba(201,164,90,0.32)] bg-[rgba(20,17,12,0.82)] px-2 py-1.5 text-[11px] font-semibold text-[#fff7df]"
                >
                  Back
                </NuxtLink>

                <button
                  type="button"
                  title="Toggle mobile build mode"
                  class="rounded-none border border-[rgba(201,164,90,0.32)] bg-[rgba(20,17,12,0.82)] px-2 py-1.5 text-[11px] font-semibold text-[#fff7df]"
                  @click="toggleMobileBuildMode"
                >
                  {{ mode === 'build' ? 'Play' : 'Build' }}
                </button>

                <button
                  v-if="mode === 'build'"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.32)] bg-[rgba(201,164,90,0.14)] px-2 py-1.5 text-[11px] font-semibold text-[#fff7df] disabled:opacity-50"
                  :disabled="sheetSaving"
                  @click="saveSheet"
                >
                  Save
                </button>

                </div>

                <div class="relative">
                  <button
                    type="button"
                    title="Rest controls"
                    class="inline-flex h-8 items-center gap-1 rounded-none border border-[rgba(201,164,90,0.32)] bg-[rgba(20,17,12,0.82)] px-2.5 text-[11px] font-semibold text-[#fff7df] transition hover:border-[rgba(245,231,189,0.75)]"
                    @click.stop="restPopoverOpen = !restPopoverOpen"
                  >
                    <UIcon name="i-lucide-campfire" class="h-3.5 w-3.5" />
                    <span>Rest</span>
                  </button>

                  <!-- Compact Rest Popover -->
                  <div
                    v-if="restPopoverOpen"
                    class="absolute right-0 top-full z-[80] mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(7,13,20,0.96)] p-3 text-left shadow-[0_18px_48px_rgba(0,0,0,0.50)] backdrop-blur"
                    @click.stop
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <div class="text-[10px] uppercase tracking-[0.3em] text-[#9f9278]">Rest</div>
                        <div class="mt-1 text-xs text-[#d8ceb8]">Recover hit points and limited resources.</div>
                      </div>

                      <button
                        type="button"
                        class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
                        @click="closeRestPopover"
                      >
                        Close
                      </button>
                    </div>

                    <div class="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        class="rounded-none border border-[rgba(65,82,103,0.64)] bg-[rgba(8,17,27,0.62)] px-3 py-2 text-xs font-semibold text-[#d8ceb8] disabled:opacity-50"
                        :disabled="restSaving"
                        @click="takeShortRest"
                      >
                        Short Rest
                      </button>

                      <button
                        type="button"
                        class="rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(201,164,90,0.12)] px-3 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-50"
                        :disabled="restSaving"
                        @click="takeLongRest"
                      >
                        {{ restSaving ? 'Resting...' : 'Long Rest' }}
                      </button>
                    </div>

                    <div class="mt-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3 text-xs leading-5 text-[#9f9278]">
                      <div>Long Rest restores HP to max, clears temp HP, and resets spell slots.</div>
                      <div class="mt-1">Short Rest tracking comes next with Hit Dice and short-rest resources.</div>
                    </div>

                    <div class="mt-2 min-h-[1.25rem] text-xs">
                      <span v-if="restSaving" class="text-[#9f9278]">Saving...</span>
                      <span v-else-if="restSaveError" class="text-red-200">{{ restSaveError }}</span>
                      <span v-else-if="restSaveSuccess" class="text-emerald-200">{{ restSaveSuccess }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="relative">
                <button
                  type="button"
                  title="Manage hit points"
                  class="min-w-[84px] rounded-none border border-[rgba(201,164,90,0.52)] bg-[rgba(26,35,48,0.90)] px-4 py-2.5 text-center shadow-[0_0_18px_rgba(201,164,90,0.14)] transition hover:border-[rgba(245,231,189,0.75)]"
                  @click.stop="hpDrawerOpen ? closeHpDrawer() : openHpDrawer()"
                >
                  <div class="text-xl font-semibold leading-none text-white">
                    {{ shownCombatStat('currentHp') || '—' }}/{{ shownCombatStat('maxHp') || '—' }}
                  </div>
                  <div class="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c9a45a]">HP</div>
                </button>

                <!-- Compact HP Popover -->
                <div
                  v-if="hpDrawerOpen"
                  class="absolute right-0 top-full z-[80] mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(7,13,20,0.96)] p-3 text-left shadow-[0_18px_48px_rgba(0,0,0,0.50)] backdrop-blur"
                  @click.stop
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <div class="text-[10px] uppercase tracking-[0.3em] text-[#9f9278]">Hit Points</div>
                      <div class="mt-1 text-xs text-[#d8ceb8]">
                        Max {{ hpMaxDisplay }}<span v-if="hitPointMath.hitDie"> · {{ hitPointMath.hitDie }}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
                      @click="closeHpDrawer"
                    >
                      Close
                    </button>
                  </div>

                  <div class="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.72)] p-2">
                      <div class="text-[9px] uppercase tracking-[0.18em] text-[#9f9278]">Current</div>
                      <div class="mt-1 text-lg font-semibold text-white">{{ hpCurrentDisplay }}</div>
                    </div>

                    <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.72)] p-2">
                      <div class="text-[9px] uppercase tracking-[0.18em] text-[#9f9278]">Max</div>
                      <div class="mt-1 text-lg font-semibold text-white">{{ hpMaxDisplay }}</div>
                    </div>

                    <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.72)] p-2">
                      <div class="text-[9px] uppercase tracking-[0.18em] text-[#9f9278]">Temp</div>
                      <div class="mt-1 text-lg font-semibold text-white">{{ hpTempDisplay }}</div>
                    </div>
                  </div>

                  <label class="mt-3 block">
                    <span class="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Amount</span>
                    <input
                      v-model="hpAmountDraft"
                      inputmode="numeric"
                      class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                      placeholder="0"
                    >
                  </label>

                  <div class="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      class="rounded-none border border-red-500/24 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/18 disabled:opacity-50"
                      :disabled="hpSaving"
                      @click="applyHpDamage"
                    >
                      Damage
                    </button>

                    <button
                      type="button"
                      class="rounded-none border border-emerald-500/24 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/18 disabled:opacity-50"
                      :disabled="hpSaving"
                      @click="applyHpHealing"
                    >
                      Heal
                    </button>
                  </div>

                  <div class="mt-3 grid grid-cols-2 gap-2">
                    <label class="block">
                      <span class="mb-1 block text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">Current</span>
                      <input
                        v-model="hpCurrentDraft"
                        inputmode="numeric"
                        class="eldra-input w-full rounded-none px-2 py-2 text-sm text-white"
                        @change="saveHp"
                      >
                    </label>

                    <label class="block">
                      <span class="mb-1 block text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">Temp</span>
                      <input
                        v-model="hpTempDraft"
                        inputmode="numeric"
                        class="eldra-input w-full rounded-none px-2 py-2 text-sm text-white"
                        @change="saveHp"
                      >
                    </label>
                  </div>

                  <div class="mt-2 min-h-[1.25rem] text-xs">
                    <span v-if="hpSaving" class="text-[#9f9278]">Saving...</span>
                    <span v-else-if="hpSaveError" class="text-red-200">{{ hpSaveError }}</span>
                    <span v-else-if="hpSaveSuccess" class="text-emerald-200">{{ hpSaveSuccess }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-3 grid grid-cols-[84px_minmax(0,1fr)] gap-3">

            <button
              type="button"
              class="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-none border border-[rgba(201,164,90,0.58)] bg-[rgba(8,17,27,0.82)] text-[#f5e7bd] shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
              :class="mode === 'build' ? 'cursor-pointer hover:bg-[rgba(201,164,90,0.10)]' : entityImageUrl ? 'cursor-zoom-in' : 'cursor-default'"
              :title="mode === 'build' ? 'Change portrait' : entityImageUrl ? 'View portrait' : 'No portrait set'"
              @click.stop="handlePortraitClick"
            >
              <img
                v-if="entityImageUrl"
                :src="entityImageUrl"
                :alt="sheet?.name || entity?.title || 'Character Portrait'"
                class="h-full w-full object-cover"
              >

              <div
                v-else
                class="flex h-full w-full flex-col items-center justify-center gap-1 bg-[rgba(201,164,90,0.08)] px-2 text-center"
              >
                <UIcon name="i-lucide-image-plus" class="h-6 w-6 text-[#c9a45a]" />
                <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9f9278]">No Image</span>
              </div>

              <div
                v-if="mode === 'build'"
                class="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[#fff7df] opacity-100 md:opacity-0 md:transition md:group-hover:opacity-100"
              >
                { portraitUploading ? 'Uploading' : 'Change' }
              </div>
            </button>

            <div class="min-w-0">
              <div class="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                <div
                  v-for="stat in mobileHeaderStatCards"
                  :key="stat.label"
                  class="min-w-[72px] min-h-[54px] shrink-0 overflow-visible text-center rounded-none border border-[rgba(65,82,103,0.70)] bg-[rgba(12,23,33,0.86)] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                >
                  <div class="text-[#9f9278]">{{ stat.label }}</div>
                  <div class="mt-0.5 truncate font-semibold text-white">{{ stat.value || '—' }}</div>
                </div>
              </div>

              <nav class="mt-2 overflow-x-auto pb-1">
                <div class="flex min-w-max gap-1.5">
                  <button
                    v-for="tab in mobileSheetTabs"
                    :key="`mobile-${tab.key}`"
                    type="button"
                    class="inline-flex min-w-[68px] flex-col items-center justify-center gap-1 rounded-none border px-2 py-2 text-[11px] font-semibold transition"
                    :class="activeSheetTab === tab.key
                      ? 'border-[rgba(201,164,90,0.72)] bg-[rgba(201,164,90,0.18)] text-[#fff7df] shadow-[0_0_18px_rgba(201,164,90,0.10)]'
                      : 'border-[rgba(65,82,103,0.72)] bg-[rgba(12,23,33,0.86)] text-[#cbd5e1]'"
                    @click="setSheetTab(tab.key)"
                  >
                    <UIcon :name="tab.icon" class="h-4 w-4" />
                    <span>{{ tab.label }}</span>
                  </button>
                </div>
              </nav>

              <!-- Mobile Limited Resource Strip -->
              <div
                v-if="hasLimitedResources"
                class="mt-2 border-t border-[rgba(201,164,90,0.18)] pt-2"
              >
                <div class="mb-1 flex items-center justify-between gap-3">
                  <div class="text-[10px] uppercase tracking-[0.28em] text-[#9f9278]">{{ limitedResourceLabel }}</div>
                  <div v-if="spellSaving" class="text-[10px] uppercase tracking-[0.16em] text-[#9f9278]">Saving</div>
                </div>

                <div class="overflow-x-auto pb-1">
                  <div class="flex min-w-max gap-2">
                    <div
                      v-for="row in spellSlotRows"
                      :key="`slot-row-${row.level}`"
                      class="flex items-center gap-1 rounded-none border border-[rgba(65,82,103,0.64)] bg-[rgba(8,17,27,0.72)] px-2 py-1.5"
                    >
                      <div class="mr-1 min-w-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d8ceb8]">
                        {{ row.level }}
                      </div>

                      <button
                        v-for="index in row.max"
                        :key="`slot-${row.level}-${index}`"
                        type="button"
                        class="h-3.5 w-3.5 rotate-45 border transition"
                        :class="slotGemClass(row, index - 1)"
                        :title="`${slotLevelLabel(row.level)} slot ${index}`"
                        :disabled="spellSaving"
                        @click="toggleSpellSlot(row, index - 1)"
                      >
                        <span class="sr-only">{{ slotLevelLabel(row.level) }} slot {{ index }}</span>
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

      <div class="sheet-desktop-only mb-4 hidden flex-wrap items-center justify-between gap-3 md:flex">
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

        <div class="sheet-desktop-only mb-4 hidden overflow-x-auto md:block">
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
              <span v-if="tab.key === 'stats' && levelUpPendingChoiceCards.length" class="ml-1 text-[#9f9278]">({{ levelUpPendingChoiceCards.length }})</span>
              <span v-if="tab.key === 'inventory'" class="ml-1 text-[#9f9278]">({{ inventoryCount }})</span>
              <span v-if="tab.key === 'spells'" class="ml-1 text-[#9f9278]">({{ selectedSpellCount }})</span>
              <span v-if="tab.key === 'features' && featureCount" class="ml-1 text-[#9f9278]">({{ featureCount }})</span>
            </button>
          </div>
        </div>

      <section class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes rounded-none border px-3 pb-3 pt-3 shadow-xl md:p-5">
        <div v-if="pending" class="text-[#d8ceb8]">
          Loading character sheet...
        </div>

        <div v-else-if="error" class="rounded-none border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          {{ error?.data?.statusMessage || error?.message || 'Failed to load sheet.' }}
        </div>

        <template v-else>
          <div class="sheet-desktop-only hidden flex-col gap-4 md:flex md:flex-row md:items-end md:justify-between">
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

            <!-- Mobile Compact Overview -->
            <section
              v-if="activeSheetTab === 'overview'"
              class="sheet-mobile-only mt-0 space-y-3 md:hidden"
            >

              <!-- Level Manager Entry -->
              <div
                v-if="mode === 'build'"
                class="eldra-codex-soft rounded-none p-4"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Level Manager</div>
                    <div class="mt-1 text-sm text-[#d8ceb8]">
                      Current level {{ currentLevelNumber }}. Guided level-up choices live here.
                    </div>
                  </div>

                  <button
                    type="button"
                    class="eldra-button shrink-0 rounded-none px-3 py-2 text-xs font-semibold"
                    @click="openLevelUpDrawer"
                  >
                    Level Up
                  </button>
                </div>

                <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2">
                    <div class="uppercase tracking-[0.18em] text-[#9f9278]">Level</div>
                    <div class="mt-1 text-lg font-semibold text-white">{{ currentLevelNumber }}</div>
                  </div>

                  <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2">
                    <div class="uppercase tracking-[0.18em] text-[#9f9278]">Choices</div>
                    <div class="mt-1 text-lg font-semibold text-white">{{ levelUpPendingChoiceCards.length }}</div>
                  </div>

                  <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2">
                    <div class="uppercase tracking-[0.18em] text-[#9f9278]">Class</div>
                    <div class="mt-1 truncate text-lg font-semibold text-white">{{ resolvedClass?.title || sheet?.class_name || '—' }}</div>
                  </div>
                </div>
              </div>


              <div class="rounded-none border border-[rgba(65,82,103,0.70)] bg-[rgba(10,20,29,0.82)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div class="mb-2 flex items-center justify-between gap-3">
                  <div class="text-[10px] uppercase tracking-[0.28em] text-[#9f9278]">Abilities</div>
                  <div class="text-[10px] uppercase tracking-[0.18em] text-[#756a57]">Score / Mod</div>
                </div>

                <div class="grid grid-cols-3 gap-2">
                  <div
                    v-for="ability in abilityList"
                    role="button"
                    tabindex="0"
                    title="Roll ability check"
                    @click.stop="rollAbilityCheck(ability)"
                    @keydown.enter.prevent="rollAbilityCheck(ability)"
                    @keydown.space.prevent="rollAbilityCheck(ability)"
                    :key="ability.key"
                    class="cursor-pointer transition hover:border-[rgba(201,164,90,0.45)] hover:bg-[rgba(201,164,90,0.08)] rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.72)] p-2 text-center"
                  >
                    <div class="text-[10px] uppercase tracking-[0.2em] text-[#9f9278]">{{ ability.label }}</div>
                    <div class="mt-1 text-xl font-semibold leading-none text-white">{{ ability.value ?? 10 }}</div>
                    <div class="mt-1 text-xs text-[#d8ceb8]">{{ abilityMod(ability.value) }}</div>
                  </div>
                </div>
              </div>


              <!-- Mobile Saving Throws -->
              <div class="rounded-none border border-[rgba(65,82,103,0.70)] bg-[rgba(10,20,29,0.82)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div class="mb-2 flex items-center justify-between gap-3">
                  <div class="text-[10px] uppercase tracking-[0.28em] text-[#9f9278]">Saving Throws</div>
                  <div class="text-[10px] uppercase tracking-[0.18em] text-[#756a57]">Total</div>
                </div>

                <div class="grid grid-cols-3 gap-2">
                  <div
                    v-for="save in mathSaves"
                    role="button"
                    tabindex="0"
                    title="Roll saving throw"
                    @click.stop="rollSavingThrow(save)"
                    @keydown.enter.prevent="rollSavingThrow(save)"
                    @keydown.space.prevent="rollSavingThrow(save)"
                    :key="save.key"
                    class="cursor-pointer transition hover:border-[rgba(201,164,90,0.45)] hover:bg-[rgba(201,164,90,0.08)] rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.72)] p-2"
                  >
                    <div class="flex items-center justify-between gap-1">
                      <div class="text-[10px] uppercase tracking-[0.2em] text-[#9f9278]">{{ save.shortLabel }}</div>
                      <div v-if="save.proficient" class="eldra-gold-chip rounded-none border px-1 py-0 text-[9px]">P</div>
                    </div>
                    <div class="mt-1 text-lg font-semibold leading-none text-white">{{ save.totalText }}</div>
                  </div>
                </div>
              </div>

              <!-- Mobile Skills -->
              <div class="rounded-none border border-[rgba(65,82,103,0.70)] bg-[rgba(10,20,29,0.82)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div class="mb-2 flex items-center justify-between gap-3">
                  <div class="text-[10px] uppercase tracking-[0.28em] text-[#9f9278]">Skills</div>
                  <div class="text-[10px] uppercase tracking-[0.18em] text-[#756a57]">Check</div>
                </div>

                <div class="grid grid-cols-2 gap-1.5">
                  <div
                    v-for="skill in mathSkills"
                    role="button"
                    tabindex="0"
                    title="Roll skill check"
                    @click.stop="rollSkillCheck(skill)"
                    @keydown.enter.prevent="rollSkillCheck(skill)"
                    @keydown.space.prevent="rollSkillCheck(skill)"
                    :key="skill.key"
                    class="cursor-pointer transition hover:border-[rgba(201,164,90,0.45)] hover:bg-[rgba(201,164,90,0.08)] flex items-center justify-between gap-2 rounded-none border border-[rgba(65,82,103,0.56)] bg-[rgba(8,17,27,0.62)] px-2 py-1.5"
                  >
                    <div class="flex min-w-0 items-center gap-1.5">
                      <span class="truncate text-[11px] leading-none text-[#d8ceb8]">{{ skill.label }}</span>
                      <span v-if="skill.proficient" class="eldra-gold-chip rounded-none border px-1 py-0 text-[9px]">P</span>
                    </div>
                    <span class="shrink-0 text-xs font-semibold text-white">{{ skill.totalText }}</span>
                  </div>
                </div>
              </div>

              <div class="rounded-none border border-[rgba(65,82,103,0.70)] bg-[rgba(10,20,29,0.82)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div class="text-[10px] uppercase tracking-[0.28em] text-[#9f9278]">At The Table</div>
                <div class="mt-2 grid grid-cols-2 gap-2 text-xs text-[#d8ceb8]">
                  <div class="rounded-none border border-[rgba(65,82,103,0.56)] bg-[rgba(8,17,27,0.62)] p-2">
                    <span class="text-[#9f9278]">Hit Dice:</span>
                    <span class="ml-1 text-white">{{ shownCombatStat('hitDice') || resolvedClass?.hitDie || '-' }}</span>
                  </div>

                  <div class="rounded-none border border-[rgba(65,82,103,0.56)] bg-[rgba(8,17,27,0.62)] p-2">
                    <span class="text-[#9f9278]">Features:</span>
                    <span class="ml-1 text-white">{{ featureCount }}</span>
                  </div>

                  <div class="rounded-none border border-[rgba(65,82,103,0.56)] bg-[rgba(8,17,27,0.62)] p-2">
                    <span class="text-[#9f9278]">Spells:</span>
                    <span class="ml-1 text-white">{{ selectedSpellCount }}</span>
                  </div>

                  <div class="rounded-none border border-[rgba(65,82,103,0.56)] bg-[rgba(8,17,27,0.62)] p-2">
                    <span class="text-[#9f9278]">Items:</span>
                    <span class="ml-1 text-white">{{ inventoryCount }}</span>
                  </div>
                </div>
              </div>
            </section>

            <div
            v-if="activeSheetTab === 'overview' && entityImageUrl"
            class="sheet-desktop-only eldra-image-frame mt-6 hidden overflow-hidden rounded-none border bg-black/20 md:block"
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

          <div v-if="activeSheetTab === 'overview'" class="mt-6 hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4">
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


          <div v-if="activeSheetTab === 'overview' && mode === 'build'" class="mt-3 hidden rounded-none md:block border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
            <label class="block">
              <span class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Subclass</span>
              <input
                v-model="sheetForm.subclassName"
                class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-sm text-white"
                placeholder="Optional subclass"
              >
            </label>
          </div>

            <section v-if="activeSheetTab === 'overview'" class="mt-6 hidden grid-cols-2 gap-3 md:grid sm:grid-cols-3">
            <label
              v-for="ability in abilityList"
              role="button"
              tabindex="0"
              title="Roll ability check"
              @click.stop="rollAbilityCheck(ability)"
              @keydown.enter.prevent="rollAbilityCheck(ability)"
              @keydown.space.prevent="rollAbilityCheck(ability)"
              :key="ability.key"
              class="cursor-pointer transition hover:border-[rgba(201,164,90,0.45)] hover:bg-[rgba(201,164,90,0.08)] rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4 text-center"
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

            <section v-if="activeSheetTab === 'overview'" class="mt-6 hidden gap-4 md:grid">
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

                <div v-if="levelUpPendingChoiceCards.length" class="mt-4 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.52)] p-3">
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
                      v-for="choice in levelUpPendingChoiceCards"
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
                      role="button"
                      tabindex="0"
                      title="Roll saving throw"
                      @click.stop="rollSavingThrow(save)"
                      @keydown.enter.prevent="rollSavingThrow(save)"
                      @keydown.space.prevent="rollSavingThrow(save)"
                      :key="save.key"
                      class="cursor-pointer transition hover:border-[rgba(201,164,90,0.45)] hover:bg-[rgba(201,164,90,0.08)] rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3"
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
                      role="button"
                      tabindex="0"
                      title="Roll skill check"
                      @click.stop="rollSkillCheck(skill)"
                      @keydown.enter.prevent="rollSkillCheck(skill)"
                      @keydown.space.prevent="rollSkillCheck(skill)"
                      :key="skill.key"
                      class="cursor-pointer transition hover:border-[rgba(201,164,90,0.45)] hover:bg-[rgba(201,164,90,0.08)] rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3"
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
                      v-for="candidate in displayedArmorClassCandidates"
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
                v-else-if="activeSheetTab === 'actions'"
                class="mt-0 grid gap-3 md:mt-6"
              >

                <div
                  v-if="equippedWeaponActions.length"
                  class="eldra-codex-soft rounded-none p-4"
                >
                  <button
                    type="button"
                    class="mb-3 flex w-full items-center justify-between gap-3 text-left"
                    @click="toggleActionPanel('weapons')"
                  >
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Attack Actions</div>

                    <div class="flex items-center gap-2">
                      <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                        {{ equippedWeaponActions.length }} Attack{{ equippedWeaponActions.length === 1 ? '' : 's' }}
                      </div>
                      <UIcon :name="actionPanelChevron('weapons')" class="h-4 w-4 text-[#9f9278]" />
                    </div>
                  </button>

                  <div
                    v-show="actionPanelOpen('weapons')"
                    class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
                  >
                    <article
                      v-for="weapon in equippedWeaponActions"
                      :key="`weapon-action-${weapon.id}`"
                      class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <div class="truncate font-semibold text-white">{{ weapon.name }}</div>
                          <div class="mt-1 text-xs text-[#9f9278]">{{ weapon.itemType || 'Weapon' }}</div>
                        </div>

                        <span class="shrink-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#f5e7bd]">
                          Attack
                        </span>
                      </div>


                      <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2">
                          <div class="uppercase tracking-[0.18em] text-[#9f9278]">To Hit</div>
                          <div class="mt-1 font-semibold text-white">
                            {{ weapon.attackBonusText }}
                          </div>
                          <div class="mt-0.5 text-[10px] text-[#9f9278]">
                            {{ weapon.attackFormula }}
                          </div>
                        </div>

                        <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2">
                          <div class="uppercase tracking-[0.18em] text-[#9f9278]">Damage</div>
                          <div class="mt-1 font-semibold text-white">
                            {{ weapon.damage || '—' }}
                          </div>
                          <div v-if="weapon.damageFormula" class="mt-0.5 text-[10px] text-[#9f9278]">
                            {{ weapon.damageFormula }}
                          </div>
                        </div>

                        <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2">
                          <div class="uppercase tracking-[0.18em] text-[#9f9278]">Type</div>
                          <div class="mt-1 font-semibold text-white">
                            {{ weapon.damageType || '—' }}
                          </div>
                        </div>
                      </div>

                      <div v-if="weapon.notes" class="mt-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3 text-xs leading-5 text-[#9f9278]">
                        {{ weapon.notes }}
                      </div>



                      <div
                        class="mt-3 grid gap-2"
                        :class="weapon.linkedItemId || weapon.description || weapon.notes ? 'grid-cols-3' : 'grid-cols-2'"
                      >
                        <button
                          type="button"
                          class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df]"
                          @click.stop="rollWeaponAttack(weapon)"
                        >
                          To Hit
                        </button>

                        <button
                          type="button"
                          class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df]"
                          @click.stop="rollWeaponDamage(weapon)"
                        >
                          Damage
                        </button>

                        <button
                          v-if="weapon.linkedItemId || weapon.description || weapon.notes"
                          type="button"
                          class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df]"
                          @click.stop="openItemDrawer(weapon)"
                        >
                          Details
                        </button>
                      </div>
                    </article>
                  </div>
                </div>

                <div
                  v-if="actionSpellCards.length"
                  class="eldra-codex-soft rounded-none p-4"
                >
                  <button
                    type="button"
                    class="mb-3 flex w-full items-center justify-between gap-3 text-left"
                    @click="toggleActionPanel('spells')"
                  >
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Spell Actions</div>

                    <div class="flex items-center gap-2">
                      <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                        {{ filteredActionSpellCards.length }} / {{ actionSpellCards.length }} Spell{{ actionSpellCards.length === 1 ? '' : 's' }}
                      </div>
                      <UIcon :name="actionPanelChevron('spells')" class="h-4 w-4 text-[#9f9278]" />
                    </div>
                  </button>

                  <div v-show="actionPanelOpen('spells')">

                    <div
                      v-if="hasSpellcastingMath"
                      class="mb-3 grid grid-cols-3 gap-2 text-xs"
                    >
                      <div
                        v-for="stat in spellcastingStatCards"
                        :key="`action-spellcasting-stat-${stat.key}`"
                        class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2"
                      >
                        <div class="uppercase tracking-[0.18em] text-[#9f9278]">{{ stat.label }}</div>
                        <div class="mt-1 text-lg font-semibold text-white">{{ stat.value }}</div>
                        <div class="mt-0.5 text-[10px] text-[#9f9278]">{{ stat.note }}</div>
                      </div>
                    </div>

                    <div class="-mx-1 mb-3 overflow-x-auto pb-1">
                      <div class="flex min-w-max gap-2 px-1">
                        <button
                          v-for="filter in actionSpellLevelFilters"
                          :key="filter.key"
                          type="button"
                          class="inline-flex items-center gap-2 rounded-none border px-3 py-2 text-xs font-semibold transition"
                          :class="actionSpellLevelFilter === filter.key
                            ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
                            : 'border-[rgba(65,82,103,0.64)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
                          @click.stop="actionSpellLevelFilter = filter.key"
                        >
                          <span>{{ filter.label }}</span>
                          <span class="rounded-none border border-[rgba(201,164,90,0.20)] bg-black/20 px-1.5 py-0.5 text-[10px] text-[#9f9278]">
                            {{ filter.count }}
                          </span>
                        </button>
                      </div>
                    </div>

                    <div
                      v-if="filteredActionSpellCards.length"
                      class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
                    >
                      <article
                        v-for="spell in filteredActionSpellCards"
                        :key="`action-spell-${spell.id}`"
                        class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                      >
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0">
                            <div class="truncate font-semibold text-white">{{ spell.title }}</div>
                            <div class="mt-1 text-xs text-[#9f9278]">
                              {{ spellOptionLevelLabel(spell) || 'Spell' }}
                            </div>

                            <div class="action-spell-mechanic mt-2 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2 text-xs">
                              <div class="flex items-center justify-between gap-2">
                                <span class="uppercase tracking-[0.18em] text-[#9f9278]">{{ spellActionMechanic(spell).label }}</span>
                                <span class="font-semibold text-white">{{ spellActionMechanic(spell).value }}</span>
                              </div>
                              <div class="mt-0.5 text-[10px] text-[#9f9278]">
                                {{ spellActionMechanic(spell).note }}
                              </div>

                              <button
                                v-if="spellUsesAttackRoll(spell)"
                                type="button"
                                class="mt-2 w-full rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df]"
                                @click.stop="rollSpellAttack(spell)"
                              >
                                Roll Spell Attack
                              </button>
                            </div>
                          </div>

                          <span class="shrink-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#f5e7bd]">
                            {{ spell.actionKind }}
                          </span>
                        </div>

                        <div
                          class="mt-3 grid gap-2"
                          :class="spellConsumesSlot(spell) ? 'grid-cols-2' : 'grid-cols-1'"
                        >
                          <button
                            type="button"
                            class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
                            @click.stop="openSpellDrawer(spell)"
                          >
                            Details
                          </button>

                          <button
                            v-if="spellConsumesSlot(spell)"
                            type="button"
                            class="rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(201,164,90,0.12)] px-3 py-2 text-xs font-semibold text-[#fff7df] disabled:cursor-not-allowed disabled:opacity-45"
                            :disabled="spellSaving || !canCastSpell(spell)"
                            @click.stop="castSpell(spell)"
                          >
                            Cast
                          </button>
                        </div>
                      </article>
                    </div>

                    <div v-else class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]">
                      No spell actions match this filter.
                    </div>
                  </div>
                </div>

                <div class="eldra-codex-soft rounded-none p-4">
                  <button
                    type="button"
                    class="mb-3 flex w-full items-center justify-between gap-3 text-left"
                    @click="toggleActionPanel('common')"
                  >
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Common Actions</div>
                    <UIcon :name="actionPanelChevron('common')" class="h-4 w-4 text-[#9f9278]" />
                  </button>

                  <div
                    v-show="actionPanelOpen('common')"
                    class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
                  >
                    <article
                      v-for="action in commonActionCards"
                      :key="action.name"
                      class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                    >
                      <div class="flex items-start gap-3">
                        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] text-[#f5e7bd]">
                          <UIcon :name="action.icon" class="h-4 w-4" />
                        </div>

                        <div class="min-w-0">
                          <div class="flex flex-wrap items-center gap-2">
                            <div class="font-semibold text-white">{{ action.name }}</div>
                            <span class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">{{ action.timing }}</span>
                          </div>
                          <p class="mt-1 text-xs leading-5 text-[#9f9278]">{{ action.detail }}</p>
                        </div>
                      </div>
                    </article>
                  </div>
                </div>

                <div class="grid gap-3 lg:grid-cols-2">
                  <div class="eldra-codex-soft rounded-none p-4">
                    <button
                      type="button"
                      class="mb-3 flex w-full items-center justify-between gap-3 text-left"
                      @click="toggleActionPanel('bonus')"
                    >
                      <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Bonus Actions</div>

                      <div class="flex items-center gap-2">
                        <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                          Bonus
                        </div>
                        <UIcon :name="actionPanelChevron('bonus')" class="h-4 w-4 text-[#9f9278]" />
                      </div>
                    </button>

                    <div
                      v-show="actionPanelOpen('bonus')"
                      class="space-y-2"
                    >
                      <article
                        v-for="action in bonusActionCards"
                        :key="action.name"
                        class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                      >
                        <div class="flex items-start gap-3">
                          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] text-[#f5e7bd]">
                            <UIcon :name="action.icon" class="h-4 w-4" />
                          </div>

                          <div>
                            <div class="font-semibold text-white">{{ action.name }}</div>
                            <p class="mt-1 text-xs leading-5 text-[#9f9278]">{{ action.detail }}</p>
                          </div>
                        </div>
                      </article>
                    </div>
                  </div>

                  <div class="eldra-codex-soft rounded-none p-4">
                    <button
                      type="button"
                      class="mb-3 flex w-full items-center justify-between gap-3 text-left"
                      @click="toggleActionPanel('reactions')"
                    >
                      <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Reactions</div>

                      <div class="flex items-center gap-2">
                        <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                          Reaction
                        </div>
                        <UIcon :name="actionPanelChevron('reactions')" class="h-4 w-4 text-[#9f9278]" />
                      </div>
                    </button>

                    <div
                      v-show="actionPanelOpen('reactions')"
                      class="space-y-2"
                    >
                      <article
                        v-for="action in reactionActionCards"
                        :key="action.name"
                        class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                      >
                        <div class="flex items-start gap-3">
                          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] text-[#f5e7bd]">
                            <UIcon :name="action.icon" class="h-4 w-4" />
                          </div>

                          <div>
                            <div class="font-semibold text-white">{{ action.name }}</div>
                            <p class="mt-1 text-xs leading-5 text-[#9f9278]">{{ action.detail }}</p>
                          </div>
                        </div>
                      </article>
                    </div>
                  </div>
                </div>
              </section>



            <section
              v-else-if="activeSheetTab === 'inventory'"
              class="mt-0 grid gap-3 md:mt-6"
            >


              <div class="eldra-codex-soft rounded-none p-3">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 text-left"
                  @click="currencyLedgerOpen = !currencyLedgerOpen"
                >
                  <div class="min-w-0">
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Currency Ledger</div>
                    <div class="mt-1 text-xs text-[#d8ceb8]">
                      {{ currencyTotalCoins }} Coin{{ currencyTotalCoins === 1 ? '' : 's' }} carried.
                    </div>
                  </div>

                  <div class="flex shrink-0 items-center gap-2">
                    <div class="flex max-w-[260px] flex-wrap justify-end gap-1.5">
                      <span
                        v-for="coin in CURRENCY_DENOMINATIONS"
                        :key="`currency-summary-${coin.key}`"
                        class="inline-flex items-center gap-1 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.58)] px-2 py-1 text-[11px] text-[#d8ceb8]"
                      >
                        <UIcon :name="coin.icon" class="h-3 w-3 text-[#c9a45a]" />
                        <span class="font-semibold text-white">{{ currencyAmount(coin.key) }}</span>
                        <span class="text-[#9f9278]">{{ coin.short }}</span>
                      </span>
                    </div>

                    <UIcon
                      :name="currencyLedgerOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                      class="h-4 w-4 text-[#9f9278]"
                    />
                  </div>
                </button>

                <div v-if="currencySaveError" class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {{ currencySaveError }}
                </div>

                <div v-if="currencySaveSuccess" class="mt-3 rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  {{ currencySaveSuccess }}
                </div>

                <div
                  v-show="currencyLedgerOpen"
                  class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
                >
                  <div
                    v-for="coin in CURRENCY_DENOMINATIONS"
                    :key="coin.key"
                    class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2"
                  >
                    <div class="flex items-center gap-2">
                      <div class="flex h-7 w-7 items-center justify-center rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] text-[#f5e7bd]">
                        <UIcon :name="coin.icon" class="h-3.5 w-3.5" />
                      </div>

                      <div class="min-w-0">
                        <div class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">{{ coin.short }}</div>
                        <div class="truncate text-xs text-[#d8ceb8]">{{ coin.label }}</div>
                      </div>
                    </div>

                    <input
                      v-if="mode === 'build'"
                      v-model="currencyDrafts[coin.key]"
                      inputmode="numeric"
                      class="eldra-input mt-2 w-full rounded-none px-2 py-1.5 text-base font-semibold text-white"
                      :disabled="currencySaving"
                      @change="saveCurrencyAmount(coin)"
                    >

                    <div v-else class="mt-2 text-xl font-semibold text-white">
                      {{ currencyAmount(coin.key) }}
                    </div>
                  </div>
                </div>
              </div>

              <div
                v-if="mode === 'build'"
                class="eldra-codex-soft rounded-none p-4"
              >
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Add Inventory</div>
                    <div class="mt-1 text-sm text-[#d8ceb8]">Add imported equipment or quick custom inventory rows.</div>
                  </div>

                  <button
                    type="button"
                    class="eldra-button rounded-none px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    :disabled="inventorySaving"
                    @click="addInventoryItem"
                  >
                    {{ inventorySaving ? 'Adding...' : 'Add Item' }}
                  </button>
                </div>

                <div v-if="inventorySaveError" class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {{ inventorySaveError }}
                </div>

                <div v-if="inventorySaveSuccess" class="mt-3 rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  {{ inventorySaveSuccess }}
                </div>

                <div class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_120px]">
                  <label class="block">
                    <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Search Imported Items</span>
                    <input
                      v-model="inventoryItemSearch"
                      class="eldra-input mb-2 w-full rounded-none px-3 py-2 text-sm text-white"
                      placeholder="Search Longbow, Longsword, Backpack..."
                    >

                    <select
                      v-model="inventoryAddForm.itemEntityId"
                      class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                    >
                      <option value="" class="bg-[#090909] text-[#f5e7bd]">No imported item selected</option>
                      <option
                        v-for="option in filteredInventoryItemOptions"
                        :key="option.id"
                        :value="option.id"
                        class="bg-[#090909] text-[#f5e7bd]"
                      >
                        {{ option.title }}
                      </option>
                    </select>
                  </label>

                  <label class="block">
                    <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Quantity</span>
                    <input
                      v-model="inventoryAddForm.quantity"
                      inputmode="numeric"
                      class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                    >
                  </label>

                  <label class="block lg:col-span-2">
                    <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Custom Item Name</span>
                    <input
                      v-model="inventoryAddForm.customName"
                      class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                      placeholder="Used when no imported item is selected"
                    >
                  </label>

                  <label class="block lg:col-span-2">
                    <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Notes</span>
                    <textarea
                      v-model="inventoryAddForm.notes"
                      rows="2"
                      class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                      placeholder="Optional notes..."
                    />
                  </label>
                </div>
              </div>

              <div class="eldra-codex-soft rounded-none p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Inventory</div>
                    <div class="mt-1 text-sm text-[#d8ceb8]">Equipment, carried items, and attunement tracking.</div>
                  </div>

                  <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                    {{ inventoryCount }} Item{{ inventoryCount === 1 ? '' : 's' }}
                  </div>
                </div>

                <div v-if="carriedInventory.length" class="mt-4 grid gap-2 md:grid-cols-2">
                  <article
                    v-for="item in carriedInventory"
                    :key="item.id"
                    class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3 text-sm text-[#d8ceb8]"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="truncate font-semibold text-white">{{ item.name }}</div>
                        <div class="mt-1 flex flex-wrap gap-2 text-xs text-[#9f9278]">
                          <span>x{{ inventoryQuantity(item) }}</span>
                          <span v-if="item.container">Container: {{ item.container }}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
                        @click.stop="openItemDrawer(inventoryItemDetail(item))"
                      >
                        Details
                      </button>
                    </div>

                    <div class="mt-3 flex flex-wrap gap-2">
                      <span v-if="item.equipped" class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]">Equipped</span>
                      <span v-if="item.attuned" class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]">Attuned</span>
                    </div>

                    <div v-if="item.notes" class="mt-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3 text-xs leading-5 text-[#9f9278]">
                      {{ item.notes }}
                    </div>

                    <div
                      v-if="mode === 'build'"
                      class="mt-3 grid gap-2"
                    >
                      <div class="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-50"
                          :disabled="inventorySaving"
                          @click="changeInventoryQuantity(item, -1)"
                        >
                          - Qty
                        </button>

                        <button
                          type="button"
                          class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-50"
                          :disabled="inventorySaving"
                          @click="changeInventoryQuantity(item, 1)"
                        >
                          + Qty
                        </button>

                        <button
                          type="button"
                          class="rounded-none border border-red-500/24 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 disabled:opacity-50"
                          :disabled="inventorySaving"
                          @click="removeInventoryItem(item)"
                        >
                          Remove
                        </button>
                      </div>

                      <div class="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          class="rounded-none border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                          :class="item.equipped
                            ? 'border-[rgba(201,164,90,0.42)] bg-[rgba(201,164,90,0.14)] text-[#fff7df]'
                            : 'border-[rgba(65,82,103,0.64)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
                          :disabled="inventorySaving"
                          @click="toggleInventoryEquipped(item)"
                        >
                          {{ item.equipped ? 'Unequip' : 'Equip' }}
                        </button>

                        <button
                          type="button"
                          class="rounded-none border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                          :class="item.attuned
                            ? 'border-[rgba(201,164,90,0.42)] bg-[rgba(201,164,90,0.14)] text-[#fff7df]'
                            : 'border-[rgba(65,82,103,0.64)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
                          :disabled="inventorySaving"
                          @click="toggleInventoryAttuned(item)"
                        >
                          {{ item.attuned ? 'Unattune' : 'Attune' }}
                        </button>
                      </div>
                    </div>
                  </article>
                </div>

                <div v-else class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]">
                  Inventory is empty. Switch to Build mode to add imported or custom items.
                </div>
              </div>
            </section>



            <section
              v-else-if="activeSheetTab === 'spells'"
              class="mt-6 grid gap-4 lg:grid-cols-2"
            >

                <!-- Mobile Spell Builder Entry -->
                <div
                  v-if="mode === 'build'"
                  class="eldra-codex-soft rounded-none p-4 lg:col-span-2 md:hidden"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Spell Builder</div>
                      <div class="mt-1 text-sm text-[#d8ceb8]">Add known spells, prepare spells, or intentionally use advanced overrides.</div>
                    </div>

                    <button
                      type="button"
                      class="eldra-button rounded-none px-3 py-2 text-xs font-semibold"
                      @click="openSpellBuilder"
                    >
                      Manage Spells
                    </button>
                  </div>

                  <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2">
                      <div class="uppercase tracking-[0.18em] text-[#9f9278]">Known</div>
                      <div class="mt-1 text-lg font-semibold text-white">{{ shownKnownSpells.length }}</div>
                    </div>

                    <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2">
                      <div class="uppercase tracking-[0.18em] text-[#9f9278]">Prepared</div>
                      <div class="mt-1 text-lg font-semibold text-white">{{ shownPreparedSpells.length }}</div>
                    </div>

                    <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2">
                      <div class="uppercase tracking-[0.18em] text-[#9f9278]">Available</div>
                      <div class="mt-1 text-lg font-semibold text-white">{{ availableSpellCards.length }}</div>
                    </div>
                  </div>
                </div>


                <div
                  v-if="hasSpellcastingMath"
                  class="eldra-codex-soft rounded-none p-4 lg:col-span-2"
                >
                  <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Spellcasting Math</div>
                    <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                      {{ spellcastingAbilityLabel }}
                    </div>
                  </div>

                  <div class="grid grid-cols-3 gap-2 text-xs">
                    <div
                      v-for="stat in spellcastingStatCards"
                      :key="`tab-spellcasting-stat-${stat.key}`"
                      class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2"
                    >
                      <div class="uppercase tracking-[0.18em] text-[#9f9278]">{{ stat.label }}</div>
                      <div class="mt-1 text-lg font-semibold text-white">{{ stat.value }}</div>
                      <div class="mt-0.5 text-[10px] text-[#9f9278]">{{ stat.note }}</div>
                    </div>
                  </div>
                </div>

              <div
                v-if="mode === 'build'"
                class="hidden md:block eldra-codex-soft rounded-none p-4 lg:col-span-2"
              >
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Spellbook Builder</div>
                    <div class="mt-1 text-sm text-[#d8ceb8]">Search accessible spells, add them to the spellbook, then prepare what this character has ready.</div>
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

                <div class="mt-4">
                  <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Search Spells</label>
                  <input
                    v-model="spellSearch"
                    type="text"
                    placeholder="Search accessible spells..."
                    class="eldra-input w-full rounded-none px-4 py-3 text-sm text-white placeholder-[#756a57]"
                  >
                </div>

                <div v-if="spellSaveError" class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {{ spellSaveError }}
                </div>

                <div v-if="spellSaveSuccess" class="mt-3 rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  {{ spellSaveSuccess }}
                </div>
              </div>

              <div
                v-if="mode === 'build'"
                class="hidden md:block eldra-codex-soft rounded-none p-4 lg:col-span-2"
              >
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Available Class Spells</div>
                    <div class="mt-1 text-sm text-[#d8ceb8]">Filtered by the linked class spell list. Feat-granted spells are handled separately below.</div>
                  </div>

                  <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                    {{ availableSpellCards.length }} Available
                  </div>
                </div>

                <div v-if="availableSpellCards.length" class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <article
                    v-for="spell in availableSpellCards"
                    :key="spell.id"
                    class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-4 text-sm text-[#d8ceb8]"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        class="min-w-0 flex-1 text-left transition hover:text-[#fff7df]"
                        @click.stop="openSpellDrawer(spell)"
                      >
                        <div class="font-medium text-white">{{ spell.title }}</div>
                        <div class="mt-1 text-xs text-[#9f9278]">{{ spellOptionLevelLabel(spell) || 'Spell' }}</div>
                      </button>

                      <button
                        type="button"
                        class="eldra-button shrink-0 rounded-none px-3 py-1.5 text-xs"
                        @click.stop="openSpellDrawer(spell)"
                      >
                        Details
                      </button>
                    </div>

                    <div class="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="eldra-button rounded-none px-3 py-2 text-xs"
                        @click="addKnownSpell(spell.id)"
                      >
                        Add Known
                      </button>

                      <button
                        type="button"
                        class="eldra-button rounded-none px-3 py-2 text-xs"
                        @click="prepareSpell(spell.id)"
                      >
                        Prepare
                      </button>
                    </div>
                  </article>
                </div>

                <div v-else class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]">
                  No available class spells match this sheet. Link a spellcasting class, import that class's spells, or clear the search.
                </div>
              </div>

              <div class="eldra-codex-soft rounded-none p-4">
                <div
                  role="button"
                  tabindex="0"
                  class="flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 text-left"
                  @click="toggleSpellPanel('prepared')"
                  @keydown.enter.prevent="toggleSpellPanel('prepared')"
                  @keydown.space.prevent="toggleSpellPanel('prepared')"
                >
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Prepared Spells</div>
                    <div class="mt-1 text-sm text-[#d8ceb8]">Spells currently prepared and ready to cast.</div>
                  </div>

                  <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                    {{ shownPreparedSpells.length }} Prepared
                  </div>
                  <UIcon :name="spellPanelChevron('prepared')" class="h-4 w-4 text-[#9f9278]" />
                </div>
                <div v-show="spellPanelOpen('prepared')">

                <div v-if="preparedSpellCards.length" class="mt-4 space-y-2">
                  <div
                    v-for="spell in preparedSpellCards"
                    :key="spell.id"
                    class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3 text-sm text-[#d8ceb8]"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        class="min-w-0 flex-1 text-left transition hover:text-[#fff7df]"
                        @click.stop="openSpellDrawer(spell)"
                      >
                        <div class="font-medium text-white">{{ spell.title }}</div>
                        <div class="mt-1 text-xs text-[#9f9278]">{{ spellOptionLevelLabel(spell) || 'Open spell details' }}</div>
                      </button>

                      <button
                        v-if="mode === 'build'"
                        type="button"
                        class="shrink-0 rounded-none border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-200 transition hover:bg-red-500/20"
                        @click="removePreparedSpell(spell.id)"
                      >
                        Unprepare
                      </button>
                    </div>
                  </div>
                </div>

                <div v-else class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]">
                  {{ shownPreparedSpells.length ? 'No prepared spells match the current search.' : 'No prepared spells selected yet.' }}
                </div>
                </div>
              </div>

              <div class="eldra-codex-soft rounded-none p-4">
                <div
                  role="button"
                  tabindex="0"
                  class="flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 text-left"
                  @click="toggleSpellPanel('known')"
                  @keydown.enter.prevent="toggleSpellPanel('known')"
                  @keydown.space.prevent="toggleSpellPanel('known')"
                >
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Known / Spellbook</div>
                    <div class="mt-1 text-sm text-[#d8ceb8]">Spells this character knows or has in their spellbook.</div>
                  </div>

                  <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                    {{ shownKnownSpells.length }} Spell{{ shownKnownSpells.length === 1 ? '' : 's' }}
                  </div>
                  <UIcon :name="spellPanelChevron('known')" class="h-4 w-4 text-[#9f9278]" />
                </div>
                <div v-show="spellPanelOpen('known')">

                <div v-if="knownSpellCards.length" class="mt-4 space-y-2">
                  <div
                    v-for="spell in knownSpellCards"
                    :key="spell.id"
                    class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3 text-sm text-[#d8ceb8]"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        class="min-w-0 flex-1 text-left transition hover:text-[#fff7df]"
                        @click.stop="openSpellDrawer(spell)"
                      >
                        <div class="font-medium text-white">{{ spell.title }}</div>
                        <div class="mt-1 text-xs text-[#9f9278]">{{ spellOptionLevelLabel(spell) || 'Open spell details' }}</div>
                      </button>

                      <div v-if="mode === 'build'" class="flex shrink-0 flex-col gap-2">
                        <button
                          v-if="!isPreparedSpell(spell.id)"
                          type="button"
                          class="eldra-button rounded-none px-2 py-1 text-xs"
                          @click="prepareSpell(spell.id)"
                        >
                          Prepare
                        </button>

                        <button
                          v-else
                          type="button"
                          class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.10)] px-2 py-1 text-xs text-[#f5e7bd]"
                          disabled
                        >
                          Prepared
                        </button>

                        <button
                          type="button"
                          class="rounded-none border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-200 transition hover:bg-red-500/20"
                          @click="removeKnownSpell(spell.id)"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-else class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]">
                  {{ shownKnownSpells.length ? 'No known spells match the current search.' : 'No known spells selected yet.' }}
                </div>
                </div>
              </div>


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

                <div v-if="featChoiceSpellCards.length" class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <button
                    v-for="spell in featChoiceSpellCards"
                    :key="spell.id"
                    type="button"
                    class="block rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3 text-left text-sm text-[#d8ceb8] transition hover:border-[rgba(201,164,90,0.42)] hover:bg-[rgba(201,164,90,0.10)]"
                    @click.stop="openSpellDrawer(spell)"
                  >
                    <div class="font-medium text-white">{{ spell.title }}</div>
                    <div class="mt-1 text-xs text-[#9f9278]">{{ spellOptionLevelLabel(spell) || 'Open spell details' }}</div>
                  </button>
                </div>

                <div v-else class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]">
                  {{ featChoiceSpells.length ? 'No feat choice spells match the current search.' : 'No feat-granted spell choices selected yet.' }}
                </div>
              </div>
            </section>

            <section
              v-else-if="activeSheetTab === 'features'"
              class="mt-0 grid gap-3 md:mt-6"
            >
              <div class="eldra-codex-soft rounded-none p-4">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 text-left"
                  @click="toggleFeaturePanel('class')"
                >
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Class Features</div>
                    <div class="mt-1 text-sm text-[#d8ceb8]">{{ resolvedClass?.title || 'No linked class' }}</div>
                  </div>

                  <div class="flex items-center gap-2">
                    <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                      {{ currentClassFeatureCards.length }} Active
                    </div>
                    <UIcon :name="featurePanelChevron('class')" class="h-4 w-4 text-[#9f9278]" />
                  </div>
                </button>

                <div
                  v-show="featurePanelOpen('class')"
                  class="mt-4 grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3"
                >
                  <article
                    v-for="feature in currentClassFeatureCards"
                    :key="`class-feature-${feature.id}`"
                    class="min-w-0 overflow-hidden rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                  >
                    <div class="flex min-w-0 items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="max-w-full truncate font-semibold text-white">{{ feature.title }}</div>
                        <div class="mt-1 text-xs text-[#9f9278]">
                          Level {{ feature.level || 1 }}<span v-if="feature.source"> · {{ feature.source }}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        class="shrink-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
                        @click.stop="openFeatureDrawer(feature)"
                      >
                        Details
                      </button>
                    </div>

                    <p class="mt-3 break-words text-xs leading-5 text-[#9f9278]">
                      {{ shortText(feature.description, 180) || 'No imported description found yet.' }}
                    </p>
                  </article>

                  <div
                    v-if="!currentClassFeatureCards.length"
                    class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278] md:col-span-2 xl:col-span-3"
                  >
                    No active class features resolved yet.
                  </div>
                </div>
              </div>

              <div
                v-if="upcomingClassFeatureCards.length"
                class="eldra-codex-soft rounded-none p-4"
              >
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 text-left"
                  @click="toggleFeaturePanel('upcoming')"
                >
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Upcoming Class Features</div>
                    <div class="mt-1 text-sm text-[#d8ceb8]">Features unlocked at later levels.</div>
                  </div>

                  <div class="flex items-center gap-2">
                    <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                      {{ upcomingClassFeatureCards.length }} Future
                    </div>
                    <UIcon :name="featurePanelChevron('upcoming')" class="h-4 w-4 text-[#9f9278]" />
                  </div>
                </button>

                <div
                  v-show="featurePanelOpen('upcoming')"
                  class="mt-4 grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3"
                >
                  <article
                    v-for="feature in upcomingClassFeatureCards"
                    :key="`upcoming-feature-${feature.id}`"
                    class="min-w-0 overflow-hidden rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.48)] p-3 opacity-80"
                  >
                    <div class="flex min-w-0 items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="max-w-full truncate font-semibold text-white">{{ feature.title }}</div>
                        <div class="mt-1 text-xs text-[#9f9278]">
                          Level {{ feature.level }}<span v-if="feature.source"> · {{ feature.source }}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        class="shrink-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
                        @click.stop="openFeatureDrawer(feature)"
                      >
                        Details
                      </button>
                    </div>
                  </article>
                </div>
              </div>


              <div
                v-if="resolvedSubclassName"
                class="eldra-codex-soft rounded-none p-4"
              >
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 text-left"
                  @click="toggleFeaturePanel('subclass')"
                >
                  <div class="min-w-0">
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Subclass / Path</div>
                    <div class="mt-1 truncate text-sm text-[#d8ceb8]">{{ resolvedSubclassName }}</div>
                  </div>

                  <div class="flex items-center gap-2">
                    <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                      {{ resolvedSubclassFeatureCards.length }} Feature{{ resolvedSubclassFeatureCards.length === 1 ? '' : 's' }}
                    </div>
                    <UIcon :name="featurePanelChevron('subclass')" class="h-4 w-4 text-[#9f9278]" />
                  </div>
                </button>

                <div
                  v-show="featurePanelOpen('subclass')"
                  class="mt-4"
                >
                  <div
                    v-if="resolvedSubclassOption"
                    class="mb-3 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)] p-3"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="truncate font-semibold text-white">{{ resolvedSubclassOption.name }}</div>
                        <div class="mt-1 text-xs text-[#9f9278]">
                          <span v-if="resolvedSubclassOption.source">{{ resolvedSubclassOption.source }}</span>
                          <span v-if="resolvedSubclassOption.page"> · p. {{ resolvedSubclassOption.page }}</span>
                        </div>
                      </div>

                      <div
                        v-if="resolvedSubclassOption.recommended"
                        class="eldra-gold-chip shrink-0 rounded-none border px-2 py-0.5 text-[10px]"
                      >
                        Recommended
                      </div>
                    </div>

                    <p
                      v-if="resolvedSubclassDescription"
                      class="mt-3 whitespace-pre-line break-words text-xs leading-5 text-[#d8ceb8]"
                    >
                      {{ resolvedSubclassDescription }}
                    </p>
                  </div>

                  <div
                    v-if="resolvedSubclassFeatureCards.length"
                    class="grid gap-2"
                  >
                    <article
                      v-for="(feature, index) in resolvedSubclassFeatureCards"
                      :key="`sheet-subclass-feature-${feature.title}-${feature.level}-${index}`"
                      class="min-w-0 overflow-hidden rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                      :class="Number(feature.level || 0) > currentLevelNumber ? 'opacity-70' : ''"
                    >
                      <button
                        type="button"
                        class="flex w-full items-start justify-between gap-3 text-left"
                        @click="toggleSubclassFeatureCard('sheet', feature, index)"
                      >
                        <div class="min-w-0">
                          <div class="truncate font-semibold text-white">{{ feature.title }}</div>
                          <div class="mt-1 text-xs text-[#9f9278]">
                            Level {{ feature.level || '—' }}<span v-if="feature.source"> · {{ feature.source }}</span>
                            <span v-if="Number(feature.level || 0) > currentLevelNumber"> · Future</span>
                          </div>
                        </div>

                        <UIcon :name="subclassFeatureCardChevron('sheet', feature, index)" class="h-4 w-4 shrink-0 text-[#9f9278]" />
                      </button>

                      <div
                        v-show="subclassFeatureCardOpen('sheet', feature, index)"
                        class="mt-3 border-t border-[rgba(201,164,90,0.14)] pt-3"
                      >
                        <p
                          v-if="feature.description"
                          class="whitespace-pre-line break-words text-xs leading-5 text-[#9f9278]"
                        >
                          {{ feature.description }}
                        </p>

                        <div
                          v-else
                          class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-3 text-xs text-[#9f9278]"
                        >
                          No description resolved for this subclass feature yet.
                        </div>
                      </div>
                    </article>
                  </div>

                  <div
                    v-else
                    class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]"
                  >
                    This character has a subclass/path saved, but no subclass feature details were resolved yet.
                  </div>
                </div>
              </div>

              <div class="eldra-codex-soft rounded-none p-4">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 text-left"
                  @click="toggleFeaturePanel('species')"
                >
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Species Traits</div>
                    <div class="mt-1 text-sm text-[#d8ceb8]">{{ resolvedSpecies?.title || 'No linked species' }}</div>
                  </div>

                  <div class="flex items-center gap-2">
                    <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                      {{ speciesTraitCards.length }} Trait{{ speciesTraitCards.length === 1 ? '' : 's' }}
                    </div>
                    <UIcon :name="featurePanelChevron('species')" class="h-4 w-4 text-[#9f9278]" />
                  </div>
                </button>

                <div
                  v-show="featurePanelOpen('species')"
                  class="mt-4 grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3"
                >
                  <article
                    v-for="trait in speciesTraitCards"
                    :key="trait.id"
                    class="min-w-0 overflow-hidden rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                  >
                    <div class="flex min-w-0 items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="max-w-full truncate font-semibold text-white">{{ trait.title }}</div>
                        <div class="mt-1 text-xs text-[#9f9278]">{{ trait.type }}</div>
                      </div>

                      <button
                        type="button"
                        class="shrink-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
                        @click.stop="openFeatureDrawer(trait)"
                      >
                        Details
                      </button>
                    </div>

                    <p class="mt-3 break-words text-xs leading-5 text-[#9f9278]">
                      {{ shortText(trait.description, 180) }}
                    </p>
                  </article>
                </div>
              </div>

              <div
                v-if="backgroundFeatureCard"
                class="eldra-codex-soft rounded-none p-4"
              >
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 text-left"
                  @click="toggleFeaturePanel('background')"
                >
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Background Feature</div>
                    <div class="mt-1 text-sm text-[#d8ceb8]">{{ resolvedBackground?.title || 'No linked background' }}</div>
                  </div>

                  <UIcon :name="featurePanelChevron('background')" class="h-4 w-4 text-[#9f9278]" />
                </button>

                <article
                  v-show="featurePanelOpen('background')"
                  class="mt-4 min-w-0 overflow-hidden rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                >
                  <div class="flex min-w-0 items-start justify-between gap-3">
                    <div>
                      <div class="font-semibold text-white">{{ backgroundFeatureCard.title }}</div>
                      <div class="mt-1 text-xs text-[#9f9278]">Background Feature</div>
                    </div>

                    <button
                      type="button"
                      class="shrink-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
                      @click.stop="openFeatureDrawer(backgroundFeatureCard)"
                    >
                      Details
                    </button>
                  </div>

                  <p class="mt-3 break-words text-xs leading-5 text-[#9f9278]">
                    {{ shortText(backgroundFeatureCard.description, 220) }}
                  </p>
                </article>
              </div>

              <div class="eldra-codex-soft rounded-none p-4">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 text-left"
                  @click="toggleFeaturePanel('feats')"
                >
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Selected Feats</div>
                    <div class="mt-1 text-sm text-[#d8ceb8]">Resolved from imported feat articles saved on this sheet.</div>
                  </div>

                  <div class="flex items-center gap-2">
                    <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                      {{ selectedFeats.length }} Feat{{ selectedFeats.length === 1 ? '' : 's' }}
                    </div>
                    <UIcon :name="featurePanelChevron('feats')" class="h-4 w-4 text-[#9f9278]" />
                  </div>
                </button>

                <div
                  v-show="featurePanelOpen('feats')"
                  class="mt-4 grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3"
                >
                  <article
                    v-for="feat in selectedFeats"
                    :key="feat.id"
                    class="min-w-0 overflow-hidden rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                  >
                    <div class="flex min-w-0 items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="max-w-full truncate font-semibold text-white">{{ feat.title }}</div>
                        <div class="mt-1 text-xs text-[#9f9278]">
                          <span v-if="feat.source">{{ feat.source }}</span>
                          <span v-if="feat.page"> · p. {{ feat.page }}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        class="shrink-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
                        @click.stop="openFeatureDrawer(featFeatureCard(feat))"
                      >
                        Details
                      </button>
                    </div>

                    <p v-if="feat.benefits" class="mt-3 break-words text-xs leading-5 text-[#9f9278]">
                      {{ shortText(feat.benefits, 180) }}
                    </p>
                  </article>

                  <div
                    v-if="!selectedFeats.length"
                    class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278] md:col-span-2 xl:col-span-3"
                  >
                    No feat choices selected yet.
                  </div>
                </div>
              </div>
            </section>


            <section
              v-else
              class="mt-0 grid gap-3 md:mt-6"
            >
              <div class="eldra-codex-soft rounded-none p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Notes</div>
                    <div class="mt-1 text-sm text-[#d8ceb8]">Searchable note cards for NPCs, cities, clues, quests, and table reminders.</div>
                  </div>

                  <div class="flex items-center gap-2">
                    <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                      {{ sheetNoteCards.length }} Note{{ sheetNoteCards.length === 1 ? '' : 's' }}
                    </div>

                    <button
                      type="button"
                      class="eldra-button rounded-none px-3 py-2 text-xs font-semibold"
                      @click="openAddNoteDrawer"
                    >
                      Add Note +
                    </button>
                  </div>
                </div>

                <div class="mt-4">
                  <label class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Search Notes</label>
                  <input
                    v-model="noteSearch"
                    type="text"
                    class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                    placeholder="Search NPC, city, quest, clue..."
                  >
                </div>

                <div v-if="noteSaveError" class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {{ noteSaveError }}
                </div>

                <div v-if="noteSaveSuccess" class="mt-3 rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  {{ noteSaveSuccess }}
                </div>

                <div
                  v-if="filteredNoteCards.length"
                  class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3"
                >
                  <article
                    v-for="note in filteredNoteCards"
                    :key="note.id"
                    class="min-w-0 overflow-hidden rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                  >
                    <div class="flex min-w-0 items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="max-w-full truncate font-semibold text-white">{{ note.title || 'Untitled Note' }}</div>
                        <div v-if="formatNoteDate(note.updatedAt)" class="mt-1 text-xs text-[#9f9278]">
                          Updated {{ formatNoteDate(note.updatedAt) }}
                        </div>
                      </div>

                      <button
                        type="button"
                        class="shrink-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
                        @click.stop="openNoteDetail(note)"
                      >
                        Details
                      </button>
                    </div>

                    <p class="mt-3 break-words text-xs leading-5 text-[#9f9278]">
                      {{ shortText(note.body, 220) || 'No note body yet.' }}
                    </p>
                  </article>
                </div>

                <div v-else class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]">
                  {{ sheetNoteCards.length ? 'No notes match that search.' : 'No notes yet. Add one for an NPC, city, clue, or quest.' }}
                </div>
              </div>
            </section>
        </template>
      </section>
    </div>



      <ClientOnly>
        <EldraDiceBox ref="diceBoxRef" />
      </ClientOnly>


    <div
      v-if="portraitUploadError || portraitUploadSuccess"
      class="fixed left-4 right-4 top-4 z-[180] rounded-none border p-3 text-sm shadow-[0_12px_32px_rgba(0,0,0,0.35)] md:left-auto md:w-[360px]"
      :class="portraitUploadError ? 'border-red-500/30 bg-red-950/90 text-red-100' : 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100'"
    >
      {{ portraitUploadError || portraitUploadSuccess }}
    </div>

    <!-- Portrait Lightbox -->

      <!-- Level Up Drawer -->
      <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
        <div
          v-if="levelUpOpen"
          class="fixed inset-0 z-[146] bg-black/60 backdrop-blur-sm md:pointer-events-none md:bg-transparent md:backdrop-blur-none"
          @click.self="closeLevelUpDrawer"
        >
          <aside class="eldra-ornate-panel eldra-frame-corners fixed bottom-0 right-0 top-0 flex h-full w-full flex-col border-l backdrop-blur-xl md:pointer-events-auto md:w-[520px]">
            <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
              <div class="min-w-0">
                <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Build Mode</div>
                <h2 class="mt-2 truncate text-2xl font-semibold text-white">Level Manager</h2>
                <div class="mt-1 text-xs text-[#9f9278]">
                  Set levels up or down, then walk through HP, subclass, choices, and spells.
                </div>
              </div>

              <button
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-2 text-[#b5a88d] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
                @click="closeLevelUpDrawer"
              >
                <UIcon name="i-lucide-x" class="h-4 w-4" />
              </button>
            </div>

            <div class="flex-1 overflow-y-auto px-5 py-5">
              <div class="grid gap-3">
                <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3">
                  <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Step 1</div>
                  <div class="mt-1 text-lg font-semibold text-white">Choose target level</div>

                  <div class="mt-3 grid grid-cols-[minmax(0,1fr)_140px] gap-3">
                    <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3">
                      <div class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">Starting</div>
                      <div class="mt-1 text-2xl font-semibold text-white">Level {{ levelUpStartingLevelNumber }}</div>
                    </div>

                    <label class="block">
                      <span class="mb-1 block text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">Target</span>
                      <select
                        v-model="levelUpTargetLevel"
                        class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                      >
                        <option
                          v-for="option in levelOptions"
                          :key="option.value"
                          :value="option.value"
                          class="bg-[#090909] text-[#f5e7bd]"
                        >
                          {{ option.label }}
                        </option>
                      </select>
                    </label>
                  </div>
                </div>

                <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Step 2</div>
                      <div class="mt-1 text-lg font-semibold text-white">Preview unlocks</div>
                    </div>

                    <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                      {{ levelUpUnlockCards.length }} Feature{{ levelUpUnlockCards.length === 1 ? '' : 's' }}
                    </div>
                  </div>

                  <div v-if="levelUpUnlockCards.length" class="mt-3 grid gap-2">
                    <article
                      v-for="feature in levelUpUnlockCards"
                      :key="`level-up-feature-${feature.id}`"
                      class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3"
                    >
                      <div class="min-w-0">
                        <div class="truncate font-semibold text-white">{{ feature.title }}</div>
                        <div class="mt-1 text-xs text-[#9f9278]">
                          Level {{ feature.level || levelUpTargetNumber }}<span v-if="feature.source"> · {{ feature.source }}</span>
                        </div>
                      </div>

                      <p class="mt-2 break-words text-xs leading-5 text-[#9f9278]">
                        {{ shortText(feature.description, 180) || 'Feature details will appear here when imported.' }}
                      </p>
                    </article>
                  </div>

                  <div v-else class="mt-3 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-3 text-sm text-[#9f9278]">
                    No imported class features found for the selected level.
                  </div>
                </div>

                <div
                  v-if="levelUpSubclassUnlocked"
                  class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                >
                  <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Step 2B</div>
                  <div class="mt-1 text-lg font-semibold text-white">Choose {{ levelUpSubclassLabel }}</div>
                  <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                    This level unlocks a subclass/tradition choice.
                  </p>

                  <label
                    v-if="subclassOptions.length"
                    class="mt-3 block"
                  >
                    <span class="mb-1 block text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">{{ levelUpSubclassLabel }}</span>
                    <select
                      v-model="levelUpSubclassDraft"
                      class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                    >
                      <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose {{ levelUpSubclassLabel }}...</option>
                      <option
                        v-for="option in subclassOptions"
                        :key="`${option.name}-${option.source}-${option.classSource}`"
                        :value="option.name"
                        class="bg-[#090909] text-[#f5e7bd]"
                      >
                        {{ option.name }}{{ option.source ? ` (${option.source})` : '' }}
                      </option>
                    </select>
                    <div class="mt-2 text-xs leading-5 text-[#9f9278]">
                      Showing {{ subclassOptions.length }} {{ subclassOptions.length === 1 ? 'option' : 'options' }} for {{ subclassOptionPayload?.className || resolvedClass?.title || sheet?.class_name || 'this class' }}.
                    </div>
                  </label>

                  <label
                    v-else
                    class="mt-3 block"
                  >
                    <span class="mb-1 block text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">{{ levelUpSubclassLabel }}</span>
                    <input
                      v-model="levelUpSubclassDraft"
                      class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                      placeholder="No subclass options found. Type manually or import subclass data."
                    >
                    <div class="mt-2 rounded-none border border-amber-300/24 bg-amber-400/10 p-2 text-xs leading-5 text-amber-100">
                      No subclass options were found for this class. We should import/fix subclass data before relying on manual entry.
                    </div>
                  </label>

                  <!-- Selected Subclass Preview -->
                  <div
                    v-if="selectedLevelUpSubclassOption"
                    class="mt-3 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.48)] p-3"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Selected Preview</div>
                        <div class="mt-1 truncate text-lg font-semibold text-white">
                          {{ selectedLevelUpSubclassOption.name }}
                        </div>
                        <div class="mt-1 text-xs text-[#9f9278]">
                          <span v-if="selectedLevelUpSubclassOption.source">{{ selectedLevelUpSubclassOption.source }}</span>
                          <span v-if="selectedLevelUpSubclassOption.page"> · p. {{ selectedLevelUpSubclassOption.page }}</span>
                          <span v-if="selectedLevelUpSubclassOption.featureCount"> · {{ selectedLevelUpSubclassOption.featureCount }} feature{{ selectedLevelUpSubclassOption.featureCount === 1 ? '' : 's' }}</span>
                        </div>
                      </div>

                      <div
                        v-if="selectedLevelUpSubclassOption.recommended"
                        class="eldra-gold-chip shrink-0 rounded-none border px-2 py-0.5 text-[10px]"
                      >
                        Recommended
                      </div>
                    </div>

                    <p
                      v-if="selectedLevelUpSubclassDescription"
                      class="mt-3 whitespace-pre-line break-words text-xs leading-5 text-[#d8ceb8]"
                    >
                      {{ selectedLevelUpSubclassDescription }}
                    </p>


                    <div
                      v-if="selectedLevelUpSubclassFeatures.length"
                      class="mt-3 grid gap-2"
                    >
                      <article
                        v-for="(feature, index) in selectedLevelUpSubclassFeatures"
                        :key="`selected-subclass-feature-${feature.title}-${feature.level}-${index}`"
                        class="rounded-none border border-[rgba(65,82,103,0.56)] bg-[rgba(8,17,27,0.62)] p-3"
                      >
                        <button
                          type="button"
                          class="flex w-full items-start justify-between gap-3 text-left"
                          @click="toggleSubclassFeatureCard('level', feature, index)"
                        >
                          <div class="min-w-0">
                            <div class="truncate font-semibold text-white">{{ feature.title }}</div>
                            <div class="mt-1 text-xs text-[#9f9278]">
                              Level {{ feature.level || '—' }}<span v-if="feature.source"> · {{ feature.source }}</span>
                            </div>
                          </div>

                          <UIcon :name="subclassFeatureCardChevron('level', feature, index)" class="h-4 w-4 shrink-0 text-[#9f9278]" />
                        </button>

                        <div
                          v-show="subclassFeatureCardOpen('level', feature, index)"
                          class="mt-3 border-t border-[rgba(201,164,90,0.14)] pt-3"
                        >
                          <p
                            v-if="feature.description"
                            class="whitespace-pre-line break-words text-xs leading-5 text-[#9f9278]"
                          >
                            {{ feature.description }}
                          </p>

                          <div
                            v-else
                            class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-3 text-xs text-[#9f9278]"
                          >
                            No description resolved for this subclass feature yet.
                          </div>
                        </div>
                      </article>
                    </div>

                    <div
                      v-else
                      class="mt-3 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-3 text-xs text-[#9f9278]"
                    >
                      This subclass was found, but no subclass feature preview entries were resolved yet.
                    </div>
                  </div>

                </div>

                <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3">
                  <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Step 2C</div>
                  <div class="mt-1 text-lg font-semibold text-white">Hit Points</div>
                  <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                    Fixed average uses {{ levelUpFixedHitDieAverage(levelUpHitDieFaces()) }} + CON per level changed, minimum 1 HP per level.
                  </p>

                  <div class="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      class="rounded-none border px-3 py-2 text-xs font-semibold"
                      :class="levelUpHpMode === 'fixed'
                        ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
                        : 'border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
                      @click="levelUpHpMode = 'fixed'"
                    >
                      Fixed Average
                    </button>

                    <button
                      type="button"
                      class="rounded-none border px-3 py-2 text-xs font-semibold"
                      :class="levelUpHpMode === 'manual'
                        ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
                        : 'border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
                      @click="levelUpHpMode = 'manual'"
                    >
                      Manual HP
                    </button>
                  </div>

                  <div class="mt-3 grid grid-cols-2 gap-3">
                    <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3">
                      <div class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">Projected Max</div>
                      <div class="mt-1 text-2xl font-semibold text-white">{{ levelUpProjectedMaxHp }}</div>
                      <div class="mt-1 text-xs text-[#9f9278]">
                        {{ levelUpHpDelta >= 0 ? '+' : '' }}{{ levelUpHpDelta }} HP from level change
                      </div>
                    </div>

                    <label class="block">
                      <span class="mb-1 block text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">Manual Max HP</span>
                      <input
                        v-model="levelUpManualMaxHp"
                        inputmode="numeric"
                        class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                        :disabled="levelUpHpMode !== 'manual'"
                      >
                    </label>
                  </div>
                </div>

                <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3">
                  <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Step 3</div>
                  <div class="mt-1 text-lg font-semibold text-white">Apply level</div>
                  <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                    This updates level, HP, current HP, and subclass selection if one was chosen.
                  </p>

                  <button
                    type="button"
                    class="mt-3 eldra-button w-full rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
                    :disabled="levelUpSaving || levelUpTargetNumber === levelUpStartingLevelNumber || levelUpApplied"
                    @click="applyLevelUp"
                  >
                    {{ levelUpSaving ? 'Applying...' : `Apply Level ${levelUpTargetNumber}` }}
                  </button>
                </div>

                <div v-if="levelUpError" class="rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {{ levelUpError }}
                </div>

                <div v-if="levelUpSuccess" class="rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  {{ levelUpSuccess }}
                </div>

                <div
                  v-if="levelUpApplied"
                  class="rounded-none border border-[rgba(201,164,90,0.28)] bg-[rgba(20,17,12,0.52)] p-3"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Step 4</div>
                      <div class="mt-1 text-lg font-semibold text-white">Incomplete Choices</div>
                    </div>

                    <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                      {{ levelUpPendingChoiceCards.length }} Pending
                    </div>
                  </div>

                  <div v-if="levelUpPendingChoiceCards.length" class="mt-3 grid gap-3">
                    <div
                      v-for="choice in levelUpPendingChoiceCards"
                      :key="`level-choice-${choice.sourceKey}`"
                      class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(9,17,26,0.42)] p-3"
                    >
                      <div class="font-semibold text-white">{{ choice.label }}</div>

                      <div class="mt-3 grid gap-2">
                        <label
                          v-for="slot in choiceSlots(choice)"
                          :key="`level-${choice.sourceKey}-${slot}`"
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
                    </div>

                    <button
                      type="button"
                      class="eldra-button rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
                      :disabled="choiceSaving"
                      @click="saveChoices"
                    >
                      {{ choiceSaving ? 'Saving...' : 'Save Choices' }}
                    </button>
                  </div>

                  <div v-else class="mt-3 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-3 text-sm text-[#9f9278]">
                    No incomplete choices for this level right now.
                  </div>
                </div>

                <div
                  v-if="levelUpApplied"
                  class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                >
                  <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Step 5</div>
                  <div class="mt-1 text-lg font-semibold text-white">Spells and review</div>
                  <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                    If this level grants spell choices, new slots, or prepared spells, use the spell manager next.
                  </p>

                  <div class="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      class="eldra-button rounded-none px-4 py-3 text-sm font-semibold"
                      @click="openSpellBuilderFromLevelUp"
                    >
                      Manage Spells
                    </button>

                    <button
                      type="button"
                      class="eldra-button rounded-none px-4 py-3 text-sm font-semibold"
                      @click="closeLevelUpDrawer"
                    >
                      Finish
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
              <button
                type="button"
                class="eldra-button w-full rounded-none px-4 py-3 text-sm font-medium"
                @click="closeLevelUpDrawer"
              >
                Close
              </button>
            </div>
          </aside>
        </div>
      </Transition>

      <!-- Spell Builder Drawer -->
      <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
        <div
          v-if="spellBuilderOpen"
          class="fixed inset-0 z-[145] bg-black/60 backdrop-blur-sm md:pointer-events-none md:bg-transparent md:backdrop-blur-none"
          @click.self="closeSpellBuilder"
        >
          <aside class="eldra-ornate-panel eldra-frame-corners fixed bottom-0 right-0 top-0 flex h-full w-full flex-col border-l backdrop-blur-xl md:pointer-events-auto md:w-[520px]">
            <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
              <div class="min-w-0">
                <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Build Mode</div>
                <h2 class="mt-2 truncate text-2xl font-semibold text-white">Manage Spells</h2>
                <div class="mt-1 text-xs text-[#9f9278]">
                  Recommended by default. Advanced overrides are allowed but marked.
                </div>
              </div>

              <button
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-2 text-[#b5a88d] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
                @click="closeSpellBuilder"
              >
                <UIcon name="i-lucide-x" class="h-4 w-4" />
              </button>
            </div>

            <div class="flex-1 overflow-y-auto px-5 py-5">
              <div class="grid gap-3">
                <label class="block">
                  <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Search Spells</span>
                  <input
                    v-model="spellBuilderSearch"
                    type="text"
                    class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                    placeholder="Search Magic Missile, Shield, Fire Bolt..."
                  >
                </label>

                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="option in spellBuilderLevelOptions"
                    :key="option.key"
                    type="button"
                    class="rounded-none border px-3 py-1.5 text-xs font-semibold"
                    :class="spellBuilderLevelFilter === option.key
                      ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
                      : 'border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
                    @click="spellBuilderLevelFilter = option.key"
                  >
                    {{ option.label }}
                  </button>
                </div>

                <button
                  type="button"
                  class="flex items-center justify-between gap-3 rounded-none border px-3 py-2 text-left text-xs"
                  :class="spellBuilderAdvanced
                    ? 'border-amber-300/40 bg-amber-400/10 text-amber-100'
                    : 'border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
                  @click="spellBuilderAdvanced = !spellBuilderAdvanced"
                >
                  <span>
                    {{ spellBuilderAdvanced ? 'Advanced Override Mode Enabled' : 'Recommended Spells Only' }}
                  </span>
                  <span class="text-[#9f9278]">
                    {{ spellBuilderAdvanced ? 'Showing all imported spells' : 'Tap to show off-list spells' }}
                  </span>
                </button>

                <div
                  v-if="spellBuilderAdvanced"
                  class="rounded-none border border-amber-300/24 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100"
                >
                  Advanced mode lets this character learn or prepare spells outside normal class access. Use it for feats, boons, homebrew, weird plot nonsense, or DM-approved chaos.
                </div>

                <div v-if="spellSaveError" class="rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {{ spellSaveError }}
                </div>

                <div v-if="spellSaveSuccess" class="rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  {{ spellSaveSuccess }}
                </div>
              </div>

              <div class="mt-4 grid gap-2">
                <article
                  v-for="spell in filteredSpellBuilderCards"
                  :key="`spell-builder-${spellBuilderSpellId(spell)}`"
                  class="min-w-0 overflow-hidden rounded-none border p-3"
                  :class="spellBuilderIsRecommended(spell)
                    ? 'border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)]'
                    : 'border-amber-300/28 bg-amber-400/8'"
                >
                  <div class="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      class="min-w-0 flex-1 text-left"
                      @click.stop="openSpellDrawer(spell)"
                    >
                      <div class="truncate font-semibold text-white">{{ spellBuilderTitle(spell) }}</div>
                      <div class="mt-1 text-xs text-[#9f9278]">
                        {{ spellBuilderLevelText(spell) }}
                      </div>
                    </button>

                    <div class="flex shrink-0 flex-col items-end gap-1">
                      <span
                        class="rounded-none border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]"
                        :class="spellBuilderIsRecommended(spell)
                          ? 'border-[rgba(201,164,90,0.20)] bg-[rgba(201,164,90,0.08)] text-[#f5e7bd]'
                          : 'border-amber-300/30 bg-amber-400/10 text-amber-100'"
                      >
                        {{ spellBuilderIsRecommended(spell) ? 'Recommended' : 'Override' }}
                      </span>

                      <span v-if="spellBuilderIsKnown(spell)" class="text-[10px] text-emerald-200">Known</span>
                      <span v-if="spellBuilderIsPrepared(spell)" class="text-[10px] text-[#c9a45a]">Prepared</span>
                    </div>
                  </div>

                  <div class="mt-3 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-2 text-xs font-semibold text-[#fff7df]"
                      @click.stop="openSpellDrawer(spell)"
                    >
                      Details
                    </button>

                    <button
                      type="button"
                      class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-45"
                      :disabled="spellBuilderIsKnown(spell)"
                      @click.stop="addSpellFromBuilder(spell)"
                    >
                      {{ spellBuilderIsRecommended(spell) ? 'Add Known' : 'Add Override' }}
                    </button>

                    <button
                      type="button"
                      class="rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(201,164,90,0.14)] px-2 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-45"
                      :disabled="spellBuilderIsPrepared(spell)"
                      @click.stop="prepareSpellFromBuilder(spell)"
                    >
                      Prepare
                    </button>
                  </div>
                </article>

                <div
                  v-if="!filteredSpellBuilderCards.length"
                  class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]"
                >
                  No spells match that search/filter.
                </div>
              </div>
            </div>

            <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
              <div class="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  class="eldra-button rounded-none px-4 py-3 text-sm font-medium"
                  @click="closeSpellBuilder"
                >
                  Close
                </button>

                <button
                  type="button"
                  class="eldra-button rounded-none px-4 py-3 text-sm font-medium disabled:opacity-50"
                  :disabled="spellSaving"
                  @click="saveSpells"
                >
                  {{ spellSaving ? 'Saving...' : 'Save Spells' }}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </Transition>

      <!-- Note Detail Drawer -->
      <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
        <div
          v-if="noteDrawerOpen"
          class="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm md:pointer-events-none md:bg-transparent md:backdrop-blur-none"
          @click.self="closeNoteDrawer"
        >
          <aside class="eldra-ornate-panel eldra-frame-corners fixed bottom-0 right-0 top-0 flex h-full w-full flex-col border-l backdrop-blur-xl md:pointer-events-auto md:w-[440px]">
            <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
              <div class="min-w-0">
                <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Note</div>
                <h2 class="mt-2 truncate text-2xl font-semibold text-white">
                  {{ noteDraft.title || selectedNoteDetail?.title || 'New Note' }}
                </h2>
                <div v-if="selectedNoteDetail?.updatedAt && noteDrawerMode === 'view'" class="mt-1 text-xs text-[#9f9278]">
                  Updated {{ formatNoteDate(selectedNoteDetail.updatedAt) }}
                </div>
              </div>

              <button
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-2 text-[#b5a88d] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
                @click="closeNoteDrawer"
              >
                <UIcon name="i-lucide-x" class="h-4 w-4" />
              </button>
            </div>

            <div class="flex-1 overflow-y-auto px-5 py-5">
              <div v-if="noteDrawerMode === 'edit'" class="grid gap-4">
                <label class="block">
                  <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Title</span>
                  <input
                    v-model="noteDraft.title"
                    class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                    placeholder="NPC, city, clue, quest..."
                  >
                </label>

                <label class="block">
                  <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Body</span>
                  <textarea
                    v-model="noteDraft.body"
                    rows="12"
                    class="eldra-input w-full rounded-none px-3 py-2 text-sm leading-6 text-white"
                    placeholder="Write the note..."
                  />
                </label>

                <div v-if="noteSaveError" class="rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {{ noteSaveError }}
                </div>
              </div>

              <div v-else class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.48)] p-4">
                <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Body</div>
                <p class="mt-3 whitespace-pre-line break-words text-sm leading-6 text-[#d8ceb8]">
                  {{ selectedNoteDetail?.body || 'No note body yet.' }}
                </p>
              </div>
            </div>

            <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
              <div v-if="noteDrawerMode === 'edit'" class="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  class="eldra-button rounded-none px-4 py-3 text-sm font-medium disabled:opacity-50"
                  :disabled="noteSaving"
                  @click="saveNoteCard"
                >
                  {{ noteSaving ? 'Saving...' : 'Save Note' }}
                </button>

                <button
                  type="button"
                  class="eldra-button rounded-none px-4 py-3 text-sm font-medium"
                  @click="closeNoteDrawer"
                >
                  Cancel
                </button>

                <button
                  v-if="noteDraft.id"
                  type="button"
                  class="col-span-2 rounded-none border border-red-500/24 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100 disabled:opacity-50"
                  :disabled="noteSaving"
                  @click="removeNoteCard({ id: noteDraft.id, title: noteDraft.title })"
                >
                  Delete Note
                </button>
              </div>

              <div v-else class="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  class="eldra-button rounded-none px-4 py-3 text-sm font-medium"
                  @click="editCurrentNote"
                >
                  Edit
                </button>

                <button
                  type="button"
                  class="eldra-button rounded-none px-4 py-3 text-sm font-medium"
                  @click="closeNoteDrawer"
                >
                  Close
                </button>
              </div>
            </div>
          </aside>
        </div>
      </Transition>

      <!-- Feature Detail Drawer -->
      <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
        <div
          v-if="selectedFeatureDetail"
          class="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm md:pointer-events-none md:bg-transparent md:backdrop-blur-none"
          @click.self="closeFeatureDrawer"
        >
          <aside class="eldra-ornate-panel eldra-frame-corners fixed bottom-0 right-0 top-0 flex h-full w-full flex-col border-l backdrop-blur-xl md:pointer-events-auto md:w-[440px]">
            <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
              <div class="min-w-0">
                <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Feature Details</div>
                <h2 class="mt-2 truncate text-2xl font-semibold text-white">
                  {{ selectedFeatureDetail.title || 'Feature' }}
                </h2>
                <div class="mt-1 text-xs text-[#9f9278]">
                  {{ selectedFeatureDetail.type || 'Feature' }}
                  <span v-if="selectedFeatureDetail.level"> · Level {{ selectedFeatureDetail.level }}</span>
                  <span v-if="selectedFeatureDetail.source"> · {{ selectedFeatureDetail.source }}</span>
                </div>
              </div>

              <button
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-2 text-[#b5a88d] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
                @click="closeFeatureDrawer"
              >
                <UIcon name="i-lucide-x" class="h-4 w-4" />
              </button>
            </div>

            <div class="flex-1 overflow-y-auto px-5 py-5">
              <div class="grid gap-2 text-sm">
                <div
                  v-if="selectedFeatureDetail.level"
                  class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.48)] p-3"
                >
                  <span class="text-[#9f9278]">Level:</span>
                  <span class="text-[#fff7df]">{{ selectedFeatureDetail.level }}</span>
                </div>

                <div
                  v-if="selectedFeatureDetail.page"
                  class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.48)] p-3"
                >
                  <span class="text-[#9f9278]">Page:</span>
                  <span class="text-[#fff7df]">{{ selectedFeatureDetail.page }}</span>
                </div>
              </div>

              <div class="mt-5 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.48)] p-4">
                <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Description</div>
                <p class="mt-3 whitespace-pre-line text-sm leading-6 text-[#d8ceb8]">
                  {{ selectedFeatureDetail.description || 'No feature description has been imported for this feature yet.' }}
                </p>
              </div>
            </div>

            <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
              <div class="flex gap-3">
                <NuxtLink
                  v-if="selectedFeatureDetail.articleUrl"
                  :to="selectedFeatureDetail.articleUrl"
                  class="flex-1 eldra-button rounded-none px-4 py-3 text-center text-sm font-medium"
                  @click="closeFeatureDrawer"
                >
                  Open Full Article
                </NuxtLink>

                <button
                  type="button"
                  class="flex-1 eldra-button rounded-none px-4 py-3 text-sm font-medium"
                  @click="closeFeatureDrawer"
                >
                  Close
                </button>
              </div>
            </div>
          </aside>
        </div>
      </Transition>

    <!-- Item Detail Drawer -->
    <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
      <div
        v-if="selectedItemDetail"
        class="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm md:pointer-events-none md:bg-transparent md:backdrop-blur-none"
        @click.self="closeItemDrawer"
      >
        <aside class="eldra-ornate-panel eldra-frame-corners fixed bottom-0 right-0 top-0 flex h-full w-full flex-col border-l backdrop-blur-xl md:pointer-events-auto md:w-[440px]">
          <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
            <div class="min-w-0">
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Item Details</div>
              <h2 class="mt-2 truncate text-2xl font-semibold text-white">
                {{ selectedItemDetail.name || 'Item' }}
              </h2>
              <div class="mt-1 text-xs text-[#9f9278]">
                {{ selectedItemDetail.itemType || 'Item' }}
              </div>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-2 text-[#b5a88d] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
              @click="closeItemDrawer"
            >
              <UIcon name="i-lucide-x" class="h-4 w-4" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto px-5 py-5">
            <div class="grid gap-2 text-sm">
              <div
                v-if="selectedItemDetail.damage"
                class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.48)] p-3"
              >
                <span class="text-[#9f9278]">Damage:</span>
                <span class="text-[#fff7df]">{{ selectedItemDetail.damage }}</span>
              </div>

              <div
                v-if="selectedItemDetail.damageType"
                class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.48)] p-3"
              >
                <span class="text-[#9f9278]">Damage Type:</span>
                <span class="text-[#fff7df]">{{ selectedItemDetail.damageType }}</span>
              </div>

              <div
                v-if="selectedItemDetail.rarity"
                class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.48)] p-3"
              >
                <span class="text-[#9f9278]">Rarity:</span>
                <span class="text-[#fff7df]">{{ selectedItemDetail.rarity }}</span>
              </div>

              <div
                v-if="selectedItemDetail.weight !== '' && selectedItemDetail.weight !== null && selectedItemDetail.weight !== undefined"
                class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.48)] p-3"
              >
                <span class="text-[#9f9278]">Weight:</span>
                <span class="text-[#fff7df]">{{ selectedItemDetail.weight }}</span>
              </div>

              <div
                v-if="selectedItemDetail.value"
                class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.48)] p-3"
              >
                <span class="text-[#9f9278]">Value:</span>
                <span class="text-[#fff7df]">{{ selectedItemDetail.value }}</span>
              </div>
            </div>

            <div class="mt-5 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.48)] p-4">
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Description</div>
              <p class="mt-3 whitespace-pre-line text-sm leading-6 text-[#d8ceb8]">
                {{ selectedItemDetail.description || selectedItemDetail.notes || 'No item description has been imported for this item yet.' }}
              </p>
            </div>
          </div>

          <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
            <div class="flex gap-3">
              <NuxtLink
                v-if="selectedItemDetail.linkedItemId"
                :to="`/worlds/${worldId}/entities/${selectedItemDetail.linkedItemId}`"
                class="flex-1 eldra-button rounded-none px-4 py-3 text-center text-sm font-medium"
                @click="closeItemDrawer"
              >
                Open Full Article
              </NuxtLink>

              <button
                type="button"
                class="flex-1 eldra-button rounded-none px-4 py-3 text-sm font-medium"
                @click="closeItemDrawer"
              >
                Close
              </button>
            </div>
          </div>
        </aside>
      </div>
    </Transition>

    <!-- Spell Detail Drawer -->
    <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
      <div
        v-if="selectedSpellEntityId"
        class="fixed inset-0 z-[170] bg-black/55 backdrop-blur-sm md:pointer-events-none md:bg-transparent md:backdrop-blur-none"
        @click.self="closeSpellDrawer"
      >
        <aside class="eldra-ornate-panel eldra-frame-corners fixed bottom-0 right-0 top-0 flex h-full w-full flex-col border-l backdrop-blur-xl md:pointer-events-auto md:w-[440px]">
          <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
            <div class="min-w-0">
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Spell Details</div>
              <h2 class="mt-2 truncate text-2xl font-semibold text-white">{{ selectedSpellTitle }}</h2>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-2 text-[#b5a88d] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
              @click="closeSpellDrawer"
            >
              <UIcon name="i-lucide-x" class="h-4 w-4" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto px-5 py-5">
            <div v-if="selectedSpellPending" class="text-sm text-[#d8ceb8]">
              Loading spell...
            </div>

            <template v-else>
              <div
                v-if="selectedSpellMetaLines.length"
                class="grid gap-2"
              >
                <div
                  v-for="line in selectedSpellMetaLines"
                  :key="line"
                  class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]"
                >
                  {{ line }}
                </div>
              </div>

              <section class="eldra-codex-soft mt-5 rounded-none p-4">
                <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Description</div>

                <div
                  v-if="selectedSpellDescription"
                  class="eldra-rich-content mt-4 text-sm leading-7"
                  v-html="renderMarkdown(selectedSpellDescription)"
                ></div>

                <p v-else class="mt-4 text-sm leading-7 text-[#9f9278]">
                  No spell description available.
                </p>
              </section>

              <section
                v-if="selectedSpellHigherLevel"
                class="eldra-codex-soft mt-5 rounded-none p-4"
              >
                <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">At Higher Levels</div>
                <div
                  class="eldra-rich-content mt-4 text-sm leading-7"
                  v-html="renderMarkdown(selectedSpellHigherLevel)"
                ></div>
              </section>
            </template>
          </div>

          <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
            <div class="flex gap-3">
              <NuxtLink
                v-if="selectedSpellArticleUrl"
                :to="selectedSpellArticleUrl"
                class="flex-1 eldra-button rounded-none px-4 py-3 text-center text-sm font-medium"
              >
                Open Full Article
              </NuxtLink>

              <button
                type="button"
                class="flex-1 eldra-button rounded-none px-4 py-3 text-sm font-medium"
                @click="closeSpellDrawer"
              >
                Close
              </button>
            </div>
          </div>
        </aside>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
@media (max-width: 767px) {
  .eldra-mobile-sheet-root {
    left: 0 !important;
    right: 0 !important;
    width: 100vw !important;
    max-width: 100vw !important;
    margin: 0 !important;
    isolation: isolate;
  }

  .eldra-mobile-sheet-root::before {
    content: "";
    pointer-events: none;
    position: fixed;
    inset: 0;
    z-index: -1;
    background:
      radial-gradient(circle at 50% 0%, rgba(36, 54, 72, 0.24), transparent 46%),
      radial-gradient(circle at 20% 95%, rgba(201, 164, 90, 0.08), transparent 38%);
  }
}

@media (max-width: 767px) {
  :global(.eldra-sidebar-ornate) {
    display: none !important;
  }
}
/* Mobile character sheet owns its background.
   Do not let the desktop workspace/sidebar bleed through under it. */
@media (max-width: 767px) {
  .eldra-mobile-sheet-root {
    left: 0 !important;
    right: 0 !important;
    width: 100vw !important;
    max-width: 100vw !important;
    margin: 0 !important;
    isolation: isolate;
    background: #05080d !important;
  }

  .eldra-mobile-sheet-root::before {
    display: none !important;
  }

  :global(.eldra-sidebar-ornate) {
    display: none !important;
  }
}
/* Character sheet compact mode:
   iPads/tablets should use the mobile sheet, without changing global Tailwind breakpoints. */
@media (min-width: 768px) {
  .eldra-sheet-compact {
    position: fixed !important;
    inset: 0 !important;
    z-index: 9999 !important;
    height: 100dvh !important;
    overflow-y: auto !important;
    background: #05080d !important;
  }

  .eldra-sheet-compact .sheet-owned-bg {
    display: block !important;
  }

  .eldra-sheet-compact .sheet-mobile-only {
    display: block !important;
  }

  .eldra-sheet-compact .sheet-desktop-only {
    display: none !important;
  }

  .eldra-sheet-compact > .relative {
    width: 100% !important;
    max-width: 1100px !important;
    padding: 0.75rem 0.75rem 7rem !important;
  }

  .eldra-sheet-compact .eldra-ornate-panel.eldra-frame-corners.eldra-corner-runes {
    padding: 0.75rem 0.75rem 1rem !important;
  }
}
</style>
