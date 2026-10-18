<script setup lang="ts">
// CharacterSheetHeader -- Phase 4B. The V2 sheet's compact header,
// replacing CharacterSheetCommandCenter.vue (left on disk, unused by V2).
//
// One row of what a player glances at mid-turn -- portrait, name and
// identity, Hit Points, the package's summary values, primary resources,
// conditions, Rest -- and nothing that needs a panel of its own. The big
// Damage/Heal/Rest cards are gone: the HP VALUE is the control that opens
// the existing adjustment (CharacterHpAdjust, the Recovery System's own
// `recovery` actions), and Rest is one compact control over the existing
// Short/Long Rest/Hit Die actions (CharacterRestActions). Both reuse the
// components the command center used, unchanged; no HP logic lives here.
//
// Summary values come from the package (`presentation.sheet: 'summary'`,
// with the sheet's temporary named fallback -- see useCharacterSheet.ts's
// `summaryValues`). This component names no Definition id; it renders the
// list it is given, label and value as the engine produced them.
//
// Layout is container-aware (`@container/sheet`, set by the page): the
// phone header puts HP in a badge beside the name and the summary values
// in a 4-up row; from 880px the values join the main row. The condensed
// sticky bar a phone shows on scroll is CharacterSheetShell.vue's.
import type { EncounterConditionView } from '~/composables/useCharacterSheet'
import { isCharacterDeceasedFromDeathSaves, type StoredCharacterHealth } from '~/lib/characters/health'
import CharacterPortrait from '~/components/characters/CharacterPortrait.vue'
import CharacterSaveIndicator from '~/components/characters/CharacterSaveIndicator.vue'
import CharacterHealthBar from '~/components/characters/CharacterHealthBar.vue'
import CharacterHpAdjust from '~/components/characters/CharacterHpAdjust.vue'
import CharacterRestActions from '~/components/characters/CharacterRestActions.vue'
import CharacterDeathSaves from '~/components/characters/CharacterDeathSaves.vue'
import CharacterResourceOrbs from '~/components/characters/CharacterResourceOrbs.vue'
import type { RecoveryActionType } from '~/components/characters/CharacterCommandResources.vue'
import { formatDerivedValue, type DerivedValue } from './characterDerivedValues'
import {
  genericResourcesToCharacterResources,
  spellSlotsToCharacterResources,
  type DerivedResourceForPresentation
} from './characterResourcePresentation'

const props = withDefaults(defineProps<{
  worldId: string
  characterTitle: string
  imageUrl?: string | null
  canEditPortrait?: boolean
  portraitSaving?: boolean
  portraitError?: string
  level: number
  identityRows: readonly { key: string; label: string; value: string; missing: boolean }[]
  health: StoredCharacterHealth
  maxHp: number | null
  hitDiceMax: number | null
  hitDiceAvailable: number | null
  hitDieSize: number | null
  summaryValues?: readonly DerivedValue[]
  resources?: readonly DerivedResourceForPresentation[]
  resourcesPendingIds?: ReadonlySet<string>
  // Phase 4C: spell slots by level, the same Rules-Engine table rows the
  // Spells tab used to show -- now persistent here, beside class
  // resources, so remaining uses are visible from every section.
  slotLevels?: readonly { level: number; max: number; expended: number }[]
  spellSaving?: boolean
  conditions: EncounterConditionView[]
  inEncounter: boolean
  isMyTurn: boolean
  round: number | null
  // Whether the package supports rest/recovery at all -- the host decides;
  // `false` omits the Rest control entirely.
  restAvailable?: boolean
  saving: boolean
  error: string
  recoverySaving?: boolean
  recoveryError?: string
  removeCondition: (conditionInstanceId: string) => void
}>(), {
  imageUrl: null,
  canEditPortrait: false,
  portraitSaving: false,
  portraitError: '',
  summaryValues: () => [],
  resources: () => [],
  resourcesPendingIds: () => new Set(),
  slotLevels: () => [],
  spellSaving: false,
  restAvailable: true,
  recoverySaving: false,
  recoveryError: ''
})

