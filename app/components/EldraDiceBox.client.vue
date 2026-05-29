<script setup lang="ts">
const visible = ref(false)
const loading = ref(false)
const error = ref('')
const latestRoll = ref<any | null>(null)
const rollHistory = ref<any[]>([])
const diceBox = shallowRef<any | null>(null)

const boxId = `eldra-dice-box-${Math.random().toString(36).slice(2)}`

let DiceBoxCtor: any = null
let fallbackTimer: ReturnType<typeof setTimeout> | null = null

function cleanNotation(value: any) {
  return String(value || '')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, '')
    .replace(/\+\-/g, '-')
    .replace(/\-\+/g, '-')
    .replace(/\+\+/g, '+')
    .trim()
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
  if (!value || typeof value !== 'object') return null

  for (const key of ['total', 'totalValue', 'resultTotal']) {
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

  const possibleValue = Number(value.value ?? value.roll ?? value.result)

  if (
    Number.isFinite(possibleValue) &&
    (
      value.sides ||
      value.dieType ||
      value.diceType ||
      value.type === 'die' ||
      value.type === 'dice' ||
      value.notation
    )
  ) {
    return [possibleValue]
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

function summarizeRoll(label: string, notation: string, result: any) {
  const totalFromResult = directTotalFromResult(result)
  const diceValues = diceValuesFromResult(result)
  const modifier = flatModifierFromNotation(notation)
  const total = totalFromResult ?? (diceValues.length ? diceValues.reduce((sum, value) => sum + value, 0) + modifier : null)

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

function finishRoll(label: string, notation: string, result: any) {
  if (fallbackTimer) {
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }

  const summary = summarizeRoll(label, notation, result)
  latestRoll.value = summary
  rollHistory.value = [summary, ...rollHistory.value].slice(0, 8)
  loading.value = false
}

async function ensureDiceBox() {
  if (diceBox.value) return diceBox.value

  await nextTick()

  if (!DiceBoxCtor) {
    const mod: any = await import('@3d-dice/dice-box')
    DiceBoxCtor = mod.default || mod
  }

  const instance = new DiceBoxCtor(`#${boxId}`, {
    assetPath: '/assets/dice-box/',
    theme: 'default',
    scale: 6,
    gravity: 1,
    mass: 1,
    friction: 0.8,
    restitution: 0.7
  })

  diceBox.value = instance
  await instance.init()

  return instance
}

async function rollDice(options: { notation: string; label?: string; kind?: string }) {
  const notation = cleanNotation(options?.notation)
  const label = String(options?.label || options?.kind || 'Roll')

  if (!notation) {
    error.value = 'No dice notation provided.'
    visible.value = true
    return
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
    const box = await ensureDiceBox()

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
      }, 6500)
    }
  } catch (err: any) {
    loading.value = false
    error.value = err?.message || '3D dice roll failed.'
  }
}

function closeRoller() {
  visible.value = false
}

defineExpose({
  rollDice
})
</script>

<template>
  <Transition
    enter-from-class="opacity-0"
    enter-active-class="transition duration-150"
    leave-to-class="opacity-0"
    leave-active-class="transition duration-150"
  >
    <div
      v-if="visible"
      class="fixed inset-0 z-[175] bg-black/55 backdrop-blur-sm"
      @click.self="closeRoller"
    >
      <div class="absolute inset-x-3 bottom-3 top-[18dvh] overflow-hidden rounded-none border border-[rgba(201,164,90,0.42)] bg-[rgba(7,13,20,0.94)] shadow-[0_18px_60px_rgba(0,0,0,0.62)] md:left-auto md:right-4 md:top-auto md:h-[420px] md:w-[560px]">
        <div class="flex h-full flex-col">
          <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-4 py-3">
            <div class="min-w-0">
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">3D Dice</div>
              <div class="mt-1 truncate text-lg font-semibold text-white">
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

          <div class="relative min-h-0 flex-1">
            <div
              :id="boxId"
              class="h-full w-full bg-[radial-gradient(circle_at_center,rgba(39,57,76,0.45),rgba(3,6,10,0.95)_70%)]"
            />

            <div class="pointer-events-none absolute left-3 top-3 rounded-none border border-[rgba(201,164,90,0.28)] bg-[rgba(7,13,20,0.78)] px-3 py-2 backdrop-blur">
              <div class="text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Total</div>
              <div class="mt-1 text-3xl font-semibold text-white">
                <span v-if="latestRoll?.total !== null && latestRoll?.total !== undefined">{{ latestRoll.total }}</span>
                <span v-else>—</span>
              </div>
            </div>

            <div
              v-if="loading"
              class="pointer-events-none absolute right-3 top-3 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(7,13,20,0.78)] px-3 py-2 text-xs text-[#d8ceb8] backdrop-blur"
            >
              Rolling...
            </div>

            <div
              v-if="error"
              class="absolute inset-x-3 bottom-3 rounded-none border border-red-500/24 bg-red-500/12 p-3 text-sm text-red-100"
            >
              {{ error }}
            </div>
          </div>

          <div
            v-if="latestRoll"
            class="border-t border-[rgba(201,164,90,0.22)] px-4 py-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div class="min-w-0 text-[#9f9278]">
                <span class="text-[#d8ceb8]">Formula:</span>
                {{ latestRoll.notation }}
              </div>

              <div
                v-if="latestRoll.diceValues?.length"
                class="text-[#9f9278]"
              >
                <span class="text-[#d8ceb8]">Dice:</span>
                {{ latestRoll.diceValues.join(', ') }}
                <span v-if="latestRoll.modifier"> · Mod {{ latestRoll.modifier >= 0 ? '+' : '' }}{{ latestRoll.modifier }}</span>
              </div>
            </div>

            <div
              v-if="rollHistory.length > 1"
              class="mt-2 flex gap-2 overflow-x-auto text-xs"
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
        </div>
      </div>
    </div>
  </Transition>
</template>
