<script setup lang="ts">
// Universal presentation editor -- Content Workspaces & Studio Phase 4
// (content-workspaces-and-studio.md §12.3). ONE implementation, reached
// from the Workspaces panel (below). Presentation only: no mechanics
// field, no Rules Facet field, and no slug field anywhere in this
// component, matching this pass's own explicit scope.
//
// Editable fields, per the Pass B brief's own minimum list: Title,
// Description, Image, Notes. Sections/facts/tags/attribution are
// readable in the live preview below but have no edit control in this
// pass -- still editable through the API, just not exposed here yet
// (see the Pass B handoff's own "Remaining" note).
//
// CONCURRENCY. Every save/revert sends `expectedRevision` (the revision
// this component last loaded). A 409 means someone else saved first --
// handled by reloading the entity and showing the conflict banner, never
// by silently retrying with the newer revision (that would discard
// nothing of the OTHER edit, but it could silently discard THIS one if
// the user had typed something new since the failed save).

import { computed, ref, watch } from 'vue'
import ContentPresentationPanel from '~/components/characters/ContentPresentationPanel.vue'
import WorldMediaPicker from '~/components/world/WorldMediaPicker.vue'
import type { PresentationEntry } from '~/lib/content-presentation'

const props = defineProps<{
  workspaceId: string
  contentEntityId: string
  worldId: string | number
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

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
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

const state = ref<LoadState>('idle')
const errorMessage = ref('')
const entity = ref<EntityDetail | null>(null)
const preview = ref<Preview | null>(null)
const saving = ref(false)
const conflict = ref(false)
const pickerOpen = ref(false)

// Editable draft fields -- initialized from the EFFECTIVE value on load
// (what the entity currently shows), so opening the editor never looks
// like it reset anything the author already customized.
const draftName = ref('')
const draftDescription = ref('')
const draftNotes = ref('')
const draftSourceBook = ref('')
const draftSourcePage = ref('')
const draftImage = ref<{ fileId: string; url: string } | null | undefined>(undefined) // undefined = inherit

const customizedPaths = computed(() => new Set((entity.value?.authoredPresentation ?? []).map((o) => o.path)))

function linesToArray(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean)
}

function arrayToLines(value: readonly string[] | undefined): string {
  return (value ?? []).join('\n')
}

async function load() {
  state.value = 'loading'
  errorMessage.value = ''
  conflict.value = false

  try {
    const response = await $fetch<{ entity: EntityDetail; preview: Preview }>(
      `/api/content/workspaces/${props.workspaceId}/entities/${props.contentEntityId}`,
      { query: { worldId: String(props.worldId) } }
    )
    entity.value = response.entity
    preview.value = response.preview

    const effective = response.preview.effectivePresentation
    draftName.value = customizedPaths.value.has('name') ? (effective?.name ?? '') : ''
    draftDescription.value = customizedPaths.value.has('description') ? arrayToLines(effective?.description) : ''
    draftNotes.value = customizedPaths.value.has('notes') ? arrayToLines(effective?.notes) : ''
    draftSourceBook.value = customizedPaths.value.has('sourceBook') ? (effective?.sourceBook ?? '') : ''
    draftSourcePage.value = customizedPaths.value.has('sourcePage') ? (effective?.sourcePage ?? '') : ''
    draftImage.value = customizedPaths.value.has('image')
      ? (effective?.image ? { fileId: '', url: effective.image.url } : null)
      : undefined

    state.value = 'ready'
  } catch (error) {
    state.value = 'error'
    errorMessage.value = describeError(error) || 'This entity could not be loaded.'
  }
}

function describeError(error: unknown): string | undefined {
  const failure = error as { data?: { statusMessage?: string; message?: string } }
  return failure?.data?.statusMessage || failure?.data?.message
}

watch([() => props.workspaceId, () => props.contentEntityId], load, { immediate: true })

type Edit = { path: string; value: unknown }

async function save(edits: Edit[]) {
  if (!entity.value || !edits.length) return
  saving.value = true
  errorMessage.value = ''

  try {
    const response = await $fetch<{ entity: EntityDetail }>(
      `/api/content/workspaces/${props.workspaceId}/entities/${props.contentEntityId}`,
      { method: 'PATCH', body: { expectedRevision: entity.value.revision, edits } }
    )
    entity.value = response.entity
    await load()
  } catch (error) {
    const failure = error as { statusCode?: number; response?: { status?: number } }
    if ((failure.statusCode ?? failure.response?.status) === 409) {
      conflict.value = true
      errorMessage.value = 'This entity was saved by someone else since you loaded it. Reload to see the latest version before editing further.'
    } else {
      errorMessage.value = describeError(error) || 'The save failed.'
    }
  } finally {
    saving.value = false
  }
}

function saveName() { save([{ path: 'name', value: draftName.value || null }]) }
function saveDescription() { save([{ path: 'description', value: linesToArray(draftDescription.value) }]) }
function saveNotes() { save([{ path: 'notes', value: linesToArray(draftNotes.value) }]) }
function saveSource() {
  save([
    { path: 'sourceBook', value: draftSourceBook.value || null },
    { path: 'sourcePage', value: draftSourcePage.value || null }
  ])
}

