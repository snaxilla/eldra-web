<script setup lang="ts">
import WorldMentionText from '~/components/world/WorldMentionText.vue'
import { renderMarkdown } from '~/utils/renderMarkdown'

const props = defineProps<{
  entityType: string
  pageKey: string
  title: string
  eyebrow?: string
  description?: string
  searchPlaceholder?: string
  emptyMessage?: string
}>()

const route = useRoute()
const router = useRouter()
const worldId = computed(() => String(route.params.id || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const search = ref('')

const collectionViewOptions = [
  { key: 'grid', label: 'Grid', icon: 'i-lucide-layout-grid' },
  { key: 'list', label: 'List', icon: 'i-lucide-list' }
] as const

type CollectionView = typeof collectionViewOptions[number]['key']

function defaultCollectionViewForPage(): CollectionView {
  const type = normalizeEntityType(props.entityType)
  const page = normalizeEntityType(props.pageKey)

  return ['item', 'items', 'spell', 'spells'].includes(type) ||
    ['item', 'items', 'spell', 'spells'].includes(page)
    ? 'list'
    : 'grid'
}

const collectionView = ref<CollectionView>(defaultCollectionViewForPage())

const collectionResultsClass = computed(() => [
  'eldra-collection-results mt-6',
  collectionView.value === 'list'
    ? 'eldra-collection-list'
    : 'eldra-collection-grid'
])

watch(
  () => [props.entityType, props.pageKey],
  () => {
    collectionView.value = defaultCollectionViewForPage()
  }
)

const selectedEntityId = ref<string | null>(null)

const collectionRailOpen = computed(() =>
  Boolean(selectedEntityId.value) || (mode.value === 'build' && !selectedEntityId.value)
)

const collectionShellClass = computed(() => [
  'w-full p-6 transition-[margin,max-width] duration-200',
  collectionRailOpen.value
    ? 'mx-0 max-w-none xl:mr-[404px]'
    : 'mx-auto max-w-[1700px]'
])


const entitySummaryTypes = computed(() => {
  const type = normalizeEntityType(props.entityType)
  if (type === 'species') return 'species,race'
  return type
})
const deletingEntity = ref(false)
const deleteError = ref('')

const LOCATION_TYPE_OPTIONS = [
  { label: 'Location', value: 'location' },
  { label: 'Village', value: 'village' },
  { label: 'Town', value: 'town' },
  { label: 'City', value: 'city' },
  { label: 'Capital', value: 'capital' },
  { label: 'Fortress', value: 'fortress' },
  { label: 'Outpost', value: 'outpost' },
  { label: 'Region', value: 'region' },
  { label: 'Wilderness', value: 'wilderness' },
  { label: 'Dungeon', value: 'dungeon' },
  { label: 'Ruin', value: 'ruin' },
  { label: 'Cave', value: 'cave' },
  { label: 'Temple', value: 'temple' },
  { label: 'Landmark', value: 'landmark' },
  { label: 'District', value: 'district' },
  { label: 'Building', value: 'building' },
  { label: 'Shop', value: 'shop' },
  { label: 'Tavern', value: 'tavern' },
  { label: 'Guildhall', value: 'guildhall' },
  { label: 'Residence', value: 'residence' },
  { label: 'Point of Interest', value: 'point_of_interest' }
]

const isLocationPage = computed(() => normalizeEntityType(props.entityType) === 'location')
const showNewLocationForm = ref(false)
const creatingLocation = ref(false)
const newLocationError = ref('')
const newLocationForm = reactive({
  title: '',
  locationType: 'location',
  population: '',
  linkedMapId: '',
  parentLocationId: '',
  summary: ''
})

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)
const { data: entities, pending, refresh } = await useFetch(() => `/api/worlds/${worldId.value}/entities?summary=1&type=${encodeURIComponent(entitySummaryTypes.value)}`, {
  default: () => []
})

const { data: selectedEntityDetail, pending: selectedPending } = await useFetch(
  () => selectedEntityId.value ? `/api/worlds/${worldId.value}/entities/${selectedEntityId.value}` : null,
  {
    default: () => null,
    watch: [selectedEntityId]
  }
)

const { data: worldMaps } = await useFetch(() => `/api/worlds/${worldId.value}/maps`, {
  default: () => [],
  watch: [worldId]
})

const mapOptions = computed(() => {
  return (Array.isArray(worldMaps.value) ? worldMaps.value : [])
    .map((map: any) => ({
      id: String(map?.id || ''),
      title: String(map?.title || 'Untitled Map')
    }))
    .filter((map: any) => map.id)
    .sort((a: any, b: any) => a.title.localeCompare(b.title))
})

const parentLocationOptions = computed(() => {
  return (Array.isArray(entities.value) ? entities.value : [])
    .filter((entity: any) => normalizeEntityType(entity?.entity_type) === 'location')
    .map((entity: any) => ({
      id: String(entity?.id || ''),
      title: String(entity?.title || 'Untitled Location')
    }))
    .filter((entity: any) => entity.id)
    .sort((a: any, b: any) => a.title.localeCompare(b.title))
})

function normalizeEntityType(value: any) {
  return String(value || '').trim().toLowerCase()
}

function initialsFor(name: string) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (!words.length) return '?'
  return words.map(w => w[0]?.toUpperCase() || '').join('')
}

function imageUrlForEntity(entity: any) {
  if (entity?.imageUrl) return String(entity.imageUrl)
  if (entity?.image_url) return String(entity.image_url)
  if (selectedEntity.value?.imageUrl && String(entity?.id || '') === String(selectedEntity.value?.id || '')) return String(selectedEntity.value.imageUrl)
  if (selectedEntity.value?.image_url && String(entity?.id || '') === String(selectedEntity.value?.id || '')) return String(selectedEntity.value.image_url)

  const blocks = Array.isArray(entity?.blocks) ? entity.blocks : []
  for (const block of blocks) {
    const image = block?.data?.image
    if (!image) continue

    if (typeof image === 'string' && image.trim()) return `/api/assets/${image}`

    if (typeof image === 'object') {
      if (image.image_url) return image.image_url
      if (image.file_id) return `/api/assets/${image.file_id}`
      if (image.id) return `/api/assets/${image.id}`
    }
  }

  return null
}

