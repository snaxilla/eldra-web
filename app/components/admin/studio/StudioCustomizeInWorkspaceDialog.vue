<script setup lang="ts">
// "Customize in workspace" from Studio Browse -- Content Workspaces &
// Studio Phase 4/6 follow-up. Reuses the EXISTING workspace list/create
// and import APIs (Pass A) and the shared presentation editor
// (StudioEntityEditor.vue, Phase 4) -- no competing persistence path, no
// new import mechanism.
//
// WHY A RELEASE IMPORT, NOT A NEW "IMPORT ONE ENTITY" ENDPOINT. The
// import API only ever imports a whole release or a whole provider
// collection (optionally filtered by category) -- there is no
// "import exactly this one slug" shape, and this feature is scoped to
// REUSE what exists, not add a new import mechanism. Customizing a
// Browse row therefore imports the row's own ENTIRE release
// (`{kind:'release', packageId, version}`) into the chosen workspace --
// idempotent by the import planner's own existing rules (re-running it
// reports "unchanged" for everything already present) -- and then looks
// up the SPECIFIC entity that resulted, by its exact address (entityType
// + slug), never by guessing or opening the nearest match.
//
// IDENTITY/PROVENANCE. Unchanged from Pass A's own import path: the
// resulting workspace entity carries this release's `baseRefs`/
// `baseSourceRef` exactly as any import would. Nothing here mints a new
// identity scheme or bypasses the existing one.
//
// NO AUTOMATIC LINEAGE ADOPTION, PUBLICATION, OR LIVE BINDING. This
// dialog only calls the import API and then opens the editor -- it never
// calls adopt-lineage, publish, or the live-binding route.

import { computed, ref } from 'vue'
import { listGameSystems } from '~/lib/content-sources/registry'
import StudioEntityEditor from './StudioEntityEditor.vue'
import type { StudioResultRow } from './studioSearchQuery'

const props = defineProps<{ worldId: string | number; row: StudioResultRow }>()
const emit = defineEmits<{ (e: 'close'): void }>()

type Workspace = { id: string; workspaceKey: string; title: string; systemKey: string; status: 'active' | 'archived' }
type ImportReport = { added: number; unchanged: number; changedNeedsReview: number; unresolved: number }

const gameSystems = listGameSystems()

const workspacesState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const workspacesError = ref('')
const workspaces = ref<Workspace[]>([])
const matchingWorkspaces = computed(() => workspaces.value.filter((w) => w.status === 'active' && w.systemKey === props.row.systemKey))

const selectedWorkspaceId = ref<string | null>(null)
const showCreateForm = ref(false)
const createKey = ref('')
const createTitle = ref('')
const creating = ref(false)
const createError = ref('')

const customizing = ref(false)
const customizeError = ref('')
const importReport = ref<ImportReport | null>(null)
const resultEntityId = ref<string | null>(null)
const resultWorkspaceId = ref<string | null>(null)
const notFoundAfterImport = ref(false)

// Whole-release disclosure (Pass B review follow-up, Item 4): the import
// API has no "import exactly this one slug" shape, so "Customize" always
// imports the row's ENTIRE release. That must be disclosed BEFORE the
// real (non-dry-run) import runs, not discovered afterward in the
// report. `previewedForWorkspaceId` tracks which workspace the CURRENT
// preview was taken against, so switching the destination workspace
// (where the counts could differ -- a workspace may already hold some of
// the release) re-requires a fresh preview before the real import can run.
const previewReport = ref<ImportReport | null>(null)
const previewedForWorkspaceId = ref<string | null>(null)
const previewing = ref(false)
const previewError = ref('')
const needsFreshPreview = computed(() => previewedForWorkspaceId.value !== selectedWorkspaceId.value)

function describeError(error: unknown): string | undefined {
  const failure = error as { data?: { statusMessage?: string; message?: string } }
  return failure?.data?.statusMessage || failure?.data?.message
}

async function loadWorkspaces() {
  workspacesState.value = 'loading'
  workspacesError.value = ''
  try {
    const response = await $fetch<{ workspaces: Workspace[] }>('/api/content/workspaces')
    workspaces.value = response.workspaces
    workspacesState.value = 'ready'
  } catch (error) {
    workspacesState.value = 'error'
    workspacesError.value = describeError(error) || 'Workspaces could not be loaded.'
  }
}
loadWorkspaces()

async function createWorkspace() {
  creating.value = true
  createError.value = ''
  try {
    const response = await $fetch<{ workspace: Workspace }>('/api/content/workspaces', {
      method: 'POST',
      body: { workspaceKey: createKey.value.trim(), title: createTitle.value.trim(), description: null, systemKey: props.row.systemKey }
    })
    workspaces.value = [...workspaces.value, response.workspace]
    selectedWorkspaceId.value = response.workspace.id
    showCreateForm.value = false
    createKey.value = ''
    createTitle.value = ''
  } catch (error) {
    createError.value = describeError(error) || 'The workspace could not be created.'
  } finally {
    creating.value = false
  }
}

