<script setup lang="ts">
// Inventory for Character Sheet V2 -- the first V1 feature rebuilt on the
// new Character Architecture.
//
// V1's INFORMATION ARCHITECTURE is preserved deliberately, because it is the
// part of V1 worth keeping: an "Add" panel above a dense item grid; each item
// a card carrying name, quantity, container, equipped/attuned state and
// notes; two columns where there is room, one where there is not. A player
// moving from V1 should recognise this immediately.
//
// V1's PLUMBING is not preserved at all. This component:
//   - receives items already joined to the World Content Catalogue by
//     Character Assembly, rather than reading a `character_sheets` row
//   - offers catalogue items as options, rather than a `sheet-options`
//     endpoint's normalized 5etools payloads
//   - emits intent and computes nothing; every list change is decided by the
//     pure module (app/lib/characters/inventory.ts) and every rules
//     consequence belongs to the Rules Engine
//
// NO ARITHMETIC HAPPENS HERE. No total weight, no carrying capacity, no
// attunement limit, no armour class -- those remain Rules Engine output
// (the Equipment region of the Sheet's derived panel), never computed in
// this file. The Category badge and "Requires Attunement" note below ARE
// new: the active package's `collection:equipment` itemSchema, and the Item
// Rules Facets that populate it, both now exist -- so this surface reads
// `item.entry.rulesFacet.collectionFields` (the same field Character
// Assembly already relays) and displays it verbatim. That is relaying data,
// not deriving it: the facet already says "category: weapon"; this file
// does not decide what a weapon is.
//
// ---------------------------------------------------------------------------
// ALWAYS EDITABLE, UNLIKE THE REST OF THE SHEET
// ---------------------------------------------------------------------------
// Sheet-V2's standing rule is "the Sheet displays, the Builder edits", and
// ability scores and proficiencies both link out to a Builder page for that
// reason. Inventory is the deliberate exception: picking up a sword, drinking
// a potion, and equipping a shield are things that happen DURING PLAY, at the
// table, mid-session. Routing them through a character-creation surface would
// be wrong about when they happen. V1 made the same call.
//
// (V1 additionally gated its edit controls behind the workspace's `build`
// mode. That gate is not reproduced: V2 does not participate in play/build
// mode, and hiding the equip button during play is precisely backwards.)
//
// ---------------------------------------------------------------------------
// MOBILE
// ---------------------------------------------------------------------------
// One column on phones, two where there is room -- the same `md:grid-cols-2`
// V1 uses. Every control is a real button at min-h-11 (44px, the iOS
// guidance) rather than an icon-sized target, quantity is a stepper rather
// than a text field so it needs no keyboard, and equipped/attuned are native
// checkboxes so they are reachable by keyboard and announced correctly. No
// control is desktop-only and nothing depends on hover.

import type { AssembledInventoryItem } from '~/lib/characters/inventory'

const props = withDefaults(defineProps<{
  items: readonly AssembledInventoryItem[]
  // Catalogue-published items this World can offer, already resolved by the
  // assembly endpoint. Empty is legal -- a World with no item content bound
  // still supports custom items, which is what makes the panel useful before
  // any Content Pack ships equipment.
  options?: readonly { packageId: string; slug: string; title: string; sourceBook?: string }[]
  saving?: boolean
  errorMessage?: string
}>(), {
  options: () => [],
  saving: false,
  errorMessage: ''
})

const emit = defineEmits<{
  add: [{ ref?: { packageId: string; slug: string }; name?: string; quantity: number; notes?: string }]
  remove: [string]
  'change-quantity': [{ instanceId: string; delta: number }]
  'toggle-flag': [{ instanceId: string; flag: 'equipped' | 'attuned' }]
}>()

// Read straight off the SAME `item.entry.rulesFacet` prop this component
// already receives -- no new fetch, no derived value. This is what "if
// Equipment metadata naturally becomes available, display it" means in
// practice: `rulesFacet.collectionFields` reached AssembledInventoryItem
// through Character Assembly's own catalogue join, and was simply not read
// here until now.
function collectionFieldsFor(item: AssembledInventoryItem) {
  return item.entry?.rulesFacet?.collectionFields?.find(
    (entry) => entry.collection === 'collection:equipment'
  )?.fields
}

