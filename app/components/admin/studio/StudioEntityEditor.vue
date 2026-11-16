<script setup lang="ts">
// Universal presentation editor -- Content Workspaces & Studio Phase 4
// (content-workspaces-and-studio.md §12.3), rewritten for the direct-edit
// consolidation pass's own section 5 requirement: ONE coherent draft with
// an EXPLICIT Save/Cancel, not a save-per-field-blur model. ONE
// implementation, reached from the Workspaces panel, Studio Browse's
// "Customize in workspace" dialog, AND -- via WorldEntityDirectEditDialog,
// once an entity is already prepared -- the "Edit" action on an ordinary
// category page. Presentation only: no mechanics field, no Rules Facet
// field, and no slug field anywhere in this component.
//
// Editable fields: Title, Description, Image, Notes, Source book/page.
// Sections/facts/tags/attribution are readable in the live preview below
// but have no edit control in this pass -- still editable through the
// API, just not exposed here yet.
//
// DRAFT MODEL. `draft` holds every editable field's CURRENT value in the
// UI, seeded from the effective (inherited + authored) presentation on
// load. `dirtyPaths` compares it against `baseline` (a snapshot taken
// right after every successful load/save) -- ONLY dirty paths are ever
// sent on Save, so saving with some fields untouched can never freeze an
// inherited value into a needless override (the untouched field's path
// never appears in the request at all).
//
// REVERT stays its own immediate action (not deferred into the draft,
// unlike Save) -- reverting a field is "discard the authored opinion
// entirely," a different, simpler operation than "save this new value,"
// and immediately re-loading afterward keeps the draft/baseline
// synchronized the same way a successful Save does.
//
// CONCURRENCY. Every save/revert sends `expectedRevision` (the revision
// this component last loaded). A 409 means someone else saved first --
// handled by reloading the entity and showing the conflict banner, never
// by silently retrying with the newer revision. `loadGeneration`/
// `saveGeneration` counters discard a stale response if a newer
// load/save has started since (e.g. the entity changed out from under
// this editor instance) -- never overwrite a newer draft with an older
// response.

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import ContentPresentationPanel from '~/components/characters/ContentPresentationPanel.vue'
import WorldMediaPicker from '~/components/world/WorldMediaPicker.vue'
import type { PresentationEntry } from '~/lib/content-presentation'

const props = defineProps<{
  workspaceId: string
  contentEntityId: string
  worldId: string | number
  // The fields/live-preview layout below is `lg:grid-cols-2`, a VIEWPORT
  // breakpoint -- correct for this component's two existing callers
  // (StudioCustomizeInWorkspaceDialog, AdminStudioWorkspacesPanel), both
  // full-width admin pages. WorldEntityDirectEditDialog embeds this same
  // component inside the ~380px World entity rail, where the viewport is
  // still >= lg but the actual CONTAINER is far narrower than two columns
  // can fit, so the live-preview card overlapped the form fields. `compact`
  // forces the single-column fallback regardless of viewport width; it
  // defaults to false so both existing wide-canvas callers are unaffected.
  compact?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  // Enough for a caller to refresh a card/rail without a full reload --
  // the effective entity this save/revert just produced.
  (e: 'saved', entity: EntityDetail): void
}>()

type EntityDetail = {
  contentEntityId: string
  title: string
  slug: string
  entityType: string
  origin: 'authored' | 'imported' | 'derived'
  revision: number
  baseSourceRef: { packageId?: string; sourceBook?: string } | null
  authoredPresentation: { path: string }[]
}

