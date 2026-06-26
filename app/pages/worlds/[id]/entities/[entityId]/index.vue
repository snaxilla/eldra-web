<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

import { renderMarkdown } from '~/utils/renderMarkdown'
import WorldMentionText from '~/components/world/WorldMentionText.vue'
import WorldMentionAutocompleteTextarea from '~/components/world/WorldMentionAutocompleteTextarea.vue'
import WorldEntityContextDrawer from '~/components/world/WorldEntityContextDrawer.vue'

const route = useRoute()

const worldId = computed(() => String(route.params.id || ''))
const entityId = computed(() => String(route.params.entityId || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const uploadingImage = ref(false)
const imageError = ref('')
const imageSuccess = ref('')

const articleDraft = ref('')

function richTextPlain(value: any) {
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
const articleSaving = ref(false)
const articleSaveError = ref('')
const articleSaveSuccess = ref('')

const ARTICLE_THEME_OPTIONS = [
  {
    value: 'codex',
    label: 'Codex',
    description: 'Dark Eldra codex panel.'
  },
  {
    value: 'parchment',
    label: 'Archive',
    description: 'Warm vellum page inside an Eldra frame.'
  },
  {
    value: 'statblock',
    label: 'Rulesheet',
    description: 'Muted rules-reference page inside an Eldra frame.'
  }
]

const articleThemeDraft = ref('codex')
const articleSidebarEnabledDraft = ref(false)
const articleSidebarItemsDraft = ref<any[]>([])

const ARTICLE_SIDEBAR_TYPE_OPTIONS = [
  { label: 'People', value: 'people' },
  { label: 'Places', value: 'places' },
  { label: 'Secrets', value: 'secrets' },
  { label: 'Notes', value: 'notes' },
  { label: 'Custom', value: 'custom' }
]

const ARTICLE_SIDEBAR_VISIBILITY_OPTIONS = [
  {
    label: 'Players',
    value: 'public',
    description: 'Visible in Play mode.'
  },
  {
    label: 'GM Only',
    value: 'gm',
    description: 'Stored now, hidden from Play mode until GM permissions are wired.'
  },
  {
    label: 'Hidden Draft',
    value: 'hidden',
    description: 'Hidden from Play mode.'
  }
]

function normalizedArticleSidebarVisibility(value: any) {
  const key = String(value || '').trim().toLowerCase()
  return ARTICLE_SIDEBAR_VISIBILITY_OPTIONS.some((option) => option.value === key) ? key : 'public'
}

function articleSidebarVisibilityLabel(value: any) {
  const key = normalizedArticleSidebarVisibility(value)
  return ARTICLE_SIDEBAR_VISIBILITY_OPTIONS.find((option) => option.value === key)?.label || 'Players'
}

function isArticleSidebarItemVisible(item: any) {
  if (mode.value === 'build') return true

  return normalizedArticleSidebarVisibility(item?.visibility) === 'public'
}

function makeArticleSidebarItem(type = 'notes') {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title: '',
    body: '',
    visibility: type === 'secrets' ? 'gm' : 'public'
  }
}

function normalizeArticleSidebarItems(value: any) {
  const list = Array.isArray(value) ? value : []

  return list
    .map((item: any) => ({
      id: String(item?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      type: ARTICLE_SIDEBAR_TYPE_OPTIONS.some((option) => option.value === item?.type) ? item.type : 'notes',
      title: String(item?.title || '').trim(),
      body: String(item?.body || '').trim(),
      visibility: normalizedArticleSidebarVisibility(item?.visibility)
    }))
    .filter((item: any) => item.title || item.body)
}

function addArticleSidebarItem(type = 'notes') {
  articleSidebarEnabledDraft.value = true
  articleSidebarItemsDraft.value.push(makeArticleSidebarItem(type))
}

function removeArticleSidebarItem(index: number) {
  articleSidebarItemsDraft.value.splice(index, 1)
}

function articleSidebarTypeLabel(value: any) {
  const key = String(value || '')
  return ARTICLE_SIDEBAR_TYPE_OPTIONS.find((option) => option.value === key)?.label || 'Notes'
}

function normalizedArticleTheme(value: any) {
  const key = String(value || '').trim().toLowerCase()
  return ARTICLE_THEME_OPTIONS.some((option) => option.value === key) ? key : 'codex'
}

const metaTitle = ref('')
const metaSlug = ref('')
const metaSummary = ref('')
const metaSaving = ref(false)
const metaSaveError = ref('')
const metaSaveSuccess = ref('')

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

const locationTypeDraft = ref('location')
const locationPopulationDraft = ref('')
const locationLinkedMapIdDraft = ref('')
const locationParentLocationIdDraft = ref('')

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)

const { data: entity, refresh: refreshEntity } = await useAsyncData(
  `entity-${worldId.value}-${entityId.value}`,
  () => $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}`),
  {
    watch: [worldId, entityId]
  }
)

const classFeaturesUrl = computed(() => {
  if (entity.value?.entity_type !== 'class') return null
  return `/api/worlds/${worldId.value}/entities/${entityId.value}/class-features`
})

const { data: hydratedClassFeatures } = await useFetch(classFeaturesUrl, {
  default: () => null,
  watch: [classFeaturesUrl]
})

const { data: worldMaps } = await useFetch(() => `/api/worlds/${worldId.value}/maps`, {
  default: () => [],
  watch: [worldId]
})

const { data: worldEntities } = await useFetch(() => `/api/worlds/${worldId.value}/entities`, {
  default: () => [],
  watch: [worldId]
})

const isLocationEntity = computed(() => String(entity.value?.entity_type || '').toLowerCase() === 'location')

const mapOptions = computed(() => {
  return (Array.isArray(worldMaps.value) ? worldMaps.value : [])
    .map((map: any) => ({
      id: String(map?.id || ''),
      title: String(map?.title || 'Untitled Map')
    }))
    .filter((map: any) => map.id)
    .sort((a: any, b: any) => a.title.localeCompare(b.title))
})

const locationOptions = computed(() => {
  return (Array.isArray(worldEntities.value) ? worldEntities.value : [])
    .filter((option: any) => String(option?.entity_type || '').toLowerCase() === 'location')
    .filter((option: any) => String(option?.id || '') !== String(entityId.value || ''))
    .map((option: any) => ({
      id: String(option?.id || ''),
      title: String(option?.title || 'Untitled Location')
    }))
    .filter((option: any) => option.id)
    .sort((a: any, b: any) => a.title.localeCompare(b.title))
})

function optionTitleById(options: any[], id: any) {
  const needle = String(id || '')
  if (!needle) return ''
  return options.find((option: any) => String(option.id) === needle)?.title || needle
}

function mapTitleById(id: any) {
  return optionTitleById(mapOptions.value, id)
}

function locationTitleById(id: any) {
  return optionTitleById(locationOptions.value, id)
}

function blockByKey(key: string) {
  return entity.value?.blocks?.find?.((block: any) => {
    const blockKey = String(block?.block_key || block?.blockKey || '')
    return blockKey === key
  }) || null
}

const itemCore = computed(() => blockByKey('item_core')?.data || null)
const featCore = computed(() => blockByKey('feat_core')?.data || null)
const spellCore = computed(() => blockByKey('spell_core')?.data || null)
const speciesCore = computed(() => blockByKey('species_core')?.data || null)
const classCore = computed(() => blockByKey('class_core')?.data || null)
const backgroundCore = computed(() => blockByKey('background_core')?.data || null)
const locationCore = computed(() => blockByKey('location_core')?.data || null)
const characterCore = computed(() => blockByKey('character_core')?.data || null)

function blockDataByKey(key: string) {
  return blockByKey(key)?.data || null
}

function importSourceRawJson() {
  const data = blockDataByKey('import_source')
  return data?.raw_json || data?.rawJson || null
}

function clean5eText(value: any): string {
  return String(value || '')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat|classFeature|subclassFeature)\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/g, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function entriesToMarkdown(value: any): string {
  if (!value) return ''

  if (typeof value === 'string') return clean5eText(value)

  if (Array.isArray(value)) {
    return value.map(entriesToMarkdown).filter(Boolean).join('\n\n')
  }

  if (typeof value === 'object') {
    const parts: string[] = []

    if (value.name) parts.push(`## ${clean5eText(value.name)}`)
    if (value.entry) parts.push(clean5eText(value.entry))
    if (value.entries) parts.push(entriesToMarkdown(value.entries))
    if (value.items) parts.push(entriesToMarkdown(value.items))

    return parts.filter(Boolean).join('\n\n')
  }

  return ''
}

