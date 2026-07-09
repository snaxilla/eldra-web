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
  incomingTransfers?: any[]
  outgoingTransfers?: any[]
  transferSaving?: boolean
  transferError?: string
  transferSuccess?: string
  openTransferDrawer?: (item: any) => void
  acceptTransfer?: (transfer: any) => void
  declineTransfer?: (transfer: any) => void
  cancelTransfer?: (transfer: any) => void
  clearTransferHistory?: () => void
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
  openManagePanel?: (panel: string) => void
  openNoteDetail?: (note: any) => void
  openAddNoteDrawer?: () => void
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
  incomingTransfers: () => [],
  outgoingTransfers: () => [],
  transferSaving: false,
  transferError: '',
  transferSuccess: '',
  equippedWeaponActions: () => [],
  actionSpellCards: () => [],
  commonActionCards: () => [],
  displayedBonusActionCards: () => [],
  displayedReactionActionCards: () => []
})

const activePanelTab = ref('actions')
const activeActionFilter = ref('all')
const spellPanelSearch = ref('')
const inventoryPanelSearch = ref('')
const featurePanelSearch = ref('')
const notePanelSearch = ref('')

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


function panelSearchText(value: any): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(panelSearchText).join(' ')

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }

  return String(value)
}

function panelSearchMatches(values: any[], query: string) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true

  return values
    .map(panelSearchText)
    .join(' ')
    .toLowerCase()
    .includes(q)
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


function speciesCanUseResource(action: any) {
  return props.canUseSpeciesActionResource?.(action) ?? true
}

function speciesCanUndoResource(action: any) {
  const state = speciesResourceState(action)
  return Boolean(state && Number(state.used || 0) > 0)
}

function actionIcon(action: any) {
  if (action.kind === 'weapon') return 'i-lucide-swords'
  if (action.kind === 'spell-shortcut') return 'i-lucide-sparkles'
  if (action.kind === 'item') return 'i-lucide-box'
  if (action.filter === 'bonus') return 'i-lucide-flame'
  if (action.filter === 'reaction') return 'i-lucide-rotate-ccw'
  if (action.kind === 'resource') return 'i-lucide-diamond'
  return 'i-lucide-circle-dot'
}

const attackRows = computed(() => {
  const rows: any[] = []

  for (const weapon of props.equippedWeaponActions || []) {
    rows.push({
      id: `weapon-${weapon.id}`,
      kind: 'weapon',
      filter: 'attack',
      title: weapon.name || 'Attack',
      subtitle: weapon.itemType || 'Weapon',
      badge: 'Attack',
      range: weapon.range || weapon.reach || '—',
      hit: weapon.attackBonusText || '—',
      hitNote: weapon.attackFormula || '',
      damage: weapon.damage || '—',
      damageNote: weapon.damageFormula || '',
      notes: weapon.damageType || weapon.notes || weapon.description || '',
      raw: weapon
    })
  }

  for (const action of props.mainSpeciesActionCards || []) {
    if (!speciesCanAttack(action)) continue

    rows.push({
      id: `species-attack-${action.id || action.name}`,
      kind: 'species',
      filter: 'attack',
      title: action.name || 'Species Attack',
      subtitle: action.source || 'Species',
      badge: action.timing || action.actionKind || 'Attack',
      range: action.range || '—',
      hit: props.speciesActionAttackBonusText?.(action) || '—',
      hitNote: props.speciesActionAttackFormula?.(action) || '',
      damage: action.damage ? props.speciesActionDamageText?.(action) || action.damage : '—',
      damageNote: action.damage ? props.speciesActionDamageFormulaText?.(action) || '' : '',
      notes: action.detail || action.description || '',
      raw: action
    })
  }

  return rows
})

