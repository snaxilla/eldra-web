<script setup lang="ts">
const props = withDefaults(defineProps<{
  worldId?: string | number
  entity?: any | null
  mode?: 'play' | 'build'
  allowEdit?: boolean
  variant?: 'drawer' | 'article'
  showGraph?: boolean
}>(), {
  worldId: '',
  entity: null,
  mode: 'play',
  allowEdit: false,
  variant: 'drawer',
  showGraph: false
})

const emit = defineEmits<{
  (event: 'openEntity', entity: any): void
}>()

const RELATIONSHIP_TYPES = [
  { value: 'friend', label: 'Friend', color: '#10b981' },
  { value: 'ally', label: 'Ally', color: '#22c55e' },
  { value: 'rival', label: 'Rival', color: '#f59e0b' },
  { value: 'enemy', label: 'Enemy', color: '#ef4444' },
  { value: 'family', label: 'Family', color: '#a78bfa' },
  { value: 'mentor', label: 'Mentor', color: '#c084fc' },
  { value: 'location', label: 'Location', color: '#38bdf8' },
  { value: 'faction', label: 'Faction', color: '#60a5fa' },
  { value: 'possession', label: 'Possession', color: '#c9a45a' },
  { value: 'quest', label: 'Quest', color: '#facc15' },
  { value: 'lore', label: 'Lore', color: '#eab308' },
  { value: 'related', label: 'Related', color: '#9f9278' }
]

const ATTITUDE_OPTIONS = [
  { value: 3, label: 'Devoted / Close Ally' },
  { value: 2, label: 'Friendly' },
  { value: 1, label: 'Positive' },
  { value: 0, label: 'Neutral' },
  { value: -1, label: 'Tense' },
  { value: -2, label: 'Rival' },
  { value: -3, label: 'Enemy' }
]

const VISIBILITY_OPTIONS = [
  { value: 'world', label: 'World' },
  { value: 'public', label: 'Public' },
  { value: 'gm', label: 'GM Only' },
  { value: 'private', label: 'Private' }
]

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const success = ref('')

const payload = ref<any>({
  relationships: [],
  outgoing: [],
  incoming: [],
  schemaMissing: false
})

const activeView = ref<'list' | 'web'>('list')
const addOpen = ref(false)
const editingId = ref<string>('')

const targetSearch = ref('')
const targetSuggestions = ref<any[]>([])
const selectedTarget = ref<any | null>(null)
let targetSearchTimer: ReturnType<typeof setTimeout> | null = null

const relationshipFilter = ref('all')
const attitudeFilter = ref('all')
const directionFilter = ref('all')
const visibilityFilter = ref('all')
const relationshipSearch = ref('')

const form = reactive({
  relationshipType: 'related',
  label: 'related to',
  inverseLabel: '',
  strength: 0,
  visibility: 'world',
  status: 'active',
  summary: ''
})

const editForm = reactive({
  relationshipType: 'related',
  label: 'related to',
  inverseLabel: '',
  strength: 0,
  visibility: 'world',
  status: 'active',
  summary: ''
})

const entityId = computed(() =>
  String(
    props.entity?.id ??
    props.entity?.entityId ??
    props.entity?.entity_id ??
    ''
  ).trim().replace(/^entity:/i, '')
)

const entityTitle = computed(() =>
  String(props.entity?.title || props.entity?.name || 'Current Entity')
)

const isArticleVariant = computed(() => props.variant === 'article')
const isDrawerVariant = computed(() => props.variant === 'drawer')

const canEdit = computed(() =>
  isArticleVariant.value &&
  props.mode === 'build' &&
  props.allowEdit === true
)

const relationships = computed(() =>
  Array.isArray(payload.value?.relationships) ? payload.value.relationships : []
)

const sortedRelationships = computed(() =>
  [...relationships.value].sort((a: any, b: any) => {
    const sortA = Number(a?.sort || 100)
    const sortB = Number(b?.sort || 100)
    if (sortA !== sortB) return sortA - sortB

    return relationshipOtherTitle(a).localeCompare(relationshipOtherTitle(b))
  })
)

const hasRelationships = computed(() => sortedRelationships.value.length > 0)

