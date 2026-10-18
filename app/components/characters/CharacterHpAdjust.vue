<script setup lang="ts">
// CharacterHpAdjust -- one shared Amount field and Damage / Heal / Temp HP,
// moved verbatim out of CharacterCommandResources.vue (Phase 4B) so the V2
// sheet header's HP control opens the SAME adjustment. Every action goes
// through the Recovery System's `recovery` emit (POST .../recovery) --
// no HP arithmetic here.
import type { RecoveryActionType } from './CharacterCommandResources.vue'

const props = withDefaults(defineProps<{
  saving?: boolean
  // Focus the Amount field on mount -- set when this opens in a popover
  // from the header's HP value, so the player can type immediately.
  autofocus?: boolean
}>(), {
  saving: false,
  autofocus: false
})

const emit = defineEmits<{
  recovery: [{ type: RecoveryActionType; amount?: number }]
}>()

const amountDraft = ref('')
const amountInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
  if (props.autofocus) amountInput.value?.focus()
})

const parsedAmount = computed(() => {
  const parsed = Math.trunc(Number(amountDraft.value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
})

function emitRecovery(type: RecoveryActionType, amount?: number) {
  emit('recovery', amount === undefined ? { type } : { type, amount })
}

function applyDamageAction() {
  if (parsedAmount.value === null) return
  emitRecovery('damage', parsedAmount.value)
  amountDraft.value = ''
}

function applyHealingAction() {
  if (parsedAmount.value === null) return
  emitRecovery('heal', parsedAmount.value)
  amountDraft.value = ''
}

function applyTempHpAction() {
  if (parsedAmount.value === null) return
  emitRecovery('temp-hp', parsedAmount.value)
  amountDraft.value = ''
}
</script>

<template>
  <div>
    <input
      ref="amountInput"
      v-model="amountDraft"
      inputmode="numeric"
      placeholder="0"
      aria-label="Amount"
      class="eldra-input mt-1.5 min-h-11 w-full rounded-none px-2 py-1 text-center text-sm font-semibold tabular-nums text-white"
      :disabled="saving"
    >
    <div class="mt-1.5 grid grid-cols-2 gap-1.5">
      <button
        type="button"
        class="min-h-11 rounded-none border border-red-900/60 bg-red-950/20 text-xs font-semibold text-red-200 focus-visible:ring-2 focus-visible:ring-red-500/60 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="saving || parsedAmount === null"
        @click="applyDamageAction"
      >
        Damage
      </button>
      <button
        type="button"
        class="eldra-button min-h-11 rounded-none text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="saving || parsedAmount === null"
        @click="applyHealingAction"
      >
        Heal
      </button>
    </div>
    <button
      type="button"
      class="mt-1.5 min-h-11 w-full rounded-none border border-eldra-accent/50 bg-eldra-accent/12 text-xs font-semibold text-eldra-text-strong focus-visible:ring-2 focus-visible:ring-eldra-accent/65 disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="saving || parsedAmount === null"
      @click="applyTempHpAction"
    >
      Temp HP
    </button>
  </div>
</template>
