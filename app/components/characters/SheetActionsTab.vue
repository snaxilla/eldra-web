<script setup lang="ts">
const props = withDefaults(defineProps<{
  worldId: string | number
  entityId: string | number
  sheet?: any
  classResourceCards?: any[]
  mainSpeciesActionCards?: any[]
  itemActionCards?: any[]
  equippedWeaponActions?: any[]
  actionSpellCards?: any[]
  filteredActionSpellCards?: any[]
  commonActionCards?: any[]
  displayedBonusActionCards?: any[]
  displayedReactionActionCards?: any[]
  hasSpellcastingMath?: boolean
  spellcastingStatCards?: any[]
  actionSpellLevelFilters?: any[]
  actionSpellLevelFilter?: string
  openFeatureDrawer?: (value: any) => void
  openItemDrawer?: (value: any) => void
  openSpellDrawer?: (value: any) => void
  toggleActionPanel?: (key: string) => void
  actionPanelOpen?: (key: string) => boolean
  actionPanelChevron?: (key: string) => string
  resourceStateForSpeciesAction?: (action: any) => any
  speciesActionResourceStatusText?: (action: any) => string
  speciesActionResourcePipIndexes?: (action: any) => any[]
  speciesActionResourcePipTitle?: (action: any, index: any) => string
  toggleSpeciesActionResourcePip?: (action: any, index: any) => void
  speciesActionResourcePipClass?: (action: any, index: any) => string
  speciesActionCanAttack?: (action: any) => boolean
  speciesActionAttackBonusText?: (action: any) => string
  speciesActionAttackFormula?: (action: any) => string
  speciesActionDamageText?: (action: any) => string
  speciesActionDamageFormulaText?: (action: any) => string
  speciesActionButtonGridClass?: (action: any) => string
  canUseSpeciesActionResource?: (action: any) => boolean
  useSpeciesActionResource?: (action: any) => void
  rollSpeciesActionAttack?: (action: any) => void
  rollSpeciesActionDamage?: (action: any) => void
  shortText?: (value: any, limit?: number) => string
  rollWeaponAttack?: (weapon: any) => void
  rollWeaponDamage?: (weapon: any) => void
  spellOptionLevelLabel?: (spell: any) => string
  spellActionMechanic?: (spell: any) => any
  spellUsesAttackRoll?: (spell: any) => boolean
  canCastSpell?: (spell: any) => boolean
  rollSpellAttackAndConsumeSlot?: (spell: any) => void
  spellConsumesSlot?: (spell: any) => boolean
  castSpell?: (spell: any) => void
}>(), {
  classResourceCards: () => [],
  mainSpeciesActionCards: () => [],
  itemActionCards: () => [],
  equippedWeaponActions: () => [],
  actionSpellCards: () => [],
  filteredActionSpellCards: () => [],
  commonActionCards: () => [],
  displayedBonusActionCards: () => [],
  displayedReactionActionCards: () => [],
  spellcastingStatCards: () => [],
  actionSpellLevelFilters: () => [],
  actionSpellLevelFilter: 'all'
})

const emit = defineEmits<{
  (event: 'update-action-spell-level-filter', value: string): void
}>()

const classResourceCards = computed(() => props.classResourceCards || [])
const mainSpeciesActionCards = computed(() => props.mainSpeciesActionCards || [])
const itemActionCards = computed(() => props.itemActionCards || [])
const equippedWeaponActions = computed(() => props.equippedWeaponActions || [])
const actionSpellCards = computed(() => props.actionSpellCards || [])
const filteredActionSpellCards = computed(() => props.filteredActionSpellCards || [])
const commonActionCards = computed(() => props.commonActionCards || [])
const displayedBonusActionCards = computed(() => props.displayedBonusActionCards || [])
const displayedReactionActionCards = computed(() => props.displayedReactionActionCards || [])
const spellcastingStatCards = computed(() => props.spellcastingStatCards || [])
const actionSpellLevelFilters = computed(() => props.actionSpellLevelFilters || [])
const actionSpellLevelFilter = computed(() => props.actionSpellLevelFilter || 'all')
const hasSpellcastingMath = computed(() => props.hasSpellcastingMath === true)
const worldId = computed(() => props.worldId)
const entityId = computed(() => props.entityId)
const sheet = computed(() => props.sheet)

