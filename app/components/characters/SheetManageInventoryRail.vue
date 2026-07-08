<script setup lang="ts">
type InventoryAddForm = {
  itemEntityId?: string
  customName?: string
  quantity?: string | number
  notes?: string
}

const props = withDefaults(defineProps<{
  worldId?: string | number
  inventorySaving?: boolean
  inventorySaveError?: string
  inventorySaveSuccess?: string
  inventoryItemSearch?: string
  inventoryAddForm?: InventoryAddForm
  filteredInventoryItemOptions?: any[]
  carriedInventory?: any[]
  inventoryCount?: number
  inventoryQuantity?: (item: any) => number
}>(), {
  worldId: '',
  inventorySaving: false,
  inventorySaveError: '',
  inventorySaveSuccess: '',
  inventoryItemSearch: '',
  inventoryAddForm: () => ({
    itemEntityId: '',
    customName: '',
    quantity: '1',
    notes: ''
  }),
  filteredInventoryItemOptions: () => [],
  carriedInventory: () => [],
  inventoryCount: 0
})

const emit = defineEmits<{
  (event: 'update-search', value: string): void
  (event: 'update-item-entity-id', value: string): void
  (event: 'update-custom-name', value: string): void
  (event: 'update-quantity', value: string): void
  (event: 'update-notes', value: string): void
  (event: 'add-item'): void
  (event: 'open-item-detail', item: any): void
  (event: 'change-quantity', payload: { item: any; delta: number }): void
  (event: 'remove-item', item: any): void
  (event: 'toggle-equipped', item: any): void
  (event: 'toggle-attuned', item: any): void
}>()

const normalizedSearchUrl = computed(() => {
  const worldId = String(props.worldId || '').trim()
  if (!worldId) return null

  const q = encodeURIComponent(String(props.inventoryItemSearch || '').trim())

  return `/api/worlds/${worldId}/items/normalized?q=${q}&limit=35`
})

const {
  data: normalizedSearchPayload,
  pending: normalizedSearchPending
} = useFetch(
  () => normalizedSearchUrl.value,
  {
    default: () => ({
      items: []
    }),
    server: false,
    watch: [normalizedSearchUrl]
  }
)

const normalizedSearchOptions = computed(() => {
  const items = Array.isArray((normalizedSearchPayload.value as any)?.items)
    ? (normalizedSearchPayload.value as any).items
    : []

  return items
    .map((item: any) => ({
      ...item,
      id: String(item?.id || ''),
      title: String(item?.title || item?.profile?.name || 'Item'),
      profile: item?.profile || null,
      entity: {
        id: String(item?.id || ''),
        title: String(item?.title || item?.profile?.name || 'Item'),
        itemProfile: item?.profile || null,
        normalizedItem: item?.profile || null,
        profile: item?.profile || null
      }
    }))
    .filter((item: any) => item.id)
})

const searchResultOptions = computed(() =>
  normalizedSearchOptions.value.length
    ? normalizedSearchOptions.value
    : props.filteredInventoryItemOptions
)

const selectedImportedItem = computed(() =>
  searchResultOptions.value.find((option: any) =>
    String(option?.id || '') === String(props.inventoryAddForm?.itemEntityId || '')
  ) ||
  props.filteredInventoryItemOptions.find((option: any) =>
    String(option?.id || '') === String(props.inventoryAddForm?.itemEntityId || '')
  ) ||
  null
)

const visibleInventoryItemOptions = computed(() =>
  searchResultOptions.value.slice(0, 24)
)

function inputValue(event: Event) {
  return String((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)?.value || '')
}

function quantityFor(item: any) {
  const fromParent = props.inventoryQuantity?.(item)
  if (typeof fromParent === 'number' && Number.isFinite(fromParent)) return fromParent

  const parsed = Number(item?.quantity || 1)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1
}