// Step 1 of the disclosure flow: a DRY RUN against the chosen destination
// workspace, using the EXISTING import API's own dry-run mode (nothing new
// invented) -- shows the whole-release entry count BEFORE anything is
// written, so the operator sees exactly what "Customize" is about to do.
async function preview() {
  if (!selectedWorkspaceId.value) return
  previewing.value = true
  previewError.value = ''
  previewReport.value = null
  const workspaceId = selectedWorkspaceId.value

  try {
    const response = await $fetch<{ report: ImportReport }>(`/api/content/workspaces/${workspaceId}/import`, {
      method: 'POST',
      body: { source: { kind: 'release', packageId: props.row.packageId, version: props.row.packageVersion }, dryRun: true }
    })
    previewReport.value = response.report
    previewedForWorkspaceId.value = workspaceId
  } catch (error) {
    previewError.value = describeError(error) || 'The release could not be previewed.'
  } finally {
    previewing.value = false
  }
}

// Step 2: the real import, only reachable once `preview()` has shown the
// whole-release disclosure for THIS destination workspace.
async function customize() {
  if (!selectedWorkspaceId.value || needsFreshPreview.value) return
  customizing.value = true
  customizeError.value = ''
  importReport.value = null
  resultEntityId.value = null
  notFoundAfterImport.value = false
  const workspaceId = selectedWorkspaceId.value

  try {
    const importResponse = await $fetch<{ report: ImportReport }>(`/api/content/workspaces/${workspaceId}/import`, {
      method: 'POST',
      body: { source: { kind: 'release', packageId: props.row.packageId, version: props.row.packageVersion }, dryRun: false }
    })
    importReport.value = importResponse.report

    // Locate the SPECIFIC entity this row addresses -- never the nearest
    // match, never a guess. Searching by title then filtering by the
    // exact slug client-side is the best the existing entities-list API
    // offers (there is no "find by address" endpoint); a title collision
    // across entries is narrowed by entityType too.
    const query = new URLSearchParams({ q: props.row.title, entityType: props.row.entityType, limit: '50' })
    const entitiesResponse = await $fetch<{ entities: { contentEntityId: string; slug: string }[] }>(`/api/content/workspaces/${workspaceId}/entities?${query.toString()}`)
    const match = entitiesResponse.entities.find((e) => e.slug === props.row.slug)

    if (match) {
      resultEntityId.value = match.contentEntityId
      resultWorkspaceId.value = workspaceId
    } else {
      // The import itself did not fail, but this specific entry did not
      // resolve afterward (e.g. it landed in `unresolved`) -- reported
      // honestly. Nothing is opened.
      notFoundAfterImport.value = true
    }
  } catch (error) {
    customizeError.value = describeError(error) || 'The import failed.'
  } finally {
    customizing.value = false
  }
}
</script>

