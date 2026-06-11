<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const router = useRouter()
const worldId = computed(() => String(route.params.id || ''))
const workspaceMode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const stepIndex = ref(0)
const creating = ref(false)
const createError = ref('')
const advancedScores = ref(false)
const speciesMechanicsOpen = ref(false)
const classMechanicsOpen = ref(false)

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]
const ABILITIES = [
  { key: 'str', label: 'STR', name: 'Strength' },
  { key: 'dex', label: 'DEX', name: 'Dexterity' },
  { key: 'con', label: 'CON', name: 'Constitution' },
  { key: 'int', label: 'INT', name: 'Intelligence' },
  { key: 'wis', label: 'WIS', name: 'Wisdom' },
  { key: 'cha', label: 'CHA', name: 'Charisma' }
] as const

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
  const lines = [
    core.hit_die || simpleValue(raw.hd) ? `Hit Die: ${core.hit_die || simpleValue(raw.hd)}` : '',
    core.primary_ability || simpleValue(raw.primaryAbility) ? `Primary Ability: ${core.primary_ability || simpleValue(raw.primaryAbility)}` : '',
    core.saving_throws || simpleValue(raw.proficiency) ? `Saving Throws: ${core.saving_throws || simpleValue(raw.proficiency).toUpperCase()}` : '',
    core.armor_proficiencies || simpleValue(raw.startingProficiencies?.armor) ? `Armor: ${core.armor_proficiencies || simpleValue(raw.startingProficiencies?.armor)}` : '',
    core.weapon_proficiencies || simpleValue(raw.startingProficiencies?.weapons) ? `Weapons: ${core.weapon_proficiencies || simpleValue(raw.startingProficiencies?.weapons)}` : '',
    core.tool_proficiencies || simpleValue(raw.startingProficiencies?.tools) ? `Tools: ${core.tool_proficiencies || simpleValue(raw.startingProficiencies?.tools)}` : ''
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

  return [
    core.hit_die || simpleValue(raw.hd) ? `Hit Die: ${core.hit_die || simpleValue(raw.hd)}` : '',
    core.primary_ability || simpleValue(raw.primaryAbility) ? `Primary: ${core.primary_ability || simpleValue(raw.primaryAbility)}` : '',
    core.saving_throws || simpleValue(raw.proficiency) ? `Saves: ${core.saving_throws || simpleValue(raw.proficiency).toUpperCase()}` : '',
    sourceText(entity)
  ].filter(Boolean)
})

const backgroundInfoLines = computed(() => {
  const entity = selectedBackgroundEntity.value
  if (!entity) return []

  const core = blockData(entity, 'background_core')
  const raw = rawJson(entity) || {}

  return [
    core.skill_proficiencies || simpleValue(raw.skillProficiencies) ? `Skills: ${core.skill_proficiencies || simpleValue(raw.skillProficiencies)}` : '',
    core.tool_proficiencies || simpleValue(raw.toolProficiencies) ? `Tools: ${core.tool_proficiencies || simpleValue(raw.toolProficiencies)}` : '',
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

async function createCharacter() {
  if (!canCreate.value) return

  creating.value = true
  createError.value = ''

  try {
    const created = await $fetch<any>(`/api/worlds/${worldId.value}/characters/builder`, {
      method: 'POST',
      body: {
        name: builderForm.name,
        level: builderForm.level,
        classEntityId: builderForm.classEntityId,
        speciesEntityId: builderForm.speciesEntityId,
        backgroundEntityId: builderForm.backgroundEntityId || null,
        abilityScores: { ...builderForm.abilityScores }
      }
    })

    const entityId = String(created?.id || created?.entity?.id || '')
    if (!entityId) {
      throw new Error('Character was created, but no entity id was returned.')
    }

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

      <section class="eldra-ornate-panel eldra-frame-corners mt-4 rounded-none border p-4 md:p-5">
        <div v-if="stepIndex === 0" class="grid gap-4">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Step 1</div>
            <h2 class="mt-2 text-xl font-semibold text-white">What are they?</h2>
            <p class="mt-1 text-sm leading-6 text-[#d8ceb8]">Start with species, then class. The preview cards explain what each choice means before the sheet is created.</p>
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
                <img
                  v-if="selectedSpeciesImageUrl"
                  :src="selectedSpeciesImageUrl"
                  :alt="selectedSpeciesName || 'Species'"
                  class="h-36 w-full object-cover"
                >

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
                <img
                  v-if="selectedClassImageUrl"
                  :src="selectedClassImageUrl"
                  :alt="selectedClassName || 'Class'"
                  class="h-36 w-full object-cover"
                >

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

          <label class="block">
            <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Character Name</span>
            <input
              v-model="builderForm.name"
              class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
              placeholder="Dingus Khan"
            >
          </label>

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

            <label class="block">
              <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Starting Level</span>
              <select v-model="builderForm.level" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
                <option v-for="level in 20" :key="level" :value="String(level)" class="bg-[#090909] text-[#f5e7bd]">
                  Level {{ level }}
                </option>
              </select>
            </label>
          </div>

          <article
            v-if="builderForm.backgroundEntityId"
            class="overflow-hidden rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)]"
          >
            <div class="grid gap-3 p-3 md:grid-cols-[180px_minmax(0,1fr)]">
              <img
                v-if="selectedBackgroundImageUrl"
                :src="selectedBackgroundImageUrl"
                :alt="selectedBackgroundName || 'Background'"
                class="h-36 w-full object-cover"
              >

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