function choiceList(value: any): string {
  if (!value) return ''

  if (typeof value === 'string') return clean5eText(value)

  if (Array.isArray(value)) {
    return value.map(choiceList).filter(Boolean).join(', ')
  }

  if (typeof value === 'object') {
    if (Array.isArray(value.from)) return value.from.map(clean5eText).join(', ')
    if (value.choose) return choiceList(value.choose)
    return Object.values(value).map(choiceList).filter(Boolean).join(', ')
  }

  return String(value)
}

function classFeatureName(value: any): string {
  if (!value) return ''

  if (typeof value === 'string') {
    const parts = value.split('|')
    const name = parts[0] || value
    const level = parts[3]
    return level ? `Level ${level}: ${name}` : name
  }

  if (typeof value === 'object') {
    return classFeatureName(value.classFeature || value.name || '')
  }

  return String(value)
}

function buildClassArticleMarkdown(): string {
  const raw = importSourceRawJson()
  if (!raw) return ''

  const parts: string[] = []

  const intro = entriesToMarkdown(raw.entries)
  if (intro) parts.push(intro)

  const profs: string[] = []

  if (raw.proficiency) {
    profs.push(`**Saving Throws:** ${choiceList(raw.proficiency).toUpperCase()}`)
  }

  if (raw.startingProficiencies) {
    const armor = choiceList(raw.startingProficiencies.armor)
    const weapons = choiceList(raw.startingProficiencies.weapons)
    const tools = choiceList(raw.startingProficiencies.tools)
    const skills = choiceList(raw.startingProficiencies.skills)

    if (armor) profs.push(`**Armor Training:** ${armor}`)
    if (weapons) profs.push(`**Weapon Proficiencies:** ${weapons}`)
    if (tools) profs.push(`**Tool Proficiencies:** ${tools}`)
    if (skills) profs.push(`**Skill Proficiencies:** ${skills}`)
  }

  if (profs.length) {
    parts.push(`## Proficiencies\n\n${profs.join('\n\n')}`)
  }

  if (raw.startingEquipment?.entries?.length) {
    parts.push(`## Starting Equipment\n\n${entriesToMarkdown(raw.startingEquipment.entries)}`)
  }

  if (Array.isArray(raw.classFeatures) && raw.classFeatures.length) {
    const features = raw.classFeatures
      .map(classFeatureName)
      .filter(Boolean)
      .map((line: string) => `- ${clean5eText(line)}`)
      .join('\n')

    if (features) parts.push(`## Class Features\n\n${features}`)
  }

  return parts.filter(Boolean).join('\n\n')
}

function buildSpeciesArticleMarkdown(): string {
  const core = speciesCore.value

  const lore = String(entity.value?.raceFluffMarkdown || '').trim()
  const description = String(core?.description || '').trim()
  const traits = String(core?.traits || '').trim()

  const parts = [
    lore,
    description && description !== lore ? description : '',
    traits
  ].filter(Boolean)

  return parts.join('\n\n')
}


function buildSpellArticleMarkdown(): string {
  const core = spellCore.value
  const raw = importSourceRawJson()

  const parts: string[] = []

  const description = String(core?.description || '').trim()
  const rawEntries = entriesToMarkdown(raw?.entries)
  const higherLevel = entriesToMarkdown(raw?.entriesHigherLevel)

  if (description) {
    parts.push(description)
  } else if (rawEntries) {
    parts.push(rawEntries)
  }

  if (higherLevel) {
    parts.push(`## At Higher Levels\n\n${higherLevel.replace(/^## At Higher Levels\s*/i, '').trim()}`)
  }

  return parts.filter(Boolean).join('\n\n')
}

function buildFeatArticleMarkdown(): string {
  const core = featCore.value
  const raw = importSourceRawJson()

  const benefits = String(core?.benefits || '').trim()
  const rawEntries = entriesToMarkdown(raw?.entries)

  return benefits || rawEntries || ''
}


const entityImageUrl = computed(() => {
  if (entity.value?.imageUrl) return entity.value.imageUrl
  if (entity.value?.image_url) return entity.value.image_url
  if (entity.value?.image) return `/api/assets/${entity.value.image}`
  if (entity.value?.entity_type === 'class' && hydratedClassFeatures.value?.imageUrl) return hydratedClassFeatures.value.imageUrl
  return ''
})

const imageLightboxOpen = ref(false)

function openImageLightbox() {
  if (!entityImageUrl.value) return
  imageLightboxOpen.value = true
}

function closeImageLightbox() {
  imageLightboxOpen.value = false
}

watch(
  () => entity.value,
  () => {
    metaTitle.value = String(entity.value?.title || '')
    metaSlug.value = String(entity.value?.slug || '')
    metaSummary.value = String(entity.value?.summary || '')

      const core = locationCore.value || {}
      locationTypeDraft.value = String(core.locationType ?? core.location_type ?? core.type ?? 'location')
      locationPopulationDraft.value = core.population !== undefined && core.population !== null ? String(core.population) : ''
      locationLinkedMapIdDraft.value = String(core.linkedMapId ?? core.linked_map_id ?? '')
      locationParentLocationIdDraft.value = String(core.parentLocationId ?? core.parent_location_id ?? '')
    metaSaveError.value = ''
    metaSaveSuccess.value = ''
  },
  { immediate: true }
)

async function saveEntityMetadata() {
  if (!entity.value || metaSaving.value) return

  metaSaving.value = true
  metaSaveError.value = ''
  metaSaveSuccess.value = ''

  try {
    await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}`, {
      method: 'PATCH',
      body: {
        title: metaTitle.value,
        slug: metaSlug.value,
        summary: metaSummary.value
      }
    })


      if (isLocationEntity.value) {
        const populationRaw = String(locationPopulationDraft.value || '').replace(/,/g, '').trim()
        let populationValue: number | null = null

        if (populationRaw) {
          const parsed = Number(populationRaw)
          if (!Number.isFinite(parsed)) {
            throw new Error('Population must be a number.')
          }
          populationValue = Math.max(0, Math.floor(parsed))
        }

        await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/blocks/location_core`, {
          method: 'PUT',
          body: {
            data: {
              locationType: locationTypeDraft.value || null,
              population: populationValue,
              linkedMapId: locationLinkedMapIdDraft.value || null,
              parentLocationId: locationParentLocationIdDraft.value || null
            }
          }
        })
      }
    await refreshEntity()
    metaSaveSuccess.value = 'Header saved.'
  } catch (error: any) {
    metaSaveError.value = error?.data?.statusMessage || error?.message || 'Could not save header.'
  } finally {
    metaSaving.value = false
  }
}