function looksLikeDescriptiveParagraph(value: string) {
  const text = String(value || '').trim()
  if (!text) return false
  if (text.length < 40) return false
  if (!/[a-z]/i.test(text)) return false
  if (text.includes('|')) return false
  return true
}

function findFirstDescriptiveText(value: any): string {
  if (value == null) return ''

  if (typeof value === 'string') {
    const text = value.trim()
    return looksLikeDescriptiveParagraph(text) ? text : ''
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstDescriptiveText(item)
      if (found) return found
    }
    return ''
  }

  if (typeof value === 'object') {
    if (typeof value.entry === 'string') {
      const text = value.entry.trim()
      if (looksLikeDescriptiveParagraph(text)) return text
    }

    if (Array.isArray(value.entries)) {
      const found = findFirstDescriptiveText(value.entries)
      if (found) return found
    }

    if (Array.isArray(value.items)) {
      const found = findFirstDescriptiveText(value.items)
      if (found) return found
    }
  }

  return ''
}

function blockByKey(entity: any, key: string) {
  const blocks = Array.isArray(entity?.blocks) ? entity.blocks : []
  return blocks.find((block: any) => String(block?.block_key || block?.blockKey || '') === key) || null
}

function itemCore(entity: any) {
  return blockByKey(entity, 'item_core')?.data || null
}

function spellCore(entity: any) {
  return blockByKey(entity, 'spell_core')?.data || null
}

function featCore(entity: any) {
  return blockByKey(entity, 'feat_core')?.data || null
}

function speciesCore(entity: any) {
  return blockByKey(entity, 'species_core')?.data || null
}

function classCore(entity: any) {
  return blockByKey(entity, 'class_core')?.data || null
}


function importSourceRawJson(entity: any) {
  const sourceBlock = blockByKey(entity, 'import_source')
  return sourceBlock?.data?.raw_json || null
}

function clean5eText(value: any): string {
  return String(value || '')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat)\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/g, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatEntriesAsMarkdown(entries: any): string {
  if (!entries) return ''

  if (typeof entries === 'string') return clean5eText(entries)

  if (Array.isArray(entries)) {
    return entries.map(formatEntriesAsMarkdown).filter(Boolean).join('\n\n')
  }

  if (typeof entries === 'object') {
    const parts: string[] = []

    if (entries.name) parts.push(`## ${clean5eText(entries.name)}`)
    if (entries.entry) parts.push(clean5eText(entries.entry))
    if (entries.entries) parts.push(formatEntriesAsMarkdown(entries.entries))
    if (entries.items) parts.push(formatEntriesAsMarkdown(entries.items))

    return parts.filter(Boolean).join('\n\n')
  }

  return ''
}

function formatClassFeatureRef(value: any): string {
  if (!value) return ''

  if (typeof value === 'string') {
    const parts = value.split('|')
    const name = parts[0] || value
    const level = parts[3]
    return level ? `Level ${level}: ${name}` : name
  }

  if (typeof value === 'object') {
    return formatClassFeatureRef(value.classFeature || value.name || '')
  }

  return String(value)
}

function formatChoiceList(value: any): string {
  if (!value) return ''

  if (Array.isArray(value)) {
    return value.map(formatChoiceList).filter(Boolean).join(', ')
  }

  if (typeof value === 'string') return value

  if (typeof value === 'object') {
    if (Array.isArray(value.from)) return value.from.join(', ')
    if (value.choose) return formatChoiceList(value.choose)
    return Object.values(value).map(formatChoiceList).filter(Boolean).join(', ')
  }

  return String(value)
}

function buildClassArticleMarkdown(entity: any): string {
  const raw = importSourceRawJson(entity)
  if (!raw) return ''

  const parts: string[] = []

  if (raw.entries) {
    const entriesText = formatEntriesAsMarkdown(raw.entries)
    if (entriesText) parts.push(entriesText)
  }

  if (raw.startingProficiencies) {
    const profs: string[] = []

    if (raw.proficiency) profs.push(`**Saving Throw Proficiencies:** ${formatChoiceList(raw.proficiency).toUpperCase()}`)

    const armor = formatChoiceList(raw.startingProficiencies.armor)
    if (armor) profs.push(`**Armor Training:** ${armor}`)

    const weapons = formatChoiceList(raw.startingProficiencies.weapons)
    if (weapons) profs.push(`**Weapon Proficiencies:** ${weapons}`)

    const tools = formatChoiceList(raw.startingProficiencies.tools)
    if (tools) profs.push(`**Tool Proficiencies:** ${tools}`)

    const skills = formatChoiceList(raw.startingProficiencies.skills)
    if (skills) profs.push(`**Skill Proficiencies:** ${skills}`)

    if (profs.length) parts.push(`## Proficiencies\n\n${profs.join('\n\n')}`)
  }

  if (raw.startingEquipment?.entries?.length) {
    parts.push(`## Starting Equipment\n\n${formatEntriesAsMarkdown(raw.startingEquipment.entries)}`)
  }

  if (Array.isArray(raw.classFeatures) && raw.classFeatures.length) {
    const features = raw.classFeatures
      .map(formatClassFeatureRef)
      .filter(Boolean)
      .map((line: string) => `- ${clean5eText(line)}`)
      .join('\n')

    if (features) parts.push(`## Class Features\n\n${features}`)
  }

  return parts.filter(Boolean).join('\n\n')
}

function buildSpeciesArticleMarkdown(entity: any): string {
  const core = speciesCore(entity)
  const raw = importSourceRawJson(entity)
  const parts: string[] = []

  if (core?.traits) parts.push(String(core.traits))
  if (!parts.length && raw?.entries) parts.push(formatEntriesAsMarkdown(raw.entries))

  return parts.filter(Boolean).join('\n\n')
}


function backgroundCore(entity: any) {
  return blockByKey(entity, 'background_core')?.data || null
}

function parseJsonishValue(value: any): any {
  if (typeof value !== 'string') return value

  const trimmed = value.trim()
  if (!trimmed) return value

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }

  return value
}

