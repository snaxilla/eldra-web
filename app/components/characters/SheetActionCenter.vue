<script setup lang="ts">
const props = withDefaults(defineProps<{
  worldId: string | number
  entityId: string | number
  classResourceCards?: any[]
  mainSpeciesActionCards?: any[]
  itemActionCards?: any[]
  inventoryItems?: any[]
  featureCards?: any[]
  noteCards?: any[]
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
  openNoteDetail?: (note: any) => void
  openAddNoteDrawer?: () => void
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
  inventoryItems: () => [],
  featureCards: () => [],
  noteCards: () => [],
  equippedWeaponActions: () => [],
  actionSpellCards: () => [],
  commonActionCards: () => [],
  displayedBonusActionCards: () => [],
  displayedReactionActionCards: () => []
})

const activePanelTab = ref('actions')
const activeActionFilter = ref('all')

const panelTabs = [
  { key: 'actions', label: 'Actions' },
  { key: 'spells', label: 'Spells' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'features', label: 'Features & Traits' },
  { key: 'notes', label: 'Notes' }
]

const actionFilters = [
  { key: 'all', label: 'All' },
  { key: 'attack', label: 'Attack' },
  { key: 'action', label: 'Action' },
  { key: 'bonus', label: 'Bonus Action' },
  { key: 'reaction', label: 'Reaction' },
  { key: 'other', label: 'Other' }
]

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

function short(value: any, limit = 150) {
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

function spellUsesAttack(spell: any) {
  return props.spellUsesAttackRoll?.(spell) || false
}

function spellConsumesSlot(spell: any) {
  return props.spellConsumesSlot?.(spell) || false
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

function toggleItemPip(action: any, index: any) {
  props.toggleItemActionResourcePip?.(action, index)
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

function toggleSpeciesPip(action: any, index: any) {
  props.toggleSpeciesActionResourcePip?.(action, index)
}

function speciesCanAttack(action: any) {
  return props.speciesActionCanAttack?.(action) || false
}

function actionIcon(action: any) {
  if (action.kind === 'weapon') return 'i-lucide-swords'
  if (action.kind === 'spell') return 'i-lucide-sparkles'
  if (action.kind === 'item') return 'i-lucide-box'
  if (action.filter === 'bonus') return 'i-lucide-flame'
  if (action.filter === 'reaction') return 'i-lucide-rotate-ccw'
  if (action.kind === 'resource') return 'i-lucide-diamond'
  return 'i-lucide-circle-dot'
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
      hit: weapon.attackBonusText || '—',
      hitNote: weapon.attackFormula || '',
      damage: weapon.damage || '—',
      damageNote: weapon.damageFormula || '',
      notes: weapon.damageType || weapon.notes || weapon.description || '',
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
      hit: isAttack ? props.speciesActionAttackBonusText?.(action) || '—' : '',
      hitNote: isAttack ? props.speciesActionAttackFormula?.(action) || '' : '',
      damage: action.damage ? props.speciesActionDamageText?.(action) || action.damage : '',
      damageNote: action.damage ? props.speciesActionDamageFormulaText?.(action) || '' : '',
      notes: action.detail || action.description || '',
      raw: action
    })
  }

  for (const spell of props.actionSpellCards || []) {
    const mechanic = spellMechanic(spell)

    rows.push({
      id: `spell-${spell.id}`,
      kind: 'spell',
      filter: 'action',
      title: spell.title || spell.name || 'Spell',
      subtitle: spellLevel(spell),
      badge: spell.actionKind || 'Spell',
      hit: mechanic.value,
      hitNote: `${mechanic.label}${mechanic.note ? `: ${mechanic.note}` : ''}`,
      damage: '',
      damageNote: '',
      notes: spell.summary || spell.description || '',
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
      hit: itemResourceState(action) ? itemResourceStatus(action) : '',
      hitNote: itemResourceState(action)?.reset || '',
      damage: '',
      damageNote: '',
      notes: action.detail || action.description || '',
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
      hit: '',
      damage: '',
      notes: action.detail || '',
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
      hit: '',
      damage: '',
      notes: action.detail || action.description || '',
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
      hit: '',
      damage: '',
      notes: action.detail || action.description || '',
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
      hit: '',
      damage: '',
      notes: resource.description || resource.note || '',
      raw: resource
    })
  }

  return rows
})

