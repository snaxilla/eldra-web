<script setup lang="ts">
// CharacterRestActions -- Short Rest / Long Rest / Spend Hit Die, moved
// verbatim out of CharacterCommandResources.vue's Rest card (Phase 4B) so
// the V2 sheet header's single Rest control exposes the same actions. Each
// is an atomic Recovery action (POST .../recovery); the Spend Hit Die
// guard is a UI convenience the server enforces too.
import type { StoredCharacterHealth } from '~/lib/characters/health'
import type { RecoveryActionType } from './CharacterCommandResources.vue'

const props = withDefaults(defineProps<{
  health: StoredCharacterHealth
  maxHp: number | null
  hitDiceMax: number | null
  hitDiceAvailable: number | null
  hitDieSize: number | null
  saving?: boolean
}>(), {
  saving: false
})

const emit = defineEmits<{
  recovery: [{ type: RecoveryActionType; amount?: number }]
}>()

function emitRecovery(type: RecoveryActionType) {
  emit('recovery', { type })
}

const hitDiceLabel = computed(() => {
  if (props.hitDieSize == null) return 'Hit Dice'
  return `Hit Dice (d${props.hitDieSize})`
})
</script>

<template>
  <div>
    <div class="mt-1.5 grid grid-cols-2 gap-1.5">
      <button
        type="button"
        class="eldra-button flex min-h-11 items-center justify-center gap-1.5 rounded-none text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="saving"
        @click="emitRecovery('short-rest')"
      >
        <UIcon
          name="i-lucide-coffee"
          class="h-4 w-4 shrink-0"
          aria-hidden="true"
        />
        <span class="truncate">Short Rest</span>
      </button>

      <button
        type="button"
        class="eldra-button flex min-h-11 items-center justify-center gap-1.5 rounded-none text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="saving"
        @click="emitRecovery('long-rest')"
      >
        <!-- The installed Lucide set (@iconify-json/lucide) has no
             "campfire" glyph -- confirmed by inspecting its own
             icons.json before choosing this -- so "flame" is the
             closest semantically-correct alternative, per this task's
             own explicit instruction to prefer Campfire over Flame
             only when Campfire actually exists. -->
        <UIcon
          name="i-lucide-flame"
          class="h-4 w-4 shrink-0"
          aria-hidden="true"
        />
        <span class="truncate">Long Rest</span>
      </button>
    </div>

    <div class="mt-2 flex items-center justify-between gap-2 border-t border-eldra-accent/14 pt-1.5">
      <span class="min-w-0 truncate text-[0.6rem] uppercase tracking-[0.16em] text-eldra-text-faint">{{ hitDiceLabel }}</span>
      <span class="shrink-0 text-sm tabular-nums text-eldra-text-soft">{{ hitDiceAvailable ?? '—' }} / {{ hitDiceMax ?? '—' }}</span>
    </div>
    <button
      type="button"
      class="eldra-button mt-1.5 min-h-11 w-full rounded-none text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="saving || (hitDiceAvailable != null && hitDiceAvailable <= 0) || (maxHp != null && health.currentHp >= maxHp)"
      @click="emitRecovery('spend-hit-die')"
    >
      Spend Hit Die
    </button>
  </div>
</template>