const emit = defineEmits<{
  save: [StoredCharacterHealth]
  recovery: [{ type: RecoveryActionType; amount?: number }]
  'expend-resource': [{ resourceId: string; amount: number }]
  'restore-resource': [{ resourceId: string; amount: number }]
  'expend-slot': [number]
  'restore-slot': [number]
  'update-portrait': [File]
  'clear-portrait': []
  'select-condition': [EncounterConditionView]
  'select-resource': [string]
}>()

const isDeceased = computed(() => isCharacterDeceasedFromDeathSaves(props.health.deathSaves))
const atZeroHp = computed(() => props.maxHp != null && props.health.currentHp <= 0)

const hpLabel = computed(() => {
  const max = props.maxHp ?? '—'
  const temp = props.health.temporaryHp ? `, ${props.health.temporaryHp} temporary` : ''
  return `Hit points ${props.health.currentHp} of ${max}${temp}. Adjust hit points`
})

function handleMarkDeathSave({ kind, nextCount }: { kind: 'successes' | 'failures'; nextCount: number }) {
  emit('save', { ...props.health, deathSaves: { ...props.health.deathSaves, [kind]: nextCount } })
}

// Class resources (Second Wind, Rage, ...) from the package, rendered by
// their own ResourcePresentation (pool / dice / points).
const resourceGroups = computed(() => genericResourcesToCharacterResources(props.resources))
// Spell slots keep their own Orbs instance: they are gated by the
// spellcasting save (`spellSaving`), class resources per pool
// (`resourcesPendingIds`) -- the same split CharacterCommandResources had.
const slotGroups = computed(() => spellSlotsToCharacterResources(props.slotLevels))
const hasResources = computed(() => resourceGroups.value.length > 0 || slotGroups.value.length > 0)

function handleSlotExpend({ poolId }: { groupId: string; poolId: string; amount: number }) {
  emit('expend-slot', Number(poolId))
}

function handleSlotRestore({ poolId }: { groupId: string; poolId: string; amount: number }) {
  emit('restore-slot', Number(poolId))
}

// Phones: resources sit behind one labelled toggle so the header stays
// short; from 600px they are always shown. Remaining/total across every
// pool gives the collapsed toggle something useful to say.
const resourcesOpen = ref(false)
const resourceTotals = computed(() => {
  let remaining = 0
  let max = 0
  for (const group of [...slotGroups.value, ...resourceGroups.value]) {
    for (const pool of group.pools) {
      remaining += Math.max(0, pool.max - pool.expended)
      max += pool.max
    }
  }
  return { remaining, max }
})

function handleResourceExpend({ poolId, amount }: { groupId: string; poolId: string; amount: number }) {
  emit('expend-resource', { resourceId: poolId, amount })
}

function handleResourceRestore({ poolId, amount }: { groupId: string; poolId: string; amount: number }) {
  emit('restore-resource', { resourceId: poolId, amount })
}

const hpOpen = ref(false)

function relayRecovery(event: { type: RecoveryActionType; amount?: number }) {
  emit('recovery', event)
}

function summaryText(entry: DerivedValue): string {
  return entry.error ? 'Err' : formatDerivedValue(entry)
}

</script>