const articleOverrideBlock = computed(() => blockByKey('article_override'))
const articleOverrideMarkdown = computed(() =>
  String(articleOverrideBlock.value?.data?.markdown || '').trim()
)
const articleOverrideTheme = computed(() =>
  normalizedArticleTheme(articleOverrideBlock.value?.data?.theme)
)
const articleOverrideSidebarEnabled = computed(() =>
  Boolean(articleOverrideBlock.value?.data?.sidebarEnabled)
)
const articleOverrideSidebarItems = computed(() =>
  normalizeArticleSidebarItems(articleOverrideBlock.value?.data?.sidebarItems)
)
const activeArticleSidebarEnabled = computed(() =>
  mode.value === 'build' ? articleSidebarEnabledDraft.value : articleOverrideSidebarEnabled.value
)
const activeArticleSidebarItems = computed(() =>
  mode.value === 'build' ? normalizeArticleSidebarItems(articleSidebarItemsDraft.value) : articleOverrideSidebarItems.value
)
const visibleArticleSidebarItems = computed(() =>
  activeArticleSidebarEnabled.value
    ? activeArticleSidebarItems.value.filter((item: any) => (item.title || item.body) && isArticleSidebarItemVisible(item))
    : []
)
const selectedArticleTheme = computed(() =>
  mode.value === 'build' ? normalizedArticleTheme(articleThemeDraft.value) : articleOverrideTheme.value
)
const displayArticleTheme = computed(() =>
  mode.value === 'build' ? 'codex' : selectedArticleTheme.value
)
const activeArticleThemeLabel = computed(() =>
  ARTICLE_THEME_OPTIONS.find((option) => option.value === selectedArticleTheme.value)?.label || 'Codex'
)
const articleSectionClass = computed(() => [
  'article-theme-shell',
  `article-theme-shell-${displayArticleTheme.value}`
])
const articleContentClass = computed(() => [
  'article-theme-content',
  `article-theme-content-${displayArticleTheme.value}`
])

const generatedArticleMarkdown = computed(() => {
  if (!entity.value) return ''

  return (
    entity.value?.monsterProfile?.fluff_markdown ||
    entity.value?.fluff_markdown ||
    entity.value?.summary_markdown ||
    itemCore.value?.description ||
    featCore.value?.benefits ||
    buildFeatArticleMarkdown() ||
    buildSpellArticleMarkdown() ||
    buildSpeciesArticleMarkdown() ||
    classCore.value?.description ||
    classCore.value?.features ||
    hydratedClassFeatures.value?.markdown ||
    buildClassArticleMarkdown() ||
    backgroundCore.value?.description ||
    entity.value?.blocks?.find?.((block: any) => block?.block_key === 'overview' || block?.blockKey === 'overview')?.data?.text ||
    entity.value?.summary ||
    ''
  )
})

const articleMarkdown = computed(() => articleOverrideMarkdown.value || generatedArticleMarkdown.value || '')

watch(
  () => [
    entityId.value,
    articleOverrideMarkdown.value,
    generatedArticleMarkdown.value,
    articleOverrideTheme.value,
    articleOverrideSidebarEnabled.value,
    JSON.stringify(articleOverrideSidebarItems.value)
  ],
  () => {
    articleDraft.value = articleMarkdown.value || ''
    articleThemeDraft.value = articleOverrideTheme.value
    articleSidebarEnabledDraft.value = articleOverrideSidebarEnabled.value
    articleSidebarItemsDraft.value = articleOverrideSidebarItems.value.length
      ? articleOverrideSidebarItems.value.map((item: any) => ({ ...item }))
      : []
    articleSaveError.value = ''
    articleSaveSuccess.value = ''
  },
  { immediate: true }
)

async function saveArticleOverride() {
  if (!entity.value || articleSaving.value) return

  articleSaving.value = true
  articleSaveError.value = ''
  articleSaveSuccess.value = ''

  try {
    await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/blocks/article_override`, {
      method: 'PUT',
      body: {
        data: {
          markdown: articleDraft.value,
          theme: normalizedArticleTheme(articleThemeDraft.value),
          sidebarEnabled: Boolean(articleSidebarEnabledDraft.value),
          sidebarItems: normalizeArticleSidebarItems(articleSidebarItemsDraft.value)
        }
      }
    })

    await refreshEntity()
    articleSaveSuccess.value = 'Article saved.'
  } catch (error: any) {
    articleSaveError.value = error?.data?.statusMessage || error?.message || 'Could not save article.'
  } finally {
    articleSaving.value = false
  }
}

function resetArticleDraft() {
  articleDraft.value = generatedArticleMarkdown.value || ''
  articleThemeDraft.value = 'codex'
  articleSidebarEnabledDraft.value = false
  articleSidebarItemsDraft.value = []
  articleSaveError.value = ''
  articleSaveSuccess.value = 'Draft reset. Save to keep it.'
}


const articleHtml = computed(() => renderMarkdown(articleMarkdown.value || ''))

const renderedArticleContent = computed(() => {
  const raw = String(articleMarkdown.value || '')
  return /<\/?[a-z][\s\S]*>/i.test(raw) ? raw : renderMarkdown(raw)
})

const classFeatureCards = computed(() => {
  const features = hydratedClassFeatures.value?.features
  if (!Array.isArray(features)) return []

  return features
    .filter((feature: any) => feature?.found || feature?.markdown)
    .map((feature: any, index: number) => {
      const level = feature?.level || null
      const name = String(feature?.name || `Feature ${index + 1}`)
      const id = `feature-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`

      return {
        ...feature,
        id,
        name,
        level,
        markdown: String(feature?.markdown || '').trim(),
        source: feature?.source || null
      }
    })
})

const classFeatureLevels = computed(() => {
  const seen = new Set()
  return classFeatureCards.value
    .filter((feature: any) => feature.level)
    .filter((feature: any) => {
      const key = String(feature.level)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((feature: any) => feature.level)
})


const derivedSummary = computed(() => {
  const explicit = String(entity.value?.summary || '').trim()
  if (explicit) return explicit

  const classSummary = String(hydratedClassFeatures.value?.summary || '').trim()
  if (classSummary) return classSummary

  const markdown = String(articleMarkdown.value || '').trim()
  if (!markdown) return ''

  const cleaned = markdown
    .replace(/^#.*$/gm, '')
    .replace(/^>.*$/gm, '')
    .replace(/[*_`#>-]/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] || ''
  return firstSentence.slice(0, 280).trim()
})

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

function featMetaLines() {
  const core = featCore.value
  if (!core) return []

  return [
    core.category ? `Category: ${core.category}` : '',
    core.prerequisites ? `Prerequisites: ${core.prerequisites}` : '',
    core.repeatable ? 'Repeatable' : '',
    core.ability_score_increase ? `Ability: ${core.ability_score_increase}` : ''
  ].filter(Boolean)
}