const actionRows = computed(() => {
  const rows: any[] = []

  if ((props.actionSpellCards || []).length) {
    rows.push({
      id: 'spell-shortcut-cast-a-spell',
      kind: 'spell-shortcut',
      filter: 'action',
      title: 'Cast a Spell',
      subtitle: 'Spellcasting',
      badge: 'Action',
      hit: '',
      damage: '',
      notes: 'Cast a prepared, known, cantrip, or feature-granted spell from the Spells panel.',
      raw: null
    })
  }

  for (const action of props.commonActionCards || []) {
    rows.push({
      id: `common-${action.name}`,
      kind: 'common',
      filter: 'action',
      title: action.name || 'Action',
      subtitle: 'Actions in Combat',
      badge: action.timing || 'Action',
      hit: '',
      damage: '',
      notes: action.detail || '',
      raw: action
    })
  }

  for (const action of props.mainSpeciesActionCards || []) {
    if (speciesCanAttack(action)) continue

    const key = timingFilter(action.timing || action.actionKind)
    if (key !== 'action') continue

    rows.push({
      id: `species-action-${action.id || action.name}`,
      kind: 'species',
      filter: 'action',
      title: action.name || 'Species Action',
      subtitle: action.source || 'Species',
      badge: action.timing || action.actionKind || 'Action',
      hit: '',
      damage: action.damage ? props.speciesActionDamageText?.(action) || action.damage : '',
      damageNote: action.damage ? props.speciesActionDamageFormulaText?.(action) || '' : '',
      notes: action.detail || action.description || '',
      raw: action
    })
  }

  for (const action of props.itemActionCards || []) {
    const key = action.timingKey || timingFilter(action.timing || action.actionKind)
    if (key !== 'action') continue

    rows.push({
      id: `item-action-${action.id || action.name}`,
      kind: 'item',
      filter: 'action',
      title: action.name || 'Item Action',
      subtitle: action.source || action.itemType || 'Item',
      badge: action.timing || action.actionKind || 'Action',
      hit: itemResourceState(action) ? itemResourceStatus(action) : '',
      hitNote: itemResourceState(action)?.reset || '',
      damage: '',
      notes: action.detail || action.description || '',
      raw: action
    })
  }

  return rows
})

const bonusRows = computed(() => {
  const rows: any[] = []

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

  for (const action of props.itemActionCards || []) {
    const key = action.timingKey || timingFilter(action.timing || action.actionKind)
    if (key !== 'bonus') continue

    rows.push({
      id: `item-bonus-${action.id || action.name}`,
      kind: 'item',
      filter: 'bonus',
      title: action.name || 'Item Action',
      subtitle: action.source || action.itemType || 'Item',
      badge: action.timing || action.actionKind || 'Bonus Action',
      hit: itemResourceState(action) ? itemResourceStatus(action) : '',
      hitNote: itemResourceState(action)?.reset || '',
      damage: '',
      notes: action.detail || action.description || '',
      raw: action
    })
  }

  return rows
})

const reactionRows = computed(() => {
  const rows: any[] = []

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

  for (const action of props.itemActionCards || []) {
    const key = action.timingKey || timingFilter(action.timing || action.actionKind)
    if (key !== 'reaction') continue

    rows.push({
      id: `item-reaction-${action.id || action.name}`,
      kind: 'item',
      filter: 'reaction',
      title: action.name || 'Item Reaction',
      subtitle: action.source || action.itemType || 'Item',
      badge: action.timing || action.actionKind || 'Reaction',
      hit: itemResourceState(action) ? itemResourceStatus(action) : '',
      hitNote: itemResourceState(action)?.reset || '',
      damage: '',
      notes: action.detail || action.description || '',
      raw: action
    })
  }

  return rows
})

const otherRows = computed(() => {
  const rows: any[] = []

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

  for (const action of props.itemActionCards || []) {
    const key = action.timingKey || timingFilter(action.timing || action.actionKind)
    if (['action', 'bonus', 'reaction'].includes(key)) continue

    rows.push({
      id: `item-other-${action.id || action.name}`,
      kind: 'item',
      filter: 'other',
      title: action.name || 'Item',
      subtitle: action.source || action.itemType || 'Item',
      badge: action.timing || action.actionKind || 'Other',
      hit: itemResourceState(action) ? itemResourceStatus(action) : '',
      hitNote: itemResourceState(action)?.reset || '',
      damage: '',
      notes: action.detail || action.description || '',
      raw: action
    })
  }

  return rows
})

const actionSectionMap = computed(() => ({
  attack: attackRows.value,
  action: actionRows.value,
  bonus: bonusRows.value,
  reaction: reactionRows.value,
  other: otherRows.value
}))

