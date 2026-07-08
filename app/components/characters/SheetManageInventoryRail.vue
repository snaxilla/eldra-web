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

const route = useRoute()
const detailLoadingId = ref('')
const detailError = ref('')
const fullEntityCache = reactive<Record<string, any>>({})

const effectiveWorldId = computed(() =>
  String(props.worldId || route.params.id || '').trim()
)

const normalizedSearchUrl = computed(() => {
  const worldId = effectiveWorldId.value
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

function optionEntity(option: any) {
  return option?.entity || option || {}
}

function optionBlocks(option: any) {
  const entity = optionEntity(option)
  return Array.isArray(entity?.blocks)
    ? entity.blocks
    : Array.isArray(option?.blocks)
      ? option.blocks
      : []
}

function optionBlockByKey(option: any, key: string) {
  return optionBlocks(option).find((block: any) =>
    String(block?.block_key || block?.blockKey || '') === key
  ) || null
}

function optionCoreSummary(option: any) {
  const entity = optionEntity(option)
  return entity?.itemCore || entity?.core || optionBlockByKey(option, 'item_core')?.data || {}
}

function optionRawJson(option: any) {
  const entity = optionEntity(option)
  return entity?.raw ||
    entity?.importSource?.raw_json ||
    optionBlockByKey(option, 'import_source')?.data?.raw_json ||
    {}
}

function optionProfile(option: any) {
  const entity = optionEntity(option)

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

function textifyItemEntry(value: any): string {
  if (value == null) return ''

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.map(textifyItemEntry).filter(Boolean).join(' ')
  }

  if (typeof value === 'object') {
    const parts: string[] = []

    if (value.name) parts.push(String(value.name))
    if (value.entry) parts.push(textifyItemEntry(value.entry))
    if (value.entries) parts.push(textifyItemEntry(value.entries))
    if (value.items) parts.push(textifyItemEntry(value.items))

    return parts.join(' ')
  }

  return ''
}

function cleanItemText(value: any) {
  let text = ''

  if (typeof value === 'string') {
    const trimmed = value.trim()

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        text = textifyItemEntry(JSON.parse(trimmed))
      } catch {
        text = trimmed
      }
    } else {
      text = trimmed
    }
  } else {
    text = textifyItemEntry(value)
  }

  return String(text || '')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat|classFeature|subclassFeature|itemProperty)\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@(?:i|b|dice|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/g, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function optionDescription(option: any) {
  const profile = optionProfile(option) || {}
  const core = optionCoreSummary(option) || {}
  const raw = optionRawJson(option) || {}

  const text = cleanItemText(
    profile?.description ||
    core?.description ||
    raw?.entriesPreview ||
    raw?.entries ||
    option?.summary ||
    ''
  )

  return text.length > 120 ? `${text.slice(0, 120).trim()}...` : text
}

function fullOptionDescription(option: any) {
  const profile = optionProfile(option) || {}
  const core = optionCoreSummary(option) || {}
  const raw = optionRawJson(option) || {}

  return cleanItemText(
    profile?.description ||
    core?.description ||
    raw?.entriesPreview ||
    raw?.entries ||
    option?.summary ||
    ''
  )
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

function optionArmorClass(option: any) {
  const profile = optionProfile(option) || {}
  const core = optionCoreSummary(option) || {}
  const raw = optionRawJson(option) || {}
  const armor = profile?.armor || null

  if (armor?.isShield) {
    const value = Number(armor.shieldBonus ?? armor.baseAc ?? 2)
    return Number.isFinite(value) && value > 0 ? value : 2
  }

  if (armor?.isArmor) {
    const base = Number(armor.baseAc || 0)
    const bonus = Number(armor.bonusAc || 0)
    const total = base + (Number.isFinite(bonus) ? bonus : 0)
    return Number.isFinite(total) && total > 0 ? total : ''
  }

  const value = core?.armor_class ?? core?.armorClass ?? raw?.ac ?? raw?.armorClass
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : ''
}

function optionRequiresAttunement(option: any) {
  const profile = optionProfile(option) || {}
  const core = optionCoreSummary(option) || {}
  const raw = optionRawJson(option) || {}

  if (profile?.requiresAttunement !== undefined) return profile.requiresAttunement === true

  return Boolean(core?.attunement || raw?.reqAttune || raw?.attunement)
}

function optionItemDetail(option: any) {
  const profile = optionProfile(option) || {}
  const core = optionCoreSummary(option) || {}
  const raw = optionRawJson(option) || {}

  return {
    id: option?.id || optionEntity(option)?.id,
    name: String(profile?.name || option?.title || optionEntity(option)?.title || core?.name || raw?.name || 'Item'),
    itemType: optionDisplayType(option),
    damage: String(profile?.weapon?.damage || core?.damage || raw?.dmg1 || '').trim(),
    damageType: damageTypeLabel(profile?.weapon?.damageType || core?.damage_type || raw?.dmgType || ''),
    armorClass: optionArmorClass(option),
    requiresAttunement: optionRequiresAttunement(option),
    linkedItemId: String(option?.id || optionEntity(option)?.id || profile?.id || ''),
    rarity: String(profile?.rarity || core?.rarity || raw?.rarity || '').trim(),
    weight: profile?.weight ?? core?.weight ?? raw?.weight ?? '',
    value: profile?.value || core?.value || raw?.value || '',
    source: String(profile?.source || raw?.source || '').trim(),
    description: fullOptionDescription(option),
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

async function fullEntityForOption(option: any) {
  const id = String(option?.id || '').trim()
  const worldId = effectiveWorldId.value

  if (!id || !worldId) return option

  if (fullEntityCache[id]) {
    return {
      ...option,
      entity: fullEntityCache[id],
      title: fullEntityCache[id]?.title || option?.title
    }
  }

  const entity = await $fetch<any>(`/api/worlds/${worldId}/entities/${id}`)
  fullEntityCache[id] = entity

  return {
    ...option,
    entity,
    title: entity?.title || option?.title
  }
}

async function openOptionDetail(option: any) {
  const id = String(option?.id || '').trim()
  detailError.value = ''

  if (!id) {
    emit('open-item-detail', {
      detail: optionItemDetail(option)
    })
    return
  }

  detailLoadingId.value = id

  try {
    const fullOption = await fullEntityForOption(option)

    emit('open-item-detail', {
      detail: optionItemDetail(fullOption)
    })
  } catch (error: any) {
    detailError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to load full item details.'

    emit('open-item-detail', {
      detail: optionItemDetail(option)
    })
  } finally {
    detailLoadingId.value = ''
  }
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

    <div
      v-if="detailError"
      class="rounded-none border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100"
    >
      {{ detailError }}
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
                class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-50"
                :disabled="detailLoadingId === String(option.id)"
                @click="openOptionDetail(option)"
              >
                {{ detailLoadingId === String(option.id) ? 'Loading...' : 'Details' }}
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