type Preview = {
  basePresentation: PresentationEntry | null
  effectivePresentation: PresentationEntry | null
  imageUnavailable: boolean
  metaLines?: string[]
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'
type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

const state = ref<LoadState>('idle')
const saveState = ref<SaveState>('idle')
const errorMessage = ref('')
const entity = ref<EntityDetail | null>(null)
const preview = ref<Preview | null>(null)
const pickerOpen = ref(false)

type Draft = {
  name: string
  description: string
  notes: string
  sourceBook: string
  sourcePage: string
  image: { fileId: string; url: string } | null | undefined // undefined = inherit
}

function emptyDraft(): Draft {
  return { name: '', description: '', notes: '', sourceBook: '', sourcePage: '', image: undefined }
}

const draft = reactive<Draft>(emptyDraft())
const baseline = reactive<Draft>(emptyDraft())

const customizedPaths = computed(() => new Set((entity.value?.authoredPresentation ?? []).map((o) => o.path)))

const dirtyPaths = computed(() => {
  const dirty = new Set<string>()
  if (draft.name !== baseline.name) dirty.add('name')
  if (draft.description !== baseline.description) dirty.add('description')
  if (draft.notes !== baseline.notes) dirty.add('notes')
  if (draft.sourceBook !== baseline.sourceBook || draft.sourcePage !== baseline.sourcePage) {
    dirty.add('sourceBook')
    dirty.add('sourcePage')
  }
  if (JSON.stringify(draft.image) !== JSON.stringify(baseline.image)) dirty.add('image')
  return dirty
})

const isDirty = computed(() => dirtyPaths.value.size > 0)

function linesToArray(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean)
}

function arrayToLines(value: readonly string[] | undefined): string {
  return (value ?? []).join('\n')
}

function draftFromEffective(effective: PresentationEntry | null | undefined, customized: Set<string>): Draft {
  return {
    name: customized.has('name') ? (effective?.name ?? '') : '',
    description: customized.has('description') ? arrayToLines(effective?.description) : '',
    notes: customized.has('notes') ? arrayToLines(effective?.notes) : '',
    sourceBook: customized.has('sourceBook') ? (effective?.sourceBook ?? '') : '',
    sourcePage: customized.has('sourcePage') ? (effective?.sourcePage ?? '') : '',
    image: customized.has('image') ? (effective?.image ? { fileId: '', url: effective.image.url } : null) : undefined
  }
}

function applyDraft(target: Draft, source: Draft) {
  target.name = source.name
  target.description = source.description
  target.notes = source.notes
  target.sourceBook = source.sourceBook
  target.sourcePage = source.sourcePage
  target.image = source.image
}

let loadGeneration = 0

async function load() {
  const generation = ++loadGeneration
  state.value = 'loading'
  errorMessage.value = ''
  saveState.value = 'idle'

  try {
    const response = await $fetch<{ entity: EntityDetail; preview: Preview }>(
      `/api/content/workspaces/${props.workspaceId}/entities/${props.contentEntityId}`,
      { query: { worldId: String(props.worldId) } }
    )
    if (generation !== loadGeneration) return // a newer load/navigation started -- discard this stale response

    entity.value = response.entity
    preview.value = response.preview

    const next = draftFromEffective(response.preview.effectivePresentation, new Set((response.entity.authoredPresentation ?? []).map((o) => o.path)))
    applyDraft(draft, next)
    applyDraft(baseline, next)

    state.value = 'ready'
  } catch (error) {
    if (generation !== loadGeneration) return
    state.value = 'error'
    errorMessage.value = describeError(error) || 'This entity could not be loaded.'
  }
}

function describeError(error: unknown): string | undefined {
  const failure = error as { data?: { statusMessage?: string; message?: string } }
  return failure?.data?.statusMessage || failure?.data?.message
}

watch([() => props.workspaceId, () => props.contentEntityId], load, { immediate: true })

// Warn before an in-page navigation (not Vue Router -- this editor is
// opened as a dialog/panel, never routed to directly) discards dirty
// work the browser's own "leave site" prompt would otherwise silently
// allow through.
function beforeUnloadGuard(event: BeforeUnloadEvent) {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', beforeUnloadGuard)
  onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnloadGuard))
}

function requestClose() {
  if (isDirty.value && !window.confirm('Discard unsaved changes?')) return
  emit('close')
}

function cancelDraft() {
  if (isDirty.value && !window.confirm('Discard unsaved changes?')) return
  applyDraft(draft, baseline)
}

let saveGeneration = 0

