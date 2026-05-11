<script setup lang="ts">
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
const worldId = computed(() => String(route.params.id || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const search = ref('')
const selectedEntityId = ref<string | null>(null)
const deletingEntity = ref(false)
const deleteError = ref('')

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)
const { data: entities, pending, refresh } = await useFetch(() => `/api/worlds/${worldId.value}/entities`, {
  default: () => []
})

const { data: selectedEntityDetail, pending: selectedPending } = await useFetch(
  () => selectedEntityId.value ? `/api/worlds/${worldId.value}/entities/${selectedEntityId.value}` : null,
  {
    default: () => null,
    watch: [selectedEntityId]
  }
)

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

  const speciesDescription = String(speciesCore(entity)?.description || speciesCore(entity)?.traits || buildSpeciesArticleMarkdown(entity) || '').trim()
  if (speciesDescription) return speciesDescription

  const classDescription = String(classCore(entity)?.description || classCore(entity)?.features || buildClassArticleMarkdown(entity) || '').trim()
  if (classDescription) return classDescription

  const backgroundDescription = String(backgroundCore(entity)?.description || '').trim()
  if (backgroundDescription) return backgroundDescription

  return ''
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

  return (entities.value || [])
    .filter((entity: any) => normalizeEntityType(entity?.entity_type || entity?.entityType) === normalizeEntityType(props.entityType))
    .filter((entity: any) => {
      if (!q) return true

      return [
        entity?.title,
        entity?.slug,
        summaryForEntity(entity),
        ...itemMetaLines(entity),
        ...spellMetaLines(entity),
        ...speciesMetaLines(entity),
        ...classMetaLines(entity),
        ...backgroundMetaLines(entity)
      ]
        .filter(Boolean)
        .some((value: any) => String(value).toLowerCase().includes(q))
    })
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
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-[1900px] p-6">
      <div :class="selectedEntity || mode === 'build' ? 'pr-[380px]' : ''" class="transition-all duration-200">
        <section class="eldra-ornate-panel eldra-victorian-frame eldra-floral-corners eldra-cartouche eldra-corner-runes rounded-none border p-6 backdrop-blur-xl">
          <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">{{ eyebrow || title }}</div>
              <h1 class="mt-2 eldra-gilded-title text-3xl font-semibold">{{ world?.name || title }}</h1>
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
          class="mt-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3"
        >
          <div
            v-for="entity in filteredEntities"
            :key="entity.id"
            class="eldra-ornate-card eldra-victorian-frame eldra-floral-corners eldra-gilded-edge eldra-corner-runes eldra-card-glyph group cursor-pointer overflow-hidden rounded-none border backdrop-blur-xl transition hover:border-[rgba(201,164,90,0.62)]"
            :class="selectedEntityId === String(entity.id)
              ? 'eldra-selected-glow scale-[1.025]'
              : 'opacity-95'"
            @click="selectEntity(entity)"
          >
            <div class="grid min-h-[240px] grid-cols-[112px_minmax(0,1fr)]">
              <div class="eldra-image-frame border-r border-[rgba(201,164,90,0.22)] bg-black/20">
                <img
                  v-if="imageUrlForEntity(entity)"
                  :src="imageUrlForEntity(entity)"
                  :alt="entity.title"
                  class="h-full w-full object-cover object-[center_18%]"
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
                    <div class="leading-7 line-clamp-5">
                      {{ summaryForEntity(entity) || 'Select to preview →' }}
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
        class="fixed right-0 top-0 z-20 h-full w-[360px] border-l border-[rgba(201,164,90,0.22)] bg-[rgba(8,16,27,0.94)] backdrop-blur"
      >
        <div class="p-5">
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
        class="eldra-ornate-panel eldra-victorian-frame eldra-floral-corners eldra-cartouche fixed right-0 top-0 z-30 h-full w-[360px] border-l backdrop-blur-xl"
      >
        <div class="flex h-full flex-col">
          <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-5">
            <div class="min-w-0">
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Summary</div>
              <h2 class="mt-3 truncate eldra-gilded-title text-2xl font-semibold">{{ selectedEntity.title }}</h2>
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
                  class="markdown-content text-[15px] leading-7 text-slate-200"
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
</style>