function formatSimpleValue(value: any): string {
  value = parseJsonishValue(value)

  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  if (Array.isArray(value)) {
    return value.map(formatSimpleValue).filter(Boolean).join(', ')
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${formatSimpleValue(v)}`)
      .filter(Boolean)
      .join(', ')
  }

  return String(value)
}

function formatSpeed(value: any): string {
  if (value == null || value === '') return ''

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.map(formatSpeed).filter(Boolean).join(', ')
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => {
        if (typeof v === 'boolean') return v ? k : ''
        return `${k}: ${formatSimpleValue(v)}`
      })
      .filter(Boolean)
      .join(', ')
  }

  return String(value)
}

function formatSize(value: any): string {
  return formatSimpleValue(value)
}

function formatPrimaryAbility(value: any): string {
  value = parseJsonishValue(value)

  if (value == null || value === '') return ''

  if (typeof value === 'string') return value.toUpperCase()

  if (Array.isArray(value)) {
    return value.map(formatPrimaryAbility).filter(Boolean).join(', ')
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => {
        if (typeof v === 'boolean') return v ? k.toUpperCase() : ''
        return `${k.toUpperCase()}: ${formatSimpleValue(v)}`
      })
      .filter(Boolean)
      .join(', ')
  }

  return String(value)
}


function collectionCleanText(value: any) {
  return String(value ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat)\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/g, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectionTitleCase(value: any) {
  return collectionCleanText(value)
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function collectionCompactSource(value: any) {
  return collectionCleanText(value)
    .replace(/\|/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectionItemProfile(entity: any) {
  return entity?.itemProfile || entity?.profile || entity?.normalizedItem || null
}

function collectionLocationCore(entity: any) {
  return blockByKey(entity, 'location_core')?.data || null
}

function collectionItemMetaLines(entity: any) {
  const profile = collectionItemProfile(entity)

  if (profile) {
    const weapon = profile.weapon || {}
    const armor = profile.armor || {}
    const damageLine = weapon.damage
      ? `Damage: ${weapon.damage}${weapon.damageType ? ` ${collectionTitleCase(weapon.damageType)}` : ''}`
      : ''
    const armorLine = armor.baseAc
      ? `AC: ${armor.baseAc}${armor.bonusAc ? ` + ${armor.bonusAc}` : ''}`
      : armor.isShield
        ? `Shield: +${armor.shieldBonus || 2} AC`
        : ''

    return [
      profile.displayType ? `Type: ${profile.displayType}` : '',
      profile.rarity ? `Rarity: ${collectionTitleCase(profile.rarity)}` : '',
      damageLine,
      armorLine,
      profile.weight ? `Weight: ${profile.weight}` : '',
      profile.requiresAttunement ? 'Requires Attunement' : '',
      profile.source ? `Source: ${profile.source}` : ''
    ].filter(Boolean)
  }

  return itemMetaLines(entity).map(collectionCompactSource)
}

function collectionSpellMetaLines(entity: any) {
  const core = spellCore(entity)
  if (!core) return spellMetaLines(entity)

  const rawLevel = core.level ?? core.spell_level ?? core.spellLevel
  const level = Number(rawLevel)
  const levelLabel = Number.isFinite(level)
    ? (level <= 0 ? 'Cantrip' : `Level ${level}`)
    : rawLevel
      ? collectionTitleCase(rawLevel)
      : ''

  return [
    levelLabel ? `Level: ${levelLabel}` : '',
    core.school ? `School: ${collectionTitleCase(core.school)}` : '',
    core.casting_time || core.castingTime ? `Casting: ${collectionCleanText(core.casting_time || core.castingTime)}` : '',
    core.range ? `Range: ${collectionCleanText(core.range)}` : '',
    core.duration ? `Duration: ${collectionCleanText(core.duration)}` : '',
    core.components ? `Components: ${collectionCleanText(core.components)}` : '',
    core.ritual ? 'Ritual' : '',
    core.concentration ? 'Concentration' : ''
  ].filter(Boolean)
}

function collectionLocationMetaLines(entity: any) {
  const core = collectionLocationCore(entity)

  return [
    core?.location_type || core?.locationType || core?.type ? `Type: ${collectionTitleCase(core?.location_type || core?.locationType || core?.type)}` : '',
    core?.population ? `Population: ${collectionCleanText(core.population)}` : '',
    core?.parentLocationId || core?.parent_location_id ? 'Has Parent Location' : '',
    core?.linkedMapId || core?.linked_map_id ? 'Linked Map' : ''
  ].filter(Boolean)
}

function collectionMetaLines(entity: any) {
  const type = normalizeEntityType(props.entityType)
  const page = normalizeEntityType(props.pageKey)

  if (type === 'item' || page === 'items') return collectionItemMetaLines(entity)
  if (type === 'spell' || page === 'spells') return collectionSpellMetaLines(entity)
  if (type === 'location' || page === 'locations') return collectionLocationMetaLines(entity)
  if (type === 'species' || page === 'species' || page === 'races') return speciesMetaLines(entity).map(collectionCompactSource)
  if (type === 'class' || page === 'classes') return classMetaLines(entity).map(collectionCompactSource)
  if (type === 'feat' || page === 'feats') return featMetaLines(entity).map(collectionCompactSource)
  if (type === 'background' || page === 'backgrounds') return backgroundMetaLines(entity).map(collectionCompactSource)

  return []
}

function collectionFacetValue(entity: any) {
  const type = normalizeEntityType(props.entityType)
  const page = normalizeEntityType(props.pageKey)

  if (type === 'item' || page === 'items') {
    const profile = collectionItemProfile(entity)
    const core = itemCore(entity)

    return collectionTitleCase(
      profile?.category ||
      profile?.displayType ||
      core?.category ||
      core?.item_type ||
      core?.itemType ||
      'Item'
    )
  }

  if (type === 'spell' || page === 'spells') {
    const core = spellCore(entity)
    const rawLevel = core?.level ?? core?.spell_level ?? core?.spellLevel
    const level = Number(rawLevel)

    if (Number.isFinite(level)) return level <= 0 ? 'Cantrip' : `Level ${level}`
    return rawLevel ? collectionTitleCase(rawLevel) : 'Unknown Level'
  }

  if (type === 'location' || page === 'locations') {
    const core = collectionLocationCore(entity)
    return collectionTitleCase(core?.location_type || core?.locationType || core?.type || 'Location')
  }

  if (type === 'species' || page === 'species' || page === 'races') {
    const core = speciesCore(entity)
    const size = formatSize(core?.size ?? core?.size_json ?? core?.race_size)
    return size ? `Size ${size}` : 'Species'
  }

  if (type === 'class' || page === 'classes') {
    const core = classCore(entity)
    const hitDie = core?.hit_die ?? core?.hitDie ?? core?.hd
    return hitDie ? `Hit Die ${formatSimpleValue(hitDie)}` : 'Class'
  }

  if (type === 'feat' || page === 'feats') {
    const core = featCore(entity)
    return collectionTitleCase(core?.category || 'Feat')
  }

  if (type === 'background' || page === 'backgrounds') {
    const core = backgroundCore(entity)
    return core?.feature ? 'Has Feature' : 'Background'
  }

  return 'All'
}

function collectionWantedTypes() {
  const type = normalizeEntityType(props.entityType)

  if (type === 'species') return new Set(['species', 'race'])
  return new Set([type])
}

function collectionEntityType(entity: any) {
  return normalizeEntityType(entity?.entity_type || entity?.entityType)
}

function matchesCollectionType(entity: any) {
  return collectionWantedTypes().has(collectionEntityType(entity))
}

function collectionSearchHaystack(entity: any) {
  return [
    entity?.title,
    entity?.slug,
    entity?.summary,
    summaryForEntity(entity),
    ...collectionMetaLines(entity)
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

const activeCollectionFacet = ref('all')

const collectionFacetOptions = computed(() => {
  const counts = new Map<string, number>()

  for (const entity of entities.value || []) {
    if (!matchesCollectionType(entity)) continue

    const value = collectionFacetValue(entity)
    if (!value) continue

    counts.set(value, (counts.get(value) || 0) + 1)
  }

  const options = Array.from(counts.entries())
    .map(([label, count]) => ({
      key: label,
      label,
      count
    }))
    .sort((a, b) => {
      const levelA = Number(String(a.label).match(/^Level\s+(\d+)/i)?.[1] ?? Number.NaN)
      const levelB = Number(String(b.label).match(/^Level\s+(\d+)/i)?.[1] ?? Number.NaN)

      if (a.label === 'Cantrip') return -1
      if (b.label === 'Cantrip') return 1
      if (Number.isFinite(levelA) && Number.isFinite(levelB)) return levelA - levelB

      return a.label.localeCompare(b.label)
    })

  return [
    { key: 'all', label: 'All', count: (entities.value || []).filter(matchesCollectionType).length },
    ...options
  ]
})

watch(
  () => [props.entityType, props.pageKey],
  () => {
    activeCollectionFacet.value = 'all'
  }
)


function summaryForEntity(entity: any) {
  const direct = String(entity?.summary || '').trim()
  if (direct) return direct

  const overview = blockByKey(entity, 'overview')
  const overviewText = String(overview?.data?.text || '').trim()
  if (overviewText) return overviewText

  const itemDescription = String(itemCore(entity)?.description || '').trim()
  if (itemDescription) return itemDescription

  const spellDescription = String(spellCore(entity)?.description || '').trim()
  if (spellDescription) return spellDescription

  const featDescription = String(featCore(entity)?.benefits || featCore(entity)?.description || '').trim()
  if (featDescription) return featDescription

  const speciesDescription = String(speciesCore(entity)?.description || speciesCore(entity)?.traits || buildSpeciesArticleMarkdown(entity) || '').trim()
  if (speciesDescription) return speciesDescription

  const classDescription = String(classCore(entity)?.description || classCore(entity)?.features || buildClassArticleMarkdown(entity) || '').trim()
  if (classDescription) return classDescription

  const backgroundDescription = String(backgroundCore(entity)?.description || '').trim()
  if (backgroundDescription) return backgroundDescription

  return ''
}

function featMetaLines(entity: any) {
  const core = featCore(entity)
  if (!core) return []

  return [
    core.category ? `Category: ${core.category}` : '',
    core.prerequisites ? `Prerequisites: ${core.prerequisites}` : '',
    core.repeatable ? 'Repeatable' : ''
  ].filter(Boolean)
}

function itemMetaLines(entity: any) {
  const core = itemCore(entity)
  if (!core) return []

  return [
    core.item_type ? `Type: ${core.item_type}` : '',
    core.rarity ? `Rarity: ${core.rarity}` : '',
    core.damage ? `Damage: ${core.damage}${core.damage_type ? ` ${core.damage_type}` : ''}` : '',
    core.armor_class ? `AC: ${core.armor_class}` : '',
    core.weight ? `Weight: ${core.weight}` : '',
    core.value ? `Value: ${core.value}` : '',
    core.attunement ? 'Requires Attunement' : ''
  ].filter(Boolean)
}

function spellMetaLines(entity: any) {
  const core = spellCore(entity)
  if (!core) return []

  return [
    core.level !== undefined && core.level !== null ? `Level: ${core.level}` : '',
    core.school ? `School: ${core.school}` : '',
    core.casting_time ? `Casting: ${core.casting_time}` : '',
    core.range ? `Range: ${core.range}` : '',
    core.duration ? `Duration: ${core.duration}` : '',
    core.components ? `Components: ${core.components}` : '',
    core.ritual ? 'Ritual' : '',
    core.concentration ? 'Concentration' : ''
  ].filter(Boolean)
}

function speciesMetaLines(entity: any) {
  const core = speciesCore(entity)
  if (!core) return []

  const size = formatSize(core.size ?? core.size_json ?? core.race_size)
  const speed = formatSpeed(core.speed ?? core.speed_json ?? core.race_speed)

  return [
    size ? `Size: ${size}` : '',
    speed ? `Speed: ${speed}` : ''
  ].filter(Boolean)
}

function classMetaLines(entity: any) {
  const core = classCore(entity)
  if (!core) return []

  const hitDie = core.hit_die ?? core.hitDie ?? core.hd
  const primaryAbility = core.primary_ability ?? core.primaryAbility ?? core.spellcasting_ability

  return [
    hitDie ? `Hit Die: ${formatSimpleValue(hitDie)}` : '',
    primaryAbility ? `Primary Ability: ${formatPrimaryAbility(primaryAbility)}` : ''
  ].filter(Boolean)
}

function backgroundMetaLines(entity: any) {
  const core = backgroundCore(entity)
  if (!core) return []

  return [
    core.feature ? `Feature: ${core.feature}` : ''
  ].filter(Boolean)
}

const filteredEntities = computed(() => {
  const q = search.value.trim().toLowerCase()
  const facet = activeCollectionFacet.value

  return (entities.value || [])
    .filter((entity: any) => matchesCollectionType(entity))
    .filter((entity: any) => facet === 'all' || collectionFacetValue(entity) === facet)
    .filter((entity: any) => !q || collectionSearchHaystack(entity).includes(q))
})

const selectedEntity = computed(() => {
  if (!selectedEntityId.value) return null
  return (entities.value || []).find((entity: any) => String(entity.id) === String(selectedEntityId.value)) || null
})

const selectedSummary = computed(() => {
  const detail = selectedEntityDetail.value
  if (!detail) return ''

  const direct = String(detail?.summary || '').trim()
  if (direct) return direct

  const overviewText = summaryForEntity(detail)
  if (overviewText) return overviewText

  return findFirstDescriptiveText(detail?.blocks?.map((block: any) => block?.data))
})

watch(filteredEntities, (items) => {
  if (!items.length && selectedEntityId.value) {
    selectedEntityId.value = null
    return
  }

  if (selectedEntityId.value) {
    const stillExists = items.some((entity: any) => String(entity.id) === String(selectedEntityId.value))
    if (!stillExists) selectedEntityId.value = null
  }
}, { deep: true })

function selectEntity(entity: any) {
  selectedEntityId.value = String(entity.id)
  deleteError.value = ''
}

function clearSelectedEntity() {
  selectedEntityId.value = null
  deleteError.value = ''
}

async function deleteSelectedEntity() {
  if (!selectedEntity.value || deletingEntity.value) return

  const ok = window.confirm(`Delete "${selectedEntity.value.title}"? This cannot be undone.`)
  if (!ok) return

  deleteError.value = ''
  deletingEntity.value = true

  try {
    await $fetch(`/api/worlds/${worldId.value}/entities/${selectedEntity.value.id}`, {
      method: 'DELETE'
    })

    selectedEntityId.value = null
    await refresh()
  } catch (error: any) {
    deleteError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to delete entity.'
  } finally {
    deletingEntity.value = false
  }
}

function resetNewLocationForm() {
  newLocationForm.title = ''
  newLocationForm.locationType = 'location'
  newLocationForm.population = ''
  newLocationForm.linkedMapId = ''
  newLocationForm.parentLocationId = ''
  newLocationForm.summary = ''
  newLocationError.value = ''
}

async function createLocationArticle() {
  if (!isLocationPage.value || creatingLocation.value) return

  const title = String(newLocationForm.title || '').trim()
  if (!title) {
    newLocationError.value = 'Location title is required.'
    return
  }

  creatingLocation.value = true
  newLocationError.value = ''

  try {
    const created: any = await $fetch(`/api/worlds/${worldId.value}/locations`, {
      method: 'POST',
      body: {
        title,
        locationType: newLocationForm.locationType || 'location',
        population: newLocationForm.population || null,
        linkedMapId: newLocationForm.linkedMapId || null,
        parentLocationId: newLocationForm.parentLocationId || null,
        summary: String(newLocationForm.summary || '').trim() || null
      }
    })

    await refresh()
    resetNewLocationForm()
    showNewLocationForm.value = false

    if (created?.id) {
      await router.push(`/worlds/${worldId.value}/entities/${created.id}`)
    }
  } catch (error: any) {
    newLocationError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to create location.'
  } finally {
    creatingLocation.value = false
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div :class="collectionShellClass">
      <div :class="selectedEntity || mode === 'build' ? 'pr-[380px]' : ''" class="transition-all duration-200">
        <section class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes rounded-none border p-6 backdrop-blur-xl">
          <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">{{ eyebrow || title }}</div>
              <h1 class="mt-2 text-3xl font-semibold text-white">{{ world?.name || title }}</h1>
              <p class="mt-2 max-w-3xl text-sm text-[#d8ceb8]">
                {{ description || `Browse imported ${title.toLowerCase()} for this world.` }}
              </p>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-4 py-2.5 text-sm text-slate-200 transition hover:bg-white/[0.08]"
              @click="refresh()"
            >
              Refresh
            </button>
          </div>

          <div class="mt-5">
            <input
              v-model="search"
              type="text"
              :placeholder="searchPlaceholder || `Search ${title.toLowerCase()}...`"
              class="w-full rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-4 py-3 text-sm text-white placeholder-slate-400 outline-none transition focus:border-sky-400/30 focus:bg-white/[0.06]"
            >
          </div>

          <div
            data-collection-view-toggle
            class="mt-4 flex flex-wrap items-center justify-between gap-3"
          >
            <div class="text-xs uppercase tracking-[0.24em] text-[#9f9278]">
              Results
              <span class="text-[#d8ceb8]">({{ filteredEntities.length }})</span>
            </div>

            <div class="inline-flex overflow-hidden rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(8,17,27,0.42)]">
              <button
                v-for="option in collectionViewOptions"
                :key="option.key"
                type="button"
                class="inline-flex items-center gap-2 border-r border-[rgba(201,164,90,0.14)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] last:border-r-0 transition"
                :class="collectionView === option.key
                  ? 'bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
                  : 'text-[#b5a88d] hover:bg-[rgba(201,164,90,0.08)] hover:text-[#fff7df]'"
                @click="collectionView = option.key"
              >
                <UIcon :name="option.icon" class="h-4 w-4" />
                <span>{{ option.label }}</span>
              </button>
            </div>
          </div>


          <div
            v-if="collectionFacetOptions.length > 2"
            data-collection-facet-chips
            class="mt-4 flex flex-wrap gap-2"
          >
            <button
              v-for="facet in collectionFacetOptions"
              :key="facet.key"
              type="button"
              class="rounded-none border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition"
              :class="activeCollectionFacet === facet.key
                ? 'border-[rgba(201,164,90,0.62)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
                : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.42)] text-[#b5a88d] hover:border-[rgba(201,164,90,0.36)] hover:text-[#fff7df]'"
              @click="activeCollectionFacet = facet.key"
            >
              <span>{{ facet.label }}</span>
              <span class="ml-1 opacity-70">{{ facet.count }}</span>
            </button>
          </div>

        </section>

        <section
          v-if="pending"
          class="mt-6 eldra-panel rounded-none p-6 text-[#d8ceb8] shadow-xl"
        >
          Loading {{ title.toLowerCase() }}...
        </section>

        <section
          v-else-if="!filteredEntities.length"
          class="mt-6 eldra-empty rounded-none p-10 text-center shadow-xl"
        >
          <div class="text-lg font-medium text-white">No {{ title.toLowerCase() }} found</div>
          <p class="mt-2 text-sm text-[#d8ceb8]">
            {{ emptyMessage || `Import ${title.toLowerCase()} from the Importer page, then come back here to browse them.` }}
          </p>
        </section>

        <section
          v-else
          :class="collectionResultsClass"
        >
          <div
            v-for="entity in filteredEntities"
            :key="entity.id"
            class="eldra-ornate-card eldra-frame-corners eldra-frame-medallion eldra-corner-runes eldra-card-glyph group cursor-pointer overflow-hidden rounded-none border backdrop-blur-xl transition hover:border-[rgba(201,164,90,0.62)]"
            :class="selectedEntityId === String(entity.id)
              ? 'eldra-selected-glow scale-[1.025]'
              : 'opacity-95'"
            @click="selectEntity(entity)"
          >
            <div class="eldra-collection-card-body grid min-h-[280px] grid-cols-[minmax(128px,160px)_minmax(0,1fr)]">
              <div class="eldra-card-image-well eldra-image-frame border-r border-[rgba(201,164,90,0.22)] bg-black/20">
                <img
                  v-if="imageUrlForEntity(entity)"
                  :src="imageUrlForEntity(entity)"
                  :alt="entity.title"
                  class="eldra-card-image-fill h-full w-full object-cover object-[center_18%]"
                >
                <div
                  v-else
                  class="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900/90 to-slate-800/80 text-2xl font-semibold text-slate-200"
                >
                  {{ initialsFor(entity.title) }}
                </div>
              </div>

              <div class="flex min-w-0 flex-col p-5">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="truncate text-[1.55rem] font-semibold leading-tight text-white">
                      {{ entity.title }}
                    </div>
                  </div>

                  <span class="eldra-gold-chip eldra-rune-label shrink-0 rounded-none border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]">
                    {{ entityType }}
                  </span>
                </div>

                <div class="mt-4 space-y-1 text-sm text-slate-200">
                  <template v-if="entityType === 'item'">
                    <div v-for="line in itemMetaLines(entity).slice(0, 3)" :key="line">{{ line }}</div>
                  </template>

                  <template v-else-if="entityType === 'spell'">
                    <div v-for="line in spellMetaLines(entity).slice(0, 4)" :key="line">{{ line }}</div>
                  </template>

                  <template v-else-if="entityType === 'species'">
                    <div v-for="line in speciesMetaLines(entity).slice(0, 3)" :key="line">{{ line }}</div>
                  </template>

                  <template v-else-if="entityType === 'class'">
                    <div v-for="line in classMetaLines(entity).slice(0, 3)" :key="line">{{ line }}</div>
                  </template>

                  <template v-else-if="entityType === 'background'">
                    <div v-for="line in backgroundMetaLines(entity).slice(0, 2)" :key="line">{{ line }}</div>
                  </template>

                  <template v-else>
                                        <div
                      v-if="collectionMetaLines(entity).length"
                      data-collection-smart-meta
                      class="mt-3 flex flex-wrap gap-1.5"
                    >
                      <span
                        v-for="line in collectionMetaLines(entity).slice(0, collectionView === 'list' ? 5 : 3)"
                        :key="line"
                        class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#d8ceb8]"
                      >
                        {{ line }}
                      </span>
                    </div>

<WorldMentionText
                      v-if="summaryForEntity(entity)"
                      :world-id="worldId"
                      :markdown="summaryForEntity(entity)"
                      :interactive="false"
                      class="line-clamp-5 leading-7"
                    />

                    <div v-else class="line-clamp-5 leading-7">
                      Select to preview →
                    </div>
                  </template>
                </div>

                <div class="mt-auto pt-5 text-sm font-medium text-[#f5e7bd] transition group-hover:text-[#fff7df]">
                  Select {{ title.replace(/s$/i, '') }} →
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
      <aside
        v-if="mode === 'build' && !selectedEntity"
        class="eldra-ornate-panel eldra-frame-corners fixed right-0 top-0 z-20 h-full w-[380px] max-w-[calc(100vw-1rem)] border-l backdrop-blur-xl"
      >
        <div class="space-y-5 p-5">
            <div
              v-if="isLocationPage"
              class="eldra-codex-soft rounded-none p-4"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Location Tools</div>
                  <div class="mt-1 text-sm text-[#d8ceb8]">Create a location article manually.</div>
                </div>

                <button
                  type="button"
                  class="eldra-button rounded-none px-3 py-2 text-sm"
                  @click="showNewLocationForm = !showNewLocationForm"
                >
                  {{ showNewLocationForm ? 'Close' : 'New Location' }}
                </button>
              </div>

              <form
                v-if="showNewLocationForm"
                class="mt-4 space-y-3"
                @submit.prevent="createLocationArticle"
              >
                <label class="block">
                  <span class="mb-1 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Title</span>
                  <input
                    v-model="newLocationForm.title"
                    class="eldra-input w-full rounded-none px-3 py-2 text-sm"
                    placeholder="e.g. Old Market District"
                  >
                </label>

                <label class="block">
                  <span class="mb-1 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Type</span>
                  <select
                    v-model="newLocationForm.locationType"
                    class="eldra-input w-full rounded-none px-3 py-2 text-sm text-[#f5e7bd]"
                  >
                    <option
                      v-for="option in LOCATION_TYPE_OPTIONS"
                      :key="option.value"
                      :value="option.value"
                      class="bg-[#090909] text-[#f5e7bd]"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </label>

                <label class="block">
                  <span class="mb-1 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Population</span>
                  <input
                    v-model="newLocationForm.population"
                    inputmode="numeric"
                    class="eldra-input w-full rounded-none px-3 py-2 text-sm"
                    placeholder="e.g. 1,234"
                  >
                </label>

                <label class="block">
                  <span class="mb-1 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Linked Map</span>
                  <select
                    v-model="newLocationForm.linkedMapId"
                    class="eldra-input w-full rounded-none px-3 py-2 text-sm text-[#f5e7bd]"
                  >
                    <option value="" class="bg-[#090909] text-[#f5e7bd]">No linked map</option>
                    <option
                      v-for="map in mapOptions"
                      :key="map.id"
                      :value="map.id"
                      class="bg-[#090909] text-[#f5e7bd]"
                    >
                      {{ map.title }}
                    </option>
                  </select>
                </label>

                <label class="block">
                  <span class="mb-1 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Parent Location</span>
                  <select
                    v-model="newLocationForm.parentLocationId"
                    class="eldra-input w-full rounded-none px-3 py-2 text-sm text-[#f5e7bd]"
                  >
                    <option value="" class="bg-[#090909] text-[#f5e7bd]">No parent location</option>
                    <option
                      v-for="location in parentLocationOptions"
                      :key="location.id"
                      :value="location.id"
                      class="bg-[#090909] text-[#f5e7bd]"
                    >
                      {{ location.title }}
                    </option>
                  </select>
                </label>

                <label class="block">
                  <span class="mb-1 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Summary Blurb</span>
                  <textarea
                    v-model="newLocationForm.summary"
                    rows="4"
                    class="eldra-input w-full resize-y rounded-none px-3 py-2 text-sm leading-6"
                    placeholder="Short public-facing summary..."
                  ></textarea>
                </label>

                <div v-if="newLocationError" class="text-sm text-red-300">
                  {{ newLocationError }}
                </div>

                <button
                  type="submit"
                  class="eldra-button w-full rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
                  :disabled="creatingLocation"
                >
                  {{ creatingLocation ? 'Creating...' : 'Create Location' }}
                </button>
              </form>
            </div>
          <WorldPagePresentationPanel
            :world-id="worldId"
            :page-key="pageKey"
            :title="title"
            description="Build-mode page controls live here when nothing is selected. Later this becomes DM/Admin-gated instead of build-mode-only."
          />
        </div>
      </aside>
    </Transition>

    <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
      <aside
        v-if="selectedEntity"
        class="eldra-ornate-panel eldra-frame-corners fixed right-0 top-0 z-30 h-full w-[380px] max-w-[calc(100vw-1rem)] border-l backdrop-blur-xl"
      >
        <div class="flex h-full flex-col">
          <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-5">
            <div class="min-w-0">
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Summary</div>
              <h2 class="mt-3 truncate text-2xl font-semibold text-white">{{ selectedEntity.title }}</h2>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-2 text-[#b5a88d] transition hover:bg-white/[0.08] hover:text-white"
              @click="clearSelectedEntity"
            >
              <UIcon name="i-lucide-x" class="h-4 w-4" />
            </button>
          </div>

          <div class="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <div v-if="selectedPending" class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4 text-sm text-[#d8ceb8]">
              Loading summary...
            </div>

            <template v-else>
              <div
                v-if="imageUrlForEntity(selectedEntityDetail || selectedEntity)"
                class="eldra-image-frame overflow-hidden rounded-none border bg-black/20"
              >
                <img
                  :src="imageUrlForEntity(selectedEntityDetail || selectedEntity)"
                  :alt="selectedEntity.title"
                  class="h-64 w-full object-cover object-[center_12%]"
                >
              </div>

              <div
                v-else
                class="flex h-64 items-center justify-center rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] text-4xl font-semibold text-[#d8ceb8]"
              >
                {{ initialsFor(selectedEntity.title) }}
              </div>

              <div class="eldra-corner-runes rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
                <div class="grid grid-cols-1 gap-3 text-sm">
                  <div><span class="text-[#b5a88d]">Title:</span> <span class="text-white">{{ selectedEntity.title }}</span></div>
                  <div><span class="text-[#b5a88d]">Type:</span> <span class="text-white">{{ entityType }}</span></div>
                  <div><span class="text-[#b5a88d]">Slug:</span> <span class="text-white">{{ selectedEntity.slug || '—' }}</span></div>
                </div>
              </div>

              <div
                v-if="entityType === 'item' && itemCore(selectedEntityDetail || selectedEntity)"
                class="eldra-corner-runes rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4 text-sm leading-7 text-slate-200"
              >
                <div class="mb-2 text-xs uppercase tracking-[0.25em] text-[#9f9278]">Item Details</div>
                <div v-for="line in itemMetaLines(selectedEntityDetail || selectedEntity)" :key="line">{{ line }}</div>
              </div>

              <div
                v-if="entityType === 'spell' && spellCore(selectedEntityDetail || selectedEntity)"
                class="eldra-corner-runes rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4 text-sm leading-7 text-slate-200"
              >
                <div class="mb-2 text-xs uppercase tracking-[0.25em] text-[#9f9278]">Spell Details</div>
                <div v-for="line in spellMetaLines(selectedEntityDetail || selectedEntity)" :key="line">{{ line }}</div>
              </div>

              <div
                v-if="entityType === 'species' && speciesCore(selectedEntityDetail || selectedEntity)"
                class="eldra-corner-runes rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4 text-sm leading-7 text-slate-200"
              >
                <div class="mb-2 text-xs uppercase tracking-[0.25em] text-[#9f9278]">Species Details</div>
                <div v-for="line in speciesMetaLines(selectedEntityDetail || selectedEntity)" :key="line">{{ line }}</div>
              </div>

              <div
                v-if="entityType === 'class' && classCore(selectedEntityDetail || selectedEntity)"
                class="eldra-corner-runes rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4 text-sm leading-7 text-slate-200"
              >
                <div class="mb-2 text-xs uppercase tracking-[0.25em] text-[#9f9278]">Class Details</div>
                <div v-for="line in classMetaLines(selectedEntityDetail || selectedEntity)" :key="line">{{ line }}</div>
              </div>

              <div
                v-if="entityType === 'background' && backgroundCore(selectedEntityDetail || selectedEntity)"
                class="eldra-corner-runes rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4 text-sm leading-7 text-slate-200"
              >
                <div class="mb-2 text-xs uppercase tracking-[0.25em] text-[#9f9278]">Background Details</div>
                <div v-for="line in backgroundMetaLines(selectedEntityDetail || selectedEntity)" :key="line">{{ line }}</div>
              </div>

              <div
                v-if="selectedSummary"
                class="eldra-corner-runes rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4 text-sm leading-7 text-slate-200"
              >
                <div class="mb-2 text-xs uppercase tracking-[0.25em] text-[#9f9278]">Summary</div>
                <div
                  class="markdown-content eldra-rich-content text-[15px] leading-7 text-slate-200"
                  v-html="renderMarkdown(selectedSummary)"
                ></div>
              </div>
            </template>
          </div>

          <div class="border-t border-[rgba(201,164,90,0.22)] p-5 space-y-3">
            <button
              v-if="mode === 'build'"
              type="button"
              class="block w-full rounded-none border border-red-400/20 bg-red-400/10 px-4 py-3 text-center text-sm font-medium text-red-100 transition hover:bg-red-400/20 disabled:opacity-50"
              :disabled="deletingEntity"
              @click="deleteSelectedEntity"
            >
              {{ deletingEntity ? 'Deleting…' : 'Delete Entity' }}
            </button>

            <div v-if="deleteError" class="text-sm text-red-300">
              {{ deleteError }}
            </div>

            <NuxtLink
              :to="`/worlds/${worldId}/entities/${selectedEntity.id}`"
              class="eldra-button block rounded-none px-4 py-3 text-center text-sm font-medium"
            >
              Open Article
            </NuxtLink>
          </div>
        </div>
      </aside>
    </Transition>
  </div>
</template>

<style scoped>
:deep(.markdown-content) {
  color: rgb(226 232 240);
  font-size: 15px;
  line-height: 1.9;
}

:deep(.markdown-content > :first-child) {
  margin-top: 0 !important;
}

:deep(.markdown-content > :last-child) {
  margin-bottom: 0 !important;
}

:deep(.markdown-content h1) {
  margin: 0 0 0.9rem 0;
  font-size: 1.55rem;
  line-height: 1.2;
  font-weight: 700;
  color: white;
}

:deep(.markdown-content h2) {
  margin: 1.25rem 0 0.75rem 0;
  font-size: 1.25rem;
  line-height: 1.25;
  font-weight: 700;
  color: white;
}

:deep(.markdown-content h3) {
  margin: 1rem 0 0.55rem 0;
  font-size: 1.05rem;
  line-height: 1.3;
  font-weight: 600;
  color: white;
}

:deep(.markdown-content p) {
  margin: 0.85rem 0;
}

:deep(.markdown-content strong) {
  color: white;
  font-weight: 700;
}

:deep(.markdown-content em) {
  color: rgb(241 245 249);
  font-style: italic;
}

:deep(.markdown-content ul),
:deep(.markdown-content ol) {
  margin: 1rem 0;
  padding-left: 1.35rem;
}

:deep(.markdown-content li) {
  margin: 0.35rem 0;
}

:deep(.markdown-content blockquote) {
  margin: 1rem 0;
  padding: 0.9rem 1rem;
  border-left: 4px solid rgba(56, 189, 248, 0.35);
  background: rgba(255,255,255,0.04);
  border-radius: 0.85rem;
  color: rgb(226 232 240);
  font-style: italic;
}

:deep(.markdown-content hr) {
  margin: 1.25rem 0;
  border: 0;
  border-top: 1px solid rgba(255,255,255,0.08);
}

:deep(.markdown-content table) {
  width: 100%;
  margin: 1rem 0;
  border-collapse: collapse;
  overflow: hidden;
  border-radius: 0.85rem;
}

:deep(.markdown-content th) {
  padding: 0.65rem 0.75rem;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.05);
  color: white;
  text-align: left;
  font-weight: 600;
}

:deep(.markdown-content td) {
  padding: 0.65rem 0.75rem;
  border: 1px solid rgba(255,255,255,0.08);
  color: rgb(203 213 225);
}

:deep(.markdown-content code) {
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  border-radius: 0.4rem;
  padding: 0.15rem 0.35rem;
  font-size: 0.9em;
}

:deep(.markdown-content pre) {
  overflow-x: auto;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  border-radius: 1rem;
  padding: 0.9rem 1rem;
}

:deep(.markdown-content pre code) {
  border: 0;
  background: transparent;
  padding: 0;
}

.eldra-collection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
  gap: 1rem;
  align-items: stretch;
}

.eldra-collection-card {
  width: 100%;
}

@media (min-width: 1536px) {
  .eldra-collection-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr));
  }
}

@media (max-width: 640px) {
  .eldra-collection-grid {
    grid-template-columns: 1fr;
  }

  .eldra-collection-card {
    grid-template-columns: 112px minmax(0, 1fr);
    min-height: 200px;
  }
}

.eldra-collection-results.eldra-collection-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
  align-items: stretch;
}

.eldra-collection-results.eldra-collection-list :deep(.eldra-ornate-card) {
  width: 100%;
}

.eldra-collection-results.eldra-collection-list :deep(.eldra-collection-card-body) {
  min-height: 150px;
  grid-template-columns: 96px minmax(0, 1fr);
}

.eldra-collection-results.eldra-collection-list :deep(.eldra-collection-card-body > .flex),
.eldra-collection-results.eldra-collection-list :deep(.eldra-collection-card-body > div:last-child) {
  padding: 1rem;
}

.eldra-collection-results.eldra-collection-list :deep(.line-clamp-5) {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.eldra-collection-results.eldra-collection-list :deep(.mt-6.text-sm),
.eldra-collection-results.eldra-collection-list :deep(.mt-6) {
  margin-top: 0.75rem;
}

@media (max-width: 640px) {
  .eldra-collection-results.eldra-collection-list :deep(.eldra-collection-card-body) {
    grid-template-columns: 88px minmax(0, 1fr);
    min-height: 140px;
  }
}


.eldra-collection-results.eldra-collection-list :deep([data-collection-smart-meta]) {
  margin-top: 0.65rem;
}

.eldra-collection-results.eldra-collection-list :deep([data-collection-smart-meta] span) {
  font-size: 0.625rem;
  padding: 0.2rem 0.45rem;
}

.eldra-collection-results.eldra-collection-list :deep(.line-clamp-5),
.eldra-collection-results.eldra-collection-list :deep(.leading-7) {
  line-height: 1.55rem;
}

.eldra-collection-results.eldra-collection-list :deep(.text-\[1\.55rem\]),
.eldra-collection-results.eldra-collection-list :deep(.text-2xl) {
  font-size: 1.25rem;
  line-height: 1.75rem;
}

</style>
