<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace',
  middleware: 'admin',
  // Phase 3C: Game Admin floats in Eldra's animated universe (the World
  // Selection backdrop), drawn by the layout behind the whole workspace.
  eldraBackdrop: 'universe'
})

import WorldEntityContextDrawer from '~/components/world/WorldEntityContextDrawer.vue'
import AdminSectionRail from '~/components/admin/AdminSectionRail.vue'
import AdminHomebrewForgePanel from '~/components/admin/homebrew/AdminHomebrewForgePanel.vue'
import AdminRulesPanel from '~/components/admin/rules/AdminRulesPanel.vue'
import AdminMembersPanel from '~/components/admin/members/AdminMembersPanel.vue'
import AdminContentPacksPanel from '~/components/admin/content-packs/AdminContentPacksPanel.vue'
import AdminProjectHealthPanel from '~/components/admin/health/AdminProjectHealthPanel.vue'
import { GAME_ADMIN_SECTIONS, type GameAdminPanelKey } from '~/components/admin/gameAdminSections'

const route = useRoute()
const router = useRouter()

const worldId = computed(() => String(route.params.id || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const activePanel = ref<GameAdminPanelKey>('overview')
const partySearch = ref('')
const selectedContextEntity = ref<any | null>(null)
const contextDrawerOpen = ref(false)

// PLAYER MANAGEMENT -- account ownership + deletion. Both are genuine
// architecture blockers, not an oversight -- see this file's own "Account
// Owner" / "Delete Character" markup below for the exact reasons (no
// `entities.owner_account_id` column exists anywhere in the real schema --
// confirmed by tracing, not assumed -- and deletion has no referential-
// integrity story for character_sheets/entity_relationships/inventory
// transfers, which are plain integer columns with no Directus-level
// relation or cascade configured). Kept visible, not hidden: this task's
// own instruction is "leave the UI action clearly unavailable rather than
// risking orphaned data," which is a different thing from omitting it.
// Keyed by entity id so expanding one card's management panel doesn't
// affect any other card's.
const managingEntityId = ref<string | null>(null)
function toggleManage(entity: any) {
  const id = entityId(entity)
  managingEntityId.value = managingEntityId.value === id ? null : id
}

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




// PROCESS 2.0 -- GAME ADMIN IA & PLAYER OPERATIONS: order, labels, and the
// panel-key mapping (party->player, members->accounts, grants+transfers->
// inventory) now live in gameAdminSections.ts, the one place both this
// page's `v-else-if` chain and a focused test (gameAdminSections.test.ts)
// read, so the two can never silently drift from each other.
const panels = GAME_ADMIN_SECTIONS

const pageSetupSections = [
  {
    key: 'characters',
    title: 'Characters',
    description: 'Controls the character roster and cast browsing page presentation -- cards, list, filters. Does not affect an individual Character Sheet; see the separate Character Sheet entry for that.'
  },
  {
    key: 'character-sheet',
    title: 'Character Sheet',
    description: 'Controls the world backdrop and atmosphere shown behind the Character Sheet itself (the canonical /sheet route, and /sheet-v2), separate from the Characters roster. The legacy /entities/:id/sheet route uses the Entity Article page key instead.'
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
  if (id) router.push(`/worlds/${worldId.value}/characters/${id}/sheet`)
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
  <div class="game-admin-space relative isolate h-full overflow-hidden text-[#efe2bd]">
    <!-- Game Admin Refresh -- scroll ownership matches the Stages/Roll Tray
         ancestor chain exactly (see sheet-v2.vue's own comment at its outer
         flex row): this row never scrolls as a block, so the rail can stay
         `h-full` with no `position: sticky`. Only the content column below
         (`min-h-0 flex-1 overflow-y-auto`) scrolls. -->
    <div class="flex h-full min-w-0">
      <AdminSectionRail
        :sections="panels"
        :active-key="activePanel"
        @select="activePanel = $event as typeof activePanel"
      />

      <div class="relative z-10 min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div
          class="mx-auto max-w-[1700px] p-6 transition-[margin,max-width] duration-200"
          :class="contextDrawerOpen ? 'xl:mr-[404px] xl:max-w-none' : ''"
        >
          <!-- Game Admin Workspace Cleanup: the old persistent "World
               Control / Game Admin" masthead (title/subtitle + health-card
               row shown above every section) is gone -- the Sections rail
               already carries navigation context, and repeating the page
               title above every panel wasted vertical space. Refresh Admin,
               the Characters shortcut, and the health cards move into the
               Overview section only, where they're actually Overview
               content; other sections now start right at the top of the
               scroll column. -->
          <div
            v-if="activePanel === 'overview'"
            class="mt-6 grid gap-6"
          >
            <div class="flex flex-wrap items-center justify-end gap-2">
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

            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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

      <section
        class="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]"
      >
        <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                Fast Table View
              </div>
              <h2 class="mt-2 text-2xl font-semibold text-white">
                Player Management
              </h2>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
              @click="activePanel = 'player'"
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
          </div>

            <AdminHomebrewForgePanel
        v-else-if="activePanel === 'homebrew'"
        :world-id="worldId"
      />

      <AdminProjectHealthPanel
        v-else-if="activePanel === 'health'"
        :world-id="worldId"
        @navigate="activePanel = $event as typeof activePanel"
      />

      <AdminRulesPanel
        v-else-if="activePanel === 'rules'"
        :world-id="worldId"
      />

      <AdminContentPacksPanel
        v-else-if="activePanel === 'content-packs'"
        :world-id="worldId"
      />

      <AdminMembersPanel
        v-else-if="activePanel === 'accounts'"
        :world-id="worldId"
      />

      <section
        v-else-if="activePanel === 'player'"
        class="mt-6"
      >
        <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                Player Management
              </div>
              <h2 class="mt-2 text-2xl font-semibold text-white">
                Characters, NPCs, and Sheets
              </h2>
              <p class="mt-2 text-sm text-[#d8ceb8]">
                Fast access to articles, sheets, context details, and (below) each
                character's account ownership and deletion status.
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

                    <button
                      type="button"
                      class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#9f9278]"
                      :aria-expanded="managingEntityId === entityId(entity)"
                      @click="toggleManage(entity)"
                    >
                      {{ managingEntityId === entityId(entity) ? 'Hide Account & Deletion' : 'Account & Deletion' }}
                    </button>
                  </div>

                  <!-- Account ownership + deletion -- both genuinely unavailable today; see
                       managingEntityId's own header above for the exact, traced reasons. This is
                       the UI the task asked for ("clearly unavailable," not absent), not a stub
                       left half-wired to a mutation that does not exist. -->
                  <div
                    v-if="managingEntityId === entityId(entity)"
                    class="mt-4 grid gap-3 border-t border-[rgba(201,164,90,0.16)] pt-4"
                  >
                    <div class="rounded-none border border-dashed border-[rgba(201,164,90,0.28)] bg-[rgba(20,17,12,0.55)] p-3">
                      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9f9278]">
                        Account Owner
                      </div>
                      <p class="mt-1.5 text-xs leading-5 text-[#d8ceb8]">
                        Not tracked yet. Eldra's World Membership model (Owner/GM/Worldbuilder/Player/Observer)
                        does not currently record which player account, if any, owns this specific character --
                        there is no owner column on this World's characters to assign. Changing that is a
                        schema decision (adding an account reference to characters) that needs explicit
                        approval before it is made, per this World's own architecture notes.
                      </p>
                      <button
                        type="button"
                        disabled
                        class="mt-2.5 cursor-not-allowed rounded-none border border-[rgba(201,164,90,0.18)] px-3 py-2 text-xs font-semibold text-[#6f6754]"
                      >
                        Change Owner (unavailable)
                      </button>
                    </div>

                    <div class="rounded-none border border-dashed border-red-500/25 bg-[rgba(20,17,12,0.55)] p-3">
                      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9f9278]">
                        Delete Character
                      </div>
                      <p class="mt-1.5 text-xs leading-5 text-[#d8ceb8]">
                        Not available yet. Deleting {{ entityTitle(entity) }} today would remove only this
                        character's own article record -- its character sheet, inventory/transfer history, and
                        any relationships to other characters are stored under a separate id with no enforced
                        link back to it, so they would be silently left behind rather than cleaned up. Safe
                        deletion needs that cleanup implemented and verified first.
                      </p>
                      <button
                        type="button"
                        disabled
                        class="mt-2.5 cursor-not-allowed rounded-none border border-red-500/20 px-3 py-2 text-xs font-semibold text-red-300/50"
                      >
                        Delete Character (unavailable)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <!-- Inventory Management -- Grants and Transfers merged (Process 2.0: GAME
           ADMIN IA & PLAYER OPERATIONS). Traced before merging, not assumed: both
           Grant Item/Grant Currency (below) and Transfers (further below, the same
           history list the old standalone Transfers panel showed, unchanged) are
           operations over a character's OWN inventory -- adding to it, or moving
           items between two characters' inventories. Neither touches a non-inventory
           grant (feat/ability grants, which this World has none of today), so
           nothing needed to be kept separate or relabeled. -->
      <section
        v-else-if="activePanel === 'inventory'"
        class="mt-6 grid gap-6"
      >
        <div class="grid gap-6 xl:grid-cols-2">
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
        </div>

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
          <WorldThemeSettingsPanel :world-id="worldId" />

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
      </div>
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