function itemMetaLines() {
  const core = itemCore.value
  if (!core) return []

  return [
    core.item_type ? `Type: ${core.item_type}` : '',
    core.rarity ? `Rarity: ${core.rarity}` : '',
    core.damage ? `Damage: ${core.damage}${core.damage_type ? ` ${core.damage_type}` : ''}` : '',
    core.armor_class ? `Armor Class: ${core.armor_class}` : '',
    core.weight ? `Weight: ${core.weight}` : '',
    core.value ? `Value: ${core.value}` : '',
    core.attunement ? 'Requires Attunement' : ''
  ].filter(Boolean)
}

function spellMetaLines() {
  const core = spellCore.value
  if (!core) return []

  return [
    core.level !== undefined && core.level !== null ? `Level: ${core.level}` : '',
    core.school ? `School: ${core.school}` : '',
    core.casting_time ? `Casting Time: ${core.casting_time}` : '',
    core.range ? `Range: ${core.range}` : '',
    core.duration ? `Duration: ${core.duration}` : '',
    core.components ? `Components: ${core.components}` : '',
    core.ritual ? 'Ritual' : '',
    core.concentration ? 'Concentration' : '',
    core.higher_level ? `At Higher Levels: ${core.higher_level}` : ''
  ].filter(Boolean)
}

function speciesMetaLines() {
  const core = speciesCore.value
  if (!core) return []

  const size = formatSize(core.size ?? core.size_json ?? core.race_size)
  const speed = formatSpeed(core.speed ?? core.speed_json ?? core.race_speed)

  return [
    size ? `Size: ${size}` : '',
    speed ? `Speed: ${speed}` : ''
  ].filter(Boolean)
}

function classMetaLines() {
  const core = classCore.value
  if (!core) return []

  const hitDie = core.hit_die ?? core.hitDie ?? core.hd
  const primaryAbility = core.primary_ability ?? core.primaryAbility ?? core.spellcasting_ability

  return [
    hitDie ? `Hit Die: ${formatSimpleValue(hitDie)}` : '',
    primaryAbility ? `Primary Ability: ${formatPrimaryAbility(primaryAbility)}` : ''
  ].filter(Boolean)
}

function backgroundMetaLines() {
  const core = backgroundCore.value
  if (!core) return []

  return [
    core.feature ? `Feature: ${core.feature}` : ''
  ].filter(Boolean)
}

function formatCharacterType(value: any): string {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'pc' || raw === 'player_character') return 'PC'
  if (raw === 'npc_sheet') return 'NPC+'
  if (raw === 'npc' || raw === 'character') return 'NPC'
  return raw
    ? raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    : ''
}

function isCharacterEntityForHeader() {
  const type = String(entity.value?.entity_type || '').toLowerCase()
  return ['character', 'npc', 'npc_sheet', 'pc', 'player_character'].includes(type)
}

function characterMetaLines() {
  const core = characterCore.value || {}
  if (!characterCore.value && !isCharacterEntityForHeader()) return []

  const characterType = formatCharacterType(core.characterType ?? core.character_type ?? entity.value?.entity_type)
  const linkedSheetId = String(core.linkedSheetId ?? core.linked_sheet_id ?? '').trim()

  return [
    characterType ? `Type: ${characterType}` : '',
    core.playerName || core.player_name ? `Player: ${core.playerName || core.player_name}` : '',
    core.pronouns ? `Pronouns: ${core.pronouns}` : '',
    core.publicRole || core.public_role ? `Role: ${core.publicRole || core.public_role}` : '',
    linkedSheetId ? `Linked Sheet: ${linkedSheetId}` : ''
  ].filter(Boolean)
}

