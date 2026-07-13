<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

import WorldEntityContextDrawer from '~/components/world/WorldEntityContextDrawer.vue'

const route = useRoute()
const router = useRouter()

const worldId = computed(() => String(route.params.id || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const activePanel = ref<'overview' | 'party' | 'grants' | 'transfers' | 'relationships'>('overview')
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

const panels = [
  { key: 'overview', label: 'Overview', icon: 'i-lucide-layout-dashboard' },
  { key: 'party', label: 'Party / Cast', icon: 'i-lucide-users' },
  { key: 'grants', label: 'Grants', icon: 'i-lucide-gift' },
  { key: 'transfers', label: 'Transfers', icon: 'i-lucide-arrow-left-right' },
  { key: 'relationships', label: 'Relationships', icon: 'i-lucide-share-2' }
] as const

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
    <WorldChooserThpace :fixed="false" />
    <div
      class="relative z-10 mx-auto max-w-[1700px] p-6 transition-[margin,max-width] duration-200"
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
