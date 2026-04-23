<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))

const search = ref('')
const typeFilter = ref<'all' | 'npc' | 'npc_sheet' | 'pc'>('all')
const showCreatePanel = ref(false)
const creating = ref(false)
const createError = ref('')
const createSuccess = ref('')
const selectedCharacterId = ref<string | null>(null)

const form = reactive({
  title: '',
  characterType: 'npc' as 'npc' | 'npc_sheet' | 'pc',
  summary: '',
  image: null as File | null,
  imagePreviewUrl: ''
})

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)

const {
  data: entities,
  pending,
  refresh
} = await useFetch(() => `/api/worlds/${worldId.value}/entities`, {
  default: () => []
})

function normalizeCharacterType(entity: any): 'npc' | 'npc_sheet' | 'pc' | 'unknown' {
  const explicit = String(entity?.character_type || '').toLowerCase()
  if (explicit === 'npc') return 'npc'
  if (explicit === 'npc_sheet') return 'npc_sheet'
  if (explicit === 'pc') return 'pc'

  const entityType = String(entity?.entity_type || '').toLowerCase()
  if (entityType === 'pc') return 'pc'
  if (entityType === 'player_character') return 'pc'
  if (entityType === 'npc_sheet') return 'npc_sheet'
  if (entityType === 'character') return 'npc'
  if (entityType === 'npc') return 'npc'

  const hasSheet = entity?.has_sheet === true || entity?.has_sheet === 1
  if (hasSheet) return 'npc_sheet'

  return 'unknown'
}

function isCharacterEntity(entity: any) {
  const entityType = String(entity?.entity_type || '').toLowerCase()
  const characterType = String(entity?.character_type || '').toLowerCase()

  return [
    'character',
    'npc',
    'npc_sheet',
    'pc',
    'player_character'
  ].includes(entityType) || [
    'npc',
    'npc_sheet',
    'pc'
  ].includes(characterType)
}

function initialsFor(name: string) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (!words.length) return '?'
  return words.map(w => w[0]?.toUpperCase() || '').join('')
}

function typeLabel(type: string) {
  if (type === 'npc') return 'NPC'
  if (type === 'npc_sheet') return 'NPC+'
  if (type === 'pc') return 'PC'
  return 'Character'
}

function typeBadgeClass(type: string) {
  if (type === 'pc') {
    return 'border-sky-400/20 bg-sky-400/10 text-sky-200'
  }
  if (type === 'npc_sheet') {
    return 'border-violet-400/20 bg-violet-400/10 text-violet-200'
  }
  return 'border-white/10 bg-white/[0.05] text-slate-300'
}

function imageUrlFor(entity: any) {
  if (entity?.image_url) return String(entity.image_url)
  if (entity?.imageUrl) return String(entity.imageUrl)

  if (entity?.image?.id) return `/api/assets/${entity.image.id}`
  if (typeof entity?.image === 'string' || typeof entity?.image === 'number') {
    return `/api/assets/${entity.image}`
  }

  if (entity?.image_file?.id) return `/api/assets/${entity.image_file.id}`
  if (typeof entity?.image_file === 'string' || typeof entity?.image_file === 'number') {
    return `/api/assets/${entity.image_file}`
  }

  if (entity?.portrait?.id) return `/api/assets/${entity.portrait.id}`
  if (typeof entity?.portrait === 'string' || typeof entity?.portrait === 'number') {
    return `/api/assets/${entity.portrait}`
  }

  return null
}

const characterEntities = computed(() => {
  return (entities.value || [])
    .filter(isCharacterEntity)
    .map((entity: any) => {
      const normalizedType = normalizeCharacterType(entity)
      return {
        ...entity,
        normalizedType,
        imageUrl: imageUrlFor(entity),
        displayTitle: String(entity?.title || 'Untitled Character'),
        displaySummary: String(entity?.summary || '').trim(),
        stringId: String(entity?.id || '')
      }
    })
})

const filteredCharacters = computed(() => {
  const q = search.value.trim().toLowerCase()

  return characterEntities.value
    .filter((character: any) => {
      if (typeFilter.value !== 'all' && character.normalizedType !== typeFilter.value) {
        return false
      }

      if (!q) return true

      return [
        character.displayTitle,
        character.displaySummary,
        character.role,
        character.entity_type,
        character.character_type
      ]
        .filter(Boolean)
        .some((value: any) => String(value).toLowerCase().includes(q))
    })
    .sort((a: any, b: any) => a.displayTitle.localeCompare(b.displayTitle))
})

