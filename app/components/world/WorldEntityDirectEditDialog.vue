<script setup lang="ts">
// "Edit" from an ordinary category page (Items, Spells, ...) --
// ELDRA Direct Content Editing consolidation pass. THE entry point
// behind "Items -> Shortsword -> Edit -> change picture/description ->
// Save." Reuses the SAME shared editor Content Studio uses
// (StudioEntityEditor.vue) for BOTH an already-prepared entity AND a
// never-yet-customized one -- ITEM MECHANICS AVAILABLE ON THE FIRST EDIT
// moved the first-save-specific ad-hoc form (previously owned by this
// wrapper, presentation fields only, no mechanics editing) INTO
// StudioEntityEditor itself (its own `needsPreparation` prop), so every
// already-supported field is available on the first full edit too, not
// only after a first save and reopen. This wrapper's remaining job is
// resolving WHICH of the three states applies (resolver-disabled,
// needs-preparation, existing-workspace, incl. the shared-workspace
// explicit choice) and handing StudioEntityEditor the right props for
// whichever one it is -- never a second, duplicated set of controls.
//
// NOTHING HAPPENS UNTIL SAVE. Opening this dialog calls ONLY the
// read-only edit-target resolver; StudioEntityEditor's own `load()` in
// its `needsPreparation` branch seeds entirely from that same response,
// with no network call of its own. Cancelling here, or simply closing
// the dialog, leaves no workspace, no import, and no binding behind --
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
import type { ItemAttunementOverrideValue, ItemDamageOverrideValue } from '~/lib/item-mechanics'
import type { PresentationEntry } from '~/lib/content-presentation'

const props = withDefaults(defineProps<{
  worldId: string | number
  entityType: string
  slug: string
  title: string
  // Quick Edit Rail (default) vs. the dedicated Full-Page Editor route --
  // see StudioEntityEditor.vue's own `fieldSet` for what this actually
  // changes (field visibility only, same draft/save contract either way,
  // for BOTH an already-prepared entity and a never-yet-customized one).
  surface?: 'quick' | 'full'
  // Card "Change image" action -- opens straight into the image picker.
  focusImage?: boolean
  // Draft transfer FROM Quick Edit, received by the full-page editor.
  // Passed straight through to StudioEntityEditor's own `seedDraft` --
  // it alone owns applying this now, for either of its two branches.
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
  // entityType/slug attached) from StudioEntityEditor's own
  // `open-full-editor`, whichever of its two branches raised it.
  (e: 'open-full-editor', payload: {
    worldId: string | number
    entityType: string
    slug: string
    name: string
    nameDirty: boolean
    image: { fileId: string; url: string } | null | undefined
    imageDirty: boolean
  }): void
  // Relayed from StudioEntityEditor's own `dirty-change` -- the full-page
  // editor route uses this to guard router navigation (Back link,
  // browser back) the same way StudioEntityEditor's own beforeunload
  // listener already guards a hard refresh/tab close.
  (e: 'dirty-change', dirty: boolean): void
}>()

// ITEM MECHANICS AVAILABLE ON THE FIRST EDIT -- the SAME itemMechanicsEditing
// shape edit-target.get.ts now returns, matching StudioEntityEditor.vue's
// own (unexported, local) ItemMechanicsEditingPreview exactly.
type ItemMechanicsEditingPreview = {
  rarity: string | null
  weight: number | null
  attunement: ItemAttunementOverrideValue
  damage: ItemDamageOverrideValue | null
  property: unknown[]
  isWeapon: boolean
}

type EditTarget =
  | { mode: 'resolver-disabled'; message: string }
  | { mode: 'existing-workspace'; workspaceId: string; contentEntityId: string; scope: 'local' | 'shared'; sharedWithWorldCount: number }
  | {
      mode: 'needs-preparation'
      packageId: string
      packageVersion: string
      // The REAL canonical shape (matches server/utils/world-effective-content.ts's
      // own EffectiveEntity.presentation exactly) -- was previously a
      // smaller, hand-rolled, looser shape here; widened to the real type
      // so it can be handed to StudioEntityEditor's own `needsPreparation`
      // prop directly, with no cast or reshaping.
      presentation: PresentationEntry | null
      metaLines: string[]
      itemMechanicsEditing: ItemMechanicsEditingPreview | null
    }

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

const editingSharedDirectly = ref(false)

// ITEM MECHANICS AVAILABLE ON THE FIRST EDIT -- the first-save-specific
// draft/save logic that used to live here (name/description/notes/source/
// image only, no mechanics) moved into StudioEntityEditor.vue's own
// `needsPreparation` branch, which now drives the first save directly
// through the SAME customize.post.ts route this used to call. This
// wrapper has no draft of its own left to own; `seedDraft`/`focusImage`
// are passed straight through as props (StudioEntityEditor's own `load()`
// already applies them, for both branches, unchanged).
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

// StudioEntityEditor (both branches, mounted below) always confirms its
// own dirty draft internally before ever emitting 'close' -- this wrapper
// has no draft of its own left to protect.
function requestClose() {
  emit('close')
}
</script>

<template>
  <section class="mt-3 eldra-ornate-panel rounded-none border border-eldra-accent/24 bg-eldra-panel p-4">
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

    <!-- ITEM MECHANICS AVAILABLE ON THE FIRST EDIT -- never customized yet.
         Reuses StudioEntityEditor directly (the SAME editing contract an
         already-prepared entity uses) instead of the old, separate,
         presentation-only ad-hoc form: every already-supported field
         (including rarity/weight/attunement/damage/property for Items) is
         now available on the FIRST full edit, not only after a first save
         and reopen. StudioEntityEditor's own `needsPreparation` prop drives
         its first save through the first-save route internally and
         transitions itself into normal existing-workspace behavior on
         success -- no remount, no second component needed here. -->
    <StudioEntityEditor
      v-else-if="needsPreparation"
      :world-id="worldId"
      :entity-type="entityType"
      :slug="slug"
      :needs-preparation="{
        presentation: needsPreparation.presentation,
        itemMechanicsEditing: needsPreparation.itemMechanicsEditing,
        metaLines: needsPreparation.metaLines
      }"
      :compact="surface === 'quick'"
      :field-set="surface"
      :auto-open-image-picker="focusImage"
      :seed-draft="seedDraft"
      @close="requestClose"
      @saved="onEditorSaved"
      @open-full-editor="onEditorOpenFullEditor"
      @dirty-change="(dirty) => emit('dirty-change', dirty)"
    />
  </section>
</template>
