<script setup lang="ts">
const visible = ref(false)
const loading = ref(false)
const ready = ref(false)
const error = ref('')
const latestRoll = ref<any | null>(null)
const rollHistory = ref<any[]>([])
const diceBox = shallowRef<any | null>(null)

const boxId = `eldra-dice-box-${Math.random().toString(36).slice(2)}`

let DiceBoxCtor: any = null
let readyPromise: Promise<any> | null = null
let fallbackTimer: ReturnType<typeof setTimeout> | null = null
let autoHideTimer: ReturnType<typeof setTimeout> | null = null

function cleanNotation(value: any) {
  return String(value || '')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, '')
    .replace(/\+\-/g, '-')
    .replace(/\-\+/g, '-')
    .replace(/\+\+/g, '+')
    .trim()
}

function diceSpecsFromNotation(notation: string) {
  const specs: Array<{ count: number; sides: number }> = []
  const regex = /(\d*)d(\d+)/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(notation))) {
    const count = Math.min(100, Math.max(1, Number(match[1] || 1)))
    const sides = Math.min(1000, Math.max(1, Number(match[2] || 1)))
    specs.push({ count, sides })
  }

  return specs
}

function flatModifierFromNotation(notation: string) {
  const withoutDice = notation.replace(/[+-]?\d*d\d+/gi, '')
  const tokens = withoutDice.match(/[+-]?\d+/g) || []

  return tokens.reduce((sum, token) => {
    const parsed = Number(token)
    return Number.isFinite(parsed) ? sum + parsed : sum
  }, 0)
}

function directTotalFromResult(value: any): number | null {
  if (value === null || value === undefined) return null

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (Array.isArray(value)) {
    return null
  }

  if (typeof value !== 'object') return null

  for (const key of ['total', 'value', 'totalValue', 'resultTotal', 'result']) {
    const parsed = Number(value?.[key])
    if (Number.isFinite(parsed)) return parsed
  }

  return null
}

function diceValuesFromResult(value: any): number[] {
  if (!value) return []

  if (Array.isArray(value)) {
    return value.flatMap((item) => diceValuesFromResult(item))
  }

  if (typeof value !== 'object') return []

  const possibleValue = Number(value.value ?? value.roll)

  if (
    Number.isFinite(possibleValue) &&
    (
      value.sides ||
      value.dieType ||
      value.diceType ||
      value.type === 'die' ||
      value.type === 'dice'
    )
  ) {
    const sides = Number(value.sides || value.dieType || value.diceType || 0)

    if (!sides || (possibleValue >= 1 && possibleValue <= sides)) {
      return [possibleValue]
    }
  }

  if (Array.isArray(value.rolls)) {
    return value.rolls.flatMap((item: any) => diceValuesFromResult(item))
  }

  if (Array.isArray(value.dice)) {
    return value.dice.flatMap((item: any) => diceValuesFromResult(item))
  }

  if (Array.isArray(value.results)) {
    return value.results.flatMap((item: any) => diceValuesFromResult(item))
  }

  return []
}

function deriveDiceValuesFromTotal(notation: string, total: number | null, modifier: number) {
  if (!Number.isFinite(Number(total))) return []

  const specs = diceSpecsFromNotation(notation)
  const diceTotal = Number(total) - modifier

  if (specs.length === 1 && specs[0].count === 1) {
    const sides = specs[0].sides

    if (diceTotal >= 1 && diceTotal <= sides) {
      return [diceTotal]
    }
  }

  return []
}

function expectedRollBounds(notation: string, modifier: number) {
  const specs = diceSpecsFromNotation(notation)

  if (!specs.length) return null

  const diceMin = specs.reduce((sum, spec) => sum + spec.count, 0)
  const diceMax = specs.reduce((sum, spec) => sum + (spec.count * spec.sides), 0)

  return {
    min: diceMin + modifier,
    max: diceMax + modifier
  }
}

