<script setup lang="ts">
import { summarizeRollEvent } from '~/utils/diceBoxRollSummary'

const visible = ref(false)
const loading = ref(false)
const ready = ref(false)
const error = ref('')
const latestRoll = ref<any | null>(null)
const rollHistory = ref<any[]>([])
const diceBox = shallowRef<any | null>(null)

const boxId = `eldra-dice-box-${Math.random().toString(36).slice(2)}`

const confettiPieces = Array.from({ length: 34 }, (_, index) => ({
  id: index,
  style: {
    '--x': `${((index % 9) - 4) * 34}px`,
    '--y': `${-80 - ((index * 17) % 170)}px`,
    '--rot': `${(index * 37) % 360}deg`,
    '--delay': `${(index * 23) % 260}ms`
  } as Record<string, string>
}))

const stinkPuffs = Array.from({ length: 9 }, (_, index) => ({
  id: index,
  style: {
    '--x': `${((index % 3) - 1) * 42}px`,
    '--y': `${-18 - Math.floor(index / 3) * 34}px`,
    '--delay': `${index * 90}ms`,
    '--size': `${34 + (index % 3) * 12}px`
  } as Record<string, string>
}))

let DiceBoxCtor: any = null
let readyPromise: Promise<any> | null = null
let fallbackTimer: ReturnType<typeof setTimeout> | null = null
let autoHideTimer: ReturnType<typeof setTimeout> | null = null
let activeRollToken = ''

function cleanNotation(value: any) {
  return String(value || '')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, '')
    .replace(/\+\-/g, '-')
    .replace(/\-\+/g, '-')
    .replace(/\+\+/g, '+')
    .trim()
}

function signedModifier(value: number) {
  return `${value >= 0 ? '+' : ''}${value}`
}

function diceSpecsFromNotation(notation: string) {
  const specs: Array<{ count: number; sides: number; sign: number }> = []
  const tokens = cleanNotation(notation).match(/[+-]?[^+-]+/g) || []

  for (const token of tokens) {
    const sign = token.startsWith('-') ? -1 : 1
    const body = token.replace(/^[+-]/, '')
    const match = body.match(/^(\d*)d(\d+)$/i)

    if (!match) continue

    specs.push({
      count: Math.min(100, Math.max(1, Number(match[1] || 1))),
      sides: Math.min(1000, Math.max(1, Number(match[2] || 1))),
      sign
    })
  }

  return specs
}

function rollContextFromNotation(notationValue: any, labelValue: any, kindValue: any) {
  const originalNotation = cleanNotation(notationValue)
  const tokens = originalNotation.match(/[+-]?[^+-]+/g) || []
  const diceTerms: string[] = []
  let modifier = 0

  for (const token of tokens) {
    const sign = token.startsWith('-') ? -1 : 1
    const signText = sign < 0 ? '-' : '+'
    const body = token.replace(/^[+-]/, '')

    if (!body) continue

    if (/^\d*d\d+$/i.test(body)) {
      diceTerms.push(`${signText}${body}`)
      continue
    }

    const flat = Number(body)
    if (Number.isFinite(flat)) {
      modifier += sign * flat
    }
  }

  const diceNotation = diceTerms
    .join('')
    .replace(/^\+/, '')

  return {
    label: String(labelValue || kindValue || 'Roll'),
    kind: String(kindValue || 'Roll'),
    originalNotation,
    diceNotation,
    modifier,
    specs: diceSpecsFromNotation(diceNotation)
  }
}

