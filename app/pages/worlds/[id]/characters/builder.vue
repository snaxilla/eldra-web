<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const BUILDER_LEVEL_OPTIONS = Array.from({ length: 20 }, (_item, index) => index + 1)

const route = useRoute()
const router = useRouter()
const worldId = computed(() => String(route.params.id || ''))
const workspaceMode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const stepIndex = ref(0)
const creating = ref(false)
const createError = ref('')
const advancedScores = ref(false)
const builderPortraitInput = ref<HTMLInputElement | null>(null)
const builderPortraitFile = ref<File | null>(null)
const builderPortraitPreviewUrl = ref('')
const builderImageLightbox = ref({
  open: false,
  url: '',
  title: ''
})
const speciesMechanicsOpen = ref(false)
const classMechanicsOpen = ref(false)
const speciesChoiceSelections = reactive<Record<string, string>>({})
const classChoiceSelections = reactive<Record<string, string[]>>({})

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]
const ABILITIES = [
  { key: 'str', label: 'STR', name: 'Strength' },
  { key: 'dex', label: 'DEX', name: 'Dexterity' },
  { key: 'con', label: 'CON', name: 'Constitution' },
  { key: 'int', label: 'INT', name: 'Intelligence' },
  { key: 'wis', label: 'WIS', name: 'Wisdom' },
  { key: 'cha', label: 'CHA', name: 'Charisma' }
] as const

const BUILDER_TOOL_CATEGORY_OPTIONS: Record<string, string[]> = {
  'musical instrument': [
    'Bagpipes',
    'Drum',
    'Dulcimer',
    'Flute',
    'Lute',
    'Lyre',
    'Horn',
    'Pan Flute',
    'Shawm',
    'Viol'
  ],
  'musical instruments': [
    'Bagpipes',
    'Drum',
    'Dulcimer',
    'Flute',
    'Lute',
    'Lyre',
    'Horn',
    'Pan Flute',
    'Shawm',
    'Viol'
  ],
  'gaming set': [
    'Dice Set',
    'Dragonchess Set',
    'Playing Card Set',
    'Three-Dragon Ante Set'
  ],
  'gaming sets': [
    'Dice Set',
    'Dragonchess Set',
    'Playing Card Set',
    'Three-Dragon Ante Set'
  ],
  "artisan's tools": [
    "Alchemist's Supplies",
    "Brewer's Supplies",
    "Calligrapher's Supplies",
    "Carpenter's Tools",
    "Cartographer's Tools",
    "Cobbler's Tools",
    "Cook's Utensils",
    "Glassblower's Tools",
    "Jeweler's Tools",
    "Leatherworker's Tools",
    "Mason's Tools",
    "Painter's Supplies",
    "Potter's Tools",
    "Smith's Tools",
    "Tinker's Tools",
    "Weaver's Tools",
    "Woodcarver's Tools"
  ],
  'artisan tools': [
    "Alchemist's Supplies",
    "Brewer's Supplies",
    "Calligrapher's Supplies",
    "Carpenter's Tools",
    "Cartographer's Tools",
    "Cobbler's Tools",
    "Cook's Utensils",
    "Glassblower's Tools",
    "Jeweler's Tools",
    "Leatherworker's Tools",
    "Mason's Tools",
    "Painter's Supplies",
    "Potter's Tools",
    "Smith's Tools",
    "Tinker's Tools",
    "Weaver's Tools",
    "Woodcarver's Tools"
  ]
}

const BUILDER_SKILL_OPTIONS = [
  'Acrobatics',
  'Animal Handling',
  'Arcana',
  'Athletics',
  'Deception',
  'History',
  'Insight',
  'Intimidation',
  'Investigation',
  'Medicine',
  'Nature',
  'Perception',
  'Performance',
  'Persuasion',
  'Religion',
  'Sleight of Hand',
  'Stealth',
  'Survival'
]

function normalizeBuilderChoiceCategory(value: any) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[{}]/g, '')
    .replace(/\{@[^\s}]+\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\s+/g, ' ')
}

function expandBuilderChoiceOption(value: any) {
  const raw = typeof value === 'string'
    ? value
    : value?.name || value?.value || value?.skill || value?.tool || builderDisplayValue(value)

  const rawText = String(raw || '').trim()
  const normalized = normalizeBuilderChoiceCategory(rawText)

  if (!normalized) return []

  if ([
    'skill',
    'skills',
    'any skill',
    'any skills',
    'all skill',
    'all skills'
  ].includes(normalized)) {
    return BUILDER_SKILL_OPTIONS
  }

  if (
    normalized === 'your choice of skill' ||
    normalized === 'your choice of skills' ||
    normalized.includes('choose any skill') ||
    normalized.includes('choose any skills') ||
    normalized.includes('any skill') ||
    normalized.includes('any skills')
  ) {
    return BUILDER_SKILL_OPTIONS
  }

  if (BUILDER_TOOL_CATEGORY_OPTIONS[normalized]) {
    return BUILDER_TOOL_CATEGORY_OPTIONS[normalized]
  }

  if (normalized.includes('musical instrument')) {
    return BUILDER_TOOL_CATEGORY_OPTIONS['musical instrument'] || []
  }

  if (normalized.includes('gaming set')) {
    return BUILDER_TOOL_CATEGORY_OPTIONS['gaming set'] || []
  }

  if (normalized.includes('artisan')) {
    return BUILDER_TOOL_CATEGORY_OPTIONS["artisan's tools"] || []
  }

  if (rawText.includes(',')) {
    return rawText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return [rawText]
}

const steps = [
  { key: 'origin', label: 'Origin' },
  { key: 'abilities', label: 'Abilities' },
  { key: 'review', label: 'Review' }
]

const builderForm = reactive({
  name: '',
  level: '1',
  classEntityId: '',
  speciesEntityId: '',
  backgroundEntityId: '',
  abilityScores: {
    str: '15',
    dex: '14',
    con: '13',
    int: '12',
    wis: '10',
    cha: '8'
  }
})

const selectedSpeciesId = computed(() => builderForm.speciesEntityId)
const selectedClassId = computed(() => builderForm.classEntityId)
const selectedBackgroundId = computed(() => builderForm.backgroundEntityId)

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)
const { data: worldEntities } = await useFetch(() => `/api/worlds/${worldId.value}/entities`, {
  default: () => [],
  watch: [worldId]
})

const { data: selectedSpeciesDetail } = await useAsyncData(
  () => `character-builder-species-${worldId.value}-${selectedSpeciesId.value || 'none'}`,
  () => selectedSpeciesId.value
    ? $fetch(`/api/worlds/${worldId.value}/entities/${selectedSpeciesId.value}`)
    : Promise.resolve(null),
  {
    default: () => null,
    watch: [worldId, selectedSpeciesId]
  }
)

const { data: selectedClassDetail } = await useAsyncData(
  () => `character-builder-class-${worldId.value}-${selectedClassId.value || 'none'}`,
  () => selectedClassId.value
    ? $fetch(`/api/worlds/${worldId.value}/entities/${selectedClassId.value}`)
    : Promise.resolve(null),
  {
    default: () => null,
    watch: [worldId, selectedClassId]
  }
)

const { data: selectedBackgroundDetail } = await useAsyncData(
  () => `character-builder-background-${worldId.value}-${selectedBackgroundId.value || 'none'}`,
  () => selectedBackgroundId.value
    ? $fetch(`/api/worlds/${worldId.value}/entities/${selectedBackgroundId.value}`)
    : Promise.resolve(null),
  {
    default: () => null,
    watch: [worldId, selectedBackgroundId]
  }
)

function normalizeFetchedEntityDetail(value: any, fallback: any = null) {
  const detail = value || null

  if (!detail) return fallback || null

  const entity = detail?.entity && typeof detail.entity === 'object'
    ? detail.entity
    : detail

  const blocks = Array.isArray(detail?.blocks)
    ? detail.blocks
    : Array.isArray(entity?.blocks)
      ? entity.blocks
      : Array.isArray(fallback?.blocks)
        ? fallback.blocks
        : []

  return {
    ...fallback,
    ...entity,
    blocks,
    image: entity?.image ?? detail?.image ?? fallback?.image ?? null,
    imageUrl: entity?.imageUrl ?? detail?.imageUrl ?? entity?.image_url ?? detail?.image_url ?? fallback?.imageUrl ?? fallback?.image_url ?? ''
  }
}

function normalizeEntityType(value: any) {
  return String(value || '').trim().toLowerCase()
}

function optionList(type: string) {
  return (Array.isArray(worldEntities.value) ? worldEntities.value : [])
    .filter((entity: any) => normalizeEntityType(entity?.entity_type || entity?.entityType) === type)
    .map((entity: any) => ({
      id: String(entity?.id || ''),
      title: String(entity?.title || 'Untitled'),
      entity
    }))
    .filter((option: any) => option.id)
    .sort((a: any, b: any) => a.title.localeCompare(b.title))
}

const speciesOptions = computed(() => optionList('species'))
const classOptions = computed(() => optionList('class'))
const backgroundOptions = computed(() => optionList('background'))

const { data: featOptionPayload } = await useFetch(() => `/api/worlds/${worldId.value}/feat-options`, {
  default: () => [],
  watch: [worldId]
})

const featOptions = computed(() => {
  const payload = featOptionPayload.value as any

  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.data)) return payload.data

  return []
})

function optionById(options: any[], id: any) {
  const needle = String(id || '')
  if (!needle) return null
  return options.find((option: any) => String(option.id) === needle) || null
}

function optionTitle(options: any[], id: any) {
  return optionById(options, id)?.title || ''
}

const selectedSpeciesOption = computed(() => optionById(speciesOptions.value, builderForm.speciesEntityId))
const selectedClassOption = computed(() => optionById(classOptions.value, builderForm.classEntityId))
const selectedBackgroundOption = computed(() => optionById(backgroundOptions.value, builderForm.backgroundEntityId))

const selectedSpeciesName = computed(() => selectedSpeciesDetail.value?.title || selectedSpeciesOption.value?.title || '')
const selectedClassName = computed(() => selectedClassDetail.value?.title || selectedClassOption.value?.title || '')
const selectedBackgroundName = computed(() => selectedBackgroundDetail.value?.title || selectedBackgroundOption.value?.title || '')

const selectedSpeciesEntity = computed(() => normalizeFetchedEntityDetail(selectedSpeciesDetail.value, selectedSpeciesOption.value?.entity || null))
const selectedClassEntity = computed(() => normalizeFetchedEntityDetail(selectedClassDetail.value, selectedClassOption.value?.entity || null))
const selectedBackgroundEntity = computed(() => normalizeFetchedEntityDetail(selectedBackgroundDetail.value, selectedBackgroundOption.value?.entity || null))

function imageUrlFor(entity: any) {
  const source = entity?.entity && typeof entity.entity === 'object'
    ? {
        ...entity.entity,
        blocks: entity.blocks || entity.entity.blocks,
        image: entity.entity.image ?? entity.image,
        imageUrl: entity.entity.imageUrl ?? entity.imageUrl ?? entity.entity.image_url ?? entity.image_url
      }
    : entity

  if (!source) return ''

  const directUrl = source?.imageUrl || source?.image_url
  if (directUrl) return String(directUrl)

  const image = source?.image

  if (image?.id) return `/api/assets/${image.id}`
  if (image?.filename_disk) return `/api/assets/${image.id || image.filename_disk}`
  if (typeof image === 'string' || typeof image === 'number') return `/api/assets/${image}`

  return ''
}

