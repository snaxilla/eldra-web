<script setup lang="ts">
type InventoryAddForm = {
  itemEntityId?: string
  customName?: string
  quantity?: string
  notes?: string
}

const props = withDefaults(defineProps<{
  mode?: string
  sheet?: any
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
  mode: 'play',
  inventorySaving: false,
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

function inputValue(event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
  return target?.value || ''
}

function quantityFor(item: any) {
  const fromParent = props.inventoryQuantity?.(item)
  if (Number.isFinite(Number(fromParent)) && Number(fromParent) > 0) {
    return Math.floor(Number(fromParent))
  }

  const parsed = Number(item?.quantity || 1)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1
}
</script>

<template>
  <section class="mt-0 grid gap-3 md:mt-6">
    <CharactersSheetCurrencyLedger :sheet="sheet" />

    <div
      v-if="mode === 'build'"
      class="eldra-codex-soft rounded-none p-4"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Add Inventory</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">Add imported equipment or quick custom inventory rows.</div>
        </div>

        <button
          type="button"
          class="eldra-button rounded-none px-4 py-2 text-sm font-semibold disabled:opacity-50"
          :disabled="inventorySaving"
          @click="emit('add-item')"
        >
          {{ inventorySaving ? 'Adding...' : 'Add Item' }}
        </button>
      </div>

      <div
        v-if="inventorySaveError"
        class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
      >
        {{ inventorySaveError }}
      </div>

      <div
        v-if="inventorySaveSuccess"
        class="mt-3 rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200"
      >
        {{ inventorySaveSuccess }}
      </div>

      <div class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_120px]">
        <label class="block">
          <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Search Imported Items</span>
          <input
            :value="inventoryItemSearch"
            class="eldra-input mb-2 w-full rounded-none px-3 py-2 text-sm text-white"
            placeholder="Search Longbow, Longsword, Backpack..."
            @input="emit('update-search', inputValue($event))"
          >

          <select
            :value="inventoryAddForm?.itemEntityId || ''"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            @change="emit('update-item-entity-id', inputValue($event))"
          >
            <option value="" class="bg-[#090909] text-[#f5e7bd]">No imported item selected</option>
            <option
              v-for="option in filteredInventoryItemOptions"
              :key="option.id"
              :value="option.id"
              class="bg-[#090909] text-[#f5e7bd]"
            >
              {{ option.title }}
            </option>
          </select>
        </label>

        <label class="block">
          <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Quantity</span>
          <input
            :value="inventoryAddForm?.quantity || '1'"
            inputmode="numeric"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            @input="emit('update-quantity', inputValue($event))"
          >
        </label>

        <label class="block lg:col-span-2">
          <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Custom Item Name</span>
          <input
            :value="inventoryAddForm?.customName || ''"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            placeholder="Used when no imported item is selected"
            @input="emit('update-custom-name', inputValue($event))"
          >
        </label>

        <label class="block lg:col-span-2">
          <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Notes</span>
          <textarea
            :value="inventoryAddForm?.notes || ''"
            rows="2"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            placeholder="Optional notes..."
            @input="emit('update-notes', inputValue($event))"
          />
        </label>
      </div>
    </div>

    <div class="eldra-codex-soft rounded-none p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Inventory</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">Equipment, carried items, and attunement tracking.</div>
        </div>

        <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
          {{ inventoryCount }} Item{{ inventoryCount === 1 ? '' : 's' }}
        </div>
      </div>

      <div
        v-if="carriedInventory.length"
        class="mt-4 grid gap-2 md:grid-cols-2"
      >
        <article
          v-for="item in carriedInventory"
          :key="item.id"
          class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3 text-sm text-[#d8ceb8]"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate font-semibold text-white">{{ item.name }}</div>
              <div class="mt-1 flex flex-wrap gap-2 text-xs text-[#9f9278]">
                <span>x{{ quantityFor(item) }}</span>
                <span v-if="item.container">Container: {{ item.container }}</span>
              </div>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
              @click.stop="emit('open-item-detail', item)"
            >
              Details
            </button>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <span
              v-if="item.equipped"
              class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]"
            >
              Equipped
            </span>
            <span
              v-if="item.attuned"
              class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]"
            >
              Attuned
            </span>
          </div>

          <div
            v-if="item.notes"
            class="mt-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3 text-xs leading-5 text-[#9f9278]"
          >
            {{ item.notes }}
          </div>

          <div
            v-if="mode === 'build'"
            class="mt-3 grid gap-2"
          >
            <div class="grid grid-cols-3 gap-2">
              <button
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-50"
                :disabled="inventorySaving"
                @click="emit('change-quantity', { item, delta: -1 })"
              >
                - Qty
              </button>

              <button
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-50"
                :disabled="inventorySaving"
                @click="emit('change-quantity', { item, delta: 1 })"
              >
                + Qty
              </button>

              <button
                type="button"
                class="rounded-none border border-red-500/24 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 disabled:opacity-50"
                :disabled="inventorySaving"
                @click="emit('remove-item', item)"
              >
                Remove
              </button>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="rounded-none border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                :class="item.equipped
                  ? 'border-[rgba(201,164,90,0.42)] bg-[rgba(201,164,90,0.14)] text-[#fff7df]'
                  : 'border-[rgba(65,82,103,0.64)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
                :disabled="inventorySaving"
                @click="emit('toggle-equipped', item)"
              >
                {{ item.equipped ? 'Unequip' : 'Equip' }}
              </button>

              <button
                type="button"
                class="rounded-none border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                :class="item.attuned
                  ? 'border-[rgba(201,164,90,0.42)] bg-[rgba(201,164,90,0.14)] text-[#fff7df]'
                  : 'border-[rgba(65,82,103,0.64)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
                :disabled="inventorySaving"
                @click="emit('toggle-attuned', item)"
              >
                {{ item.attuned ? 'Unattune' : 'Attune' }}
              </button>
            </div>
          </div>
        </article>
      </div>

      <div
        v-else
        class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]"
      >
        Inventory is empty. Switch to Build mode to add imported or custom items.
      </div>
    </div>
  </section>
</template>