function summarizeRoll(label: string, notation: string, result: any) {
  const modifier = flatModifierFromNotation(notation)
  const totalFromResult = directTotalFromResult(result)
  const rawDiceValues = diceValuesFromResult(result)
  const bounds = expectedRollBounds(notation, modifier)

  let total = totalFromResult
  let diceValues = rawDiceValues

  if (total !== null && bounds && (total < bounds.min || total > bounds.max)) {
    const derived = deriveDiceValuesFromTotal(notation, total, modifier)

    if (derived.length) {
      diceValues = derived
    }
  }

  if (total === null && diceValues.length) {
    total = diceValues.reduce((sum, value) => sum + value, 0) + modifier
  }

  if (total !== null && !diceValues.length) {
    diceValues = deriveDiceValuesFromTotal(notation, total, modifier)
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label,
    notation,
    total,
    diceValues,
    modifier,
    raw: result,
    rolledAt: new Date().toISOString()
  }
}

function scheduleAutoHide() {
  if (autoHideTimer) clearTimeout(autoHideTimer)

  autoHideTimer = setTimeout(() => {
    visible.value = false
  }, 9000)
}

function finishRoll(label: string, notation: string, result: any) {
  if (fallbackTimer) {
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }

  const summary = summarizeRoll(label, notation, result)
  latestRoll.value = summary
  rollHistory.value = [summary, ...rollHistory.value].slice(0, 8)
  loading.value = false
  scheduleAutoHide()
}

async function prewarmDiceBox() {
  if (diceBox.value) return diceBox.value
  if (readyPromise) return readyPromise

  readyPromise = (async () => {
    await nextTick()

    if (!DiceBoxCtor) {
      const mod: any = await import('@3d-dice/dice-box')
      DiceBoxCtor = mod.default || mod
    }

    const instance = new DiceBoxCtor(`#${boxId}`, {
      assetPath: '/assets/dice-box/',
      theme: 'default',

      // Bigger dice, faster-feeling throw.
      scale: 13,
      delay: 10,
      settleTimeout: 2600,
      throwForce: 6,
      spinForce: 5,
      startingHeight: 8,
      gravity: 1,
      mass: 1,
      friction: 0.8,
      restitution: 0.7
    })

    diceBox.value = instance
    await instance.init()
    ready.value = true

    return instance
  })()

  return readyPromise
}

async function rollDice(options: { notation: string; label?: string; kind?: string }) {
  const notation = cleanNotation(options?.notation)
  const label = String(options?.label || options?.kind || 'Roll')

  if (!notation) {
    error.value = 'No dice notation provided.'
    visible.value = true
    return
  }

  if (autoHideTimer) {
    clearTimeout(autoHideTimer)
    autoHideTimer = null
  }

  visible.value = true
  loading.value = true
  error.value = ''
  latestRoll.value = {
    id: `pending-${Date.now()}`,
    label,
    notation,
    total: null,
    diceValues: [],
    modifier: flatModifierFromNotation(notation),
    raw: null,
    rolledAt: new Date().toISOString()
  }

  try {
    await nextTick()

    const box = await prewarmDiceBox()

    if (typeof box.resize === 'function') {
      box.resize()
    }

    if (typeof box.clear === 'function') {
      box.clear()
    }

    box.onRollComplete = (results: any) => {
      finishRoll(label, notation, results)
    }

    const returned = await Promise.resolve(box.roll(notation))

    if (returned) {
      finishRoll(label, notation, returned)
    } else {
      fallbackTimer = setTimeout(() => {
        loading.value = false
        scheduleAutoHide()
      }, 3800)
    }
  } catch (err: any) {
    loading.value = false
    error.value = err?.message || '3D dice roll failed.'
    scheduleAutoHide()
  }
}

function closeRoller() {
  visible.value = false
}

onMounted(() => {
  const start = () => {
    prewarmDiceBox().catch((err: any) => {
      error.value = err?.message || '3D dice failed to initialize.'
    })
  }

  if ('requestIdleCallback' in window) {
    ;(window as any).requestIdleCallback(start, { timeout: 2000 })
  } else {
    setTimeout(start, 300)
  }
})

