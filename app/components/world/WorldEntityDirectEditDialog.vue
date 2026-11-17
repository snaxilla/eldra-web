<script setup lang="ts">
// "Edit" from an ordinary category page (Items, Spells, ...) --
// ELDRA Direct Content Editing consolidation pass. THE entry point
// behind "Items -> Shortsword -> Edit -> change picture/description ->
// Save." Reuses the SAME shared editor Content Studio uses
// (StudioEntityEditor.vue) for everything AFTER the first save; this
// wrapper's own job is only the FIRST save of a never-yet-customized
// entity, where there is no workspaceId/contentEntityId yet to hand that
// editor.
//
// NOTHING HAPPENS UNTIL SAVE. Opening this dialog calls ONLY the
// read-only edit-target resolver. Cancelling here, or simply closing the
// dialog, leaves no workspace, no import, and no binding behind --
// exactly section 3's own requirement.
//
// SHARED WORKSPACES. When the effective entity is ALREADY a workspace
// entity bound to MORE than this one World, two distinct, explicit
// choices are offered: (a) "Customize for this World" -- splits a new,
// local-only copy (split-local.post.ts /
// splitSharedEntityToLocalWorkspace), seeded from the shared entity's
// CURRENT overrides, gated by the SAME `world.entity.edit` ordinary
// admins already hold -- this never writes to the shared workspace and
// never changes what any other World sees; (b) "Edit the shared
// collection" -- writes the shared entity in place, gated behind the
// stronger `world.content.bind_workspace` at the route, with the
// live-consumer impact disclosed up front and never implying the
// original published release itself updates.

import { computed, ref, watch } from 'vue'
import StudioEntityEditor from '~/components/admin/studio/StudioEntityEditor.vue'
import WorldMediaPicker from '~/components/world/WorldMediaPicker.vue'

const props = withDefaults(defineProps<{
  worldId: string | number
  entityType: string
  slug: string
  title: string
  // Quick Edit Rail (default) vs. the dedicated Full-Page Editor route --
  // see StudioEntityEditor.vue's own `fieldSet` for what this actually
  // changes (field visibility only, same draft/save contract either
  // way). 'full' also renders the first-save draft's notes/source-book/
  // page/mechanics fields, which 'quick' hides.
  surface?: 'quick' | 'full'
  // Card "Change image" action -- opens straight into the image picker.
  focusImage?: boolean
  // Draft transfer FROM Quick Edit, received by the full-page editor.
  // Passed straight through to StudioEntityEditor's own `seedDraft`;
  // applied to the first-save draft here too, for the needs-preparation
  // case StudioEntityEditor never reaches.
  seedDraft?: {
    name?: string
    nameDirty?: boolean
    image?: { fileId: string; url: string } | null | undefined
    imageDirty?: boolean
  } | null
}>(), {
  surface: 'quick',
  focusImage: false,
  seedDraft: null
})

const emit = defineEmits<{
  (e: 'close'): void
  // Carries the canonical contentEntityId the save/split workflow just
  // produced -- identity-safe selection fix. A refreshed list row's own
  // `id` embeds the backing packageId, which legitimately changes the
  // moment an entity is customized; re-finding the just-saved row by
  // slug/entityType alone would be ambiguous (two UNRELATED packages can
  // publish the same slug+entityType pair as two separate effective
  // entities in the same World). contentEntityId is the one identity
  // this workflow already returns authoritatively, so the caller never
  // has to guess.
  (e: 'saved', contentEntityId: string): void
  // Quick Edit's "Open full editor" -- re-emitted (with worldId/
  // entityType/slug attached) from whichever internal surface raised it
  // (the first-save draft form below, or StudioEntityEditor's own
  // `open-full-editor`), so the parent never needs to know which one was
  // actually active.
  (e: 'open-full-editor', payload: {
    worldId: string | number
    entityType: string
    slug: string
    name: string
    nameDirty: boolean
    image: { fileId: string; url: string } | null | undefined
    imageDirty: boolean
  }): void
  // Relayed from StudioEntityEditor's own `dirty-change` (once a
  // workspace/entity exists), or from the first-save draft's own
  // `isDraftDirty` otherwise -- the full-page editor route uses this to
  // guard router navigation (Back link, browser back) the same way
  // StudioEntityEditor's own beforeunload listener already guards a
  // hard refresh/tab close.
  (e: 'dirty-change', dirty: boolean): void
}>()