function onImageSelected(file: { id: string; url: string }) {
  draftImage.value = { fileId: file.id, url: file.url }
  pickerOpen.value = false
  save([{ path: 'image', value: { kind: 'media', fileId: file.id } }])
}

function clearImage() {
  draftImage.value = null
  save([{ path: 'image', value: null }])
}

async function revertPath(path: string) {
  if (!entity.value) return
  saving.value = true
  try {
    await $fetch(`/api/content/workspaces/${props.workspaceId}/entities/${props.contentEntityId}/overrides/presentation/${path}`, {
      method: 'DELETE',
      body: { expectedRevision: entity.value.revision }
    })
    await load()
  } catch (error) {
    errorMessage.value = describeError(error) || 'The revert failed.'
  } finally {
    saving.value = false
  }
}

async function revertAll() {
  if (!entity.value) return
  saving.value = true
  try {
    await $fetch(`/api/content/workspaces/${props.workspaceId}/entities/${props.contentEntityId}/overrides/presentation`, {
      method: 'DELETE',
      body: { expectedRevision: entity.value.revision }
    })
    await load()
  } catch (error) {
    errorMessage.value = describeError(error) || 'The revert failed.'
  } finally {
    saving.value = false
  }
}

const checkpointLabel = ref('')
const checkpointSaved = ref(false)

async function createCheckpoint() {
  if (!checkpointLabel.value.trim()) return
  saving.value = true
  checkpointSaved.value = false
  try {
    await $fetch(`/api/content/workspaces/${props.workspaceId}/entities/${props.contentEntityId}/checkpoints`, {
      method: 'POST',
      body: { label: checkpointLabel.value.trim() }
    })
    checkpointLabel.value = ''
    checkpointSaved.value = true
  } catch (error) {
    errorMessage.value = describeError(error) || 'The checkpoint could not be saved.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="eldra-ornate-panel rounded-none border border-eldra-accent/24 bg-eldra-panel p-5">
    <div class="flex items-start justify-between gap-3">
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
      <button
        type="button"
        class="min-h-11 shrink-0 rounded-none border border-eldra-accent/24 px-3 text-sm text-eldra-text-soft hover:border-eldra-accent"
        @click="emit('close')"
      >
        Close
      </button>
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
      :class="conflict ? 'border-amber-300/25 bg-amber-400/10 text-amber-100' : 'border-red-500/30 bg-red-500/10 text-red-200'"
      role="alert"
    >
      {{ errorMessage }}
      <button
        v-if="conflict"
        type="button"
        class="ml-2 underline underline-offset-4"
        @click="load"
      >
        Reload
      </button>
    </p>

    <div
      v-if="state === 'ready' && entity"
      class="mt-5 grid gap-6 lg:grid-cols-2"
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
              :disabled="saving"
              @click="revertPath('name')"
            >
              Revert
            </button>
          </div>
          <input
            v-model="draftName"
            type="text"
            :placeholder="preview?.basePresentation?.name || 'Inherit'"
            class="mt-1 min-h-11 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
            @blur="draftName && saveName()"
          >
        </div>

        <div>
          <div class="flex items-center justify-between gap-2">
            <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Description (one paragraph per line)</label>
            <button
              v-if="customizedPaths.has('description')"
              type="button"
              class="text-xs text-eldra-accent-text underline underline-offset-4"
              :disabled="saving"
              @click="revertPath('description')"
            >
              Revert
            </button>
          </div>
          <textarea
            v-model="draftDescription"
            rows="5"
            class="mt-1 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 py-2 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
            @blur="saveDescription"
          />
        </div>

        <div>
          <div class="flex items-center justify-between gap-2">
            <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Notes (one per line)</label>
            <button
              v-if="customizedPaths.has('notes')"
              type="button"
              class="text-xs text-eldra-accent-text underline underline-offset-4"
              :disabled="saving"
              @click="revertPath('notes')"
            >
              Revert
            </button>
          </div>
          <textarea
            v-model="draftNotes"
            rows="3"
            class="mt-1 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 py-2 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
            @blur="saveNotes"
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
                :disabled="saving"
                @click="revertPath('sourceBook'); revertPath('sourcePage')"
              >
                Revert
              </button>
            </div>
            <input
              v-model="draftSourceBook"
              type="text"
              class="mt-1 min-h-11 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
              @blur="saveSource"
            >
          </div>
          <div>
            <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Page</label>
            <input
              v-model="draftSourcePage"
              type="text"
              class="mt-1 min-h-11 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
              @blur="saveSource"
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
              :disabled="saving"
              @click="revertPath('image')"
            >
              Revert
            </button>
          </div>
          <div class="mt-1 flex items-center gap-3">
            <img
              v-if="preview?.effectivePresentation?.image?.url"
              :src="preview.effectivePresentation.image.url"
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
        </div>

        <div class="border-t border-eldra-accent/24 pt-4">
          <button
            type="button"
            class="min-h-9 rounded-none border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-500/10"
            :disabled="saving || !customizedPaths.size"
            @click="revertAll"
          >
            Revert all presentation overrides
          </button>
        </div>

        <div class="border-t border-eldra-accent/24 pt-4">
          <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Save a checkpoint</label>
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
              :disabled="saving || !checkpointLabel.trim()"
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
