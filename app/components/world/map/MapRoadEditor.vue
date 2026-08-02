<script setup lang="ts">
// Reference implementation for Scene Graph object editors. Structure to
// follow for future editors (Regions, Lighting, Walls, Fog, Tokens):
// - The parent page owns a small draft object (id + editable fields) and
//   passes it down; this component mutates it directly via v-model, the
//   same lifted-state pattern MapPinEditor.vue uses for `editingPin`.
// - Nothing here talks to persistence directly -- the parent's existing
//   canonical Scene Layer Object sync path (writeSceneLayerObjectsForMap)
//   handles that on `save`.
// - Read-only derived data (vertex count) is passed pre-computed rather
//   than handing this component raw LayerObject/geometry internals, so it
//   stays decoupled from the Scene Graph object shape.
// - Sections are already split (Name, Info, Actions) so a future property
//   (style, width, labels) can be added as its own section without
//   restructuring the component.

// Dash pattern is stored as a semantic intent ('solid'/'dashed'/'dotted'),
// not a raw Leaflet dashArray string -- the renderer decides how to turn
// that intent into engine-specific drawing instructions (see
// .github/docs/architecture/scene-graph.md's Style section).
type RoadDashPattern = 'solid' | 'dashed' | 'dotted'

// A preset is authoring convenience, not a constraint: picking one
// populates the four style fields below, but those fields (not the
// preset id) remain the actual source of truth for rendering -- the
// preset is only remembered so the editor can show "this Road started
// life as a Stone Road" even after individual values are overridden.
// 'custom' is the implicit value for any Road with no recognized preset,
// including every Road persisted before this feature existed.
type RoadPresetId = 'custom' | 'trail' | 'dirt-road' | 'stone-road' | 'kings-road'

type RoadDraft = {
  objectId: string
  name: string
  preset: RoadPresetId
  color: string
  width: number
  opacity: number
  dashPattern: RoadDashPattern
}

const DASH_PATTERN_OPTIONS: { label: string; value: RoadDashPattern }[] = [
  { label: 'Solid', value: 'solid' },
  { label: 'Dashed', value: 'dashed' },
  { label: 'Dotted', value: 'dotted' },
]

type RoadPresetDefinition = {
  id: RoadPresetId
  label: string
  color?: string
  width?: number
  opacity?: number
  dashPattern?: RoadDashPattern
}

const ROAD_PRESETS: RoadPresetDefinition[] = [
  { id: 'custom', label: 'Custom' },
  { id: 'trail', label: 'Trail', color: '#8b5a2b', width: 2, opacity: 0.7, dashPattern: 'dotted' },
  { id: 'dirt-road', label: 'Dirt Road', color: '#c2a173', width: 4, opacity: 0.85, dashPattern: 'dashed' },
  { id: 'stone-road', label: 'Stone Road', color: '#b8b8b8', width: 4, opacity: 0.9, dashPattern: 'solid' },
  { id: 'kings-road', label: "King's Road", color: '#e8dfc8', width: 6, opacity: 1, dashPattern: 'solid' },
]

const props = defineProps<{
  open: boolean
  editingRoad: RoadDraft | null
  vertexCount: number
  saving: boolean
  saveError?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save'): void
  (e: 'delete'): void
}>()

// Applies a preset's defaults to the draft's style fields. Does not
// touch `preset` itself -- the <select>'s v-model already set that.
// Only fires on an explicit preset change, so it never runs again just
// because the user tweaked a slider afterward -- the preset stays
// selected until they deliberately pick a different one (including back
// to "Custom", which is a real, explicit choice, not an automatic reset).
function onPresetChange() {
  if (!props.editingRoad) return

  const preset = ROAD_PRESETS.find((p) => p.id === props.editingRoad!.preset)
  if (!preset) return

  if (preset.color != null) props.editingRoad.color = preset.color
  if (preset.width != null) props.editingRoad.width = preset.width
  if (preset.opacity != null) props.editingRoad.opacity = preset.opacity
  if (preset.dashPattern != null) props.editingRoad.dashPattern = preset.dashPattern
}
</script>

