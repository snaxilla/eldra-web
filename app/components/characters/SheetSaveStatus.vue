<script setup lang="ts">
const props = defineProps<{
  error?: string
  success?: string
  timeoutMs?: number
}>()

const emit = defineEmits<{
  (event: 'clear-error'): void
  (event: 'clear-success'): void
}>()

const visibleError = ref('')
const visibleSuccess = ref('')
const showError = ref(false)
const showSuccess = ref(false)

let errorTimer: ReturnType<typeof setTimeout> | null = null
let errorFadeTimer: ReturnType<typeof setTimeout> | null = null
let successTimer: ReturnType<typeof setTimeout> | null = null
let successFadeTimer: ReturnType<typeof setTimeout> | null = null

const dismissDelay = computed(() => {
  const parsed = Number(props.timeoutMs || 10000)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000
})

function clearTimer(timer: ReturnType<typeof setTimeout> | null) {
  if (timer) clearTimeout(timer)
}

function clearErrorTimers() {
  clearTimer(errorTimer)
  clearTimer(errorFadeTimer)
  errorTimer = null
  errorFadeTimer = null
}

function clearSuccessTimers() {
  clearTimer(successTimer)
  clearTimer(successFadeTimer)
  successTimer = null
  successFadeTimer = null
}

function startErrorDismiss() {
  clearErrorTimers()

  errorTimer = setTimeout(() => {
    showError.value = false

    errorFadeTimer = setTimeout(() => {
      visibleError.value = ''
      emit('clear-error')
    }, 250)
  }, dismissDelay.value)
}

function startSuccessDismiss() {
  clearSuccessTimers()

  successTimer = setTimeout(() => {
    showSuccess.value = false

    successFadeTimer = setTimeout(() => {
      visibleSuccess.value = ''
      emit('clear-success')
    }, 250)
  }, dismissDelay.value)
}

watch(
  () => props.error,
  (value) => {
    const text = String(value || '').trim()

    if (!text) {
      clearErrorTimers()
      showError.value = false
      visibleError.value = ''
      return
    }

    visibleError.value = text
    showError.value = true
    startErrorDismiss()
  },
  { immediate: true }
)

watch(
  () => props.success,
  (value) => {
    const text = String(value || '').trim()

    if (!text) {
      clearSuccessTimers()
      showSuccess.value = false
      visibleSuccess.value = ''
      return
    }

    visibleSuccess.value = text
    showSuccess.value = true
    startSuccessDismiss()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  clearErrorTimers()
  clearSuccessTimers()
})
</script>

<template>
  <div>
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-250"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div
        v-if="showError && visibleError"
        class="mt-4 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
      >
        {{ visibleError }}
      </div>
    </Transition>

    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-250"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div
        v-if="showSuccess && visibleSuccess"
        class="mt-4 rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200"
      >
        {{ visibleSuccess }}
      </div>
    </Transition>
  </div>
</template>