const characterCounts = computed(() => {
  const list = characterEntities.value
  return {
    all: list.length,
    npc: list.filter((c: any) => c.normalizedType === 'npc').length,
    npc_sheet: list.filter((c: any) => c.normalizedType === 'npc_sheet').length,
    pc: list.filter((c: any) => c.normalizedType === 'pc').length,
  }
})

const selectedCharacter = computed(() => {
  if (!selectedCharacterId.value) return null
  return characterEntities.value.find((c: any) => String(c.stringId) === String(selectedCharacterId.value)) || null
})

watch(
  filteredCharacters,
  (list) => {
    if (!list.length && selectedCharacterId.value) {
      selectedCharacterId.value = null
      return
    }

    if (selectedCharacterId.value) {
      const stillExists = list.some((c: any) => String(c.stringId) === String(selectedCharacterId.value))
      if (!stillExists) {
        selectedCharacterId.value = null
      }
    }
  },
  { deep: true }
)

function isSelected(character: any) {
  return String(selectedCharacterId.value || '') === String(character?.stringId || character?.id || '')
}

function selectCharacter(character: any) {
  selectedCharacterId.value = String(character?.stringId || character?.id || '')
}

function clearSelectedCharacter() {
  selectedCharacterId.value = null
}

function resetForm() {
  form.title = ''
  form.characterType = 'npc'
  form.summary = ''
  form.image = null
  form.imagePreviewUrl = ''
  createError.value = ''
  createSuccess.value = ''
}

function openCreatePanel() {
  resetForm()
  showCreatePanel.value = true
}

function closeCreatePanel() {
  showCreatePanel.value = false
  createError.value = ''
  createSuccess.value = ''
}

function onImageChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] || null

  form.image = file

  if (form.imagePreviewUrl) {
    URL.revokeObjectURL(form.imagePreviewUrl)
    form.imagePreviewUrl = ''
  }

  if (file) {
    form.imagePreviewUrl = URL.createObjectURL(file)
  }
}

async function createCharacter() {
  createError.value = ''
  createSuccess.value = ''

  if (!form.title.trim()) {
    createError.value = 'Character name is required.'
    return
  }

  creating.value = true

  try {
    const body = new FormData()
    body.append('title', form.title.trim())
    body.append('characterType', form.characterType)
    body.append('summary', form.summary.trim())

    if (form.image) {
      body.append('image', form.image)
    }

    const created = await $fetch<any>(`/api/worlds/${worldId.value}/characters/create`, {
      method: 'POST',
      body
    })

    await refresh()
    createSuccess.value = 'Character created.'
    closeCreatePanel()

    if (created?.id) {
      selectedCharacterId.value = String(created.id)
    }
  } catch (error: any) {
    createError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to create character.'
  } finally {
    creating.value = false
  }
}