function equipmentCategory(item: AssembledInventoryItem): string {
  const category = collectionFieldsFor(item)?.category
  // 'gear' is the itemSchema's own declared default -- not worth a badge,
  // since it is the common case (adventuring gear, tools) and would make
  // every card noisier rather than more informative.
  return typeof category === 'string' && category !== 'gear' ? category : ''
}

function requiresAttunement(item: AssembledInventoryItem): boolean {
  return collectionFieldsFor(item)?.requiresAttunement === true
}

// --- Add form -------------------------------------------------------------

const search = ref('')
const selectedKey = ref('')
const customName = ref('')
const quantity = ref('1')
const notes = ref('')

function optionKey(option: { packageId: string; slug: string }) {
  return `${option.packageId}::${option.slug}`
}

// Composite (packageId::slug) keys, never bare slugs -- two bound packs can
// publish the same item slug, the same reason the Builder's own pickers use
// a composite key.
const filteredOptions = computed(() => {
  const term = search.value.trim().toLowerCase()
  const all = props.options

  if (!term) return all.slice(0, 100)

  return all
    .filter((option) => option.title.toLowerCase().includes(term))
    .slice(0, 100)
})

const canAdd = computed(() => Boolean(selectedKey.value) || Boolean(customName.value.trim()))

function submitAdd() {
  if (!canAdd.value || props.saving) return

  const chosen = props.options.find((option) => optionKey(option) === selectedKey.value)
  const parsed = Number(quantity.value)

  emit('add', {
    ...(chosen ? { ref: { packageId: chosen.packageId, slug: chosen.slug } } : { name: customName.value.trim() }),
    quantity: Number.isFinite(parsed) ? parsed : 1,
    notes: notes.value.trim() || undefined
  })

  selectedKey.value = ''
  customName.value = ''
  quantity.value = '1'
  notes.value = ''
}
</script>