<template>
  <Transition
    enter-from-class="translate-x-full opacity-0"
    enter-active-class="transition duration-200"
    leave-to-class="translate-x-full opacity-0"
    leave-active-class="transition duration-200"
  >
    <div
      v-if="open && editingRoad"
      class="eldra-ornate-panel eldra-frame-corners fixed bottom-6 right-6 z-30 w-80 rounded-none border p-5 backdrop-blur"
    >
      <div class="mb-3 flex items-center justify-between">
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Road
        </div>

        <button
          type="button"
          class="text-[#9f9278] transition hover:text-white"
          @click="emit('close')"
        >
          <UIcon
            name="i-lucide-x"
            class="h-4 w-4"
          />
        </button>
      </div>

      <div
        v-if="saveError"
        class="mb-3 rounded-none border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200"
      >
        {{ saveError }}
      </div>

      <div>
        <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Name</label>
        <input
          v-model="editingRoad.name"
          type="text"
          placeholder="e.g. The Old King's Road"
          class="eldra-input w-full rounded-none px-4 py-2.5 text-sm placeholder-[#756a57]"
        >
      </div>

      <div class="mt-3 text-sm text-[#9f9278]">
        Vertices: {{ vertexCount }}
      </div>

      <div class="mt-4 border-t border-[rgba(201,164,90,0.22)] pt-4">
        <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Road Type</label>
        <select
          v-model="editingRoad.preset"
          class="eldra-input w-full rounded-none px-3 py-1.5 text-sm text-[#f5e7bd]"
          @change="onPresetChange"
        >
          <option
            v-for="preset in ROAD_PRESETS"
            :key="preset.id"
            :value="preset.id"
            class="bg-[#090909] text-[#f5e7bd]"
          >
            {{ preset.label }}
          </option>
        </select>
      </div>

      <div class="mt-4 border-t border-[rgba(201,164,90,0.22)] pt-4">
        <div class="mb-2 text-xs uppercase tracking-[0.25em] text-[#9f9278]">Style</div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-xs text-[#9f9278]">Color</label>
            <input
              v-model="editingRoad.color"
              type="color"
              class="h-9 w-full cursor-pointer rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-1"
            >
          </div>

          <div>
            <label class="mb-1 block text-xs text-[#9f9278]">Width</label>
            <input
              v-model.number="editingRoad.width"
              type="number"
              min="1"
              max="20"
              step="1"
              class="eldra-input w-full rounded-none px-3 py-1.5 text-sm"
            >
          </div>

          <div>
            <label class="mb-1 block text-xs text-[#9f9278]">Opacity ({{ editingRoad.opacity.toFixed(2) }})</label>
            <input
              v-model.number="editingRoad.opacity"
              type="range"
              min="0"
              max="1"
              step="0.05"
              class="w-full"
            >
          </div>

          <div>
            <label class="mb-1 block text-xs text-[#9f9278]">Dash Pattern</label>
            <select
              v-model="editingRoad.dashPattern"
              class="eldra-input w-full rounded-none px-3 py-1.5 text-sm text-[#f5e7bd]"
            >
              <option
                v-for="opt in DASH_PATTERN_OPTIONS"
                :key="opt.value"
                :value="opt.value"
                class="bg-[#090909] text-[#f5e7bd]"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <div class="mt-4 flex gap-2">
        <button
          type="button"
          class="rounded-none border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/20"
          @click="emit('delete')"
        >
          Delete
        </button>

        <button
          type="button"
          class="eldra-button flex-1 rounded-none py-2.5 text-sm font-medium disabled:opacity-50"
          :disabled="saving || !editingRoad.name.trim()"
          @click="emit('save')"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  </Transition>
</template>
