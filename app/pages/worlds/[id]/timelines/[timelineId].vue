<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

import WorldMentionText from '~/components/world/WorldMentionText.vue'
import WorldMentionAutocompleteTextarea from '~/components/world/WorldMentionAutocompleteTextarea.vue'
import WorldEntityContextDrawer from '~/components/world/WorldEntityContextDrawer.vue'
import WorldMediaPicker from '~/components/world/WorldMediaPicker.vue'

const route = useRoute()
const router = useRouter()
const worldId = computed(() => String(route.params.id || ''))
const timelineId = computed(() => String(route.params.timelineId || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const editingTimeline = ref(false)
const savingTimeline = ref(false)
const eventImagePickerOpen = ref(false)
const timelineError = ref('')
const eventError = ref('')
const deletingEventId = ref('')
const editingEventId = ref('')

const contextDrawerOpen = ref(false)
const contextDrawerEntity = ref<any | null>(null)

const timelineForm = reactive({
  title: '',
  description: '',
  visibility: 'public',
  sortOrder: 0
})

const eventForm = reactive({
  title: '',
  eventKind: 'event',
  dateLabel: '',
  endDateLabel: '',
  sortOrder: 0,
  parentEventId: '',
  imageFileId: '',
  imageUrl: '',
  summaryMarkdown: '',
  visibility: 'public'
})

const { data, pending, refresh } = await useFetch(() => `/api/worlds/${worldId.value}/timelines/${timelineId.value}`, {
  default: () => ({
    worldId: worldId.value,
    timeline: null,
    events: []
  }),
  watch: [worldId, timelineId]
})

const timeline = computed(() => (data.value as any)?.timeline || null)
const events = computed(() => Array.isArray((data.value as any)?.events) ? (data.value as any).events : [])

function compareTimelineEvents(a: any, b: any) {
  const sortDiff = Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0)
  if (sortDiff) return sortDiff

  const dateDiff = String(a?.dateLabel || '').localeCompare(String(b?.dateLabel || ''))
  if (dateDiff) return dateDiff

  return String(a?.title || '').localeCompare(String(b?.title || ''))
}

const timelineRows = computed(() => {
  const list = [...events.value].sort(compareTimelineEvents)
  const byId = new Map<string, any>()
  const childrenByParent = new Map<string, any[]>()
  const roots: any[] = []

  for (const item of list) {
    byId.set(String(item.id), item)
  }

  for (const item of list) {
    const parentId = String(item.parentEventId || '')

    if (parentId && byId.has(parentId) && parentId !== String(item.id)) {
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, [])
      childrenByParent.get(parentId)!.push(item)
    } else {
      roots.push(item)
    }
  }

  for (const children of childrenByParent.values()) {
    children.sort(compareTimelineEvents)
  }

  const rows: any[] = []
  const seen = new Set<string>()

  function walk(item: any, depth: number) {
    const id = String(item.id || '')
    if (!id || seen.has(id)) return

    seen.add(id)
    rows.push({
      ...item,
      depth
    })

    for (const child of childrenByParent.get(id) || []) {
      walk(child, depth + 1)
    }
  }

  for (const root of roots.sort(compareTimelineEvents)) {
    walk(root, 0)
  }

  for (const item of list) {
    const id = String(item.id || '')
    if (id && !seen.has(id)) walk(item, 0)
  }

  return rows
})

const parentEventOptions = computed(() => {
  const editingId = String(editingEventId.value || '')

  return events.value
    .filter((item: any) => String(item.id || '') !== editingId)
    .map((item: any) => ({
      id: String(item.id || ''),
      label: `${'— '.repeat(Math.min(Number((timelineRows.value.find((row: any) => String(row.id) === String(item.id))?.depth || 0), 4)))}${item.title || 'Untitled Event'}`
    }))
})

watch(
  () => timeline.value,
  (value: any) => {
    if (!value) return
    timelineForm.title = value.title || ''
    timelineForm.description = value.description || ''
    timelineForm.visibility = value.visibility || 'public'
    timelineForm.sortOrder = Number(value.sortOrder || 0)
  },
  { immediate: true }
)