onBeforeUnmount(() => {
  if (form.imagePreviewUrl) {
    URL.revokeObjectURL(form.imagePreviewUrl)
  }
})
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-[1900px] p-6">
      <div :class="selectedCharacter ? 'pr-[380px]' : ''" class="transition-all duration-200">
        <section class="eldra-panel rounded-[24px] p-6 shadow-xl">
          <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div class="text-xs uppercase tracking-[0.35em] text-slate-500">Characters</div>
              <h1 class="mt-2 text-3xl font-semibold text-white">{{ world?.name || 'World' }}</h1>
              <p class="mt-2 max-w-3xl text-sm text-slate-300">
                Browse player characters, NPCs, and sheet-enabled combatants in one roster-first view.
              </p>
            </div>

            <div class="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/20"
                @click="openCreatePanel"
              >
                Add Character
              </button>

              <button
                type="button"
                class="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                @click="refresh()"
              >
                Refresh
              </button>
            </div>
          </div>

          <div class="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <input
              v-model="search"
              type="text"
              placeholder="Search characters..."
              class="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-slate-400 outline-none transition focus:border-sky-400/30 focus:bg-white/[0.06]"
            >

            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-full border px-3 py-2 text-xs font-medium transition"
                :class="typeFilter === 'all'
                  ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                  : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
                @click="typeFilter = 'all'"
              >
                All ({{ characterCounts.all }})
              </button>

              <button
                type="button"
                class="rounded-full border px-3 py-2 text-xs font-medium transition"
                :class="typeFilter === 'npc'
                  ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                  : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
                @click="typeFilter = 'npc'"
              >
                NPCs ({{ characterCounts.npc }})
              </button>

              <button
                type="button"
                class="rounded-full border px-3 py-2 text-xs font-medium transition"
                :class="typeFilter === 'npc_sheet'
                  ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                  : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
                @click="typeFilter = 'npc_sheet'"
              >
                NPC+ ({{ characterCounts.npc_sheet }})
              </button>

              <button
                type="button"
                class="rounded-full border px-3 py-2 text-xs font-medium transition"
                :class="typeFilter === 'pc'
                  ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                  : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
                @click="typeFilter = 'pc'"
              >
                PCs ({{ characterCounts.pc }})
              </button>
            </div>
          </div>
        </section>

        <section
          v-if="pending"
          class="mt-6 eldra-panel rounded-[24px] p-6 text-slate-300 shadow-xl"
        >
          Loading characters...
        </section>

        <section
          v-else-if="!filteredCharacters.length"
          class="mt-6 eldra-empty rounded-[24px] p-10 text-center shadow-xl"
        >
          <div class="text-lg font-medium text-white">No characters found</div>
          <p class="mt-2 text-sm text-slate-300">
            Add characters manually or import supporting content, then come back here to manage the roster.
          </p>
        </section>

        <section
          v-else
          class="mt-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3"
        >
          <div
            v-for="character in filteredCharacters"
            :key="character.id"
            class="group cursor-pointer overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(18,28,42,0.92),rgba(10,18,28,0.9))] shadow-xl transition duration-150 hover:-translate-y-0.5 hover:border-white/20"
            :class="isSelected(character)
              ? 'scale-[1.04] border-amber-300 bg-[linear-gradient(to_bottom,rgba(34,46,67,0.98),rgba(16,26,40,0.96))] shadow-[0_0_0_5px_rgba(251,191,36,0.75),0_0_40px_rgba(251,191,36,0.25),0_22px_48px_rgba(0,0,0,0.42)]'
              : 'opacity-95'"
            @click="selectCharacter(character)"
          >
            <div class="grid min-h-[220px] grid-cols-[112px_minmax(0,1fr)]">
              <div class="border-r border-white/10 bg-black/20">
                <img
                  v-if="character.imageUrl"
                  :src="character.imageUrl"
                  :alt="character.displayTitle"
                  class="h-full w-full object-cover"
                >
                <div
                  v-else
                  class="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900/90 to-slate-800/80 text-2xl font-semibold text-slate-200"
                >
                  {{ initialsFor(character.displayTitle) }}
                </div>
              </div>

              <div class="flex min-w-0 flex-col p-5">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="truncate text-[1.55rem] font-semibold leading-tight text-white">
                      {{ character.displayTitle }}
                    </div>
                  </div>

                  <span
                    class="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                    :class="typeBadgeClass(character.normalizedType)"
                  >
                    {{ typeLabel(character.normalizedType) }}
                  </span>
                </div>

                <p class="mt-4 line-clamp-4 text-base leading-8 text-slate-200">
                  {{ character.displaySummary || 'No summary yet.' }}
                </p>

                <div class="mt-auto pt-5 text-sm font-medium text-sky-200 transition group-hover:text-sky-100">
                  Select Character →
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
      <aside
        v-if="selectedCharacter"
        class="fixed right-0 top-0 z-30 h-full w-[360px] border-l border-white/10 bg-[rgba(8,16,27,0.94)] backdrop-blur"
      >
        <div class="flex h-full flex-col">
          <div class="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-5">
            <div class="min-w-0">
              <div class="text-xs uppercase tracking-[0.35em] text-slate-500">Summary</div>

              <div class="mt-3 flex flex-wrap items-center gap-2">
                <h2 class="truncate text-2xl font-semibold text-white">{{ selectedCharacter.displayTitle }}</h2>
                <span
                  class="rounded-full border px-2.5 py-1 text-[11px] font-medium"
                  :class="typeBadgeClass(selectedCharacter.normalizedType)"
                >
                  {{ typeLabel(selectedCharacter.normalizedType) }}
                </span>
              </div>
            </div>

            <button
              type="button"
              class="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
              @click="clearSelectedCharacter"
            >
              <UIcon name="i-lucide-x" class="h-4 w-4" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto px-5 py-5">
            <div
              v-if="selectedCharacter.imageUrl"
              class="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
            >
              <img
                :src="selectedCharacter.imageUrl"
                :alt="selectedCharacter.displayTitle"
                class="h-72 w-full object-cover"
              >
            </div>

            <div
              v-else
              class="flex h-72 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-4xl font-semibold text-slate-300"
            >
              {{ initialsFor(selectedCharacter.displayTitle) }}
            </div>

            <p class="mt-5 whitespace-pre-wrap text-sm leading-8 text-slate-200">
              {{ selectedCharacter.displaySummary || 'No summary yet.' }}
            </p>
          </div>

          <div class="border-t border-white/10 p-5">
            <div class="flex gap-3">
              <NuxtLink
                :to="`/worlds/${worldId}/entities/${selectedCharacter.id}`"
                class="flex-1 rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-center text-sm font-medium text-sky-100 transition hover:bg-sky-400/20"
              >
                Read More
              </NuxtLink>

              <button
                type="button"
                class="flex-1 rounded-xl border border-violet-400/20 bg-violet-400/10 px-4 py-3 text-center text-sm font-medium text-violet-100 transition hover:bg-violet-400/20"
              >
                Open Sheet
              </button>
            </div>
          </div>
        </div>
      </aside>
    </Transition>

    <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
      <div
        v-if="showCreatePanel"
        class="fixed right-0 top-0 z-50 h-full w-[420px] border-l border-white/10 bg-[rgba(8,16,27,0.96)] shadow-2xl backdrop-blur"
      >
        <div class="flex h-full flex-col">
          <div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <div class="text-xs uppercase tracking-[0.35em] text-slate-500">Characters</div>
              <h3 class="mt-1 text-lg font-semibold text-white">Create Character</h3>
            </div>

            <button
              class="text-slate-400 transition hover:text-white"
              @click="closeCreatePanel"
            >
              <UIcon name="i-lucide-x" class="h-5 w-5" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto px-5 py-5">
            <div class="space-y-5">
              <div v-if="createError" class="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {{ createError }}
              </div>

              <div v-if="createSuccess" class="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {{ createSuccess }}
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-slate-500">Name</label>
                <input
                  v-model="form.title"
                  type="text"
                  placeholder="e.g. Lillian Greyskull"
                  class="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-sky-400/40 focus:bg-white/[0.08]"
                >
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-slate-500">Archetype</label>
                <div class="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    class="rounded-xl border px-3 py-2 text-sm font-medium transition"
                    :class="form.characterType === 'npc'
                      ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                      : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
                    @click="form.characterType = 'npc'"
                  >
                    NPC
                  </button>

                  <button
                    type="button"
                    class="rounded-xl border px-3 py-2 text-sm font-medium transition"
                    :class="form.characterType === 'npc_sheet'
                      ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                      : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
                    @click="form.characterType = 'npc_sheet'"
                  >
                    NPC+
                  </button>

                  <button
                    type="button"
                    class="rounded-xl border px-3 py-2 text-sm font-medium transition"
                    :class="form.characterType === 'pc'
                      ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                      : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
                    @click="form.characterType = 'pc'"
                  >
                    PC
                  </button>
                </div>
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-slate-500">Summary</label>
                <textarea
                  v-model="form.summary"
                  rows="5"
                  placeholder="A quick summary for the card and overview..."
                  class="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-sky-400/40 focus:bg-white/[0.08]"
                />
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-slate-500">Portrait</label>

                <div
                  v-if="form.imagePreviewUrl"
                  class="mb-3 overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                >
                  <img
                    :src="form.imagePreviewUrl"
                    alt="Character preview"
                    class="h-56 w-full object-cover"
                  >
                </div>

                <input
                  type="file"
                  accept="image/*"
                  class="block w-full text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/[0.12]"
                  @change="onImageChange"
                >
              </div>
            </div>
          </div>

          <div class="border-t border-white/10 p-5">
            <div class="flex gap-3">
              <button
                type="button"
                class="flex-1 rounded-xl border border-white/10 bg-white/[0.05] py-2.5 text-sm text-slate-300 transition hover:bg-white/[0.08]"
                @click="closeCreatePanel"
              >
                Cancel
              </button>

              <button
                type="button"
                class="flex-1 rounded-xl border border-emerald-400/25 bg-emerald-400/15 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/25 disabled:opacity-50"
                :disabled="!form.title.trim() || creating"
                @click="createCharacter"
              >
                {{ creating ? 'Creating…' : 'Create Character' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