type EditTarget =
  | { mode: 'resolver-disabled'; message: string }
  | { mode: 'existing-workspace'; workspaceId: string; contentEntityId: string; scope: 'local' | 'shared'; sharedWithWorldCount: number }
  | { mode: 'needs-preparation'; packageId: string; packageVersion: string; presentation: { name?: string; description?: string[]; notes?: string[]; sourceBook?: string; sourcePage?: string; image?: { url: string } | null } | null; metaLines: string[] }

type ResolveState = 'loading' | 'ready' | 'error'

const resolveState = ref<ResolveState>('loading')
const resolveError = ref('')
const target = ref<EditTarget | null>(null)

// Once a target resolves, further interaction (including the FIRST save)
// happens against a REAL workspace+entity -- either the one just
// resolved (already customized) or the one `prepareAndSave` creates.
const resolvedWorkspaceId = ref<string | null>(null)
const resolvedContentEntityId = ref<string | null>(null)

async function resolveTarget() {
  resolveState.value = 'loading'
  resolveError.value = ''
  try {
    const response = await $fetch<EditTarget>(
      `/api/worlds/${props.worldId}/entities/${encodeURIComponent(props.entityType)}/${encodeURIComponent(props.slug)}/edit-target`
    )
    target.value = response
    // Only jump straight to StudioEntityEditor when the entity's
    // workspace is bound SOLELY to this World. A SHARED entity must
    // land on the explicit choice below first -- setting
    // resolvedWorkspaceId here unconditionally (the bug this fix
    // corrects) made the v-else-if chain match the editor branch before
    // `sharedChoicePending` was ever checked, so the choice UI was
    // unreachable and a World-only caller would open straight into an
    // editor whose Save/revert/checkpoint calls are correctly refused by
    // the server, with no explanation of why.
    if (response.mode === 'existing-workspace' && response.scope === 'local') {
      resolvedWorkspaceId.value = response.workspaceId
      resolvedContentEntityId.value = response.contentEntityId
    }
    resolveState.value = 'ready'
  } catch (error) {
    resolveState.value = 'error'
    resolveError.value = describeError(error) || 'This entity could not be resolved.'
  }
}

function describeError(error: unknown): string | undefined {
  const failure = error as { data?: { statusMessage?: string; message?: string } }
  return failure?.data?.statusMessage || failure?.data?.message
}

watch([() => props.worldId, () => props.entityType, () => props.slug], resolveTarget, { immediate: true })

const needsPreparation = computed(() => target.value?.mode === 'needs-preparation' ? target.value : null)
const sharedChoicePending = computed(() =>
  target.value?.mode === 'existing-workspace' && target.value.scope === 'shared' && !editingSharedDirectly.value
)

// First-save draft -- the SAME field set StudioEntityEditor edits, but
// with no backing entity yet. Seeded from the INHERITED presentation
// edit-target already returned (never a second fetch).
type Draft = { name: string; description: string; notes: string; sourceBook: string; sourcePage: string; image: { fileId: string; url: string } | null | undefined }
const draft = ref<Draft>({ name: '', description: '', notes: '', sourceBook: '', sourcePage: '', image: undefined })
const pickerOpen = ref(false)
const saving = ref(false)
const saveError = ref('')
const editingSharedDirectly = ref(false)

let hasAppliedSeedDraftToFirstSave = false