function itemMetaLine(item: any) {
  return [
    item?.itemType,
    item?.container ? `Container: ${item.container}` : '',
    item?.equipped ? 'Equipped' : '',
    item?.attuned ? 'Attuned' : ''
  ]
    .filter(Boolean)
    .join(' / ')
}

function optionProfile(option: any) {
  const entity = option?.entity || option || {}

  return (
    option?.profile ||
    option?.itemProfile ||
    option?.normalizedItem ||
    entity?.itemProfile ||
    entity?.profile ||
    entity?.normalizedItem ||
    entity?.normalized_item ||
    null
  )
}

function optionBlockByKey(option: any, key: string) {
  const blocks = Array.isArray(option?.entity?.blocks) ? option.entity.blocks : []

  return blocks.find((block: any) =>
    String(block?.block_key || block?.blockKey || '') === key
  ) || null
}

function optionCoreSummary(option: any) {
  const entity = option?.entity || option || {}
  const core = optionBlockByKey(option, 'item_core')?.data || {}

  return entity?.itemCore || entity?.core || core || {}
}

function optionRawJson(option: any) {
  return optionBlockByKey(option, 'import_source')?.data?.raw_json || {}
}

function optionTypeLabelForCode(value: any) {
  const code = String(value || '').split('|')[0].trim().toUpperCase()

  const labels: Record<string, string> = {
    M: 'Melee Weapon',
    R: 'Ranged Weapon',
    A: 'Ammunition',
    LA: 'Light Armor',
    MA: 'Medium Armor',
    HA: 'Heavy Armor',
    S: 'Shield',
    RD: 'Rod',
    WD: 'Wand',
    RG: 'Ring',
    SC: 'Scroll',
    SCF: 'Spellcasting Focus',
    G: 'Gear',
    P: 'Potion'
  }

  return labels[code] || ''
}

function optionDisplayType(option: any) {
  const profile = optionProfile(option) || {}
  const core = optionCoreSummary(option) || {}
  const raw = optionRawJson(option) || {}

  return String(
    profile?.displayType ||
    optionTypeLabelForCode(profile?.typeCode || profile?.rawType || core?.item_type || core?.itemType || raw?.type) ||
    core?.item_type ||
    core?.itemType ||
    raw?.type ||
    'Item'
  ).trim()
}

function optionRarity(option: any) {
  const profile = optionProfile(option) || {}
  const core = optionCoreSummary(option) || {}
  const raw = optionRawJson(option) || {}

  return String(profile?.rarity || core?.rarity || raw?.rarity || '').trim()
}

function optionSource(option: any) {
  const profile = optionProfile(option) || {}
  const raw = optionRawJson(option) || {}

  return String(profile?.source || raw?.source || '').trim()
}

function optionMetaLine(option: any) {
  return [
    optionDisplayType(option),
    optionRarity(option),
    optionSource(option)
  ]
    .filter(Boolean)
    .join(' / ')
}