const allActionRows = computed(() => [
  ...attackRows.value,
  ...actionRows.value,
  ...bonusRows.value,
  ...reactionRows.value,
  ...otherRows.value
])

function countForFilter(key: string) {
  if (key === 'all') return allActionRows.value.length
  return (actionSectionMap.value as any)[key]?.length || 0
}

function shouldShowActionSection(key: string) {
  if (activeActionFilter.value === 'all') return true
  return activeActionFilter.value === key
}

function filterClass(key: string) {
  return activeActionFilter.value === key
    ? 'border-[rgba(201,164,90,0.68)] bg-[rgba(201,164,90,0.18)] text-[#fff7df]'
    : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.68)] text-[#d8ceb8] hover:border-[rgba(201,164,90,0.42)] hover:bg-[rgba(201,164,90,0.08)] hover:text-[#fff7df]'
}

const spellRows = computed(() => props.actionSpellCards || [])

const filteredSpellRows = computed(() =>
  spellRows.value.filter((spell: any) =>
    panelSearchMatches([
      spell?.title,
      spell?.name,
      spell?.summary,
      spell?.description,
      spell?.actionKind,
      spellLevel(spell),
      spellMechanic(spell)?.label,
      spellMechanic(spell)?.value,
      spellMechanic(spell)?.note
    ], spellPanelSearch.value)
  )
)

const inventoryRows = computed(() => props.inventoryItems || [])

const filteredInventoryRows = computed(() =>
  inventoryRows.value.filter((item: any) =>
    panelSearchMatches([
      item?.name,
      item?.itemType,
      item?.rarity,
      item?.description,
      item?.notes,
      item?.quantity ? `quantity ${item.quantity}` : '',
      item?.equipped ? 'equipped' : '',
      item?.attuned ? 'attuned' : '',
      item?.container,
      item?.profile,
      item?.detail
    ], inventoryPanelSearch.value)
  )
)

const featureRows = computed(() => props.featureCards || [])

const filteredFeatureRows = computed(() =>
  featureRows.value.filter((feature: any) =>
    panelSearchMatches([
      feature?.title,
      feature?.name,
      feature?.type,
      feature?.source,
      feature?.itemType,
      feature?.description,
      feature?.detail,
      feature?.summary,
      feature?.level,
      feature?.raw
    ], featurePanelSearch.value)
  )
)

const noteRows = computed(() => props.noteCards || [])

const filteredNoteRows = computed(() => {
  const q = notePanelSearch.value.trim().toLowerCase()
  const rows = noteRows.value || []

  if (!q) return rows

  return rows.filter((note: any) =>
    [
      note?.title,
      note?.body,
      note?.description,
      note?.tags,
      note?.category
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q)
  )
})


function normalizedTransferStatus(transfer: any) {
  return String(transfer?.status || '').trim().toLowerCase()
}

const pendingIncomingTransfers = computed(() =>
  (props.incomingTransfers || []).filter((transfer: any) => normalizedTransferStatus(transfer) === 'offered')
)

const pendingOutgoingTransfers = computed(() =>
  (props.outgoingTransfers || []).filter((transfer: any) => normalizedTransferStatus(transfer) === 'offered')
)

const recentTransfers = computed(() =>
  [...(props.incomingTransfers || []), ...(props.outgoingTransfers || [])]
    .filter((transfer: any) => normalizedTransferStatus(transfer) !== 'offered')
    .sort((a: any, b: any) =>
      String(b.completedAt || b.cancelledAt || b.declinedAt || b.updatedAt || b.createdAt || '')
        .localeCompare(String(a.completedAt || a.cancelledAt || a.declinedAt || a.updatedAt || a.createdAt || ''))
    )
    .slice(0, 6)
)

function transferQuantityLabel(transfer: any) {
  const qty = Number(transfer?.quantity || 1)
  return Number.isFinite(qty) && qty > 1 ? ` x${Math.floor(qty)}` : ''
}

function transferPartyLine(transfer: any) {
  if (transfer?.direction === 'incoming') {
    return `From ${transfer?.sourceName || 'another character'}`
  }

  if (transfer?.direction === 'outgoing') {
    return `To ${transfer?.targetName || 'another character'}`
  }

  return transfer?.targetName || transfer?.sourceName || ''
}