function formatLocationType(value: any): string {
  const raw = String(value || '').trim()
  if (!raw) return ''

  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatPopulation(value: any): string {
  if (value === null || value === undefined || value === '') return ''

  const numeric = Number(String(value).replace(/,/g, ''))
  if (!Number.isFinite(numeric)) return String(value)

  return numeric.toLocaleString()
}

function locationMetaLines() {
  const core = locationCore.value
  if (!core) return []

  const type = formatLocationType(core.locationType ?? core.location_type ?? core.type)
  const population = formatPopulation(core.population)
  const linkedMapId = String(core.linkedMapId ?? core.linked_map_id ?? '').trim()
  const parentLocationId = String(core.parentLocationId ?? core.parent_location_id ?? '').trim()

  return [
    type ? `Type: ${type}` : '',
    population ? `Population: ${population}` : '',
    linkedMapId ? `Linked Map: ${mapTitleById(linkedMapId)}` : '',
    parentLocationId ? `Parent Location: ${locationTitleById(parentLocationId)}` : ''
  ].filter(Boolean)
}



const heroMetaLines = computed(() => {
  if (characterCore.value || isCharacterEntityForHeader()) return characterMetaLines()
  if (classCore.value) return classMetaLines()
  if (speciesCore.value) return speciesMetaLines()
  if (spellCore.value) return spellMetaLines().slice(0, 4)
  if (itemCore.value) return itemMetaLines().slice(0, 4)
  if (featCore.value) return featMetaLines().slice(0, 4)
  if (backgroundCore.value) return backgroundMetaLines()
  if (locationCore.value) return locationMetaLines()
  return []
})

const detailSections = computed(() => {
  const sections: Array<{ title: string; lines: string[] }> = []

  // Keep this area for richer secondary panels later.
  // Core facts are promoted into the article hero so they do not feel duplicated/random.
  if (false && itemCore.value) sections.push({ title: 'Item Details', lines: itemMetaLines() })
  if (false && spellCore.value) sections.push({ title: 'Spell Details', lines: spellMetaLines() })
  if (false && speciesCore.value) sections.push({ title: 'Species Details', lines: speciesMetaLines() })
  if (false && classCore.value) sections.push({ title: 'Class Details', lines: classMetaLines() })
  if (false && backgroundCore.value) sections.push({ title: 'Background Details', lines: backgroundMetaLines() })

  return sections.filter((section) => section.lines.length)
})

const buildDrawerOpen = ref(false)
const contextDrawerOpen = ref(false)
const contextDrawerEntity = ref<any | null>(null)

function openMentionContext(mention: any) {
  contextDrawerEntity.value = mention || null
  contextDrawerOpen.value = true
}

function closeContextDrawer() {
  contextDrawerOpen.value = false
  contextDrawerEntity.value = null
}


async function onImageSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input?.files?.[0]

  if (!file) return

  imageError.value = ''
  imageSuccess.value = ''
  uploadingImage.value = true

  try {
    const formData = new FormData()
    formData.append('file', file)

    await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/apply-image`, {
      method: 'POST',
      body: formData
    })

    await refreshEntity()
    imageSuccess.value = 'Image applied.'
  } catch (error: any) {
    imageError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to upload image.'
  } finally {
    uploadingImage.value = false
    if (input) input.value = ''
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <button
      v-if="mode === 'build'"
      type="button"
      class="fixed right-6 top-24 z-30 rounded-none border border-yellow-700/40 bg-[#111]/90 px-4 py-2 text-sm font-semibold text-amber-100 shadow-[0_12px_34px_rgba(0,0,0,0.45)] backdrop-blur hover:bg-yellow-900/30"
      @click="buildDrawerOpen = true"
    >
      Page Builder
    </button>

    <div class="mx-auto max-w-[1500px] p-6">
      <section class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes overflow-hidden rounded-none border backdrop-blur-xl">
        <div class="grid gap-0 lg:grid-cols-[460px_minmax(0,1fr)]">
          <div class="border-b border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.42)] p-5 lg:border-b-0 lg:border-r">
            <button
              v-if="entityImageUrl"
              type="button"
              class="eldra-image-frame group block w-full overflow-hidden rounded-none border bg-black/20 text-left shadow-[0_14px_34px_rgba(0,0,0,0.45)]"
              @click="openImageLightbox"
            >
              <img
                :src="entityImageUrl"
                :alt="entity?.title || 'Entity image'"
                class="aspect-[3/4] w-full object-cover object-[center_15%] transition duration-200 group-hover:scale-[1.02]"
              >
              <div class="border-t border-[rgba(201,164,90,0.22)] px-4 py-3 text-xs uppercase tracking-[0.25em] text-[#9f9278]">
                Click to view image
              </div>
            </button>

            <div
              v-else
              class="flex aspect-[3/4] items-center justify-center rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] text-6xl font-semibold text-[#d8ceb8]"
            >
              {{ (entity?.title || 'E').slice(0, 2).toUpperCase() }}
            </div>

            <div v-if="mode === 'build'" class="mt-4 rounded-none border border-stone-500/20 bg-[#151515]/70 p-4">
              <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-zinc-500">
                Article Image
              </label>

              <input
                type="file"
                accept="image/*"
                class="block w-full text-sm text-zinc-300 file:mr-4 file:rounded-none file:border file:border-stone-500/20 file:bg-white/[0.06] file:px-4 file:py-2 file:text-sm file:text-slate-100"
                @change="onImageSelected"
              >

              <div v-if="uploadingImage" class="mt-2 text-sm text-zinc-300">Uploading image...</div>
              <div v-if="imageSuccess" class="mt-2 text-sm text-emerald-300">{{ imageSuccess }}</div>
              <div v-if="imageError" class="mt-2 text-sm text-red-300">{{ imageError }}</div>
            </div>
          </div>

          <div class="p-7">
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
              {{ world?.name || 'World' }}
            </div>

            <div
              v-if="mode === 'build'"
              class="mt-5 border border-stone-500/20 bg-[#111]/80 p-4"
            >
              <div class="mb-3 text-xs uppercase tracking-[0.3em] text-zinc-500">Header Editor</div>

              <div class="grid gap-3 md:grid-cols-2">
                <label class="block">
                  <span class="mb-1 block text-xs uppercase tracking-[0.2em] text-zinc-500">Title</span>
                  <input v-model="metaTitle" class="w-full rounded-none border border-stone-500/20 bg-[#090909]/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-yellow-700/50">
                </label>

                <label class="block">
                  <span class="mb-1 block text-xs uppercase tracking-[0.2em] text-zinc-500">Slug</span>
                  <input v-model="metaSlug" class="w-full rounded-none border border-stone-500/20 bg-[#090909]/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-yellow-700/50">
                </label>
              </div>

              <label class="mt-3 block">
                <span class="mb-1 block text-xs uppercase tracking-[0.2em] text-zinc-500">Summary Blurb</span>
                <WorldMentionAutocompleteTextarea
                  v-model="metaSummary"
                  :world-id="worldId"
                  rows="4"
                  textarea-class="w-full resize-y rounded-none border border-stone-500/20 bg-[#090909]/80 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none focus:border-yellow-700/50"
                  placeholder="Short summary. Type @ to mention a world entity..."
                />
              </label>

              <div
                v-if="isLocationEntity"
                class="mt-4 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.52)] p-4"
              >
                <div class="mb-3 text-xs uppercase tracking-[0.28em] text-[#9f9278]">Location Details</div>

                <div class="grid gap-3 md:grid-cols-2">
                  <label class="block">
                    <span class="mb-1 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Type</span>
                    <select v-model="locationTypeDraft" class="w-full rounded-none border border-[rgba(201,164,90,0.22)] bg-[#090909]/80 px-3 py-2 text-sm text-[#f5e7bd] outline-none focus:border-yellow-700/50">
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
                    <input v-model="locationPopulationDraft" inputmode="numeric" placeholder="e.g. 1,234" class="w-full rounded-none border border-[rgba(201,164,90,0.22)] bg-[#090909]/80 px-3 py-2 text-sm text-[#f5e7bd] outline-none focus:border-yellow-700/50">
                  </label>

                  <label class="block">
                    <span class="mb-1 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Linked Map</span>
                    <select v-model="locationLinkedMapIdDraft" class="w-full rounded-none border border-[rgba(201,164,90,0.22)] bg-[#090909]/80 px-3 py-2 text-sm text-[#f5e7bd] outline-none focus:border-yellow-700/50">
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
                    <select v-model="locationParentLocationIdDraft" class="w-full rounded-none border border-[rgba(201,164,90,0.22)] bg-[#090909]/80 px-3 py-2 text-sm text-[#f5e7bd] outline-none focus:border-yellow-700/50">
                      <option value="" class="bg-[#090909] text-[#f5e7bd]">No parent location</option>
                      <option
                        v-for="location in locationOptions"
                        :key="location.id"
                        :value="location.id"
                        class="bg-[#090909] text-[#f5e7bd]"
                      >
                        {{ location.title }}
                      </option>
                    </select>
                  </label>
                </div>
              </div>

              <div class="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  class="rounded-none border border-yellow-700/40 bg-yellow-900/25 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-yellow-900/40 disabled:opacity-50"
                  :disabled="metaSaving"
                  @click="saveEntityMetadata"
                >
                  {{ metaSaving ? 'Saving...' : 'Save Header' }}
                </button>

                <span v-if="metaSaveError" class="text-sm text-red-300">{{ metaSaveError }}</span>
                <span v-if="metaSaveSuccess" class="text-sm text-emerald-300">{{ metaSaveSuccess }}</span>
              </div>
            </div>

            <h1 class="mt-4 text-6xl font-semibold tracking-tight text-white">
              {{ entity?.title || 'Entity' }}
            </h1>

            <div class="mt-4 flex flex-wrap gap-2">
              <div class="eldra-gold-chip rounded-none border px-3 py-1.5 text-sm">
                {{ entity?.entity_type || 'entity' }}
              </div>

              <div class="rounded-none border border-stone-500/20 bg-[#171717]/70 px-3 py-1.5 text-sm text-zinc-300">
                {{ entity?.slug || 'no-slug' }}
              </div>

              <div
                v-if="entity?.statblock?.challenge_rating"
                class="rounded-none border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-sm text-red-200"
              >
                CR {{ entity.statblock.challenge_rating }}
              </div>
            </div>

            <div
              v-if="heroMetaLines.length"
              class="mt-6 grid gap-3 md:grid-cols-2"
            >
              <div
                v-for="line in heroMetaLines"
                :key="line"
                class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-4 py-3 text-sm leading-6 text-[#d8ceb8]"
              >
                {{ line }}
              </div>
            </div>

            <div
              v-if="derivedSummary"
              class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes mt-6 rounded-none border p-5 text-[15px] leading-8 text-[#f5e7bd]"
            >
              <WorldMentionText
                :world-id="worldId"
                :markdown="derivedSummary"
                @open-mention="openMentionContext"
              />
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="detailSections.length"
        class="mt-6 grid gap-4 lg:grid-cols-2"
      >
        <article
          v-for="section in detailSections"
          :key="section.title"
          class="rounded-none border border-stone-500/20 bg-[linear-gradient(to_bottom,rgba(24,28,34,0.38),rgba(12,16,22,0.26))] p-6 backdrop-blur-xl shadow-[0_18px_55px_rgba(0,0,0,0.16)]"
        >
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            {{ section.title }}
          </div>

          <div class="mt-5 grid gap-3 text-sm leading-7 text-zinc-200">
            <div
              v-for="line in section.lines"
              :key="line"
              class="rounded-none border border-stone-500/20 bg-white/[0.035] px-4 py-3"
            >
              {{ line }}
            </div>
          </div>
        </article>
      </section>

<section
        :class="articleSectionClass"
        class="mt-6 rounded-none border p-7 shadow-[0_22px_70px_rgba(0,0,0,0.20)]"
      >
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="article-theme-eyebrow">
              Article
            </div>
            <div class="article-theme-name">
              {{ activeArticleThemeLabel }}
            </div>
          </div>

          <div
            v-if="mode === 'build'"
            class="flex flex-wrap items-center gap-2"
          >
            <span class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Article Style</span>
            <button
              v-for="option in ARTICLE_THEME_OPTIONS"
              :key="option.value"
              type="button"
              class="article-theme-button"
              :class="normalizedArticleTheme(articleThemeDraft) === option.value ? 'article-theme-button-active' : ''"
              :title="option.description"
              @click="articleThemeDraft = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div
          v-if="mode !== 'build' && !articleOverrideMarkdown && entity?.entity_type === 'class' && classFeatureCards.length"
          class="mt-6 space-y-5"
        >
          <div class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes rounded-none border p-4 backdrop-blur-xl">
            <div class="mb-3 text-xs uppercase tracking-[0.25em] text-[#9f9278]">
              Class Outline
            </div>

            <div class="flex flex-wrap gap-2">
              <a
                v-for="level in classFeatureLevels"
                :key="level"
                :href="`#class-level-${level}`"
                class="eldra-gold-chip rounded-none border px-3 py-1.5 text-xs font-medium transition hover:opacity-90"
              >
                Level {{ level }}
              </a>
            </div>
          </div>

          <article
            v-for="feature in classFeatureCards"
            :key="feature.id"
            :id="feature.level ? `class-level-${feature.level}` : feature.id"
            class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes scroll-mt-28 overflow-hidden rounded-none border shadow-[0_12px_32px_rgba(0,0,0,0.42)]"
          >
            <header class="border-b border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-5 py-4">
              <div class="flex flex-wrap items-center gap-2">
                <span
                  v-if="feature.level"
                  class="rounded-none border border-yellow-700/35 bg-yellow-900/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100"
                >
                  Level {{ feature.level }}
                </span>

                <span class="eldra-gold-chip rounded-none border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]">
                  Feature
                </span>

                <span
                  v-if="feature.source"
                  class="eldra-gold-chip rounded-none border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] opacity-80"
                >
                  {{ feature.source }}
                </span>
              </div>

              <h2 class="mt-3 text-2xl font-semibold tracking-tight text-white">
                {{ feature.name }}
              </h2>
            </header>

            <div
              class="eldra-rich-content px-5 py-5 text-[15px] leading-7"
              v-html="renderMarkdown(feature.markdown)"
            ></div>
          </article>
        </div>

          <div v-else-if="mode === 'build'" class="mt-6">
            <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Article Editor</div>
                <div class="mt-1 text-sm text-[#d8ceb8]">Use the editor below to write and format this article.</div>
              </div>

              <div class="flex gap-2">
                <button
                  type="button"
                  class="eldra-button rounded-none px-4 py-2 text-sm"
                  @click="resetArticleDraft"
                >
                  Reset
                </button>

                <button
                  type="button"
                  class="eldra-button rounded-none px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  :disabled="articleSaving"
                  @click="saveArticleOverride"
                >
                  {{ articleSaving ? 'Saving...' : 'Save Article' }}
                </button>
              </div>
            </div>

            <section class="article-sidebar-editor mt-5 rounded-none border p-4">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div class="text-xs uppercase tracking-[0.28em] text-[#9f9278]">
                    Article Sidebar
                  </div>
                  <p class="mt-1 max-w-2xl text-sm leading-6 text-[#d8ceb8]">
                    Optional right-side details card for important people, places, secrets, and notes.
                  </p>
                </div>

                <label class="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#f5e7bd]">
                  <input
                    v-model="articleSidebarEnabledDraft"
                    type="checkbox"
                    class="h-4 w-4 accent-[#c9a45a]"
                  >
                  Enable Sidebar
                </label>
              </div>

              <div
                v-if="articleSidebarEnabledDraft"
                class="mt-4 space-y-3"
              >
                <article
                  v-for="(item, index) in articleSidebarItemsDraft"
                  :key="item.id || index"
                  class="rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.44)] p-3"
                >
                  <div class="grid gap-3 md:grid-cols-[150px_150px_minmax(0,1fr)_auto]">
                    <label>
                      <span class="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Type</span>
                      <select
                        v-model="item.type"
                        class="eldra-input w-full rounded-none px-3 py-2 text-sm"
                        @change="item.visibility = item.type === 'secrets' && item.visibility === 'public' ? 'gm' : item.visibility"
                      >
                        <option
                          v-for="option in ARTICLE_SIDEBAR_TYPE_OPTIONS"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.label }}
                        </option>
                      </select>
                    </label>

                    <label>
                      <span class="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Visibility</span>
                      <select
                        v-model="item.visibility"
                        class="eldra-input w-full rounded-none px-3 py-2 text-sm"
                      >
                        <option
                          v-for="option in ARTICLE_SIDEBAR_VISIBILITY_OPTIONS"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.label }}
                        </option>
                      </select>
                    </label>

                    <label>
                      <span class="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Title</span>
                      <input
                        v-model="item.title"
                        type="text"
                        placeholder="Important People, Tavern Rumors, Nearby Places..."
                        class="eldra-input w-full rounded-none px-3 py-2 text-sm"
                      >
                    </label>

                    <button
                      type="button"
                      class="self-end rounded-none border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200 transition hover:bg-red-500/20"
                      @click="removeArticleSidebarItem(index)"
                    >
                      Remove
                    </button>
                  </div>

                  <label class="mt-3 block">
                    <span class="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Body</span>
                    <WorldMentionAutocompleteTextarea
                      v-model="item.body"
                      :world-id="worldId"
                      rows="3"
                      textarea-class="eldra-input w-full resize-y rounded-none px-3 py-2 text-sm leading-6"
                      placeholder="Type @ to mention people, places, factions, items..."
                    />
                  </label>
                </article>

                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="eldra-button rounded-none px-3 py-2 text-sm"
                    @click="addArticleSidebarItem('people')"
                  >
                    Add People
                  </button>
                  <button
                    type="button"
                    class="eldra-button rounded-none px-3 py-2 text-sm"
                    @click="addArticleSidebarItem('places')"
                  >
                    Add Places
                  </button>
                  <button
                    type="button"
                    class="eldra-button rounded-none px-3 py-2 text-sm"
                    @click="addArticleSidebarItem('secrets')"
                  >
                    Add Secret
                  </button>
                  <button
                    type="button"
                    class="eldra-button rounded-none px-3 py-2 text-sm"
                    @click="addArticleSidebarItem('notes')"
                  >
                    Add Note
                  </button>
                </div>
              </div>

              <div
                v-else
                class="mt-4 rounded-none border border-[rgba(201,164,90,0.14)] bg-black/10 px-4 py-3 text-sm text-[#9f9278]"
              >
                Disabled for this article. Short blurbs can stay clean.
              </div>
            </section>

            <div class="mt-5">
              <EldraRichTextEditor
                v-model="articleDraft"
                :world-id="worldId"
                :article-theme="normalizedArticleTheme(articleThemeDraft)"
              />
            </div>



            <div v-if="articleSaveError" class="mt-3 text-sm text-red-300">{{ articleSaveError }}</div>
            <div v-if="articleSaveSuccess" class="mt-3 text-sm text-emerald-300">{{ articleSaveSuccess }}</div>
          </div>

        <div
          v-else-if="articleMarkdown"
          :class="articleContentClass"
          class="mt-6"
        >
          <div
            class="article-theme-layout"
            :class="visibleArticleSidebarItems.length ? 'article-theme-layout-with-sidebar' : 'article-theme-layout-single'"
          >
            <WorldMentionText
              :world-id="worldId"
              :markdown="articleMarkdown"
              class="eldra-rich-content article-theme-main text-[16px] leading-8"
              @open-mention="openMentionContext"
            />

            <aside
              v-if="visibleArticleSidebarItems.length"
              class="article-detail-sidebar"
            >
              <div class="text-[10px] uppercase tracking-[0.28em] text-[#9f9278]">
                Key Details
              </div>

              <article
                v-for="item in visibleArticleSidebarItems"
                :key="item.id"
                class="article-detail-sidebar-card"
              >
                <div class="article-detail-sidebar-type">
                  {{ articleSidebarTypeLabel(item.type) }}
                  <span class="opacity-60">/ {{ articleSidebarVisibilityLabel(item.visibility) }}</span>
                </div>

                <h3
                  v-if="item.title"
                  class="article-detail-sidebar-title"
                >
                  {{ item.title }}
                </h3>

                <WorldMentionText
                  v-if="item.body"
                  :world-id="worldId"
                  :markdown="item.body"
                  class="article-detail-sidebar-body"
                  @open-mention="openMentionContext"
                />
              </article>
            </aside>
          </div>
        </div>

        <div
          v-else
          class="mt-6 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-5 text-[#d8ceb8]"
        >
          No article content yet.
        </div>
      </section>
    </div>


    <Transition
      enter-from-class="translate-x-full opacity-0"
      enter-active-class="transition duration-200"
      leave-to-class="translate-x-full opacity-0"
      leave-active-class="transition duration-200"
    >
      <aside
        v-if="buildDrawerOpen"
        class="fixed right-0 top-0 z-40 h-full w-[420px] border-l border-stone-500/20 bg-[linear-gradient(to_bottom,rgba(14,14,14,0.94),rgba(5,5,5,0.90))] backdrop-blur-xl"
      >
        <div class="flex h-full flex-col">
          <div class="flex items-start justify-between gap-4 border-b border-stone-500/20 px-5 py-5">
            <div>
              <div class="text-xs uppercase tracking-[0.35em] text-zinc-500">Build</div>
              <h2 class="mt-3 text-2xl font-semibold text-white">Page Builder</h2>
            </div>

            <button
              type="button"
              class="rounded-none border border-stone-500/20 bg-[#151515]/70 p-2 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
              @click="buildDrawerOpen = false"
            >
              <UIcon name="i-lucide-x" class="h-5 w-5" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-5">
            <WorldPagePresentationPanel
              :world-id="worldId"
              page-key="entity-article"
              title="Entity Article"
              description="Controls the article page presentation and background."
            />
          </div>
        </div>
      </aside>
    </Transition>

    <WorldEntityContextDrawer
      :open="contextDrawerOpen"
      :entity="contextDrawerEntity"
      :mode="mode"
      :allow-build-actions="false"
      @close="closeContextDrawer"
    />

    <Teleport to="body">
      <Transition
        enter-from-class="opacity-0"
        enter-active-class="transition duration-150"
        leave-to-class="opacity-0"
        leave-active-class="transition duration-150"
      >
        <div
          v-if="imageLightboxOpen && entityImageUrl"
          class="fixed inset-0 z-[9999] flex items-center justify-center bg-[#050505]/90 p-4 backdrop-blur-sm"
          @click.self="closeImageLightbox"
        >
          <div class="relative max-h-[92vh] max-w-[92vw]">
            <button
              type="button"
              class="absolute right-3 top-3 z-10 rounded-none border border-stone-500/20 bg-[#050505]/75 p-2 text-zinc-200 backdrop-blur transition hover:bg-[#050505]/90 hover:text-white"
              @click="closeImageLightbox"
            >
              <UIcon name="i-lucide-x" class="h-5 w-5" />
            </button>

            <img
              :src="entityImageUrl"
              :alt="entity?.title || 'Image preview'"
              class="max-h-[92vh] max-w-[92vw] rounded-none border border-stone-500/20 object-contain shadow-[0_30px_100px_rgba(0,0,0,0.65)]"
            >

            <div class="pointer-events-none absolute bottom-3 left-3 right-3 rounded-none border border-stone-500/20 bg-[#050505]/70 px-4 py-3 text-sm text-slate-100 backdrop-blur">
              {{ entity?.title || 'Image preview' }}
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
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
  font-size: 1.7rem;
  line-height: 1.2;
  font-weight: 700;
  color: white;
}

