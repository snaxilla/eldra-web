<script setup lang="ts">
// CharacterDeathSaves -- Fails / Successes marks and Reset, moved verbatim
// out of CharacterVitalsBar.vue (Phase 4B) so the V2 sheet header shows the
// same control at 0 HP. Clicking mark N sets the count to N; clicking an
// already-filled mark clears back to just before it. Marks persist through
// the host's `save` (PUT .../health); Reset is the Recovery System's
// 'reset-death-saves' action. The host decides when this is visible.
import type { StoredDeathSaves } from '~/lib/characters/health'
import type { RecoveryActionType } from './CharacterCommandResources.vue'

const props = withDefaults(defineProps<{
  deathSaves: StoredDeathSaves
  saving?: boolean
}>(), {
  saving: false
})

const emit = defineEmits<{
  'mark-death-save': [{ kind: 'successes' | 'failures'; nextCount: number }]
  recovery: [{ type: RecoveryActionType }]
}>()

function markDeathSave(kind: 'successes' | 'failures', count: number) {
  const current = props.deathSaves[kind]
  const nextCount = current === count ? count - 1 : count
  emit('mark-death-save', { kind, nextCount })
}

function resetDeathSaves() {
  emit('recovery', { type: 'reset-death-saves' })
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-3">
    <div class="flex items-center gap-1.5">
      <span class="text-[0.65rem] uppercase tracking-[0.2em] text-eldra-text-faint">Fails</span>
      <div class="flex gap-1">
        <button
          v-for="mark in [1, 2, 3]"
          :key="`failures-${mark}`"
          type="button"
          class="size-6 shrink-0 rounded-full border text-[10px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-eldra-accent/65 disabled:cursor-not-allowed"
          :class="mark <= deathSaves.failures
            ? 'border-red-500 bg-red-950/40'
            : 'border-eldra-accent/24 bg-transparent'"
          :disabled="saving"
          :aria-label="`Death save failure mark ${mark}`"
          :aria-pressed="mark <= deathSaves.failures"
          @click="markDeathSave('failures', mark)"
        />
      </div>
    </div>

    <div class="flex items-center gap-1.5">
      <span class="text-[0.65rem] uppercase tracking-[0.2em] text-eldra-text-faint">Succ</span>
      <div class="flex gap-1">
        <button
          v-for="mark in [1, 2, 3]"
          :key="`successes-${mark}`"
          type="button"
          class="size-6 shrink-0 rounded-full border text-[10px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-eldra-accent/65 disabled:cursor-not-allowed"
          :class="mark <= deathSaves.successes
            ? 'border-eldra-positive bg-eldra-positive/22'
            : 'border-eldra-accent/24 bg-transparent'"
          :disabled="saving"
          :aria-label="`Death save success mark ${mark}`"
          :aria-pressed="mark <= deathSaves.successes"
          @click="markDeathSave('successes', mark)"
        />
      </div>
    </div>

    <button
      type="button"
      class="text-[0.65rem] uppercase tracking-[0.15em] text-eldra-text-faint underline-offset-2 hover:text-eldra-text-soft hover:underline disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="saving || (deathSaves.successes === 0 && deathSaves.failures === 0)"
      @click="resetDeathSaves"
    >
      Reset
    </button>
  </div>
</template>