function transferStatusLabel(transfer: any) {
  const status = normalizedTransferStatus(transfer)
  if (status === 'offered') return 'Pending'
  if (status === 'completed') return 'Completed'
  if (status === 'declined') return 'Declined'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'granted') return 'Granted'
  return status || 'Transfer'
}

function transferStatusClass(transfer: any) {
  const status = normalizedTransferStatus(transfer)

  if (status === 'offered') return 'border-amber-300/25 bg-amber-400/10 text-amber-100'
  if (status === 'completed' || status === 'granted') return 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
  if (status === 'declined' || status === 'cancelled') return 'border-slate-300/20 bg-slate-400/10 text-slate-200'

  return 'border-[rgba(201,164,90,0.20)] bg-black/20 text-[#f5e7bd]'
}

function transferLockedReason(item: any) {
  if (item?.equipped === true || item?.equipped === 'true' || item?.equipped === 1 || item?.equipped === '1') {
    return 'Unequip before giving.'
  }

  return ''
}

function canGiveItem(item: any) {
  const qty = Number(item?.quantity || 1)
  return Number.isFinite(qty) && qty > 0 && !transferLockedReason(item)
}

function tabCount(key: string) {
  if (key === 'actions') return allActionRows.value.length
  if (key === 'spells') return spellRows.value.length
  if (key === 'inventory') return inventoryRows.value.length
  if (key === 'features') return featureRows.value.length
  if (key === 'notes') return noteRows.value.length
  return 0
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

function openManagePanel(panel: string) {
  props.openManagePanel?.(panel)
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
  <section data-sheet-action-center class="sheet-action-center eldra-codex-soft overflow-hidden rounded-none p-0">
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
              class="sheet-action-count-badge ml-1 rounded-none border px-1.5 py-0.5 text-[10px]"
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
      <div data-sheet-action-filterbar class="sheet-action-filterbar sticky top-0 z-10 -mx-4 -mt-4 border-b border-[rgba(201,164,90,0.12)] px-4 py-3">
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
              <span class="sheet-action-count-badge rounded-none border px-1.5 py-0.5 text-[10px]">
                {{ countForFilter(filter.key) }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div class="max-h-[560px] overflow-y-auto pr-1">
        <!-- ATTACK SECTION -->
        <section
          v-if="shouldShowActionSection('attack') && attackRows.length"
          class="border-b border-[rgba(201,164,90,0.16)] py-4 first:pt-0"
        >
          <div class="mb-2 flex items-center justify-between gap-3">
            <div class="text-xs font-semibold uppercase tracking-[0.18em] text-[#c9a45a]">
              Attacks
            </div>
            <div class="text-[10px] uppercase tracking-[0.16em] text-[#9f9278]">
              {{ attackRows.length }} attack{{ attackRows.length === 1 ? '' : 's' }}
            </div>
          </div>

          <div data-sheet-action-table class="sheet-action-table sheet-action-list-shell overflow-hidden border">
            <div data-sheet-action-table-header class="sheet-action-table-header hidden grid-cols-[minmax(170px,1.35fr)_72px_78px_92px_minmax(130px,1fr)] gap-3 border-b border-[rgba(201,164,90,0.18)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] xl:grid">
              <div>Attack</div>
              <div>Range</div>
              <div>Hit / DC</div>
              <div>Damage</div>
              <div>Notes</div>
            </div>

            <article
              v-for="action in attackRows"
              :key="action.id"
              class="border-b border-[rgba(201,164,90,0.10)] px-3 py-3 last:border-b-0 hover:bg-[rgba(201,164,90,0.06)]"
            >
              <div class="grid gap-3 xl:grid-cols-[minmax(170px,1.35fr)_72px_78px_92px_minmax(130px,1fr)] xl:items-center">
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

                <div class="text-xs font-semibold text-white">
                  <span class="xl:hidden text-[#9f9278]">Range: </span>{{ action.range || '—' }}
                </div>

                <div class="text-xs">
                  <div class="font-semibold text-white">{{ action.hit || '—' }}</div>
                  <div
                    v-if="action.hitNote"
                    class="mt-0.5 text-[10px] text-[#9f9278]"
                  >
                    {{ action.hitNote }}
                  </div>
                </div>

                <div class="text-xs">
                  <div class="font-semibold text-white">{{ action.damage || '—' }}</div>
                  <div
                    v-if="action.damageNote"
                    class="mt-0.5 text-[10px] text-[#9f9278]"
                  >
                    {{ action.damageNote }}
                  </div>
                </div>

                <div class="min-w-0 text-xs leading-5 text-[#9f9278]">
                  {{ short(action.notes, 120) }}
                </div>

                <div class="flex flex-wrap justify-start gap-2 xl:col-span-5 xl:justify-end">
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
                    v-if="action.kind === 'species'"
                    type="button"
                    class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
                    @click.stop="props.rollSpeciesActionAttack?.(action.raw)"
                  >
                    Hit
                  </button>

                  <button
                    v-if="action.kind === 'species' && action.raw?.damage"
                    type="button"
                    class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-1.5 text-xs font-semibold text-[#fff7df] disabled:opacity-45"
                    :disabled="speciesResourceState(action.raw) && !speciesCanUseResource(action.raw)"
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
                </div>
              </div>

              <div
                v-if="action.kind === 'species' && speciesResourceState(action.raw)"
                data-species-attack-resource-pips
                class="mt-3 rounded-none border border-emerald-400/20 bg-emerald-400/10 p-2"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-[10px] uppercase tracking-[0.18em] text-emerald-100">
                    {{ speciesResourceStatus(action.raw) }}
                  </span>
                  <span class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                    {{ speciesResourceState(action.raw)?.reset || 'Long Rest' }}
                  </span>
                </div>

                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    v-for="pipIndex in speciesResourcePips(action.raw)"
                    :key="`attack-species-resource-${action.id}-${pipIndex}`"
                    type="button"
                    class="rounded-full p-0.5 transition hover:scale-110 focus:outline-none focus:ring-1 focus:ring-emerald-200/50"
                    :title="speciesResourcePipTitle(action.raw, pipIndex)"
                    @click.stop="toggleSpeciesPip(action.raw, pipIndex)"
                  >
                    <span :class="speciesResourcePipClass(action.raw, pipIndex)" />
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>

        <!-- ACTION SECTION -->
        <section
          v-if="shouldShowActionSection('action') && actionRows.length"
          class="border-b border-[rgba(201,164,90,0.16)] py-4 first:pt-0"
        >
          <div class="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c9a45a]">
            Actions
          </div>

          <div class="space-y-3">
            <article
              v-for="action in actionRows"
              :key="action.id"
              class="border-l border-[rgba(201,164,90,0.26)] bg-[rgba(8,17,27,0.28)] px-3 py-2"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-white">{{ action.title }}</div>
                  <div class="mt-0.5 text-xs text-[#9f9278]">{{ action.subtitle }}</div>
                </div>

                <span class="sheet-action-badge rounded-none border px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
                  {{ action.badge }}
                </span>
              </div>

              <p
                v-if="action.notes"
                class="mt-2 text-xs leading-5 text-[#d8ceb8]"
              >
                {{ short(action.notes, 260) }}
              </p>

              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  v-if="action.kind === 'spell-shortcut'"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
                  @click="activePanelTab = 'spells'"
                >
                  Open Spells
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
            </article>
          </div>
        </section>

        <!-- BONUS SECTION -->
        <section
          v-if="shouldShowActionSection('bonus') && bonusRows.length"
          class="border-b border-[rgba(201,164,90,0.16)] py-4 first:pt-0"
        >
          <div class="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c9a45a]">
            Bonus Actions
          </div>

          <div class="space-y-3">
            <article
              v-for="action in bonusRows"
              :key="action.id"
              class="border-l border-[rgba(201,164,90,0.26)] bg-[rgba(8,17,27,0.28)] px-3 py-2"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div class="text-sm font-semibold text-white">{{ action.title }}</div>
                  <div class="mt-0.5 text-xs text-[#9f9278]">{{ action.subtitle }}</div>
                </div>

                <span class="sheet-action-badge rounded-none border px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
                  {{ action.badge }}
                </span>
              </div>

              <p
                v-if="action.notes"
                class="mt-2 text-xs leading-5 text-[#d8ceb8]"
              >
                {{ short(action.notes, 260) }}
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
                    :key="`bonus-item-resource-${action.id}-${pipIndex}`"
                    type="button"
                    class="p-0.5 transition hover:scale-110 focus:outline-none focus:ring-1 focus:ring-amber-200/50"
                    :title="itemResourcePipTitle(action.raw, pipIndex)"
                    @click.stop="toggleItemPip(action.raw, pipIndex)"
                  >
                    <span :class="itemResourcePipClass(action.raw, pipIndex)" />
                  </button>
                </div>
              </div>

              <div class="mt-3 flex flex-wrap gap-2">
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

                <button
                  v-if="action.kind === 'feature'"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.openFeatureDrawer?.(action.raw)"
                >
                  Details
                </button>
              </div>
            </article>
          </div>
        </section>

        <!-- REACTION SECTION -->
        <section
          v-if="shouldShowActionSection('reaction') && reactionRows.length"
          class="border-b border-[rgba(201,164,90,0.16)] py-4 first:pt-0"
        >
          <div class="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c9a45a]">
            Reactions
          </div>

          <div class="space-y-3">
            <article
              v-for="action in reactionRows"
              :key="action.id"
              class="border-l border-[rgba(201,164,90,0.26)] bg-[rgba(8,17,27,0.28)] px-3 py-2"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div class="text-sm font-semibold text-white">{{ action.title }}</div>
                  <div class="mt-0.5 text-xs text-[#9f9278]">{{ action.subtitle }}</div>
                </div>

                <span class="sheet-action-badge rounded-none border px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
                  {{ action.badge }}
                </span>
              </div>

              <p
                v-if="action.notes"
                class="mt-2 text-xs leading-5 text-[#d8ceb8]"
              >
                {{ short(action.notes, 260) }}
              </p>

              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  v-if="action.kind === 'item' && action.raw?.itemDetail"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.openItemDrawer?.(action.raw.itemDetail)"
                >
                  Details
                </button>

                <button
                  v-if="action.kind === 'feature'"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
                  @click.stop="props.openFeatureDrawer?.(action.raw)"
                >
                  Details
                </button>
              </div>
            </article>
          </div>
        </section>

        <!-- OTHER SECTION -->
        <section
          v-if="shouldShowActionSection('other') && otherRows.length"
          class="py-4 first:pt-0"
        >
          <div class="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c9a45a]">
            Other
          </div>

          <div class="space-y-3">
            <article
              v-for="action in otherRows"
              :key="action.id"
              class="border-l border-[rgba(201,164,90,0.26)] bg-[rgba(8,17,27,0.28)] px-3 py-2"
            >
              <div class="text-sm font-semibold text-white">{{ action.title }}</div>
              <div class="mt-0.5 text-xs text-[#9f9278]">{{ action.subtitle }}</div>
              <p
                v-if="action.notes"
                class="mt-2 text-xs leading-5 text-[#d8ceb8]"
              >
                {{ short(action.notes, 260) }}
              </p>
            </article>
          </div>
        </section>

        <div
          v-if="!countForFilter(activeActionFilter)"
          class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-5 text-sm text-[#9f9278]"
        >
          No actions match this filter.
        </div>
      </div>
    </div>

    <!-- SPELLS PANEL -->
    <div
      v-else-if="activePanelTab === 'spells'"
      class="max-h-[620px] overflow-y-auto p-4 pr-5"
    >
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Spells</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">Prepared, known, granted, and castable spells.</div>
        </div>

        <button
          type="button"
          class="eldra-button rounded-none px-3 py-2 text-xs font-semibold"
          @click="openManagePanel('spells')"
        >
          Manage Spells
        </button>
      </div>

      <label class="mb-4 block">
        <span class="mb-2 block text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Search Spells</span>
        <input
          v-model="spellPanelSearch"
          type="search"
          class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
          placeholder="Search spell name, level, save, attack, damage..."
        >
      </label>

      <div
        v-if="filteredSpellRows.length"
        class="sheet-action-list-shell overflow-hidden border"
      >
        <article
          v-for="spell in filteredSpellRows"
          :key="`inner-spell-${spell.id}`"
          class="border-b border-[rgba(201,164,90,0.10)] px-3 py-3 last:border-b-0 hover:bg-[rgba(201,164,90,0.06)]"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-white">{{ spell.title }}</div>
              <div class="mt-0.5 text-xs text-[#9f9278]">{{ spellLevel(spell) }}</div>
            </div>

            <span class="sheet-action-badge rounded-none border px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
              {{ spell.actionKind || 'Spell' }}
            </span>
          </div>

          <div class="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <div class="sheet-action-mechanic-card rounded-none border px-2 py-1.5 text-xs">
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
        v-else-if="spellRows.length"
        class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-5 text-sm text-[#9f9278]"
      >
        No spells match that search.
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
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Inventory</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">Carried gear, currency, equipment, and transfers.</div>
        </div>

        <button
          type="button"
          class="eldra-button rounded-none px-3 py-2 text-xs font-semibold"
          @click="openManagePanel('inventory')"
        >
          Manage Inventory
        </button>
      </div>

      <label class="mb-4 block">
        <span class="mb-2 block text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Search Inventory</span>
        <input
          v-model="inventoryPanelSearch"
          type="search"
          class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
          placeholder="Search item name, type, notes, equipped, attuned..."
        >
      </label>

      <div
        v-if="transferError"
        class="mb-3 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
      >
        {{ transferError }}
      </div>

      <div
        v-if="transferSuccess"
        class="mb-3 rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200"
      >
        {{ transferSuccess }}
      </div>

      <section
        v-if="pendingIncomingTransfers.length"
        class="mb-4 rounded-none border border-emerald-300/20 bg-emerald-400/10 p-3"
      >
        <div class="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
          Incoming Offers
        </div>

        <article
          v-for="transfer in pendingIncomingTransfers"
          :key="`incoming-transfer-${transfer.id}`"
          class="border-t border-emerald-300/14 py-3 first:border-t-0 first:pt-0 last:pb-0"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-white">
                {{ transfer.itemName }}{{ transferQuantityLabel(transfer) }}
              </div>
              <div class="mt-0.5 text-xs text-[#d8ceb8]">
                {{ transferPartyLine(transfer) }}
              </div>
              <p
                v-if="transfer.message"
                class="mt-1 text-xs leading-5 text-[#9f9278]"
              >
                {{ short(transfer.message, 160) }}
              </p>
            </div>

            <div class="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                class="rounded-none border border-emerald-300/24 bg-emerald-400/10 px-2 py-1.5 text-xs font-semibold text-emerald-100 disabled:opacity-50"
                :disabled="transferSaving"
                @click.stop="props.acceptTransfer?.(transfer)"
              >
                Accept
              </button>

              <button
                type="button"
                class="rounded-none border border-slate-300/20 bg-slate-400/10 px-2 py-1.5 text-xs font-semibold text-slate-100 disabled:opacity-50"
                :disabled="transferSaving"
                @click.stop="props.declineTransfer?.(transfer)"
              >
                Decline
              </button>
            </div>
          </div>
        </article>
      </section>

      <section
        v-if="pendingOutgoingTransfers.length"
        class="mb-4 rounded-none border border-amber-300/20 bg-amber-400/10 p-3"
      >
        <div class="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-100">
          Outgoing Offers
        </div>

        <article
          v-for="transfer in pendingOutgoingTransfers"
          :key="`outgoing-transfer-${transfer.id}`"
          class="border-t border-amber-300/14 py-3 first:border-t-0 first:pt-0 last:pb-0"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-white">
                {{ transfer.itemName }}{{ transferQuantityLabel(transfer) }}
              </div>
              <div class="mt-0.5 text-xs text-[#d8ceb8]">
                {{ transferPartyLine(transfer) }}
              </div>
              <p
                v-if="transfer.message"
                class="mt-1 text-xs leading-5 text-[#9f9278]"
              >
                {{ short(transfer.message, 160) }}
              </p>
            </div>

            <button
              type="button"
              class="shrink-0 rounded-none border border-amber-300/24 bg-amber-400/10 px-2 py-1.5 text-xs font-semibold text-amber-100 disabled:opacity-50"
              :disabled="transferSaving"
              @click.stop="props.cancelTransfer?.(transfer)"
            >
              Cancel
            </button>
          </div>
        </article>
      </section>

      <section
        v-if="recentTransfers.length"
        class="mb-4 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.34)] p-3"
      >
        <div class="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div class="text-xs font-semibold uppercase tracking-[0.22em] text-[#9f9278]">
            Recent Transfers
          </div>

          <button
            type="button"
            class="rounded-none border border-[rgba(148,163,184,0.24)] bg-[rgba(15,23,42,0.45)] px-2 py-1.5 text-xs font-semibold text-[#d8ceb8] disabled:opacity-50"
            :disabled="transferSaving"
            @click.stop="props.clearTransferHistory?.()"
          >
            Clear History
          </button>
        </div>

        <div class="grid gap-2">
          <div
            v-for="transfer in recentTransfers"
            :key="`recent-transfer-${transfer.id}`"
            class="sheet-action-transfer-row flex flex-wrap items-center justify-between gap-2 rounded-none border px-3 py-2 text-xs"
          >
            <div class="min-w-0">
              <span class="font-semibold text-white">{{ transfer.itemName }}{{ transferQuantityLabel(transfer) }}</span>
              <span class="ml-1 text-[#9f9278]">{{ transferPartyLine(transfer) }}</span>
            </div>

            <span
              class="rounded-none border px-2 py-1 text-[10px] uppercase tracking-[0.16em]"
              :class="transferStatusClass(transfer)"
            >
              {{ transferStatusLabel(transfer) }}
            </span>
          </div>
        </div>
      </section>

      <div
        v-if="filteredInventoryRows.length"
        class="sheet-action-list-shell overflow-hidden border"
      >
        <article
          v-for="item in filteredInventoryRows"
          :key="`inner-inventory-${item.inventoryId || item.id || item.name}`"
          class="border-b border-[rgba(201,164,90,0.10)] px-3 py-3 last:border-b-0 hover:bg-[rgba(201,164,90,0.06)]"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-white">{{ item.name }}</div>
              <div class="mt-0.5 text-xs text-[#9f9278]">{{ item.itemType || 'Item' }}</div>
            </div>

            <span class="sheet-action-badge rounded-none border px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
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
              v-if="canGiveItem(item) || transferLockedReason(item)"
              type="button"
              class="rounded-none border border-emerald-300/24 bg-emerald-400/10 px-2 py-1.5 text-xs font-semibold text-emerald-100 disabled:opacity-50"
              :disabled="transferSaving || Boolean(transferLockedReason(item))"
              :title="transferLockedReason(item) || 'Give this item to another character'"
              @click.stop="props.openTransferDrawer?.(item)"
            >
              {{ transferLockedReason(item) ? 'Equipped' : 'Give' }}
            </button>

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
        v-else-if="inventoryRows.length"
        class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-5 text-sm text-[#9f9278]"
      >
        No inventory items match that search.
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
      <label class="mb-4 block">
        <span class="mb-2 block text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Search Features</span>
        <input
          v-model="featurePanelSearch"
          type="search"
          class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
          placeholder="Search feature, trait, feat, level, source..."
        >
      </label>

      <div
        v-if="filteredFeatureRows.length"
        class="sheet-action-list-shell overflow-hidden border"
      >
        <article
          v-for="feature in filteredFeatureRows"
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
        v-else-if="featureRows.length"
        class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-5 text-sm text-[#9f9278]"
      >
        No features or traits match that search.
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

      <label class="mb-4 block">
        <span class="mb-2 block text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Search Notes</span>
        <input
          v-model="notePanelSearch"
          type="search"
          class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
          placeholder="Search NPC, city, quest, clue..."
        >
      </label>

      <div
        v-if="filteredNoteRows.length"
        class="sheet-action-list-shell overflow-hidden border"
      >
        <article
          v-for="note in filteredNoteRows"
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
        v-else-if="noteRows.length"
        class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-5 text-sm text-[#9f9278]"
      >
        No notes match that search.
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