function plainText(value: any) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function clean5eText(value: any) {
  return String(value || '')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat|classFeature|subclassFeature|optionalfeature|status)\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@dice\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@damage\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@hit\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@dc\s+([^|}]+)(?:\|[^}]*)?\}/g, 'DC $1')
    .replace(/\{@(?:i|b|italic|bold)\s+([^}]+)\}/g, '$1')
    .replace(/\{@[a-zA-Z]+\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function tableToText(value: any) {
  const caption = clean5eText(value?.caption || value?.name || '')
  const labels = Array.isArray(value?.colLabels)
    ? value.colLabels.map(clean5eText).filter(Boolean)
    : []

  const rows = Array.isArray(value?.rows) ? value.rows : []

  const renderedRows = rows
    .map((row: any) => {
      const cells = Array.isArray(row)
        ? row
        : Array.isArray(row?.row)
          ? row.row
          : Array.isArray(row?.items)
            ? row.items
            : []

      if (!cells.length) return ''

      if (labels.length === cells.length) {
        return cells
          .map((cell: any, index: number) => `${labels[index]}: ${entriesToText(cell)}`)
          .filter(Boolean)
          .join(' · ')
      }

      return cells.map(entriesToText).filter(Boolean).join(' · ')
    })
    .filter(Boolean)

  return [
    caption,
    ...renderedRows
  ].filter(Boolean).join('\n')
}

function listToText(value: any) {
  const items = Array.isArray(value?.items)
    ? value.items
    : Array.isArray(value)
      ? value
      : []

  return items
    .map((item: any) => {
      const text = entriesToText(item)
      return text ? `- ${text}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

function namedEntryToText(value: any) {
  const name = clean5eText(value?.name || '')
  const body = entriesToText(value?.entries ?? value?.entry ?? value?.items)

  if (name && body) return `${name}\n${body}`
  return name || body
}

function entriesToText(value: any): string {
  if (value === null || value === undefined) return ''

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return clean5eText(value)
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => entriesToText(item))
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }

  if (typeof value === 'object') {
    const type = String(value.type || '').toLowerCase()

    if (type === 'table') return tableToText(value)
    if (type === 'list') return listToText(value)
    if (type === 'item') return namedEntryToText(value)
    if (type === 'entries' || type === 'section' || type === 'inset' || type === 'variant') return namedEntryToText(value)

    const parts: string[] = []

    if (value.name) {
      parts.push(clean5eText(value.name))
    }

    if (typeof value.entry === 'string') {
      parts.push(clean5eText(value.entry))
    } else if (value.entry) {
      parts.push(entriesToText(value.entry))
    }

    if (Array.isArray(value.entries)) {
      parts.push(entriesToText(value.entries))
    }

    if (Array.isArray(value.items)) {
      parts.push(listToText(value))
    }

    if (value.rows || value.colLabels) {
      parts.push(tableToText(value))
    }

    return parts.filter(Boolean).join('\n\n').trim()
  }

  return ''
}

const CLASS_LORE_FALLBACKS: Record<string, string> = {
  artificer: 'Artificers are magical inventors who turn tools, formulas, and strange devices into adventuring power. Pick this if you like clever gadgets, enchanted gear, and solving problems with weird magical engineering.',
  barbarian: 'Barbarians are fierce warriors powered by rage, instinct, and raw toughness. Pick this if you want to charge into danger, shrug off punishment, and hit like a falling tree.',
  bard: 'Bards use music, stories, charm, and magic to inspire allies and outwit enemies. Pick this if you want to be flexible, social, magical, and just a little dramatic.',
  cleric: 'Clerics channel divine power from gods, ideals, or sacred forces. Pick this if you want healing, protection, radiant magic, and the ability to stand strong in the middle of a fight.',
  druid: 'Druids draw power from nature, beasts, storms, plants, and primal spirits. Pick this if you want shapeshifting, nature magic, and a deep connection to the wild.',
  fighter: 'Fighters are masters of weapons, armor, and battlefield technique. Pick this if you want a straightforward, reliable warrior who can be built in almost any combat style.',
  monk: 'Monks turn discipline, speed, and inner power into supernatural martial arts. Pick this if you want to move fast, fight unarmed, and do impossible-looking physical feats.',
  paladin: 'Paladins are oathbound champions who mix martial strength with divine magic. Pick this if you want heavy armor, smites, healing, and a strong heroic code.',
  ranger: 'Rangers are wilderness warriors who blend tracking, survival, weapons, and nature magic. Pick this if you want to hunt monsters, scout ahead, and thrive outside civilization.',
  rogue: 'Rogues rely on skill, stealth, speed, and dirty tricks. Pick this if you want to sneak, pick locks, talk your way through trouble, and land devastating precision hits.',
  sorcerer: 'Sorcerers are born with magic in their blood, soul, or strange origin. Pick this if you want raw spellcasting power that feels instinctive and dramatic.',
  warlock: 'Warlocks gain magic through a pact with a powerful patron. Pick this if you want spooky bargains, strange powers, and a character with built-in story hooks.',
  wizard: 'Wizards study magic through books, formulas, and hard-won knowledge. Pick this if you want the biggest toolbox of spells and love solving problems with preparation.'
}

const SPECIES_LORE_FALLBACKS: Record<string, string> = {
  aasimar: 'Aasimar are mortals touched by celestial power. They often carry a faint angelic presence, whether that looks like glowing eyes, radiant skin, ghostly wings, or a quiet sense that something holy is watching.',
  dragonborn: 'Dragonborn carry the blood and shape of dragons. They are proud, powerful, and unmistakable, with scaled bodies and breath weapons tied to their draconic ancestry.',
  dwarf: 'Dwarves are sturdy folk known for endurance, craft, clan loyalty, and deep roots in stone halls or mountain homes.',
  elf: 'Elves are graceful, long-lived people touched by magic and old beauty. They often feel connected to ancient forests, starlight, dreams, or lost kingdoms.',
  gnome: 'Gnomes are small, clever, curious people with a knack for invention, illusion, jokes, and strange little obsessions.',
  goliath: 'Goliaths are powerful mountain-born people shaped by endurance, competition, and survival in harsh places.',
  halfling: 'Halflings are small, brave, warm-hearted people who often survive danger through luck, courage, and a refusal to be underestimated.',
  human: 'Humans are adaptable, ambitious, and wildly varied. They fit almost anywhere and can become almost anything.',
  orc: 'Orcs are strong, intense people often shaped by passion, endurance, and a drive to survive or prove themselves.',
  tiefling: 'Tieflings carry infernal or otherworldly bloodlines, often marked by horns, tails, unusual eyes, and a life spent dealing with other people’s assumptions.',
  genasi: 'Genasi are touched by elemental power. Fire, water, air, or earth shows in their body, personality, and magic.',
  kobold: 'Kobolds are small draconic people known for clever traps, pack tactics, big personalities, and bigger survival instincts.'
}

function loreKey(value: any) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fallbackLore(name: any, table: Record<string, string>) {
  const key = loreKey(name)
  if (!key) return ''

  if (table[key]) return table[key]

  const found = Object.entries(table).find(([candidate]) =>
    key.includes(candidate) || candidate.includes(key)
  )

  return found?.[1] || ''
}

function classIntroTextFromRaw(raw: any) {
  if (!raw || typeof raw !== 'object') return ''

  return entriesToText(raw.entries)
}

function fluffTextFromRaw(raw: any) {
  if (!raw || typeof raw !== 'object') return ''

  const candidates = [
    raw.fluffMarkdown,
    raw.fluff?.entries,
    raw.fluffEntries,
    raw.entriesFluff,
    raw.lore,
    raw.description
  ]

  for (const candidate of candidates) {
    const text = entriesToText(candidate)
    if (text) return text
  }

  return ''
}

function mechanicsText(value: any) {
  return clean5eText(entriesToText(value) || value)
    .replace(/^\s*["{[\]}:,]+/gm, '')
    .replace(/\bcolStyles\b[^\n]*/gi, '')
    .replace(/\brows\b\s*[:=]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function mechanicsCardsFromText(value: any, fallbackTitle = 'Details') {
  const text = mechanicsText(value)

  if (!text) return []

  const markdownHeadingMatches = Array.from(text.matchAll(/^#{1,6}\s+(.+)$/gm))

  if (!markdownHeadingMatches.length) {
    return [{
      title: fallbackTitle,
      body: text
    }]
  }

  const cards: Array<{ title: string; body: string }> = []

  for (let index = 0; index < markdownHeadingMatches.length; index += 1) {
    const match = markdownHeadingMatches[index]
    const next = markdownHeadingMatches[index + 1]
    const title = clean5eText(match[1])
    const start = Number(match.index || 0) + match[0].length
    const end = next?.index ?? text.length
    const body = clean5eText(text.slice(start, end))

    if (title || body) {
      cards.push({
        title: title || fallbackTitle,
        body
      })
    }
  }

  return cards
}

function mechanicsCardBody(value: any) {
  if (value === null || value === undefined) return ''

  if (typeof value === 'object' && !Array.isArray(value)) {
    const type = String(value.type || '').toLowerCase()

    if (type === 'table') return tableToText(value)

    if (value.entries !== undefined) return entriesToText(value.entries)
    if (value.entry !== undefined) return entriesToText(value.entry)
    if (value.items !== undefined) return entriesToText(value.items)
    if (value.rows !== undefined || value.colLabels !== undefined) return tableToText(value)
  }

  return entriesToText(value)
}

function mechanicsCardsFromEntries(value: any, fallbackTitle = 'Details') {
  const cards: Array<{ title: string; body: string }> = []

  function pushCard(title: any, body: any) {
    const cleanTitle = clean5eText(title || fallbackTitle)
    const cleanBody = clean5eText(body)

    if (!cleanTitle && !cleanBody) return

    cards.push({
      title: cleanTitle || fallbackTitle,
      body: cleanBody
    })
  }

  function visit(entry: any, fallback = fallbackTitle) {
    if (entry === null || entry === undefined) return

    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      const text = clean5eText(entry)
      if (text) pushCard(fallback, text)
      return
    }

    if (Array.isArray(entry)) {
      const looseText: string[] = []

      for (const item of entry) {
        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
          const text = clean5eText(item)
          if (text) looseText.push(text)
          continue
        }

        if (looseText.length) {
          pushCard(fallback, looseText.join('\n\n'))
          looseText.length = 0
        }

        visit(item, fallback)
      }

      if (looseText.length) {
        pushCard(fallback, looseText.join('\n\n'))
      }

      return
    }

    if (typeof entry === 'object') {
      const type = String(entry.type || '').toLowerCase()
      const title = clean5eText(entry.name || entry.caption || '')

      if (title) {
        pushCard(title, mechanicsCardBody(entry))
        return
      }

      if (type === 'table') {
        pushCard(entry.caption || 'Table', tableToText(entry))
        return
      }

      const body = mechanicsCardBody(entry)
      if (body) pushCard(fallback, body)
    }
  }

  visit(value)

  return cards
}

function builderChoiceKey(value: any) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function tableCells(row: any) {
  if (Array.isArray(row)) return row
  if (Array.isArray(row?.row)) return row.row
  if (Array.isArray(row?.items)) return row.items
  return []
}

function choiceGroupLooksRelevant(title: string, labels: string[]) {
  const haystack = [title, ...labels].join(' ').toLowerCase()

  return [
    'lineage',
    'ancestry',
    'ancestor',
    'heritage',
    'legacy',
    'kind',
    'type',
    'dragon'
  ].some((needle) => haystack.includes(needle))
}

function speciesChoiceGroupsFromRaw(raw: any) {
  const groups: Array<{
    key: string
    title: string
    note: string
    options: Array<{ value: string; label: string; detail: string; meta: Record<string, string> }>
  }> = []

  function visit(value: any) {
    if (!value) return

    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }

    if (typeof value !== 'object') return

    const type = String(value.type || '').toLowerCase()

    if (type === 'table' || value.rows || value.colLabels) {
      const title = clean5eText(value.caption || value.name || '')
      const labels = Array.isArray(value.colLabels)
        ? value.colLabels.map((label: any) => clean5eText(label)).filter(Boolean)
        : []

      if (choiceGroupLooksRelevant(title, labels)) {
        const rows = Array.isArray(value.rows) ? value.rows : []
        const options = rows
          .map((row: any) => {
            const cells = tableCells(row)
            if (!cells.length) return null

            const label = clean5eText(entriesToText(cells[0]))
            if (!label) return null

            const meta: Record<string, string> = {}
            const details: string[] = []

            for (let index = 1; index < cells.length; index += 1) {
              const cellText = clean5eText(entriesToText(cells[index]))
              if (!cellText) continue

              const labelText = labels[index] || `Detail ${index}`
              meta[labelText] = cellText
              details.push(`${labelText}: ${cellText}`)
            }

            return {
              value: label,
              label,
              detail: details.join('\n'),
              meta
            }
          })
          .filter(Boolean) as Array<{ value: string; label: string; detail: string; meta: Record<string, string> }>

        if (options.length) {
          const cleanTitle =
            title ||
            labels[0] ||
            'Species Choice'

          groups.push({
            key: builderChoiceKey(cleanTitle),
            title: cleanTitle,
            note: labels.length ? labels.join(' · ') : '',
            options
          })
        }
      }
    }

    if (value.entries) visit(value.entries)
    if (value.items) visit(value.items)
  }

  visit(raw?.entries)

  return groups
}

function speciesSkillChoiceGroupsFromRaw(raw: any) {
  const groups: any[] = []
  const profs = Array.isArray(raw?.skillProficiencies) ? raw.skillProficiencies : []

  profs.forEach((entry: any, index: number) => {
    const anyCount = Number(entry?.any || entry?.choose?.any || entry?.choose || entry?.count || 0)
    if (!Number.isFinite(anyCount) || anyCount <= 0) return

    groups.push({
      key: index ? `species-skills-${index}` : 'species-skills',
      title: 'Species Skill',
      note: 'Choose the skill proficiency granted by this species.',
      count: Math.floor(anyCount),
      options: BUILDER_SKILL_OPTIONS.map((skill) => ({
        value: skill,
        label: skill,
        detail: 'Adds proficiency with this skill.',
        meta: {
          choiceType: 'skill'
        }
      }))
    })
  })

  return groups
}

function speciesFeatChoiceGroupsFromRaw(raw: any) {
  const groups: any[] = []
  const feats = Array.isArray(raw?.feats) ? raw.feats : []
  const originOptions = originFeatOptions.value

  feats.forEach((entry: any, index: number) => {
    const anyFromCategory =
      entry?.anyFromCategory ||
      entry?.choose?.anyFromCategory ||
      entry?.feat?.anyFromCategory ||
      null

    const rawCategory = anyFromCategory?.category ?? entry?.category ?? entry?.featCategory
    const categories = Array.isArray(rawCategory)
      ? rawCategory.map(normalizedFeatCategoryToken)
      : [normalizedFeatCategoryToken(rawCategory)]

    const isOrigin = categories.some((category) => category === 'o' || category === 'origin')
    const count = Math.max(1, Number(anyFromCategory?.count || entry?.count || entry?.choose?.count || 1))

    if (!anyFromCategory || !isOrigin || !originOptions.length) return

    groups.push({
      key: index ? `species-feat-${index}` : 'species-feat',
      title: 'Origin Feat',
      note: 'Choose the Origin feat granted by this species.',
      count,
      options: originOptions
        .map((option: any) => {
          const id = featOptionId(option)
          const title = featOptionTitle(option)
          if (!id || !title) return null

          return {
            value: id,
            label: title,
            detail: featOptionLongDetail(option),
            meta: {
              choiceType: 'feat',
              featId: id,
              featTitle: title,
              hasSpellChoices: Boolean(option?.hasSpellChoices),
              spellChoiceSummary: option?.spellChoiceSummary || ''
            }
          }
        })
        .filter(Boolean)
    })
  })

  return groups
}

function speciesRawMechanicChoiceGroups(raw: any) {
  return [
    ...speciesSkillChoiceGroupsFromRaw(raw),
    ...speciesFeatChoiceGroupsFromRaw(raw),
    ...genericSpeciesChoiceGroupsFromEntries(raw)
  ]
}

function speciesChoiceSlug(value: any) {
  return normalizeBuilderChoiceCategory(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'choice'
}

function speciesChoiceDetailText(value: any): string {
  if (!value) return ''

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return clean5eText(value)
  }

  if (Array.isArray(value)) {
    return value.map(speciesChoiceDetailText).filter(Boolean).join('\n')
  }

  if (typeof value === 'object') {
    const parts: string[] = []

    if (value.name && !['item', 'entries'].includes(String(value.type || ''))) {
      parts.push(clean5eText(value.name))
    }

    if (value.entry) parts.push(speciesChoiceDetailText(value.entry))
    if (value.entries) parts.push(speciesChoiceDetailText(value.entries))
    if (value.items) parts.push(speciesChoiceDetailText(value.items))
    if (value.rows) parts.push(speciesChoiceDetailText(value.rows))
    if (value.cell) parts.push(speciesChoiceDetailText(value.cell))
    if (value.text) parts.push(speciesChoiceDetailText(value.text))

    return parts.filter(Boolean).join('\n')
  }

  return ''
}

function speciesTraitChoiceText(entry: any) {
  return normalizeBuilderChoiceCategory([
    entry?.name || '',
    speciesChoiceDetailText(entry?.entries || entry?.entry || entry?.items || entry?.rows || '')
  ].filter(Boolean).join(' '))
}

function speciesTraitLooksTemporaryActionChoice(entry: any) {
  const text = speciesTraitChoiceText(entry)

  if (!text) return false

  const actionTiming =
    text.includes('bonus action') ||
    text.includes('action') ||
    text.includes('magic action') ||
    text.includes('reaction')

  const temporaryEffect =
    text.includes('transform') ||
    text.includes('transformation') ||
    text.includes('for the duration') ||
    text.includes('until the transformation') ||
    text.includes('until it ends') ||
    text.includes('for 1 minute') ||
    text.includes('temporary')

  const chooseAtUse =
    text.includes('choose the option each time') ||
    text.includes('choose an option each time') ||
    text.includes('choose one option each time') ||
    text.includes('using one of the options below') ||
    text.includes('one of the options below')

  if (text.includes('celestial revelation') && (actionTiming || temporaryEffect || chooseAtUse)) {
    return true
  }

  return actionTiming && temporaryEffect && chooseAtUse
}

function speciesTraitLooksLikeBuildChoice(entry: any) {
  if (!entry || typeof entry !== 'object') return false
  if (speciesTraitLooksTemporaryActionChoice(entry)) return false

  const nameText = normalizeBuilderChoiceCategory(entry.name || '')
  const fullText = speciesTraitChoiceText(entry)

  if (!fullText) return false

  const durableChoiceName =
    nameText.includes('lineage') ||
    nameText.includes('ancestry') ||
    nameText.includes('ancestor') ||
    nameText.includes('legacy') ||
    nameText.includes('legacies') ||
    nameText.includes('giant ancestry') ||
    nameText.includes('draconic ancestry') ||
    nameText.includes('draconic ancestors')

  const choiceLanguage =
    fullText.includes('choose') ||
    fullText.includes('choice') ||
    fullText.includes('select') ||
    fullText.includes('from the following') ||
    fullText.includes('options below')

  if (!durableChoiceName) return false
  if (!choiceLanguage) return false

  return true
}

function speciesChoiceRowCells(row: any) {
  if (Array.isArray(row)) return row
  if (Array.isArray(row?.row)) return row.row
  if (Array.isArray(row?.cells)) return row.cells
  if (Array.isArray(row?.items)) return row.items
  return []
}

function speciesChoiceBestLabelIndex(cells: any[]) {
  const texts = cells.map(speciesChoiceCellText)

  const preferred = texts.findIndex((text) => {
    const clean = String(text || '').trim()
    if (!clean) return false
    if (/^\d+$/.test(clean)) return false
    if (/^d\d+$/i.test(clean)) return false
    if (/damage\s+type/i.test(clean)) return false
    if (clean.length > 64) return false
    return true
  })

  return preferred >= 0 ? preferred : 0
}

function speciesChoiceCellText(value: any): string {
  if (value === null || value === undefined || value === '') return ''

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return clean5eText(value)
  }

  if (Array.isArray(value)) {
    return value.map(speciesChoiceCellText).filter(Boolean).join(' ')
  }

  if (typeof value === 'object') {
    const parts: string[] = []

    if (value.name && !value.entry && !value.entries && !value.items && !value.rows) {
      parts.push(clean5eText(value.name))
    }

    if (value.entry) parts.push(speciesChoiceCellText(value.entry))
    if (value.entries) parts.push(speciesChoiceCellText(value.entries))
    if (value.items) parts.push(speciesChoiceCellText(value.items))
    if (value.rows) parts.push(speciesChoiceCellText(value.rows))
    if (value.cell) parts.push(speciesChoiceCellText(value.cell))
    if (value.text) parts.push(speciesChoiceCellText(value.text))

    return parts.filter(Boolean).join(' ')
  }

  return ''
}

function collectSpeciesChoiceOptions(value: any, out: any[] = []) {
  if (!value) return out

  if (Array.isArray(value)) {
    value.forEach((item) => collectSpeciesChoiceOptions(item, out))
    return out
  }

  if (typeof value === 'object') {
    const type = String(value.type || '').toLowerCase()

    if (value.name && (type === 'item' || type === 'entries')) {
      const label = clean5eText(value.name)
      const detail = speciesChoiceDetailText(value.entries || value.entry || value.items)

      if (label && detail) {
        out.push({
          value: label,
          label,
          detail,
          meta: {
            choiceType: 'species-option'
          }
        })
      }

      return out
    }

    if (type === 'table' && Array.isArray(value.rows)) {
      value.rows.forEach((row: any) => {
        const cells = speciesChoiceRowCells(row)
        if (!cells.length) return

        const labelIndex = speciesChoiceBestLabelIndex(cells)
        const label = clean5eText(speciesChoiceCellText(cells[labelIndex]))
        const detail = cells
          .filter((_, index) => index !== labelIndex)
          .map(speciesChoiceDetailText)
          .filter(Boolean)
          .join('\n')

        if (label) {
          out.push({
            value: label,
            label,
            detail,
            meta: {
              choiceType: 'species-option'
            }
          })
        }
      })

      return out
    }

    if (Array.isArray(value.items)) collectSpeciesChoiceOptions(value.items, out)
    if (Array.isArray(value.entries)) collectSpeciesChoiceOptions(value.entries, out)
    if (Array.isArray(value.rows)) collectSpeciesChoiceOptions(value.rows, out)
  }

  return out
}

function speciesChoiceGroupCanonicalKey(group: any) {
  const text = normalizeBuilderChoiceCategory(`${group?.key || ''} ${group?.title || ''} ${group?.label || ''}`)

  if (text.includes('celestial') && text.includes('revelation')) {
    return 'species-ignore-celestial-revelation'
  }

  if (text.includes('draconic') && (text.includes('ancestor') || text.includes('ancestry'))) {
    return 'species-draconic-ancestry'
  }

  if (text.includes('elven') && text.includes('lineage')) {
    return 'species-elven-lineage'
  }

  if (text.includes('gnomish') && text.includes('lineage')) {
    return 'species-gnomish-lineage'
  }

  if (text.includes('fiendish') && (text.includes('legacy') || text.includes('legacies'))) {
    return 'species-fiendish-legacy'
  }

  if (text.includes('giant') && text.includes('ancestry')) {
    return 'species-giant-ancestry'
  }

  if (text.includes('lineage')) {
    return `species-${speciesChoiceSlug(text.replace(/lineages/g, 'lineage'))}`
  }

  if (text.includes('legacy') || text.includes('legacies')) {
    return `species-${speciesChoiceSlug(text.replace(/legacies/g, 'legacy'))}`
  }

  if (text.includes('ancestry') || text.includes('ancestor')) {
    return `species-${speciesChoiceSlug(text.replace(/ancestors/g, 'ancestry').replace(/ancestor/g, 'ancestry'))}`
  }

  return `species-${speciesChoiceSlug(group?.key || group?.title || 'choice')}`
}

function speciesChoiceGroupCanonicalTitle(group: any) {
  const key = speciesChoiceGroupCanonicalKey(group)

  const labels: Record<string, string> = {
    'species-draconic-ancestry': 'Draconic Ancestry',
    'species-elven-lineage': 'Elven Lineage',
    'species-gnomish-lineage': 'Gnomish Lineage',
    'species-fiendish-legacy': 'Fiendish Legacy',
    'species-giant-ancestry': 'Giant Ancestry'
  }

  return labels[key] || clean5eText(group?.title || group?.label || 'Species Choice')
}

function speciesChoiceOptionKey(option: any) {
  return normalizeBuilderChoiceCategory(option?.label || option?.value || '')
}

function cleanSpeciesChoiceOption(option: any) {
  const rawLabel = clean5eText(option?.label || option?.value || option?.name || '')
  const rawValue = clean5eText(option?.value || option?.label || option?.name || rawLabel)

  if (!rawLabel && !rawValue) return null

  const label = rawLabel || rawValue
  const value = rawValue || label
  const detail = clean5eText(option?.detail || option?.description || '')

  if (!label || !value) return null

  return {
    ...option,
    value,
    label,
    detail: detail === label ? '' : detail,
    meta: option?.meta || {}
  }
}

function longerSpeciesText(current: any, next: any) {
  const a = String(current || '').trim()
  const b = String(next || '').trim()

  return b.length > a.length ? b : a
}

function genericSpeciesChoiceGroupsFromEntries(raw: any) {
  const entries = Array.isArray(raw?.entries) ? raw.entries : []
  const groups: any[] = []

  for (const entry of entries) {
    if (!speciesTraitLooksLikeBuildChoice(entry)) continue

    const title = clean5eText(entry.name)
    const options = collectSpeciesChoiceOptions(entry.entries)
    const seen = new Set<string>()

    const uniqueOptions = options.filter((option: any) => {
      const key = String(option?.label || option?.value || '').toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })

    if (uniqueOptions.length < 2) continue

    groups.push({
      key: `species-${speciesChoiceSlug(title)}`,
      title,
      note: `Choose this character's ${title.toLowerCase()}.`,
      count: 1,
      options: uniqueOptions
    })
  }

  return groups
}

function dedupeBuilderChoiceGroups(groups: any[]) {
  const merged = new Map<string, any>()

  for (const rawGroup of Array.isArray(groups) ? groups : []) {
    if (!rawGroup) continue

    const key = speciesChoiceGroupCanonicalKey(rawGroup)
    if (key === 'species-ignore-celestial-revelation') continue

    const options = (Array.isArray(rawGroup.options) ? rawGroup.options : [])
      .map(cleanSpeciesChoiceOption)
      .filter(Boolean)

    if (!options.length) continue

    const title = speciesChoiceGroupCanonicalTitle(rawGroup)

    if (!merged.has(key)) {
      merged.set(key, {
        ...rawGroup,
        key,
        title,
        count: Math.max(1, Number(rawGroup.count || 1)),
        options: []
      })
    }

    const group = merged.get(key)
    group.count = Math.max(Number(group.count || 1), Number(rawGroup.count || 1))
    group.note = group.note || rawGroup.note || `Choose this character's ${String(title).toLowerCase()}.`

    const optionMap = new Map<string, any>()

    for (const existingOption of group.options || []) {
      optionMap.set(speciesChoiceOptionKey(existingOption), existingOption)
    }

    for (const option of options) {
      const optionKey = speciesChoiceOptionKey(option)
      if (!optionKey) continue

      const existing = optionMap.get(optionKey)

      if (!existing) {
        optionMap.set(optionKey, option)
        continue
      }

      optionMap.set(optionKey, {
        ...existing,
        ...option,
        label: existing.label || option.label,
        value: existing.value || option.value,
        detail: longerSpeciesText(existing.detail, option.detail),
        meta: {
          ...(existing.meta || {}),
          ...(option.meta || {})
        }
      })
    }

    group.options = Array.from(optionMap.values())
  }

  return Array.from(merged.values())
}

function fallbackSpeciesChoiceGroups(name: any) {
  const key = loreKey(name)

  if (key.includes('elf')) {
    return [{
      key: 'elven-lineage',
      title: 'Elven Lineage',
      note: 'Choose the lineage that shapes your magic and traits.',
      options: [
        {
          value: 'Drow',
          label: 'Drow',
          detail: 'Darkvision increases to 120 feet. You know Dancing Lights, then gain Faerie Fire and Darkness at higher levels.',
          meta: {}
        },
        {
          value: 'High Elf',
          label: 'High Elf',
          detail: 'You know Prestidigitation and can later replace that cantrip from the Wizard spell list. You gain Detect Magic and Misty Step at higher levels.',
          meta: {}
        },
        {
          value: 'Wood Elf',
          label: 'Wood Elf',
          detail: 'Your speed increases to 35 feet. You know Druidcraft, then gain Longstrider and Pass without Trace at higher levels.',
          meta: {}
        }
      ]
    }]
  }

  if (key.includes('dragonborn')) {
    const dragonOptions = [
      ['Black', 'Acid'],
      ['Blue', 'Lightning'],
      ['Brass', 'Fire'],
      ['Bronze', 'Lightning'],
      ['Copper', 'Acid'],
      ['Gold', 'Fire'],
      ['Green', 'Poison'],
      ['Red', 'Fire'],
      ['Silver', 'Cold'],
      ['White', 'Cold']
    ]

    return [{
      key: 'draconic-ancestry',
      title: 'Draconic Ancestry',
      note: 'Choose the dragon type that determines your breath weapon and resistance.',
      options: dragonOptions.map(([dragon, damage]) => ({
        value: dragon,
        label: dragon,
        detail: `Damage Type: ${damage}`,
        meta: {
          'Damage Type': damage
        }
      }))
    }]
  }

  return []
}

const speciesChoiceGroups = computed(() => {
  const raw = rawJson(selectedSpeciesEntity.value) || {}
  const parsed = dedupeBuilderChoiceGroups([
    ...speciesChoiceGroupsFromRaw(raw),
    ...speciesRawMechanicChoiceGroups(raw)
  ])

  if (parsed.length) return parsed

  return dedupeBuilderChoiceGroups(fallbackSpeciesChoiceGroups(selectedSpeciesName.value))
})

function speciesChoiceSelected(group: any) {
  return speciesChoiceSelections[group.key] || ''
}

function selectedSpeciesChoiceOption(group: any) {
  const selected = speciesChoiceSelected(group)
  if (!selected) return null

  return group.options.find((option: any) =>
    String(option.value) === String(selected)
  ) || null
}

const speciesChoicesComplete = computed(() =>
  speciesChoiceGroups.value.every((group: any) => Boolean(speciesChoiceSelections[group.key]))
)

const speciesChoicePayload = computed(() => {
  const payload: Record<string, any> = {}

  for (const group of speciesChoiceGroups.value) {
    const selected = speciesChoiceSelected(group)
    if (!selected) continue

    const option = selectedSpeciesChoiceOption(group)

    payload[group.key] = {
      label: group.title,
      value: selected,
      values: [selected],
      valueLabel: option?.label || selected,
      detail: option?.detail || '',
      note: group.note || '',
      meta: option?.meta || {}
    }
  }

  return payload
})

watch(
  () => builderForm.speciesEntityId,
  () => {
    for (const key of Object.keys(speciesChoiceSelections)) {
      delete speciesChoiceSelections[key]
    }

    speciesMechanicsOpen.value = false
  }
)

function shortText(value: any, limit = 640) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text
}

