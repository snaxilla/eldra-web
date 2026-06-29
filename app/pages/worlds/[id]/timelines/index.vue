<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const router = useRouter()
const worldId = computed(() => String(route.params.id || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const search = ref('')
const creating = ref(false)
const createError = ref('')
const deleteError = ref('')
const deletingId = ref('')
const form = reactive({
  title: '',
  description: '',
  visibility: 'public',
  sortOrder: 0
})

const { data, pending, refresh } = await useFetch(() => `/api/worlds/${worldId.value}/timelines`, {
  default: () => ({
    worldId: worldId.value,
    timelines: []
  })
})

const timelines = computed(() => {
  const list = Array.isArray((data.value as any)?.timelines) ? (data.value as any).timelines : []
  const query = normalized(search.value)

  if (!query) return list

  return list.filter((timeline: any) => {
    const haystack = [
      timeline.title,
      timeline.slug,
      timeline.description,
      timeline.visibility
    ].map(normalized).join(' ')

    return haystack.includes(query)
  })
})

function cleanText(value: any) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalized(value: any) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function timelineUrl(timeline: any) {
  return `/worlds/${worldId.value}/timelines/${timeline.slug || timeline.id}`
}

async function createTimeline() {
  if (creating.value) return

  createError.value = ''
  const title = cleanText(form.title)

  if (!title) {
    createError.value = 'Timeline title is required.'
    return
  }

  creating.value = true

  try {
    const res: any = await $fetch(`/api/worlds/${worldId.value}/timelines`, {
      method: 'POST',
      body: {
        title,
        description: form.description,
        visibility: form.visibility,
        sortOrder: form.sortOrder
      }
    })

    form.title = ''
    form.description = ''
    form.visibility = 'public'
    form.sortOrder = 0

    await refresh()

    const timeline = res?.timeline
    if (timeline?.id) {
      await router.push(timelineUrl(timeline))
    }
  } catch (error: any) {
    createError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Could not create timeline.'
  } finally {
    creating.value = false
  }
}

async function deleteTimeline(timeline: any) {
  const ok = window.confirm(`Delete "${timeline.title}" and all of its events?`)
  if (!ok) return

  deleteError.value = ''
  deletingId.value = timeline.id

  try {
    await $fetch(`/api/worlds/${worldId.value}/timelines/${timeline.id}`, {
      method: 'DELETE'
    })
    await refresh()
  } catch (error: any) {
    deleteError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Could not delete timeline.'
  } finally {
    deletingId.value = ''
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-[1500px] p-6">
      <section class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes rounded-none border p-6 backdrop-blur-xl">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">World Chronology</div>
            <h1 class="mt-3 text-4xl font-semibold tracking-tight text-white">Timelines</h1>
            <p class="mt-2 max-w-3xl text-sm leading-7 text-[#d8ceb8]">
              Build eras, histories, campaign arcs, and events that can be mentioned from articles.
            </p>
          </div>

          <button
            type="button"
            class="eldra-button rounded-none px-4 py-2 text-sm"
            @click="refresh"
          >
            Refresh
          </button>
        </div>

        <div class="mt-6">
          <input
            v-model="search"
            type="search"
            placeholder="Search timelines..."
            class="eldra-input w-full rounded-none px-4 py-3 text-sm"
          >
        </div>
      </section>

      <div v-if="mode === 'build'" class="mt-6">
        <WorldPagePresentationPanel
          :world-id="worldId"
          page-key="timelines"
          title="Timelines Page"
          description="Controls the timelines page presentation mode and background."
        />
      </div>

      <section
        v-if="mode === 'build'"
        class="eldra-ornate-panel eldra-frame-corners mt-6 rounded-none border p-5 backdrop-blur-xl"
      >
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Create Timeline</div>

        <div class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_130px_auto]">
          <input
            v-model="form.title"
            class="eldra-input rounded-none px-4 py-3 text-sm"
            placeholder="Timeline title, e.g. Fall of the Old Kingdom"
          >

          <select
            v-model="form.visibility"
            class="eldra-input rounded-none px-4 py-3 text-sm text-[#f5e7bd]"
          >
            <option class="bg-[#090909]" value="public">Players</option>
            <option class="bg-[#090909]" value="gm">GM Only</option>
            <option class="bg-[#090909]" value="hidden">Hidden Draft</option>
          </select>

          <input
            v-model.number="form.sortOrder"
            type="number"
            class="eldra-input rounded-none px-4 py-3 text-sm"
            placeholder="Sort"
          >

          <button
            type="button"
            class="eldra-button rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
            :disabled="creating"
            @click="createTimeline"
          >
            {{ creating ? 'Creating...' : 'Create' }}
          </button>
        </div>

        <textarea
          v-model="form.description"
          rows="3"
          class="eldra-input mt-3 w-full rounded-none px-4 py-3 text-sm"
          placeholder="Short description..."
        />

        <div v-if="createError" class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {{ createError }}
        </div>
      </section>

      <div v-if="deleteError" class="mt-6 rounded-none border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {{ deleteError }}
      </div>

      <section class="mt-6">
        <div
          v-if="pending"
          class="eldra-ornate-panel eldra-frame-corners rounded-none border p-8 text-center text-[#d8ceb8]"
        >
          Loading timelines...
        </div>

        <div
          v-else-if="!timelines.length"
          class="eldra-ornate-panel eldra-frame-corners rounded-none border p-10 text-center"
        >
          <div class="text-xl font-semibold text-white">No timelines yet</div>
          <p class="mt-2 text-sm text-[#9f9278]">
            Switch to Build mode and create your first world timeline.
          </p>
        </div>

        <div
          v-else
          class="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3"
        >
          <article
            v-for="timeline in timelines"
            :key="timeline.id"
            class="eldra-ornate-panel eldra-frame-corners rounded-none border p-5 backdrop-blur-xl"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">
                  Timeline / {{ timeline.visibility || 'public' }}
                </div>
                <h2 class="mt-2 break-words text-2xl font-semibold text-white">
                  {{ timeline.title }}
                </h2>
              </div>

              <div class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.55)] px-3 py-1 text-xs text-[#d8ceb8]">
                Sort {{ timeline.sortOrder || 0 }}
              </div>
            </div>

            <p
              v-if="timeline.description"
              class="mt-4 line-clamp-4 text-sm leading-7 text-[#d8ceb8]"
            >
              {{ timeline.description }}
            </p>

            <p
              v-else
              class="mt-4 text-sm leading-7 text-[#9f9278]"
            >
              No description yet.
            </p>

            <div class="mt-5 flex flex-wrap gap-2">
              <NuxtLink
                :to="timelineUrl(timeline)"
                class="eldra-button rounded-none px-4 py-2 text-sm font-semibold"
              >
                Open Timeline
              </NuxtLink>

              <button
                v-if="mode === 'build'"
                type="button"
                class="rounded-none border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                :disabled="deletingId === timeline.id"
                @click="deleteTimeline(timeline)"
              >
                {{ deletingId === timeline.id ? 'Deleting...' : 'Delete' }}
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>