async function save() {
  if (!entity.value || !isDirty.value) return
  const generation = ++saveGeneration
  saveState.value = 'saving'
  errorMessage.value = ''

  const edits: { path: string; value: unknown }[] = []
  if (dirtyPaths.value.has('name')) edits.push({ path: 'name', value: draft.name || null })
  if (dirtyPaths.value.has('description')) edits.push({ path: 'description', value: linesToArray(draft.description) })
  if (dirtyPaths.value.has('notes')) edits.push({ path: 'notes', value: linesToArray(draft.notes) })
  if (dirtyPaths.value.has('sourceBook')) {
    edits.push({ path: 'sourceBook', value: draft.sourceBook || null })
    edits.push({ path: 'sourcePage', value: draft.sourcePage || null })
  }
  if (dirtyPaths.value.has('image')) {
    edits.push({ path: 'image', value: draft.image === null ? null : draft.image === undefined ? undefined : { kind: 'media', fileId: draft.image.fileId } })
  }

  try {
    const response = await $fetch<{ entity: EntityDetail }>(
      `/api/content/workspaces/${props.workspaceId}/entities/${props.contentEntityId}`,
      { method: 'PATCH', body: { worldId: String(props.worldId), expectedRevision: entity.value.revision, edits } }
    )
    if (generation !== saveGeneration) return // a newer save/load started meanwhile -- never let a stale response win

    saveState.value = 'saved'
    emit('saved', response.entity)
    await load()
  } catch (error) {
    if (generation !== saveGeneration) return
    const failure = error as { statusCode?: number; response?: { status?: number } }
    if ((failure.statusCode ?? failure.response?.status) === 409) {
      saveState.value = 'conflict'
      errorMessage.value = 'This entity was saved by someone else since you loaded it. Your draft is kept below -- reload to see the latest version, or try saving again if you still want your changes applied on top.'
    } else {
      saveState.value = 'error'
      errorMessage.value = describeError(error) || 'The save failed. Your draft is kept below -- try again.'
    }
  }
}

function onImageSelected(file: { id: string; url: string }) {
  draft.image = { fileId: file.id, url: file.url }
  pickerOpen.value = false
}

function clearImage() {
  draft.image = null
}

async function revertPath(path: string) {
  if (!entity.value) return
  if (isDirty.value && !window.confirm(`Revert ${path} to its inherited value? Your other unsaved changes are kept.`)) return
  saveState.value = 'saving'
  try {
    await $fetch(`/api/content/workspaces/${props.workspaceId}/entities/${props.contentEntityId}/overrides/presentation/${path}`, {
      method: 'DELETE',
      body: { worldId: String(props.worldId), expectedRevision: entity.value.revision }
    })
    saveState.value = 'idle'
    await load()
  } catch (error) {
    saveState.value = 'error'
    errorMessage.value = describeError(error) || 'The revert failed.'
  }
}

async function revertAll() {
  if (!entity.value) return
  if (!window.confirm('Revert ALL customized fields on this entity to their inherited values?')) return
  saveState.value = 'saving'
  try {
    await $fetch(`/api/content/workspaces/${props.workspaceId}/entities/${props.contentEntityId}/overrides/presentation`, {
      method: 'DELETE',
      body: { worldId: String(props.worldId), expectedRevision: entity.value.revision }
    })
    saveState.value = 'idle'
    await load()
  } catch (error) {
    saveState.value = 'error'
    errorMessage.value = describeError(error) || 'The revert failed.'
  }
}

const checkpointLabel = ref('')
const checkpointSaved = ref(false)

async function createCheckpoint() {
  if (!checkpointLabel.value.trim()) return
  checkpointSaved.value = false
  try {
    await $fetch(`/api/content/workspaces/${props.workspaceId}/entities/${props.contentEntityId}/checkpoints`, {
      method: 'POST',
      body: { worldId: String(props.worldId), label: checkpointLabel.value.trim() }
    })
    checkpointLabel.value = ''
    checkpointSaved.value = true
  } catch (error) {
    errorMessage.value = describeError(error) || 'The checkpoint could not be saved.'
  }
}
</script>