<template>
  <section class="mt-3 eldra-ornate-panel rounded-none border border-eldra-accent/24 bg-eldra-panel p-4">
    <div class="flex items-start justify-between gap-3">
      <h4 class="text-sm font-semibold text-eldra-text-strong">
        Customize in workspace
      </h4>
      <button
        type="button"
        class="min-h-9 shrink-0 rounded-none border border-eldra-accent/24 px-3 text-xs text-eldra-text-soft hover:border-eldra-accent"
        @click="emit('close')"
      >
        Close
      </button>
    </div>

    <!-- Source / destination review -->
    <dl class="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
      <div class="min-w-0">
        <dt class="inline text-eldra-text-faint">Source: </dt>
        <dd class="inline break-words text-eldra-text-soft">{{ row.title }} ({{ row.packageId }}@{{ row.packageVersion }})</dd>
      </div>
      <div class="min-w-0">
        <dt class="inline text-eldra-text-faint">Game system: </dt>
        <dd class="inline text-eldra-text-soft">{{ row.systemKey }}</dd>
      </div>
    </dl>
    <p class="mt-1 text-xs text-eldra-text-faint">
      "Customize" imports this entry's WHOLE release ({{ row.packageId }}@{{ row.packageVersion }}) into the
      destination workspace -- there is no single-entry import. Everything else in that release lands there
      too; exact entry counts are shown once a destination is chosen below.
    </p>

    <template v-if="!resultEntityId">
      <div class="mt-3">
        <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Destination workspace</label>

        <p v-if="workspacesState === 'error'" class="mt-1 text-sm text-red-300">{{ workspacesError }}</p>
        <p v-else-if="workspacesState === 'ready' && !matchingWorkspaces.length" class="mt-1 text-sm text-eldra-text-faint">
          No existing workspace matches this system ({{ row.systemKey }}). Create one below.
        </p>

        <select
          v-if="matchingWorkspaces.length"
          v-model="selectedWorkspaceId"
          class="mt-1 min-h-10 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-2 text-sm text-eldra-text-strong"
        >
          <option :value="null" disabled>
            Choose a workspace…
          </option>
          <option
            v-for="workspace in matchingWorkspaces"
            :key="workspace.id"
            :value="workspace.id"
          >
            {{ workspace.title }} ({{ workspace.workspaceKey }})
          </option>
        </select>

        <button
          type="button"
          class="mt-2 min-h-9 rounded-none border border-eldra-accent/24 px-3 text-xs text-eldra-text-soft hover:border-eldra-accent"
          @click="showCreateForm = !showCreateForm"
        >
          {{ showCreateForm ? 'Cancel' : 'Create a new workspace…' }}
        </button>

        <form
          v-if="showCreateForm"
          class="mt-2 grid gap-2 rounded-none border border-eldra-accent/24 bg-eldra-well p-3 sm:grid-cols-2"
          @submit.prevent="createWorkspace"
        >
          <input
            v-model="createKey"
            type="text"
            placeholder="workspace-key"
            class="min-h-10 rounded-none border border-eldra-accent/24 bg-eldra-panel px-2 text-sm text-eldra-text-strong"
          >
          <input
            v-model="createTitle"
            type="text"
            placeholder="Title"
            class="min-h-10 rounded-none border border-eldra-accent/24 bg-eldra-panel px-2 text-sm text-eldra-text-strong"
          >
          <div class="sm:col-span-2">
            <button
              type="submit"
              class="min-h-9 rounded-none border border-eldra-accent/24 px-3 text-xs text-eldra-text-strong hover:border-eldra-accent"
              :disabled="creating || !createKey.trim() || !createTitle.trim()"
            >
              {{ creating ? 'Creating…' : `Create (${gameSystems.find((s) => s.key === row.systemKey)?.label ?? row.systemKey})` }}
            </button>
            <p v-if="createError" class="mt-1 text-xs text-red-300">{{ createError }}</p>
          </div>
        </form>

        <!-- Whole-release disclosure (Pass B review follow-up, Item 4):
             a dry-run preview must be shown, naming the WHOLE release and
             its entry count, before the real (writing) import can run. -->
        <button
          v-if="needsFreshPreview"
          type="button"
          class="mt-3 min-h-10 rounded-none border border-eldra-accent/24 px-4 text-sm text-eldra-text-strong hover:border-eldra-accent"
          :disabled="!selectedWorkspaceId || previewing"
          @click="preview"
        >
          {{ previewing ? 'Checking the release…' : 'Preview whole-release import' }}
        </button>

        <p v-if="previewError" class="mt-2 text-sm text-red-300">{{ previewError }}</p>

        <div
          v-if="!needsFreshPreview && previewReport"
          class="mt-3 rounded-none border border-amber-300/25 bg-amber-400/10 p-3 text-xs text-amber-100"
        >
          <p class="font-semibold">
            This imports the ENTIRE release, not just "{{ row.title }}":
          </p>
          <p class="mt-1">
            Source: <strong>{{ row.packageId }}@{{ row.packageVersion }}</strong> &rarr;
            Destination: <strong>{{ matchingWorkspaces.find((w) => w.id === selectedWorkspaceId)?.title ?? selectedWorkspaceId }}</strong>
          </p>
          <p class="mt-1">
            {{ previewReport.added }} entries would be added, {{ previewReport.unchanged }} already present,
            {{ previewReport.changedNeedsReview }} changed upstream (needs review),
            {{ previewReport.unresolved }} unresolved -- every one of those lands in the destination workspace,
            not only "{{ row.title }}".
          </p>
        </div>

        <button
          v-if="!needsFreshPreview"
          type="button"
          class="mt-3 min-h-10 rounded-none border border-eldra-accent/24 px-4 text-sm text-eldra-text-strong hover:border-eldra-accent"
          :disabled="customizing"
          @click="customize"
        >
          {{ customizing ? 'Importing & customizing…' : 'Confirm whole-release import & customize' }}
        </button>

        <p v-if="customizeError" class="mt-2 text-sm text-red-300">{{ customizeError }}</p>

        <p v-if="importReport" class="mt-2 text-xs text-eldra-text-soft">
          Import: {{ importReport.added }} added, {{ importReport.unchanged }} already present,
          {{ importReport.changedNeedsReview }} changed upstream (needs review),
          {{ importReport.unresolved }} unresolved.
        </p>
        <p v-if="notFoundAfterImport" class="mt-2 rounded-none border border-amber-300/25 bg-amber-400/10 p-2 text-xs text-amber-100">
          The import completed, but this specific entry could not be located in the workspace afterward
          (see the report above -- it may be unresolved). Nothing was opened.
        </p>
      </div>
    </template>

    <template v-else>
      <p class="mt-3 rounded-none border border-sky-300/25 bg-sky-400/10 p-2 text-xs text-sky-100">
        Saved here. These edits are not yet active in this World until the workspace is bound live
        (Workspaces tab).
      </p>
      <StudioEntityEditor
        class="mt-3"
        :workspace-id="resultWorkspaceId!"
        :content-entity-id="resultEntityId"
        :world-id="worldId"
        @close="emit('close')"
      />
    </template>
  </section>
</template>
