<script setup lang="ts">
const props = withDefaults(defineProps<{
  worldId: string | number
  entityId: string | number
  classResourceCards?: any[]
  mainSpeciesActionCards?: any[]
  itemActionCards?: any[]
  itemActionResourceState?: (action: any) => any
  itemActionResourceStatusText?: (action: any) => string
  itemActionResourcePipIndexes?: (action: any) => any[]
  itemActionResourcePipTitle?: (action: any, index: any) => string
  toggleItemActionResourcePip?: (action: any, index: any) => void
  itemActionResourcePipClass?: (action: any, index: any) => string
  canUseItemActionResource?: (action: any) => boolean
  useItemActionResource?: (action: any) => void
  canUndoItemActionResource?: (action: any) => boolean
  undoItemActionResource?: (action: any) => void
  equippedWeaponActions?: any[]
  actionSpellCards?: any[]
  commonActionCards?: any[]
  displayedBonusActionCards?: any[]
  displayedReactionActionCards?: any[]
  openFeatureDrawer?: (value: any) => void
  openItemDrawer?: (value: any) => void
  openSpellDrawer?: (value: any) => void
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
  commonActionCards: () => [],
  displayedBonusActionCards: () => [],
  displayedReactionActionCards: () => []
})

const activeFilter = ref('all')

const filters = [
  { key: 'all', label: 'All' },
  { key: 'attack', label: 'Attack' },
  { key: 'action', label: 'Action' },
  { key: 'bonus', label: 'Bonus Action' },
  { key: 'reaction', label: 'Reaction' },
  { key: 'other', label: 'Other' }
]

const innerTabs = [
  { key: 'actions', label: 'Actions', to: null },
  { key: 'spells', label: 'Spells', to: 'spells' },
  { key: 'inventory', label: 'Inventory', to: 'inventory' },
  { key: 'features', label: 'Features & Traits', to: 'features' },
  { key: 'notes', label: 'Notes', to: 'notes' }
]

function tabTo(tab: string) {
  return {
    path: `/worlds/${props.worldId}/entities/${props.entityId}/sheet`,
    query: tab ? { tab } : {}
  }
}

function normalizeKey(value: any) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function timingFilter(value: any) {
  const text = normalizeKey(value)

  if (text.includes('attack')) return 'attack'
  if (text.includes('bonus')) return 'bonus'
  if (text.includes('reaction')) return 'reaction'
  if (text.includes('magic')) return 'action'
  if (text.includes('action')) return 'action'

  return 'other'
}

function short(value: any, limit = 180) {
  if (props.shortText) return props.shortText(value, limit)

  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text
}

function spellLevel(spell: any) {
  return props.spellOptionLevelLabel?.(spell) || 'Spell'
}

function spellMechanic(spell: any) {
  return props.spellActionMechanic?.(spell) || {
    label: 'Roll',
    value: '—',
    note: 'No attack/save detected'
  }
}

function spellCanCast(spell: any) {
  return props.canCastSpell?.(spell) ?? true
}

function itemResourceState(action: any) {
  return props.itemActionResourceState?.(action) || null
}

function itemResourceStatus(action: any) {
  return props.itemActionResourceStatusText?.(action) || ''
}

function itemResourcePips(action: any) {
  return props.itemActionResourcePipIndexes?.(action) || []
}

function itemResourcePipTitle(action: any, index: any) {
  return props.itemActionResourcePipTitle?.(action, index) || ''
}

function itemResourcePipClass(action: any, index: any) {
  return props.itemActionResourcePipClass?.(action, index) || ''
}

function itemCanUse(action: any) {
  return props.canUseItemActionResource?.(action) || false
}

function itemCanUndo(action: any) {
  return props.canUndoItemActionResource?.(action) || false
}

function speciesResourceState(action: any) {
  return props.resourceStateForSpeciesAction?.(action) || null
}

function speciesResourceStatus(action: any) {
  return props.speciesActionResourceStatusText?.(action) || ''
}

function speciesResourcePips(action: any) {
  return props.speciesActionResourcePipIndexes?.(action) || []
}

function speciesResourcePipTitle(action: any, index: any) {
  return props.speciesActionResourcePipTitle?.(action, index) || ''
}

function speciesResourcePipClass(action: any, index: any) {
  return props.speciesActionResourcePipClass?.(action, index) || ''
}

function speciesCanAttack(action: any) {
  return props.speciesActionCanAttack?.(action) || false
}