watch(needsPreparation, (prep) => {
  if (!prep) return
  draft.value = { name: '', description: '', notes: '', sourceBook: '', sourcePage: '', image: undefined }

  // Draft transfer from Quick Edit (see direct-edit-navigation.ts) --
  // applied once, only to the two fields Quick Edit could have actually
  // touched. `expectedRevision` for a needs-preparation first save is
  // always `null` regardless (nothing exists yet to conflict with).
  if (props.seedDraft && !hasAppliedSeedDraftToFirstSave) {
    hasAppliedSeedDraftToFirstSave = true
    if (props.seedDraft.nameDirty) draft.value.name = props.seedDraft.name ?? ''
    if (props.seedDraft.imageDirty) draft.value.image = props.seedDraft.image
  }

  if (props.focusImage) pickerOpen.value = true
})

function linesToArray(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean)
}

function onImageSelected(file: { id: string; url: string }) {
  draft.value.image = { fileId: file.id, url: file.url }
  pickerOpen.value = false
}

const isDraftDirty = computed(() =>
  Boolean(draft.value.name.trim() || draft.value.description.trim() || draft.value.notes.trim()
    || draft.value.sourceBook.trim() || draft.value.sourcePage.trim() || draft.value.image !== undefined)
)

watch(isDraftDirty, (dirty) => {
  // Only while the first-save draft is actually the active surface --
  // once resolvedWorkspaceId/ContentEntityId exist, StudioEntityEditor's
  // OWN dirty-change (relayed by onEditorOpenFullEditor's sibling
  // listener below) is the real signal.
  if (!resolvedWorkspaceId.value) emit('dirty-change', dirty)
})

async function saveFirstEdit() {
  if (!isDraftDirty.value) return
  saving.value = true
  saveError.value = ''

  const edits: { path: string; value: unknown }[] = []
  if (draft.value.name.trim()) edits.push({ path: 'name', value: draft.value.name.trim() })
  if (draft.value.description.trim()) edits.push({ path: 'description', value: linesToArray(draft.value.description) })
  if (draft.value.notes.trim()) edits.push({ path: 'notes', value: linesToArray(draft.value.notes) })
  if (draft.value.sourceBook.trim() || draft.value.sourcePage.trim()) {
    edits.push({ path: 'sourceBook', value: draft.value.sourceBook.trim() || null })
    edits.push({ path: 'sourcePage', value: draft.value.sourcePage.trim() || null })
  }
  if (draft.value.image !== undefined) {
    edits.push({ path: 'image', value: draft.value.image === null ? null : { kind: 'media', fileId: draft.value.image.fileId } })
  }

  try {
    const response = await $fetch<{ workspaceId: string; contentEntityId: string }>(
      `/api/worlds/${props.worldId}/entities/${encodeURIComponent(props.entityType)}/${encodeURIComponent(props.slug)}/customize`,
      { method: 'POST', body: { edits, expectedRevision: null } }
    )
    resolvedWorkspaceId.value = response.workspaceId
    resolvedContentEntityId.value = response.contentEntityId
    emit('saved', response.contentEntityId)
  } catch (error) {
    const failure = error as { data?: { code?: string; workspaceId?: string; contentEntityId?: string; message?: string } }
    if (failure?.data?.code === 'direct-edit-activation-failed') {
      // The save genuinely succeeded and is durable -- only going live
      // failed. Transition into the real editor (where the saved draft
      // is visible) rather than showing a plain error that would wrongly
      // imply the edit was lost; the editor itself shows this World's
      // own content as not-yet-live until a retry (opening Edit again
      // and saving once more) succeeds in activating it.
      resolvedWorkspaceId.value = failure.data.workspaceId ?? null
      resolvedContentEntityId.value = failure.data.contentEntityId ?? null
      notYetLiveWarning.value = 'Saved, but could not be made visible in this World yet. Save again (even with no further changes) to finish activating it.'
      // Not yet the effective winner (activation didn't complete), so the
      // caller may find no matching row to re-select -- that's fine, a
      // best-effort id is still better than none.
      if (failure.data.contentEntityId) emit('saved', failure.data.contentEntityId)
    } else {
      saveError.value = describeError(error) || 'The save failed. Nothing was lost -- your draft is still here.'
    }
  } finally {
    saving.value = false
  }
}