function setActionSpellLevelFilter(value: any) {
  emit('update-action-spell-level-filter', String(value || 'all'))
}

function openFeatureDrawer(value: any) {
  props.openFeatureDrawer?.(value)
}

function openItemDrawer(value: any) {
  props.openItemDrawer?.(value)
}

function openSpellDrawer(value: any) {
  props.openSpellDrawer?.(value)
}

function toggleActionPanel(key: string) {
  props.toggleActionPanel?.(key)
}

function actionPanelOpen(key: string) {
  return props.actionPanelOpen?.(key) ?? true
}

function actionPanelChevron(key: string) {
  return props.actionPanelChevron?.(key) || (actionPanelOpen(key) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down')
}

function resourceStateForSpeciesAction(action: any) {
  return props.resourceStateForSpeciesAction?.(action) || null
}

function speciesActionResourceStatusText(action: any) {
  return props.speciesActionResourceStatusText?.(action) || ''
}

function speciesActionResourcePipIndexes(action: any) {
  return props.speciesActionResourcePipIndexes?.(action) || []
}

function speciesActionResourcePipTitle(action: any, index: any) {
  return props.speciesActionResourcePipTitle?.(action, index) || ''
}

function toggleSpeciesActionResourcePip(action: any, index: any) {
  props.toggleSpeciesActionResourcePip?.(action, index)
}

function speciesActionResourcePipClass(action: any, index: any) {
  return props.speciesActionResourcePipClass?.(action, index) || ''
}

function speciesActionCanAttack(action: any) {
  return props.speciesActionCanAttack?.(action) || false
}

function speciesActionAttackBonusText(action: any) {
  return props.speciesActionAttackBonusText?.(action) || ''
}

function speciesActionAttackFormula(action: any) {
  return props.speciesActionAttackFormula?.(action) || ''
}

function speciesActionDamageText(action: any) {
  return props.speciesActionDamageText?.(action) || ''
}

function speciesActionDamageFormulaText(action: any) {
  return props.speciesActionDamageFormulaText?.(action) || ''
}

function speciesActionButtonGridClass(action: any) {
  return props.speciesActionButtonGridClass?.(action) || ''
}

function canUseSpeciesActionResource(action: any) {
  return props.canUseSpeciesActionResource?.(action) || false
}

function useSpeciesActionResource(action: any) {
  props.useSpeciesActionResource?.(action)
}

function rollSpeciesActionAttack(action: any) {
  props.rollSpeciesActionAttack?.(action)
}

function rollSpeciesActionDamage(action: any) {
  props.rollSpeciesActionDamage?.(action)
}

function shortText(value: any, limit = 260) {
  if (props.shortText) return props.shortText(value, limit)

  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text
}

function rollWeaponAttack(weapon: any) {
  props.rollWeaponAttack?.(weapon)
}

function rollWeaponDamage(weapon: any) {
  props.rollWeaponDamage?.(weapon)
}

function spellOptionLevelLabel(spell: any) {
  return props.spellOptionLevelLabel?.(spell) || ''
}

function spellActionMechanic(spell: any) {
  return props.spellActionMechanic?.(spell) || {
    label: 'Action',
    value: '—',
    note: ''
  }
}

function spellUsesAttackRoll(spell: any) {
  return props.spellUsesAttackRoll?.(spell) || false
}

function canCastSpell(spell: any) {
  return props.canCastSpell?.(spell) ?? true
}

function rollSpellAttackAndConsumeSlot(spell: any) {
  props.rollSpellAttackAndConsumeSlot?.(spell)
}

function spellConsumesSlot(spell: any) {
  return props.spellConsumesSlot?.(spell) || false
}

function castSpell(spell: any) {
  props.castSpell?.(spell)
}
</script>

<template>
<section class="mt-0 flex flex-col gap-3 md:mt-6">
                  <CharactersSheetClassResources
                    v-if="classResourceCards.length"
                    class="order-[-50]"
                    :world-id="worldId"
                    :entity-id="entityId"
                    :sheet="sheet"
                    :resources="classResourceCards"
                    @open-option-detail="openFeatureDrawer"
                  />

                <div
                  v-if="mainSpeciesActionCards.length"
                  class="eldra-codex-soft order-[-60] rounded-none p-4"
                >
                  <button
                    type="button"
                    class="mb-3 flex w-full items-center justify-between gap-3 text-left"
                    @click="toggleActionPanel('species-actions')"
                  >
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Species Actions</div>

                    <div class="flex items-center gap-2">
                      <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                        {{ mainSpeciesActionCards.length }} Action{{ mainSpeciesActionCards.length === 1 ? '' : 's' }}
                      </div>
                      <UIcon :name="actionPanelChevron('species-actions')" class="h-4 w-4 text-[#9f9278]" />
                    </div>
                  </button>

                  <div
                    v-show="actionPanelOpen('species-actions')"
                    class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
                  >
                    <article
                      v-for="action in mainSpeciesActionCards"
                      :key="`species-action-${action.id}`"
                      class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <div class="truncate font-semibold text-white">{{ action.name }}</div>
                          <div class="mt-1 text-xs text-[#9f9278]">{{ action.source || 'Species' }}</div>
                        </div>

                        <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          <span
                            v-if="resourceStateForSpeciesAction(action)"
                            class="rounded-none border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-100"
                          >
                            {{ speciesActionResourceStatusText(action) }}
                          </span>

                          <span class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#f5e7bd]">
                            {{ action.timing }}
                          </span>
                        </div>
                      </div>

                      <div
                        v-if="resourceStateForSpeciesAction(action)"
                        class="mt-2 flex items-center gap-1.5"
                      >
                        <button
                          v-for="pipIndex in speciesActionResourcePipIndexes(action)"
                          :key="`species-action-resource-${action.id}-${pipIndex}`"
                          type="button"
                          class="rounded-full p-0.5 transition hover:scale-110 focus:outline-none focus:ring-1 focus:ring-emerald-200/50"
                          :title="speciesActionResourcePipTitle(action, pipIndex)"
                          @click.stop="toggleSpeciesActionResourcePip(action, pipIndex)"
                        >
                          <span :class="speciesActionResourcePipClass(action, pipIndex)" />
                        </button>
                      </div>

                      <div
                        v-if="speciesActionCanAttack(action) || action.damage || action.damageType"
                        class="mt-3 grid gap-2 text-xs"
                        :class="[
                          speciesActionCanAttack(action) && action.damage && action.damageType ? 'grid-cols-3' : '',
                          speciesActionCanAttack(action) && ((action.damage && !action.damageType) || (!action.damage && action.damageType)) ? 'grid-cols-2' : '',
                          !speciesActionCanAttack(action) && action.damage && action.damageType ? 'grid-cols-2' : '',
                          (!speciesActionCanAttack(action) && ((action.damage && !action.damageType) || (!action.damage && action.damageType))) || (speciesActionCanAttack(action) && !action.damage && !action.damageType) ? 'grid-cols-1' : ''
                        ]"
                      >
                        <div
                          v-if="speciesActionCanAttack(action)"
                          class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2"
                        >
                          <div class="uppercase tracking-[0.18em] text-[#9f9278]">To Hit</div>
                          <div class="mt-1 font-semibold text-white">{{ speciesActionAttackBonusText(action) }}</div>
                          <div class="mt-0.5 text-[10px] text-[#9f9278]">{{ speciesActionAttackFormula(action) }}</div>
                        </div>

                        <div
                          v-if="action.damage"
                          class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2"
                        >
                          <div class="uppercase tracking-[0.18em] text-[#9f9278]">Damage</div>
                          <div class="mt-1 font-semibold text-white">{{ speciesActionDamageText(action) || action.damage }}</div>
                          <div v-if="speciesActionDamageFormulaText(action)" class="mt-0.5 text-[10px] text-[#9f9278]">
                            {{ speciesActionDamageFormulaText(action) }}
                          </div>
                        </div>

                        <div
                          v-if="action.damageType"
                          class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2"
                        >
                          <div class="uppercase tracking-[0.18em] text-[#9f9278]">Type</div>
                          <div class="mt-1 font-semibold text-white">{{ action.damageType }}</div>
                        </div>
                      </div>

                      <div
                        v-if="action.notes"
                        class="mt-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3 text-xs leading-5 text-[#9f9278]"
                      >
                        {{ action.notes }}
                      </div>

                      <p
                        v-if="action.detail"
                        class="mt-3 text-xs leading-5 text-[#d8ceb8]"
                      >
                        {{ shortText(action.detail, 260) }}
                      </p>

                      <div
                        class="mt-3 grid gap-2"
                        :class="speciesActionButtonGridClass(action)"
                      >
                        <button
                          v-if="speciesActionCanAttack(action)"
                          type="button"
                          class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df]"
                          @click.stop="rollSpeciesActionAttack(action)"
                        >
                          To Hit
                        </button>

                        <button
                          v-if="resourceStateForSpeciesAction(action)"
                          type="button"
                          class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df] disabled:opacity-40"
                          :disabled="!canUseSpeciesActionResource(action)"
                          @click.stop="useSpeciesActionResource(action)"
                        >
                          Use
                        </button>

                        <button
                          v-if="action.damageFormula"
                          type="button"
                          class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df] disabled:opacity-40"
                          :disabled="resourceStateForSpeciesAction(action) ? !canUseSpeciesActionResource(action) : false"
                          @click.stop="rollSpeciesActionDamage(action)"
                        >
                          Damage
                        </button>

                        <button
                          type="button"
                          class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df]"
                          @click.stop="openFeatureDrawer(action)"
                        >
                          Details
                        </button>
                      </div>
                    </article>
                  </div>
                </div>

                <div
                  v-if="equippedWeaponActions.length"
                  class="eldra-codex-soft order-[-70] rounded-none p-4"
                >
                  <button
                    type="button"
                    class="mb-3 flex w-full items-center justify-between gap-3 text-left"
                    @click="toggleActionPanel('weapons')"
                  >
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Attack Actions</div>

                    <div class="flex items-center gap-2">
                      <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                        {{ equippedWeaponActions.length }} Attack{{ equippedWeaponActions.length === 1 ? '' : 's' }}
                      </div>
                      <UIcon :name="actionPanelChevron('weapons')" class="h-4 w-4 text-[#9f9278]" />
                    </div>
                  </button>

                  <div
                    v-show="actionPanelOpen('weapons')"
                    class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
                  >
                    <article
                      v-for="weapon in equippedWeaponActions"
                      :key="`weapon-action-${weapon.id}`"
                      class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <div class="truncate font-semibold text-white">{{ weapon.name }}</div>
                          <div class="mt-1 text-xs text-[#9f9278]">{{ weapon.itemType || 'Weapon' }}</div>
                        </div>

                        <span class="shrink-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#f5e7bd]">
                          Attack
                        </span>
                      </div>


                      <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2">
                          <div class="uppercase tracking-[0.18em] text-[#9f9278]">To Hit</div>
                          <div class="mt-1 font-semibold text-white">
                            {{ weapon.attackBonusText }}
                          </div>
                          <div class="mt-0.5 text-[10px] text-[#9f9278]">
                            {{ weapon.attackFormula }}
                          </div>
                        </div>

                        <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2">
                          <div class="uppercase tracking-[0.18em] text-[#9f9278]">Damage</div>
                          <div class="mt-1 font-semibold text-white">
                            {{ weapon.damage || '—' }}
                          </div>
                          <div v-if="weapon.damageFormula" class="mt-0.5 text-[10px] text-[#9f9278]">
                            {{ weapon.damageFormula }}
                          </div>
                        </div>

                        <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2">
                          <div class="uppercase tracking-[0.18em] text-[#9f9278]">Type</div>
                          <div class="mt-1 font-semibold text-white">
                            {{ weapon.damageType || '—' }}
                          </div>
                        </div>
                      </div>

                      <div v-if="weapon.notes" class="mt-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3 text-xs leading-5 text-[#9f9278]">
                        {{ weapon.notes }}
                      </div>



                      <div
                        class="mt-3 grid gap-2"
                        :class="weapon.linkedItemId || weapon.description || weapon.notes ? 'grid-cols-3' : 'grid-cols-2'"
                      >
                        <button
                          type="button"
                          class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df]"
                          @click.stop="rollWeaponAttack(weapon)"
                        >
                          To Hit
                        </button>

                        <button
                          type="button"
                          class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df]"
                          @click.stop="rollWeaponDamage(weapon)"
                        >
                          Damage
                        </button>

                        <button
                          v-if="weapon.linkedItemId || weapon.description || weapon.notes"
                          type="button"
                          class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df]"
                          @click.stop="openItemDrawer(weapon)"
                        >
                          Details
                        </button>
                      </div>
                    </article>
                  </div>
                </div>

                <div
                  v-if="actionSpellCards.length"
                  class="eldra-codex-soft order-[-40] rounded-none p-4"
                >
                  <button
                    type="button"
                    class="mb-3 flex w-full items-center justify-between gap-3 text-left"
                    @click="toggleActionPanel('spells')"
                  >
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Spell Actions</div>

                    <div class="flex items-center gap-2">
                      <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                        {{ filteredActionSpellCards.length }} / {{ actionSpellCards.length }} Spell{{ actionSpellCards.length === 1 ? '' : 's' }}
                      </div>
                      <UIcon :name="actionPanelChevron('spells')" class="h-4 w-4 text-[#9f9278]" />
                    </div>
                  </button>

                  <div v-show="actionPanelOpen('spells')">

                    <div
                      v-if="hasSpellcastingMath"
                      class="mb-3 grid grid-cols-3 gap-2 text-xs"
                    >
                      <div
                        v-for="stat in spellcastingStatCards"
                        :key="`action-spellcasting-stat-${stat.key}`"
                        class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2"
                      >
                        <div class="uppercase tracking-[0.18em] text-[#9f9278]">{{ stat.label }}</div>
                        <div class="mt-1 text-lg font-semibold text-white">{{ stat.value }}</div>
                        <div class="mt-0.5 text-[10px] text-[#9f9278]">{{ stat.note }}</div>
                      </div>
                    </div>

                    <div class="-mx-1 mb-3 overflow-x-auto pb-1">
                      <div class="flex min-w-max gap-2 px-1">
                        <button
                          v-for="filter in actionSpellLevelFilters"
                          :key="filter.key"
                          type="button"
                          class="inline-flex items-center gap-2 rounded-none border px-3 py-2 text-xs font-semibold transition"
                          :class="actionSpellLevelFilter === filter.key
                            ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
                            : 'border-[rgba(65,82,103,0.64)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
                          @click.stop="setActionSpellLevelFilter(filter.key)"
                        >
                          <span>{{ filter.label }}</span>
                          <span class="rounded-none border border-[rgba(201,164,90,0.20)] bg-black/20 px-1.5 py-0.5 text-[10px] text-[#9f9278]">
                            {{ filter.count }}
                          </span>
                        </button>
                      </div>
                    </div>

                    <div
                      v-if="filteredActionSpellCards.length"
                      class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
                    >
                      <article
                        v-for="spell in filteredActionSpellCards"
                        :key="`action-spell-${spell.id}`"
                        class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                      >
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0">
                            <div class="truncate font-semibold text-white">{{ spell.title }}</div>
                            <div class="mt-1 text-xs text-[#9f9278]">
                              {{ spellOptionLevelLabel(spell) || 'Spell' }}
                            </div>

                            <div class="action-spell-mechanic mt-2 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2 text-xs">
                              <div class="flex items-center justify-between gap-2">
                                <span class="uppercase tracking-[0.18em] text-[#9f9278]">{{ spellActionMechanic(spell).label }}</span>
                                <span class="font-semibold text-white">{{ spellActionMechanic(spell).value }}</span>
                              </div>
                              <div class="mt-0.5 text-[10px] text-[#9f9278]">
                                {{ spellActionMechanic(spell).note }}
                              </div>

                              <button
                                v-if="spellUsesAttackRoll(spell)"
                                type="button"
                                class="mt-2 w-full rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df] disabled:opacity-40"
                                :disabled="!canCastSpell(spell)"
                                @click.stop="rollSpellAttackAndConsumeSlot(spell)"
                              >
                                Roll Spell Attack
                              </button>
                            </div>
                          </div>

                          <span class="shrink-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#f5e7bd]">
                            {{ spell.actionKind }}
                          </span>
                        </div>

                        <div
                          class="mt-3 grid gap-2"
                          :class="spellConsumesSlot(spell) ? 'grid-cols-2' : 'grid-cols-1'"
                        >
                          <button
                            type="button"
                            class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
                            @click.stop="openSpellDrawer(spell)"
                          >
                            Details
                          </button>

                          <button
                            v-if="spellConsumesSlot(spell)"
                            type="button"
                            class="rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(201,164,90,0.12)] px-3 py-2 text-xs font-semibold text-[#fff7df] disabled:cursor-not-allowed disabled:opacity-45"
                            :disabled="spellSaving || !canCastSpell(spell)"
                            @click.stop="castSpell(spell)"
                          >
                            Cast
                          </button>
                        </div>
                      </article>
                    </div>

                    <div v-else class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]">
                      No spell actions match this filter.
                    </div>
                  </div>
                </div>

                <div
                  v-if="itemActionCards.length"
                  class="eldra-codex-soft order-[-35] rounded-none p-4"
                >
                  <button
                    type="button"
                    class="mb-3 flex w-full items-center justify-between gap-3 text-left"
                    @click="toggleActionPanel('item-actions')"
                  >
                    <div>
                      <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Item Actions</div>
                      <div class="mt-1 text-sm text-[#d8ceb8]">Actions granted by equipped and attuned items.</div>
                    </div>

                    <div class="flex items-center gap-2">
                      <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                        {{ itemActionCards.length }} Item
                      </div>
                      <UIcon :name="actionPanelChevron('item-actions')" class="h-4 w-4 text-[#9f9278]" />
                    </div>
                  </button>

                  <div
                    v-show="actionPanelOpen('item-actions')"
                    class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
                  >
                    <article
                      v-for="action in itemActionCards"
                      :key="action.id || action.name"
                      class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                    >
                      <div class="flex items-start gap-3">
                        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] text-[#f5e7bd]">
                          <UIcon :name="action.icon || 'i-lucide-box'" class="h-4 w-4" />
                        </div>

                        <div class="min-w-0 flex-1">
                          <div class="flex flex-wrap items-center gap-2">
                            <div class="font-semibold text-white">{{ action.name }}</div>
                            <span class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">{{ action.timing }}</span>
                          </div>

                          <p class="mt-1 text-xs leading-5 text-[#9f9278]">{{ shortText(action.detail, 260) }}</p>

                          <div class="mt-3 flex flex-wrap gap-2">
                            <span
                              v-if="action.consumesResource"
                              class="rounded-none border border-amber-300/24 bg-amber-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100"
                            >
                              Resource
                            </span>

                            <button
                              v-if="action.itemDetail"
                              type="button"
                              class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
                              @click.stop="openItemDrawer(action.itemDetail)"
                            >
                              Item Details
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  </div>
                </div>

                <div class="eldra-codex-soft order-5 rounded-none p-4">
                  <button
                    type="button"
                    class="mb-3 flex w-full items-center justify-between gap-3 text-left"
                    @click="toggleActionPanel('common')"
                  >
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Common Actions</div>
                    <UIcon :name="actionPanelChevron('common')" class="h-4 w-4 text-[#9f9278]" />
                  </button>

                  <div
                    v-show="actionPanelOpen('common')"
                    class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
                  >
                    <article
                      v-for="action in commonActionCards"
                      :key="action.name"
                      class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                    >
                      <div class="flex items-start gap-3">
                        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] text-[#f5e7bd]">
                          <UIcon :name="action.icon" class="h-4 w-4" />
                        </div>

                        <div class="min-w-0">
                          <div class="flex flex-wrap items-center gap-2">
                            <div class="font-semibold text-white">{{ action.name }}</div>
                            <span class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">{{ action.timing }}</span>
                          </div>
                          <p class="mt-1 text-xs leading-5 text-[#9f9278]">{{ action.detail }}</p>
                        </div>
                      </div>
                    </article>
                  </div>
                </div>

                <div class="grid gap-3 lg:grid-cols-2">
                  <div class="eldra-codex-soft order-6 rounded-none p-4">
                    <button
                      type="button"
                      class="mb-3 flex w-full items-center justify-between gap-3 text-left"
                      @click="toggleActionPanel('bonus')"
                    >
                      <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Bonus Actions</div>

                      <div class="flex items-center gap-2">
                        <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                          Bonus
                        </div>
                        <UIcon :name="actionPanelChevron('bonus')" class="h-4 w-4 text-[#9f9278]" />
                      </div>
                    </button>

                    <div
                      v-show="actionPanelOpen('bonus')"
                      class="space-y-2"
                    >
                      <article
                        v-for="action in displayedBonusActionCards"
                        :key="action.name"
                        class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                      >
                        <div class="flex items-start gap-3">
                          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] text-[#f5e7bd]">
                            <UIcon :name="action.icon" class="h-4 w-4" />
                          </div>

                          <div>
                            <div class="font-semibold text-white">{{ action.name }}</div>
                            <p class="mt-1 text-xs leading-5 text-[#9f9278]">{{ action.detail }}</p>
                          </div>
                        </div>
                      </article>
                    </div>
                  </div>

                  <div class="eldra-codex-soft order-7 rounded-none p-4">
                    <button
                      type="button"
                      class="mb-3 flex w-full items-center justify-between gap-3 text-left"
                      @click="toggleActionPanel('reactions')"
                    >
                      <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Reactions</div>

                      <div class="flex items-center gap-2">
                        <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                          Reaction
                        </div>
                        <UIcon :name="actionPanelChevron('reactions')" class="h-4 w-4 text-[#9f9278]" />
                      </div>
                    </button>

                    <div
                      v-show="actionPanelOpen('reactions')"
                      class="space-y-2"
                    >
                      <article
                        v-for="action in displayedReactionActionCards"
                        :key="action.name"
                        class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
                      >
                        <div class="flex items-start gap-3">
                          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] text-[#f5e7bd]">
                            <UIcon :name="action.icon" class="h-4 w-4" />
                          </div>

                          <div>
                            <div class="font-semibold text-white">{{ action.name }}</div>
                            <p class="mt-1 text-xs leading-5 text-[#9f9278]">{{ action.detail }}</p>
                          </div>
                        </div>
                      </article>
                    </div>
                  </div>
                </div>
              </section>
</template>