const unifiedActions = computed(() => {
  const rows: any[] = []

  for (const weapon of props.equippedWeaponActions || []) {
    rows.push({
      id: `weapon-${weapon.id}`,
      kind: 'weapon',
      filter: 'attack',
      title: weapon.name || 'Attack',
      subtitle: weapon.itemType || 'Weapon',
      badge: 'Attack',
      hitLabel: 'Hit',
      hitValue: weapon.attackBonusText || '—',
      hitNote: weapon.attackFormula || '',
      damageValue: weapon.damage || '—',
      damageNote: weapon.damageFormula || '',
      detail: weapon.notes || weapon.description || '',
      raw: weapon
    })
  }

  for (const action of props.mainSpeciesActionCards || []) {
    const isAttack = speciesCanAttack(action)

    rows.push({
      id: `species-${action.id || action.name}`,
      kind: 'species',
      filter: isAttack ? 'attack' : timingFilter(action.timing || action.actionKind),
      title: action.name || 'Species Action',
      subtitle: action.source || 'Species',
      badge: action.timing || action.actionKind || 'Action',
      hitLabel: isAttack ? 'Hit' : '',
      hitValue: isAttack ? props.speciesActionAttackBonusText?.(action) || '—' : '',
      hitNote: isAttack ? props.speciesActionAttackFormula?.(action) || '' : '',
      damageValue: action.damage ? props.speciesActionDamageText?.(action) || action.damage : '',
      damageNote: action.damage ? props.speciesActionDamageFormulaText?.(action) || '' : '',
      detail: action.detail || action.description || '',
      raw: action
    })
  }

  for (const spell of props.actionSpellCards || []) {
    rows.push({
      id: `spell-${spell.id}`,
      kind: 'spell',
      filter: 'action',
      title: spell.title || spell.name || 'Spell',
      subtitle: spellLevel(spell),
      badge: spell.actionKind || 'Spell',
      hitLabel: spellMechanic(spell).label,
      hitValue: spellMechanic(spell).value,
      hitNote: spellMechanic(spell).note,
      damageValue: '',
      damageNote: '',
      detail: spell.summary || spell.description || '',
      raw: spell
    })
  }

  for (const action of props.itemActionCards || []) {
    rows.push({
      id: `item-${action.id || action.name}`,
      kind: 'item',
      filter: action.timingKey || timingFilter(action.timing || action.actionKind),
      title: action.name || 'Item Action',
      subtitle: action.source || action.itemType || 'Item',
      badge: action.timing || action.actionKind || 'Action',
      hitLabel: itemResourceState(action) ? 'Uses' : '',
      hitValue: itemResourceState(action) ? itemResourceStatus(action) : '',
      hitNote: itemResourceState(action)?.reset || '',
      damageValue: '',
      damageNote: '',
      detail: action.detail || action.description || '',
      raw: action
    })
  }

  for (const action of props.commonActionCards || []) {
    rows.push({
      id: `common-${action.name}`,
      kind: 'common',
      filter: timingFilter(action.timing || 'Action'),
      title: action.name || 'Action',
      subtitle: 'Actions in Combat',
      badge: action.timing || 'Action',
      detail: action.detail || '',
      raw: action
    })
  }

  for (const action of props.displayedBonusActionCards || []) {
    rows.push({
      id: `bonus-${action.id || action.name}`,
      kind: 'feature',
      filter: 'bonus',
      title: action.name || 'Bonus Action',
      subtitle: action.source || action.itemType || 'Bonus Action',
      badge: action.timing || 'Bonus Action',
      detail: action.detail || action.description || '',
      raw: action
    })
  }

  for (const action of props.displayedReactionActionCards || []) {
    rows.push({
      id: `reaction-${action.id || action.name}`,
      kind: 'feature',
      filter: 'reaction',
      title: action.name || 'Reaction',
      subtitle: action.source || action.itemType || 'Reaction',
      badge: action.timing || 'Reaction',
      detail: action.detail || action.description || '',
      raw: action
    })
  }

  for (const resource of props.classResourceCards || []) {
    rows.push({
      id: `resource-${resource.id || resource.key || resource.label}`,
      kind: 'resource',
      filter: 'other',
      title: resource.label || resource.name || 'Resource',
      subtitle: resource.source || 'Class Resource',
      badge: 'Resource',
      detail: resource.description || resource.note || '',
      raw: resource
    })
  }

  return rows
})

const visibleActions = computed(() => {
  if (activeFilter.value === 'all') return unifiedActions.value

  return unifiedActions.value.filter((action) => action.filter === activeFilter.value)
})

function countForFilter(key: string) {
  if (key === 'all') return unifiedActions.value.length
  return unifiedActions.value.filter((action) => action.filter === key).length
}

function filterClass(key: string) {
  return activeFilter.value === key
    ? 'border-[rgba(201,164,90,0.68)] bg-[rgba(201,164,90,0.18)] text-[#fff7df]'
    : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.68)] text-[#d8ceb8] hover:border-[rgba(201,164,90,0.42)] hover:bg-[rgba(201,164,90,0.08)] hover:text-[#fff7df]'
}