function cleanText(value: any) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function titleCase(value: any) {
  return cleanText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function eventAnchor(item: any) {
  return cleanText(item?.slug || item?.id || '')
}

function eventDateLine(item: any) {
  const start = cleanText(item?.dateLabel)
  const end = cleanText(item?.endDateLabel)

  if (start && end) return `${start} - ${end}`
  return start || end || 'Undated'
}

function resetEventForm() {
  editingEventId.value = ''
  eventForm.title = ''
  eventForm.eventKind = 'event'
  eventForm.dateLabel = ''
  eventForm.endDateLabel = ''
  eventForm.sortOrder = events.value.length ? Math.max(...events.value.map((item: any) => Number(item.sortOrder || 0))) + 10 : 10
  eventForm.parentEventId = ''
  eventForm.imageFileId = ''
  eventForm.imageUrl = ''
  eventForm.summaryMarkdown = ''
  eventForm.visibility = 'public'
}

function editEvent(item: any) {
  editingEventId.value = item.id
  eventForm.title = item.title || ''
  eventForm.eventKind = item.eventKind || 'event'
  eventForm.dateLabel = item.dateLabel || ''
  eventForm.endDateLabel = item.endDateLabel || ''
  eventForm.sortOrder = Number(item.sortOrder || 0)
  eventForm.parentEventId = item.parentEventId || ''
  eventForm.imageFileId = item.imageFileId || ''
  eventForm.imageUrl = item.imageUrl || ''
  eventForm.summaryMarkdown = item.summaryMarkdown || ''
  eventForm.visibility = item.visibility || 'public'
}

async function saveTimeline() {
  if (!timeline.value || savingTimeline.value) return

  timelineError.value = ''
  savingTimeline.value = true

  try {
    const res: any = await $fetch(`/api/worlds/${worldId.value}/timelines/${timeline.value.id}`, {
      method: 'PATCH',
      body: {
        title: timelineForm.title,
        description: timelineForm.description,
        visibility: timelineForm.visibility,
        sortOrder: timelineForm.sortOrder
      }
    })

    await refresh()
    editingTimeline.value = false

    const saved = res?.timeline
    if (saved?.slug && saved.slug !== timelineId.value) {
      await router.replace(`/worlds/${worldId.value}/timelines/${saved.slug}`)
    }
  } catch (error: any) {
    timelineError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Could not save timeline.'
  } finally {
    savingTimeline.value = false
  }
}

async function saveEvent() {
  if (!timeline.value) return

  eventError.value = ''

  const title = cleanText(eventForm.title)
  if (!title) {
    eventError.value = 'Event title is required.'
    return
  }

  try {
    if (editingEventId.value) {
      await $fetch(`/api/worlds/${worldId.value}/timelines/${timeline.value.id}/events/${editingEventId.value}`, {
        method: 'PATCH',
        body: eventForm
      })
    } else {
      await $fetch(`/api/worlds/${worldId.value}/timelines/${timeline.value.id}/events`, {
        method: 'POST',
        body: eventForm
      })
    }

    resetEventForm()
    await refresh()
  } catch (error: any) {
    eventError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Could not save event.'
  }
}

async function deleteEvent(item: any) {
  if (!timeline.value) return

  const ok = window.confirm(`Delete "${item.title}"?`)
  if (!ok) return

  deletingEventId.value = item.id
  eventError.value = ''

  try {
    await $fetch(`/api/worlds/${worldId.value}/timelines/${timeline.value.id}/events/${item.id}`, {
      method: 'DELETE'
    })

    if (editingEventId.value === item.id) resetEventForm()
    await refresh()
  } catch (error: any) {
    eventError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Could not delete event.'
  } finally {
    deletingEventId.value = ''
  }
}

function pickEventImage(file: any) {
  eventForm.imageFileId = String(file?.id || file?.fileId || file?.directusFileId || '').trim()
  eventForm.imageUrl = String(file?.url || file?.imageUrl || (eventForm.imageFileId ? `/api/assets/${eventForm.imageFileId}` : '')).trim()
  eventImagePickerOpen.value = false
}

function clearEventImage() {
  eventForm.imageFileId = ''
  eventForm.imageUrl = ''
}

function eventImageUrl(item: any) {
  return String(item?.imageUrl || (item?.imageFileId ? `/api/assets/${item.imageFileId}` : '') || '').trim()
}

function openMentionContext(mention: any) {
  contextDrawerEntity.value = mention || null
  contextDrawerOpen.value = true
}

function closeContextDrawer() {
  contextDrawerOpen.value = false
  contextDrawerEntity.value = null
}

onMounted(() => {
  resetEventForm()
})
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div
      class="p-6 transition-[padding,max-width,margin] duration-200 ease-out"
      :class="contextDrawerOpen ? 'xl:mr-[404px] xl:max-w-none' : 'mx-auto max-w-[1500px]'"
    >
      <section class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes rounded-none border p-6 backdrop-blur-xl">
        <div class="mb-4">
          <NuxtLink
            :to="`/worlds/${worldId}/timelines`"
            class="inline-flex items-center gap-2 text-sm text-[#9f9278] transition hover:text-white"
          >
            ← Timelines
          </NuxtLink>
        </div>

        <div v-if="pending" class="text-[#d8ceb8]">
          Loading timeline...
        </div>

        <div v-else-if="!timeline">
          <div class="text-xl font-semibold text-white">Timeline not found</div>
        </div>

        <template v-else>
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
                Timeline / {{ timeline.visibility || 'public' }}
              </div>
              <h1 class="mt-3 break-words text-4xl font-semibold tracking-tight text-white">
                {{ timeline.title }}
              </h1>
              <p
                v-if="timeline.description"
                class="mt-3 max-w-4xl text-sm leading-7 text-[#d8ceb8]"
              >
                {{ timeline.description }}
              </p>
            </div>

            <button
              v-if="mode === 'build'"
              type="button"
              class="eldra-button rounded-none px-4 py-2 text-sm"
              @click="editingTimeline = !editingTimeline"
            >
              {{ editingTimeline ? 'Close Editor' : 'Edit Timeline' }}
            </button>
          </div>

          <div
            v-if="editingTimeline && mode === 'build'"
            class="mt-6 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.52)] p-4"
          >
            <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_130px_auto]">
              <input
                v-model="timelineForm.title"
                class="eldra-input rounded-none px-4 py-3 text-sm"
                placeholder="Timeline title"
              >

              <select
                v-model="timelineForm.visibility"
                class="eldra-input rounded-none px-4 py-3 text-sm text-[#f5e7bd]"
              >
                <option class="bg-[#090909]" value="public">Players</option>
                <option class="bg-[#090909]" value="gm">GM Only</option>
                <option class="bg-[#090909]" value="hidden">Hidden Draft</option>
              </select>

              <input
                v-model.number="timelineForm.sortOrder"
                type="number"
                class="eldra-input rounded-none px-4 py-3 text-sm"
                placeholder="Sort"
              >

              <button
                type="button"
                class="eldra-button rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
                :disabled="savingTimeline"
                @click="saveTimeline"
              >
                {{ savingTimeline ? 'Saving...' : 'Save' }}
              </button>
            </div>

            <textarea
              v-model="timelineForm.description"
              rows="3"
              class="eldra-input mt-3 w-full rounded-none px-4 py-3 text-sm"
              placeholder="Timeline description..."
            />

            <div v-if="timelineError" class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {{ timelineError }}
            </div>
          </div>
        </template>
      </section>

      <div v-if="timeline && mode === 'build'" class="mt-6">
        <WorldPagePresentationPanel
          :world-id="worldId"
          page-key="timelines"
          title="Timelines Page"
          description="Controls the timelines page presentation mode and background."
        />
      </div>

      <section
        v-if="timeline && mode === 'build'"
        class="eldra-ornate-panel eldra-frame-corners mt-6 rounded-none border p-5 backdrop-blur-xl"
      >
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              {{ editingEventId ? 'Edit Timeline Entry' : 'Add Timeline Entry' }}
            </div>
            <p class="mt-1 text-sm text-[#d8ceb8]">
              Use flexible lore dates like Year 2, Before Written History, or optional YYYY-MM-DD for sortable real dates. Mentions work in the body.
            </p>
          </div>

          <button
            v-if="editingEventId"
            type="button"
            class="rounded-none border border-[rgba(201,164,90,0.22)] px-4 py-2 text-sm text-[#f5e7bd] transition hover:bg-[rgba(201,164,90,0.10)]"
            @click="resetEventForm"
          >
            Cancel Edit
          </button>
        </div>

        <div class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_170px_170px_130px_160px]">
          <input
            v-model="eventForm.title"
            class="eldra-input rounded-none px-4 py-3 text-sm"
            placeholder="The Dark Ages"
          >

          <select
            v-model="eventForm.eventKind"
            class="eldra-input rounded-none px-4 py-3 text-sm text-[#f5e7bd]"
          >
            <option class="bg-[#090909]" value="event">Event</option>
            <option class="bg-[#090909]" value="era">Era</option>
            <option class="bg-[#090909]" value="period">Period</option>
            <option class="bg-[#090909]" value="session">Session</option>
            <option class="bg-[#090909]" value="note">Note</option>
          </select>

          <input
            v-model="eventForm.dateLabel"
            class="eldra-input rounded-none px-4 py-3 text-sm"
            placeholder="Start label, e.g. Year 2"
          >

          <input
            v-model="eventForm.endDateLabel"
            class="eldra-input rounded-none px-4 py-3 text-sm"
            placeholder="End label, optional"
          >

          <input
            v-model.number="eventForm.sortOrder"
            type="number"
            class="eldra-input rounded-none px-4 py-3 text-sm"
            title="Timeline Order"
            placeholder="Order"
          >

          <select
            v-model="eventForm.visibility"
            class="eldra-input rounded-none px-4 py-3 text-sm text-[#f5e7bd]"
          >
            <option class="bg-[#090909]" value="public">Players</option>
            <option class="bg-[#090909]" value="gm">GM Only</option>
            <option class="bg-[#090909]" value="hidden">Hidden Draft</option>
          </select>
        </div>

        <div class="mt-3 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <label class="flex items-center rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)] px-4 py-3 text-xs uppercase tracking-[0.22em] text-[#9f9278]">
            Nest Under
          </label>

          <select
            v-model="eventForm.parentEventId"
            class="eldra-input rounded-none px-4 py-3 text-sm text-[#f5e7bd]"
          >
            <option class="bg-[#090909]" value="">None / Top Level</option>
            <option
              v-for="option in parentEventOptions"
              :key="option.id"
              class="bg-[#090909]"
              :value="option.id"
            >
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="mt-3 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <label class="flex items-center rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)] px-4 py-3 text-xs uppercase tracking-[0.22em] text-[#9f9278]">
            Event Image
          </label>

          <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-black/20 p-3">
            <div class="flex flex-wrap items-center gap-3">
              <button
                type="button"
                class="eldra-button rounded-none px-4 py-2 text-sm"
                @click="eventImagePickerOpen = true"
              >
                {{ eventForm.imageUrl ? 'Replace Image' : 'Choose Image' }}
              </button>

              <button
                v-if="eventForm.imageUrl"
                type="button"
                class="rounded-none border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-200 transition hover:bg-red-500/20"
                @click="clearEventImage"
              >
                Clear
              </button>

              <span class="text-xs text-[#9f9278]">
                Optional thumbnail/banner for this timeline entry.
              </span>
            </div>

            <div
              v-if="eventForm.imageUrl"
              class="mt-3 max-w-sm overflow-hidden rounded-none border border-[rgba(201,164,90,0.22)] bg-black/30"
            >
              <img
                :src="eventForm.imageUrl"
                alt="Selected event image"
                class="h-32 w-full object-cover"
              >
            </div>
          </div>
        </div>

        <WorldMentionAutocompleteTextarea
          v-model="eventForm.summaryMarkdown"
          :world-id="worldId"
          rows="5"
          textarea-class="eldra-input mt-3 w-full rounded-none px-4 py-3 text-sm leading-7"
          placeholder="Describe what happened. Type @ to mention people, places, timelines, or timeline events..."
        />

        <div class="mt-4 flex justify-end">
          <button
            type="button"
            class="eldra-button rounded-none px-5 py-3 text-sm font-semibold"
            @click="saveEvent"
          >
            {{ editingEventId ? 'Save Event' : 'Add Event' }}
          </button>
        </div>

        <div v-if="eventError" class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {{ eventError }}
        </div>
      </section>

      <section class="mt-6">
        <div
          v-if="!events.length"
          class="eldra-ornate-panel eldra-frame-corners rounded-none border p-10 text-center"
        >
          <div class="text-xl font-semibold text-white">No timeline entries yet</div>
          <p class="mt-2 text-sm text-[#9f9278]">
            Switch to Build mode and add an era, event, session, or note.
          </p>
        </div>

        <div v-else class="relative">
          <div class="absolute bottom-0 left-[1.35rem] top-0 hidden w-px bg-[rgba(201,164,90,0.28)] md:block"></div>

          <article
            v-for="item in timelineRows"
            :id="eventAnchor(item)"
            :key="item.id"
            class="relative mb-5 scroll-mt-24 md:pl-14"
            :style="{ marginLeft: item.depth ? `${Math.min(item.depth, 5) * 1.75}rem` : undefined }"
          >
            <div class="absolute left-[0.85rem] top-7 hidden h-3 w-3 -translate-x-1/2 border border-[rgba(201,164,90,0.65)] bg-[#15110a] shadow-[0_0_20px_rgba(201,164,90,0.18)] rotate-45 md:block"></div>

            <div class="rounded-none border border-[rgba(201,164,90,0.34)] bg-[linear-gradient(to_bottom,rgba(20,17,12,0.82),rgba(7,6,4,0.82))] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.24)] backdrop-blur-xl">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
                      {{ titleCase(item.eventKind) }}
                    </span>
                    <span class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] px-3 py-1 text-xs text-[#d8ceb8]">
                      {{ eventDateLine(item) }}
                    </span>
                    <span class="rounded-none border border-[rgba(201,164,90,0.14)] px-3 py-1 text-xs text-[#9f9278]">
                      {{ item.visibility || 'public' }}
                    </span>
                    <span
                      v-if="item.depth"
                      class="rounded-none border border-[rgba(201,164,90,0.14)] px-3 py-1 text-xs text-[#9f9278]"
                    >
                      Nested {{ item.depth }}
                    </span>
                  </div>

                  <h2 class="mt-3 break-words text-2xl font-semibold text-white">
                    {{ item.title }}
                  </h2>
                </div>

                <div
                  v-if="mode === 'build'"
                  class="flex flex-wrap gap-2"
                >
                  <button
                    type="button"
                    class="rounded-none border border-[rgba(201,164,90,0.22)] px-3 py-2 text-sm text-[#f5e7bd] transition hover:bg-[rgba(201,164,90,0.10)]"
                    @click="editEvent(item)"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    class="rounded-none border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                    :disabled="deletingEventId === item.id"
                    @click="deleteEvent(item)"
                  >
                    {{ deletingEventId === item.id ? 'Deleting...' : 'Delete' }}
                  </button>
                </div>
              </div>

              <div
                v-if="eventImageUrl(item)"
                class="mt-4 overflow-hidden rounded-none border border-[rgba(201,164,90,0.24)] bg-black/25"
              >
                <img
                  :src="eventImageUrl(item)"
                  :alt="item.title || 'Timeline event image'"
                  loading="lazy"
                  class="max-h-72 w-full object-cover"
                >
              </div>

              <WorldMentionText
                v-if="item.summaryMarkdown"
                :world-id="worldId"
                :markdown="item.summaryMarkdown"
                class="mt-4 text-sm leading-7 text-[#d8ceb8]"
                @open-mention="openMentionContext"
              />

              <p
                v-else
                class="mt-4 text-sm leading-7 text-[#9f9278]"
              >
                No event summary yet.
              </p>
            </div>
          </article>
        </div>
      </section>
    </div>

    <WorldMediaPicker
      :open="eventImagePickerOpen"
      :world-id="worldId"
      @close="eventImagePickerOpen = false"
      @select="pickEventImage"
    />

    <WorldEntityContextDrawer
      :open="contextDrawerOpen"
      :entity="contextDrawerEntity"
      :world-id="worldId"
      :mode="mode"
      :allow-build-actions="false"
      @close="closeContextDrawer"
    />
  </div>
</template>
