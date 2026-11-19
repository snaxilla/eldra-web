<script setup lang="ts">
// Installable Web App -- a modest "Install Eldra" action, styled and
// placed exactly like its sibling EldraAccessibilityMenu.vue (same
// compact/fill trigger API, same button classes) rather than a new
// navigation section. Renders nothing at all when there is no honest
// action to offer: already installed, or a browser that neither exposes
// a real install prompt nor has a known manual path (see
// useInstallPrompt.ts for exactly how each is decided).
withDefaults(defineProps<{
  compact?: boolean
  fill?: boolean
}>(), {
  compact: false,
  fill: false
})

const { isInstalled, canPrompt, isIOSSafari, promptInstall } = useInstallPrompt()

const showAction = computed(() => !isInstalled.value && (canPrompt.value || isIOSSafari.value))

const installState = ref<'idle' | 'prompting'>('idle')

async function onInstallClick() {
  if (!canPrompt.value || installState.value === 'prompting') return

  installState.value = 'prompting'
  try {
    await promptInstall()
  } finally {
    installState.value = 'idle'
  }
}
</script>

<template>
  <!-- The real Chromium prompt: a plain action button, invoked only by
       this click -- never auto-opened, never retried on its own. -->
  <button
    v-if="showAction && canPrompt"
    type="button"
    class="flex items-center justify-center gap-2 rounded-none border border-eldra-accent/24 bg-eldra-panel/72 text-sm text-eldra-text-soft transition hover:bg-eldra-accent/10 hover:text-eldra-text-strong disabled:opacity-60"
    :class="compact ? ['h-10', fill ? 'w-full' : 'w-10'] : 'w-full px-3 py-2'"
    :disabled="installState === 'prompting'"
    aria-label="Install Eldra"
    @click="onInstallClick"
  >
    <UIcon name="i-lucide-download" class="h-4 w-4" />
    <span v-if="!compact">{{ installState === 'prompting' ? 'Installing…' : 'Install Eldra' }}</span>
  </button>

  <!-- iOS/iPadOS Safari: there is no browser-level prompt to invoke, so
       this instead reveals the manual Share-sheet steps -- a popover for
       information, not an action, matching EldraAccessibilityMenu's own
       popover shape for a visually consistent pair of controls. -->
  <UPopover
    v-else-if="showAction"
    :content="{ side: fill ? 'right' : compact ? 'bottom' : 'top', align: compact && !fill ? 'end' : 'start' }"
  >
    <button
      type="button"
      class="flex items-center justify-center gap-2 rounded-none border border-eldra-accent/24 bg-eldra-panel/72 text-sm text-eldra-text-soft transition hover:bg-eldra-accent/10 hover:text-eldra-text-strong"
      :class="compact ? ['h-10', fill ? 'w-full' : 'w-10'] : 'w-full px-3 py-2'"
      aria-label="How to install Eldra"
    >
      <UIcon name="i-lucide-download" class="h-4 w-4" />
      <span v-if="!compact">Install Eldra</span>
    </button>

    <template #content>
      <div class="w-72 p-4 text-eldra-text">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-download" class="h-4 w-4 text-eldra-accent" />
          <h2 class="eldra-display text-sm text-eldra-text-strong">
            Install Eldra
          </h2>
        </div>
        <span class="eldra-ornament-divider mt-2" aria-hidden="true" />

        <ol class="mt-3 list-decimal space-y-1.5 pl-4 text-sm leading-6 text-eldra-text-soft">
          <li>
            Tap <UIcon name="i-lucide-share" class="inline h-3.5 w-3.5 align-text-bottom" /> Share in Safari's toolbar.
          </li>
          <li>Scroll down and tap "Add to Home Screen".</li>
          <li>Tap "Add" to confirm.</li>
        </ol>
      </div>
    </template>
  </UPopover>
</template>