function blockByKey(entity: any, key: string) {
  return Array.isArray(entity?.blocks)
    ? entity.blocks.find((block: any) => String(block?.block_key || block?.blockKey || '') === key) || null
    : null
}

function blockData(entity: any, key: string) {
  return blockByKey(entity, key)?.data || {}
}

function rawJson(entity: any) {
  return blockData(entity, 'import_source')?.raw_json || blockData(entity, 'import_source')?.rawJson || null
}

function simpleValue(value: any): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return clean5eText(value)

  if (Array.isArray(value)) {
    return value.map(simpleValue).filter(Boolean).join(', ')
  }

  if (typeof value === 'object') {
    const truthyKeys = Object.entries(value)
      .filter(([, item]) => item === true)
      .map(([key]) => key.toUpperCase())

    if (truthyKeys.length) return truthyKeys.join(', ')

    if (Array.isArray(value.from)) return value.from.map(simpleValue).filter(Boolean).join(', ')
    if (value.choose) return simpleValue(value.choose)
    if (value.walk) return `${value.walk} ft.`
    if (value.faces) return `d${value.faces}`

    return Object.entries(value)
      .map(([key, item]) => {
        const rendered = simpleValue(item)
        if (!rendered) return ''
        return `${key}: ${rendered}`
      })
      .filter(Boolean)
      .join(', ')
  }

  return ''
}