function rawTotalFromResult(value: any): number | null {
  if (value === null || value === undefined) return null

  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (Array.isArray(value)) {
    const values = value
      .map((item) => rawTotalFromResult(item))
      .filter((item): item is number => Number.isFinite(Number(item)))

    return values.length ? values.reduce((sum, item) => sum + item, 0) : null
  }

  if (typeof value !== 'object') return null

  for (const key of ['total', 'totalValue', 'resultTotal', 'result', 'value']) {
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

  if (Array.isArray(value.rolls)) {
    return value.rolls.flatMap((item: any) => diceValuesFromResult(item))
  }

  if (Array.isArray(value.dice)) {
    return value.dice.flatMap((item: any) => diceValuesFromResult(item))
  }

  if (Array.isArray(value.results)) {
    return value.results.flatMap((item: any) => diceValuesFromResult(item))
  }

  const parsed = Number(value.value ?? value.roll ?? value.result)
  const sides = Number(value.sides || value.dieType || value.diceType || 0)

  if (Number.isFinite(parsed) && (!sides || (parsed >= 1 && parsed <= sides))) {
    return [parsed]
  }

  return []
}

function deriveDiceValuesFromRawTotal(context: any, rawTotal: number | null) {
  if (!Number.isFinite(Number(rawTotal))) return []

  const specs = Array.isArray(context.specs) ? context.specs : []

  if (specs.length === 1 && specs[0].count === 1 && specs[0].sign > 0) {
    const value = Number(rawTotal)

    if (value >= 1 && value <= specs[0].sides) {
      return [value]
    }
  }

  return []
}

function criticalOutcomeForRoll(context: any, diceValues: number[]) {
  const specs = Array.isArray(context.specs) ? context.specs : []
  const hasD20 = specs.some((spec: any) => spec.sides === 20)

  if (!hasD20 || !diceValues.length) return ''

  if (diceValues.includes(20)) return 'nat20'
  if (diceValues.includes(1)) return 'nat1'

  return ''
}

function summarizeRoll(context: any, result: any) {
  const rawTotal = rawTotalFromResult(result)
  let diceValues = diceValuesFromResult(result)

  if (!diceValues.length) {
    diceValues = deriveDiceValuesFromRawTotal(context, rawTotal)
  }

  const diceTotal = diceValues.length
    ? diceValues.reduce((sum, value) => sum + value, 0)
    : Number(rawTotal || 0)

  const total = diceTotal + Number(context.modifier || 0)

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label: context.label,
    kind: context.kind,
    notation: context.originalNotation,
    diceNotation: context.diceNotation,
    total,
    diceTotal,
    diceValues,
    modifier: Number(context.modifier || 0),
    criticalOutcome: criticalOutcomeForRoll(context, diceValues),
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

function finishRoll(context: any, result: any, token: string) {
  if (token !== activeRollToken) return

  activeRollToken = ''

  if (fallbackTimer) {
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }

  const summary = summarizeRoll(context, result)
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

      // Tuned for quick, readable table rolls.
      scale: 6,
      delay: 10,
      gravity: 2,
      mass: 1,
      friction: 0.6,
      restitution: 0,
      linearDamping: 0.4,
      angularDamping: 0.4,
      spinForce: 6,
      throwForce: 4,
      startingHeight: 8,
      settleTimeout: 3000
    })

    diceBox.value = instance
    await instance.init()
    ready.value = true

    return instance
  })()

  return readyPromise
}

async function rollDice(options: { notation: string; label?: string; kind?: string }) {
  const context = rollContextFromNotation(options?.notation, options?.label, options?.kind)

  if (!context.originalNotation) {
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
    label: context.label,
    kind: context.kind,
    notation: context.originalNotation,
    diceNotation: context.diceNotation,
    total: null,
    diceTotal: null,
    diceValues: [],
    modifier: context.modifier,
    criticalOutcome: '',
    raw: null,
    rolledAt: new Date().toISOString()
  }

  if (!context.diceNotation) {
    const summary = summarizeRoll(context, { total: 0 })
    latestRoll.value = summary
    rollHistory.value = [summary, ...rollHistory.value].slice(0, 8)
    loading.value = false
    scheduleAutoHide()
    return
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

    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    activeRollToken = token

    box.onRollComplete = (results: any) => {
      finishRoll(context, results, token)
    }

    const returned = await Promise.resolve(box.roll(context.diceNotation))

    if (returned) {
      finishRoll(context, returned, token)
    } else {
      fallbackTimer = setTimeout(() => {
        loading.value = false
        scheduleAutoHide()
      }, 3800)
    }
  } catch (err: any) {
    activeRollToken = ''
    loading.value = false
    error.value = err?.message || '3D dice roll failed.'
    scheduleAutoHide()
  }
}