function optionDescription(option: any) {
  const profile = optionProfile(option) || {}
  const core = optionCoreSummary(option) || {}
  const raw = optionRawJson(option) || {}

  const text = String(
    profile?.description ||
    core?.description ||
    raw?.entriesPreview ||
    option?.summary ||
    ''
  ).replace(/\s+/g, ' ').trim()

  return text.length > 120 ? `${text.slice(0, 120).trim()}...` : text
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

function optionItemDetail(option: any) {
  const profile = optionProfile(option) || {}
  const core = optionCoreSummary(option) || {}
  const raw = optionRawJson(option) || {}

  return {
    id: option?.id,
    name: String(profile?.name || option?.title || core?.name || raw?.name || 'Item'),
    itemType: optionDisplayType(option),
    damage: String(profile?.weapon?.damage || core?.damage || raw?.dmg1 || '').trim(),
    damageType: damageTypeLabel(profile?.weapon?.damageType || core?.damage_type || raw?.dmgType || ''),
    linkedItemId: String(option?.id || profile?.id || ''),
    rarity: String(profile?.rarity || core?.rarity || raw?.rarity || '').trim(),
    weight: profile?.weight ?? core?.weight ?? raw?.weight ?? '',
    value: profile?.value || core?.value || raw?.value || '',
    description: String(profile?.description || core?.description || raw?.entriesPreview || option?.summary || '').trim(),
    notes: '',
    profile
  }
}

function chooseImportedItem(option: any) {
  emit('update-item-entity-id', String(option?.id || ''))
}

function clearImportedItem() {
  emit('update-item-entity-id', '')
}

function openOptionDetail(option: any) {
  emit('open-item-detail', {
    detail: optionItemDetail(option)
  })
}
</script>

<template>
  <section class="space-y-4">
    <div
      v-if="inventorySaveError"
      class="rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
    >
      {{ inventorySaveError }}
    </div>

    <div
      v-if="inventorySaveSuccess"
      class="rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200"
    >
      {{ inventorySaveSuccess }}
    </div>

    <section class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.58)] p-4">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Add Items</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">Search normalized item data, then add it to this sheet.</div>
        </div>

        <button
          type="button"
          class="eldra-button rounded-none px-3 py-2 text-xs font-semibold disabled:opacity-50"
          :disabled="inventorySaving"
          @click="emit('add-item')"
        >
          {{ inventorySaving ? 'Adding...' : 'Add' }}
        </button>
      </div>

      <label class="block">
        <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Search Items</span>
        <input
          :value="inventoryItemSearch"
          type="search"
          class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
          placeholder="Shield, longsword, potion, cloak..."
          @input="emit('update-search', inputValue($event))"
        >
      </label>

      <div class="mt-3">
        <div class="mb-2 flex items-center justify-between gap-3">
          <span class="block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">
            Matching Items
            <span v-if="normalizedSearchPending" class="ml-1 text-[#d8ceb8]">loading...</span>
          </span>

          <button
            v-if="selectedImportedItem"
            type="button"
            class="rounded-none border border-[rgba(148,163,184,0.24)] bg-[rgba(15,23,42,0.45)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d8ceb8]"
            @click="clearImportedItem"
          >
            Clear
          </button>
        </div>

        <div
          v-if="selectedImportedItem"
          class="mb-3 rounded-none border border-emerald-300/24 bg-emerald-400/10 p-3"
        >
          <div class="text-xs uppercase tracking-[0.18em] text-emerald-100">Selected</div>
          <div class="mt-1 text-sm font-semibold text-white">{{ selectedImportedItem.title }}</div>
          <div class="mt-1 text-xs text-[#d8ceb8]">{{ optionMetaLine(selectedImportedItem) }}</div>
        </div>

        <div
          v-if="visibleInventoryItemOptions.length"
          class="max-h-[360px] space-y-2 overflow-y-auto pr-1"
        >
          <article
            v-for="option in visibleInventoryItemOptions"
            :key="`item-result-${option.id}`"
            class="rounded-none border p-3 transition"
            :class="String(option.id) === String(inventoryAddForm?.itemEntityId || '')
              ? 'border-[rgba(201,164,90,0.62)] bg-[rgba(201,164,90,0.16)]'
              : 'border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)]'"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-white">{{ option.title }}</div>
                <div class="mt-1 text-xs text-[#9f9278]">{{ optionMetaLine(option) }}</div>
              </div>

              <span
                v-if="String(option.id) === String(inventoryAddForm?.itemEntityId || '')"
                class="shrink-0 rounded-none border border-emerald-300/24 bg-emerald-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-100"
              >
                Picked
              </span>
            </div>

            <p
              v-if="optionDescription(option)"
              class="mt-2 text-xs leading-5 text-[#9f9278]"
            >
              {{ optionDescription(option) }}
            </p>

            <div class="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                class="rounded-none border border-emerald-300/24 bg-emerald-400/10 px-2 py-2 text-xs font-semibold text-emerald-100"
                @click="chooseImportedItem(option)"
              >
                {{ String(option.id) === String(inventoryAddForm?.itemEntityId || '') ? 'Selected' : 'Select' }}
              </button>

              <button
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-2 text-xs font-semibold text-[#fff7df]"
                @click="openOptionDetail(option)"
              >
                Details
              </button>
            </div>
          </article>
        </div>

        <div
          v-else
          class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]"
        >
          No imported items match that search.
        </div>
      </div>

      <div class="mt-3 grid grid-cols-[110px_minmax(0,1fr)] gap-3">
        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Qty</span>
          <input
            :value="inventoryAddForm?.quantity || '1'"
            inputmode="numeric"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            @input="emit('update-quantity', inputValue($event))"
          >
        </label>

        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Custom Name</span>
          <input
            :value="inventoryAddForm?.customName || ''"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            placeholder="Used if no imported item"
            @input="emit('update-custom-name', inputValue($event))"
          >
        </label>
      </div>

      <label class="mt-3 block">
        <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Notes</span>
        <textarea
          :value="inventoryAddForm?.notes || ''"
          rows="3"
          class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
          placeholder="Optional notes..."
          @input="emit('update-notes', inputValue($event))"
        />
      </label>
    </section>

    <section class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.42)] p-4">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">My Inventory</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">Equipment, carried items, and attunement.</div>
        </div>

        <span class="eldra-gold-chip rounded-none border px-2 py-1 text-xs">
          {{ inventoryCount }} Item{{ inventoryCount === 1 ? '' : 's' }}
        </span>
      </div>

      <div v-if="carriedInventory.length" class="space-y-3">
        <article
          v-for="item in carriedInventory"
          :key="item.id"
          class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-white">{{ item.name }}</div>
              <div class="mt-1 text-xs leading-5 text-[#9f9278]">
                x{{ quantityFor(item) }}
                <span v-if="itemMetaLine(item)"> / {{ itemMetaLine(item) }}</span>
              </div>
            </div>

            <button
              type="button"
              class="shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
              @click.stop="emit('open-item-detail', item)"
            >
              Details
            </button>
          </div>

          <p v-if="item.notes" class="mt-2 text-xs leading-5 text-[#9f9278]">
            {{ item.notes }}
          </p>

          <div class="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.72)] px-2 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-50"
              :disabled="inventorySaving"
              @click="emit('change-quantity', { item, delta: -1 })"
            >
              - Qty
            </button>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.72)] px-2 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-50"
              :disabled="inventorySaving"
              @click="emit('change-quantity', { item, delta: 1 })"
            >
              + Qty
            </button>

            <button
              type="button"
              class="rounded-none border border-red-500/30 bg-red-500/12 px-2 py-2 text-xs font-semibold text-red-100 disabled:opacity-50"
              :disabled="inventorySaving"
              @click="emit('remove-item', item)"
            >
              Remove
            </button>
          </div>

          <div class="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              class="rounded-none border px-2 py-2 text-xs font-semibold disabled:opacity-50"
              :class="item.equipped
                ? 'border-amber-300/30 bg-amber-400/12 text-amber-100'
                : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
              :disabled="inventorySaving"
              @click="emit('toggle-equipped', item)"
            >
              {{ item.equipped ? 'Unequip' : 'Equip' }}
            </button>

            <button
              type="button"
              class="rounded-none border px-2 py-2 text-xs font-semibold disabled:opacity-50"
              :class="item.attuned
                ? 'border-sky-300/30 bg-sky-400/12 text-sky-100'
                : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
              :disabled="inventorySaving"
              @click="emit('toggle-attuned', item)"
            >
              {{ item.attuned ? 'Unattune' : 'Attune' }}
            </button>
          </div>
        </article>
      </div>

      <div
        v-else
        class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-5 text-sm text-[#9f9278]"
      >
        Inventory is empty.
      </div>
    </section>
  </section>
</template>