function titleCaseWords(value: any) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function builderDisplayValue(value: any): string {
  if (value === null || value === undefined || value === '') return ''

  if (typeof value === 'string') {
    const trimmed = value.trim()

    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return builderDisplayValue(JSON.parse(trimmed))
      } catch {}
    }

    return titleCaseWords(clean5eText(value))
  }

  if (typeof value === 'number' || typeof value === 'boolean') return clean5eText(value)

  if (Array.isArray(value)) {
    return value.map(builderDisplayValue).filter(Boolean).join(', ')
  }

  if (typeof value === 'object') {
    const truthyKeys = Object.entries(value)
      .filter(([, item]) => item === true)
      .map(([key]) => key.toUpperCase())

    if (truthyKeys.length) return truthyKeys.join(', ')

    if (Array.isArray(value.from)) return value.from.map(builderDisplayValue).filter(Boolean).join(', ')
    if (value.choose) return builderDisplayValue(value.choose)
    if (value.walk) return `${value.walk} ft.`
    if (value.faces) return `d${value.faces}`
    if (value.name) return titleCaseWords(value.name)

    return Object.values(value).map(builderDisplayValue).filter(Boolean).join(', ')
  }

  return ''
}

function parseBuilderJsonishChoice(value: any): any {
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
    } catch {}
  }

  return value
}

function prettyBuilderChoiceValue(value: any) {
  const text = String(value || '').trim()
  if (!text) return ''

  const parts = text.split('|').map((part) => part.trim()).filter(Boolean)
  const primary = parts[0] || text

  const featWithChoice = primary.match(/^([^;]+);\s*(.+)$/)
  if (featWithChoice) {
    return `${titleCaseWords(featWithChoice[1])} (${titleCaseWords(featWithChoice[2])})`
  }

  return titleCaseWords(primary)
}

function firstBuilderDisplayValue(...values: any[]) {
  for (const value of values) {
    const rendered = builderDisplayValue(value)
    if (rendered) return rendered
  }

  return ''
}

function classChoiceOptionList(value: any) {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value)
        .filter(([, item]) => item === true || item !== false)
        .map(([key, item]) => item === true ? key : item)
      : value
        ? [value]
        : []

  const seen = new Set<string>()

  return source
    .flatMap((item: any) => {
      if (item && typeof item === 'object' && Array.isArray(item.from)) {
        return item.from.flatMap((nested: any) => expandBuilderChoiceOption(nested))
      }

      return expandBuilderChoiceOption(item)
    })
    .map((item: any) => {
      const raw = typeof item === 'string'
        ? item
        : item?.name || item?.value || item?.skill || item?.tool || builderDisplayValue(item)

      const value = String(raw || '').trim()
      const label = titleCaseWords(value)

      if (!value || seen.has(value.toLowerCase())) return null
      seen.add(value.toLowerCase())

      return {
        value,
        label
      }
    })
    .filter(Boolean)
}

function classChoiceGroupFromChoose(key: string, title: string, note: string, choose: any, index = 0) {
  const source = choose && typeof choose === 'object' && !Array.isArray(choose)
    ? choose
    : {}

  const from = source.from ??
    source.options ??
    source.items ??
    source.proficiencies ??
    source.skills ??
    source.tools ??
    choose

  const countRaw = source.count ??
    source.choose ??
    source.amount ??
    source.number ??
    source.qty ??
    1

  const count = Math.max(1, Number.isFinite(Number(countRaw))
    ? Math.floor(Number(countRaw))
    : builderChoiceCountFromText(countRaw)
  )

  const options = classChoiceOptionList(from)

  if (!options.length) return null

  return {
    key: index ? `${key}-${index}` : key,
    title,
    note,
    count,
    options
  }
}

function builderChoiceCountFromText(value: any) {
  const raw = String(value || '').trim()
  const numeric = Number(raw)

  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric)

  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, '')

  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10
  }

  return words[key] || 1
}

function classChoiceGroupFromText(key: string, title: string, note: string, value: any) {
  const text = String(builderDisplayValue(value) || clean5eText(value) || '').trim()
  if (!text) return null

  const match = text.match(/choose\s+(?:any\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:from\s+)?(.+?)\.?$/i)
  if (!match) return null

  const count = builderChoiceCountFromText(match[1])
  let category = String(match[2] || '').trim()

  const skillListMatch = category.match(/^skills?\s+from\s+(.+)$/i)
  if (skillListMatch) {
    category = skillListMatch[1]
  }

  category = category
    .replace(/^any\s+/i, '')
    .replace(/^proficienc(?:y|ies)\s+(?:in\s+)?/i, '')
    .replace(/\s+of\s+your\s+choice.*$/i, '')
    .replace(/\s+or\s+.*$/i, '')
    .replace(/\s+and\s+.*$/i, '')
    .trim()

  if (!category) return null

  const options = classChoiceOptionList([category])

  if (!options.length) return null

  return {
    key,
    title,
    note,
    count,
    options
  }
}

function classChoiceGroupsFromValue(key: string, title: string, note: string, value: any) {
  const groups: any[] = []

  if (!value) return groups

  const textGroup = classChoiceGroupFromText(key, title, note, value)
  if (textGroup) {
    groups.push(textGroup)
    return groups
  }

  if (value?.choose && Array.isArray(value?.from)) {
    const group = classChoiceGroupFromChoose(key, title, note, value)
    if (group) groups.push(group)
    return groups
  }

  if (value?.choose) {
    if (Array.isArray(value.choose)) {
      value.choose.forEach((choice: any, index: number) => {
        const group = classChoiceGroupFromChoose(key, title, note, choice, index)
        if (group) groups.push(group)
      })
    } else {
      const group = classChoiceGroupFromChoose(key, title, note, value.choose)
      if (group) groups.push(group)
    }

    return groups
  }

  if (Array.isArray(value?.from)) {
    const group = classChoiceGroupFromChoose(key, title, note, value)
    if (group) groups.push(group)
    return groups
  }

  if (Array.isArray(value)) {
    value.forEach((item: any, index: number) => {
      const nestedTextGroup = classChoiceGroupFromText(index ? `${key}-${index}` : key, title, note, item)
      if (nestedTextGroup) {
        groups.push(nestedTextGroup)
        return
      }

      if (item?.choose && Array.isArray(item?.from)) {
        const group = classChoiceGroupFromChoose(key, title, note, item, index)
        if (group) groups.push(group)
        return
      }

      if (item?.choose) {
        const group = classChoiceGroupFromChoose(key, title, note, item.choose, index)
        if (group) groups.push(group)
        return
      }

      if (Array.isArray(item?.from)) {
        const group = classChoiceGroupFromChoose(key, title, note, item, index)
        if (group) groups.push(group)
      }
    })
  }

  return groups
}

function classChoiceGroupsFromRaw(raw: any) {
  const profs = raw?.startingProficiencies || {}
  const groups: any[] = []

  groups.push(...classChoiceGroupsFromValue(
    'class-skills',
    'Class Skills',
    'Choose the trained skills this class starts with.',
    profs.skills
  ))

  groups.push(...classChoiceGroupsFromValue(
    'class-tools',
    'Class Tools',
    'Choose any tool proficiencies granted by this class.',
    profs.tools
  ))

  groups.push(...classChoiceGroupsFromValue(
    'class-weapons',
    'Class Weapons',
    'Choose any weapon proficiency option granted by this class.',
    profs.weapons
  ))

  return groups
}

function classKeyForFallback(value: any) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function fallbackClassSkillGroup(className: any) {
  const key = classKeyForFallback(className)

  const skillFallbacks: Record<string, { count: number; options: string[] }> = {
    bard: {
      count: 3,
      options: BUILDER_SKILL_OPTIONS
    },
    rogue: {
      count: 4,
      options: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth']
    },
    fighter: {
      count: 2,
      options: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival']
    },
    paladin: {
      count: 2,
      options: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion']
    },
    ranger: {
      count: 3,
      options: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival']
    },
    wizard: {
      count: 2,
      options: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion']
    },
    cleric: {
      count: 2,
      options: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion']
    },
    druid: {
      count: 2,
      options: ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival']
    },
    barbarian: {
      count: 2,
      options: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival']
    },
    monk: {
      count: 2,
      options: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth']
    },
    sorcerer: {
      count: 2,
      options: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion']
    },
    warlock: {
      count: 2,
      options: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion']
    }
  }

  const fallback = skillFallbacks[key]
  if (!fallback) return null

  return {
    key: 'class-skills',
    title: 'Class Skills',
    note: 'Choose the trained skills this class starts with.',
    count: fallback.count,
    options: classChoiceOptionList(fallback.options)
  }
}