function iconFor(action: any) {
  if (action.kind === 'weapon') return 'i-lucide-swords'
  if (action.kind === 'spell') return 'i-lucide-sparkles'
  if (action.kind === 'item') return 'i-lucide-box'
  if (action.filter === 'bonus') return 'i-lucide-flame'
  if (action.filter === 'reaction') return 'i-lucide-rotate-ccw'
  if (action.kind === 'resource') return 'i-lucide-diamond'
  return 'i-lucide-circle-dot'
}
</script>

<template>
  <section class="eldra-codex-soft rounded-none p-0">
    <div class="border-b border-[rgba(201,164,90,0.18)] px-4 pt-4">
      <div class="-mx-1 overflow-x-auto pb-1">
        <div class="flex min-w-max items-center gap-4 px-1 text-xs font-semibold uppercase tracking-[0.16em]">
          <button
            type="button"
            class="border-b-2 border-[#c9a45a] pb-2 text-[#fff7df]"
          >
            Actions
          </button>

          <NuxtLink
            v-for="tab in innerTabs.filter((tab) => tab.to)"
            :key="tab.key"
            :to="tabTo(tab.to!)"
            class="border-b-2 border-transparent pb-2 text-[#9f9278] transition hover:border-[rgba(201,164,90,0.38)] hover:text-[#fff7df]"
          >
            {{ tab.label }}
          </NuxtLink>
        </div>
      </div>
    </div>

    <div class="p-4">
      <div class="-mx-1 overflow-x-auto pb-1">
        <div class="flex min-w-max gap-2 px-1">
          <button
            v-for="filter in filters"
            :key="filter.key"
            type="button"
            class="inline-flex items-center gap-2 rounded-none border px-3 py-2 text-xs font-semibold transition"
            :class="filterClass(filter.key)"
            @click="activeFilter = filter.key"
          >
            <span>{{ filter.label }}</span>
            <span class="rounded-none border border-[rgba(201,164,90,0.20)] bg-black/20 px-1.5 py-0.5 text-[10px] text-[#9f9278]">
              {{ countForFilter(filter.key) }}
            </span>
          </button>
        </div>
      </div>

      <div
        v-if="visibleActions.length"
        class="mt-4 divide-y divide-[rgba(201,164,90,0.12)] border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.44)]"
      >
        <article
          v-for="action in visibleActions"
          :key="action.id"
          class="p-3 transition hover:bg-[rgba(201,164,90,0.06)]"
        >
          <div class="flex items-start gap-3">
            <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.08)] text-[#f5e7bd]">
              <UIcon :name="iconFor(action)" class="h-4 w-4" />
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="truncate text-base font-semibold text-white">{{ action.title }}</div>
                  <div class="mt-0.5 text-xs text-[#9f9278]">{{ action.subtitle }}</div>
                </div>

                <span class="shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#f5e7bd]">
                  {{ action.badge }}
                </span>
              </div>

              <div
                v-if="action.hitLabel || action.damageValue"
                class="mt-3 grid gap-2 text-xs"
                :class="action.damageValue ? 'sm:grid-cols-2' : 'grid-cols-1'"
              >
                <div
                  v-if="action.hitLabel"
                  class="rounded-none border border-[rgba(201,164,90,0.14)] bg-black/20 p-2"
                >
                  <div class="uppercase tracking-[0.18em] text-[#9f9278]">{{ action.hitLabel }}</div>
                  <div class="mt-1 font-semibold text-white">{{ action.hitValue || '—' }}</div>
                  <div
                    v-if="action.hitNote"
                    class="mt-0.5 text-[10px] text-[#9f9278]"
                  >
                    {{ action.hitNote }}
                  </div>
                </div>

                <div
                  v-if="action.damageValue"
                  class="rounded-none border border-[rgba(201,164,90,0.14)] bg-black/20 p-2"
                >
                  <div class="uppercase tracking-[0.18em] text-[#9f9278]">Damage</div>
                  <div class="mt-1 font-semibold text-white">{{ action.damageValue }}</div>
                  <div
                    v-if="action.damageNote"
                    class="mt-0.5 text-[10px] text-[#9f9278]"
                  >
                    {{ action.damageNote }}
                  </div>
                </div>
              </div>

              <p
                v-if="action.detail"
                class="mt-3 text-xs leading-5 text-[#9f9278]"
              >
                {{ short(action.detail, 230) }}
              </p>

              <div
                v-if="action.kind === 'item' && itemResourceState(action.raw)"
                class="mt-3 rounded-none border border-amber-300/20 bg-amber-400/10 p-2"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-[10px] uppercase tracking-[0.18em] text-amber-100">
                    {{ itemResourceStatus(action.raw) }}
                  </span>
                  <span class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                    {{ itemResourceState(action.raw)?.reset || 'Long Rest' }}
                  </span>
                </div>

                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    v-for="pipIndex in itemResourcePips(action.raw)"
                    :key="`item-action-resource-${action.id}-${pipIndex}`"
                    type="button"
                    class="p-0.5 transition hover:scale-110 focus:outline-none focus:ring-1 focus:ring-amber-200/50"
                    :title="itemResourcePipTitle(action.raw, pipIndex)"
                    @click.stop="props.toggleItemActionResourcePip?.(action.raw, pipIndex)"
                  >
                    <span :class="itemResourcePipClass(action.raw, pipIndex)" />
                  </button>
                </div>
              </div>

              <div
                v-if="action.kind === 'species' && speciesResourceState(action.raw)"
                class="mt-3 flex flex-wrap items-center gap-2"
              >
                <span class="rounded-none border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-100">
                  {{ speciesResourceStatus(action.raw) }}
                </span>

                <button
                  v-for="pipIndex in speciesResourcePips(action.raw)"
                  :key="`species-action-resource-${action.id}-${pipIndex}`"
                  type="button"
                  class="rounded-full p-0.5 transition hover:scale-110 focus:outline-none focus:ring-1 focus:ring-emerald-200/50"
                  :title="speciesResourcePipTitle(action.raw, pipIndex)"
                  @click.stop="props.toggleSpeciesActionResourcePip?.(action.raw, pipIndex)"
                >
                  <span :class="speciesResourcePipClass(action.raw, pipIndex)" />
                </button>
              </div>

              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  v-if="action.kind === 'weapon'"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.rollWeaponAttack?.(action.raw)"
                >
                  To Hit
                </button>

                <button
                  v-if="action.kind === 'weapon'"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.rollWeaponDamage?.(action.raw)"
                >
                  Damage
                </button>

                <button
                  v-if="action.kind === 'weapon' && (action.raw?.linkedItemId || action.raw?.description || action.raw?.notes)"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.openItemDrawer?.(action.raw)"
                >
                  Details
                </button>

                <button
                  v-if="action.kind === 'spell'"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.openSpellDrawer?.(action.raw)"
                >
                  Details
                </button>

                <button
                  v-if="action.kind === 'spell' && props.spellUsesAttackRoll?.(action.raw)"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-45"
                  :disabled="!spellCanCast(action.raw)"
                  @click.stop="props.rollSpellAttackAndConsumeSlot?.(action.raw)"
                >
                  Roll Attack
                </button>

                <button
                  v-if="action.kind === 'spell' && props.spellConsumesSlot?.(action.raw)"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-45"
                  :disabled="!spellCanCast(action.raw)"
                  @click.stop="props.castSpell?.(action.raw)"
                >
                  Cast
                </button>

                <button
                  v-if="action.kind === 'species' && speciesCanAttack(action.raw)"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.rollSpeciesActionAttack?.(action.raw)"
                >
                  To Hit
                </button>

                <button
                  v-if="action.kind === 'species' && action.raw?.damage"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-45"
                  :disabled="speciesResourceState(action.raw) && !props.canUseSpeciesActionResource?.(action.raw)"
                  @click.stop="props.rollSpeciesActionDamage?.(action.raw)"
                >
                  Damage
                </button>

                <button
                  v-if="action.kind === 'species'"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.openFeatureDrawer?.(action.raw)"
                >
                  Details
                </button>

                <button
                  v-if="action.kind === 'item' && itemResourceState(action.raw)"
                  type="button"
                  class="rounded-none border border-amber-300/24 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-45"
                  :disabled="!itemCanUse(action.raw)"
                  @click.stop="props.useItemActionResource?.(action.raw)"
                >
                  Use
                </button>

                <button
                  v-if="action.kind === 'item' && itemResourceState(action.raw)"
                  type="button"
                  class="rounded-none border border-[rgba(148,163,184,0.24)] bg-[rgba(15,23,42,0.45)] px-3 py-2 text-xs font-semibold text-[#d8ceb8] disabled:opacity-45"
                  :disabled="!itemCanUndo(action.raw)"
                  @click.stop="props.undoItemActionResource?.(action.raw)"
                >
                  Undo
                </button>

                <button
                  v-if="action.kind === 'item' && action.raw?.itemDetail"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.openItemDrawer?.(action.raw.itemDetail)"
                >
                  Item Details
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div
        v-else
        class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-5 text-sm text-[#9f9278]"
      >
        No actions match this filter.
      </div>
    </div>
  </section>
</template>