const filteredRelationships = computed(() => {
  const q = relationshipSearch.value.trim().toLowerCase()

  return sortedRelationships.value
    .filter((relationship: any) =>
      relationshipFilter.value === 'all' ||
      String(relationship?.relationshipType || 'related').toLowerCase() === relationshipFilter.value
    )
    .filter((relationship: any) =>
      directionFilter.value === 'all' ||
      String(relationship?.direction || '').toLowerCase() === directionFilter.value
    )
    .filter((relationship: any) =>
      visibilityFilter.value === 'all' ||
      String(relationship?.visibility || 'world').toLowerCase() === visibilityFilter.value
    )
    .filter((relationship: any) => {
      if (attitudeFilter.value === 'all') return true
      if (attitudeFilter.value === 'positive') return Number(relationship?.strength || 0) > 0
      if (attitudeFilter.value === 'neutral') return Number(relationship?.strength || 0) === 0
      if (attitudeFilter.value === 'negative') return Number(relationship?.strength || 0) < 0
      return true
    })
    .filter((relationship: any) => {
      if (!q) return true

      return [
        relationshipOtherTitle(relationship),
        relationshipOtherType(relationship),
        relationship?.relationshipType,
        relationship?.label,
        relationship?.inverseLabel,
        relationship?.displayLabel,
        relationship?.summary,
        relationship?.notes,
        relationship?.visibility,
        relationship?.direction,
        attitudeLabel(relationship)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
})

const drawerRelationships = computed(() => filteredRelationships.value.slice(0, 6))
const displayedRelationships = computed(() =>
  isDrawerVariant.value ? drawerRelationships.value : filteredRelationships.value
)

const graphRelationships = computed(() =>
  filteredRelationships.value.filter((relationship: any) => relationship?.other)
)

const graphNodes = computed(() => {
  const rows = graphRelationships.value
  const count = Math.max(rows.length, 1)
  const centerX = 340
  const centerY = 250
  const radiusX = 230
  const radiusY = 150

  return rows.map((relationship: any, index: number) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2
    return {
      relationship,
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY
    }
  })
})

const relationshipTypeOptions = computed(() => {
  const counts = new Map<string, number>()

  for (const relationship of sortedRelationships.value) {
    const key = String(relationship?.relationshipType || 'related').toLowerCase()
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  return [
    { key: 'all', label: 'All', count: sortedRelationships.value.length },
    ...RELATIONSHIP_TYPES
      .filter((type) => counts.has(type.value))
      .map((type) => ({
        key: type.value,
        label: type.label,
        count: counts.get(type.value) || 0
      }))
  ]
})

const directionOptions = computed(() => {
  const counts = new Map<string, number>()

  for (const relationship of sortedRelationships.value) {
    const key = String(relationship?.direction || 'neutral').toLowerCase()
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  return [
    { key: 'all', label: 'Any Direction', count: sortedRelationships.value.length },
    { key: 'outgoing', label: 'Outgoing', count: counts.get('outgoing') || 0 },
    { key: 'incoming', label: 'Incoming', count: counts.get('incoming') || 0 },
    { key: 'neutral', label: 'Neutral', count: counts.get('neutral') || 0 }
  ].filter((option) => option.key === 'all' || option.count > 0)
})

const attitudeOptions = computed(() => {
  const positive = sortedRelationships.value.filter((relationship: any) => Number(relationship?.strength || 0) > 0).length
  const neutral = sortedRelationships.value.filter((relationship: any) => Number(relationship?.strength || 0) === 0).length
  const negative = sortedRelationships.value.filter((relationship: any) => Number(relationship?.strength || 0) < 0).length

  return [
    { key: 'all', label: 'Any Attitude', count: sortedRelationships.value.length },
    { key: 'positive', label: 'Positive', count: positive },
    { key: 'neutral', label: 'Neutral', count: neutral },
    { key: 'negative', label: 'Negative', count: negative }
  ].filter((option) => option.key === 'all' || option.count > 0)
})

const visibilityOptions = computed(() => {
  const counts = new Map<string, number>()

  for (const relationship of sortedRelationships.value) {
    const key = String(relationship?.visibility || 'world').toLowerCase()
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  return [
    { key: 'all', label: 'Any Visibility', count: sortedRelationships.value.length },
    ...VISIBILITY_OPTIONS
      .filter((option) => counts.has(option.value))
      .map((option) => ({
        key: option.value,
        label: option.label,
        count: counts.get(option.value) || 0
      }))
  ]
})

function numericEntityId(value: any) {
  const raw = String(
    value?.id ??
    value?.entityId ??
    value?.entity_id ??
    value?.targetId ??
    ''
  ).trim().replace(/^entity:/i, '')

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? String(Math.floor(parsed)) : ''
}

function resetForm() {
  targetSearch.value = ''
  targetSuggestions.value = []
  selectedTarget.value = null
  form.relationshipType = 'related'
  form.label = 'related to'
  form.inverseLabel = ''
  form.strength = 0
  form.visibility = 'world'
  form.status = 'active'
  form.summary = ''
  error.value = ''
  success.value = ''
}

function typeMeta(value: any) {
  const key = String(value || 'related').trim().toLowerCase()
  return RELATIONSHIP_TYPES.find((item) => item.value === key) || RELATIONSHIP_TYPES[RELATIONSHIP_TYPES.length - 1]
}

function typeLabel(value: any) {
  return typeMeta(value).label
}

function typeColor(value: any) {
  return typeMeta(value).color
}

function visibilityLabel(value: any) {
  const key = String(value || 'world').trim().toLowerCase()
  return VISIBILITY_OPTIONS.find((item) => item.value === key)?.label || 'World'
}

function relationshipColor(relationship: any) {
  const strength = Number(relationship?.strength || 0)

  if (strength > 0) return '#10b981'
  if (strength < 0) return '#ef4444'

  return typeColor(relationship?.relationshipType)
}

function attitudeLabel(relationship: any) {
  const strength = Number(relationship?.strength || 0)
  const found = ATTITUDE_OPTIONS.find((item) => Number(item.value) === strength)
  return found?.label || 'Neutral'
}

function attitudeDotClass(relationship: any) {
  const strength = Number(relationship?.strength || 0)

  if (strength > 0) return 'bg-emerald-400'
  if (strength < 0) return 'bg-red-400'

  return 'bg-[#c9a45a]'
}

function relationshipDirectionLabel(relationship: any) {
  if (relationship?.direction === 'incoming') return 'Incoming'
  if (relationship?.direction === 'outgoing') return 'Outgoing'
  return 'Relationship'
}

function relationshipOtherTitle(relationship: any) {
  return String(relationship?.other?.title || relationship?.other?.name || 'Unknown Entity')
}

function relationshipOtherType(relationship: any) {
  return String(relationship?.other?.entityType || relationship?.other?.entity_type || 'entity')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function initialsFor(value: any) {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  return words.length
    ? words.map((word) => word[0]?.toUpperCase() || '').join('')
    : '?'
}

function relationshipDisplayLine(relationship: any) {
  return `${relationship.displayLabel || relationship.label || 'related to'} → ${relationshipOtherTitle(relationship)}`
}

function resetFilters() {
  relationshipFilter.value = 'all'
  directionFilter.value = 'all'
  attitudeFilter.value = 'all'
  visibilityFilter.value = 'all'
  relationshipSearch.value = ''
}

function presetRelationship(type: string) {
  const key = String(type || 'related').toLowerCase()
  form.relationshipType = key

  const presets: Record<string, any> = {
    friend: { label: 'friend of', inverseLabel: 'friend of', strength: 2 },
    ally: { label: 'ally of', inverseLabel: 'ally of', strength: 2 },
    rival: { label: 'rival of', inverseLabel: 'rival of', strength: -2 },
    enemy: { label: 'enemy of', inverseLabel: 'enemy of', strength: -3 },
    family: { label: 'family of', inverseLabel: 'family of', strength: 2 },
    mentor: { label: 'mentor of', inverseLabel: 'student of', strength: 2 },
    location: { label: 'lives in', inverseLabel: 'resident', strength: 0 },
    faction: { label: 'member of', inverseLabel: 'has member', strength: 1 },
    possession: { label: 'owns', inverseLabel: 'owned by', strength: 0 },
    quest: { label: 'connected to', inverseLabel: 'connected to', strength: 0 },
    lore: { label: 'linked to', inverseLabel: 'linked to', strength: 0 },
    related: { label: 'related to', inverseLabel: 'related to', strength: 0 }
  }

  const preset = presets[key] || presets.related
  form.label = preset.label
  form.inverseLabel = preset.inverseLabel
  form.strength = preset.strength
}

function beginEdit(relationship: any) {
  editingId.value = String(relationship?.id || '')
  editForm.relationshipType = String(relationship?.relationshipType || 'related')
  editForm.label = String(relationship?.label || 'related to')
  editForm.inverseLabel = String(relationship?.inverseLabel || '')
  editForm.strength = Number(relationship?.strength || 0)
  editForm.visibility = String(relationship?.visibility || 'world')
  editForm.status = String(relationship?.status || 'active')
  editForm.summary = String(relationship?.summary || '')
}

function cancelEdit() {
  editingId.value = ''
}

async function loadRelationships() {
  if (!props.worldId || !entityId.value) {
    payload.value = {
      relationships: [],
      outgoing: [],
      incoming: [],
      schemaMissing: false
    }
    return
  }

  loading.value = true
  error.value = ''

  try {
    payload.value = await $fetch(`/api/worlds/${props.worldId}/relationships`, {
      query: {
        entityId: entityId.value
      }
    })
  } catch (err: any) {
    error.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to load relationships.'

    payload.value = {
      relationships: [],
      outgoing: [],
      incoming: [],
      schemaMissing: false
    }
  } finally {
    loading.value = false
  }
}

async function searchTargetsNow() {
  const q = targetSearch.value.trim()

  if (!q || !props.worldId) {
    targetSuggestions.value = []
    return
  }

  try {
    const res: any = await $fetch(`/api/worlds/${props.worldId}/relationships/targets`, {
      query: {
        q,
        excludeEntityId: entityId.value,
        limit: 16
      }
    })

    const list = Array.isArray(res?.targets)
      ? res.targets
      : Array.isArray(res)
        ? res
        : []

    const currentId = entityId.value

    targetSuggestions.value = list
      .map((item: any) => {
        const id = numericEntityId(item)

        return {
          ...item,
          id,
          title: String(item?.title || item?.name || item?.label || 'Untitled'),
          entityType: String(item?.entityType || item?.entity_type || item?.type || 'Entity')
        }
      })
      .filter((item: any) => item.id && String(item.id) !== String(currentId))
      .slice(0, 16)
  } catch {
    targetSuggestions.value = []
  }
}

function queueTargetSearch() {
  if (targetSearchTimer) clearTimeout(targetSearchTimer)

  targetSearchTimer = setTimeout(() => {
    void searchTargetsNow()
  }, 180)
}

function selectTarget(target: any) {
  selectedTarget.value = target
  targetSearch.value = target.title || target.name || ''
  targetSuggestions.value = []
}

async function createRelationship() {
  if (!canEdit.value || !entityId.value || !selectedTarget.value) return

  saving.value = true
  error.value = ''
  success.value = ''

  try {
    await $fetch(`/api/worlds/${props.worldId}/relationships`, {
      method: 'POST',
      body: {
        sourceEntityId: entityId.value,
        targetEntityId: numericEntityId(selectedTarget.value),
        relationshipType: form.relationshipType,
        label: form.label,
        inverseLabel: form.inverseLabel,
        strength: form.strength,
        visibility: form.visibility,
        status: form.status,
        summary: form.summary
      }
    })

    success.value = 'Relationship added.'
    resetForm()
    addOpen.value = false
    await loadRelationships()
  } catch (err: any) {
    error.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to add relationship.'
  } finally {
    saving.value = false
  }
}

async function saveEdit(relationship: any) {
  if (!canEdit.value || !relationship?.id) return

  saving.value = true
  error.value = ''
  success.value = ''

  try {
    await $fetch(`/api/worlds/${props.worldId}/relationships/${relationship.id}`, {
      method: 'PATCH',
      body: {
        relationshipType: editForm.relationshipType,
        label: editForm.label,
        inverseLabel: editForm.inverseLabel,
        strength: editForm.strength,
        visibility: editForm.visibility,
        status: editForm.status,
        summary: editForm.summary
      }
    })

    success.value = 'Relationship updated.'
    editingId.value = ''
    await loadRelationships()
  } catch (err: any) {
    error.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to update relationship.'
  } finally {
    saving.value = false
  }
}

async function deleteRelationship(relationship: any) {
  if (!canEdit.value || !relationship?.id) return

  saving.value = true
  error.value = ''
  success.value = ''

  try {
    await $fetch(`/api/worlds/${props.worldId}/relationships/${relationship.id}`, {
      method: 'DELETE'
    })

    success.value = 'Relationship removed.'
    if (String(editingId.value) === String(relationship.id)) editingId.value = ''
    await loadRelationships()
  } catch (err: any) {
    error.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to remove relationship.'
  } finally {
    saving.value = false
  }
}

function openRelationshipEntity(relationship: any) {
  if (relationship?.other) {
    emit('openEntity', relationship.other)
  }
}

watch(
  [() => props.worldId, entityId],
  () => {
    void loadRelationships()
  },
  { immediate: true }
)

watch(targetSearch, queueTargetSearch)

watch(relationships, () => {
  if (!relationships.value.length) {
    resetFilters()
  }
})

onBeforeUnmount(() => {
  if (targetSearchTimer) clearTimeout(targetSearchTimer)
})
</script>

<template>
  <section
    class="relationship-panel rounded-none"
    :class="isArticleVariant
      ? 'eldra-ornate-panel eldra-frame-corners border p-5'
      : 'eldra-codex-soft mt-5 p-4'"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Relationships
        </div>

        <h3
          v-if="isArticleVariant"
          class="mt-2 text-2xl font-semibold text-white"
        >
          Relationship Web
        </h3>

        <p class="mt-1 text-sm leading-6 text-[#d8ceb8]">
          People, places, factions, items, and story links.
          <span v-if="hasRelationships" class="text-[#9f9278]">
            {{ filteredRelationships.length }} shown / {{ sortedRelationships.length }} total.
          </span>
        </p>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2">
        <div
          v-if="isArticleVariant && showGraph"
          class="inline-flex overflow-hidden rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(8,17,27,0.42)]"
        >
          <button
            type="button"
            class="px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition"
            :class="activeView === 'list'
              ? 'bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
              : 'text-[#b5a88d] hover:bg-[rgba(201,164,90,0.08)] hover:text-[#fff7df]'"
            @click="activeView = 'list'"
          >
            List
          </button>

          <button
            type="button"
            class="border-l border-[rgba(201,164,90,0.14)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition"
            :class="activeView === 'web'
              ? 'bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
              : 'text-[#b5a88d] hover:bg-[rgba(201,164,90,0.08)] hover:text-[#fff7df]'"
            @click="activeView = 'web'"
          >
            Web
          </button>
        </div>

        <button
          v-if="canEdit && !payload?.schemaMissing"
          type="button"
          class="rounded-none border border-[rgba(201,164,90,0.28)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#fff7df] transition hover:border-[rgba(201,164,90,0.54)] hover:bg-[rgba(201,164,90,0.16)]"
          @click="addOpen = !addOpen"
        >
          {{ addOpen ? 'Cancel Add' : 'Add Relationship' }}
        </button>
      </div>
    </div>

    <div
      v-if="payload?.schemaMissing"
      class="mt-4 rounded-none border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100"
    >
      Relationship schema is not installed yet.
    </div>

    <div
      v-if="error"
      class="mt-4 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-xs leading-5 text-red-200"
    >
      {{ error }}
    </div>

    <div
      v-if="success"
      class="mt-4 rounded-none border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs leading-5 text-emerald-100"
    >
      {{ success }}
    </div>

    <div
      v-if="addOpen && canEdit && !payload?.schemaMissing"
      class="mt-5 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.38)] p-4"
    >
      <div class="flex flex-wrap gap-2">
        <button
          v-for="type in RELATIONSHIP_TYPES"
          :key="type.value"
          type="button"
          class="rounded-none border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition"
          :class="form.relationshipType === type.value
            ? 'border-[rgba(201,164,90,0.62)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
            : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.42)] text-[#b5a88d] hover:border-[rgba(201,164,90,0.36)] hover:text-[#fff7df]'"
          @click="presetRelationship(type.value)"
        >
          {{ type.label }}
        </button>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">
            Target Entity
          </span>

          <input
            v-model="targetSearch"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            placeholder="Search NPC, location, item, faction..."
          >

          <div
            v-if="targetSuggestions.length"
            class="mt-2 overflow-hidden rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(5,8,12,0.96)]"
          >
            <button
              v-for="target in targetSuggestions"
              :key="target.id"
              type="button"
              class="flex w-full items-center justify-between gap-3 border-b border-[rgba(201,164,90,0.10)] px-3 py-2 text-left last:border-b-0 hover:bg-[rgba(201,164,90,0.08)]"
              @click="selectTarget(target)"
            >
              <span>
                <span class="block text-sm font-semibold text-white">{{ target.title }}</span>
                <span class="block text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">{{ target.entityType }}</span>
              </span>
            </button>
          </div>

          <div
            v-if="selectedTarget"
            class="mt-2 rounded-none border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100"
          >
            Selected: {{ selectedTarget.title }}
          </div>
        </label>

        <div class="grid gap-3 sm:grid-cols-2">
          <label>
            <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Attitude</span>
            <select
              v-model.number="form.strength"
              class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            >
              <option
                v-for="option in ATTITUDE_OPTIONS"
                :key="option.value"
                :value="option.value"
                class="bg-[#090909] text-[#f5e7bd]"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <label>
            <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Visibility</span>
            <select
              v-model="form.visibility"
              class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            >
              <option
                v-for="option in VISIBILITY_OPTIONS"
                :key="option.value"
                :value="option.value"
                class="bg-[#090909] text-[#f5e7bd]"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <label>
            <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Label</span>
            <input
              v-model="form.label"
              class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
              placeholder="friend of, lives in, owns..."
            >
          </label>

          <label>
            <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Reverse Label</span>
            <input
              v-model="form.inverseLabel"
              class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
              placeholder="friend of, resident, owned by..."
            >
          </label>
        </div>
      </div>

      <label class="mt-4 block">
        <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Summary</span>
        <textarea
          v-model="form.summary"
          rows="3"
          class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
          placeholder="Why does this relationship matter?"
        />
      </label>

      <div class="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          class="rounded-none border border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.42)] px-4 py-2 text-sm font-semibold text-[#d8ceb8]"
          @click="resetForm"
        >
          Reset
        </button>

        <button
          type="button"
          class="eldra-button rounded-none px-4 py-2 text-sm font-semibold disabled:opacity-50"
          :disabled="saving || !selectedTarget"
          @click="createRelationship"
        >
          {{ saving ? 'Saving...' : 'Create Relationship' }}
        </button>
      </div>
    </div>

    <div
      v-if="isArticleVariant && hasRelationships"
      class="mt-5 space-y-3"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <input
          v-model="relationshipSearch"
          type="text"
          class="eldra-input min-w-[240px] flex-1 rounded-none px-3 py-2 text-sm text-white"
          placeholder="Search relationships..."
        >

        <button
          type="button"
          class="rounded-none border border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.42)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#b5a88d] transition hover:border-[rgba(201,164,90,0.36)] hover:text-[#fff7df]"
          @click="resetFilters"
        >
          Clear Filters
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="option in relationshipTypeOptions"
          :key="option.key"
          type="button"
          class="rounded-none border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition"
          :class="relationshipFilter === option.key
            ? 'border-[rgba(201,164,90,0.62)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
            : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.42)] text-[#b5a88d] hover:border-[rgba(201,164,90,0.36)] hover:text-[#fff7df]'"
          @click="relationshipFilter = option.key"
        >
          {{ option.label }}
          <span class="ml-1 opacity-70">{{ option.count }}</span>
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="option in attitudeOptions"
          :key="option.key"
          type="button"
          class="rounded-none border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition"
          :class="attitudeFilter === option.key
            ? 'border-[rgba(201,164,90,0.62)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
            : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.42)] text-[#b5a88d] hover:border-[rgba(201,164,90,0.36)] hover:text-[#fff7df]'"
          @click="attitudeFilter = option.key"
        >
          {{ option.label }}
          <span class="ml-1 opacity-70">{{ option.count }}</span>
        </button>

        <button
          v-for="option in directionOptions"
          :key="`direction-${option.key}`"
          type="button"
          class="rounded-none border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition"
          :class="directionFilter === option.key
            ? 'border-[rgba(201,164,90,0.62)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
            : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.42)] text-[#b5a88d] hover:border-[rgba(201,164,90,0.36)] hover:text-[#fff7df]'"
          @click="directionFilter = option.key"
        >
          {{ option.label }}
          <span class="ml-1 opacity-70">{{ option.count }}</span>
        </button>

        <button
          v-for="option in visibilityOptions"
          :key="`visibility-${option.key}`"
          type="button"
          class="rounded-none border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition"
          :class="visibilityFilter === option.key
            ? 'border-[rgba(201,164,90,0.62)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
            : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.42)] text-[#b5a88d] hover:border-[rgba(201,164,90,0.36)] hover:text-[#fff7df]'"
          @click="visibilityFilter = option.key"
        >
          {{ option.label }}
          <span class="ml-1 opacity-70">{{ option.count }}</span>
        </button>
      </div>
    </div>

    <div
      v-if="loading"
      class="mt-5 rounded-none border border-[rgba(201,164,90,0.14)] p-4 text-sm text-[#9f9278]"
    >
      Loading relationships...
    </div>

    <template v-else>
      <div
        v-if="!hasRelationships && !payload?.schemaMissing"
        class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-5 text-sm leading-7 text-[#9f9278]"
      >
        No relationships yet.
        <span v-if="canEdit">Add one to start building this entity's web.</span>
      </div>

      <div
        v-else-if="activeView === 'web' && isArticleVariant && showGraph"
        class="mt-5 overflow-hidden rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.28)]"
      >
        <div class="relative h-[520px] min-w-[680px]">
          <svg
            viewBox="0 0 680 500"
            class="h-full w-full"
            role="img"
            :aria-label="`Relationship web for ${entityTitle}`"
          >
            <line
              v-for="node in graphNodes"
              :key="`line-${node.relationship.id}`"
              :x1="340"
              :y1="250"
              :x2="node.x"
              :y2="node.y"
              :stroke="relationshipColor(node.relationship)"
              stroke-width="3"
              stroke-opacity="0.72"
            />

            <circle
              cx="340"
              cy="250"
              r="54"
              fill="rgba(20,17,12,0.92)"
              stroke="rgba(201,164,90,0.72)"
              stroke-width="2"
            />

            <text
              x="340"
              y="245"
              text-anchor="middle"
              class="fill-white text-sm font-semibold"
            >
              {{ entityTitle.slice(0, 22) }}
            </text>

            <text
              x="340"
              y="266"
              text-anchor="middle"
              class="fill-[#9f9278] text-[10px] uppercase tracking-[0.18em]"
            >
              Current
            </text>

            <g
              v-for="node in graphNodes"
              :key="`node-${node.relationship.id}`"
              class="cursor-pointer"
              @click="openRelationshipEntity(node.relationship)"
            >
              <circle
                :cx="node.x"
                :cy="node.y"
                r="42"
                fill="rgba(8,17,27,0.92)"
                :stroke="relationshipColor(node.relationship)"
                stroke-width="2"
              />

              <text
                :x="node.x"
                :y="node.y + 4"
                text-anchor="middle"
                class="fill-white text-sm font-semibold"
              >
                {{ initialsFor(relationshipOtherTitle(node.relationship)) }}
              </text>

              <text
                :x="node.x"
                :y="node.y + 62"
                text-anchor="middle"
                class="fill-[#d8ceb8] text-xs font-semibold"
              >
                {{ relationshipOtherTitle(node.relationship).slice(0, 24) }}
              </text>

              <text
                :x="node.x"
                :y="node.y + 78"
                text-anchor="middle"
                class="fill-[#9f9278] text-[10px] uppercase tracking-[0.16em]"
              >
                {{ typeLabel(node.relationship.relationshipType) }}
              </text>
            </g>
          </svg>
        </div>
      </div>

      <div
        v-else
        class="mt-5 overflow-hidden rounded-none border border-[rgba(201,164,90,0.18)]"
        :class="isDrawerVariant ? 'divide-y divide-[rgba(201,164,90,0.10)]' : ''"
      >
        <div
          v-if="!displayedRelationships.length"
          class="p-5 text-sm text-[#9f9278]"
        >
          No relationships match the current filters.
        </div>

        <article
          v-for="relationship in displayedRelationships"
          :key="relationship.id"
          class="relationship-row border-b border-[rgba(201,164,90,0.10)] bg-[rgba(8,17,27,0.28)] p-4 last:border-b-0"
        >
          <div
            v-if="String(editingId) !== String(relationship.id)"
            class="grid gap-4"
            :class="isArticleVariant ? 'lg:grid-cols-[minmax(180px,0.65fr)_minmax(0,1.35fr)_160px_160px]' : ''"
          >
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="inline-block h-2.5 w-2.5 rounded-full"
                  :style="{ backgroundColor: relationshipColor(relationship) }"
                />

                <span class="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9f9278]">
                  {{ relationshipDirectionLabel(relationship) }} · {{ typeLabel(relationship.relationshipType) }}
                </span>
              </div>

              <div class="mt-2 text-sm font-semibold text-white">
                {{ relationship.displayLabel || relationship.label || 'related to' }}
              </div>

              <div class="mt-1 text-xs text-[#9f9278]">
                Reverse: {{ relationship.inverseLabel || relationship.label || 'related to' }}
              </div>
            </div>

            <button
              type="button"
              class="min-w-0 text-left"
              @click="openRelationshipEntity(relationship)"
            >
              <div class="text-base font-semibold text-white">
                {{ relationshipOtherTitle(relationship) }}
              </div>

              <div class="mt-1 text-[10px] uppercase tracking-[0.2em] text-[#9f9278]">
                {{ relationshipOtherType(relationship) }}
              </div>

              <p
                v-if="relationship.summary"
                class="mt-2 text-sm leading-6 text-[#d8ceb8]"
              >
                {{ relationship.summary }}
              </p>
            </button>

            <div class="flex items-center gap-2">
              <span
                class="h-3 w-3 rounded-full"
                :class="attitudeDotClass(relationship)"
              />
              <span class="text-sm text-[#d8ceb8]">{{ attitudeLabel(relationship) }}</span>
            </div>

            <div class="flex flex-wrap items-start gap-2">
              <span class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d8ceb8]">
                {{ visibilityLabel(relationship.visibility) }}
              </span>

              <button
                v-if="isArticleVariant"
                type="button"
                class="rounded-none border border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.42)] px-2 py-1.5 text-xs font-semibold text-[#d8ceb8] transition hover:border-[rgba(201,164,90,0.36)] hover:text-[#fff7df]"
                @click="openRelationshipEntity(relationship)"
              >
                Details
              </button>

              <button
                v-if="canEdit"
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
                @click="beginEdit(relationship)"
              >
                Edit
              </button>

              <button
                v-if="canEdit"
                type="button"
                class="rounded-none border border-red-400/24 bg-red-500/10 px-2 py-1.5 text-xs font-semibold text-red-100 disabled:opacity-50"
                :disabled="saving"
                @click="deleteRelationship(relationship)"
              >
                Delete
              </button>
            </div>
          </div>

          <div
            v-else
            class="grid gap-4 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(4,8,14,0.48)] p-4"
          >
            <div class="grid gap-3 md:grid-cols-2">
              <label>
                <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Type</span>
                <select
                  v-model="editForm.relationshipType"
                  class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                >
                  <option
                    v-for="type in RELATIONSHIP_TYPES"
                    :key="type.value"
                    :value="type.value"
                    class="bg-[#090909] text-[#f5e7bd]"
                  >
                    {{ type.label }}
                  </option>
                </select>
              </label>

              <label>
                <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Visibility</span>
                <select
                  v-model="editForm.visibility"
                  class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                >
                  <option
                    v-for="option in VISIBILITY_OPTIONS"
                    :key="option.value"
                    :value="option.value"
                    class="bg-[#090909] text-[#f5e7bd]"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </label>

              <label>
                <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Label</span>
                <input
                  v-model="editForm.label"
                  class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                >
              </label>

              <label>
                <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Reverse Label</span>
                <input
                  v-model="editForm.inverseLabel"
                  class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                >
              </label>

              <label>
                <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Attitude</span>
                <select
                  v-model.number="editForm.strength"
                  class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                >
                  <option
                    v-for="option in ATTITUDE_OPTIONS"
                    :key="option.value"
                    :value="option.value"
                    class="bg-[#090909] text-[#f5e7bd]"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </label>

              <label>
                <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Status</span>
                <input
                  v-model="editForm.status"
                  class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                >
              </label>
            </div>

            <label>
              <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Summary</span>
              <textarea
                v-model="editForm.summary"
                rows="3"
                class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
              />
            </label>

            <div class="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                class="rounded-none border border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.42)] px-3 py-2 text-sm font-semibold text-[#d8ceb8]"
                @click="cancelEdit"
              >
                Cancel
              </button>

              <button
                type="button"
                class="eldra-button rounded-none px-3 py-2 text-sm font-semibold disabled:opacity-50"
                :disabled="saving"
                @click="saveEdit(relationship)"
              >
                {{ saving ? 'Saving...' : 'Save Relationship' }}
              </button>
            </div>
          </div>
        </article>
      </div>

      <div
        v-if="isDrawerVariant && filteredRelationships.length > drawerRelationships.length"
        class="mt-3 text-xs leading-5 text-[#9f9278]"
      >
        Showing {{ drawerRelationships.length }} of {{ filteredRelationships.length }} links. Open the full article to manage the full web.
      </div>
    </template>
  </section>
</template>

<style scoped>
.relationship-panel {
  min-width: 0;
}

.relationship-row {
  transition:
    border-color 160ms ease,
    background-color 160ms ease;
}

.relationship-row:hover {
  background-color: rgba(201, 164, 90, 0.045);
}

.relationship-panel svg text {
  font-family: inherit;
}
</style>