function onEditorSaved(entity: { contentEntityId: string }) {
  emit('saved', entity.contentEntityId)
}

// Relays StudioEntityEditor's own `open-full-editor` upward, attaching
// this dialog's own identity (worldId/entityType/slug) -- StudioEntityEditor
// itself has no notion of "entityType/slug" at all, only workspaceId/
// contentEntityId, so it can't build this payload alone.
function onEditorOpenFullEditor(payload: { name: string; nameDirty: boolean; image: { fileId: string; url: string } | null | undefined; imageDirty: boolean }) {
  emit('open-full-editor', { worldId: props.worldId, entityType: props.entityType, slug: props.slug, ...payload })
}

// The first-save draft form's own "Open full editor" -- same payload
// shape, read directly from `draft` since there is no StudioEntityEditor
// instance yet to relay from.
function openFullEditorFromFirstSave() {
  emit('open-full-editor', {
    worldId: props.worldId,
    entityType: props.entityType,
    slug: props.slug,
    name: draft.value.name,
    nameDirty: Boolean(draft.value.name.trim()),
    image: draft.value.image,
    imageDirty: draft.value.image !== undefined
  })
}

const splitting = ref(false)
const splitError = ref('')

async function customizeLocally() {
  splitting.value = true
  splitError.value = ''
  try {
    const response = await $fetch<{ workspaceId: string; contentEntityId: string }>(
      `/api/worlds/${props.worldId}/entities/${encodeURIComponent(props.entityType)}/${encodeURIComponent(props.slug)}/split-local`,
      { method: 'POST' }
    )
    resolvedWorkspaceId.value = response.workspaceId
    resolvedContentEntityId.value = response.contentEntityId
    emit('saved', response.contentEntityId)
  } catch (error) {
    splitError.value = describeError(error) || 'Could not create a local copy. Nothing was changed.'
  } finally {
    splitting.value = false
  }
}

function editSharedDirectly() {
  // Deferred until explicitly chosen (see resolveTarget's own comment) --
  // the server's own requireWorkspaceEntityAccess is the real gate; a
  // caller who lacks platform workspace-edit authority still reaches
  // StudioEntityEditor here, but its Save/revert/checkpoint calls are
  // refused with a clear 403 rather than silently succeeding.
  if (target.value?.mode === 'existing-workspace') {
    resolvedWorkspaceId.value = target.value.workspaceId
    resolvedContentEntityId.value = target.value.contentEntityId
  }
  editingSharedDirectly.value = true
}

function requestClose() {
  if (isDraftDirty.value && resolvedWorkspaceId.value === null && !window.confirm('Discard unsaved changes?')) return
  emit('close')
}

// Survives the needs-preparation -> StudioEntityEditor template switch
// (an activation failure sets resolvedWorkspaceId/ContentEntityId, which
// immediately swaps the template -- a message set on `saveError` alone
// would disappear with it).
const notYetLiveWarning = ref('')
</script>