// ---------------------------------------------------------------------------
// RollEvent integration (app/lib/rules/roll-service.ts). `rollDice` above
// is UNCHANGED and still the entrypoint for every Character Sheet
// interaction not yet migrated to requestRoll() (weapon attack/damage,
// spell attack, species actions) -- those still only have a raw notation
// string, not a RollEvent, so removing `rollDice` would break them; that
// migration is future Character Sheet work, not 3D Dice work.
//
// `rollResult` is the new, canonical entrypoint: it never computes a total,
// never decides success, and never generates the numbers it displays --
// every number in `latestRoll` below comes from `event.result`, which is
// why `summarizeRollEvent` (unlike `summarizeRoll` above) takes no `result`
// argument from the dice engine at all.
//
// Known, verified limitation of @3d-dice/dice-box@1.1.4 (read in full
// before writing this): its public API has no "land on this face" hook.
// `Dice.getRollResult` (dist/Dice.js) returns a caller-supplied `.value`
// only for non-mesh (no-WebGL-fallback) dice; every real, physics-rendered
// die always resolves its value via raycasting against wherever the
// physics simulation actually settled it -- there is no override. This
// means the individual tumbling dice may visually settle on different pips
// than `RollResult.rolls` reports. The animation still runs unmodified
// (same throw, same physics, same theme, same sound) for its own sake --
// "preserve existing physics" -- but its own settled values are never
// read, trusted, or displayed anywhere: the Total/Dice/critical-outcome
// readout is 100% sourced from the RollEvent (via summarizeRollEvent,
// app/utils/diceBoxRollSummary.ts), which is what "the RollEvent must
// remain authoritative" actually cashes out to here. Flagged in the
// commit Summary, not silently papered over.
async function rollResult(event: any, label = 'Roll') {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer)
    autoHideTimer = null
  }

  visible.value = true
  error.value = ''

  if (!event?.ok) {
    loading.value = false
    latestRoll.value = null
    error.value = event?.error?.message || 'Roll failed.'
    scheduleAutoHide()
    return
  }

  const result = event.result
  const summary = summarizeRollEvent(event.eventId, label, result)
  const dice = result?.dice

  loading.value = true
  latestRoll.value = {
    ...summary,
    total: null,
    diceTotal: null,
    diceValues: [],
    criticalOutcome: ''
  }

  // §17.3 "manual" rolls carry no dice at all -- nothing to animate, and
  // `summary.total` is already the RollEvent's own null in that case.
  if (!dice) {
    latestRoll.value = summary
    rollHistory.value = [summary, ...rollHistory.value].slice(0, 8)
    loading.value = false
    scheduleAutoHide()
    return
  }

  const diceNotation = `${dice.count}d${dice.faces}`

  const settle = () => {
    latestRoll.value = summary
    rollHistory.value = [summary, ...rollHistory.value].slice(0, 8)
    loading.value = false
    scheduleAutoHide()
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

    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    activeRollToken = token

    // The physics engine's own settled values are intentionally never
    // read here -- only that it finished is relevant.
    box.onRollComplete = () => {
      if (token !== activeRollToken) return
      activeRollToken = ''
      if (fallbackTimer) {
        clearTimeout(fallbackTimer)
        fallbackTimer = null
      }
      settle()
    }

    const returned = await Promise.resolve(box.roll(diceNotation))

    if (returned) {
      if (token === activeRollToken) {
        activeRollToken = ''
        settle()
      }
    } else {
      fallbackTimer = setTimeout(settle, 3800)
    }
  } catch (err: any) {
    // The visual flourish failed; the authoritative result still shows.
    activeRollToken = ''
    settle()
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
  rollDice,
  rollResult
})
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-[175] overflow-hidden">
    <div
      :id="boxId"
      class="eldra-dice-stage absolute inset-0 transition-opacity duration-150"
      :class="visible ? 'opacity-100' : 'opacity-0'"
    />

    <div
      v-if="visible && latestRoll?.criticalOutcome === 'nat20'"
      :key="`nat20-${latestRoll?.id}`"
      class="pointer-events-none absolute inset-0 z-[2] overflow-hidden"
    >
      <div class="critical-burst">
        <span
          v-for="piece in confettiPieces"
          :key="piece.id"
          class="confetti-piece"
          :style="piece.style"
        />
        <div class="critical-text">Critical Success!</div>
      </div>
    </div>

    <div
      v-if="visible && latestRoll?.criticalOutcome === 'nat1'"
      :key="`nat1-${latestRoll?.id}`"
      class="pointer-events-none absolute inset-0 z-[2] overflow-hidden"
    >
      <div class="stink-burst">
        <span
          v-for="puff in stinkPuffs"
          :key="puff.id"
          class="stink-puff"
          :style="puff.style"
        />
        <div class="stink-text">Critical Failure!</div>
      </div>
    </div>

    <Transition
      enter-from-class="translate-y-3 opacity-0"
      enter-active-class="transition duration-150"
      leave-to-class="translate-y-3 opacity-0"
      leave-active-class="transition duration-150"
    >
      <div
        v-if="visible"
        class="pointer-events-auto absolute inset-x-3 bottom-3 rounded-none border border-[rgba(201,164,90,0.42)] bg-[rgba(7,13,20,0.92)] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.50)] backdrop-blur md:left-auto md:right-4 md:w-[420px]"
        :class="{
          'border-emerald-300/80 shadow-[0_0_38px_rgba(110,231,183,0.25)]': latestRoll?.criticalOutcome === 'nat20',
          'border-lime-700/70 shadow-[0_0_38px_rgba(63,98,18,0.30)]': latestRoll?.criticalOutcome === 'nat1'
        }"
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

        <div
          v-if="latestRoll?.criticalOutcome"
          class="mt-3 rounded-none border p-2 text-sm font-semibold"
          :class="latestRoll.criticalOutcome === 'nat20'
            ? 'border-emerald-300/50 bg-emerald-400/10 text-emerald-100'
            : 'border-lime-700/50 bg-lime-950/35 text-lime-100'"
        >
          {{ latestRoll.criticalOutcome === 'nat20' ? 'Critical Success!' : 'Critical Failure!' }}
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
            :class="{
              'border-emerald-300/50 text-emerald-100': roll.criticalOutcome === 'nat20',
              'border-lime-700/50 text-lime-100': roll.criticalOutcome === 'nat1'
            }"
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