const visibleActions = computed(() => {
  if (activeActionFilter.value === 'all') return unifiedActions.value
  return unifiedActions.value.filter((action) => action.filter === activeActionFilter.value)
})

const spellRows = computed(() => props.actionSpellCards || [])
const inventoryRows = computed(() => props.inventoryItems || [])
const featureRows = computed(() => props.featureCards || [])
const noteRows = computed(() => props.noteCards || [])

function countForFilter(key: string) {
  if (key === 'all') return unifiedActions.value.length
  return unifiedActions.value.filter((action) => action.filter === key).length
}

function tabCount(key: string) {
  if (key === 'actions') return unifiedActions.value.length
  if (key === 'spells') return spellRows.value.length
  if (key === 'inventory') return inventoryRows.value.length
  if (key === 'features') return featureRows.value.length
  if (key === 'notes') return noteRows.value.length
  return 0
}

function filterClass(key: string) {
  return activeActionFilter.value === key
    ? 'border-[rgba(201,164,90,0.68)] bg-[rgba(201,164,90,0.18)] text-[#fff7df]'
    : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.68)] text-[#d8ceb8] hover:border-[rgba(201,164,90,0.42)] hover:bg-[rgba(201,164,90,0.08)] hover:text-[#fff7df]'
}

function panelTabClass(key: string) {
  return activePanelTab.value === key
    ? 'border-[#c9a45a] text-[#fff7df]'
    : 'border-transparent text-[#9f9278] hover:border-[rgba(201,164,90,0.38)] hover:text-[#fff7df]'
}

function itemStatus(item: any) {
  const bits = []
  if (item?.quantity) bits.push(`Qty ${item.quantity}`)
  if (item?.equipped) bits.push('Equipped')
  if (item?.attuned) bits.push('Attuned')
  return bits.join(' / ') || 'Carried'
}

function openInventoryItem(item: any) {
  props.openItemDrawer?.(item?.detail || item)
}

function openFeature(item: any) {
  props.openFeatureDrawer?.(item?.raw || item)
}

