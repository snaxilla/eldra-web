<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const search = ref('')
const typeFilter = ref<'all' | 'npc' | 'npc_sheet' | 'pc'>('all')

const showCreatePanel = ref(false)
const showEditPanel = ref(false)
const creating = ref(false)
const updating = ref(false)
const deleting = ref(false)

const createError = ref('')
const editError = ref('')
const deleteError = ref('')

const selectedCharacterId = ref<string | null>(null)
const confirmDelete = ref(false)

const presentationState = useState<{
  worldKey: string
  pageKey: string
  presentationMode: string
  backgroundFileId: string | null
  backgroundImageUrl: string | null
}>('world-page-presentation')

const presentationRefreshNonce = useState<number>('world-page-presentation-refresh-nonce', () => 0)
const presentationBusy = ref(false)
const presentationMessage = ref('')
const hiddenBgInput = ref<HTMLInputElement | null>(null)

const form = reactive({
  title: '',
  characterType: 'npc' as 'npc' | 'npc_sheet' | 'pc',
  summary: '',
  image: null as File | null,
  imagePreviewUrl: '',
  clearImage: false
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
  return 'eldra-gold-chip'
}

function goldToggleClass(active: boolean) {
  return active
    ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.18)] text-[#fff7df]'
    : 'border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] text-[#d8ceb8] hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]'
}

function imageUrlFor(entity: any) {
  if (entity?.imageUrl) return String(entity.imageUrl)
  if (entity?.image_url) return String(entity.image_url)
  if (entity?.image?.id) return `/api/assets/${entity.image.id}`
  if (typeof entity?.image === 'string' || typeof entity?.image === 'number') return `/api/assets/${entity.image}`
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
  confirmDelete.value = false
}

function clearSelectedCharacter() {
  selectedCharacterId.value = null
  confirmDelete.value = false
}

function resetForm() {
  form.title = ''
  form.characterType = 'npc'
  form.summary = ''
  form.image = null
  form.imagePreviewUrl = ''
  form.clearImage = false
  createError.value = ''
  editError.value = ''
}

function setFormFromCharacter(character: any) {
  resetForm()
  form.title = String(character?.displayTitle || '')
  form.characterType =
    character?.normalizedType === 'pc' ? 'pc' :
    character?.normalizedType === 'npc_sheet' ? 'npc_sheet' :
    'npc'
  form.summary = String(character?.displaySummary || '')
  form.image = null
  form.imagePreviewUrl = character?.imageUrl ? String(character.imageUrl) : ''
  form.clearImage = false
}

function openCreatePanel() {
  resetForm()
  showCreatePanel.value = true
}

function closeCreatePanel() {
  showCreatePanel.value = false
  createError.value = ''
}

function openEditPanel() {
  if (!selectedCharacter.value) return
  setFormFromCharacter(selectedCharacter.value)
  showEditPanel.value = true
  confirmDelete.value = false
}

function closeEditPanel() {
  showEditPanel.value = false
  editError.value = ''
  form.image = null
  form.clearImage = false
}

function onImageChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] || null

  form.image = file
  form.clearImage = false

  if (form.imagePreviewUrl && form.imagePreviewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(form.imagePreviewUrl)
  }
  form.imagePreviewUrl = ''

  if (file) {
    form.imagePreviewUrl = URL.createObjectURL(file)
  } else if (selectedCharacter.value?.imageUrl) {
    form.imagePreviewUrl = String(selectedCharacter.value.imageUrl)
  }
}

function removeCurrentImage() {
  form.image = null
  form.imagePreviewUrl = ''
  form.clearImage = true
}

