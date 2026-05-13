<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

import { renderMarkdown } from '~/utils/renderMarkdown'

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

const metaTitle = ref('')
const metaSlug = ref('')
const metaSummary = ref('')
const metaSaving = ref(false)
const metaSaveError = ref('')
const metaSaveSuccess = ref('')

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

function blockByKey(key: string) {
  return entity.value?.blocks?.find?.((block: any) => {
    const blockKey = String(block?.block_key || block?.blockKey || '')
    return blockKey === key
  }) || null
}

const itemCore = computed(() => blockByKey('item_core')?.data || null)
const spellCore = computed(() => blockByKey('spell_core')?.data || null)
const speciesCore = computed(() => blockByKey('species_core')?.data || null)
const classCore = computed(() => blockByKey('class_core')?.data || null)
const backgroundCore = computed(() => blockByKey('background_core')?.data || null)

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

const generatedArticleMarkdown = computed(() => {
  if (!entity.value) return ''

  return (
    entity.value?.monsterProfile?.fluff_markdown ||
    entity.value?.fluff_markdown ||
    entity.value?.summary_markdown ||
    itemCore.value?.description ||
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
  () => [entityId.value, articleOverrideMarkdown.value, generatedArticleMarkdown.value],
  () => {
    articleDraft.value = articleMarkdown.value || ''
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
          markdown: articleDraft.value
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
  articleSaveError.value = ''
  articleSaveSuccess.value = 'Draft reset. Save to keep it.'
}

function wrapSelection(before: string, after = before, placeholder = 'text') {
  const textarea = document.querySelector('textarea[data-article-editor="true"]') as HTMLTextAreaElement | null
  if (!textarea) return

  const start = textarea.selectionStart ?? 0
  const end = textarea.selectionEnd ?? 0
  const selected = articleDraft.value.slice(start, end) || placeholder
  const next = articleDraft.value.slice(0, start) + before + selected + after + articleDraft.value.slice(end)

  articleDraft.value = next

  nextTick(() => {
    textarea.focus()
    textarea.setSelectionRange(start + before.length, start + before.length + selected.length)
  })
}

function insertMarkdown(markdown: string) {
  const textarea = document.querySelector('textarea[data-article-editor="true"]') as HTMLTextAreaElement | null
  if (!textarea) {
    articleDraft.value += markdown
    return
  }

  const start = textarea.selectionStart ?? articleDraft.value.length
  const next = articleDraft.value.slice(0, start) + markdown + articleDraft.value.slice(start)

  articleDraft.value = next

  nextTick(() => {
    textarea.focus()
    textarea.setSelectionRange(start + markdown.length, start + markdown.length)
  })
}

const articleHtml = computed(() => renderMarkdown(articleMarkdown.value || ''))

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



const heroMetaLines = computed(() => {
  if (classCore.value) return classMetaLines()
  if (speciesCore.value) return speciesMetaLines()
  if (spellCore.value) return spellMetaLines().slice(0, 4)
  if (itemCore.value) return itemMetaLines().slice(0, 4)
  if (backgroundCore.value) return backgroundMetaLines()
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
const contextDrawerTitle = ref('')
const contextDrawerMarkdown = ref('')

const contextDrawerHtml = computed(() => renderMarkdown(contextDrawerMarkdown.value || ''))

function closeContextDrawer() {
  contextDrawerOpen.value = false
  contextDrawerTitle.value = ''
  contextDrawerMarkdown.value = ''
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
      <section class="overflow-hidden rounded-none border border-stone-500/20 bg-[linear-gradient(to_bottom,rgba(18,18,18,0.72),rgba(8,8,8,0.58))] backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.42)]">
        <div class="grid gap-0 lg:grid-cols-[460px_minmax(0,1fr)]">
          <div class="border-b border-stone-500/20 bg-[#050505]/20 p-5 lg:border-b-0 lg:border-r">
            <button
              v-if="entityImageUrl"
              type="button"
              class="group block w-full overflow-hidden rounded-none border border-stone-500/20 bg-[#050505]/35 text-left shadow-[0_14px_34px_rgba(0,0,0,0.45)]"
              @click="openImageLightbox"
            >
              <img
                :src="entityImageUrl"
                :alt="entity?.title || 'Entity image'"
                class="aspect-[3/4] w-full object-cover object-[center_15%] transition duration-200 group-hover:scale-[1.02]"
              >
              <div class="border-t border-stone-500/20 px-4 py-3 text-xs uppercase tracking-[0.25em] text-zinc-400">
                Click to view image
              </div>
            </button>

            <div
              v-else
              class="flex aspect-[3/4] items-center justify-center rounded-none border border-stone-500/20 bg-[#121212]/70 text-6xl font-semibold text-zinc-400"
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
            <div class="text-xs uppercase tracking-[0.35em] text-zinc-500">
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
                <textarea v-model="metaSummary" rows="4" class="w-full resize-y rounded-none border border-stone-500/20 bg-[#090909]/80 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none focus:border-yellow-700/50"></textarea>
              </label>

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
              <div class="rounded-none border border-stone-500/20 bg-[#171717]/70 px-3 py-1.5 text-sm text-zinc-300">
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
                class="rounded-none border border-stone-500/20 bg-white/[0.045] px-4 py-3 text-sm leading-6 text-zinc-200"
              >
                {{ line }}
              </div>
            </div>

            <div
              v-if="derivedSummary"
              class="mt-6 rounded-none border border-yellow-700/30 bg-[linear-gradient(to_bottom,rgba(92,72,34,0.18),rgba(20,20,20,0.34))] p-5 text-[15px] leading-8 text-amber-50/90"
            >
              {{ derivedSummary }}
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
          <div class="text-xs uppercase tracking-[0.3em] text-zinc-500">
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

<section class="mt-6 rounded-none border border-stone-500/20 bg-[linear-gradient(to_bottom,rgba(18,18,18,0.66),rgba(8,8,8,0.52))] p-7 backdrop-blur-xl shadow-[0_22px_70px_rgba(0,0,0,0.20)]">
        <div class="text-xs uppercase tracking-[0.3em] text-zinc-500">
          Article
        </div>

        <div
          v-if="mode !== 'build' && !articleOverrideMarkdown && entity?.entity_type === 'class' && classFeatureCards.length"
          class="mt-6 space-y-5"
        >
          <div class="rounded-none border border-stone-500/20 bg-[#101010]/92 p-4 backdrop-blur-xl">
            <div class="mb-3 text-xs uppercase tracking-[0.25em] text-zinc-500">
              Class Outline
            </div>

            <div class="flex flex-wrap gap-2">
              <a
                v-for="level in classFeatureLevels"
                :key="level"
                :href="`#class-level-${level}`"
                class="rounded-none border border-zinc-500/30 bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-zinc-800/80"
              >
                Level {{ level }}
              </a>
            </div>
          </div>

          <article
            v-for="feature in classFeatureCards"
            :key="feature.id"
            :id="feature.level ? `class-level-${feature.level}` : feature.id"
            class="scroll-mt-28 overflow-hidden rounded-none border border-stone-500/20 bg-[linear-gradient(to_bottom,rgba(25,23,19,0.78),rgba(10,14,22,0.54))] shadow-[0_12px_32px_rgba(0,0,0,0.42)]"
          >
            <header class="border-b border-stone-500/20 bg-[#121212]/70 px-5 py-4">
              <div class="flex flex-wrap items-center gap-2">
                <span
                  v-if="feature.level"
                  class="rounded-none border border-yellow-700/35 bg-yellow-900/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100"
                >
                  Level {{ feature.level }}
                </span>

                <span class="rounded-none border border-stone-500/20 bg-[#151515]/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">
                  Feature
                </span>

                <span
                  v-if="feature.source"
                  class="rounded-none border border-stone-500/20 bg-[#151515]/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400"
                >
                  {{ feature.source }}
                </span>
              </div>

              <h2 class="mt-3 text-2xl font-semibold tracking-tight text-white">
                {{ feature.name }}
              </h2>
            </header>

            <div
              class="markdown-content eldra-rich-content px-5 py-5 text-[15px] leading-7 text-zinc-200"
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

            <EldraRichTextEditor v-model="articleDraft" />

            <div v-if="articleSaveError" class="mt-3 text-sm text-red-300">{{ articleSaveError }}</div>
            <div v-if="articleSaveSuccess" class="mt-3 text-sm text-emerald-300">{{ articleSaveSuccess }}</div>
          </div>

          <div
            v-else-if="articleMarkdown"
            class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes mt-6 rounded-none border p-6"
          >
            <div
              class="eldra-rich-content"
              v-html="articleMarkdown"
            ></div>
          </div>

          <div
            v-else
            class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes mt-6 rounded-none border p-6 text-[#d8ceb8]"
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
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Build</div>
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

    <Transition
      enter-from-class="translate-x-full opacity-0"
      enter-active-class="transition duration-200"
      leave-to-class="translate-x-full opacity-0"
      leave-active-class="transition duration-200"
    >
      <aside
        v-if="contextDrawerOpen"
        class="fixed right-0 top-0 z-40 h-full w-[380px] border-l border-stone-500/20 bg-[linear-gradient(to_bottom,rgba(14,18,24,0.88),rgba(10,13,18,0.78))] backdrop-blur-xl"
      >
        <div class="flex h-full flex-col">
          <div class="flex items-start justify-between gap-4 border-b border-stone-500/20 px-5 py-5">
            <div>
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
                Context
              </div>
              <h2 class="mt-3 text-2xl font-semibold text-white">
                {{ contextDrawerTitle || 'Linked Context' }}
              </h2>
            </div>

            <button
              type="button"
              class="rounded-none border border-stone-500/20 bg-[#151515]/70 p-2 text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
              @click="closeContextDrawer"
            >
              <UIcon name="i-lucide-x" class="h-5 w-5" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-5">
            <div
              v-if="contextDrawerMarkdown"
              class="markdown-content eldra-rich-content text-sm leading-7 text-zinc-200"
              v-html="contextDrawerHtml"
            ></div>

            <div
              v-else
              class="rounded-none border border-stone-500/20 bg-[#151515]/70 p-5 text-sm leading-7 text-zinc-300"
            >
              Linked 5eTools-style article context will appear here once we wire inline links.
            </div>
          </div>
        </div>
      </aside>
    </Transition>

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
</style>