function noteUpdatedLabel(note: any) {
  const raw = note?.updatedAt || note?.updated_at || note?.date_updated || note?.modifiedAt || note?.createdAt || note?.created_at
  if (!raw) return ''

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function openNote(note: any) {
  props.openNoteDetail?.(note)
}

</script>

<template>
  <section class="eldra-codex-soft overflow-hidden rounded-none p-0">
    <div class="border-b border-[rgba(201,164,90,0.18)] px-4 pt-4">
      <div class="-mx-1 overflow-x-auto pb-1">
        <div class="flex min-w-max items-center gap-4 px-1 text-xs font-semibold uppercase tracking-[0.16em]">
          <button
            v-for="tab in panelTabs"
            :key="tab.key"
            type="button"
            class="border-b-2 pb-2 transition"
            :class="panelTabClass(tab.key)"
            @click="activePanelTab = tab.key"
          >
            {{ tab.label }}
            <span
              v-if="tabCount(tab.key)"
              class="ml-1 rounded-none border border-[rgba(201,164,90,0.20)] bg-black/20 px-1.5 py-0.5 text-[10px] text-[#9f9278]"
            >
              {{ tabCount(tab.key) }}
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- ACTIONS PANEL -->
    <div
      v-if="activePanelTab === 'actions'"
      class="p-4"
    >
      <div class="sticky top-0 z-10 -mx-4 -mt-4 border-b border-[rgba(201,164,90,0.12)] bg-[rgba(8,10,12,0.94)] px-4 py-3 backdrop-blur">
        <div class="-mx-1 overflow-x-auto pb-1">
          <div class="flex min-w-max gap-2 px-1">
            <button
              v-for="filter in actionFilters"
              :key="filter.key"
              type="button"
              class="inline-flex items-center gap-2 rounded-none border px-3 py-2 text-xs font-semibold transition"
              :class="filterClass(filter.key)"
              @click="activeActionFilter = filter.key"
            >
              <span>{{ filter.label }}</span>
              <span class="rounded-none border border-[rgba(201,164,90,0.20)] bg-black/20 px-1.5 py-0.5 text-[10px] text-[#9f9278]">
                {{ countForFilter(filter.key) }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div class="max-h-[560px] overflow-y-auto pr-1">
        <div class="overflow-hidden border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.44)]">
          <div class="hidden grid-cols-[minmax(170px,1.4fr)_80px_92px_minmax(130px,1fr)_150px] gap-3 border-b border-[rgba(201,164,90,0.18)] bg-black/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9f9278] xl:grid">
            <div>Attack</div>
            <div>Hit / DC</div>
            <div>Damage</div>
            <div>Notes</div>
            <div class="text-right">Controls</div>
          </div>

          <article
            v-for="action in visibleActions"
            :key="action.id"
            class="border-b border-[rgba(201,164,90,0.10)] px-3 py-3 last:border-b-0 hover:bg-[rgba(201,164,90,0.06)]"
          >
            <div class="grid gap-3 xl:grid-cols-[minmax(170px,1.4fr)_80px_92px_minmax(130px,1fr)_150px] xl:items-center">
              <div class="min-w-0">
                <div class="flex min-w-0 items-start gap-2">
                  <div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.08)] text-[#f5e7bd]">
                    <UIcon :name="actionIcon(action)" class="h-4 w-4" />
                  </div>

                  <div class="min-w-0">
                    <div class="truncate text-sm font-semibold text-white">{{ action.title }}</div>
                    <div class="mt-0.5 text-xs text-[#9f9278]">{{ action.subtitle }}</div>
                  </div>
                </div>
              </div>

              <div class="rounded-none border border-[rgba(201,164,90,0.12)] bg-black/15 px-2 py-1.5 text-xs xl:border-0 xl:bg-transparent xl:p-0">
                <div class="xl:hidden uppercase tracking-[0.16em] text-[#9f9278]">Hit / DC</div>
                <div class="font-semibold text-white">{{ action.hit || '—' }}</div>
                <div
                  v-if="action.hitNote"
                  class="mt-0.5 text-[10px] text-[#9f9278]"
                >
                  {{ action.hitNote }}
                </div>
              </div>

              <div class="rounded-none border border-[rgba(201,164,90,0.12)] bg-black/15 px-2 py-1.5 text-xs xl:border-0 xl:bg-transparent xl:p-0">
                <div class="xl:hidden uppercase tracking-[0.16em] text-[#9f9278]">Damage</div>
                <div class="font-semibold text-white">{{ action.damage || '—' }}</div>
                <div
                  v-if="action.damageNote"
                  class="mt-0.5 text-[10px] text-[#9f9278]"
                >
                  {{ action.damageNote }}
                </div>
              </div>

              <div class="min-w-0 text-xs leading-5 text-[#9f9278]">
                <span class="xl:hidden uppercase tracking-[0.16em] text-[#9f9278]">Notes: </span>
                {{ short(action.notes, 150) || action.badge }}
              </div>

              <div class="flex flex-wrap justify-start gap-2 xl:justify-end">
                <button
                  v-if="action.kind === 'weapon'"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.rollWeaponAttack?.(action.raw)"
                >
                  Hit
                </button>

                <button
                  v-if="action.kind === 'weapon'"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.rollWeaponDamage?.(action.raw)"
                >
                  Damage
                </button>

                <button
                  v-if="action.kind === 'weapon' && (action.raw?.linkedItemId || action.raw?.description || action.raw?.notes)"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.openItemDrawer?.(action.raw)"
                >
                  Details
                </button>

                <button
                  v-if="action.kind === 'spell'"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.openSpellDrawer?.(action.raw)"
                >
                  Details
                </button>

                <button
                  v-if="action.kind === 'spell' && spellUsesAttack(action.raw)"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-1.5 text-xs font-semibold text-[#fff7df] disabled:opacity-45"
                  :disabled="!spellCanCast(action.raw)"
                  @click.stop="props.rollSpellAttackAndConsumeSlot?.(action.raw)"
                >
                  Roll
                </button>

                <button
                  v-if="action.kind === 'spell' && spellConsumesSlot(action.raw)"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-1.5 text-xs font-semibold text-[#fff7df] disabled:opacity-45"
                  :disabled="!spellCanCast(action.raw)"
                  @click.stop="props.castSpell?.(action.raw)"
                >
                  Cast
                </button>

                <button
                  v-if="action.kind === 'species' && speciesCanAttack(action.raw)"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.rollSpeciesActionAttack?.(action.raw)"
                >
                  Hit
                </button>

                <button
                  v-if="action.kind === 'species' && action.raw?.damage"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.rollSpeciesActionDamage?.(action.raw)"
                >
                  Damage
                </button>

                <button
                  v-if="action.kind === 'species'"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.openFeatureDrawer?.(action.raw)"
                >
                  Details
                </button>

                <button
                  v-if="action.kind === 'item' && itemResourceState(action.raw)"
                  type="button"
                  class="rounded-none border border-amber-300/24 bg-amber-400/10 px-2 py-1.5 text-xs font-semibold text-amber-100 disabled:opacity-45"
                  :disabled="!itemCanUse(action.raw)"
                  @click.stop="props.useItemActionResource?.(action.raw)"
                >
                  Use
                </button>

                <button
                  v-if="action.kind === 'item' && itemResourceState(action.raw)"
                  type="button"
                  class="rounded-none border border-[rgba(148,163,184,0.24)] bg-[rgba(15,23,42,0.45)] px-2 py-1.5 text-xs font-semibold text-[#d8ceb8] disabled:opacity-45"
                  :disabled="!itemCanUndo(action.raw)"
                  @click.stop="props.undoItemActionResource?.(action.raw)"
                >
                  Undo
                </button>

                <button
                  v-if="action.kind === 'item' && action.raw?.itemDetail"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.openItemDrawer?.(action.raw.itemDetail)"
                >
                  Details
                </button>
              </div>
            </div>

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
                  @click.stop="toggleItemPip(action.raw, pipIndex)"
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
                @click.stop="toggleSpeciesPip(action.raw, pipIndex)"
              >
                <span :class="speciesResourcePipClass(action.raw, pipIndex)" />
              </button>
            </div>
          </article>

          <div
            v-if="!visibleActions.length"
            class="p-5 text-sm text-[#9f9278]"
          >
            No actions match this filter.
          </div>
        </div>
      </div>
    </div>

    <!-- SPELLS PANEL -->
    <div
      v-else-if="activePanelTab === 'spells'"
      class="max-h-[620px] overflow-y-auto p-4 pr-5"
    >
      <div
        v-if="spellRows.length"
        class="overflow-hidden border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.44)]"
      >
        <article
          v-for="spell in spellRows"
          :key="`inner-spell-${spell.id}`"
          class="border-b border-[rgba(201,164,90,0.10)] px-3 py-3 last:border-b-0 hover:bg-[rgba(201,164,90,0.06)]"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-white">{{ spell.title }}</div>
              <div class="mt-0.5 text-xs text-[#9f9278]">{{ spellLevel(spell) }}</div>
            </div>

            <span class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#f5e7bd]">
              {{ spell.actionKind || 'Spell' }}
            </span>
          </div>

          <div class="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <div class="rounded-none border border-[rgba(201,164,90,0.12)] bg-black/15 px-2 py-1.5 text-xs">
              <div class="uppercase tracking-[0.16em] text-[#9f9278]">{{ spellMechanic(spell).label }}</div>
              <div class="mt-1 font-semibold text-white">{{ spellMechanic(spell).value }}</div>
              <div class="mt-0.5 text-[10px] text-[#9f9278]">{{ spellMechanic(spell).note }}</div>
            </div>

            <div class="flex flex-wrap gap-2 sm:justify-end">
              <button
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
                @click.stop="props.openSpellDrawer?.(spell)"
              >
                Details
              </button>

              <button
                v-if="spellUsesAttack(spell)"
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-1.5 text-xs font-semibold text-[#fff7df] disabled:opacity-45"
                :disabled="!spellCanCast(spell)"
                @click.stop="props.rollSpellAttackAndConsumeSlot?.(spell)"
              >
                Roll
              </button>

              <button
                v-if="spellConsumesSlot(spell)"
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-1.5 text-xs font-semibold text-[#fff7df] disabled:opacity-45"
                :disabled="!spellCanCast(spell)"
                @click.stop="props.castSpell?.(spell)"
              >
                Cast
              </button>
            </div>
          </div>
        </article>
      </div>

      <div
        v-else
        class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-5 text-sm text-[#9f9278]"
      >
        No spell actions prepared or available for this character.
      </div>
    </div>

    <!-- INVENTORY PANEL -->
    <div
      v-else-if="activePanelTab === 'inventory'"
      class="max-h-[620px] overflow-y-auto p-4 pr-5"
    >
      <div
        v-if="inventoryRows.length"
        class="overflow-hidden border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.44)]"
      >
        <article
          v-for="item in inventoryRows"
          :key="`inner-inventory-${item.inventoryId || item.id || item.name}`"
          class="border-b border-[rgba(201,164,90,0.10)] px-3 py-3 last:border-b-0 hover:bg-[rgba(201,164,90,0.06)]"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-white">{{ item.name }}</div>
              <div class="mt-0.5 text-xs text-[#9f9278]">{{ item.itemType || 'Item' }}</div>
            </div>

            <span class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#f5e7bd]">
              {{ itemStatus(item) }}
            </span>
          </div>

          <p
            v-if="item.description || item.notes"
            class="mt-2 text-xs leading-5 text-[#9f9278]"
          >
            {{ short(item.notes || item.description, 170) }}
          </p>

          <div class="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
              @click.stop="openInventoryItem(item)"
            >
              Details
            </button>
          </div>
        </article>
      </div>

      <div
        v-else
        class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-5 text-sm text-[#9f9278]"
      >
        No inventory items yet.
      </div>
    </div>

    <!-- FEATURES PANEL -->
    <div
      v-else-if="activePanelTab === 'features'"
      class="max-h-[620px] overflow-y-auto p-4 pr-5"
    >
      <div
        v-if="featureRows.length"
        class="overflow-hidden border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.44)]"
      >
        <article
          v-for="feature in featureRows"
          :key="`inner-feature-${feature.id || feature.title || feature.name}`"
          class="border-b border-[rgba(201,164,90,0.10)] px-3 py-3 last:border-b-0 hover:bg-[rgba(201,164,90,0.06)]"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-white">{{ feature.title || feature.name }}</div>
              <div class="mt-0.5 text-xs text-[#9f9278]">
                {{ feature.type || feature.source || feature.itemType || 'Feature' }}
              </div>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
              @click.stop="openFeature(feature)"
            >
              Details
            </button>
          </div>

          <p
            v-if="feature.description || feature.detail"
            class="mt-2 text-xs leading-5 text-[#9f9278]"
          >
            {{ short(feature.description || feature.detail, 190) }}
          </p>
        </article>
      </div>

      <div
        v-else
        class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-5 text-sm text-[#9f9278]"
      >
        No feature highlights resolved yet.
      </div>
    </div>

    <!-- NOTES PANEL -->
    <div
      v-else-if="activePanelTab === 'notes'"
      class="max-h-[620px] overflow-y-auto p-4 pr-5"
    >
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Notes</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">Searchable table notes, clues, reminders, and NPC details.</div>
        </div>

        <button
          type="button"
          class="eldra-button rounded-none px-3 py-2 text-xs font-semibold"
          @click="props.openAddNoteDrawer?.()"
        >
          Add Note +
        </button>
      </div>

      <div
        v-if="noteRows.length"
        class="overflow-hidden border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.44)]"
      >
        <article
          v-for="note in noteRows"
          :key="`inner-note-${note.id || note.title}`"
          class="border-b border-[rgba(201,164,90,0.10)] px-3 py-3 last:border-b-0 hover:bg-[rgba(201,164,90,0.06)]"
        >
          <div class="flex min-w-0 items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-white">
                {{ note.title || 'Untitled Note' }}
              </div>

              <div
                v-if="noteUpdatedLabel(note)"
                class="mt-0.5 text-xs text-[#9f9278]"
              >
                Updated {{ noteUpdatedLabel(note) }}
              </div>
            </div>

            <button
              type="button"
              class="shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
              @click.stop="openNote(note)"
            >
              Details
            </button>
          </div>

          <p class="mt-2 break-words text-xs leading-5 text-[#9f9278]">
            {{ short(note.body || note.description || '', 220) || 'No note body yet.' }}
          </p>
        </article>
      </div>

      <div
        v-else
        class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-5 text-sm text-[#9f9278]"
      >
        No notes yet. Add one for an NPC, city, clue, quest, or table reminder.
      </div>
    </div>
  </section>
</template>
