<script setup lang="ts">
// CharacterPortrait -- the character portrait frame with its add/change/
// remove controls and the deceased overlay. Moved verbatim out of
// CharacterSheetCommandCenter.vue (Phase 4B) so the V2 sheet header and
// the command center share one implementation. The host sizes the frame
// (pass width/height/aspect classes); this component fills it.
//
// Touch: fine pointers get a hover-revealed two-button bar, coarse
// pointers one 44px "Edit" target opening both actions (Phase 4B-0).
const props = withDefaults(defineProps<{
  imageUrl?: string | null
  title?: string
  canEdit?: boolean
  saving?: boolean
  isDeceased?: boolean
  // Classes for the Change/Edit text labels -- hidden where the frame is
  // too small for text.
  labelClass?: string
}>(), {
  imageUrl: null,
  title: '',
  canEdit: false,
  saving: false,
  isDeceased: false,
  labelClass: 'hidden'
})

const emit = defineEmits<{
  update: [File]
  clear: []
}>()

const portraitFileInput = ref<HTMLInputElement | null>(null)

function triggerPortraitUpload() {
  if (!props.canEdit) return
  portraitFileInput.value?.click()
}

const portraitMenuItems = computed(() => [[
  { label: 'Change portrait', icon: 'i-lucide-camera', disabled: props.saving, onSelect: () => triggerPortraitUpload() },
  { label: 'Remove portrait', icon: 'i-lucide-trash-2', color: 'error' as const, disabled: props.saving, onSelect: () => emit('clear') }
]])

function handlePortraitFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('update', file)
  input.value = ''
}
</script>

<template>
  <div class="eldra-image-frame group relative overflow-hidden rounded-none border bg-black/25">
    <img
      v-if="imageUrl"
      :src="imageUrl"
      :alt="title || 'Character portrait'"
      class="absolute inset-0 h-full w-full object-cover object-top transition duration-200"
      :class="isDeceased ? 'grayscale' : ''"
      loading="lazy"
    >
    <button
      v-else-if="canEdit"
      type="button"
      class="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-1 text-center text-eldra-text-faint transition hover:bg-eldra-accent/10 focus-visible:bg-eldra-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-eldra-accent/65 disabled:cursor-not-allowed"
      :disabled="saving"
      aria-label="Add character portrait"
      @click="triggerPortraitUpload"
    >
      <UIcon name="i-lucide-image-plus" class="h-4 w-4" />
      <span class="text-[9px] uppercase tracking-[0.1em]">{{ saving ? 'Saving…' : 'Add portrait' }}</span>
    </button>
    <div
      v-else
      class="absolute inset-0 flex h-full w-full items-center justify-center text-center text-[9px] uppercase tracking-[0.1em] text-eldra-text-faint"
    >
      No portrait
    </div>

    <!-- Deceased presentation -- Header Cleanup 3, flavor only (see
         `isDeceased`'s own script comment above). Always in the DOM,
         opacity-toggled rather than v-if, so the ~200ms transition
         actually animates instead of snapping in/out. `pointer-
         events-none` throughout: never intercepts the Add/Change/
         Remove controls below, which keep working identically while
         deceased (Change/Remove also carry their own `z-10`, so they
         stay visually on top of this too, not just clickable through
         it). Works with or without a portrait image -- the dark
         overlay and red X render over the placeholder/"No portrait"
         state exactly the same way, since neither depends on `imageUrl`. -->
    <span
      v-if="isDeceased"
      class="sr-only"
    >
      Deceased
    </span>
    <div
      class="pointer-events-none absolute inset-0 bg-black/35 transition-opacity duration-200"
      :class="isDeceased ? 'opacity-100' : 'opacity-0'"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-200"
      :class="isDeceased ? 'opacity-100' : 'opacity-0'"
      aria-hidden="true"
    >
      <div class="absolute left-1/2 top-1/2 h-1 w-[200%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-red-600 shadow-[0_0_4px_rgba(0,0,0,0.8)]" />
      <div class="absolute left-1/2 top-1/2 h-1 w-[200%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-red-600 shadow-[0_0_4px_rgba(0,0,0,0.8)]" />
    </div>

    <!-- Edit affordances over an EXISTING portrait. Phase 4B-0: one
         bottom bar holding both actions. Always visible for touch
         (coarse pointers have no hover), with 44px targets there;
         revealed on hover or keyboard focus for fine pointers only.
         The old `md:opacity-0` gate hid them on touch tablets. -->
    <div
      v-if="canEdit && imageUrl"
      class="absolute inset-x-0 bottom-0 z-10 bg-black/80 opacity-100 transition pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100"
    >
      <!-- Fine pointers: two compact buttons, revealed on hover/focus. -->
      <div class="flex pointer-coarse:hidden">
        <button
          type="button"
          class="flex min-h-7 min-w-0 flex-1 items-center justify-center gap-1 px-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-eldra-text-strong focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-eldra-accent disabled:cursor-not-allowed"
          :disabled="saving"
          aria-label="Change character portrait"
          @click="triggerPortraitUpload"
        >
          <UIcon name="i-lucide-camera" class="h-3 w-3 shrink-0" />
          <!-- Text only where the portrait is a full grid column. -->
          <span :class="['truncate', labelClass]">{{ saving ? 'Saving…' : 'Change' }}</span>
        </button>

        <button
          type="button"
          class="flex min-h-7 w-7 shrink-0 items-center justify-center border-l border-eldra-accent/20 text-[10px] text-eldra-text-soft transition hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-eldra-accent disabled:cursor-not-allowed"
          :disabled="saving"
          aria-label="Remove character portrait"
          @click="emit('clear')"
        >
          ✕
        </button>
      </div>

      <!-- Touch: one full-width 44px target opening both actions. -->
      <UDropdownMenu
        :items="portraitMenuItems"
        :content="{ align: 'start', side: 'bottom' }"
      >
        <button
          type="button"
          class="hidden min-h-11 w-full items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-eldra-text-strong focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-eldra-accent pointer-coarse:flex"
          :disabled="saving"
          aria-label="Edit character portrait"
        >
          <UIcon name="i-lucide-camera" class="h-4 w-4 shrink-0" />
          <span :class="labelClass">{{ saving ? 'Saving…' : 'Edit' }}</span>
        </button>
      </UDropdownMenu>
    </div>

    <input
      ref="portraitFileInput"
      type="file"
      accept="image/*"
      class="sr-only"
      tabindex="-1"
      @change="handlePortraitFileChange"
    >
  </div>
</template>