<template>
  <section class="eldra-ornate-panel rounded-none border border-eldra-accent/24 bg-eldra-panel p-5">
    <div
      class="flex gap-3"
      :class="compact ? 'flex-col items-start' : 'items-start justify-between'"
    >
      <div class="min-w-0">
        <div class="text-xs uppercase tracking-[0.3em] text-eldra-text-faint">
          Editing
        </div>
        <h3 class="mt-1 break-words text-lg font-semibold text-eldra-text-strong">
          {{ entity?.title || '…' }}
        </h3>
        <p class="mt-1 text-xs text-eldra-text-faint">
          {{ entity?.entityType }} · {{ entity?.origin }}
          <span v-if="entity?.baseSourceRef?.sourceBook"> · Customized from {{ entity.baseSourceRef.sourceBook }}</span>
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <span
          v-if="isDirty"
          class="text-xs uppercase tracking-[0.15em] text-amber-200"
        >
          Unsaved changes
        </span>
        <span
          v-else-if="saveState === 'saved'"
          class="text-xs uppercase tracking-[0.15em] text-emerald-300"
        >
          Saved
        </span>
        <button
          type="button"
          class="min-h-11 shrink-0 rounded-none border border-eldra-accent/24 px-3 text-sm text-eldra-text-soft hover:border-eldra-accent"
          @click="requestClose"
        >
          Close
        </button>
      </div>
    </div>

    <p
      v-if="state === 'loading'"
      class="mt-4 text-sm text-eldra-text-soft"
    >
      Loading…
    </p>

    <p
      v-if="errorMessage"
      class="mt-4 rounded-none border p-3 text-sm"
      :class="saveState === 'conflict' ? 'border-amber-300/25 bg-amber-400/10 text-amber-100' : 'border-red-500/30 bg-red-500/10 text-red-200'"
      role="alert"
    >
      {{ errorMessage }}
      <button
        v-if="saveState === 'conflict'"
        type="button"
        class="ml-2 underline underline-offset-4"
        @click="load"
      >
        Reload
      </button>
    </p>

    <div
      v-if="state === 'ready' && entity"
      class="mt-5 grid gap-6"
      :class="compact ? 'grid-cols-1' : 'lg:grid-cols-2'"
    >
      <!-- Editable fields -->
      <div class="grid gap-5">
        <div>
          <div class="flex items-center justify-between gap-2">
            <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Title</label>
            <button
              v-if="customizedPaths.has('name')"
              type="button"
              class="text-xs text-eldra-accent-text underline underline-offset-4"
              :disabled="saveState === 'saving'"
              @click="revertPath('name')"
            >
              Revert
            </button>
          </div>
          <input
            v-model="draft.name"
            type="text"
            :placeholder="preview?.basePresentation?.name || 'Inherit'"
            class="mt-1 min-h-11 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
          >
        </div>

        <div>
          <div class="flex items-center justify-between gap-2">
            <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Description (one paragraph per line)</label>
            <button
              v-if="customizedPaths.has('description')"
              type="button"
              class="text-xs text-eldra-accent-text underline underline-offset-4"
              :disabled="saveState === 'saving'"
              @click="revertPath('description')"
            >
              Revert
            </button>
          </div>
          <textarea
            v-model="draft.description"
            rows="5"
            class="mt-1 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 py-2 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
          />
        </div>

        <div>
          <div class="flex items-center justify-between gap-2">
            <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Notes (one per line)</label>
            <button
              v-if="customizedPaths.has('notes')"
              type="button"
              class="text-xs text-eldra-accent-text underline underline-offset-4"
              :disabled="saveState === 'saving'"
              @click="revertPath('notes')"
            >
              Revert
            </button>
          </div>
          <textarea
            v-model="draft.notes"
            rows="3"
            class="mt-1 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 py-2 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <div class="flex items-center justify-between gap-2">
              <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Source book</label>
              <button
                v-if="customizedPaths.has('sourceBook') || customizedPaths.has('sourcePage')"
                type="button"
                class="text-xs text-eldra-accent-text underline underline-offset-4"
                :disabled="saveState === 'saving'"
                @click="revertPath('sourceBook'); revertPath('sourcePage')"
              >
                Revert
              </button>
            </div>
            <input
              v-model="draft.sourceBook"
              type="text"
              class="mt-1 min-h-11 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
            >
          </div>
          <div>
            <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Page</label>
            <input
              v-model="draft.sourcePage"
              type="text"
              class="mt-1 min-h-11 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
            >
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between gap-2">
            <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Image</label>
            <button
              v-if="customizedPaths.has('image')"
              type="button"
              class="text-xs text-eldra-accent-text underline underline-offset-4"
              :disabled="saveState === 'saving'"
              @click="revertPath('image')"
            >
              Revert
            </button>
          </div>
          <div class="mt-1 flex items-center gap-3">
            <img
              v-if="draft.image?.url || (draft.image === undefined && preview?.effectivePresentation?.image?.url)"
              :src="draft.image?.url || preview?.effectivePresentation?.image?.url"
              alt=""
              class="h-16 w-16 rounded-none border border-eldra-accent/24 object-cover"
            >
            <span
              v-else
              class="flex h-16 w-16 items-center justify-center rounded-none border border-dashed border-eldra-accent/24 text-[10px] uppercase tracking-[0.12em] text-eldra-text-ghost"
            >
              No art
            </span>
            <div class="flex flex-col gap-1">
              <button
                type="button"
                class="min-h-9 rounded-none border border-eldra-accent/24 px-3 text-xs text-eldra-text-soft hover:border-eldra-accent"
                @click="pickerOpen = true"
              >
                Choose image…
              </button>
              <button
                type="button"
                class="min-h-9 rounded-none border border-eldra-accent/24 px-3 text-xs text-eldra-text-soft hover:border-eldra-accent"
                @click="clearImage"
              >
                Suppress image
              </button>
            </div>
          </div>
          <p
            v-if="preview?.imageUnavailable"
            class="mt-1 text-xs text-amber-200"
          >
            The authored image could not be shown (missing, or not owned by this World's gallery).
          </p>
          <p
            v-if="dirtyPaths.has('image')"
            class="mt-1 text-xs text-amber-200"
          >
            Not saved yet.
          </p>
        </div>

        <div class="flex items-center gap-3 border-t border-eldra-accent/24 pt-4">
          <button
            type="button"
            class="min-h-10 rounded-none border border-eldra-accent bg-eldra-accent/10 px-4 text-sm font-medium text-eldra-text-strong hover:bg-eldra-accent/20 disabled:opacity-50"
            :disabled="!isDirty || saveState === 'saving'"
            @click="save"
          >
            {{ saveState === 'saving' ? 'Saving…' : 'Save changes' }}
          </button>
          <button
            type="button"
            class="min-h-10 rounded-none border border-eldra-accent/24 px-4 text-sm text-eldra-text-soft hover:border-eldra-accent disabled:opacity-50"
            :disabled="!isDirty || saveState === 'saving'"
            @click="cancelDraft"
          >
            Cancel
          </button>
        </div>

        <div class="border-t border-eldra-accent/24 pt-4">
          <button
            type="button"
            class="min-h-9 rounded-none border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-500/10"
            :disabled="saveState === 'saving' || !customizedPaths.size"
            @click="revertAll"
          >
            Revert all presentation overrides
          </button>
        </div>

        <div class="border-t border-eldra-accent/24 pt-4">
          <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Save a checkpoint (separate from saving edits above)</label>
          <div class="mt-1 flex gap-2">
            <input
              v-model="checkpointLabel"
              type="text"
              placeholder="e.g. Before the big revision"
              class="min-h-10 flex-1 rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
            >
            <button
              type="button"
              class="min-h-10 rounded-none border border-eldra-accent/24 px-3 text-sm text-eldra-text-soft hover:border-eldra-accent"
              :disabled="saveState === 'saving' || !checkpointLabel.trim()"
              @click="createCheckpoint"
            >
              Checkpoint
            </button>
          </div>
          <p
            v-if="checkpointSaved"
            class="mt-1 text-xs text-emerald-300"
          >
            Checkpoint saved.
          </p>
        </div>
      </div>

      <!-- Live preview -->
      <div class="min-w-0">
        <div class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">
          Preview — what this will look like
        </div>
        <div class="mt-2">
          <ContentPresentationPanel
            :entry="preview?.effectivePresentation ?? null"
            context="preview"
            empty-message="No presentation to show yet."
          />
        </div>

        <!-- Direct-edit consolidation pass, section 7: the SAME mechanics
             meta-lines the category rail already shows (established
             helpers, never invented) -- so this preview never disagrees
             with what the admin sees once they close this editor. -->
        <div
          v-if="preview?.metaLines?.length"
          class="mt-3 eldra-corner-runes rounded-none border border-eldra-accent/22 bg-eldra-panel/72 p-4 text-sm leading-7 text-slate-200"
        >
          <div class="mb-2 text-xs uppercase tracking-[0.25em] text-eldra-text-faint">
            Mechanics (not editable here)
          </div>
          <div
            v-for="line in preview.metaLines"
            :key="line"
          >
            {{ line }}
          </div>
        </div>
      </div>
    </div>

    <WorldMediaPicker
      v-model:open="pickerOpen"
      :world-id="worldId"
      title="Choose an image"
      @select="onImageSelected"
    />
  </section>
</template>