onBeforeUnmount(() => {
  if (fallbackTimer) clearTimeout(fallbackTimer)
  if (autoHideTimer) clearTimeout(autoHideTimer)

  try {
    diceBox.value?.clear?.()
  } catch {}
})

defineExpose({
  rollDice
})
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-[175] overflow-hidden">
    <!-- Full-screen transparent dice target. Kept mounted so Dice Box can prewarm before the first roll. -->
    <div
      :id="boxId"
      class="eldra-dice-stage absolute inset-0 transition-opacity duration-150"
      :class="visible ? 'opacity-100' : 'opacity-0'"
    />

    <Transition
      enter-from-class="translate-y-3 opacity-0"
      enter-active-class="transition duration-150"
      leave-to-class="translate-y-3 opacity-0"
      leave-active-class="transition duration-150"
    >
      <div
        v-if="visible"
        class="pointer-events-auto absolute inset-x-3 bottom-3 rounded-none border border-[rgba(201,164,90,0.42)] bg-[rgba(7,13,20,0.92)] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.50)] backdrop-blur md:left-auto md:right-4 md:w-[420px]"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[10px] uppercase tracking-[0.3em] text-[#9f9278]">3D Dice</div>
            <div class="mt-1 truncate text-base font-semibold text-white">
              {{ latestRoll?.label || 'Roll' }}
            </div>
            <div class="mt-0.5 text-xs text-[#9f9278]">
              {{ latestRoll?.notation || '' }}
            </div>
          </div>

          <button
            type="button"
            class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
            @click="closeRoller"
          >
            Close
          </button>
        </div>

        <div v-if="error" class="mt-3 rounded-none border border-red-500/24 bg-red-500/12 p-3 text-sm text-red-100">
          {{ error }}
        </div>

        <div v-else class="mt-3 grid grid-cols-[76px_minmax(0,1fr)] gap-3">
          <div class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] p-3 text-center">
            <div class="text-[10px] uppercase tracking-[0.2em] text-[#9f9278]">Total</div>
            <div class="mt-1 text-4xl font-semibold text-white">
              <span v-if="latestRoll?.total !== null && latestRoll?.total !== undefined">{{ latestRoll.total }}</span>
              <span v-else>—</span>
            </div>
          </div>

          <div class="min-w-0 rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="text-[10px] uppercase tracking-[0.2em] text-[#9f9278]">Formula</div>
                <div class="mt-1 break-words text-sm font-semibold text-white">
                  {{ latestRoll?.notation || '—' }}
                </div>
              </div>

              <div
                v-if="loading"
                class="shrink-0 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#d8ceb8]"
              >
                Rolling...
              </div>

              <div
                v-else-if="!ready"
                class="shrink-0 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#d8ceb8]"
              >
                Loading...
              </div>
            </div>

            <div
              v-if="latestRoll?.diceValues?.length"
              class="mt-3 text-xs text-[#9f9278]"
            >
              <span class="text-[#d8ceb8]">Dice:</span>
              {{ latestRoll.diceValues.join(', ') }}
              <span v-if="latestRoll.modifier">
                · Mod {{ latestRoll.modifier >= 0 ? '+' : '' }}{{ latestRoll.modifier }}
              </span>
            </div>
          </div>
        </div>

        <div
          v-if="rollHistory.length > 1"
          class="mt-3 flex gap-2 overflow-x-auto border-t border-[rgba(201,164,90,0.16)] pt-3 text-xs"
        >
          <div
            v-for="roll in rollHistory.slice(1)"
            :key="roll.id"
            class="shrink-0 rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] px-2 py-1 text-[#9f9278]"
          >
            {{ roll.label }}:
            <span class="font-semibold text-white">{{ roll.total ?? '—' }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.eldra-dice-stage {
  width: 100vw;
  height: 100dvh;
}

.eldra-dice-stage :deep(canvas) {
  position: absolute !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100dvh !important;
  max-width: none !important;
  max-height: none !important;
}
</style>
