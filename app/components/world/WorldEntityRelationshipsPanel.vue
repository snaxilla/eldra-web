<script setup lang="ts">
const props = withDefaults(defineProps<{
  worldId?: string | number
  entity?: any | null
  mode?: 'play' | 'build'
  allowEdit?: boolean
}>(), {
  worldId: '',
  entity: null,
  mode: 'play',
  allowEdit: false
})

const emit = defineEmits<{
  (event: 'openEntity', entity: any): void
}>()

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

const addOpen = ref(false)
const targetSearch = ref('')
const targetSuggestions = ref<any[]>([])
const selectedTarget = ref<any | null>(null)
const relationshipType = ref('related')
const labelDraft = ref('related to')
const inverseLabelDraft = ref('')
const summaryDraft = ref('')
let targetSearchTimer: ReturnType<typeof setTimeout> | null = null

const entityId = computed(() =>
  String(
    props.entity?.id ??
    props.entity?.entityId ??
    props.entity?.entity_id ??
    ''
  ).trim()
)

const canEdit = computed(() =>
  props.mode === 'build' && props.allowEdit === true
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

const hasRelationships = computed(() => sortedRelationships.value.length > 0)

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
  relationshipType.value = 'related'
  labelDraft.value = 'related to'
  inverseLabelDraft.value = ''
  summaryDraft.value = ''
  error.value = ''
  success.value = ''
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
      : Array.isArray(res?.items)
        ? res.items
        : Array.isArray(res?.results)
          ? res.results
          : Array.isArray(res?.data)
            ? res.data
            : Array.isArray(res?.mentions)
              ? res.mentions
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
      .slice(0, 8)
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
        relationshipType: relationshipType.value,
        label: labelDraft.value,
        inverseLabel: inverseLabelDraft.value,
        summary: summaryDraft.value
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
  <section class="eldra-codex-soft mt-5 rounded-none p-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Relationships
        </div>

        <p class="mt-1 text-sm leading-6 text-[#d8ceb8]">
          Structured links to people, places, factions, items, and story threads.
        </p>
      </div>

      <button
        v-if="canEdit && !payload?.schemaMissing"
        type="button"
        class="shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
        @click="addOpen = !addOpen"
      >
        {{ addOpen ? 'Cancel' : 'Add' }}
      </button>
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
      class="mt-4 grid gap-3 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.38)] p-3"
    >
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

      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">
            Type
          </span>

          <select
            v-model="relationshipType"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
          >
            <option value="related" class="bg-[#090909] text-[#f5e7bd]">Related</option>
            <option value="social" class="bg-[#090909] text-[#f5e7bd]">Social</option>
            <option value="location" class="bg-[#090909] text-[#f5e7bd]">Location</option>
            <option value="faction" class="bg-[#090909] text-[#f5e7bd]">Faction</option>
            <option value="possession" class="bg-[#090909] text-[#f5e7bd]">Possession</option>
            <option value="family" class="bg-[#090909] text-[#f5e7bd]">Family</option>
            <option value="enemy" class="bg-[#090909] text-[#f5e7bd]">Enemy</option>
            <option value="quest" class="bg-[#090909] text-[#f5e7bd]">Quest</option>
            <option value="lore" class="bg-[#090909] text-[#f5e7bd]">Lore</option>
          </select>
        </label>

        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">
            Label
          </span>

          <input
            v-model="labelDraft"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            placeholder="lives in, owns, allied with..."
          >
        </label>
      </div>

      <label class="block">
        <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">
          Reverse Label
        </span>

        <input
          v-model="inverseLabelDraft"
          class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
          placeholder="resident, owned by, ally of..."
        >
      </label>

      <label class="block">
        <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">
          Summary
        </span>

        <textarea
          v-model="summaryDraft"
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

    <div
      v-else
      class="mt-4 grid gap-2"
    >
      <article
        v-for="relationship in sortedRelationships"
        :key="relationship.id"
        class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.42)] p-3"
      >
        <button
          type="button"
          class="block w-full text-left"
          @click="openRelationshipEntity(relationship)"
        >
          <span class="block text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
            {{ relationshipDirectionLabel(relationship) }} · {{ relationship.relationshipType }}
          </span>

          <span class="mt-1 block text-sm leading-5 text-[#d8ceb8]">
            <span class="font-semibold text-[#fff7df]">{{ relationship.displayLabel }}</span>
            <span class="mx-1 text-[#9f9278]">→</span>
            <span class="font-semibold text-white">{{ relationshipOtherTitle(relationship) }}</span>
          </span>

          <span class="mt-1 block text-[10px] uppercase tracking-[0.16em] text-[#9f9278]">
            {{ relationshipOtherType(relationship) }}
          </span>

          <span
            v-if="relationship.summary"
            class="mt-2 block text-xs leading-5 text-[#d8ceb8]"
          >
            {{ relationship.summary }}
          </span>
        </button>

        <button
          v-if="canEdit"
          type="button"
          class="mt-3 rounded-none border border-red-400/24 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-100 disabled:opacity-50"
          :disabled="saving"
          @click="deleteRelationship(relationship)"
        >
          Delete
        </button>
      </article>
    </div>
  </section>
</template>