:deep(.markdown-content h2) {
  margin: 1.25rem 0 0.75rem 0;
  font-size: 1.3rem;
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
  margin: 0.9rem 0;
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

.article-theme-shell {
  position: relative;
  overflow: hidden;
  border-color: rgba(201, 164, 90, 0.34);
  background:
    radial-gradient(circle at 20% 0%, rgba(201, 164, 90, 0.08), transparent 32%),
    linear-gradient(to bottom, rgba(20, 17, 12, 0.72), rgba(7, 7, 6, 0.58));
  backdrop-filter: blur(16px);
}

.article-theme-shell-codex {
  border-color: rgba(201, 164, 90, 0.34);
}

.article-theme-shell-parchment {
  border-color: rgba(201, 164, 90, 0.42);
  background:
    radial-gradient(circle at 18% 0%, rgba(201, 164, 90, 0.12), transparent 32%),
    radial-gradient(circle at 80% 12%, rgba(166, 105, 42, 0.10), transparent 30%),
    linear-gradient(to bottom, rgba(24, 20, 13, 0.84), rgba(8, 7, 5, 0.68));
}

.article-theme-shell-statblock {
  border-color: rgba(153, 55, 46, 0.52);
  background:
    radial-gradient(circle at 18% 0%, rgba(201, 164, 90, 0.09), transparent 32%),
    linear-gradient(90deg, rgba(117, 28, 28, 0.16), transparent 18%, transparent 82%, rgba(117, 28, 28, 0.13)),
    linear-gradient(to bottom, rgba(22, 17, 12, 0.86), rgba(8, 7, 5, 0.72));
}

.article-theme-eyebrow {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  color: #9f9278;
}

.article-theme-name {
  margin-top: 0.35rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: rgba(245, 231, 189, 0.66);
}

.article-theme-shell-parchment .article-theme-name {
  color: rgba(226, 184, 111, 0.76);
}

.article-theme-shell-statblock .article-theme-name {
  color: rgba(231, 139, 116, 0.78);
}

.article-theme-button {
  border: 1px solid rgba(201, 164, 90, 0.30);
  border-radius: 0;
  background: rgba(20, 17, 12, 0.58);
  padding: 0.55rem 0.8rem;
  color: #f5e7bd;
  font-size: 0.78rem;
  font-weight: 700;
  transition: all 0.16s ease;
}

.article-theme-button:hover,
.article-theme-button-active {
  border-color: rgba(251, 191, 36, 0.85);
  background: rgba(201, 164, 90, 0.20);
  color: #fff7df;
}

.article-theme-content {
  overflow: hidden;
}

.article-theme-content-codex {
  color: #f5e7bd;
}

.article-theme-content-parchment {
  margin-left: auto;
  margin-right: auto;
  max-width: 1040px;
  border: 1px solid rgba(201, 164, 90, 0.34);
  background:
    radial-gradient(circle at 16% 8%, rgba(255, 246, 214, 0.16), transparent 22%),
    radial-gradient(circle at 80% 18%, rgba(74, 42, 18, 0.11), transparent 28%),
    linear-gradient(90deg, rgba(72, 44, 20, 0.055) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(210, 181, 125, 0.96), rgba(177, 139, 82, 0.94));
  background-size: auto, auto, 44px 44px, auto;
  padding: clamp(1.25rem, 2.4vw, 2.35rem);
  color: #271b10;
  box-shadow:
    inset 0 0 0 1px rgba(255, 243, 204, 0.22),
    inset 0 0 70px rgba(64, 36, 13, 0.16),
    0 20px 55px rgba(0, 0, 0, 0.28);
}

.article-theme-content-statblock {
  margin-left: auto;
  margin-right: auto;
  max-width: 1040px;
  border: 1px solid rgba(122, 45, 34, 0.48);
  border-top: 5px solid rgba(122, 35, 30, 0.88);
  border-bottom: 5px solid rgba(122, 35, 30, 0.88);
  background:
    linear-gradient(90deg, rgba(122, 35, 30, 0.08), transparent 12%, transparent 88%, rgba(122, 35, 30, 0.06)),
    linear-gradient(to bottom, rgba(209, 183, 126, 0.96), rgba(184, 149, 92, 0.95));
  padding: clamp(1.2rem, 2vw, 2rem);
  color: #24170e;
  box-shadow:
    inset 0 0 0 1px rgba(255, 241, 201, 0.20),
    inset 0 0 58px rgba(70, 35, 16, 0.13),
    0 20px 55px rgba(0, 0, 0, 0.28);
}

.article-theme-content-parchment :deep(.world-mention-text),
.article-theme-content-statblock :deep(.world-mention-text) {
  color: inherit;
}

.article-theme-content-parchment :deep(.world-mention-paragraph),
.article-theme-content-statblock :deep(.world-mention-paragraph) {
  color: inherit;
}

.article-theme-content-parchment :deep(.eldra-mention-link) {
  border-color: rgba(75, 48, 20, 0.56);
  background: rgba(82, 52, 22, 0.13);
  color: #2c1a0b;
  box-shadow: none;
}

.article-theme-content-statblock :deep(.eldra-mention-link) {
  border-color: rgba(117, 28, 28, 0.46);
  background: rgba(117, 28, 28, 0.10);
  color: #561616;
  box-shadow: none;
}

.article-theme-content-parchment :deep(.world-mention-image-frame),
.article-theme-content-statblock :deep(.world-mention-image-frame) {
  border-color: rgba(74, 48, 22, 0.34);
  background: rgba(255, 238, 186, 0.18);
  box-shadow: 0 16px 38px rgba(55, 31, 11, 0.18);
}

.article-theme-content-parchment :deep(.world-mention-image-caption),
.article-theme-content-statblock :deep(.world-mention-image-caption) {
  color: rgba(47, 33, 20, 0.74);
  border-top-color: rgba(74, 48, 22, 0.18);
}

.article-theme-content-statblock :deep(.world-mention-paragraph:first-child)::first-letter {
  float: left;
  margin-right: 0.35rem;
  color: #7b1f1f;
  font-size: 3.2rem;
  line-height: 0.9;
  font-weight: 800;
}

.article-theme-content-parchment :deep(.ProseMirror),
.article-theme-content-statblock :deep(.ProseMirror) {
  color: inherit;
}


.article-theme-content-parchment :deep(h1),
.article-theme-content-parchment :deep(h2),
.article-theme-content-parchment :deep(h3),
.article-theme-content-parchment :deep(.ProseMirror h1),
.article-theme-content-parchment :deep(.ProseMirror h2),
.article-theme-content-parchment :deep(.ProseMirror h3) {
  color: #2a1b0d;
}

.article-theme-content-statblock :deep(h1),
.article-theme-content-statblock :deep(h2),
.article-theme-content-statblock :deep(h3),
.article-theme-content-statblock :deep(.ProseMirror h1),
.article-theme-content-statblock :deep(.ProseMirror h2),
.article-theme-content-statblock :deep(.ProseMirror h3) {
  color: #651b18;
}

.article-theme-content-parchment :deep(.ProseMirror),
.article-theme-content-statblock :deep(.ProseMirror) {
  background: transparent;
}

.article-theme-content-parchment :deep(.eldra-editor-prosemirror),
.article-theme-content-statblock :deep(.eldra-editor-prosemirror) {
  color: inherit;
}


.article-sidebar-editor {
  border-color: rgba(201, 164, 90, 0.22);
  background:
    radial-gradient(circle at 18% 0%, rgba(201, 164, 90, 0.07), transparent 30%),
    rgba(8, 7, 5, 0.34);
}

.article-theme-layout {
  display: grid;
  gap: clamp(1.25rem, 2vw, 2rem);
}

.article-theme-layout-single {
  grid-template-columns: minmax(0, 1fr);
}

.article-theme-layout-with-sidebar {
  grid-template-columns: minmax(0, 1fr) minmax(260px, 340px);
  align-items: start;
}

.article-theme-main {
  min-width: 0;
}

.article-detail-sidebar {
  position: sticky;
  top: 5.5rem;
  display: grid;
  gap: 0.85rem;
  min-width: 0;
}

.article-detail-sidebar-card {
  border: 1px solid rgba(201, 164, 90, 0.24);
  background:
    linear-gradient(to bottom, rgba(20, 17, 12, 0.68), rgba(8, 7, 5, 0.46));
  padding: 0.95rem;
  box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.14);
}