async function createCharacter() {
  createError.value = ''

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

async function updateCharacter() {
  if (!selectedCharacter.value) return

  editError.value = ''

  if (!form.title.trim()) {
    editError.value = 'Character name is required.'
    return
  }

  updating.value = true

  try {
    const body = new FormData()
    body.append('title', form.title.trim())
    body.append('characterType', form.characterType)
    body.append('summary', form.summary.trim())
    body.append('clearImage', form.clearImage ? 'true' : 'false')

    if (form.image) {
      body.append('image', form.image)
    }

    const updated = await $fetch<any>(`/api/worlds/${worldId.value}/characters/${selectedCharacter.value.id}/update`, {
      method: 'POST',
      body
    })

    await refresh()
    closeEditPanel()

    if (updated?.id) {
      selectedCharacterId.value = String(updated.id)
    }
  } catch (error: any) {
    editError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to update character.'
  } finally {
    updating.value = false
  }
}

async function deleteCharacter() {
  if (!selectedCharacter.value) return

  deleteError.value = ''
  deleting.value = true

  try {
    const deletingId = String(selectedCharacter.value.id)
    await $fetch(`/api/worlds/${worldId.value}/characters/${deletingId}`, {
      method: 'DELETE'
    })

    await refresh()

    if (selectedCharacterId.value === deletingId) {
      selectedCharacterId.value = null
    }

    confirmDelete.value = false
    closeEditPanel()
  } catch (error: any) {
    deleteError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to delete character.'
  } finally {
    deleting.value = false
  }
}

async function setPresentationMode(nextMode: 'immersive' | 'muted' | 'neutral') {
  presentationBusy.value = true
  presentationMessage.value = ''

  try {
    const saved = await $fetch<{
      success: boolean
      worldKey: string
      pageKey: string
      presentationMode: string
      backgroundFileId: string | null
      backgroundImageUrl: string | null
    }>(`/api/worlds/${worldId.value}/presentation/characters`, {
      method: 'POST',
      body: {
        presentationMode: nextMode,
        backgroundFileId: presentationState.value?.backgroundFileId || null
      }
    })

    presentationState.value = {
      worldKey: saved.worldKey,
      pageKey: saved.pageKey,
      presentationMode: saved.presentationMode || nextMode,
      backgroundFileId: saved.backgroundFileId || null,
      backgroundImageUrl: saved.backgroundImageUrl || (saved.backgroundFileId ? `/api/assets/${saved.backgroundFileId}` : null)
    }

    presentationRefreshNonce.value++
    presentationMessage.value = `Mode set to ${nextMode}.`
  } catch (error: any) {
    presentationMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to save presentation mode.'
  } finally {
    presentationBusy.value = false
  }
}

function triggerBackgroundUpload() {
  hiddenBgInput.value?.click()
}

async function onBackgroundFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return

  presentationBusy.value = true
  presentationMessage.value = ''

  try {
    const formData = new FormData()
    formData.append('file', file)

    const uploaded = await $fetch<{ success: boolean; fileId: string | null; imageUrl: string | null }>(
      `/api/worlds/${worldId.value}/presentation/upload-background`,
      {
        method: 'POST',
        body: formData
      }
    )

    const saved = await $fetch<{
      success: boolean
      worldKey: string
      pageKey: string
      presentationMode: string
      backgroundFileId: string | null
      backgroundImageUrl: string | null
    }>(`/api/worlds/${worldId.value}/presentation/characters`, {
      method: 'POST',
      body: {
        presentationMode: (presentationState.value?.presentationMode || 'neutral') === 'neutral' ? 'immersive' : (presentationState.value?.presentationMode || 'immersive'),
        backgroundFileId: uploaded.fileId
      }
    })

    presentationState.value = {
      worldKey: saved.worldKey,
      pageKey: saved.pageKey,
      presentationMode: saved.presentationMode || 'immersive',
      backgroundFileId: saved.backgroundFileId || uploaded.fileId || null,
      backgroundImageUrl: saved.backgroundImageUrl || uploaded.imageUrl || null
    }

    presentationRefreshNonce.value++
    presentationMessage.value = 'Background updated.'
  } catch (error: any) {
    presentationMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to upload background.'
  } finally {
    presentationBusy.value = false
    input.value = ''
  }
}

async function clearBackground() {
  presentationBusy.value = true
  presentationMessage.value = ''

  try {
    const saved = await $fetch<{
      success: boolean
      worldKey: string
      pageKey: string
      presentationMode: string
      backgroundFileId: string | null
      backgroundImageUrl: string | null
    }>(`/api/worlds/${worldId.value}/presentation/characters`, {
      method: 'POST',
      body: {
        presentationMode: presentationState.value?.presentationMode || 'neutral',
        backgroundFileId: null
      }
    })

    presentationState.value = {
      worldKey: saved.worldKey,
      pageKey: saved.pageKey,
      presentationMode: saved.presentationMode || 'neutral',
      backgroundFileId: null,
      backgroundImageUrl: null
    }

    presentationRefreshNonce.value++
    presentationMessage.value = 'Background cleared.'
  } catch (error: any) {
    presentationMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to clear background.'
  } finally {
    presentationBusy.value = false
  }
}