function fallbackClassToolGroup(className: any) {
  const key = classKeyForFallback(className)

  if (key !== 'bard') return null

  return {
    key: 'class-tools',
    title: 'Class Tools',
    note: 'Choose tool proficiencies this class starts with.',
    count: 3,
    options: classChoiceOptionList(['musical instrument'])
  }
}

function classChoiceGroupHasOptions(group: any) {
  return Array.isArray(group?.options) && group.options.length > 0
}

function classChoiceGroupLooksLike(group: any, token: string) {
  const text = normalizeBuilderChoiceCategory(`${group?.key || ''} ${group?.title || ''} ${group?.note || ''}`)
  return text.includes(token)
}

const classChoiceGroups = computed(() => {
  const entity = selectedClassEntity.value
  const raw = rawJson(entity) || {}
  const core = blockData(entity, 'class_core')
  const selectedName = selectedClassName.value || raw.name || core.name || ''
  const groups = [...classChoiceGroupsFromRaw(raw)]
    .filter(classChoiceGroupHasOptions)

  const hasSkillGroup = groups.some((group: any) =>
    classChoiceGroupHasOptions(group) && classChoiceGroupLooksLike(group, 'skill')
  )

  if (!hasSkillGroup) {
    const skillText = firstBuilderDisplayValue(
      core.skill_proficiencies,
      core.skillProficiencies,
      core.skills,
      raw.startingProficiencies?.skills
    )

    const skillGroup = classChoiceGroupFromText(
      'class-skills',
      'Class Skills',
      'Choose the trained skills this class starts with.',
      skillText
    ) || fallbackClassSkillGroup(selectedName)

    if (skillGroup && classChoiceGroupHasOptions(skillGroup)) groups.push(skillGroup)
  }

  const hasToolGroup = groups.some((group: any) =>
    classChoiceGroupHasOptions(group) &&
    (classChoiceGroupLooksLike(group, 'tool') || classChoiceGroupLooksLike(group, 'instrument'))
  )

  if (!hasToolGroup) {
    const toolText = firstBuilderDisplayValue(
      core.tool_proficiencies,
      core.toolProficiencies,
      core.tools,
      raw.startingProficiencies?.tools
    )

    const toolGroup = classChoiceGroupFromText(
      'class-tools',
      'Class Tools',
      'Choose tool proficiencies this class starts with.',
      toolText
    ) || fallbackClassToolGroup(selectedName)

    if (toolGroup && classChoiceGroupHasOptions(toolGroup)) groups.push(toolGroup)
  }

  const seen = new Set<string>()

  return groups.filter((group: any) => {
    if (!classChoiceGroupHasOptions(group)) return false

    const key = String(group.key || group.title || '').toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)

    return true
  })
})

function ensureClassChoiceDraft(group: any) {
  if (!Array.isArray(classChoiceSelections[group.key])) {
    classChoiceSelections[group.key] = Array.from({ length: group.count }, () => '')
  }

  while (classChoiceSelections[group.key].length < group.count) {
    classChoiceSelections[group.key].push('')
  }

  if (classChoiceSelections[group.key].length > group.count) {
    classChoiceSelections[group.key].splice(group.count)
  }

  return classChoiceSelections[group.key]
}

function classChoiceSlots(group: any) {
  ensureClassChoiceDraft(group)
  return Array.from({ length: Number(group.count || 1) }, (_, index) => index)
}

function classChoiceSelected(group: any, slot: number) {
  ensureClassChoiceDraft(group)
  return classChoiceSelections[group.key][slot] || ''
}

function selectedClassChoiceOption(group: any, slot: number) {
  const selected = classChoiceSelected(group, slot)
  if (!selected) return null

  return group.options.find((option: any) =>
    String(option.value) === String(selected)
  ) || null
}

function isClassChoiceOptionDisabled(group: any, slot: number, value: any) {
  ensureClassChoiceDraft(group)

  return classChoiceSelections[group.key].some((selected, index) =>
    index !== slot && String(selected || '') === String(value || '')
  )
}

const classChoicesComplete = computed(() =>
  classChoiceGroups.value.every((group: any) =>
    ensureClassChoiceDraft(group).filter(Boolean).length >= Number(group.count || 1)
  )
)

const classChoicePayload = computed(() => {
  const payload: Record<string, any> = {}

  for (const group of classChoiceGroups.value) {
    const values = ensureClassChoiceDraft(group).filter(Boolean)

    if (!values.length) continue

    payload[group.key] = {
      label: group.title,
      values,
      note: group.note || ''
    }
  }

  return payload
})

function backgroundChoiceValues(value: any) {
  const parsed = parseBuilderJsonishChoice(value)

  if (!parsed) return []

  if (Array.isArray(parsed)) {
    return parsed
      .flatMap((item) => backgroundChoiceValues(item))
      .filter(Boolean)
  }

  if (typeof parsed === 'object') {
    if (Array.isArray(parsed.values)) return backgroundChoiceValues(parsed.values)
    if (Array.isArray(parsed.selected)) return backgroundChoiceValues(parsed.selected)
    if (parsed.value) return backgroundChoiceValues(parsed.value)
    if (parsed.choose) return backgroundChoiceValues(parsed.choose)
    if (Array.isArray(parsed.from)) return backgroundChoiceValues(parsed.from)

    const truthyKeys = Object.entries(parsed)
      .filter(([, item]) => item === true || item === 'true' || item === 1)
      .map(([key]) => prettyBuilderChoiceValue(key))
      .filter(Boolean)

    if (truthyKeys.length) return truthyKeys

    return Object.values(parsed)
      .flatMap((item) => backgroundChoiceValues(item))
      .filter(Boolean)
  }

  const text = String(parsed || '').trim()
  if (!text) return []

  if (text.includes(',')) {
    return text
      .split(',')
      .map((item) => prettyBuilderChoiceValue(item))
      .filter(Boolean)
  }

  return [prettyBuilderChoiceValue(text)]
}

function featOptionId(option: any) {
  return String(option?.id ?? option?.entity_id ?? option?.value ?? '').trim()
}

function featOptionTitle(option: any) {
  return String(option?.title || option?.name || option?.label || option?.value || 'Feat').trim()
}

function featOptionSourceLine(option: any) {
  const parts = [
    option?.source || option?.sourceBook || option?.source_book || '',
    option?.page ? `p. ${option.page}` : option?.sourcePage ? `p. ${option.sourcePage}` : option?.source_page ? `p. ${option.source_page}` : ''
  ].filter(Boolean)

  return parts.join(' · ')
}

function featOptionDescription(option: any) {
  return clean5eText(
    option?.description ||
    option?.benefits ||
    option?.summary ||
    ''
  )
}

function featOptionLongDetail(option: any) {
  const parts = [
    featOptionSourceLine(option),
    featOptionDescription(option),
    option?.hasSpellChoices || option?.spellChoiceSummary
      ? String(option?.spellChoiceSummary || 'Follow-up choices required for this feat.')
      : ''
  ]

  return parts.filter(Boolean).join('\n\n')
}

function normalizedFeatCategoryToken(value: any) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function featOptionCategories(option: any) {
  const raw = option?.raw || option?.raw_json || option?.rawJson || {}
  const values: any[] = []

  function collect(value: any) {
    if (value === null || value === undefined || value === '') return

    if (Array.isArray(value)) {
      value.forEach(collect)
      return
    }

    if (typeof value === 'object') {
      if (value.category !== undefined) {
        collect(value.category)
        return
      }

      if (value.name !== undefined) {
        collect(value.name)
        return
      }

      Object.values(value).forEach(collect)
      return
    }

    values.push(value)
  }

  collect(option?.category)
  collect(option?.categories)
  collect(option?.rawCategory)
  collect(option?.raw_category)
  collect(option?.featCategory)
  collect(option?.feat_category)
  collect(raw?.category)
  collect(raw?.featCategory)

  return Array.from(new Set(
    values
      .map(normalizedFeatCategoryToken)
      .filter(Boolean)
  ))
}

function featOptionLooksOrigin(option: any) {
  const categories = featOptionCategories(option)

  if (categories.some((category) => category === 'o' || category === 'origin')) return true

  const text = normalizedFeatCategoryToken([
    option?.categoryLabel,
    option?.categoryName,
    option?.summary,
    option?.prerequisite
  ].filter(Boolean).join(' '))

  return text.includes('origin feat')
}

const originFeatOptions = computed(() => {
  const options = Array.isArray(featOptions.value) ? featOptions.value : []
  const origin = options.filter((option: any) => featOptionLooksOrigin(option))

  return origin.length ? origin : options
})

function backgroundFeatValues(raw: any) {
  const candidates = [
    raw?.feat,
    raw?.feats,
    raw?.additionalFeat,
    raw?.additionalFeats
  ]

  for (const candidate of candidates) {
    const values = backgroundChoiceValues(candidate)
    if (values.length) return values
  }

  return []
}

const backgroundChoicePayload = ref<Record<string, any>>({})
const backgroundChoicesComplete = ref(true)

function backgroundPlainObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function setBackgroundChoicePayload(payload: any) {
  backgroundChoicePayload.value = backgroundPlainObject(payload)
}

function setBackgroundChoicesComplete(value: any) {
  backgroundChoicesComplete.value = value !== false
}

const classSpellcastingPayload = ref<Record<string, any>>({})
const classSpellChoicesComplete = ref(true)

function setClassSpellcastingPayload(payload: any) {
  classSpellcastingPayload.value =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : {}
}

function setClassSpellChoicesComplete(value: any) {
  classSpellChoicesComplete.value = value !== false
}

const classEquipmentPayload = ref<Record<string, any>>({})
const classEquipmentChoicesComplete = ref(true)

function setClassEquipmentPayload(payload: any) {
  classEquipmentPayload.value =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : {}
}

function setClassEquipmentChoicesComplete(value: any) {
  classEquipmentChoicesComplete.value = value !== false
}

const classSubclassPayload = ref<Record<string, any>>({})
const classSubclassChoicesComplete = ref(true)

function setClassSubclassPayload(payload: any) {
  classSubclassPayload.value =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : {}
}

function setClassSubclassChoicesComplete(value: any) {
  classSubclassChoicesComplete.value = value !== false
}

function selectedGuidedSubclassChoice() {
  const group = classSubclassPayload.value?.['class-subclass']
  if (!group) return null

  const meta = group.meta && typeof group.meta === 'object' ? group.meta : {}

  const rawSubclassEntityId = String(meta.subclassEntityId || group.value || '').trim()

  return {
    subclassEntityId: /^\d+$/.test(rawSubclassEntityId) ? rawSubclassEntityId : '',
    subclassName: String(meta.subclassName || group.valueLabel || group.values?.[0] || '').trim()
  }
}

watch(
  () => [builderForm.classEntityId, builderForm.level],
  () => {
    classSubclassPayload.value = {}
    classSubclassChoicesComplete.value = true
  }
)

const mergedClassChoicePayload = computed(() => ({
  ...classChoicePayload.value,
  ...classEquipmentPayload.value,
  ...classSubclassPayload.value
}))

watch(
  () => builderForm.classEntityId,
  () => {
    classEquipmentPayload.value = {}
    classEquipmentChoicesComplete.value = true
  }
)

watch(
  () => [builderForm.classEntityId, builderForm.level],
  () => {
    classSpellcastingPayload.value = {}
    classSpellChoicesComplete.value = true
  }
)

async function applyClassSpellcastingToCreatedCharacter(created: any) {
  const entityId = String(created?.id || created?.entity?.id || '')
  const payload = classSpellcastingPayload.value || {}

  if (!entityId || !Object.keys(payload).length) return

  await $fetch(`/api/worlds/${worldId.value}/entities/${entityId}/sheet`, {
    method: 'PATCH',
    body: {
      spellcasting: payload
    }
  })
}

async function applyBuilderSubclassToCreatedCharacter(created: any) {
  const entityId = String(created?.id || created?.entity?.id || '')
  const selected = selectedGuidedSubclassChoice()

  if (!entityId || !selected?.subclassName) return

  await $fetch(`/api/worlds/${worldId.value}/entities/${entityId}/sheet`, {
    method: 'PATCH',
    body: {
      subclassName: selected.subclassName,
      subclassEntityId: selected.subclassEntityId || null
    }
  })
}

const featSpellcastingPayload = ref<Record<string, any>>({})
const featChoicesComplete = ref(true)

function setFeatSpellcastingPayload(payload: any) {
  featSpellcastingPayload.value =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : {}
}

function setFeatChoicesComplete(value: any) {
  featChoicesComplete.value = value !== false
}

watch(
  () => [
    JSON.stringify(speciesChoicePayload.value || {}),
    JSON.stringify(backgroundChoicePayload.value || {})
  ],
  () => {
    featSpellcastingPayload.value = {}
    featChoicesComplete.value = true
  }
)

function builderUniqueIds(...values: any[]) {
  const seen = new Set<string>()
  const out: string[] = []

  for (const value of values.flat()) {
    const text = String(value || '').trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }

  return out
}