<template>
  <header
    class="eldra-glass-surface relative isolate border px-3 py-3 @[600px]/sheet:px-4"
    aria-label="Character summary"
  >
    <span
      class="eldra-ornament-frame eldra-ornament-frame--compact"
      aria-hidden="true"
    />

    <div class="flex items-center gap-3 @[600px]/sheet:gap-4">
      <NuxtLink
        :to="`/worlds/${worldId}/characters`"
        class="hidden size-8 shrink-0 items-center justify-center text-eldra-text-faint transition hover:text-eldra-text-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-eldra-accent @[600px]/sheet:flex"
        aria-label="Back to characters"
      >
        <UIcon
          name="i-lucide-chevron-left"
          class="h-5 w-5"
        />
      </NuxtLink>

      <div class="shrink-0">
        <CharacterPortrait
          class="size-14 @[600px]/sheet:size-16"
          :image-url="imageUrl"
          :title="characterTitle"
          :can-edit="canEditPortrait"
          :saving="portraitSaving"
          :is-deceased="isDeceased"
          @update="emit('update-portrait', $event)"
          @clear="emit('clear-portrait')"
        />
      </div>

      <div class="min-w-0 flex-1">
        <h1 class="eldra-display line-clamp-2 text-lg leading-tight text-eldra-text-strong @[600px]/sheet:truncate @[600px]/sheet:text-2xl">
          {{ characterTitle || 'Character' }}
        </h1>
        <p class="mt-0.5 truncate text-xs text-eldra-text-soft @[600px]/sheet:text-sm">
          <span class="text-eldra-text-faint">Level</span> {{ level }}
          <template
            v-for="row in identityRows"
            :key="row.key"
          >
            <span
              class="text-eldra-text-faint"
              aria-hidden="true"
            > · </span>
            <span :class="row.missing ? 'text-red-300' : ''">{{ row.value }}</span>
          </template>
        </p>
        <p
          v-if="portraitError"
          class="mt-1 text-[10px] text-red-300"
        >
          {{ portraitError }}
        </p>
      </div>

      <!-- HIT POINTS -- the value IS the control. Opens the existing
           Damage / Heal / Temp HP adjustment (and Death Saves at 0 HP). -->
      <UPopover
        v-model:open="hpOpen"
        :content="{ align: 'end', side: 'bottom', sideOffset: 6 }"
      >
        <button
          type="button"
          class="group flex shrink-0 flex-col items-end border border-eldra-accent/45 bg-eldra-accent/10 px-2.5 py-1.5 text-right transition hover:border-eldra-accent/80 hover:bg-eldra-accent/16 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eldra-accent @[600px]/sheet:min-w-36 @[600px]/sheet:px-3"
          :class="atZeroHp ? 'border-red-500/70' : ''"
          :aria-label="hpLabel"
          aria-haspopup="dialog"
          :aria-expanded="hpOpen"
          data-sheet-hp-control
        >
          <span class="flex items-baseline gap-1 tabular-nums">
            <span class="text-xl font-semibold leading-none text-eldra-text-strong @[600px]/sheet:text-2xl">{{ health.currentHp }}</span>
            <span class="text-sm text-eldra-text-faint">/ {{ maxHp ?? '—' }}</span>
            <span
              v-if="health.temporaryHp"
              class="ml-1 border border-eldra-positive/50 px-1 text-[0.65rem] font-semibold text-eldra-positive"
            >+{{ health.temporaryHp }}</span>
          </span>
          <CharacterHealthBar
            class="mt-1 hidden w-full @[600px]/sheet:block"
            :current-hp="health.currentHp"
            :max-hp="maxHp"
          />
          <span class="mt-1 flex items-center gap-1 text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-eldra-accent-text">
            Hit Points
            <UIcon
              name="i-lucide-pencil"
              class="h-2.5 w-2.5 opacity-60 transition group-hover:opacity-100"
              aria-hidden="true"
            />
          </span>
        </button>

        <template #content>
          <div
            class="w-72 p-3 text-eldra-text"
            role="group"
            aria-label="Adjust hit points"
          >
            <div class="flex items-baseline justify-between">
              <span class="text-[0.6rem] uppercase tracking-[0.16em] text-eldra-text-faint">Damage / Heal</span>
              <span class="text-xs tabular-nums text-eldra-text-soft">
                {{ health.currentHp }} / {{ maxHp ?? '—' }}<template v-if="health.temporaryHp"> · {{ health.temporaryHp }} temp</template>
              </span>
            </div>
            <p
              v-if="recoveryError"
              class="mt-2 border border-red-900 bg-red-950/40 p-2 text-xs text-red-300"
            >
              {{ recoveryError }}
            </p>
            <CharacterHpAdjust
              autofocus
              :saving="recoverySaving"
              @recovery="relayRecovery"
            />
            <div
              v-if="atZeroHp"
              class="mt-3 border-t border-eldra-accent/14 pt-3"
            >
              <div class="mb-1.5 text-[0.6rem] uppercase tracking-[0.16em] text-eldra-text-faint">
                Death Saves
              </div>
              <CharacterDeathSaves
                :death-saves="health.deathSaves"
                :saving="recoverySaving"
                @mark-death-save="handleMarkDeathSave"
                @recovery="relayRecovery"
              />
            </div>
          </div>
        </template>
      </UPopover>

      <!-- Summary values join this row from 880px; narrower headers get
           the 4-up row below, so the name keeps its room. -->
      <dl
        v-if="summaryValues.length"
        class="hidden shrink-0 items-stretch @[880px]/sheet:flex"
      >
        <div
          v-for="entry in summaryValues"
          :key="entry.id"
          class="flex min-w-16 flex-col items-center justify-center border-l border-eldra-accent/14 px-3 text-center"
        >
          <dt class="mt-1 max-w-[6.5rem] text-[0.55rem] font-semibold uppercase leading-tight tracking-[0.12em] text-eldra-text-faint">
            {{ entry.label || entry.id }}
          </dt>
          <dd
            class="order-first tabular-nums leading-none text-eldra-text-strong"
            :class="entry.presentation?.emphasis === 'primary' ? 'text-2xl font-semibold' : 'text-xl font-semibold'"
            :title="entry.error || undefined"
          >
            {{ summaryText(entry) }}
          </dd>
        </div>
      </dl>

      <div class="hidden shrink-0 items-center gap-2 @[880px]/sheet:flex">
        <CharacterSaveIndicator
          :saving="saving"
          :error="error"
        />
      </div>
    </div>

    <!-- Below 880px: summary values 4-up beneath the identity row. -->
    <dl
      v-if="summaryValues.length"
      class="mt-2.5 grid grid-cols-4 items-start border-t border-eldra-accent/12 pt-2 @[880px]/sheet:hidden"
    >
      <div
        v-for="entry in summaryValues.slice(0, 4)"
        :key="entry.id"
        class="flex flex-col items-center text-center"
      >
        <dt class="mt-1 max-w-full px-0.5 text-[0.5rem] font-semibold uppercase leading-tight tracking-[0.08em] text-eldra-text-faint">
          {{ entry.label || entry.id }}
        </dt>
        <dd class="order-first text-lg font-semibold leading-none tabular-nums text-eldra-text-strong">
          {{ summaryText(entry) }}
        </dd>
      </div>
    </dl>

    <!-- Status: conditions, turn, resources, Rest. -->
    <div
      v-if="conditions.length || inEncounter || hasResources || restAvailable"
      class="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-eldra-accent/12 pt-2.5"
    >
      <div
        v-if="conditions.length"
        class="flex flex-wrap items-center gap-1.5"
        aria-label="Conditions"
        role="list"
      >
        <span
          v-for="condition in conditions"
          :key="condition.id"
          role="listitem"
          class="eldra-gold-chip inline-flex items-center rounded-none border text-xs uppercase tracking-[0.06em]"
          :class="condition.duration === 0 ? 'border-red-500/50 bg-red-500/10 text-red-200' : ''"
        >
          <button
            type="button"
            class="px-2 py-0.5 hover:text-eldra-text-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-eldra-accent pointer-coarse:min-h-9"
            :aria-label="`${condition.label} details`"
            @click="emit('select-condition', condition)"
          >
            {{ condition.label }}<template v-if="condition.duration !== null"> ×{{ condition.duration }}</template>
          </button>
          <button
            type="button"
            class="border-l border-eldra-accent/20 px-1.5 py-0.5 text-eldra-text-faint hover:text-eldra-text-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-eldra-accent pointer-coarse:min-h-9 pointer-coarse:px-2.5"
            :aria-label="`Remove ${condition.label}`"
            @click="removeCondition(condition.id)"
          >
            ×
          </button>
        </span>
      </div>

      <div
        v-if="inEncounter"
        class="flex items-center gap-1.5 text-xs text-eldra-text-soft"
      >
        <span
          class="h-2 w-2 rounded-full"
          :class="isMyTurn ? 'bg-eldra-positive' : 'bg-eldra-accent/35'"
          aria-hidden="true"
        />
        <span>{{ isMyTurn ? 'Your turn' : `Round ${round ?? '—'}` }}</span>
      </div>

      <!-- RESOURCES -- Phase 4C: spell slots and class resources, visible
           from every section. -->
      <template v-if="hasResources">
        <button
          type="button"
          class="inline-flex min-h-9 items-center gap-1.5 border border-eldra-accent/30 px-2.5 text-xs font-semibold uppercase tracking-[0.1em] text-eldra-text-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-eldra-accent pointer-coarse:min-h-11 @[600px]/sheet:hidden"
          :aria-expanded="resourcesOpen"
          aria-controls="sheet-header-resources"
          @click="resourcesOpen = !resourcesOpen"
        >
          Resources
          <span class="tabular-nums text-eldra-text-strong">{{ resourceTotals.remaining }}/{{ resourceTotals.max }}</span>
          <UIcon
            :name="resourcesOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            class="h-3.5 w-3.5"
            aria-hidden="true"
          />
        </button>

        <div
          id="sheet-header-resources"
          role="group"
          aria-label="Resources"
          class="order-last w-full flex-wrap items-center gap-x-5 gap-y-2 @[600px]/sheet:order-none @[600px]/sheet:flex @[600px]/sheet:w-auto"
          :class="resourcesOpen ? 'flex' : 'hidden'"
        >
          <CharacterResourceOrbs
            v-if="slotGroups.length"
            layout="inline"
            :groups="slotGroups"
            :saving="spellSaving"
            @expend="handleSlotExpend"
            @restore="handleSlotRestore"
          />
          <CharacterResourceOrbs
            v-if="resourceGroups.length"
            layout="inline"
            selectable
            :groups="resourceGroups"
            :pending-pool-ids="resourcesPendingIds"
            @expend="handleResourceExpend"
            @restore="handleResourceRestore"
            @select="emit('select-resource', $event)"
          />
        </div>
      </template>

      <!-- REST -- gameplay control, kept apart from management actions. -->
      <UPopover
        v-if="restAvailable"
        :content="{ align: 'end', side: 'bottom', sideOffset: 6 }"
      >
        <button
          type="button"
          class="eldra-button ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-none px-2.5 text-xs font-semibold pointer-coarse:min-h-11"
          :disabled="recoverySaving"
          aria-haspopup="dialog"
        >
          <UIcon
            name="i-lucide-moon"
            class="h-3.5 w-3.5"
            aria-hidden="true"
          />
          Rest
        </button>

        <template #content>
          <div
            class="w-64 p-3 text-eldra-text"
            role="group"
            aria-label="Rest"
          >
            <div class="text-[0.6rem] uppercase tracking-[0.16em] text-eldra-text-faint">
              Rest
            </div>
            <CharacterRestActions
              :health="health"
              :max-hp="maxHp"
              :hit-dice-max="hitDiceMax"
              :hit-dice-available="hitDiceAvailable"
              :hit-die-size="hitDieSize"
              :saving="recoverySaving"
              @recovery="relayRecovery"
            />
          </div>
        </template>
      </UPopover>
    </div>
  </header>
</template>
