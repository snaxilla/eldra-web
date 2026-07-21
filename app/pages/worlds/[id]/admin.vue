<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

import WorldEntityContextDrawer from '~/components/world/WorldEntityContextDrawer.vue'

const route = useRoute()
const router = useRouter()

const worldId = computed(() => String(route.params.id || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const activePanel = ref<'overview' | 'party' | 'grants' | 'homebrew' | 'setup' | 'transfers' | 'relationships'>('overview')
const partySearch = ref('')
const selectedContextEntity = ref<any | null>(null)
const contextDrawerOpen = ref(false)

const grantTargetEntityId = ref('')
const itemSearch = ref('')
const itemSearchPending = ref(false)
const itemResults = ref<any[]>([])
const selectedItem = ref<any | null>(null)
const customItemName = ref('')
const itemGrantQuantity = ref('1')
const itemGrantNotes = ref('Granted by Game Admin')

const currencyTargetEntityId = ref('')
const currencyType = ref('Gold')
const currencyAmount = ref('1')
const currencyNotes = ref('Granted by Game Admin')
const grantSaving = ref(false)
const grantError = ref('')
const grantSuccess = ref('')

let itemSearchTimer: ReturnType<typeof setTimeout> | null = null

const {
  data: partyPayload,
  pending: partyPending,
  refresh: refreshParty
} = await useFetch(
  () => `/api/worlds/${worldId.value}/entities?summary=1&type=character,npc,npc_sheet,pc,player_character&limit=250`,
  {
    default: () => [],
    watch: [worldId]
  }
)

const {
  data: relationshipsPayload,
  pending: relationshipsPending,
  refresh: refreshRelationships
} = await useFetch(
  () => `/api/worlds/${worldId.value}/relationships?limit=80`,
  {
    default: () => ({
      relationships: [],
      outgoing: [],
      incoming: []
    }),
    watch: [worldId]
  }
)

const {
  data: transferPayload,
  pending: transfersPending,
  refresh: refreshTransfers
} = await useFetch(
  () => `/api/worlds/${worldId.value}/admin/transfers?limit=60`,
  {
    default: () => ({
      transfers: []
    }),
    watch: [worldId]
  }
)

const {
  data: itemHealthPayload,
  pending: itemHealthPending
} = await useFetch(
  () => `/api/worlds/${worldId.value}/items/normalized?equippable=1&limit=12`,
  {
    default: () => ({
      items: [],
      count: 0,
      returned: 0
    }),
    watch: [worldId]
  }
)

const partyEntities = computed(() =>
  Array.isArray(partyPayload.value) ? partyPayload.value : []
)

const relationships = computed(() =>
  Array.isArray((relationshipsPayload.value as any)?.relationships)
    ? (relationshipsPayload.value as any).relationships
    : []
)

const transfers = computed(() =>
  Array.isArray((transferPayload.value as any)?.transfers)
    ? (transferPayload.value as any).transfers
    : []
)

const grantTargets = computed(() =>
  partyEntities.value.filter((entity: any) => entityId(entity))
)

const filteredParty = computed(() => {
  const q = partySearch.value.trim().toLowerCase()

  return partyEntities.value
    .filter((entity: any) => {
      if (!q) return true

      return [
        entity?.title,
        entity?.name,
        entity?.slug,
        entity?.summary,
        entityTypeLabel(entity)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
    .sort((a: any, b: any) => String(a?.title || '').localeCompare(String(b?.title || '')))
})

const pendingTransfers = computed(() =>
  transfers.value.filter((transfer: any) =>
    ['offered', 'pending'].includes(String(transfer?.status || '').toLowerCase())
  )
)

const completedTransfers = computed(() =>
  transfers.value.filter((transfer: any) =>
    ['completed', 'granted'].includes(String(transfer?.status || '').toLowerCase())
  )
)

const pcCount = computed(() =>
  partyEntities.value.filter((entity: any) => {
    const type = entityType(entity)
    return ['pc', 'player_character', 'character'].includes(type)
  }).length
)

const npcCount = computed(() =>
  partyEntities.value.filter((entity: any) => {
    const type = entityType(entity)
    return ['npc', 'npc_sheet'].includes(type)
  }).length
)

const healthCards = computed(() => [
  {
    label: 'Cast',
    value: partyEntities.value.length,
    sub: `${pcCount.value} PCs / ${npcCount.value} NPCs`
  },
  {
    label: 'Relationships',
    value: relationships.value.length,
    sub: 'World graph links'
  },
  {
    label: 'Transfers',
    value: transfers.value.length,
    sub: `${pendingTransfers.value.length} pending`
  },
  {
    label: 'Equippable Items',
    value: Number((itemHealthPayload.value as any)?.count || 0),
    sub: itemHealthPending.value ? 'Loading...' : 'Normalized catalog'
  }
])


type HomebrewForgeType = 'spell' | 'item' | 'enemy' | 'species' | 'class' | 'feat' | 'background'

const homebrewTypes: Array<{
  key: HomebrewForgeType
  label: string
  description: string
  icon: string
}> = [
  {
    key: 'spell',
    label: 'Spell',
    description: 'Level, school, casting, range, components, duration, and combat delivery.',
    icon: 'i-lucide-sparkles'
  },
  {
    key: 'item',
    label: 'Item',
    description: 'Equipment, weapons, armor, resources, modifiers, and granted actions.',
    icon: 'i-lucide-package'
  },
  {
    key: 'enemy',
    label: 'Enemy',
    description: 'Statblock-ready creatures with CR, abilities, defenses, traits, and actions.',
    icon: 'i-lucide-skull'
  },
  {
    key: 'species',
    label: 'Species',
    description: 'Size, speed, traits, proficiencies, senses, and granted features.',
    icon: 'i-lucide-dna'
  },
  {
    key: 'class',
    label: 'Class',
    description: 'Hit die, proficiencies, saves, spellcasting hooks, and level features.',
    icon: 'i-lucide-shield'
  },
  {
    key: 'feat',
    label: 'Feat',
    description: 'Prerequisites, benefits, granted spells, actions, and mechanical choices.',
    icon: 'i-lucide-badge-plus'
  },
  {
    key: 'background',
    label: 'Background',
    description: 'ASI, skills, tools, languages, feat hooks, and starting flavor.',
    icon: 'i-lucide-scroll-text'
  }
]

const homebrewType = ref<HomebrewForgeType>('spell')
const homebrewTemplateSearch = ref('')
const homebrewTemplates = ref<any[]>([])
const homebrewTemplatesPending = ref(false)
const homebrewSelectedTemplateId = ref('')
const homebrewTitle = ref('')
const homebrewCreating = ref(false)
const homebrewError = ref('')
const homebrewSuccess = ref('')
const homebrewCreatedEntity = ref<any | null>(null)

const selectedHomebrewType = computed(() =>
  homebrewTypes.find((type) => type.key === homebrewType.value) || homebrewTypes[0]
)

const homebrewFilteredTemplates = computed(() => {
  const q = homebrewTemplateSearch.value.trim().toLowerCase()

  return homebrewTemplates.value
    .filter((template: any) => {
      if (!q) return true

      return [
        template.title,
        template.summary,
        template.sourceBook,
        template.metaLine,
        template.entityType
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
    .slice(0, 80)
})

const selectedHomebrewTemplate = computed(() =>
  homebrewTemplates.value.find((template: any) =>
    String(template.id) === String(homebrewSelectedTemplateId.value)
  ) || null
)

function defaultHomebrewTitle(template: any) {
  const title = String(template?.title || selectedHomebrewType.value?.label || 'Homebrew').trim()
  return title.startsWith('Homebrew:')
    ? title
    : `Homebrew: ${title}`
}

function homebrewTemplateSubtitle(template: any) {
  return [
    template?.sourceBook,
    template?.sourcePage ? `p.${template.sourcePage}` : '',
    template?.entityType,
    template?.blockCount ? `${template.blockCount} blocks` : ''
  ].filter(Boolean).join(' · ')
}

function selectHomebrewTemplate(template: any) {
  homebrewSelectedTemplateId.value = String(template?.id || '')
  homebrewSuccess.value = ''
  homebrewError.value = ''

  if (!homebrewTitle.value.trim()) {
    homebrewTitle.value = defaultHomebrewTitle(template)
  }
}

async function loadHomebrewTemplates() {
  if (!worldId.value) return

  homebrewTemplatesPending.value = true
  homebrewError.value = ''

  try {
    const res: any = await $fetch(`/api/worlds/${worldId.value}/homebrew/templates`, {
      query: {
        type: homebrewType.value
      }
    })

    homebrewTemplates.value = Array.isArray(res?.templates) ? res.templates : []

    if (
      homebrewSelectedTemplateId.value &&
      !homebrewTemplates.value.some((template: any) => String(template.id) === String(homebrewSelectedTemplateId.value))
    ) {
      homebrewSelectedTemplateId.value = ''
    }
  } catch (error: any) {
    homebrewError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to load homebrew templates.'
    homebrewTemplates.value = []
  } finally {
    homebrewTemplatesPending.value = false
  }
}

async function createHomebrewDraft() {
  if (!selectedHomebrewTemplate.value) {
    homebrewError.value = 'Choose a template first.'
    return
  }

  homebrewCreating.value = true
  homebrewError.value = ''
  homebrewSuccess.value = ''
  homebrewCreatedEntity.value = null

  try {
    const res: any = await $fetch(`/api/worlds/${worldId.value}/homebrew/create`, {
      method: 'POST',
      body: {
        type: homebrewType.value,
        templateEntityId: homebrewSelectedTemplateId.value,
        title: homebrewTitle.value || defaultHomebrewTitle(selectedHomebrewTemplate.value)
      }
    })

    homebrewCreatedEntity.value = res?.entity || null
    homebrewSuccess.value = `Created ${res?.entity?.title || 'homebrew draft'}.`

    if (res?.entity?.id) {
      router.push(`/worlds/${worldId.value}/entities/${res.entity.id}`)
    }
  } catch (error: any) {
    homebrewError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to create homebrew draft.'
  } finally {
    homebrewCreating.value = false
  }
}

watch(
  () => [worldId.value, homebrewType.value],
  () => {
    homebrewSelectedTemplateId.value = ''
    homebrewTitle.value = ''
    homebrewTemplateSearch.value = ''
    homebrewCreatedEntity.value = null
    homebrewSuccess.value = ''
    void loadHomebrewTemplates()
  },
  { immediate: true }
)


const panels = [
  { key: 'overview', label: 'Overview', icon: 'i-lucide-layout-dashboard' },
  { key: 'party', label: 'Party / Cast', icon: 'i-lucide-users' },
  { key: 'grants', label: 'Grants', icon: 'i-lucide-gift' },
  { key: 'homebrew', label: 'Homebrew', icon: 'i-lucide-flask-conical' },
  { key: 'setup', label: 'Page Setup', icon: 'i-lucide-sliders-horizontal' },
  { key: 'transfers', label: 'Transfers', icon: 'i-lucide-arrow-left-right' },
  { key: 'relationships', label: 'Relationships', icon: 'i-lucide-share-2' }
] as const

const pageSetupSections = [
  {
    key: 'characters',
    title: 'Characters',
    description: 'Controls the characters and cast browsing page presentation.'
  },
  {
    key: 'locations',
    title: 'Locations',
    description: 'Controls the locations page presentation and background.'
  },
  {
    key: 'items',
    title: 'Items',
    description: 'Controls the item catalog page presentation and background.'
  },
  {
    key: 'spells',
    title: 'Spells',
    description: 'Controls the spell catalog page presentation and background.'
  },
  {
    key: 'species',
    title: 'Species',
    description: 'Controls the species page presentation and background.'
  },
  {
    key: 'classes',
    title: 'Classes',
    description: 'Controls the classes page presentation and background.'
  },
  {
    key: 'feats',
    title: 'Feats',
    description: 'Controls the feats page presentation and background.'
  },
  {
    key: 'enemies',
    title: 'Enemies',
    description: 'Controls the enemies page presentation and background.'
  },
  {
    key: 'maps',
    title: 'Maps',
    description: 'Controls the maps and world-map presentation background.'
  },
  {
    key: 'timelines',
    title: 'Timelines',
    description: 'Controls timeline list and timeline detail presentation.'
  },
  {
    key: 'entity-article',
    title: 'Entity Articles',
    description: 'Controls the full article page presentation and background.'
  },
  {
    key: 'game-admin',
    title: 'Game Admin',
    description: 'Reserved for Game Admin presentation controls and command-deck polish.'
  }
] as const

const selectedPageSetupKey = ref('characters')

const selectedPageSetup = computed(() =>
  pageSetupSections.find((section) => section.key === selectedPageSetupKey.value) || pageSetupSections[0]
)


watch(
  grantTargets,
  (targets) => {
    const first = targets[0]
    if (!grantTargetEntityId.value && first) grantTargetEntityId.value = entityId(first)
    if (!currencyTargetEntityId.value && first) currencyTargetEntityId.value = entityId(first)
  },
  { immediate: true }
)

watch(itemSearch, () => {
  if (itemSearchTimer) clearTimeout(itemSearchTimer)

  itemSearchTimer = setTimeout(() => {
    void searchItems()
  }, 180)
})

onBeforeUnmount(() => {
  if (itemSearchTimer) clearTimeout(itemSearchTimer)
})

function entityId(entity: any) {
  return String(entity?.id || entity?.entityId || entity?.entity_id || '').trim()
}

function entityType(entity: any) {
  return String(entity?.entity_type || entity?.entityType || entity?.type || 'entity').trim().toLowerCase()
}

function titleCase(value: any) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function entityTypeLabel(entity: any) {
  return titleCase(entityType(entity))
}

function entityTitle(entity: any) {
  return String(entity?.title || entity?.name || 'Untitled')
}

function entitySummary(entity: any) {
  return String(entity?.summary || entity?.description || '').trim()
}

function entityImageUrl(entity: any) {
  return String(entity?.imageUrl || entity?.image_url || entity?.image || '').trim()
}

function initialsFor(value: any) {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  return parts.length
    ? parts.map((part) => part[0]?.toUpperCase() || '').join('')
    : '?'
}

function openEntityContext(entity: any) {
  selectedContextEntity.value = entity
  contextDrawerOpen.value = true
}

function closeEntityContext() {
  selectedContextEntity.value = null
  contextDrawerOpen.value = false
}

function openArticle(entity: any) {
  const id = entityId(entity)
  if (id) router.push(`/worlds/${worldId.value}/entities/${id}`)
}

function openSheet(entity: any) {
  const id = entityId(entity)
  if (id) router.push(`/worlds/${worldId.value}/entities/${id}/sheet`)
}

function relationshipOther(relationship: any) {
  return relationship?.other || relationship?.target || relationship?.source || null
}

function relationshipTitle(relationship: any) {
  const other = relationshipOther(relationship)
  return other ? entityTitle(other) : 'Unknown Entity'
}

function relationshipTypeLabel(relationship: any) {
  return titleCase(relationship?.relationshipType || relationship?.relationship_type || 'related')
}

function transferStatusClass(status: any) {
  const key = String(status || '').toLowerCase()

  if (['offered', 'pending'].includes(key)) return 'border-amber-300/25 bg-amber-400/10 text-amber-100'
  if (['completed', 'granted'].includes(key)) return 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
  if (['declined', 'cancelled'].includes(key)) return 'border-slate-300/20 bg-slate-400/10 text-slate-200'

  return 'border-[rgba(201,164,90,0.20)] bg-[rgba(201,164,90,0.10)] text-[#f5e7bd]'
}

function transferPartyLine(transfer: any) {
  const source = transfer?.source?.title || transfer?.source?.name || 'Unknown'
  const target = transfer?.target?.title || transfer?.target?.name || 'Unknown'
  return `${source} -> ${target}`
}

function itemProfile(item: any) {
  return item?.profile || {}
}

function itemTypeLine(item: any) {
  const profile = itemProfile(item)

  return [
    profile.displayType,
    profile.rarity,
    profile.source
  ]
    .filter(Boolean)
    .join(' / ')
}

async function searchItems() {
  const q = itemSearch.value.trim()

  if (!q || q.length < 2) {
    itemResults.value = []
    return
  }

  itemSearchPending.value = true

  try {
    const res: any = await $fetch(`/api/worlds/${worldId.value}/items/normalized`, {
      query: {
        q,
        limit: 12
      }
    })

    itemResults.value = Array.isArray(res?.items) ? res.items : []
  } catch {
    itemResults.value = []
  } finally {
    itemSearchPending.value = false
  }
}

function selectItem(item: any) {
  selectedItem.value = item
  itemSearch.value = item?.title || item?.profile?.name || ''
  itemResults.value = []
}

function clearGrantMessages() {
  grantError.value = ''
  grantSuccess.value = ''
}

async function grantItem() {
  clearGrantMessages()
  grantSaving.value = true

  try {
    const targetEntityId = grantTargetEntityId.value
    const itemEntityId = selectedItem.value?.id ? String(selectedItem.value.id) : ''
    const name = customItemName.value.trim() || selectedItem.value?.title || selectedItem.value?.profile?.name || ''

    await $fetch(`/api/worlds/${worldId.value}/admin/grants`, {
      method: 'POST',
      body: {
        action: 'item',
        targetEntityId,
        itemEntityId: itemEntityId || null,
        name,
        quantity: itemGrantQuantity.value,
        notes: itemGrantNotes.value
      }
    })

    grantSuccess.value = `Granted ${name || 'item'}.`
    customItemName.value = ''
    itemGrantQuantity.value = '1'
    selectedItem.value = null
    await refreshTransfers()
  } catch (error: any) {
    grantError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to grant item.'
  } finally {
    grantSaving.value = false
  }
}

async function grantCurrency() {
  clearGrantMessages()
  grantSaving.value = true

  try {
    await $fetch(`/api/worlds/${worldId.value}/admin/grants`, {
      method: 'POST',
      body: {
        action: 'currency',
        targetEntityId: currencyTargetEntityId.value,
        currency: currencyType.value,
        amount: currencyAmount.value,
        notes: currencyNotes.value
      }
    })

    grantSuccess.value = `Granted ${currencyAmount.value} ${currencyType.value}.`
    currencyAmount.value = '1'
    await refreshTransfers()
  } catch (error: any) {
    grantError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to grant currency.'
  } finally {
    grantSaving.value = false
  }
}

async function refreshAdmin() {
  await Promise.all([
    refreshParty(),
    refreshRelationships(),
    refreshTransfers()
  ])
}
</script>

<template>
  <div class="game-admin-space relative isolate h-full overflow-y-auto bg-[#020712] text-[#efe2bd]">
    <WorldChooserThpace mode="sticky" />
    <div
      class="relative z-10 -mt-[100dvh] mx-auto max-w-[1700px] p-6 transition-[margin,max-width] duration-200"
      :class="contextDrawerOpen ? 'xl:mr-[404px] xl:max-w-none' : ''"
    >
      <section class="eldra-filigree rounded-none border border-[rgba(201,164,90,0.30)] bg-[linear-gradient(to_bottom,rgba(18,16,12,0.74),rgba(7,7,6,0.54))] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.22)] backdrop-blur-xl">
        <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
              World Control
            </div>

            <h1 class="mt-2 text-4xl font-semibold text-white">
              Game Admin
            </h1>

            <p class="mt-3 max-w-3xl text-sm leading-6 text-[#d8ceb8]">
              DM cockpit for party state, grants, transfers, relationships, and campaign cleanup.
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.28)] bg-[rgba(20,17,12,0.72)] px-4 py-3 text-sm font-semibold text-[#fff7df] transition hover:border-[rgba(201,164,90,0.52)] hover:bg-[rgba(201,164,90,0.12)]"
              @click="refreshAdmin"
            >
              Refresh Admin
            </button>

            <NuxtLink
              :to="`/worlds/${worldId}/characters`"
              class="rounded-none border border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.58)] px-4 py-3 text-sm font-semibold text-[#d8ceb8] transition hover:border-[rgba(201,164,90,0.38)] hover:text-[#fff7df]"
            >
              Characters
            </NuxtLink>
          </div>
        </div>

        <div class="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article
            v-for="card in healthCards"
            :key="card.label"
            class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.42)] p-4"
          >
            <div class="text-xs uppercase tracking-[0.24em] text-[#9f9278]">
              {{ card.label }}
            </div>

            <div class="mt-2 text-3xl font-semibold text-white">
              {{ card.value }}
            </div>

            <div class="mt-1 text-xs text-[#d8ceb8]">
              {{ card.sub }}
            </div>
          </article>
        </div>

        <div class="mt-6 overflow-x-auto">
          <div class="flex min-w-max gap-2">
            <button
              v-for="panel in panels"
              :key="panel.key"
              type="button"
              class="inline-flex items-center gap-2 rounded-none border px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] transition"
              :class="activePanel === panel.key
                ? 'border-[rgba(201,164,90,0.64)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
                : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.52)] text-[#d8ceb8] hover:border-[rgba(201,164,90,0.38)] hover:text-[#fff7df]'"
              @click="activePanel = panel.key"
            >
              <UIcon :name="panel.icon" class="h-4 w-4" />
              <span>{{ panel.label }}</span>
            </button>
          </div>
        </div>
      </section>

      <section
        v-if="activePanel === 'overview'"
        class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]"
      >
        <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                Fast Table View
              </div>
              <h2 class="mt-2 text-2xl font-semibold text-white">
                Party / Cast
              </h2>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
              @click="activePanel = 'party'"
            >
              View All
            </button>
          </div>

          <div
            v-if="partyPending"
            class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-5 text-sm text-[#9f9278]"
          >
            Loading cast...
          </div>

          <div
            v-else
            class="mt-4 grid gap-3 md:grid-cols-2"
          >
            <article
              v-for="entity in filteredParty.slice(0, 6)"
              :key="entityId(entity)"
              class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.42)] p-3"
            >
              <button
                type="button"
                class="flex w-full items-start gap-3 text-left"
                @click="openEntityContext(entity)"
              >
                <div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] text-lg font-semibold text-[#d8ceb8]">
                  <img
                    v-if="entityImageUrl(entity)"
                    :src="entityImageUrl(entity)"
                    :alt="entityTitle(entity)"
                    class="h-full w-full object-cover object-top"
                  >
                  <span v-else>{{ initialsFor(entityTitle(entity)) }}</span>
                </div>

                <div class="min-w-0">
                  <div class="truncate text-base font-semibold text-white">
                    {{ entityTitle(entity) }}
                  </div>
                  <div class="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                    {{ entityTypeLabel(entity) }}
                  </div>
                  <p class="mt-2 line-clamp-2 text-xs leading-5 text-[#d8ceb8]">
                    {{ entitySummary(entity) || 'No summary yet.' }}
                  </p>
                </div>
              </button>
            </article>
          </div>
        </div>

        <div class="grid gap-6">
          <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Pending Movement
            </div>
            <h2 class="mt-2 text-2xl font-semibold text-white">
              Transfers
            </h2>

            <div
              v-if="transfersPending"
              class="mt-4 text-sm text-[#9f9278]"
            >
              Loading transfers...
            </div>

            <div
              v-else-if="!transfers.length"
              class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.18)] p-4 text-sm text-[#9f9278]"
            >
              No transfers yet.
            </div>

            <div
              v-else
              class="mt-4 grid gap-2"
            >
              <article
                v-for="transfer in transfers.slice(0, 6)"
                :key="transfer.id"
                class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(8,17,27,0.38)] p-3"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="truncate text-sm font-semibold text-white">
                      {{ transfer.itemName }} x{{ transfer.quantity || 1 }}
                    </div>
                    <div class="mt-1 text-xs text-[#9f9278]">
                      {{ transferPartyLine(transfer) }}
                    </div>
                  </div>

                  <span
                    class="shrink-0 rounded-none border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                    :class="transferStatusClass(transfer.status)"
                  >
                    {{ transfer.status }}
                  </span>
                </div>
              </article>
            </div>
          </div>

          <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Relationship Activity
            </div>
            <h2 class="mt-2 text-2xl font-semibold text-white">
              Recent Links
            </h2>

            <div
              v-if="relationshipsPending"
              class="mt-4 text-sm text-[#9f9278]"
            >
              Loading relationships...
            </div>

            <div
              v-else-if="!relationships.length"
              class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.18)] p-4 text-sm text-[#9f9278]"
            >
              No relationships yet.
            </div>

            <div
              v-else
              class="mt-4 grid gap-2"
            >
              <button
                v-for="relationship in relationships.slice(0, 6)"
                :key="relationship.id"
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(8,17,27,0.38)] p-3 text-left transition hover:border-[rgba(201,164,90,0.36)]"
                @click="relationshipOther(relationship) && openEntityContext(relationshipOther(relationship))"
              >
                <div class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                  {{ relationshipTypeLabel(relationship) }}
                </div>
                <div class="mt-1 text-sm font-semibold text-white">
                  {{ relationship.displayLabel || relationship.label || 'related to' }}
                  <span class="text-[#9f9278]">-></span>
                  {{ relationshipTitle(relationship) }}
                </div>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section
        v-else-if="activePanel === 'homebrew'"
        class="mt-6 grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]"
      >
        <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Homebrew Forge
          </div>
          <h2 class="mt-2 text-2xl font-semibold text-white">
            New Homebrew
          </h2>
          <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
            Create a draft entity from an existing imported or homebrew template. Eldra clones the structured mechanics so this can become Foundry-ready later.
          </p>

          <div class="mt-5 grid gap-3">
            <button
              v-for="type in homebrewTypes"
              :key="type.key"
              type="button"
              class="rounded-none border p-3 text-left transition"
              :class="homebrewType === type.key
                ? 'border-[rgba(201,164,90,0.60)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
                : 'border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.42)] text-[#d8ceb8] hover:border-[rgba(201,164,90,0.36)] hover:bg-[rgba(201,164,90,0.08)]'"
              @click="homebrewType = type.key"
            >
              <div class="flex items-start gap-3">
                <UIcon :name="type.icon" class="mt-0.5 h-4 w-4 shrink-0 text-[#c9a45a]" />
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-white">{{ type.label }}</div>
                  <div class="mt-1 text-xs leading-5 text-[#9f9278]">{{ type.description }}</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div class="grid gap-6">
          <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                  Template Library
                </div>
                <h2 class="mt-2 text-2xl font-semibold text-white">
                  {{ selectedHomebrewType.label }} Templates
                </h2>
                <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                  Pick an existing {{ selectedHomebrewType.label.toLowerCase() }} as the starting mechanical shape.
                </p>
              </div>

              <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(201,164,90,0.08)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#d8ceb8]">
                {{ homebrewTemplates.length }} templates
              </div>
            </div>

            <input
              v-model="homebrewTemplateSearch"
              class="eldra-input mt-5 w-full rounded-none px-3 py-3 text-sm text-white"
              :placeholder="`Search ${selectedHomebrewType.label.toLowerCase()} templates...`"
            >

            <div
              v-if="homebrewTemplatesPending"
              class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-5 text-sm text-[#9f9278]"
            >
              Loading templates...
            </div>

            <div
              v-else-if="!homebrewFilteredTemplates.length"
              class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-5 text-sm text-[#9f9278]"
            >
              No templates found for this type.
            </div>

            <div
              v-else
              class="mt-4 grid max-h-[520px] gap-3 overflow-y-auto pr-1"
            >
              <button
                v-for="template in homebrewFilteredTemplates"
                :key="template.id"
                type="button"
                class="rounded-none border p-4 text-left transition"
                :class="String(homebrewSelectedTemplateId) === String(template.id)
                  ? 'border-[rgba(201,164,90,0.60)] bg-[rgba(201,164,90,0.16)]'
                  : 'border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.42)] hover:border-[rgba(201,164,90,0.36)] hover:bg-[rgba(201,164,90,0.08)]'"
                @click="selectHomebrewTemplate(template)"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-lg font-semibold text-white">
                      {{ template.title }}
                    </div>
                    <div class="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                      {{ homebrewTemplateSubtitle(template) || selectedHomebrewType.label }}
                    </div>
                  </div>

                  <span class="shrink-0 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#d8ceb8]">
                    {{ template.blockCount || 0 }} blocks
                  </span>
                </div>

                <p
                  v-if="template.summary"
                  class="mt-3 line-clamp-2 text-sm leading-6 text-[#d8ceb8]"
                >
                  {{ template.summary }}
                </p>

                <div
                  v-if="template.coreBlockKeys?.length"
                  class="mt-3 flex flex-wrap gap-2"
                >
                  <span
                    v-for="key in template.coreBlockKeys.slice(0, 5)"
                    :key="`${template.id}-${key}`"
                    class="rounded-none border border-[rgba(65,82,103,0.58)] bg-[rgba(8,17,27,0.58)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9f9278]"
                  >
                    {{ key }}
                  </span>
                </div>
              </button>
            </div>
          </div>

          <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Draft Setup
            </div>
            <h2 class="mt-2 text-2xl font-semibold text-white">
              Create {{ selectedHomebrewType.label }} Draft
            </h2>

            <div
              v-if="selectedHomebrewTemplate"
              class="mt-4 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.42)] p-4"
            >
              <div class="text-sm font-semibold text-white">
                Template: {{ selectedHomebrewTemplate.title }}
              </div>
              <div class="mt-1 text-xs text-[#9f9278]">
                {{ homebrewTemplateSubtitle(selectedHomebrewTemplate) || 'Structured template selected.' }}
              </div>
            </div>

            <label class="mt-5 block">
              <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Draft Title</span>
              <input
                v-model="homebrewTitle"
                class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                :placeholder="selectedHomebrewTemplate ? defaultHomebrewTitle(selectedHomebrewTemplate) : 'Choose a template first...'"
              >
            </label>

            <div
              v-if="homebrewError"
              class="mt-4 rounded-none border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100"
            >
              {{ homebrewError }}
            </div>

            <div
              v-if="homebrewSuccess"
              class="mt-4 rounded-none border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm leading-6 text-emerald-100"
            >
              {{ homebrewSuccess }}
            </div>

            <div class="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                class="eldra-button rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
                :disabled="homebrewCreating || !selectedHomebrewTemplate"
                @click="createHomebrewDraft"
              >
                {{ homebrewCreating ? 'Creating Draft...' : 'Create Draft & Open Article' }}
              </button>

              <button
                v-if="homebrewCreatedEntity?.id"
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-4 py-3 text-sm font-semibold text-[#fff7df]"
                @click="router.push(`/worlds/${worldId}/entities/${homebrewCreatedEntity.id}`)"
              >
                Open Draft
              </button>
            </div>

            <div class="mt-5 rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(4,8,14,0.40)] p-4 text-xs leading-6 text-[#9f9278]">
              V1 creates a real Eldra entity, marks it as homebrew, clones the template's mechanical core blocks, and opens the article for editing. The next pass adds type-specific mechanical forms.
            </div>
          </div>
        </div>
      </section>

      <section
        v-else-if="activePanel === 'party'"
        class="mt-6"
      >
        <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                Party / Cast
              </div>
              <h2 class="mt-2 text-2xl font-semibold text-white">
                Characters, NPCs, and Sheets
              </h2>
              <p class="mt-2 text-sm text-[#d8ceb8]">
                Fast access to articles, sheets, and context details.
              </p>
            </div>

            <input
              v-model="partySearch"
              class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white xl:w-[420px]"
              placeholder="Search party, NPCs, sheets..."
            >
          </div>

          <div
            v-if="partyPending"
            class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
          >
            Loading cast...
          </div>

          <div
            v-else
            class="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3"
          >
            <article
              v-for="entity in filteredParty"
              :key="entityId(entity)"
              class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.42)] p-4"
            >
              <div class="flex items-start gap-4">
                <button
                  type="button"
                  class="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] text-xl font-semibold text-[#d8ceb8]"
                  @click="openEntityContext(entity)"
                >
                  <img
                    v-if="entityImageUrl(entity)"
                    :src="entityImageUrl(entity)"
                    :alt="entityTitle(entity)"
                    class="h-full w-full object-cover object-top"
                  >
                  <span v-else>{{ initialsFor(entityTitle(entity)) }}</span>
                </button>

                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      class="min-w-0 text-left"
                      @click="openEntityContext(entity)"
                    >
                      <h3 class="truncate text-xl font-semibold text-white">
                        {{ entityTitle(entity) }}
                      </h3>
                      <div class="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                        {{ entityTypeLabel(entity) }}
                      </div>
                    </button>

                    <span class="shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#d8ceb8]">
                      {{ entityTypeLabel(entity) }}
                    </span>
                  </div>

                  <p class="mt-3 line-clamp-3 text-sm leading-6 text-[#d8ceb8]">
                    {{ entitySummary(entity) || 'No summary yet.' }}
                  </p>

                  <div class="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
                      @click="openEntityContext(entity)"
                    >
                      Context
                    </button>

                    <button
                      type="button"
                      class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
                      @click="openArticle(entity)"
                    >
                      Article
                    </button>

                    <button
                      type="button"
                      class="rounded-none border border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.58)] px-3 py-2 text-xs font-semibold text-[#d8ceb8]"
                      @click="openSheet(entity)"
                    >
                      Sheet
                    </button>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section
        v-else-if="activePanel === 'grants'"
        class="mt-6 grid gap-6 xl:grid-cols-2"
      >
        <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Grant Item
          </div>
          <h2 class="mt-2 text-2xl font-semibold text-white">
            Send Gear
          </h2>
          <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
            Add a normalized item or quick custom row directly to a character sheet.
          </p>

          <div class="mt-5 grid gap-4">
            <label>
              <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Target</span>
              <select
                v-model="grantTargetEntityId"
                class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
              >
                <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose character...</option>
                <option
                  v-for="target in grantTargets"
                  :key="entityId(target)"
                  :value="entityId(target)"
                  class="bg-[#090909] text-[#f5e7bd]"
                >
                  {{ entityTitle(target) }} - {{ entityTypeLabel(target) }}
                </option>
              </select>
            </label>

            <label>
              <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Search Imported Items</span>
              <input
                v-model="itemSearch"
                class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                placeholder="Longsword, healing potion, wand..."
              >
            </label>

            <div
              v-if="itemSearchPending"
              class="rounded-none border border-dashed border-[rgba(201,164,90,0.18)] p-3 text-xs text-[#9f9278]"
            >
              Searching items...
            </div>

            <div
              v-if="itemResults.length"
              class="max-h-80 overflow-y-auto rounded-none border border-[rgba(201,164,90,0.18)]"
            >
              <button
                v-for="item in itemResults"
                :key="item.id"
                type="button"
                class="block w-full border-b border-[rgba(201,164,90,0.10)] bg-[rgba(8,17,27,0.58)] px-3 py-3 text-left last:border-b-0 hover:bg-[rgba(201,164,90,0.08)]"
                @click="selectItem(item)"
              >
                <span class="block text-sm font-semibold text-white">{{ item.title }}</span>
                <span class="mt-1 block text-xs text-[#9f9278]">{{ itemTypeLine(item) || 'Item' }}</span>
              </button>
            </div>

            <div
              v-if="selectedItem"
              class="rounded-none border border-emerald-300/20 bg-emerald-400/10 p-3 text-sm text-emerald-100"
            >
              Selected imported item: {{ selectedItem.title }}
            </div>

            <label>
              <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Custom Name</span>
              <input
                v-model="customItemName"
                class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                placeholder="Used if no imported item is selected"
              >
            </label>

            <div class="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
              <label>
                <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Quantity</span>
                <input
                  v-model="itemGrantQuantity"
                  inputmode="numeric"
                  class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                >
              </label>

              <label>
                <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Notes</span>
                <input
                  v-model="itemGrantNotes"
                  class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                >
              </label>
            </div>

            <button
              type="button"
              class="eldra-button rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
              :disabled="grantSaving || !grantTargetEntityId || (!selectedItem && !customItemName.trim())"
              @click="grantItem"
            >
              {{ grantSaving ? 'Granting...' : 'Grant Item' }}
            </button>
          </div>
        </div>

        <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Grant Currency
          </div>
          <h2 class="mt-2 text-2xl font-semibold text-white">
            Send Coin
          </h2>
          <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
            Adds to the existing currency row if the character already has one.
          </p>

          <div
            v-if="grantError"
            class="mt-5 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
          >
            {{ grantError }}
          </div>

          <div
            v-if="grantSuccess"
            class="mt-5 rounded-none border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100"
          >
            {{ grantSuccess }}
          </div>

          <div class="mt-5 grid gap-4">
            <label>
              <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Target</span>
              <select
                v-model="currencyTargetEntityId"
                class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
              >
                <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose character...</option>
                <option
                  v-for="target in grantTargets"
                  :key="entityId(target)"
                  :value="entityId(target)"
                  class="bg-[#090909] text-[#f5e7bd]"
                >
                  {{ entityTitle(target) }} - {{ entityTypeLabel(target) }}
                </option>
              </select>
            </label>

            <div class="grid gap-4 md:grid-cols-2">
              <label>
                <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Currency</span>
                <select
                  v-model="currencyType"
                  class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                >
                  <option value="Gold" class="bg-[#090909] text-[#f5e7bd]">Gold</option>
                  <option value="Silver" class="bg-[#090909] text-[#f5e7bd]">Silver</option>
                  <option value="Copper" class="bg-[#090909] text-[#f5e7bd]">Copper</option>
                </select>
              </label>

              <label>
                <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Amount</span>
                <input
                  v-model="currencyAmount"
                  inputmode="numeric"
                  class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                >
              </label>
            </div>

            <label>
              <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Notes</span>
              <input
                v-model="currencyNotes"
                class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
              >
            </label>

            <button
              type="button"
              class="eldra-button rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
              :disabled="grantSaving || !currencyTargetEntityId || !currencyAmount"
              @click="grantCurrency"
            >
              {{ grantSaving ? 'Granting...' : 'Grant Currency' }}
            </button>
          </div>
        </div>
      </section>


      <section
        v-else-if="activePanel === 'setup'"
        class="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]"
      >
        <aside class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Page Setup
          </div>

          <h2 class="mt-2 text-2xl font-semibold text-white">
            Presentation Targets
          </h2>

          <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
            Choose a world page, then set its presentation mode and background from one cockpit.
          </p>

          <div class="mt-5 grid gap-2">
            <button
              v-for="section in pageSetupSections"
              :key="section.key"
              type="button"
              class="rounded-none border px-3 py-3 text-left transition"
              :class="selectedPageSetupKey === section.key
                ? 'border-[rgba(201,164,90,0.62)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
                : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.42)] text-[#d8ceb8] hover:border-[rgba(201,164,90,0.34)] hover:text-[#fff7df]'"
              @click="selectedPageSetupKey = section.key"
            >
              <span class="block text-sm font-semibold">
                {{ section.title }}
              </span>

              <span class="mt-1 block text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                {{ section.key }}
              </span>
            </button>
          </div>
        </aside>

        <div class="grid gap-6">
          <section class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                  Selected Page
                </div>

                <h2 class="mt-2 text-2xl font-semibold text-white">
                  {{ selectedPageSetup.title }}
                </h2>

                <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                  {{ selectedPageSetup.description }}
                </p>
              </div>

              <div class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#f5e7bd]">
                {{ selectedPageSetup.key }}
              </div>
            </div>
          </section>

          <WorldPagePresentationPanel
            isolated
            :world-id="worldId"
            :page-key="selectedPageSetup.key"
            :title="`${selectedPageSetup.title} Presentation`"
            :description="selectedPageSetup.description"
          />

          <section class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] bg-[rgba(8,17,27,0.34)] p-5">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Coming Later
            </div>

            <div class="mt-3 grid gap-3 md:grid-cols-2">
              <div class="rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(20,17,12,0.44)] p-3">
                <div class="text-sm font-semibold text-white">Page Visibility</div>
                <p class="mt-1 text-xs leading-5 text-[#9f9278]">
                  Player-visible, GM-only, hidden draft, and public presentation rules.
                </p>
              </div>

              <div class="rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(20,17,12,0.44)] p-3">
                <div class="text-sm font-semibold text-white">Default View</div>
                <p class="mt-1 text-xs leading-5 text-[#9f9278]">
                  Card/list/grid defaults, pinned filters, and page-specific layout preferences.
                </p>
              </div>

              <div class="rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(20,17,12,0.44)] p-3">
                <div class="text-sm font-semibold text-white">Section Toggles</div>
                <p class="mt-1 text-xs leading-5 text-[#9f9278]">
                  Show, hide, reorder, or rename world navigation sections.
                </p>
              </div>

              <div class="rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(20,17,12,0.44)] p-3">
                <div class="text-sm font-semibold text-white">Theme Presets</div>
                <p class="mt-1 text-xs leading-5 text-[#9f9278]">
                  Named page themes and reusable background/presentation presets.
                </p>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section
        v-else-if="activePanel === 'transfers'"
        class="mt-6"
      >
        <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                Transfers
              </div>
              <h2 class="mt-2 text-2xl font-semibold text-white">
                Recent Offers and Grants
              </h2>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
              @click="refreshTransfers"
            >
              Refresh
            </button>
          </div>

          <div
            v-if="transfersPending"
            class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
          >
            Loading transfers...
          </div>

          <div
            v-else-if="!transfers.length"
            class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
          >
            No transfer history yet.
          </div>

          <div
            v-else
            class="mt-5 overflow-hidden rounded-none border border-[rgba(201,164,90,0.18)]"
          >
            <div class="hidden grid-cols-[1.2fr_1fr_1fr_120px] gap-3 border-b border-[rgba(201,164,90,0.14)] bg-[rgba(8,17,27,0.60)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9f9278] xl:grid">
              <div>Item</div>
              <div>From</div>
              <div>To</div>
              <div>Status</div>
            </div>

            <article
              v-for="transfer in transfers"
              :key="transfer.id"
              class="grid gap-3 border-b border-[rgba(201,164,90,0.10)] px-3 py-3 last:border-b-0 xl:grid-cols-[1.2fr_1fr_1fr_120px] xl:items-center"
            >
              <div>
                <div class="font-semibold text-white">{{ transfer.itemName }} x{{ transfer.quantity || 1 }}</div>
                <div
                  v-if="transfer.message"
                  class="mt-1 text-xs text-[#9f9278]"
                >
                  {{ transfer.message }}
                </div>
              </div>

              <button
                type="button"
                class="text-left text-sm text-[#d8ceb8] hover:text-[#fff7df]"
                @click="transfer.source && openEntityContext(transfer.source)"
              >
                {{ transfer.source?.title || 'Unknown' }}
              </button>

              <button
                type="button"
                class="text-left text-sm text-[#d8ceb8] hover:text-[#fff7df]"
                @click="transfer.target && openEntityContext(transfer.target)"
              >
                {{ transfer.target?.title || 'Unknown' }}
              </button>

              <span
                class="w-fit rounded-none border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                :class="transferStatusClass(transfer.status)"
              >
                {{ transfer.status }}
              </span>
            </article>
          </div>
        </div>
      </section>

      <section
        v-else-if="activePanel === 'relationships'"
        class="mt-6"
      >
        <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                Relationships
              </div>
              <h2 class="mt-2 text-2xl font-semibold text-white">
                World Relationship Feed
              </h2>
              <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                Quick inspection. Editing still belongs on the full article page.
              </p>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
              @click="refreshRelationships"
            >
              Refresh
            </button>
          </div>

          <div
            v-if="relationshipsPending"
            class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
          >
            Loading relationships...
          </div>

          <div
            v-else-if="!relationships.length"
            class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
          >
            No relationships yet.
          </div>

          <div
            v-else
            class="mt-5 grid gap-3 md:grid-cols-2"
          >
            <article
              v-for="relationship in relationships"
              :key="relationship.id"
              class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.42)] p-4"
            >
              <div class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                {{ relationship.direction || 'relationship' }} / {{ relationshipTypeLabel(relationship) }}
              </div>

              <button
                type="button"
                class="mt-2 block text-left text-base font-semibold text-white hover:text-[#fff7df]"
                @click="relationshipOther(relationship) && openEntityContext(relationshipOther(relationship))"
              >
                {{ relationship.displayLabel || relationship.label || 'related to' }}
                <span class="text-[#9f9278]">-></span>
                {{ relationshipTitle(relationship) }}
              </button>

              <p
                v-if="relationship.summary"
                class="mt-2 text-sm leading-6 text-[#d8ceb8]"
              >
                {{ relationship.summary }}
              </p>
            </article>
          </div>
        </div>
      </section>
    </div>

    <WorldEntityContextDrawer
      :open="contextDrawerOpen"
      :entity="selectedContextEntity"
      :world-id="worldId"
      :mode="mode"
      read-more-label="Read More"
      @close="closeEntityContext"
      @read-more="openArticle"
      @open-mention="openEntityContext"
    />
  </div>
</template>