.article-detail-sidebar-type {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.24em;
  color: #9f9278;
}

.article-detail-sidebar-title {
  margin-top: 0.35rem;
  color: #fff7df;
  font-size: 1rem;
  line-height: 1.25;
  font-weight: 800;
}

.article-detail-sidebar-body {
  margin-top: 0.55rem;
  font-size: 0.88rem;
  line-height: 1.65;
  color: #e8d9b5;
}

.article-theme-content-parchment .article-detail-sidebar-card,
.article-theme-content-statblock .article-detail-sidebar-card {
  border-color: rgba(74, 48, 22, 0.28);
  background: rgba(255, 238, 186, 0.18);
  box-shadow: inset 0 0 24px rgba(74, 48, 22, 0.08);
}

.article-theme-content-parchment .article-detail-sidebar-title,
.article-theme-content-statblock .article-detail-sidebar-title {
  color: #2a1b0d;
}

.article-theme-content-parchment .article-detail-sidebar-body,
.article-theme-content-statblock .article-detail-sidebar-body {
  color: #2f2114;
}

.article-theme-content-statblock .article-detail-sidebar-type {
  color: rgba(117, 28, 28, 0.72);
}

@media (max-width: 1100px) {
  .article-theme-layout-with-sidebar {
    grid-template-columns: minmax(0, 1fr);
  }

  .article-detail-sidebar {
    position: static;
  }
}

</style>