function mergeBuilderSpellcastingPayloads(...payloads: any[]) {
  const out: Record<string, any> = {}

  for (const rawPayload of payloads) {
    const payload =
      rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
        ? rawPayload
        : {}

    for (const [key, value] of Object.entries(payload)) {
      if (Array.isArray(value)) continue

      if (value && typeof value === 'object') {
        out[key] = {
          ...(out[key] && typeof out[key] === 'object' && !Array.isArray(out[key]) ? out[key] : {}),
          ...value
        }
      } else if (value !== undefined) {
        out[key] = value
      }
    }
  }

  const knownSpellIds = payloads.flatMap((payload: any) =>
    Array.isArray(payload?.knownSpellIds) ? payload.knownSpellIds : []
  )

  const preparedSpellIds = payloads.flatMap((payload: any) =>
    Array.isArray(payload?.preparedSpellIds) ? payload.preparedSpellIds : []
  )

  const selectedChoiceSpellIds = payloads.flatMap((payload: any) => [
    ...(Array.isArray(payload?.selectedChoiceSpellIds) ? payload.selectedChoiceSpellIds : []),
    ...(Array.isArray(payload?.featChoiceSpellIds) ? payload.featChoiceSpellIds : []),
    ...(Array.isArray(payload?.featChoiceSpells) ? payload.featChoiceSpells : []),
    ...(Array.isArray(payload?.featSpellIds) ? payload.featSpellIds : [])
  ])

  out.knownSpellIds = builderUniqueIds(knownSpellIds)
  out.preparedSpellIds = builderUniqueIds(preparedSpellIds)

  const featSpellIds = builderUniqueIds(selectedChoiceSpellIds)
  if (featSpellIds.length) {
    out.selectedChoiceSpellIds = featSpellIds
    out.featChoiceSpellIds = featSpellIds
    out.featChoiceSpells = featSpellIds
    out.featSpellIds = featSpellIds
  }

  return out
}

async function applyBuilderSpellcastingToCreatedCharacter(created: any) {
  const entityId = String(created?.id || created?.entity?.id || '')
  const payload = mergeBuilderSpellcastingPayloads(
    classSpellcastingPayload.value,
    featSpellcastingPayload.value
  )

  if (!entityId || !Object.keys(payload).length) return

  await $fetch(`/api/worlds/${worldId.value}/entities/${entityId}/sheet`, {
    method: 'PATCH',
    body: {
      spellcasting: payload
    }
  })
}

watch(
  () => builderForm.backgroundEntityId,
  () => {
    backgroundChoicePayload.value = {}
    backgroundChoicesComplete.value = true
  }
)

watch(
  classChoiceGroups,
  (groups) => {
    const allowed = new Set(groups.map((group: any) => group.key))

    for (const key of Object.keys(classChoiceSelections)) {
      if (!allowed.has(key)) delete classChoiceSelections[key]
    }

    for (const group of groups) {
      ensureClassChoiceDraft(group)
    }
  },
  { immediate: true, deep: true }
)

watch(
  () => builderForm.classEntityId,
  () => {
    for (const key of Object.keys(classChoiceSelections)) {
      delete classChoiceSelections[key]
    }

    classMechanicsOpen.value = false
  }
)

function entitySummary(entity: any) {
  return plainText(entity?.summary || '')
}

function sourceText(entity: any) {
  const raw = rawJson(entity) || {}
  const source = raw?.source || blockData(entity, 'import_source')?.source_book || ''
  const page = raw?.page || blockData(entity, 'import_source')?.source_page || ''

  return [source, page ? `p. ${page}` : ''].filter(Boolean).join(' · ')
}

const selectedSpeciesImageUrl = computed(() => imageUrlFor(selectedSpeciesEntity.value))
const selectedClassImageUrl = computed(() => imageUrlFor(selectedClassEntity.value))
const selectedBackgroundImageUrl = computed(() => imageUrlFor(selectedBackgroundEntity.value))

const speciesMechanicsDescription = computed(() => {
  const entity = selectedSpeciesEntity.value
  if (!entity) return ''

  const core = blockData(entity, 'species_core')
  const raw = rawJson(entity) || {}

  return mechanicsText(raw.entries) ||
    mechanicsText(core.traits || core.mechanics || '')
})

const speciesMechanicCards = computed(() => {
  const entity = selectedSpeciesEntity.value
  if (!entity) return []

  const core = blockData(entity, 'species_core')
  const raw = rawJson(entity) || {}

  const rawCards = mechanicsCardsFromEntries(raw.entries, 'Trait')
  if (rawCards.length) return rawCards

  return mechanicsCardsFromText(core.traits || core.mechanics || speciesMechanicsDescription.value, 'Traits / Mechanics')
})

const speciesDescription = computed(() => {
  const entity = selectedSpeciesEntity.value
  if (!entity) return ''

  const raw = rawJson(entity) || {}

  return fluffTextFromRaw(raw) ||
    entitySummary(entity) ||
    fallbackLore(selectedSpeciesName.value, SPECIES_LORE_FALLBACKS)
})

const classMechanicsDescription = computed(() => {
  const entity = selectedClassEntity.value
  if (!entity) return ''

  const core = blockData(entity, 'class_core')
  const raw = rawJson(entity) || {}

  const hitDie = firstBuilderDisplayValue(core.hit_die, raw.hd)
  const primary = firstBuilderDisplayValue(core.primary_ability, raw.primaryAbility)
  const saves = firstBuilderDisplayValue(core.saving_throws, raw.proficiency)
  const armor = firstBuilderDisplayValue(core.armor_proficiencies, raw.startingProficiencies?.armor)
  const weapons = firstBuilderDisplayValue(core.weapon_proficiencies, raw.startingProficiencies?.weapons)
  const tools = firstBuilderDisplayValue(core.tool_proficiencies, raw.startingProficiencies?.tools)

  const lines = [
    hitDie ? `Hit Die: ${hitDie}` : '',
    primary ? `Primary Ability: ${primary}` : '',
    saves ? `Saving Throws: ${saves}` : '',
    armor ? `Armor: ${armor}` : '',
    weapons ? `Weapons: ${weapons}` : '',
    tools ? `Tools: ${tools}` : ''
  ].filter(Boolean)

  return mechanicsText(lines.join('\n'))
})

const classDescription = computed(() => {
  const entity = selectedClassEntity.value
  if (!entity) return ''

  const raw = rawJson(entity) || {}

  return fluffTextFromRaw(raw) ||
    classIntroTextFromRaw(raw) ||
    entitySummary(entity) ||
    fallbackLore(selectedClassName.value, CLASS_LORE_FALLBACKS)
})

const backgroundDescription = computed(() => {
  const entity = selectedBackgroundEntity.value
  if (!entity) return ''

  const core = blockData(entity, 'background_core')
  const raw = rawJson(entity) || {}

  return clean5eText(core.feature_description || core.description || '') ||
    entriesToText(raw.entries) ||
    entitySummary(entity)
})

const speciesInfoLines = computed(() => {
  const entity = selectedSpeciesEntity.value
  if (!entity) return []

  const core = blockData(entity, 'species_core')
  const raw = rawJson(entity) || {}

  return [
    core.size || simpleValue(raw.size) ? `Size: ${core.size || simpleValue(raw.size)}` : '',
    core.speed || simpleValue(raw.speed) ? `Speed: ${core.speed || simpleValue(raw.speed)}` : '',
    sourceText(entity)
  ].filter(Boolean)
})

const classInfoLines = computed(() => {
  const entity = selectedClassEntity.value
  if (!entity) return []

  const core = blockData(entity, 'class_core')
  const raw = rawJson(entity) || {}

  const hitDie = firstBuilderDisplayValue(core.hit_die, raw.hd)
  const primary = firstBuilderDisplayValue(core.primary_ability, raw.primaryAbility)
  const saves = firstBuilderDisplayValue(core.saving_throws, raw.proficiency)

  return [
    hitDie ? `Hit Die: ${hitDie}` : '',
    primary ? `Primary: ${primary}` : '',
    saves ? `Saves: ${saves}` : '',
    sourceText(entity)
  ].filter(Boolean)
})

const backgroundInfoLines = computed(() => {
  const entity = selectedBackgroundEntity.value
  if (!entity) return []

  const core = blockData(entity, 'background_core')
  const raw = rawJson(entity) || {}

  const skills = firstBuilderDisplayValue(core.skill_proficiencies, raw.skillProficiencies)
  const tools = firstBuilderDisplayValue(core.tool_proficiencies, raw.toolProficiencies)
  const languages = firstBuilderDisplayValue(core.languages, raw.languageProficiencies)

  return [
    skills ? `Skills: ${skills}` : '',
    tools ? `Tools: ${tools}` : '',
    languages ? `Languages: ${languages}` : '',
    sourceText(entity)
  ].filter(Boolean)
})

function classKey() {
  return selectedClassName.value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function recommendedAbilityOrder() {
  const key = classKey()

  if (key.includes('barbarian')) return ['str', 'con', 'dex', 'wis', 'cha', 'int']
  if (key.includes('fighter')) return ['str', 'con', 'dex', 'wis', 'cha', 'int']
  if (key.includes('paladin')) return ['str', 'cha', 'con', 'wis', 'dex', 'int']
  if (key.includes('ranger')) return ['dex', 'wis', 'con', 'str', 'cha', 'int']
  if (key.includes('rogue')) return ['dex', 'con', 'wis', 'cha', 'int', 'str']
  if (key.includes('monk')) return ['dex', 'wis', 'con', 'str', 'cha', 'int']
  if (key.includes('wizard')) return ['int', 'con', 'dex', 'wis', 'cha', 'str']
  if (key.includes('artificer')) return ['int', 'con', 'dex', 'wis', 'cha', 'str']
  if (key.includes('cleric')) return ['wis', 'con', 'str', 'dex', 'cha', 'int']
  if (key.includes('druid')) return ['wis', 'con', 'dex', 'int', 'str', 'cha']
  if (key.includes('bard')) return ['cha', 'dex', 'con', 'wis', 'int', 'str']
  if (key.includes('sorcerer')) return ['cha', 'con', 'dex', 'wis', 'int', 'str']
  if (key.includes('warlock')) return ['cha', 'con', 'dex', 'wis', 'int', 'str']

  return ['str', 'dex', 'con', 'int', 'wis', 'cha']
}

function applyRecommendedArray() {
  const order = recommendedAbilityOrder()

  for (const [index, ability] of order.entries()) {
    ;(builderForm.abilityScores as any)[ability] = String(STANDARD_ARRAY[index] || 10)
  }
}

watch(
  () => builderForm.classEntityId,
  () => {
    if (!advancedScores.value) {
      applyRecommendedArray()
    }
  }
)

function abilityMod(value: any) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '+0'

  const mod = Math.floor((parsed - 10) / 2)
  return `${mod >= 0 ? '+' : ''}${mod}`
}

function usedScoreByOtherAbility(score: any, abilityKey: string) {
  return Object.entries(builderForm.abilityScores)
    .some(([key, value]) => key !== abilityKey && String(value) === String(score))
}

const missingRequirements = computed(() => {
  const missing: string[] = []

  if (!builderForm.name.trim()) missing.push('Name')
  if (!builderForm.speciesEntityId) missing.push('Species')
  if (!builderForm.classEntityId) missing.push('Class')

  if (builderForm.classEntityId && classChoiceGroups.value.length && !classChoicesComplete.value) {
    for (const group of classChoiceGroups.value) {
      const selected = ensureClassChoiceDraft(group).filter(Boolean)
      if (selected.length < Number(group.count || 1)) {
        missing.push(group.title)
      }
    }
  }


  if (builderForm.speciesEntityId && speciesChoiceGroups.value.length && !speciesChoicesComplete.value) {
    for (const group of speciesChoiceGroups.value) {
      if (!speciesChoiceSelections[group.key]) {
        missing.push(group.title)
      }
    }
  }

  return missing
})

const canCreate = computed(() => !missingRequirements.value.length && !creating.value)

function nextStep() {
  if (stepIndex.value < steps.length - 1) {
    stepIndex.value += 1
  }
}

function previousStep() {
  if (stepIndex.value > 0) {
    stepIndex.value -= 1
  }
}

function goToStep(index: number) {
  stepIndex.value = index
}

function triggerBuilderPortraitUpload() {
  builderPortraitInput.value?.click()
}

function handleBuilderPortraitUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return

  if (builderPortraitPreviewUrl.value) {
    URL.revokeObjectURL(builderPortraitPreviewUrl.value)
  }

  builderPortraitFile.value = file
  builderPortraitPreviewUrl.value = URL.createObjectURL(file)
}

function clearBuilderPortrait() {
  if (builderPortraitPreviewUrl.value) {
    URL.revokeObjectURL(builderPortraitPreviewUrl.value)
  }

  builderPortraitPreviewUrl.value = ''
  builderPortraitFile.value = null

  if (builderPortraitInput.value) {
    builderPortraitInput.value.value = ''
  }
}

async function uploadBuilderPortraitForEntity(createdEntityId: string) {
  if (!builderPortraitFile.value || !createdEntityId) return

  const formData = new FormData()
  formData.append('title', builderForm.name || 'Character')
  formData.append('summary', `${selectedSpeciesName.value || 'Adventurer'}${selectedClassName.value ? ` • ${selectedClassName.value}` : ''}`)
  formData.append('characterType', 'pc')
  formData.append('image', builderPortraitFile.value)

  await $fetch(`/api/worlds/${worldId.value}/characters/${createdEntityId}/update`, {
    method: 'POST',
    body: formData
  })
}

