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
  { value: 'friend', label: 'Friend', color: '#3fb950' },
  { value: 'ally', label: 'Ally', color: '#3fb950' },
  { value: 'rival', label: 'Rival', color: '#f85149' },
  { value: 'enemy', label: 'Enemy', color: '#f85149' },
  { value: 'family', label: 'Family', color: '#a371f7' },
  { value: 'mentor', label: 'Mentor', color: '#a371f7' },
  { value: 'location', label: 'Location', color: '#58a6ff' },
  { value: 'faction', label: 'Faction', color: '#58a6ff' },
  { value: 'possession', label: 'Possession', color: '#c9a45a' },
  { value: 'quest', label: 'Quest', color: '#c9a45a' },
  { value: 'lore', label: 'Lore', color: '#c9a45a' },
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

    return String(a?.other?.title || '').localeCompare(String(b?.other?.title || ''))
  })
)

const drawerRelationships = computed(() => sortedRelationships.value.slice(0, 6))
const hasRelationships = computed(() => sortedRelationships.value.length > 0)

const graphRelationships = computed(() =>
  sortedRelationships.value.filter((relationship: any) => relationship?.other)
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

function relationshipColor(relationship: any) {
  const strength = Number(relationship?.strength || 0)

  if (strength > 0) return '#3fb950'
  if (strength < 0) return '#f85149'

  return typeMeta(relationship?.relationshipType).color
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
  return `${relationship.displayLabel || relationship.label || 'related to'} ${relationshipOtherTitle(relationship)}`
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
    const res: any = await $fetch(`/api/worlds/${props.worldId}/mentions/search`, {
      query: { q }
    })

    const list = Array.isArray(res)
      ? res
      : Array.isArray(res?.mentions)
        ? res.mentions
        : Array.isArray(res?.items)
          ? res.items
          : Array.isArray(res?.results)
            ? res.results
            : Array.isArray(res?.data)
              ? res.data
              : []

    const currentId = entityId.value

    targetSuggestions.value = list
      .map((item: any) => {
        const id = numericEntityId(item)

        return {
          ...item,
          id,
          title: String(item?.title || item?.name || item?.label || 'Untitled'),
          entityType: String(item?.entityType || item?.entity_type || item?.type || 'entity')
        }
      })
      .filter((item: any) => item.id && String(item.id) !== String(currentId))
      .slice(0, 10)
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

onBeforeUnmount(() => {
  if (targetSearchTimer) clearTimeout(targetSearchTimer)
})
</script>

<template>
  <section
    :class="[
      variant === 'drawer'
        ? 'mt-5 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.38)] p-4'
        : 'eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.26)] bg-[linear-gradient(to_bottom,rgba(18,16,12,0.72),rgba(7,7,6,0.58))] p-5 backdrop-blur-xl'
    ]"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Relationships
        </div>

        <h2
          v-if="isArticleVariant"
          class="mt-2 text-2xl font-semibold text-white"
        >
          Relationship Web
        </h2>

        <p class="mt-1 text-sm leading-6 text-[#d8ceb8]">
          {{ isArticleVariant
            ? 'Manage direct relations, attitude, visibility, and the entity web.'
            : 'People, places, factions, items, and story links.' }}
        </p>
      </div>

      <div
        v-if="isArticleVariant"
        class="flex flex-wrap gap-2"
      >
        <button
          type="button"
          class="rounded-none border px-3 py-2 text-xs font-semibold"
          :class="activeView === 'list'
            ? 'border-[rgba(201,164,90,0.64)] bg-[rgba(201,164,90,0.14)] text-[#fff7df]'
            : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.50)] text-[#d8ceb8]'"
          @click="activeView = 'list'"
        >
          List
        </button>

        <button
          v-if="showGraph"
          type="button"
          class="rounded-none border px-3 py-2 text-xs font-semibold"
          :class="activeView === 'web'
            ? 'border-[rgba(201,164,90,0.64)] bg-[rgba(201,164,90,0.14)] text-[#fff7df]'
            : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.50)] text-[#d8ceb8]'"
          @click="activeView = 'web'"
        >
          Web
        </button>

        <button
          v-if="canEdit && !payload?.schemaMissing"
          type="button"
          class="rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(201,164,90,0.12)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
          @click="addOpen = !addOpen"
        >
          {{ addOpen ? 'Cancel Add' : '+ Add Relation' }}
        </button>
      </div>
    </div>

    <div
      v-if="payload?.schemaMissing"
      class="mt-3 rounded-none border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100"
    >
      Relationship schema is not installed yet.
    </div>

    <div
      v-if="error"
      class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-xs leading-5 text-red-200"
    >
      {{ error }}
    </div>

    <div
      v-if="success"
      class="mt-3 rounded-none border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs leading-5 text-emerald-100"
    >
      {{ success }}
    </div>

    <div
      v-if="addOpen && canEdit && !payload?.schemaMissing"
      class="mt-4 grid gap-4 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.42)] p-4"
    >
      <div class="flex flex-wrap gap-2">
        <button
          v-for="type in RELATIONSHIP_TYPES"
          :key="type.value"
          type="button"
          class="rounded-none border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
          :class="form.relationshipType === type.value
            ? 'border-[rgba(201,164,90,0.64)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
            : 'border-[rgba(65,82,103,0.60)] bg-[rgba(8,17,27,0.48)] text-[#d8ceb8]'"
          @click="presetRelationship(type.value)"
        >
          {{ type.label }}
        </button>
      </div>

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
          class="mt-2 overflow-hidden rounded-none border border-[rgba(201,164,90,0.18)]"
        >
          <button
            v-for="target in targetSuggestions"
            :key="target.id"
            type="button"
            class="block w-full border-b border-[rgba(201,164,90,0.10)] bg-[rgba(8,17,27,0.72)] px-3 py-2 text-left last:border-b-0 hover:bg-[rgba(201,164,90,0.10)]"
            @click="selectTarget(target)"
          >
            <span class="block text-sm font-semibold text-white">{{ target.title }}</span>
            <span class="mt-0.5 block text-[10px] uppercase tracking-[0.16em] text-[#9f9278]">
              {{ target.entityType }}
            </span>
          </button>
        </div>

        <div
          v-if="selectedTarget"
          class="mt-2 rounded-none border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100"
        >
          Selected: {{ selectedTarget.title }}
        </div>
      </label>

      <div class="grid gap-3 md:grid-cols-2">
        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Label</span>
          <input
            v-model="form.label"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            placeholder="lives in, owns, allied with..."
          >
        </label>

        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Reverse Label</span>
          <input
            v-model="form.inverseLabel"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            placeholder="resident, owned by, ally of..."
          >
        </label>

        <label class="block">
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

        <label class="block">
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
      </div>

      <label class="block">
        <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Summary</span>
        <textarea
          v-model="form.summary"
          rows="3"
          class="eldra-input w-full rounded-none px-3 py-2 text-sm leading-6 text-white"
          placeholder="Optional relationship note..."
        />
      </label>

      <button
        type="button"
        class="eldra-button rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
        :disabled="saving || !selectedTarget"
        @click="createRelationship"
      >
        {{ saving ? 'Saving...' : 'Save Relationship' }}
      </button>
    </div>

    <div
      v-if="loading"
      class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.18)] p-4 text-sm text-[#9f9278]"
    >
      Loading relationships...
    </div>

    <div
      v-else-if="!hasRelationships && !payload?.schemaMissing"
      class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.18)] p-4 text-sm leading-6 text-[#9f9278]"
    >
      No relationships recorded yet.
    </div>

    <!-- DRAWER: compact read-only list -->
    <div
      v-else-if="isDrawerVariant"
      class="mt-4 grid gap-2"
    >
      <button
        v-for="relationship in drawerRelationships"
        :key="relationship.id"
        type="button"
        class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.42)] p-3 text-left transition hover:border-[rgba(201,164,90,0.36)] hover:bg-[rgba(201,164,90,0.08)]"
        @click="openRelationshipEntity(relationship)"
      >
        <span class="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
          <span :class="['h-2.5 w-2.5 rounded-full', attitudeDotClass(relationship)]" />
          {{ relationship.relationshipType }}
        </span>

        <span class="mt-1 block text-sm leading-5 text-[#d8ceb8]">
          <span class="font-semibold text-[#fff7df]">{{ relationship.displayLabel }}</span>
          <span class="mx-1 text-[#9f9278]">→</span>
          <span class="font-semibold text-white">{{ relationshipOtherTitle(relationship) }}</span>
        </span>

        <span
          v-if="relationship.summary"
          class="mt-1 line-clamp-2 block text-xs leading-5 text-[#9f9278]"
        >
          {{ relationship.summary }}
        </span>
      </button>

      <div
        v-if="sortedRelationships.length > drawerRelationships.length"
        class="text-xs text-[#9f9278]"
      >
        +{{ sortedRelationships.length - drawerRelationships.length }} more on the full article.
      </div>
    </div>

    <!-- ARTICLE: graph view -->
    <div
      v-else-if="activeView === 'web' && showGraph"
      class="mt-5 overflow-hidden rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(8,12,18,0.55)]"
    >
      <svg
        viewBox="0 0 680 500"
        role="img"
        class="h-[420px] w-full"
      >
        <defs>
          <filter
            id="relationshipNodeGlow"
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
          >
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="5"
              flood-color="#c9a45a"
              flood-opacity="0.28"
            />
          </filter>
        </defs>

        <line
          v-for="node in graphNodes"
          :key="`line-${node.relationship.id}`"
          x1="340"
          y1="250"
          :x2="node.x"
          :y2="node.y"
          :stroke="relationshipColor(node.relationship)"
          stroke-width="3"
          stroke-opacity="0.82"
        />

        <g filter="url(#relationshipNodeGlow)">
          <circle
            cx="340"
            cy="250"
            r="54"
            fill="rgba(20,17,12,0.96)"
            stroke="#c9a45a"
            stroke-width="2"
          />
          <text
            x="340"
            y="244"
            text-anchor="middle"
            fill="#fff7df"
            font-size="18"
            font-weight="700"
          >
            {{ initialsFor(entityTitle) }}
          </text>
          <text
            x="340"
            y="266"
            text-anchor="middle"
            fill="#9f9278"
            font-size="10"
            letter-spacing="2"
          >
            CURRENT
          </text>
        </g>

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
            fill="rgba(8,17,27,0.96)"
            :stroke="relationshipColor(node.relationship)"
            stroke-width="2"
          />
          <text
            :x="node.x"
            :y="node.y + 5"
            text-anchor="middle"
            fill="#fff7df"
            font-size="16"
            font-weight="700"
          >
            {{ initialsFor(relationshipOtherTitle(node.relationship)) }}
          </text>

          <text
            :x="node.x"
            :y="node.y + 62"
            text-anchor="middle"
            fill="#d8ceb8"
            font-size="12"
            font-weight="600"
          >
            {{ relationshipOtherTitle(node.relationship).slice(0, 22) }}
          </text>

          <text
            :x="node.x"
            :y="node.y + 78"
            text-anchor="middle"
            :fill="relationshipColor(node.relationship)"
            font-size="10"
            letter-spacing="1.5"
          >
            {{ node.relationship.displayLabel || node.relationship.label }}
          </text>
        </g>
      </svg>
    </div>

    <!-- ARTICLE: list/editor -->
    <div
      v-else
      class="mt-5 overflow-hidden rounded-none border border-[rgba(201,164,90,0.18)]"
    >
      <div class="hidden grid-cols-[1.15fr_1.25fr_120px_120px_120px] gap-3 border-b border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.58)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9f9278] xl:grid">
        <div>Relation</div>
        <div>Name</div>
        <div>Attitude</div>
        <div>Visibility</div>
        <div>Actions</div>
      </div>

      <article
        v-for="relationship in sortedRelationships"
        :key="relationship.id"
        class="border-b border-[rgba(201,164,90,0.10)] bg-[rgba(8,17,27,0.34)] p-3 last:border-b-0"
      >
        <div
          v-if="editingId !== String(relationship.id)"
          class="grid gap-3 xl:grid-cols-[1.15fr_1.25fr_120px_120px_120px] xl:items-center"
        >
          <div>
            <div class="text-xs uppercase tracking-[0.16em] text-[#9f9278]">
              {{ relationshipDirectionLabel(relationship) }} · {{ relationship.relationshipType }}
            </div>
            <div class="mt-1 text-sm font-semibold text-[#fff7df]">
              {{ relationship.displayLabel || relationship.label }}
            </div>
            <div
              v-if="relationship.inverseLabel"
              class="mt-1 text-xs text-[#9f9278]"
            >
              Reverse: {{ relationship.inverseLabel }}
            </div>
          </div>

          <button
            type="button"
            class="text-left"
            @click="openRelationshipEntity(relationship)"
          >
            <span class="block text-sm font-semibold text-white">
              {{ relationshipOtherTitle(relationship) }}
            </span>
            <span class="mt-1 block text-xs uppercase tracking-[0.16em] text-[#9f9278]">
              {{ relationshipOtherType(relationship) }}
            </span>
            <span
              v-if="relationship.summary"
              class="mt-2 block text-xs leading-5 text-[#d8ceb8]"
            >
              {{ relationship.summary }}
            </span>
          </button>

          <div class="flex items-center gap-2 text-xs text-[#d8ceb8]">
            <span :class="['h-3 w-3 rounded-full', attitudeDotClass(relationship)]" />
            {{ attitudeLabel(relationship) }}
          </div>

          <div class="text-xs uppercase tracking-[0.16em] text-[#9f9278]">
            {{ relationship.visibility || 'world' }}
          </div>

          <div
            v-if="canEdit"
            class="flex flex-wrap gap-2"
          >
            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
              @click="beginEdit(relationship)"
            >
              Edit
            </button>

            <button
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
          class="grid gap-3"
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
              class="eldra-input w-full rounded-none px-3 py-2 text-sm leading-6 text-white"
            />
          </label>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="eldra-button rounded-none px-4 py-2 text-sm font-semibold disabled:opacity-50"
              :disabled="saving"
              @click="saveEdit(relationship)"
            >
              Save
            </button>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-4 py-2 text-sm font-semibold text-[#fff7df]"
              @click="cancelEdit"
            >
              Cancel
            </button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
