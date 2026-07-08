<script setup lang="ts">
const props = withDefaults(defineProps<{
  saving?: boolean
  error?: string
  success?: string
}>(), {
  saving: false,
  error: '',
  success: ''
})

const emit = defineEmits<{
  (event: 'short-rest'): void
  (event: 'long-rest'): void
}>()

const open = ref(false)

function close() {
  open.value = false
}

function takeShortRest() {
  emit('short-rest')
}

function takeLongRest() {
  emit('long-rest')
}
</script>

<template>
  <div class="relative">
    <button
      type="button"
      title="Rest controls"
      class="eldra-button inline-flex items-center gap-2 rounded-none px-4 py-2 text-sm"
      @click.stop="open = !open"
    >
      <UIcon name="i-lucide-campfire" class="h-4 w-4" />
      <span>Rest</span>
    </button>

    <div
      v-if="open"
      class="absolute right-0 top-full z-[90] mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(7,13,20,0.97)] p-3 text-left shadow-[0_18px_48px_rgba(0,0,0,0.50)] backdrop-blur"
      @click.stop
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-[10px] uppercase tracking-[0.3em] text-[#9f9278]">
            Rest
          </div>

          <div class="mt-1 text-xs leading-5 text-[#d8ceb8]">
            Recover hit points, spell slots, and limited resources.
          </div>
        </div>

        <button
          type="button"
          class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
          @click="close"
        >
          Close
        </button>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          class="rounded-none border border-[rgba(65,82,103,0.64)] bg-[rgba(8,17,27,0.62)] px-3 py-2 text-xs font-semibold text-[#d8ceb8] disabled:opacity-50"
          :disabled="saving"
          @click="takeShortRest"
        >
          Short Rest
        </button>

        <button
          type="button"
          class="rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(201,164,90,0.12)] px-3 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-50"
          :disabled="saving"
          @click="takeLongRest"
        >
          {{ saving ? 'Resting...' : 'Long Rest' }}
        </button>
      </div>

      <div class="mt-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3 text-xs leading-5 text-[#9f9278]">
        <div>Long Rest restores HP to max, clears temp HP, resets spell slots, and clears long-rest resources.</div>
        <div class="mt-1">Short Rest tracking comes next with Hit Dice and short-rest resources.</div>
      </div>

      <div class="mt-2 min-h-[1.25rem] text-xs">
        <span v-if="saving" class="text-[#9f9278]">Saving...</span>
        <span v-else-if="error" class="text-red-200">{{ error }}</span>
        <span v-else-if="success" class="text-emerald-200">{{ success }}</span>
      </div>
    </div>
  </div>
</template>