.critical-burst,
.stink-burst {
  position: absolute;
  left: 50%;
  top: 36%;
  width: 1px;
  height: 1px;
}

.confetti-piece {
  position: absolute;
  left: 0;
  top: 0;
  width: 9px;
  height: 15px;
  background: #f5e7bd;
  opacity: 0;
  transform: translate(-50%, -50%) rotate(var(--rot));
  animation: confetti-pop 1100ms ease-out var(--delay) forwards;
}

.confetti-piece:nth-child(3n) {
  background: #6ee7b7;
}

.confetti-piece:nth-child(3n + 1) {
  background: #facc15;
}

.confetti-piece:nth-child(3n + 2) {
  background: #38bdf8;
}

.critical-text {
  position: absolute;
  left: 50%;
  top: -80px;
  width: 260px;
  transform: translateX(-50%);
  text-align: center;
  color: #ecfdf5;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: 0 0 22px rgba(16, 185, 129, 0.9), 0 3px 16px rgba(0, 0, 0, 0.8);
  animation: critical-text-pop 1200ms ease-out forwards;
}

.stink-puff {
  position: absolute;
  left: 0;
  top: 0;
  width: var(--size);
  height: var(--size);
  border-radius: 999px;
  background:
    radial-gradient(circle at 35% 35%, rgba(190, 242, 100, 0.72), rgba(63, 98, 18, 0.40) 58%, rgba(20, 83, 45, 0.05) 72%);
  opacity: 0;
  filter: blur(1px);
  transform: translate(var(--x), var(--y)) scale(0.3);
  animation: stink-rise 1600ms ease-out var(--delay) forwards;
}

.stink-text {
  position: absolute;
  left: 50%;
  top: -82px;
  width: 250px;
  transform: translateX(-50%);
  text-align: center;
  color: #ecfccb;
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: 0 0 18px rgba(77, 124, 15, 0.95), 0 3px 16px rgba(0, 0, 0, 0.8);
  animation: stink-text-wobble 1350ms ease-out forwards;
}

@keyframes confetti-pop {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) rotate(var(--rot)) scale(0.5);
  }

  15% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) rotate(calc(var(--rot) + 320deg)) scale(1);
  }
}

@keyframes critical-text-pop {
  0% {
    opacity: 0;
    transform: translateX(-50%) scale(0.75);
  }

  18% {
    opacity: 1;
    transform: translateX(-50%) scale(1.05);
  }

  70% {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }

  100% {
    opacity: 0;
    transform: translateX(-50%) translateY(-20px) scale(0.95);
  }
}

@keyframes stink-rise {
  0% {
    opacity: 0;
    transform: translate(var(--x), calc(var(--y) + 45px)) scale(0.35);
  }

  20% {
    opacity: 0.85;
  }

  100% {
    opacity: 0;
    transform: translate(var(--x), calc(var(--y) - 50px)) scale(1.35);
  }
}

@keyframes stink-text-wobble {
  0% {
    opacity: 0;
    transform: translateX(-50%) rotate(-3deg) scale(0.75);
  }

  20% {
    opacity: 1;
    transform: translateX(-50%) rotate(3deg) scale(1.05);
  }

  45% {
    transform: translateX(-50%) rotate(-2deg) scale(1);
  }

  72% {
    opacity: 1;
    transform: translateX(-50%) rotate(1deg) scale(1);
  }

  100% {
    opacity: 0;
    transform: translateX(-50%) translateY(-16px) rotate(0deg) scale(0.95);
  }
}
</style>
