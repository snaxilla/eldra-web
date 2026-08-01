<script setup lang="ts">
// Canonical Build Tool HUD. Communicates the active tool and how to use it
// (primary interaction, finish, cancel, undo). Every future Build Tool
// (Regions, Lighting, Walls, Fog, Tokens, ...) should add an entry to
// `copyByTool` below rather than introducing a parallel HUD.
type BuildToolId = 'select' | 'pin' | 'image-overlay' | 'road'

type BuildToolHudCopy = {
  label: string
  description?: string
  primary?: string
  finish?: string
  cancel?: string
  undo?: string
}

const props = defineProps<{
  show: boolean
  activeTool?: BuildToolId | string | null
}>()

const copyByTool: Record<BuildToolId, BuildToolHudCopy> = {
  select: {
    label: 'Select Tool',
    description: 'Click an object to select it.',
  },
  pin: {
    label: 'Pin Tool',
    description: 'Places a pin linked to an entity or location.',
    primary: 'Click to place a pin.',
  },
  'image-overlay': {
    label: 'Image Overlay Tool',
    description: 'Places a single image overlay on this map.',
  },
  road: {
    label: 'Road Tool',
    description: 'Draws a multi-point road.',
    primary: 'Click to place vertices.',
    finish: 'Double-click to finish.',
    cancel: 'Esc to cancel.',
    undo: 'Backspace removes the previous vertex.',
  },
}

const copy = computed<BuildToolHudCopy>(() => {
  const tool = (props.activeTool || 'select') as BuildToolId
  return copyByTool[tool] || copyByTool.select
})
</script>

<template>
  <div
    v-if="show"
    class="pointer-events-none absolute right-4 top-4 z-20 max-w-xs rounded-none border border-[rgba(201,164,90,0.38)] bg-[rgba(20,17,12,0.86)] px-4 py-3 text-sm text-[#f5e7bd] backdrop-blur shadow-[0_0_24px_rgba(201,164,90,0.12)]"
  >
    <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em]">
      <UIcon
        name="i-lucide-pencil-ruler"
        class="h-4 w-4"
      />
      {{ copy.label }}
    </div>

    <div
      v-if="copy.description"
      class="mt-1.5 text-[#d8ceb8]"
    >
      {{ copy.description }}
    </div>

    <div
      v-if="copy.primary || copy.finish || copy.cancel || copy.undo"
      class="mt-2 space-y-0.5 text-xs text-[#9f9278]"
    >
      <div v-if="copy.primary">{{ copy.primary }}</div>
      <div v-if="copy.finish">{{ copy.finish }}</div>
      <div v-if="copy.cancel">{{ copy.cancel }}</div>
      <div v-if="copy.undo">{{ copy.undo }}</div>
    </div>
  </div>
</template>