onBeforeUnmount(() => {
  if (form.imagePreviewUrl && form.imagePreviewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(form.imagePreviewUrl)
  }
})
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-[1900px] p-6">
      <div :class="selectedCharacter || mode === 'build' ? 'pr-[380px]' : ''" class="transition-all duration-200">
        <section class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes rounded-none border p-6 backdrop-blur-xl shadow-xl">
          <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div class="eldra-kicker text-xs">Characters</div>
              <h1 class="eldra-title mt-2 text-3xl font-semibold">{{ world?.name || 'World' }}</h1>
              <p class="mt-2 max-w-3xl text-sm text-[#d8ceb8]">
                Browse player characters, NPCs, and sheet-enabled combatants in one roster-first view.
              </p>
            </div>

            <div class="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                class="eldra-button rounded-none px-4 py-2.5 text-sm font-medium"
                @click="openCreatePanel"
              >
                Add Character
              </button>

              <button
                type="button"
                class="eldra-button rounded-none px-4 py-2.5 text-sm"
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
              class="eldra-input w-full rounded-none px-4 py-3 text-sm placeholder-[#81745e]"
            >

            <div class="flex flex-wrap gap-2">
              <button type="button" class="rounded-none border px-3 py-2 text-xs font-medium transition" :class="goldToggleClass(typeFilter === 'all')" @click="typeFilter = 'all'">All ({{ characterCounts.all }})</button>
              <button type="button" class="rounded-none border px-3 py-2 text-xs font-medium transition" :class="goldToggleClass(typeFilter === 'npc')" @click="typeFilter = 'npc'">NPCs ({{ characterCounts.npc }})</button>
              <button type="button" class="rounded-none border px-3 py-2 text-xs font-medium transition" :class="goldToggleClass(typeFilter === 'npc_sheet')" @click="typeFilter = 'npc_sheet'">NPC+ ({{ characterCounts.npc_sheet }})</button>
              <button type="button" class="rounded-none border px-3 py-2 text-xs font-medium transition" :class="goldToggleClass(typeFilter === 'pc')" @click="typeFilter = 'pc'">PCs ({{ characterCounts.pc }})</button>
            </div>
          </div>
        </section>

        <section v-if="pending" class="mt-6 eldra-ornate-panel eldra-frame-corners rounded-none border p-6 text-[#d8ceb8] shadow-xl">
          Loading characters...
        </section>

        <section v-else-if="!filteredCharacters.length" class="mt-6 eldra-ornate-panel eldra-frame-corners rounded-none border p-10 text-center shadow-xl">
          <div class="text-lg font-medium text-white">No characters found</div>
          <p class="mt-2 text-sm text-[#d8ceb8]">
            Add characters manually or import supporting content, then come back here to manage the roster.
          </p>
        </section>

        <section v-else class="mt-6 grid auto-rows-fr gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          <div
            v-for="character in filteredCharacters"
            :key="character.id"
            class="eldra-ornate-card eldra-frame-corners eldra-frame-medallion eldra-corner-runes eldra-card-glyph group h-full cursor-pointer overflow-hidden rounded-none border backdrop-blur-xl transition hover:border-[rgba(201,164,90,0.62)]"
            :class="isSelected(character)
              ? 'eldra-selected-glow scale-[1.025]'
              : 'opacity-95'"
            @click="selectCharacter(character)"
          >
            <div class="grid min-h-[220px] grid-cols-[112px_minmax(0,1fr)]">
              <div class="eldra-image-frame border-r border-[rgba(201,164,90,0.24)] bg-black/20">
                <img v-if="character.imageUrl" :src="character.imageUrl" :alt="character.displayTitle" class="h-full w-full object-cover object-[center_15%]">
                <div v-else class="flex h-full w-full items-center justify-center bg-[rgba(20,17,12,0.72)] text-2xl font-semibold text-[#d8ceb8]">
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

                  <span class="shrink-0 rounded-none border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]" :class="typeBadgeClass(character.normalizedType)">
                    {{ typeLabel(character.normalizedType) }}
                  </span>
                </div>

                <p class="mt-4 line-clamp-4 text-base leading-8 text-[#d8ceb8]">
                  {{ character.displaySummary || 'No summary yet.' }}
                </p>

                <div class="eldra-arcane-link mt-auto pt-5 text-sm font-medium transition">
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
        v-if="selectedCharacter || mode === 'build'"
        class="eldra-ornate-panel eldra-frame-corners fixed right-0 top-0 z-30 h-full w-[360px] border-l backdrop-blur-xl"
      >
        <div v-if="selectedCharacter" class="flex h-full flex-col">
          <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-5">
            <div class="min-w-0">
              <div class="eldra-kicker text-xs">{{ mode === 'build' ? 'Character Build' : 'Summary' }}</div>

              <div class="mt-3 flex flex-wrap items-center gap-2">
                <h2 class="truncate text-2xl font-semibold text-white">{{ selectedCharacter.displayTitle }}</h2>
                <span class="rounded-none border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]" :class="typeBadgeClass(selectedCharacter.normalizedType)">
                  {{ typeLabel(selectedCharacter.normalizedType) }}
                </span>
              </div>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-2 text-[#b5a88d] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
              @click="clearSelectedCharacter"
            >
              <UIcon name="i-lucide-x" class="h-4 w-4" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto px-5 py-5">
            <div v-if="selectedCharacter.imageUrl" class="eldra-image-frame overflow-hidden rounded-none border bg-black/20">
              <img :src="selectedCharacter.imageUrl" :alt="selectedCharacter.displayTitle" class="h-72 w-full object-cover object-[center_15%]">
            </div>

            <div v-else class="flex h-72 items-center justify-center rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] text-4xl font-semibold text-[#d8ceb8]">
              {{ initialsFor(selectedCharacter.displayTitle) }}
            </div>

            <p class="mt-5 whitespace-pre-wrap text-sm leading-8 text-[#d8ceb8]">
              {{ selectedCharacter.displaySummary || 'No summary yet.' }}
            </p>
          </div>

          <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
            <div v-if="deleteError" class="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {{ deleteError }}
            </div>

            <div class="grid gap-3">
              <div class="flex gap-3">
                <NuxtLink
                  :to="`/worlds/${worldId}/entities/${selectedCharacter.id}`"
                  class="flex-1 eldra-button rounded-none px-4 py-3 text-center text-sm font-medium"
                >
                  Read More
                </NuxtLink>

                <button
                  type="button"
                  class="flex-1 eldra-button rounded-none px-4 py-3 text-center text-sm font-medium"
                >
                  Open Sheet
                </button>
              </div>

              <div v-if="mode === 'build'" class="flex gap-3">
                <button
                  type="button"
                  class="flex-1 eldra-button rounded-none px-4 py-3 text-center text-sm font-medium"
                  @click="openEditPanel"
                >
                  Edit
                </button>

                <button
                  v-if="!confirmDelete"
                  type="button"
                  class="flex-1 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-sm font-medium text-red-100 transition hover:bg-red-500/20"
                  @click="confirmDelete = true"
                >
                  Delete
                </button>

                <button
                  v-else
                  type="button"
                  class="flex-1 rounded-xl border border-red-500/30 bg-red-500/20 px-4 py-3 text-center text-sm font-medium text-red-50 transition hover:bg-red-500/30 disabled:opacity-50"
                  :disabled="deleting"
                  @click="deleteCharacter"
                >
                  {{ deleting ? 'Deleting…' : 'Confirm Delete' }}
                </button>
              </div>

              <button
                v-if="mode === 'build' && confirmDelete"
                type="button"
                class="eldra-button rounded-none px-4 py-2.5 text-sm"
                @click="confirmDelete = false"
              >
                Cancel Delete
              </button>
            </div>
          </div>
        </div>

        <div v-else class="flex h-full flex-col">
          <div class="border-b border-[rgba(201,164,90,0.22)] px-5 py-5">
            <div class="eldra-kicker text-xs">Page Build</div>
            <div class="mt-3 text-2xl font-semibold text-white">Characters</div>
          </div>

          <div class="flex-1 overflow-y-auto px-5 py-5">
            <div class="grid grid-cols-3 gap-2">
              <button
                type="button"
                class="rounded-xl border px-3 py-2 text-xs font-medium transition"
                :class="(presentationState?.presentationMode || 'neutral') === 'immersive'
                  ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                  : 'border-white/10 bg-white/[0.04] text-[#d8ceb8] hover:bg-white/[0.08]'"
                :disabled="presentationBusy"
                @click="setPresentationMode('immersive')"
              >
                Immersive
              </button>

              <button
                type="button"
                class="rounded-xl border px-3 py-2 text-xs font-medium transition"
                :class="(presentationState?.presentationMode || 'neutral') === 'muted'
                  ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                  : 'border-white/10 bg-white/[0.04] text-[#d8ceb8] hover:bg-white/[0.08]'"
                :disabled="presentationBusy"
                @click="setPresentationMode('muted')"
              >
                Muted
              </button>

              <button
                type="button"
                class="rounded-xl border px-3 py-2 text-xs font-medium transition"
                :class="(presentationState?.presentationMode || 'neutral') === 'neutral'
                  ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                  : 'border-white/10 bg-white/[0.04] text-[#d8ceb8] hover:bg-white/[0.08]'"
                :disabled="presentationBusy"
                @click="setPresentationMode('neutral')"
              >
                Neutral
              </button>
            </div>

            <div class="mt-4 flex gap-2">
              <button
                type="button"
                class="flex-1 eldra-button rounded-none px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                :disabled="presentationBusy"
                @click="triggerBackgroundUpload"
              >
                {{ presentationBusy ? 'Working…' : 'Set Background' }}
              </button>

              <button
                type="button"
                class="eldra-button rounded-none px-4 py-2.5 text-sm disabled:opacity-50"
                :disabled="presentationBusy"
                @click="clearBackground"
              >
                Clear
              </button>
            </div>

            <input
              ref="hiddenBgInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onBackgroundFileChange"
            >

            <div
              v-if="presentationState?.backgroundImageUrl"
              class="mt-4 overflow-hidden rounded-none border border-[rgba(201,164,90,0.24)] bg-black/20"
            >
              <img :src="presentationState.backgroundImageUrl" alt="Background preview" class="h-28 w-full object-cover object-[center_15%]">
            </div>

            <div class="mt-4 text-xs leading-6 text-[#9f9278]">
              Build-mode page controls live here when nothing is selected. Later this becomes DM/Admin-gated instead of build-mode-only.
            </div>

            <div
              v-if="presentationMessage"
              class="mt-4 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs text-[#d8ceb8]"
            >
              {{ presentationMessage }}
            </div>
          </div>
        </div>
      </aside>
    </Transition>

    <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
      <div
        v-if="showCreatePanel"
        class="fixed right-0 top-0 z-50 h-full w-[420px] border-l border-[rgba(201,164,90,0.28)] bg-[linear-gradient(to_bottom,rgba(14,12,8,0.96),rgba(6,5,4,0.94))] shadow-2xl backdrop-blur"
      >
        <div class="flex h-full flex-col">
          <div class="flex items-center justify-between border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
            <div>
              <div class="eldra-kicker text-xs">Characters</div>
              <h3 class="mt-1 text-lg font-semibold text-white">Create Character</h3>
            </div>

            <button class="text-[#b5a88d] transition hover:text-[#fff7df]" @click="closeCreatePanel">
              <UIcon name="i-lucide-x" class="h-5 w-5" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto px-5 py-5">
            <div class="space-y-5">
              <div v-if="createError" class="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {{ createError }}
              </div>

              <div>
                <label class="mb-1.5 block eldra-kicker text-xs">Name</label>
                <input v-model="form.title" type="text" placeholder="e.g. Lillian Greyskull" class="w-full eldra-input rounded-none px-4 py-2.5 text-sm placeholder-[#81745e]">
              </div>

              <div>
                <label class="mb-1.5 block eldra-kicker text-xs">Archetype</label>
                <div class="grid grid-cols-3 gap-2">
                  <button type="button" class="rounded-none border px-3 py-2 text-sm font-medium transition" :class="goldToggleClass(form.characterType === 'npc')" @click="form.characterType = 'npc'">NPC</button>
                  <button type="button" class="rounded-none border px-3 py-2 text-sm font-medium transition" :class="goldToggleClass(form.characterType === 'npc_sheet')" @click="form.characterType = 'npc_sheet'">NPC+</button>
                  <button type="button" class="rounded-none border px-3 py-2 text-sm font-medium transition" :class="goldToggleClass(form.characterType === 'pc')" @click="form.characterType = 'pc'">PC</button>
                </div>
              </div>

              <div>
                <label class="mb-1.5 block eldra-kicker text-xs">Summary</label>
                <textarea v-model="form.summary" rows="5" placeholder="A quick summary for the card and overview..." class="w-full eldra-input rounded-none px-4 py-3 text-sm placeholder-[#81745e]" />
              </div>

              <div>
                <label class="mb-1.5 block eldra-kicker text-xs">Portrait</label>

                <div v-if="form.imagePreviewUrl" class="mb-3 overflow-hidden rounded-none border border-[rgba(201,164,90,0.24)] bg-black/20">
                  <img :src="form.imagePreviewUrl" alt="Character preview" class="h-56 w-full object-cover object-[center_15%]">
                </div>

                <input type="file" accept="image/*" class="block w-full text-sm text-[#d8ceb8] file:mr-4 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/[0.12]" @change="onImageChange">
              </div>
            </div>
          </div>

          <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
            <div class="flex gap-3">
              <button type="button" class="flex-1 rounded-xl border border-white/10 bg-white/[0.05] py-2.5 text-sm text-[#d8ceb8] transition hover:bg-white/[0.08]" @click="closeCreatePanel">
                Cancel
              </button>

              <button type="button" class="flex-1 rounded-xl border border-emerald-400/25 bg-emerald-400/15 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/25 disabled:opacity-50" :disabled="!form.title.trim() || creating" @click="createCharacter">
                {{ creating ? 'Creating…' : 'Create Character' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
      <div
        v-if="showEditPanel"
        class="fixed right-0 top-0 z-50 h-full w-[420px] border-l border-[rgba(201,164,90,0.28)] bg-[linear-gradient(to_bottom,rgba(14,12,8,0.96),rgba(6,5,4,0.94))] shadow-2xl backdrop-blur"
      >
        <div class="flex h-full flex-col">
          <div class="flex items-center justify-between border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
            <div>
              <div class="eldra-kicker text-xs">Characters</div>
              <h3 class="mt-1 text-lg font-semibold text-white">Edit Character</h3>
            </div>

            <button class="text-[#b5a88d] transition hover:text-[#fff7df]" @click="closeEditPanel">
              <UIcon name="i-lucide-x" class="h-5 w-5" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto px-5 py-5">
            <div class="space-y-5">
              <div v-if="editError" class="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {{ editError }}
              </div>

              <div>
                <label class="mb-1.5 block eldra-kicker text-xs">Name</label>
                <input v-model="form.title" type="text" class="w-full eldra-input rounded-none px-4 py-2.5 text-sm placeholder-[#81745e]">
              </div>

              <div>
                <label class="mb-1.5 block eldra-kicker text-xs">Archetype</label>
                <div class="grid grid-cols-3 gap-2">
                  <button type="button" class="rounded-none border px-3 py-2 text-sm font-medium transition" :class="goldToggleClass(form.characterType === 'npc')" @click="form.characterType = 'npc'">NPC</button>
                  <button type="button" class="rounded-none border px-3 py-2 text-sm font-medium transition" :class="goldToggleClass(form.characterType === 'npc_sheet')" @click="form.characterType = 'npc_sheet'">NPC+</button>
                  <button type="button" class="rounded-none border px-3 py-2 text-sm font-medium transition" :class="goldToggleClass(form.characterType === 'pc')" @click="form.characterType = 'pc'">PC</button>
                </div>
              </div>

              <div>
                <label class="mb-1.5 block eldra-kicker text-xs">Summary</label>
                <textarea v-model="form.summary" rows="5" class="w-full eldra-input rounded-none px-4 py-3 text-sm placeholder-[#81745e]" />
              </div>

              <div>
                <label class="mb-1.5 block eldra-kicker text-xs">Portrait</label>

                <div v-if="form.imagePreviewUrl" class="mb-3 overflow-hidden rounded-none border border-[rgba(201,164,90,0.24)] bg-black/20">
                  <img :src="form.imagePreviewUrl" alt="Character preview" class="h-56 w-full object-cover">
                </div>

                <div class="flex gap-3">
                  <input type="file" accept="image/*" class="block w-full text-sm text-[#d8ceb8] file:mr-4 file:rounded-xl file:border-0 file:bg-white/[0.08] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/[0.12]" @change="onImageChange">

                  <button
                    v-if="form.imagePreviewUrl"
                    type="button"
                    class="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-100 transition hover:bg-red-500/20"
                    @click="removeCurrentImage"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
            <div class="flex gap-3">
              <button type="button" class="flex-1 rounded-xl border border-white/10 bg-white/[0.05] py-2.5 text-sm text-[#d8ceb8] transition hover:bg-white/[0.08]" @click="closeEditPanel">
                Cancel
              </button>

              <button type="button" class="flex-1 rounded-xl border border-amber-400/25 bg-amber-400/15 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-400/25 disabled:opacity-50" :disabled="!form.title.trim() || updating" @click="updateCharacter">
                {{ updating ? 'Saving…' : 'Save Changes' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