function openBuilderImageLightbox(url: any, title: any = 'Image Preview') {
  const imageUrl = String(url || '').trim()
  if (!imageUrl) return

  builderImageLightbox.value = {
    open: true,
    url: imageUrl,
    title: String(title || 'Image Preview')
  }
}

function closeBuilderImageLightbox() {
  builderImageLightbox.value.open = false
}

async function createCharacter() {
  if (!canCreate.value) return

  creating.value = true
  createError.value = ''

  try {

    if (builderForm.backgroundEntityId && !backgroundChoicesComplete.value) {
      createError.value = 'Complete background choices before creating this character.'
      stepIndex.value = 0
      return
    }


    if (builderForm.classEntityId && !classSubclassChoicesComplete.value) {
      createError.value = 'Complete subclass choice before creating this character.'
      stepIndex.value = 0
      return
    }

    if (builderForm.classEntityId && !classSpellChoicesComplete.value) {
      createError.value = 'Complete class spell choices before creating this character.'
      stepIndex.value = 0
      return
    }


    if (!featChoicesComplete.value) {
      createError.value = 'Complete feat choices before creating this character.'
      stepIndex.value = 0
      return
    }


    if (builderForm.classEntityId && !classEquipmentChoicesComplete.value) {
      createError.value = 'Complete class equipment choices before creating this character.'
      stepIndex.value = 0
      return
    }

    const created = await $fetch<any>(`/api/worlds/${worldId.value}/characters/builder`, {
      method: 'POST',
      body: {
        name: builderForm.name,
        level: builderForm.level,
        classEntityId: builderForm.classEntityId,
        speciesEntityId: builderForm.speciesEntityId,
        backgroundEntityId: builderForm.backgroundEntityId || null,
        abilityScores: { ...builderForm.abilityScores },
        speciesChoices: speciesChoicePayload.value,
        classChoices: mergedClassChoicePayload.value,
        backgroundChoices: backgroundChoicePayload.value
      }
    })

    await applyBuilderSubclassToCreatedCharacter(created)

    await applyBuilderSpellcastingToCreatedCharacter(created)

    const entityId = String(created?.id || created?.entity?.id || '')
    if (!entityId) {
      throw new Error('Character was created, but no entity id was returned.')
    }

    await uploadBuilderPortraitForEntity(entityId)

    workspaceMode.value = 'build'
    await router.push(`/worlds/${worldId.value}/entities/${entityId}/sheet`)
  } catch (err: any) {
    createError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to create character.'
  } finally {
    creating.value = false
  }
}
</script>

