<script setup lang="ts">
// Encounter Panel -- the Encounter Management System's DM surface. Round
// counter, turn order, current/next actor, Advance/Previous/End -- exactly
// this task's own DM EXPERIENCE list, nothing more. No map integration, no
// automation: Combat Resolution itself (attack rolls, damage) stays on each
// character's own Actions panel (CharacterActionsPanel.vue,
// server/utils/character-combat.ts), unchanged and untouched by this page.
//
// THIS PAGE CALCULATES NOTHING. `turnOrder`/`currentCombatant`/
// `nextCombatant`/`round` all arrive from GET .../encounters/:id
// (server/utils/encounter-view.ts) already computed; every button below
// emits an action ({ type: 'advance' | 'previous' | 'end' | 'join' | ... })
// to POST .../encounters/:id/actions (server/utils/encounter-actions.ts)
// and replaces this page's local copy with whatever comes back -- the same
// "page holds state, action returns the new authoritative state" shape
// sheet-v2.vue's own Recovery/Spellcasting sections already use.

definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))
const encounterId = computed(() => String(route.params.encounterId || ''))

type ConditionView = {
  id: string
  conditionId: string
  label: string
  duration: number | null
  source?: string
}

type CombatantView = {
  characterId: string
  characterTitle: string
  initiative: number
  isCurrentTurn: boolean
  conditions: ConditionView[]
}

type ConditionOption = { id: string; label: string }

type EncounterView = {
  id: string
  title: string
  status: 'active' | 'ended'
  round: number
  turnOrder: CombatantView[]
  currentCombatant: CombatantView | null
  nextCombatant: CombatantView | null
  availableConditions: ConditionOption[]
}

type EncounterResponse =
  | { available: true; encounter: EncounterView }
  | { available: false; reason: string }

const { data: initialResponse, pending, error } = await useFetch<EncounterResponse>(
  () => `/api/worlds/${worldId.value}/encounters/${encounterId.value}`
)

const encounter = ref<EncounterView | null>(
  initialResponse.value?.available ? initialResponse.value.encounter : null
)
const notFound = computed(() => Boolean(initialResponse.value && !initialResponse.value.available))

const acting = ref(false)
const actionError = ref('')

async function sendAction(body: Record<string, unknown>) {
  if (acting.value) return
  acting.value = true
  actionError.value = ''

  try {
    const result = await $fetch<{ ok: true; encounter: EncounterView }>(
      `/api/worlds/${worldId.value}/encounters/${encounterId.value}/actions`,
      { method: 'POST', body }
    )
    encounter.value = result.encounter
  } catch (fetchError: any) {
    actionError.value =
      fetchError?.data?.statusMessage || fetchError?.statusMessage || 'Could not perform that action'
  } finally {
    acting.value = false
  }
}

const isEnded = computed(() => encounter.value?.status === 'ended')

// --- Join (the DM adds a combatant directly from this panel) -------------

type RosterEntry = { id: string | number; title: string }

const { data: roster } = await useFetch<RosterEntry[]>(
  () => `/api/worlds/${worldId.value}/entities?type=character,npc,npc_sheet,pc,player_character&summary=1`,
  { default: () => [], lazy: true }
)

const joinCharacterId = ref('')
const joinInitiative = ref('')

const joinableRoster = computed(() => {
  const joined = new Set((encounter.value?.turnOrder ?? []).map((c) => c.characterId))
  return (roster.value ?? []).filter((entry) => !joined.has(String(entry.id)))
})

function join() {
  if (!joinCharacterId.value) return
  const parsedInitiative = Number(joinInitiative.value)
  const initiative = joinInitiative.value.trim() && Number.isFinite(parsedInitiative) ? parsedInitiative : undefined

  sendAction({ type: 'join', characterId: joinCharacterId.value, ...(initiative !== undefined ? { initiative } : {}) })
  joinCharacterId.value = ''
  joinInitiative.value = ''
}

function leave(characterId: string) {
  sendAction({ type: 'leave', characterId })
}

function overrideInitiative(characterId: string, current: number) {
  // eslint-disable-next-line no-alert
  const raw = window.prompt('Set initiative', String(current))
  if (raw === null) return
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return
  sendAction({ type: 'set-initiative', characterId, initiative: parsed })
}

// --- Conditions (Character Conditions System) -----------------------------
// Per-combatant apply drafts, keyed by characterId -- a plain object rather
// than a `ref` per combatant, mirroring how sheet-v2.vue's own
// `combatResults` keys one outcome per action id.

const conditionDraftByCombatant = reactive<Record<string, { conditionId: string; duration: string; source: string }>>({})

function conditionDraft(characterId: string) {
  return conditionDraftByCombatant[characterId] ??= { conditionId: '', duration: '', source: '' }
}

