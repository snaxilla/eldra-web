<script setup lang="ts">
import MapPinEditorHeader from '~/components/world/map/MapPinEditorHeader.vue'

defineProps<{
  open: boolean
  editingPin: any | null
  worldId: string | number
  savingPin: boolean
  saveError: string
  creatingEntity: boolean
  createEntityError: string
  createEntitySuccess: string
  entityOptions: any[]
  mapOptions: any[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save'): void
  (e: 'create-article'): void
  (e: 'upload-image', event: Event): void
}>()

const PIN_TYPE_OPTIONS = [
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

const PIN_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

const ICON_OPTIONS = [
  { label: 'Marker', value: 'marker', symbol: '●' },
  { label: 'City', value: 'city', symbol: '▦' },
  { label: 'Castle', value: 'castle', symbol: '♜' },
  { label: 'Tower', value: 'tower', symbol: '▮' },
  { label: 'Dungeon', value: 'dungeon', symbol: '⛓' },
  { label: 'Temple', value: 'temple', symbol: '⛪' },
  { label: 'Camp', value: 'camp', symbol: '△' },
  { label: 'Harbor', value: 'harbor', symbol: '⚓' },
  { label: 'Ruins', value: 'ruins', symbol: '◫' },
  { label: 'Quest', value: 'quest', symbol: '★' },
  { label: 'Skull', value: 'skull', symbol: '☠' },
  { label: 'Book', value: 'book', symbol: '☰' },
]
</script>

<template>
  <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
    <div
      v-if="open && editingPin"
      class="eldra-ornate-panel eldra-frame-corners fixed right-0 top-0 z-40 h-full w-[420px] border-l backdrop-blur"
    >
      <div class="flex h-full flex-col">
        <MapPinEditorHeader
          :editing-pin="editingPin"
          @close="emit('close')"
        />

        <div class="flex-1 overflow-y-auto px-5 py-5">
          <div class="space-y-5">
            <div v-if="saveError" class="rounded-none border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {{ saveError }}
            </div>

            <div v-if="createEntityError" class="rounded-none border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {{ createEntityError }}
            </div>

            <div v-if="createEntitySuccess" class="rounded-none border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {{ createEntitySuccess }}
            </div>

            <div>
              <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Title</label>
              <input
                v-model="editingPin.title"
                type="text"
                placeholder="e.g. Stonehold"
                class="eldra-input w-full rounded-none px-4 py-2.5 text-sm placeholder-[#756a57]"
              >
            </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Type</label>
                <select
                  v-model="editingPin.pinType"
                  class="eldra-input w-full rounded-none px-4 py-2.5 text-sm text-[#f5e7bd]"
                >
                  <option
                    v-for="opt in PIN_TYPE_OPTIONS"
                    :key="opt.value"
                    :value="opt.value"
                    class="bg-[#090909] text-[#f5e7bd]"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            <div>
              <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Color</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="c in PIN_COLORS"
                  :key="c"
                  type="button"
                  class="h-7 w-7 rounded-full border-2 transition"
                  :style="{ background: c, borderColor: editingPin.color === c ? 'white' : 'transparent' }"
                  @click="editingPin.color = c"
                />
              </div>
            </div>

            <div>
              <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Marker Style</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="opt in ICON_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="rounded-none border px-3 py-2 text-left transition"
                  :class="editingPin.icon === opt.value
                    ? 'border-[rgba(201,164,90,0.48)] bg-[rgba(201,164,90,0.14)] text-[#fff7df]'
                    : 'border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] text-[#d8ceb8] hover:bg-[rgba(201,164,90,0.10)]'"
                  @click="editingPin.icon = opt.value"
                >
                  <div class="text-lg leading-none">{{ opt.symbol }}</div>
                  <div class="mt-1 text-xs">{{ opt.label }}</div>
                </button>
              </div>
            </div>

            <div>
              <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Summary / Blurb</label>
              <WorldMentionAutocompleteTextarea
                v-model="editingPin.summary"
                :world-id="worldId"
                rows="4"
                textarea-class="eldra-input w-full rounded-none px-4 py-3 text-sm placeholder-[#756a57]"
                placeholder="Short map preview summary. Type @ to mention a world entity..."
              />
            </div>

            <div>
              <div class="mb-1.5 flex items-center justify-between gap-3">
                <label class="block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Link Existing Article</label>
                <button
                  type="button"
                  class="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-50"
                  :disabled="creatingEntity || !String(editingPin.title || '').trim()"
                  @click="emit('create-article')"
                >
                  {{ creatingEntity ? 'Creating…' : 'Create Article From Pin' }}
                </button>
              </div>

              <select
                v-model="editingPin.entityId"
                class="eldra-input w-full rounded-none px-4 py-3 text-sm"
              >
                <option :value="null" class="bg-slate-900 text-slate-100">No linked article (pin-only note)</option>
                <option
                  v-for="entity in entityOptions"
                  :key="entity.value"
                  :value="entity.value"
                  class="bg-slate-900 text-slate-100"
                >
                  {{ entity.label }} ({{ entity.type }})
                </option>
              </select>

              <p class="mt-2 text-xs text-[#9f9278]">
                Only map-relevant entity types are shown here.
              </p>
            </div>

            <div>
              <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Link Destination Map</label>
              <select
                v-model="editingPin.linkedMapId"
                class="eldra-input w-full rounded-none px-4 py-3 text-sm"
              >
                <option :value="null" class="bg-slate-900 text-slate-100">No linked map</option>
                <option
                  v-for="mapOption in mapOptions"
                  :key="mapOption.id"
                  :value="mapOption.id"
                  class="bg-slate-900 text-slate-100"
                >
                  {{ mapOption.title }}
                </option>
              </select>

              <p class="mt-2 text-xs text-[#9f9278]">
                Choose a destination map for drill-down navigation.
              </p>
            </div>

            <div>
              <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Preview Image</label>

              <div
                v-if="editingPin.imageUrl"
                class="eldra-image-frame mb-3 overflow-hidden rounded-none border bg-black/20"
              >
                <img
                  :src="editingPin.imageUrl"
                  alt="Pin preview"
                  class="h-40 w-full object-cover"
                >
              </div>

              <input
                type="file"
                accept="image/*"
                class="block w-full text-sm text-[#d8ceb8] file:mr-4 file:rounded-none file:border-0 file:bg-white/[0.08] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/[0.12]"
                @change="emit('upload-image', $event)"
              >
            </div>

            <div>
              <label class="flex items-start gap-3 text-sm text-[#d8ceb8]">
                <input
                  v-model="editingPin.inheritFromEntity"
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 rounded border-white/10 bg-[rgba(20,17,12,0.72)]"
                >
                <span>Use linked article summary/image when pin fields are empty</span>
              </label>
            </div>

            <div class="eldra-codex-soft rounded-none px-4 py-2 text-xs text-[#9f9278]">
              x: {{ editingPin.x.toFixed(1) }} &nbsp; y: {{ editingPin.y.toFixed(1) }}
            </div>
          </div>
        </div>

        <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
          <div class="flex gap-3">
            <button
              type="button"
              class="eldra-button flex-1 rounded-none py-2.5 text-sm"
              @click="emit('close')"
            >
              Cancel
            </button>

            <button
              type="button"
              class="eldra-button flex-1 rounded-none py-2.5 text-sm font-medium disabled:opacity-50"
              :disabled="!String(editingPin.title || '').trim() || savingPin"
              @click="emit('save')"
            >
              {{ savingPin ? 'Saving…' : (editingPin.id ? 'Update Pin' : 'Save Pin') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