<template>

  <input
    ref="builderPortraitInput"
    type="file"
    accept="image/*"
    class="hidden"
    @change="handleBuilderPortraitUpload"
  >
  <div class="fixed inset-0 z-[9999] overflow-y-auto bg-[#05080d] md:relative md:inset-auto md:z-auto md:bg-transparent">
    <div class="pointer-events-none fixed inset-0 z-0 md:hidden">
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(48,68,92,0.48),rgba(5,10,16,1)_62%)]"></div>
      <div class="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(3,6,10,0.18),rgba(3,6,10,0.50))]"></div>
    </div>

    <div class="relative z-10 mx-auto max-w-[980px] p-3 pb-20 md:p-6">
      <div class="sticky top-0 z-30 -mx-3 border-b border-[rgba(201,164,90,0.20)] bg-[rgba(7,13,20,0.92)] px-3 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur md:relative md:mx-0 md:border md:px-5 md:py-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-[10px] uppercase tracking-[0.35em] text-[#9f9278]">Guided Builder</div>
            <h1 class="mt-1 text-2xl font-semibold text-white">Create Player Character</h1>
            <p class="mt-1 text-sm text-[#d8ceb8]">{{ world?.name || 'World' }}</p>
          </div>

          <NuxtLink
            :to="`/worlds/${worldId}/characters`"
            class="rounded-none border border-[rgba(201,164,90,0.32)] bg-[rgba(20,17,12,0.82)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
          >
            Back
          </NuxtLink>
        </div>

        <div class="mt-4 grid grid-cols-3 gap-2">
          <button
            v-for="(step, index) in steps"
            :key="step.key"
            type="button"
            class="rounded-none border px-2 py-2 text-xs font-semibold"
            :class="stepIndex === index
              ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.18)] text-[#fff7df]'
              : 'border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
            @click="goToStep(index)"
          >
            {{ index + 1 }}. {{ step.label }}
          </button>
        </div>
      </div>

      <section class="eldra-ornate-panel mt-4 rounded-none border p-4 md:p-5">
        <div v-if="stepIndex === 0" class="grid gap-4">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Step 1</div>
            <h2 class="mt-2 text-xl font-semibold text-white">What are they?</h2>
            <p class="mt-1 text-sm leading-6 text-[#d8ceb8]">Start with species, then class. The preview cards explain what each choice means before the sheet is created.</p>

          <div class="grid gap-3 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.42)] p-3 md:grid-cols-[132px_minmax(0,1fr)]">
            <div>
              <div class="mb-2 text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Builder Portrait</div>
              <button
                type="button"
                class="group relative flex h-[150px] w-[116px] items-center justify-center overflow-hidden rounded-none border border-[rgba(201,164,90,0.70)] bg-[rgba(8,17,27,0.82)] p-[5px] text-[#f5e7bd]"
                @click="triggerBuilderPortraitUpload"
              >
                <img
                  v-if="builderPortraitPreviewUrl"
                  :src="builderPortraitPreviewUrl"
                  alt="Selected character portrait"
                  class="h-full w-full object-cover"
                >

                <div
                  v-else
                  class="flex h-full w-full flex-col items-center justify-center gap-2 bg-[rgba(201,164,90,0.08)] px-2 text-center"
                >
                  <UIcon name="i-lucide-image-plus" class="h-7 w-7 text-[#c9a45a]" />
                  <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9f9278]">Add Image</span>
                </div>

                <div class="absolute inset-x-1 bottom-1 bg-black/80 px-1 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[#fff7df]">
                  Change
                </div>
              </button>

              <button
                v-if="builderPortraitFile"
                type="button"
                class="mt-2 rounded-none border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-200"
                @click="clearBuilderPortrait"
              >
                Remove
              </button>
            </div>

            <div class="grid content-start gap-3">
              <label class="block">
                <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Character Name</span>
                <input
                  v-model="builderForm.name"
                  class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                  placeholder="Dingus Khan"
                >
              </label>

              <label data-guided-starting-level class="block">
                <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Starting Level</span>
                <select v-model="builderForm.level" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
                  <option
                    v-for="levelOption in BUILDER_LEVEL_OPTIONS"
                    :key="levelOption"
                    :value="String(levelOption)"
                    class="bg-[#090909] text-[#f5e7bd]"
                  >
                    Level {{ levelOption }}
                  </option>
                </select>
              </label>

              <div class="rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-3 text-xs leading-5 text-[#9f9278]">
                Pick a portrait now, or leave it blank and add one later from the sheet in Build mode.
              </div>
            </div>
          </div>

          </div>

          <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div class="grid gap-3">
              <label class="block">
                <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Species</span>
                <select v-model="builderForm.speciesEntityId" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
                  <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose a species...</option>
                  <option v-for="option in speciesOptions" :key="option.id" :value="option.id" class="bg-[#090909] text-[#f5e7bd]">
                    {{ option.title }}
                  </option>
                </select>
              </label>

              <article class="min-h-[220px] overflow-hidden rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)]">

                <button
                  v-if="selectedSpeciesImageUrl"
                  type="button"
                  class="block w-full overflow-hidden rounded-none text-left transition hover:brightness-110"
                  @click="openBuilderImageLightbox(selectedSpeciesImageUrl, selectedSpeciesName || 'Species Preview')"
                >
                  <img
                    :src="selectedSpeciesImageUrl"
                    :alt="selectedSpeciesName || 'Species'"
                    class="h-36 w-full object-cover"
                  >
                </button>

                <div v-else class="flex h-36 items-center justify-center bg-[rgba(201,164,90,0.08)] text-[#c9a45a]">
                  <UIcon name="i-lucide-users" class="h-10 w-10" />
                </div>

                <div class="p-3">
                  <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Species Preview</div>
                  <div class="mt-1 text-lg font-semibold text-white">{{ selectedSpeciesName || 'Choose a species' }}</div>

                  <div v-if="speciesInfoLines.length" class="mt-2 flex flex-wrap gap-1.5">
                    <span
                      v-for="line in speciesInfoLines"
                      :key="line"
                      class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-2 py-1 text-[10px] text-[#d8ceb8]"
                    >
                      {{ line }}
                    </span>
                  </div>

                  <p class="mt-3 max-h-44 overflow-y-auto whitespace-pre-line pr-1 text-xs leading-5 text-[#d8ceb8]">
                    {{ speciesDescription || 'Pick a species to see who they are, what they look like, and why they are cool.' }}
                  </p>



                  <!-- Species Builder Choices -->
                  <div
                    v-if="speciesChoiceGroups.length"
                    class="mt-3 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.42)] p-3"
                  >
                    <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Required Species Choices</div>

                    <div class="mt-3 grid gap-3">
                      <label
                        v-for="group in speciesChoiceGroups"
                        :key="group.key"
                        class="block"
                      >
                        <span class="mb-1 block text-xs uppercase tracking-[0.18em] text-[#9f9278]">{{ group.title }}</span>
                        <select
                          v-model="speciesChoiceSelections[group.key]"
                          class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                        >
                          <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose {{ group.title }}...</option>
                          <option
                            v-for="option in group.options"
                            :key="`${group.key}-${option.value}`"
                            :value="option.value"
                            class="bg-[#090909] text-[#f5e7bd]"
                          >
                            {{ option.label }}
                          </option>
                        </select>

                        <div
                          v-if="selectedSpeciesChoiceOption(group)"
                          class="mt-2 rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-3 text-xs leading-5 text-[#d8ceb8]"
                        >
                          <div class="font-semibold text-white">{{ selectedSpeciesChoiceOption(group)?.label }}</div>
                          <p
                            v-if="selectedSpeciesChoiceOption(group)?.detail"
                            class="mt-1 whitespace-pre-line text-[#9f9278]"
                          >
                            {{ selectedSpeciesChoiceOption(group)?.detail }}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

<div
                    v-if="speciesMechanicsDescription || speciesMechanicCards.length"
                    class="mt-3 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)]"
                  >
                    <button
                      type="button"
                      class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                      @click="speciesMechanicsOpen = !speciesMechanicsOpen"
                    >
                      <span class="text-xs font-semibold uppercase tracking-[0.22em] text-[#9f9278]">Traits / Mechanics</span>
                      <UIcon :name="speciesMechanicsOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="h-4 w-4 text-[#9f9278]" />
                    </button>

                    <div
                      v-show="speciesMechanicsOpen"
                      class="border-t border-[rgba(201,164,90,0.14)] px-3 py-3"
                    >

                      <div
                        v-if="speciesMechanicCards.length"
                        class="grid gap-2"
                      >
                        <article
                          v-for="(card, index) in speciesMechanicCards"
                          :key="`species-mechanic-${card.title}-${index}`"
                          class="rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.54)] p-3"
                        >
                          <div class="text-sm font-semibold text-white">{{ card.title }}</div>
                          <p
                            v-if="card.body"
                            class="mt-2 whitespace-pre-line break-words text-xs leading-5 text-[#9f9278]"
                          >
                            {{ card.body }}
                          </p>
                          <div
                            v-else
                            class="mt-2 text-xs text-[#9f9278]"
                          >
                            No additional text.
                          </div>
                        </article>
                      </div>

                      <p
                        v-else
                        class="max-h-56 overflow-y-auto whitespace-pre-line pr-1 text-xs leading-5 text-[#9f9278]"
                      >
                        {{ speciesMechanicsDescription }}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            </div>

            <div class="grid gap-3">
              <label class="block">
                <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Class</span>
                <select v-model="builderForm.classEntityId" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
                  <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose a class...</option>
                  <option v-for="option in classOptions" :key="option.id" :value="option.id" class="bg-[#090909] text-[#f5e7bd]">
                    {{ option.title }}
                  </option>
                </select>
              </label>

              <article class="min-h-[220px] overflow-hidden rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)]">

                <button
                  v-if="selectedClassImageUrl"
                  type="button"
                  class="block w-full overflow-hidden rounded-none text-left transition hover:brightness-110"
                  @click="openBuilderImageLightbox(selectedClassImageUrl, selectedClassName || 'Class Preview')"
                >
                  <img
                    :src="selectedClassImageUrl"
                    :alt="selectedClassName || 'Class'"
                    class="h-36 w-full object-cover"
                  >
                </button>

                <div v-else class="flex h-36 items-center justify-center bg-[rgba(201,164,90,0.08)] text-[#c9a45a]">
                  <UIcon name="i-lucide-swords" class="h-10 w-10" />
                </div>

                <div class="p-3">
                  <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Class Preview</div>
                  <div class="mt-1 text-lg font-semibold text-white">{{ selectedClassName || 'Choose a class' }}</div>

                  <div v-if="classInfoLines.length" class="mt-2 flex flex-wrap gap-1.5">
                    <span
                      v-for="line in classInfoLines"
                      :key="line"
                      class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-2 py-1 text-[10px] text-[#d8ceb8]"
                    >
                      {{ line }}
                    </span>
                  </div>

                  <p class="mt-3 max-h-44 overflow-y-auto whitespace-pre-line pr-1 text-xs leading-5 text-[#d8ceb8]">
                    {{ classDescription || 'Pick a class to see what kind of adventurer this character becomes.' }}
                  </p>

                  <div
                    v-if="classMechanicsDescription"
                    class="mt-3 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)]"
                  >
                    <button
                      type="button"
                      class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                      @click="classMechanicsOpen = !classMechanicsOpen"
                    >
                      <span class="text-xs font-semibold uppercase tracking-[0.22em] text-[#9f9278]">Class Mechanics</span>
                      <UIcon :name="classMechanicsOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="h-4 w-4 text-[#9f9278]" />
                    </button>

                    <div
                      v-show="classMechanicsOpen"
                      class="border-t border-[rgba(201,164,90,0.14)] px-3 py-3"
                    >
                      <p class="max-h-56 overflow-y-auto whitespace-pre-line pr-1 text-xs leading-5 text-[#9f9278]">
                        {{ classMechanicsDescription }}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>



          <!-- Class Builder Choices -->
          <div
            v-if="classChoiceGroups.length"
            class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.42)] p-3"
          >
            <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Required Class Choices</div>

            <div class="mt-3 grid gap-3">
              <div
                v-for="group in classChoiceGroups"
                :key="group.key"
                class="rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="font-semibold text-white">{{ group.title }}</div>
                    <div class="mt-1 text-xs text-[#9f9278]">
                      {{ group.note }} Choose {{ group.count }}.
                    </div>
                  </div>
                </div>

                <div class="mt-3 grid gap-2">
                  <label
                    v-for="slot in classChoiceSlots(group)"
                    :key="`${group.key}-${slot}`"
                    class="block"
                  >
                    <span class="mb-1 block text-xs uppercase tracking-[0.18em] text-[#9f9278]">
                      Pick {{ slot + 1 }}
                    </span>

                    <select
                      v-model="classChoiceSelections[group.key][slot]"
                      class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                    >
                      <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose...</option>
                      <option
                        v-for="option in group.options"
                        :key="`${group.key}-${option.value}`"
                        :value="option.value"
                        :disabled="isClassChoiceOptionDisabled(group, slot, option.value)"
                        class="bg-[#090909] text-[#f5e7bd] disabled:text-[#756a57]"
                      >
                        {{ option.label }}
                      </option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <CharactersClassSpellChoicePanel
            v-if="builderForm.classEntityId"
            :world-id="worldId"
            :class-name="selectedClassName"
            :class-entity="selectedClassEntity"
            :level="Number(builderForm.level || 1)"
            :ability-scores="builderForm.abilityScores"
            @update:spellcasting="setClassSpellcastingPayload"
            @update:complete="setClassSpellChoicesComplete"
          />

          <CharactersClassSubclassChoicePanel
            class="md:col-span-2"
            :world-id="worldId"
            :class-entity="selectedClassEntity"
            :level="Number(builderForm.level || 1)"
            @update:payload="setClassSubclassPayload"
            @update:complete="setClassSubclassChoicesComplete"
          />

          <CharactersFeatChoicePanel
            class="md:col-span-2"
            :world-id="worldId"
            :species-choices="speciesChoicePayload"
            :background-choices="backgroundChoicePayload"
            @update:spellcasting="setFeatSpellcastingPayload"
            @update:complete="setFeatChoicesComplete"
          />

          <CharactersClassEquipmentChoicePanel
            class="md:col-span-2"
            :class-entity="selectedClassEntity"
            @update:payload="setClassEquipmentPayload"
            @update:complete="setClassEquipmentChoicesComplete"
          />

          <div class="grid gap-3 md:grid-cols-2">
            <label class="block">
              <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Background</span>
              <select v-model="builderForm.backgroundEntityId" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
                <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose later...</option>
                <option v-for="option in backgroundOptions" :key="option.id" :value="option.id" class="bg-[#090909] text-[#f5e7bd]">
                  {{ option.title }}
                </option>
              </select>
            </label>

          </div>

          <article
            v-if="builderForm.backgroundEntityId"
            class="overflow-hidden rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)]"
          >
            <div class="grid gap-3 p-3 md:grid-cols-[180px_minmax(0,1fr)]">

              <button
                v-if="selectedBackgroundImageUrl"
                type="button"
                class="block w-full overflow-hidden rounded-none text-left transition hover:brightness-110"
                @click="openBuilderImageLightbox(selectedBackgroundImageUrl, selectedBackgroundName || 'Background Preview')"
              >
                <img
                  :src="selectedBackgroundImageUrl"
                  :alt="selectedBackgroundName || 'Background'"
                  class="h-36 w-full object-cover"
                >
              </button>

              <div v-else class="flex h-36 items-center justify-center bg-[rgba(201,164,90,0.08)] text-[#c9a45a]">
                <UIcon name="i-lucide-scroll-text" class="h-10 w-10" />
              </div>

              <div class="min-w-0">
                <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Background Preview</div>
                <div class="mt-1 text-lg font-semibold text-white">{{ selectedBackgroundName }}</div>

                <div v-if="backgroundInfoLines.length" class="mt-2 flex flex-wrap gap-1.5">
                  <span
                    v-for="line in backgroundInfoLines"
                    :key="line"
                    class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-2 py-1 text-[10px] text-[#d8ceb8]"
                  >
                    {{ line }}
                  </span>
                </div>

                <p class="mt-3 max-h-36 overflow-y-auto whitespace-pre-line pr-1 text-xs leading-5 text-[#9f9278]">
                  {{ backgroundDescription || 'No imported background description found yet.' }}
                </p>

                <CharactersBackgroundChoicePanel
                  :background-entity="selectedBackgroundEntity"
                  @update:payload="setBackgroundChoicePayload"
                  @update:complete="setBackgroundChoicesComplete"
                />

              </div>
            </div>
          </article>

          <div v-if="!classOptions.length || !speciesOptions.length" class="rounded-none border border-amber-300/24 bg-amber-400/10 p-3 text-sm leading-6 text-amber-100">
            This builder needs imported class and species articles. Import PHB/XPHB classes and species first if these lists are empty.
          </div>
        </div>

        <div v-else-if="stepIndex === 1" class="grid gap-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Step 2</div>
              <h2 class="mt-2 text-xl font-semibold text-white">Ability Scores</h2>
              <p class="mt-1 text-sm leading-6 text-[#d8ceb8]">Standard Array is the safe default. Recommended placement changes with class.</p>
            </div>

            <div class="flex gap-2">
              <button
                type="button"
                class="eldra-button rounded-none px-3 py-2 text-xs font-semibold"
                @click="applyRecommendedArray"
              >
                Auto-Fill
              </button>

              <button
                type="button"
                class="rounded-none border px-3 py-2 text-xs font-semibold"
                :class="advancedScores
                  ? 'border-amber-300/40 bg-amber-400/10 text-amber-100'
                  : 'border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
                @click="advancedScores = !advancedScores"
              >
                {{ advancedScores ? 'Manual On' : 'Manual' }}
              </button>
            </div>
          </div>

          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div
              v-for="ability in ABILITIES"
              :key="ability.key"
              class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">{{ ability.label }}</div>
                  <div class="mt-1 text-sm text-[#d8ceb8]">{{ ability.name }}</div>
                </div>

                <div class="text-right">
                  <div class="text-2xl font-semibold text-white">{{ builderForm.abilityScores[ability.key] }}</div>
                  <div class="text-xs text-[#9f9278]">{{ abilityMod(builderForm.abilityScores[ability.key]) }}</div>
                </div>
              </div>

              <select
                v-if="!advancedScores"
                v-model="builderForm.abilityScores[ability.key]"
                class="eldra-input mt-3 w-full rounded-none px-3 py-2 text-sm text-white"
              >
                <option
                  v-for="score in STANDARD_ARRAY"
                  :key="score"
                  :value="String(score)"
                  :disabled="usedScoreByOtherAbility(score, ability.key)"
                  class="bg-[#090909] text-[#f5e7bd] disabled:text-[#756a57]"
                >
                  {{ score }}
                </option>
              </select>

              <input
                v-else
                v-model="builderForm.abilityScores[ability.key]"
                inputmode="numeric"
                class="eldra-input mt-3 w-full rounded-none px-3 py-2 text-sm text-white"
              >
            </div>
          </div>

          <div v-if="advancedScores" class="rounded-none border border-amber-300/24 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
            Manual scores allow overrides, rolled stats, homebrew, and DM-approved nonsense.
          </div>
        </div>

        <div v-else class="grid gap-4">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Step 3</div>
            <h2 class="mt-2 text-xl font-semibold text-white">Review & Create</h2>
            <p class="mt-1 text-sm leading-6 text-[#d8ceb8]">This creates the PC and opens the sheet in Build mode for choices, spells, gear, and leveling polish.</p>
          </div>

          <div class="grid gap-2 md:grid-cols-2">
            <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3">
              <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">Name</div>
              <div class="mt-1 text-lg font-semibold text-white">{{ builderForm.name || 'Missing name' }}</div>
            </div>

            <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3">
              <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">Species / Class</div>
              <div class="mt-1 text-lg font-semibold text-white">
                {{ selectedSpeciesName || 'Missing species' }} · {{ selectedClassName || 'Missing class' }}
              </div>
              <div class="mt-1 text-xs text-[#9f9278]">
                {{ selectedBackgroundName || 'Background later' }} · Level {{ builderForm.level }}
              </div>
            </div>
          </div>





          <!-- Review Class Choices -->
          <div
            v-if="Object.keys(mergedClassChoicePayload).length"
            class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
          >
            <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">Class Choices</div>
            <div class="mt-2 grid gap-2">
              <div
                v-for="choice in Object.values(mergedClassChoicePayload)"
                :key="choice.label"
                class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(20,17,12,0.42)] p-2 text-sm"
              >
                <span class="text-[#9f9278]">{{ choice.label }}:</span>
                <span class="font-semibold text-white"> {{ choice.values.join(', ') }}</span>
              </div>
            </div>
          </div>

<!-- Review Species Choices -->
          <div
            v-if="Object.keys(speciesChoicePayload).length"
            class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
          >
            <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">Species Choices</div>
            <div class="mt-2 grid gap-2">
              <div
                v-for="choice in Object.values(speciesChoicePayload)"
                :key="`${choice.label}-${choice.value}`"
                class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(20,17,12,0.42)] p-2 text-sm"
              >
                <span class="text-[#9f9278]">{{ choice.label }}:</span>
                <span class="font-semibold text-white"> {{ choice.valueLabel || choice.selectedLabel || choice.value }}</span>
              </div>
            </div>
          </div>

<div class="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
            <div
              v-for="ability in ABILITIES"
              :key="`review-${ability.key}`"
              class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2"
            >
              <div class="text-xs uppercase tracking-[0.18em] text-[#9f9278]">{{ ability.label }}</div>
              <div class="mt-1 text-xl font-semibold text-white">{{ builderForm.abilityScores[ability.key] }}</div>
              <div class="text-xs text-[#9f9278]">{{ abilityMod(builderForm.abilityScores[ability.key]) }}</div>
            </div>
          </div>

          <div v-if="missingRequirements.length" class="rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
            Missing: {{ missingRequirements.join(', ') }}
          </div>

          <div v-if="createError" class="rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
            {{ createError }}
          </div>
        </div>
      </section>


      <Transition enter-from-class="opacity-0" enter-active-class="transition duration-150" leave-to-class="opacity-0" leave-active-class="transition duration-150">
        <div
          v-if="builderImageLightbox.open"
          class="fixed inset-0 z-[260] flex items-center justify-center bg-black/88 p-4 backdrop-blur-sm"
          @click.self="closeBuilderImageLightbox"
        >
          <button
            type="button"
            class="absolute right-4 top-4 rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(20,17,12,0.86)] p-3 text-[#f5e7bd]"
            @click="closeBuilderImageLightbox"
          >
            <UIcon name="i-lucide-x" class="h-5 w-5" />
          </button>

          <div class="max-h-[88dvh] max-w-[94vw] overflow-hidden rounded-none border border-[rgba(201,164,90,0.58)] bg-[rgba(7,16,26,0.86)] p-2 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <img
              :src="builderImageLightbox.url"
              :alt="builderImageLightbox.title"
              class="max-h-[84dvh] max-w-full object-contain"
            >
          </div>
        </div>
      </Transition>

<div class="sticky bottom-0 z-20 -mx-3 mt-4 border-t border-[rgba(201,164,90,0.20)] bg-[rgba(7,13,20,0.94)] p-3 backdrop-blur md:mx-0 md:rounded-none md:border">
        <div class="grid grid-cols-2 gap-3">
          <button
            type="button"
            class="eldra-button rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-40"
            :disabled="stepIndex === 0"
            @click="previousStep"
          >
            Back
          </button>

          <button
            v-if="stepIndex < steps.length - 1"
            type="button"
            class="eldra-button rounded-none px-4 py-3 text-sm font-semibold"
            @click="nextStep"
          >
            Next
          </button>

          <button
            v-else
            type="button"
            class="eldra-button rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
            :disabled="!canCreate"
            @click="createCharacter"
          >
            {{ creating ? 'Creating...' : 'Create Character' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