function applyConditionTo(characterId: string) {
  const draft = conditionDraft(characterId)
  if (!draft.conditionId) return

  const parsedDuration = Number(draft.duration)
  const duration = draft.duration.trim() && Number.isFinite(parsedDuration) ? parsedDuration : undefined

  sendAction({
    type: 'apply-condition',
    characterId,
    conditionId: draft.conditionId,
    ...(duration !== undefined ? { duration } : {}),
    ...(draft.source.trim() ? { source: draft.source.trim() } : {})
  })

  draft.conditionId = ''
  draft.duration = ''
  draft.source = ''
}

function removeConditionFrom(characterId: string, conditionInstanceId: string) {
  sendAction({ type: 'remove-condition', characterId, conditionInstanceId })
}

function tickConditionOn(characterId: string, conditionInstanceId: string, delta: number) {
  sendAction({ type: 'tick-condition', characterId, conditionInstanceId, delta })
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-[1100px] p-6">
      <div
        v-if="pending"
        class="eldra-ornate-panel eldra-frame-corners rounded-none border p-8 text-center text-[#d8ceb8]"
      >
        Loading encounter...
      </div>

      <div
        v-else-if="error || notFound"
        class="eldra-ornate-panel eldra-frame-corners rounded-none border p-8 text-center text-red-200"
      >
        This encounter could not be found in this World.
      </div>

      <template v-else-if="encounter">
        <datalist id="condition-catalog-options">
          <option
            v-for="option in encounter.availableConditions"
            :key="option.id"
            :value="option.id"
          >
            {{ option.label }}
          </option>
        </datalist>

        <section class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes rounded-none border p-6 backdrop-blur-xl">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
                Encounter · {{ encounter.status === 'ended' ? 'Ended' : 'Active' }}
              </div>
              <h1 class="mt-3 text-4xl font-semibold tracking-tight text-white">
                {{ encounter.title }}
              </h1>
            </div>

            <div class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.55)] px-4 py-2 text-center">
              <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">Round</div>
              <div class="text-2xl font-semibold tabular-nums text-[#fff7df]">{{ encounter.round }}</div>
            </div>
          </div>

          <div class="mt-6 grid gap-3 sm:grid-cols-2">
            <div class="rounded-none border border-[rgba(158,195,125,0.4)] bg-[rgba(158,195,125,0.08)] p-4">
              <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">Current Turn</div>
              <div class="mt-1 text-xl font-semibold text-[#fff7df]">
                {{ encounter.currentCombatant?.characterTitle ?? '—' }}
              </div>
            </div>
            <div class="rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] p-4">
              <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">Next</div>
              <div class="mt-1 text-xl font-semibold text-[#d8ceb8]">
                {{ encounter.nextCombatant?.characterTitle ?? '—' }}
              </div>
            </div>
          </div>

          <div
            v-if="actionError"
            class="mt-4 rounded-none border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            {{ actionError }}
          </div>

          <div class="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              class="eldra-button min-h-11 rounded-none px-4 py-2 text-sm font-semibold disabled:opacity-50"
              :disabled="acting || isEnded"
              @click="sendAction({ type: 'previous' })"
            >
              ← Previous Turn
            </button>
            <button
              type="button"
              class="eldra-button min-h-11 rounded-none px-4 py-2 text-sm font-semibold disabled:opacity-50"
              :disabled="acting || isEnded"
              @click="sendAction({ type: 'advance' })"
            >
              Advance Turn →
            </button>
            <button
              type="button"
              class="min-h-11 rounded-none border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
              :disabled="acting || isEnded"
              @click="sendAction({ type: 'end' })"
            >
              End Encounter
            </button>
          </div>
        </section>

        <!-- Join -- the DM adds a combatant directly. -->
        <section
          v-if="!isEnded"
          class="eldra-ornate-panel eldra-frame-corners mt-6 rounded-none border p-5 backdrop-blur-xl"
        >
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Add Combatant</div>

          <div class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
            <select
              v-model="joinCharacterId"
              class="eldra-input min-h-11 rounded-none px-3 py-2 text-sm text-[#f5e7bd]"
            >
              <option
                value=""
                class="bg-[#090909]"
              >
                Choose a character…
              </option>
              <option
                v-for="entry in joinableRoster"
                :key="entry.id"
                :value="String(entry.id)"
                class="bg-[#090909]"
              >
                {{ entry.title }}
              </option>
            </select>

            <input
              v-model="joinInitiative"
              inputmode="numeric"
              placeholder="Initiative (optional)"
              class="eldra-input min-h-11 rounded-none px-3 py-2 text-sm"
            >

            <button
              type="button"
              class="eldra-button min-h-11 rounded-none px-4 py-2 text-sm font-semibold disabled:opacity-50"
              :disabled="!joinCharacterId || acting"
              @click="join"
            >
              Join
            </button>
          </div>
          <p class="mt-2 text-xs text-[#6f6754]">
            Leave initiative blank to roll it automatically (1d20 + Dexterity modifier).
          </p>
        </section>

        <!-- Turn order -->
        <section class="mt-6">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Turn Order</div>

          <p
            v-if="!encounter.turnOrder.length"
            class="mt-3 text-sm text-[#9f9278]"
          >
            No combatants yet.
          </p>

          <div
            v-else
            class="mt-3 grid gap-2"
          >
            <article
              v-for="combatant in encounter.turnOrder"
              :key="combatant.characterId"
              class="rounded-none border p-3"
              :class="combatant.isCurrentTurn
                ? 'border-[rgba(158,195,125,0.5)] bg-[rgba(158,195,125,0.10)]'
                : 'border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)]'"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate font-semibold text-[#fff7df]">
                    {{ combatant.characterTitle }}
                    <span
                      v-if="combatant.isCurrentTurn"
                      class="ml-2 text-xs uppercase tracking-[0.15em] text-[#9ec37d]"
                    >Current</span>
                  </div>
                </div>

                <div class="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    class="min-h-11 rounded-none border border-[rgba(201,164,90,0.24)] px-3 text-sm font-semibold text-[#d8ceb8] disabled:opacity-50"
                    :disabled="acting || isEnded"
                    :title="'Initiative ' + combatant.initiative + ' -- click to override'"
                    @click="overrideInitiative(combatant.characterId, combatant.initiative)"
                  >
                    {{ combatant.initiative }}
                  </button>
                  <button
                    type="button"
                    class="min-h-11 rounded-none border border-red-500/20 bg-red-500/10 px-3 text-xs text-red-200 disabled:opacity-50"
                    :disabled="acting"
                    @click="leave(combatant.characterId)"
                  >
                    Leave
                  </button>
                </div>
              </div>

              <!-- Conditions: display, Remove, Tick duration -- Character
                   Conditions System. No automation: a duration reaching
                   zero is shown, never auto-cleared. -->
              <div
                v-if="combatant.conditions.length"
                class="mt-3 grid gap-1.5 border-t border-[rgba(201,164,90,0.14)] pt-3"
              >
                <div
                  v-for="condition in combatant.conditions"
                  :key="condition.id"
                  class="flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <span class="text-[#d8ceb8]">
                    <span class="eldra-gold-chip rounded-none border px-2 py-0.5 uppercase tracking-[0.06em]">{{ condition.label }}</span>
                    <span
                      v-if="condition.source"
                      class="ml-2 text-[#6f6754]"
                    >from {{ condition.source }}</span>
                  </span>

                  <div class="flex shrink-0 items-center gap-1">
                    <template v-if="condition.duration !== null">
                      <button
                        type="button"
                        class="min-h-11 min-w-11 rounded-none border border-[rgba(201,164,90,0.24)] text-[#d8ceb8] disabled:opacity-50"
                        :disabled="acting"
                        @click="tickConditionOn(combatant.characterId, condition.id, -1)"
                      >
                        −
                      </button>
                      <span class="min-w-6 text-center tabular-nums text-[#fff7df]">{{ condition.duration }}</span>
                      <button
                        type="button"
                        class="min-h-11 min-w-11 rounded-none border border-[rgba(201,164,90,0.24)] text-[#d8ceb8] disabled:opacity-50"
                        :disabled="acting"
                        @click="tickConditionOn(combatant.characterId, condition.id, 1)"
                      >
                        +
                      </button>
                    </template>
                    <button
                      type="button"
                      class="min-h-11 rounded-none border border-red-500/20 bg-red-500/10 px-2 text-red-200 disabled:opacity-50"
                      :disabled="acting"
                      @click="removeConditionFrom(combatant.characterId, condition.id)"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>

              <!-- Apply Condition -->
              <div
                v-if="!isEnded"
                class="mt-3 grid gap-2 border-t border-[rgba(201,164,90,0.14)] pt-3 sm:grid-cols-[minmax(0,1fr)_90px_minmax(0,1fr)_auto]"
              >
                <input
                  v-model="conditionDraft(combatant.characterId).conditionId"
                  list="condition-catalog-options"
                  placeholder="Apply condition…"
                  class="eldra-input min-h-11 rounded-none px-2 py-1 text-xs"
                >
                <input
                  v-model="conditionDraft(combatant.characterId).duration"
                  inputmode="numeric"
                  placeholder="Duration"
                  class="eldra-input min-h-11 rounded-none px-2 py-1 text-xs"
                >
                <input
                  v-model="conditionDraft(combatant.characterId).source"
                  placeholder="Source (optional)"
                  class="eldra-input min-h-11 rounded-none px-2 py-1 text-xs"
                >
                <button
                  type="button"
                  class="eldra-button min-h-11 rounded-none px-3 text-xs font-semibold disabled:opacity-50"
                  :disabled="acting || !conditionDraft(combatant.characterId).conditionId"
                  @click="applyConditionTo(combatant.characterId)"
                >
                  Apply
                </button>
              </div>
            </article>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