<template>
  <section class="mt-3 eldra-ornate-panel rounded-none border border-eldra-accent/24 bg-eldra-panel p-4">
    <p
      v-if="notYetLiveWarning"
      class="mb-3 rounded-none border border-amber-300/25 bg-amber-400/10 p-2 text-xs text-amber-100"
    >
      {{ notYetLiveWarning }}
    </p>

    <div
      v-if="resolveState === 'loading'"
      class="text-sm text-eldra-text-soft"
    >
      Loading…
    </div>

    <p
      v-else-if="resolveState === 'error'"
      class="text-sm text-red-300"
    >
      {{ resolveError }}
    </p>

    <template v-else-if="target?.mode === 'resolver-disabled'">
      <p class="rounded-none border border-amber-300/25 bg-amber-400/10 p-3 text-sm text-amber-100">
        Direct editing is not set up for this World yet. Ask whoever manages this Eldra deployment to finish the
        Content Workspaces setup.
      </p>
      <button
        type="button"
        class="mt-3 min-h-9 rounded-none border border-eldra-accent/24 px-3 text-xs text-eldra-text-soft hover:border-eldra-accent"
        @click="emit('close')"
      >
        Close
      </button>
    </template>

    <!-- Already customized, bound only to THIS World (or the owner chose
         to edit the shared collection directly, below) -- the SAME shared
         editor Content Studio uses, nothing special about getting here. -->
    <StudioEntityEditor
      v-else-if="resolvedWorkspaceId && resolvedContentEntityId"
      :workspace-id="resolvedWorkspaceId"
      :content-entity-id="resolvedContentEntityId"
      :world-id="worldId"
      :compact="surface === 'quick'"
      :field-set="surface"
      :auto-open-image-picker="focusImage"
      :seed-draft="seedDraft"
      @close="requestClose"
      @saved="onEditorSaved"
      @open-full-editor="onEditorOpenFullEditor"
      @dirty-change="(dirty) => emit('dirty-change', dirty)"
    />

    <!-- Already customized, SHARED with other Worlds -- the choice. -->
    <template v-else-if="sharedChoicePending && target?.mode === 'existing-workspace'">
      <p class="text-sm text-eldra-text-soft">
        "{{ title }}" is edited in a workspace shared with <strong>{{ target.sharedWithWorldCount }}</strong>
        other World{{ target.sharedWithWorldCount === 1 ? '' : 's' }}.
      </p>

      <p
        v-if="splitError"
        class="mt-2 text-sm text-red-300"
      >
        {{ splitError }}
      </p>

      <button
        type="button"
        class="mt-3 min-h-10 rounded-none border border-eldra-accent bg-eldra-accent/10 px-4 text-sm font-medium text-eldra-text-strong hover:bg-eldra-accent/20 disabled:opacity-50"
        :disabled="splitting"
        @click="customizeLocally"
      >
        {{ splitting ? 'Creating a local copy…' : 'Customize for this World' }}
      </button>
      <p class="mt-1 text-xs text-eldra-text-faint">
        Creates a copy used only by this World, starting from what it currently shows. The shared workspace, and
        every other World using it, is unaffected.
      </p>

      <button
        type="button"
        class="mt-3 min-h-10 rounded-none border border-eldra-accent/24 px-4 text-sm text-eldra-text-strong hover:border-eldra-accent"
        @click="editSharedDirectly"
      >
        Edit the shared collection (requires elevated permission)
      </button>
      <p class="mt-1 text-xs text-eldra-text-faint">
        Changes what every World using that workspace sees live. This does NOT update the original published
        release.
      </p>
      <button
        type="button"
        class="mt-2 ml-2 min-h-10 rounded-none border border-eldra-accent/24 px-4 text-sm text-eldra-text-soft hover:border-eldra-accent"
        @click="emit('close')"
      >
        Cancel
      </button>
    </template>

    <!-- Never customized yet -- the first-save draft. -->
    <template v-else-if="needsPreparation">
      <div class="text-xs uppercase tracking-[0.3em] text-eldra-text-faint">
        {{ surface === 'quick' ? 'Quick edit' : 'Editing' }}
      </div>
      <p class="mt-2 rounded-none border border-sky-300/25 bg-sky-400/10 p-2 text-xs text-sky-100">
        Changes apply to this World.
      </p>

      <div class="mt-3 grid gap-4">
        <div>
          <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">{{ surface === 'quick' ? 'Display name' : 'Title' }}</label>
          <input
            v-model="draft.name"
            type="text"
            :placeholder="title"
            class="mt-1 min-h-11 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
          >
          <p
            v-if="surface === 'quick'"
            class="mt-1 text-xs text-eldra-text-faint"
          >
            Changes how this entity's name displays. Does not rename its slug or canonical identity.
          </p>
        </div>

        <div v-if="surface === 'full'">
          <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Description (one paragraph per line)</label>
          <textarea
            v-model="draft.description"
            rows="5"
            :placeholder="(needsPreparation.presentation?.description ?? []).join('\n')"
            class="mt-1 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 py-2 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
          />
        </div>

        <div v-if="surface === 'full'">
          <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Notes (one per line)</label>
          <textarea
            v-model="draft.notes"
            rows="3"
            class="mt-1 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 py-2 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
          />
        </div>

        <div
          v-if="surface === 'full'"
          class="grid grid-cols-2 gap-3"
        >
          <div>
            <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Source book</label>
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
          <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Image</label>
          <div class="mt-1 flex items-center gap-3">
            <img
              v-if="draft.image?.url"
              :src="draft.image.url"
              alt=""
              class="h-16 w-16 rounded-none border border-eldra-accent/24 object-cover"
            >
            <img
              v-else-if="draft.image === undefined && needsPreparation.presentation?.image?.url"
              :src="needsPreparation.presentation.image.url"
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
                Choose/replace image…
              </button>
              <button
                type="button"
                class="min-h-9 rounded-none border border-eldra-accent/24 px-3 text-xs text-eldra-text-soft hover:border-eldra-accent"
                @click="draft.image = null"
              >
                Remove image (show no art)
              </button>
              <button
                v-if="draft.image !== undefined"
                type="button"
                class="min-h-9 rounded-none border border-eldra-accent/24 px-3 text-xs text-eldra-text-soft hover:border-eldra-accent"
                @click="draft.image = undefined"
              >
                Restore inherited image
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="surface === 'full' && needsPreparation.metaLines.length"
          class="eldra-corner-runes rounded-none border border-eldra-accent/22 bg-eldra-panel/72 p-3 text-sm leading-7 text-slate-200"
        >
          <div class="mb-1 text-xs uppercase tracking-[0.25em] text-eldra-text-faint">
            Mechanics (not editable here)
          </div>
          <div
            v-for="line in needsPreparation.metaLines"
            :key="line"
          >
            {{ line }}
          </div>
        </div>

        <p
          v-if="saveError"
          class="text-sm text-red-300"
        >
          {{ saveError }}
        </p>

        <div class="flex items-center gap-3">
          <button
            type="button"
            class="min-h-10 rounded-none border border-eldra-accent bg-eldra-accent/10 px-4 text-sm font-medium text-eldra-text-strong hover:bg-eldra-accent/20 disabled:opacity-50"
            :disabled="!isDraftDirty || saving"
            @click="saveFirstEdit"
          >
            {{ saving ? 'Saving…' : 'Save changes' }}
          </button>
          <button
            type="button"
            class="min-h-10 rounded-none border border-eldra-accent/24 px-4 text-sm text-eldra-text-soft hover:border-eldra-accent"
            :disabled="saving"
            @click="requestClose"
          >
            Cancel
          </button>
          <button
            v-if="surface === 'quick'"
            type="button"
            class="min-h-10 rounded-none border border-eldra-accent/24 px-4 text-sm text-eldra-text-soft hover:border-eldra-accent"
            :disabled="saving"
            @click="openFullEditorFromFirstSave"
          >
            Open full editor
          </button>
        </div>
      </div>

      <WorldMediaPicker
        v-model:open="pickerOpen"
        :world-id="worldId"
        title="Choose an image"
        @select="onImageSelected"
      />
    </template>
  </section>
</template>