<template>
  <div class="grid gap-4">
    <!-- Add ---------------------------------------------------------------- -->
    <div class="rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Add Inventory
          </div>
          <div class="mt-1 text-sm text-[#d8ceb8]">
            Add published equipment, or a custom item of your own.
          </div>
        </div>
      </div>

      <div class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_140px]">
        <label class="block">
          <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">
            Search published items
          </span>
          <input
            v-model="search"
            type="search"
            class="eldra-input mb-2 min-h-11 w-full rounded-none px-3 py-2 text-sm text-white"
            :placeholder="options.length ? 'Search by name…' : 'No item content is bound to this World'"
            :disabled="!options.length"
          >
          <select
            v-model="selectedKey"
            class="eldra-input min-h-11 w-full rounded-none px-3 py-2 text-sm text-white"
            :disabled="!options.length"
          >
            <option
              value=""
              class="bg-[#090909] text-[#f5e7bd]"
            >
              No published item selected
            </option>
            <option
              v-for="option in filteredOptions"
              :key="optionKey(option)"
              :value="optionKey(option)"
              class="bg-[#090909] text-[#f5e7bd]"
            >
              {{ option.title }}<template v-if="option.sourceBook"> · {{ option.sourceBook }}</template>
            </option>
          </select>
        </label>

        <label class="block">
          <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">
            Quantity
          </span>
          <input
            v-model="quantity"
            inputmode="numeric"
            class="eldra-input min-h-11 w-full rounded-none px-3 py-2 text-sm text-white"
          >
        </label>

        <label class="block lg:col-span-2">
          <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">
            Custom item name
          </span>
          <input
            v-model="customName"
            class="eldra-input min-h-11 w-full rounded-none px-3 py-2 text-sm text-white"
            placeholder="Used when no published item is selected"
          >
        </label>

        <label class="block lg:col-span-2">
          <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">
            Notes
          </span>
          <input
            v-model="notes"
            class="eldra-input min-h-11 w-full rounded-none px-3 py-2 text-sm text-white"
            placeholder="Optional"
          >
        </label>
      </div>

      <button
        type="button"
        class="eldra-button mt-3 min-h-11 w-full rounded-none px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        :disabled="!canAdd || saving"
        @click="submitAdd"
      >
        {{ saving ? 'Saving…' : 'Add Item' }}
      </button>

      <p
        v-if="errorMessage"
        class="mt-3 rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
      >
        {{ errorMessage }}
      </p>
    </div>

    <!-- Carried ------------------------------------------------------------ -->
    <div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Carried
        </div>
        <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
          {{ items.length }} Item{{ items.length === 1 ? '' : 's' }}
        </div>
      </div>

      <p
        v-if="!items.length"
        class="mt-3 text-sm text-[#9f9278]"
      >
        Nothing carried yet.
      </p>

      <div
        v-else
        class="mt-3 grid gap-2 md:grid-cols-2"
      >
        <article
          v-for="item in items"
          :key="item.instanceId"
          class="min-w-0 rounded-none border p-3 text-sm text-[#d8ceb8]"
          :class="item.status === 'missing'
            ? 'border-red-900/60 bg-red-950/20'
            : 'border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)]'"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate font-semibold text-[#fff7df]">
                {{ item.title }}
              </div>
              <div class="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[#9f9278]">
                <span>x{{ item.quantity }}</span>
                <span v-if="item.container">Container: {{ item.container }}</span>
                <!-- Category, when the item's Rules Facet naturally carries
                     one -- Rules Engine output relayed as-is, not derived
                     here. Absent for adventuring gear, custom items, and
                     anything the corpus has no facet for, which is legal
                     (§8.2 rule 4): the row simply says less about it. -->
                <span
                  v-if="equipmentCategory(item)"
                  class="capitalize"
                >{{ equipmentCategory(item) }}</span>
                <span v-if="requiresAttunement(item)">Requires Attunement</span>
                <!-- Provenance, exactly as the Sheet's content cards show it:
                     which pack an item came from is what makes a later
                     "unavailable" intelligible. -->
                <span v-if="item.entry?.sourceBook">{{ item.entry.sourceBook }}</span>
                <span v-else-if="item.status === 'custom'">Custom</span>
              </div>
            </div>

            <button
              type="button"
              class="min-h-11 shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] px-3 text-xs font-semibold text-[#d8ceb8] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:opacity-50"
              :disabled="saving"
              @click="emit('remove', item.instanceId)"
            >
              Remove
            </button>
          </div>

          <!-- A reference whose Content Pack is gone is stated, never hidden. -->
          <p
            v-if="item.status === 'missing'"
            class="mt-2 text-xs leading-5 text-red-300"
          >
            {{ item.reason || 'This item is no longer published by any Content Pack bound to this World.' }}
          </p>

          <p
            v-if="item.notes"
            class="mt-2 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2 text-xs leading-5 text-[#9f9278]"
          >
            {{ item.notes }}
          </p>

          <div class="mt-3 flex flex-wrap items-center gap-2">
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="min-h-11 min-w-11 rounded-none border border-[rgba(201,164,90,0.24)] text-sm font-semibold text-[#fff7df] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:opacity-50"
                :disabled="saving || item.quantity <= 1"
                :aria-label="`Decrease quantity of ${item.title}`"
                @click="emit('change-quantity', { instanceId: item.instanceId, delta: -1 })"
              >
                −
              </button>
              <button
                type="button"
                class="min-h-11 min-w-11 rounded-none border border-[rgba(201,164,90,0.24)] text-sm font-semibold text-[#fff7df] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:opacity-50"
                :disabled="saving"
                :aria-label="`Increase quantity of ${item.title}`"
                @click="emit('change-quantity', { instanceId: item.instanceId, delta: 1 })"
              >
                +
              </button>
            </div>

            <label
              v-for="flag in (['equipped', 'attuned'] as const)"
              :key="flag"
              class="flex min-h-11 cursor-pointer items-center gap-2 rounded-none border px-3 text-xs font-semibold capitalize"
              :class="item[flag]
                ? 'border-[rgba(201,164,90,0.65)] bg-[rgba(201,164,90,0.12)] text-[#fff7df]'
                : 'border-[rgba(201,164,90,0.24)] text-[#d8ceb8]'"
            >
              <input
                type="checkbox"
                class="size-4 accent-[#c9a45a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(201,164,90,0.65)]"
                :checked="item[flag]"
                :disabled="saving"
                @change="emit('toggle-flag', { instanceId: item.instanceId, flag })"
              >
              {{ flag }}
            </label>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>
