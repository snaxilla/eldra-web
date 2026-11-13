<script setup lang="ts">
// Content Studio -- Workspaces. Content Workspaces & Studio Phase 4/6
// in-app workflow: list/create a workspace, import published/provider
// content into it, open an imported entity in the presentation editor,
// and bind the workspace live to the current World.
//
// Pass A's own workspace/import/adoption operations were API-only; this
// panel is the minimum UI the Pass B brief asks for on top of them --
// it calls the SAME routes Pass A already shipped, plus Phase 4's new
// entity-editing routes and Phase 6's new binding route. No second data
// pipeline, no new capability beyond what those routes already require.

import { computed, ref, watch } from 'vue'
import { listGameSystems } from '~/lib/content-sources/registry'
import StudioEntityEditor from './StudioEntityEditor.vue'

const props = defineProps<{ worldId: string | number }>()

type Workspace = {
  id: string
  workspaceKey: string
  title: string
  description: string | null
  systemKey: string
  status: 'active' | 'archived'
  entityCount: number
}

type EntitySummary = {
  contentEntityId: string
  title: string
  slug: string
  entityType: string
  origin: 'authored' | 'imported' | 'derived'
  state: 'active' | 'disabled'
}

type Binding = { packageId: string; bindingMode: 'pinned' | 'channel' | 'workspace'; workspaceId: string | null }

const gameSystems = listGameSystems()

const workspacesState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const workspacesError = ref('')
const workspaces = ref<Workspace[]>([])
const selectedWorkspaceId = ref<string | null>(null)

async function loadWorkspaces() {
  workspacesState.value = 'loading'
  workspacesError.value = ''
  try {
    const response = await $fetch<{ workspaces: Workspace[] }>('/api/content/workspaces')
    workspaces.value = response.workspaces
    workspacesState.value = 'ready'
  } catch (error) {
    workspacesState.value = 'error'
    workspacesError.value = describeError(error) || 'Workspaces could not be loaded. Content Studio needs platform.contentworkspace.view.'
  }
}

function describeError(error: unknown): string | undefined {
  const failure = error as { data?: { statusMessage?: string; message?: string } }
  return failure?.data?.statusMessage || failure?.data?.message
}

loadWorkspaces()

// ---------------------------------------------------------------------------
// Create a workspace
// ---------------------------------------------------------------------------

const showCreateForm = ref(false)
const createKey = ref('')
const createTitle = ref('')
const createDescription = ref('')
const createSystemKey = ref(gameSystems[0]?.key ?? '')
const createError = ref('')
const creating = ref(false)

async function createWorkspace() {
  creating.value = true
  createError.value = ''
  try {
    await $fetch('/api/content/workspaces', {
      method: 'POST',
      body: { workspaceKey: createKey.value.trim(), title: createTitle.value.trim(), description: createDescription.value.trim() || null, systemKey: createSystemKey.value }
    })
    createKey.value = ''
    createTitle.value = ''
    createDescription.value = ''
    showCreateForm.value = false
    await loadWorkspaces()
  } catch (error) {
    createError.value = describeError(error) || 'The workspace could not be created.'
  } finally {
    creating.value = false
  }
}

// ---------------------------------------------------------------------------
// Entities within the selected workspace
// ---------------------------------------------------------------------------

const entitiesState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const entitiesError = ref('')
const entities = ref<EntitySummary[]>([])
const entitySearch = ref('')
const editingEntityId = ref<string | null>(null)

async function loadEntities() {
  if (!selectedWorkspaceId.value) return
  entitiesState.value = 'loading'
  entitiesError.value = ''
  try {
    const query = new URLSearchParams({ limit: '50' })
    if (entitySearch.value.trim()) query.set('q', entitySearch.value.trim())
    const response = await $fetch<{ entities: EntitySummary[] }>(`/api/content/workspaces/${selectedWorkspaceId.value}/entities?${query.toString()}`)
    entities.value = response.entities
    entitiesState.value = 'ready'
  } catch (error) {
    entitiesState.value = 'error'
    entitiesError.value = describeError(error) || 'This workspace\'s entities could not be loaded.'
  }
}

let entitySearchTimer: ReturnType<typeof setTimeout> | undefined
watch(entitySearch, () => {
  if (entitySearchTimer) clearTimeout(entitySearchTimer)
  entitySearchTimer = setTimeout(loadEntities, 250)
})

watch(selectedWorkspaceId, () => {
  editingEntityId.value = null
  entities.value = []
  if (selectedWorkspaceId.value) loadEntities()
})

function selectWorkspace(id: string) {
  selectedWorkspaceId.value = selectedWorkspaceId.value === id ? null : id
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const showImportForm = ref(false)
const importKind = ref<'provider' | 'release'>('provider')
const importGameSystemKey = ref(gameSystems[0]?.key ?? '')
const importCollectionKey = ref(gameSystems[0]?.collections[0]?.key ?? '')
const importPackageId = ref('')
const importVersion = ref('')
const importing = ref(false)
const importError = ref('')
const importReport = ref<{ added: number; unchanged: number; changedNeedsReview: number; unresolved: number } | null>(null)

const collectionsForSelectedSystem = computed(
  () => gameSystems.find((s) => s.key === importGameSystemKey.value)?.collections ?? []
)

async function runImport(dryRun: boolean) {
  if (!selectedWorkspaceId.value) return
  importing.value = true
  importError.value = ''
  if (!dryRun) importReport.value = null

  const source = importKind.value === 'provider'
    ? { kind: 'provider' as const, gameSystemKey: importGameSystemKey.value, collectionKey: importCollectionKey.value, categories: null }
    : { kind: 'release' as const, packageId: importPackageId.value.trim(), version: importVersion.value.trim() }

  try {
    const response = await $fetch<{ report: { added: number; unchanged: number; changedNeedsReview: number; unresolved: number } }>(
      `/api/content/workspaces/${selectedWorkspaceId.value}/import`,
      { method: 'POST', body: { source, dryRun } }
    )
    importReport.value = response.report
    if (!dryRun) {
      showImportForm.value = false
      await Promise.all([loadEntities(), loadWorkspaces()])
    }
  } catch (error) {
    importError.value = describeError(error) || 'The import failed.'
  } finally {
    importing.value = false
  }
}

// ---------------------------------------------------------------------------
// Live binding to the current World
// ---------------------------------------------------------------------------

const bindings = ref<Binding[]>([])
const bindingBusy = ref(false)
const bindingError = ref('')

async function loadBindings() {
  try {
    const response = await $fetch<{ bindings: Binding[] }>(`/api/worlds/${props.worldId}/content-packs`)
    bindings.value = response.bindings
  } catch {
    bindings.value = []
  }
}
loadBindings()

const liveWorkspaceBinding = computed(() => bindings.value.find((b) => b.bindingMode === 'workspace'))
const isSelectedWorkspaceLiveBound = computed(
  () => Boolean(selectedWorkspaceId.value) && liveWorkspaceBinding.value?.workspaceId === selectedWorkspaceId.value
)

async function bindLive() {
  if (!selectedWorkspaceId.value) return
  bindingBusy.value = true
  bindingError.value = ''
  try {
    await $fetch(`/api/worlds/${props.worldId}/content-workspace-binding`, {
      method: 'POST',
      body: { workspaceId: selectedWorkspaceId.value }
    })
    await loadBindings()
  } catch (error) {
    const failure = error as { data?: { code?: string } }
    bindingError.value = failure?.data?.code === 'effective-content-disabled'
      ? 'The effective content resolver is not enabled on this deployment (ELDRA_EFFECTIVE_CONTENT). Binding a live workspace requires it.'
      : describeError(error) || 'Binding failed.'
  } finally {
    bindingBusy.value = false
  }
}

async function unbindLive(workspaceId: string) {
  bindingBusy.value = true
  bindingError.value = ''
  try {
    await $fetch(`/api/worlds/${props.worldId}/content-workspace-binding/${workspaceId}`, { method: 'DELETE' })
    await loadBindings()
  } catch (error) {
    bindingError.value = describeError(error) || 'Unbind failed.'
  } finally {
    bindingBusy.value = false
  }
}
</script>

<template>
  <section class="mt-6 grid gap-5">
    <header class="eldra-ornate-panel eldra-frame-corners rounded-none border border-eldra-accent/24 bg-eldra-panel p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-eldra-text-faint">Content Studio</div>
          <h2 class="mt-2 text-2xl font-semibold text-eldra-text-strong">Workspaces</h2>
          <p class="mt-2 max-w-2xl text-sm text-eldra-text-soft">
            Create or open a workspace, import published or provider content into it, edit presentation,
            and bind it live to this World.
          </p>
        </div>
        <button
          type="button"
          class="min-h-11 rounded-none border border-eldra-accent/24 px-4 text-sm text-eldra-text-strong hover:border-eldra-accent"
          @click="showCreateForm = !showCreateForm"
        >
          {{ showCreateForm ? 'Cancel' : 'Create workspace' }}
        </button>
      </div>

      <form
        v-if="showCreateForm"
        class="mt-4 grid gap-3 border-t border-eldra-accent/24 pt-4 sm:grid-cols-2"
        @submit.prevent="createWorkspace"
      >
        <label class="grid gap-1 text-sm">
          <span class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Workspace key</span>
          <input
            v-model="createKey"
            type="text"
            placeholder="solaris-curated"
            class="min-h-11 rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
          >
        </label>
        <label class="grid gap-1 text-sm">
          <span class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Title</span>
          <input
            v-model="createTitle"
            type="text"
            class="min-h-11 rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
          >
        </label>
        <label class="grid gap-1 text-sm sm:col-span-2">
          <span class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Description (optional)</span>
          <input
            v-model="createDescription"
            type="text"
            class="min-h-11 rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
          >
        </label>
        <label class="grid gap-1 text-sm">
          <span class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Game system</span>
          <select
            v-model="createSystemKey"
            class="min-h-11 rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
          >
            <option
              v-for="system in gameSystems"
              :key="system.key"
              :value="system.key"
            >
              {{ system.label }}
            </option>
          </select>
        </label>
        <div class="sm:col-span-2">
          <button
            type="submit"
            class="min-h-11 rounded-none border border-eldra-accent/24 px-4 text-sm text-eldra-text-strong hover:border-eldra-accent"
            :disabled="creating || !createKey.trim() || !createTitle.trim()"
          >
            {{ creating ? 'Creating…' : 'Create' }}
          </button>
          <p
            v-if="createError"
            class="mt-2 text-sm text-red-300"
          >
            {{ createError }}
          </p>
        </div>
      </form>
    </header>

    <p
      v-if="workspacesState === 'error'"
      class="rounded-none border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
    >
      {{ workspacesError }}
    </p>

    <ul
      v-else
      class="grid gap-2"
    >
      <li
        v-for="workspace in workspaces"
        :key="workspace.id"
      >
        <article class="eldra-ornate-panel rounded-none border border-eldra-accent/24 bg-eldra-panel">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 p-3 text-left"
            :aria-expanded="selectedWorkspaceId === workspace.id"
            @click="selectWorkspace(workspace.id)"
          >
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold text-eldra-text-strong">{{ workspace.title }}</span>
              <span class="block font-mono text-xs text-eldra-text-faint">{{ workspace.workspaceKey }} · {{ workspace.systemKey }} · {{ workspace.entityCount }} entities</span>
            </span>
            <span
              v-if="liveWorkspaceBinding?.workspaceId === workspace.id"
              class="shrink-0 rounded-none border border-emerald-400/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-emerald-200"
            >
              Live-bound to this World
            </span>
          </button>

          <div
            v-if="selectedWorkspaceId === workspace.id"
            class="border-t border-eldra-accent/24 p-4"
          >
            <!-- Live binding control -->
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-none border border-eldra-accent/24 bg-eldra-well p-3">
              <p class="min-w-0 text-xs text-eldra-text-soft">
                <template v-if="isSelectedWorkspaceLiveBound">
                  This workspace is live-bound to this World. Saved edits are visible here immediately.
                </template>
                <template v-else-if="liveWorkspaceBinding">
                  Another workspace is live-bound to this World. Unbind it before binding this one.
                </template>
                <template v-else>
                  Not yet bound to this World — edits here are not visible in this World until bound.
                </template>
              </p>
              <button
                v-if="isSelectedWorkspaceLiveBound"
                type="button"
                class="min-h-9 shrink-0 rounded-none border border-amber-300/30 px-3 text-xs text-amber-100 hover:bg-amber-400/10"
                :disabled="bindingBusy"
                @click="unbindLive(workspace.id)"
              >
                Unbind
              </button>
              <button
                v-else-if="!liveWorkspaceBinding"
                type="button"
                class="min-h-9 shrink-0 rounded-none border border-eldra-accent/24 px-3 text-xs text-eldra-text-strong hover:border-eldra-accent"
                :disabled="bindingBusy"
                @click="bindLive"
              >
                Bind live to this World
              </button>
            </div>
            <p
              v-if="bindingError"
              class="mt-2 text-xs text-amber-200"
            >
              {{ bindingError }}
            </p>

            <!-- Import -->
            <div class="mt-4 flex items-center justify-between gap-2">
              <h4 class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Entities</h4>
              <button
                type="button"
                class="min-h-9 rounded-none border border-eldra-accent/24 px-3 text-xs text-eldra-text-soft hover:border-eldra-accent"
                @click="showImportForm = !showImportForm"
              >
                {{ showImportForm ? 'Cancel' : 'Import…' }}
              </button>
            </div>

            <form
              v-if="showImportForm"
              class="mt-2 grid gap-3 rounded-none border border-eldra-accent/24 bg-eldra-well p-3"
              @submit.prevent="runImport(false)"
            >
              <div class="flex gap-4 text-sm text-eldra-text-soft">
                <label class="flex items-center gap-1">
                  <input
                    v-model="importKind"
                    type="radio"
                    value="provider"
                  > Provider collection
                </label>
                <label class="flex items-center gap-1">
                  <input
                    v-model="importKind"
                    type="radio"
                    value="release"
                  > Published release
                </label>
              </div>

              <div
                v-if="importKind === 'provider'"
                class="grid gap-2 sm:grid-cols-2"
              >
                <select
                  v-model="importGameSystemKey"
                  class="min-h-10 rounded-none border border-eldra-accent/24 bg-eldra-panel px-2 text-sm text-eldra-text-strong"
                >
                  <option
                    v-for="system in gameSystems"
                    :key="system.key"
                    :value="system.key"
                  >
                    {{ system.label }}
                  </option>
                </select>
                <select
                  v-model="importCollectionKey"
                  class="min-h-10 rounded-none border border-eldra-accent/24 bg-eldra-panel px-2 text-sm text-eldra-text-strong"
                >
                  <option
                    v-for="collection in collectionsForSelectedSystem"
                    :key="collection.key"
                    :value="collection.key"
                  >
                    {{ collection.label }}
                  </option>
                </select>
              </div>

              <div
                v-else
                class="grid gap-2 sm:grid-cols-2"
              >
                <input
                  v-model="importPackageId"
                  type="text"
                  placeholder="eldra.solaris.xphb"
                  class="min-h-10 rounded-none border border-eldra-accent/24 bg-eldra-panel px-2 text-sm text-eldra-text-strong"
                >
                <input
                  v-model="importVersion"
                  type="text"
                  placeholder="1.0.0"
                  class="min-h-10 rounded-none border border-eldra-accent/24 bg-eldra-panel px-2 text-sm text-eldra-text-strong"
                >
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="min-h-9 rounded-none border border-eldra-accent/24 px-3 text-xs text-eldra-text-soft hover:border-eldra-accent"
                  :disabled="importing"
                  @click="runImport(true)"
                >
                  Preview (dry run)
                </button>
                <button
                  type="submit"
                  class="min-h-9 rounded-none border border-eldra-accent/24 px-3 text-xs text-eldra-text-strong hover:border-eldra-accent"
                  :disabled="importing"
                >
                  {{ importing ? 'Importing…' : 'Import' }}
                </button>
              </div>

              <p
                v-if="importReport"
                class="text-xs text-eldra-text-soft"
              >
                Added {{ importReport.added }}, unchanged {{ importReport.unchanged }}, changed (needs review)
                {{ importReport.changedNeedsReview }}, unresolved {{ importReport.unresolved }}.
              </p>
              <p
                v-if="importError"
                class="text-xs text-red-300"
              >
                {{ importError }}
              </p>
            </form>

            <!-- Entity editor, inline -->
            <StudioEntityEditor
              v-if="editingEntityId"
              class="mt-3"
              :workspace-id="workspace.id"
              :content-entity-id="editingEntityId"
              :world-id="worldId"
              @close="editingEntityId = null"
            />

            <template v-else>
              <input
                v-model="entitySearch"
                type="search"
                placeholder="Search this workspace's entities"
                class="mt-2 min-h-10 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
              >

              <p
                v-if="entitiesState === 'error'"
                class="mt-2 text-sm text-red-300"
              >
                {{ entitiesError }}
              </p>
              <p
                v-else-if="entitiesState === 'ready' && !entities.length"
                class="mt-2 text-sm text-eldra-text-faint"
              >
                No entities yet — import something above.
              </p>

              <ul class="mt-2 grid gap-1">
                <li
                  v-for="entity in entities"
                  :key="entity.contentEntityId"
                >
                  <button
                    type="button"
                    class="flex min-h-10 w-full items-center justify-between gap-2 rounded-none border border-eldra-accent/24 px-3 text-left text-sm text-eldra-text-soft hover:border-eldra-accent"
                    @click="editingEntityId = entity.contentEntityId"
                  >
                    <span class="min-w-0 truncate">{{ entity.title }}</span>
                    <span class="shrink-0 text-xs text-eldra-text-faint">{{ entity.entityType }}</span>
                  </button>
                </li>
              </ul>
            </template>
          </div>
        </article>
      </li>
    </ul>
  </section>
</template>
