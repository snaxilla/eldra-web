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
import { buildCardThumbnailUrl } from '~/lib/media/thumbnail-url'
import type { PresentationEntry } from '~/lib/content-presentation'
import {
  ITEM_RARITY_OPTIONS,
  WEAPON_DAMAGE_TYPE_OPTIONS,
  buildPropertyOverrideArray,
  propertyRows,
  type ItemAttunementOverrideValue,
  type ItemDamageOverrideValue,
  type PropertyRow
} from '~/lib/item-mechanics'

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
  // Quick Edit Rail / Full-Page Editor split. 'full' (default) is this
  // component's original, unchanged behavior -- every field, live
  // preview, revert-all, checkpoint. 'quick' renders ONLY Title (labeled
  // "Display name" here) and Image -- no description/notes/source/
  // mechanics/live-preview/checkpoint, per the owner's own Quick Edit
  // field list. This is a RENDERING toggle only: `draft`/`baseline`/
  // `dirtyPaths`/`save()` below are completely unaware of it and still
  // track every field exactly as before, so a 'quick' save can only ever
  // send paths the user actually touched through fields that are
  // actually visible (description/notes/etc. literally cannot become
  // dirty if their inputs never render) -- one draft/save contract, not
  // two competing ones.
  fieldSet?: 'quick' | 'full'
  // Direct image card action -- opens Quick Edit with the picker already
  // showing, so a caller who clicked "Change image" on a card doesn't
  // have to click "Choose image…" again themselves. One-shot: only
  // applied on this component's FIRST successful load.
  autoOpenImagePicker?: boolean
  // Draft transfer (switching Quick Edit -> the full-page editor without
  // losing work). Applied ONCE, on top of this component's own FRESH
  // load -- onto `draft` only, NEVER `baseline`/`entity.value.revision`,
  // so: (1) dirtyPaths recomputes correctly dirty for whichever of
  // name/image the caller actually touched, (2) every OTHER field stays
  // exactly whatever this fresh load produced (never clobbered), and (3)
  // Save still sends THIS load's real, current revision -- a concurrent
  // edit since the draft was created still produces a normal 409, never
  // a silent rebase onto a stale expectedRevision.
  seedDraft?: {
    name?: string
    nameDirty?: boolean
    image?: { fileId: string; url: string } | null | undefined
    imageDirty?: boolean
  } | null
}>()

const isQuickField = computed(() => props.fieldSet === 'quick')
const titleFieldLabel = computed(() => (isQuickField.value ? 'Display name' : 'Title'))

const emit = defineEmits<{
  (e: 'close'): void
  // Enough for a caller to refresh a card/rail without a full reload --
  // the effective entity this save/revert just produced.
  (e: 'saved', entity: EntityDetail): void
  // Quick Edit's own "Open full editor" -- carries the CURRENT draft's
  // name/image values and whether each was actually touched (dirty), so
  // the full-page editor can apply only what the caller actually
  // changed, never silently clearing or freezing anything else. Never
  // carries `entity.value.revision` as a value to TRUST -- the full
  // editor does its own fresh load and keeps ITS OWN baseline/revision;
  // this payload only seeds `draft`'s visible fields on top of that,
  // exactly like the identity-transfer contract document below.
  (e: 'open-full-editor', payload: {
    name: string
    nameDirty: boolean
    image: { fileId: string; url: string } | null | undefined
    imageDirty: boolean
  }): void
  // The full-page editor route has no dialog/rail "close" of its own to
  // intercept router navigation (Back link, browser back, leaving the
  // page) -- it needs its OWN signal to guard those with
  // onBeforeRouteLeave, since this component's existing `beforeunload`
  // listener only covers a hard refresh/tab close, never an in-app
  // route change.
  (e: 'dirty-change', dirty: boolean): void
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
  authoredMechanics: { path: string }[]
}

type ItemMechanicsEditingPreview = {
  rarity: string | null
  weight: number | null
  attunement: ItemAttunementOverrideValue
  damage: ItemDamageOverrideValue | null
  property: unknown[]
  isWeapon: boolean
}

type Preview = {
  basePresentation: PresentationEntry | null
  effectivePresentation: PresentationEntry | null
  imageUnavailable: boolean
  metaLines?: string[]
  itemMechanicsEditing?: ItemMechanicsEditingPreview | null
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

// ---------------------------------------------------------------------------
// Mechanics editing -- Items Mechanics Editing, release one. Full editor
// only (isQuickField gates the whole section out in the template), Item
// entities only (isItemEntity below). Five approved fields: rarity,
// weight, attunement (+ optional restriction text), primary weapon damage
// dice + type, weapon properties -- see app/lib/item-mechanics/dnd5e-editing.ts
// for the exact merge/validation this mirrors.
// ---------------------------------------------------------------------------

const isItemEntity = computed(() => entity.value?.entityType === 'item')
const isWeapon = computed(() => preview.value?.itemMechanicsEditing?.isWeapon === true)

// propertyRows/buildPropertyOverrideArray -- the lossless weapon-property
// round-trip -- live in app/lib/item-mechanics/dnd5e-editing.ts (pure,
// unit-tested there) rather than here, per this project's own
// business-logic-in-lib/composables convention.

type MechanicsDraft = {
  rarity: string // '' = untouched (inherit)
  weight: string // '' = untouched (inherit); otherwise a numeric string
  attunement: 'inherit' | 'required' | 'not-required'
  attunementText: string
  damageDice: string // '' = untouched (inherit)
  damageType: string // '' = none
  property: Record<string, boolean> // editable rows only, keyed by WeaponProperty name
}

function emptyMechanicsDraft(): MechanicsDraft {
  return { rarity: '', weight: '', attunement: 'inherit', attunementText: '', damageDice: '', damageType: '', property: {} }
}

const mechanicsDraft = reactive<MechanicsDraft>(emptyMechanicsDraft())
const mechanicsBaseline = reactive<MechanicsDraft>(emptyMechanicsDraft())
const propertyRowsForDisplay = ref<PropertyRow[]>([])

const mechanicsCustomizedPaths = computed(() => new Set((entity.value?.authoredMechanics ?? []).map((o) => o.path)))

function mechanicsDraftFromPreview(editing: ItemMechanicsEditingPreview | null | undefined, customized: Set<string>): MechanicsDraft {
  const rawProperty = editing?.property ?? []
  const rows = propertyRows(rawProperty)
  propertyRowsForDisplay.value = rows
  const property: Record<string, boolean> = {}
  for (const row of rows) if (row.state !== 'locked') property[row.property] = row.state === 'on'

  return {
    rarity: customized.has('rarity') ? (editing?.rarity ?? '') : '',
    weight: customized.has('weight') ? String(editing?.weight ?? '') : '',
    attunement: customized.has('attunement') ? (editing?.attunement.required ? 'required' : 'not-required') : 'inherit',
    attunementText: customized.has('attunement') ? (editing?.attunement.text ?? '') : '',
    damageDice: customized.has('damage') ? (editing?.damage?.dice ?? '') : '',
    damageType: customized.has('damage') ? (editing?.damage?.damageType ?? '') : '',
    // Property rows are always seeded from the EFFECTIVE raw array
    // (already reflects any saved override) regardless of whether
    // 'property' itself is a currently-authored path.
    property
  }
}

function applyMechanicsDraft(target: MechanicsDraft, source: MechanicsDraft) {
  target.rarity = source.rarity
  target.weight = source.weight
  target.attunement = source.attunement
  target.attunementText = source.attunementText
  target.damageDice = source.damageDice
  target.damageType = source.damageType
  target.property = { ...source.property }
}

const mechanicsDirtyPaths = computed(() => {
  const dirty = new Set<string>()
  if (mechanicsDraft.rarity.trim() && mechanicsDraft.rarity !== mechanicsBaseline.rarity) dirty.add('rarity')
  if (mechanicsDraft.weight.trim() && mechanicsDraft.weight !== mechanicsBaseline.weight) dirty.add('weight')
  if (
    mechanicsDraft.attunement !== 'inherit'
    && (mechanicsDraft.attunement !== mechanicsBaseline.attunement || mechanicsDraft.attunementText !== mechanicsBaseline.attunementText)
  ) dirty.add('attunement')
  if (mechanicsDraft.damageDice.trim() && (mechanicsDraft.damageDice !== mechanicsBaseline.damageDice || mechanicsDraft.damageType !== mechanicsBaseline.damageType)) {
    dirty.add('damage')
  }
  if (JSON.stringify(mechanicsDraft.property) !== JSON.stringify(mechanicsBaseline.property)) dirty.add('property')
  return dirty
})

const isMechanicsDirty = computed(() => mechanicsDirtyPaths.value.size > 0)

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

const isDirty = computed(() => dirtyPaths.value.size > 0 || isMechanicsDirty.value)

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
let hasAutoOpenedPicker = false
let hasAppliedSeedDraft = false

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

    const nextMechanics = mechanicsDraftFromPreview(response.preview.itemMechanicsEditing, new Set((response.entity.authoredMechanics ?? []).map((o) => o.path)))
    applyMechanicsDraft(mechanicsDraft, nextMechanics)
    applyMechanicsDraft(mechanicsBaseline, nextMechanics)

    if (props.seedDraft && !hasAppliedSeedDraft) {
      hasAppliedSeedDraft = true
      if (props.seedDraft.nameDirty) draft.name = props.seedDraft.name ?? ''
      if (props.seedDraft.imageDirty) draft.image = props.seedDraft.image
    }

    state.value = 'ready'
    if (props.autoOpenImagePicker && !hasAutoOpenedPicker) {
      hasAutoOpenedPicker = true
      pickerOpen.value = true
    }
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
watch(isDirty, (dirty) => emit('dirty-change', dirty))

// The conflict banner's own "Reload" -- an EXPLICIT user action (never
// automatic; a 409 alone never calls this), but still a real discard:
// load() replaces draft/baseline (and mechanicsDraft/mechanicsBaseline)
// with the server's current state, so the title/damage/etc. the user
// typed before Save conflicted would otherwise vanish with no warning.
// Confirms first, exactly like cancelDraft/requestClose already do for
// every other way this editor discards unsaved work.
function reloadAfterConflict() {
  if (isDirty.value && !window.confirm('Reload to see the latest version? Your unsaved changes here will be lost -- reapply them after reloading if you still want them.')) return
  load()
}

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
  applyMechanicsDraft(mechanicsDraft, mechanicsBaseline)
}

// Quick Edit's "Open full editor" -- no confirm() here. Switching
// surfaces is explicitly NOT a discard: the caller on the other end
// (WorldEntityInteractivePage.vue) is responsible for transferring this
// payload into the full page, never silently saving or discarding it.
function openFullEditor() {
  emit('open-full-editor', {
    name: draft.name,
    nameDirty: dirtyPaths.value.has('name'),
    image: draft.image,
    imageDirty: dirtyPaths.value.has('image')
  })
}

let saveGeneration = 0

async function save() {
  if (!entity.value || !isDirty.value) return
  const generation = ++saveGeneration
  saveState.value = 'saving'
  errorMessage.value = ''

  const edits: { channel: 'presentation' | 'mechanics'; path: string; value: unknown }[] = []
  if (dirtyPaths.value.has('name')) edits.push({ channel: 'presentation', path: 'name', value: draft.name || null })
  if (dirtyPaths.value.has('description')) edits.push({ channel: 'presentation', path: 'description', value: linesToArray(draft.description) })
  if (dirtyPaths.value.has('notes')) edits.push({ channel: 'presentation', path: 'notes', value: linesToArray(draft.notes) })
  if (dirtyPaths.value.has('sourceBook')) {
    edits.push({ channel: 'presentation', path: 'sourceBook', value: draft.sourceBook || null })
    edits.push({ channel: 'presentation', path: 'sourcePage', value: draft.sourcePage || null })
  }
  if (dirtyPaths.value.has('image')) {
    edits.push({ channel: 'presentation', path: 'image', value: draft.image === null ? null : draft.image === undefined ? undefined : { kind: 'media', fileId: draft.image.fileId } })
  }

  // Mechanics edits -- same request, same expectedRevision, one combined
  // atomic save (content-workspace-entities.ts's applyEntityEdits). Every
  // value here is JSON-explicit (never `undefined`) -- see
  // dnd5e-editing.ts's own header on why attunement specifically must
  // never rely on `undefined` surviving serialization.
  if (mechanicsDirtyPaths.value.has('rarity')) edits.push({ channel: 'mechanics', path: 'rarity', value: mechanicsDraft.rarity })
  if (mechanicsDirtyPaths.value.has('weight')) edits.push({ channel: 'mechanics', path: 'weight', value: Number(mechanicsDraft.weight) })
  if (mechanicsDirtyPaths.value.has('attunement')) {
    const value: ItemAttunementOverrideValue = {
      required: mechanicsDraft.attunement === 'required',
      text: mechanicsDraft.attunement === 'required' && mechanicsDraft.attunementText.trim() ? mechanicsDraft.attunementText.trim() : null
    }
    edits.push({ channel: 'mechanics', path: 'attunement', value })
  }
  if (mechanicsDirtyPaths.value.has('damage')) {
    const value: ItemDamageOverrideValue = { dice: mechanicsDraft.damageDice.trim(), damageType: mechanicsDraft.damageType || null }
    edits.push({ channel: 'mechanics', path: 'damage', value })
  }
  if (mechanicsDirtyPaths.value.has('property')) {
    edits.push({ channel: 'mechanics', path: 'property', value: buildPropertyOverrideArray(preview.value?.itemMechanicsEditing?.property ?? [], mechanicsDraft.property) })
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
      // Never suggests saving again: clicking Save again sends the SAME
      // expectedRevision this request just used, which will conflict
      // again every time -- there is no retry here that could succeed
      // without first reloading. The only real path forward is Reload
      // (re-fetches the current revision), then reapplying the edit on
      // top of it -- which this banner's own Reload button does, never
      // automatically, so an intervening change is never silently
      // overwritten.
      errorMessage.value = 'This entity was saved by someone else since you loaded it. Your draft is kept below -- click Reload to see the latest version, then reapply your changes on top of it. Saving again without reloading will fail the same way.'
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

// Mechanics revert -- direct siblings of revertPath/revertAll above,
// targeting the mechanics-channel DELETE routes
// (overrides/mechanics/:path, overrides/mechanics). "Reset to inherited"
// removes the WHOLE logical override (e.g. attunement's required+text
// together), restoring the original base behavior/text exactly.
async function revertMechanicsPath(path: string) {
  if (!entity.value) return
  if (isDirty.value && !window.confirm(`Revert ${path} to its inherited value? Your other unsaved changes are kept.`)) return
  saveState.value = 'saving'
  try {
    await $fetch(`/api/content/workspaces/${props.workspaceId}/entities/${props.contentEntityId}/overrides/mechanics/${path}`, {
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

async function revertMechanicsAll() {
  if (!entity.value) return
  if (!window.confirm('Revert ALL customized mechanics fields on this entity to their inherited values?')) return
  saveState.value = 'saving'
  try {
    await $fetch(`/api/content/workspaces/${props.workspaceId}/entities/${props.contentEntityId}/overrides/mechanics`, {
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
          {{ isQuickField ? 'Quick edit' : 'Editing' }}
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
          v-if="isQuickField"
          type="button"
          class="min-h-11 shrink-0 rounded-none border border-eldra-accent/24 px-3 text-sm text-eldra-text-soft hover:border-eldra-accent"
          @click="openFullEditor"
        >
          Open full editor
        </button>
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
        @click="reloadAfterConflict"
      >
        Reload
      </button>
    </p>

    <div
      v-if="state === 'ready' && entity"
      class="mt-5 grid gap-6"
      :class="compact || isQuickField ? 'grid-cols-1' : 'lg:grid-cols-2'"
    >
      <!-- Editable fields -->
      <div class="grid gap-5">
        <div>
          <div class="flex items-center justify-between gap-2">
            <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">{{ titleFieldLabel }}</label>
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
          <p
            v-if="isQuickField"
            class="mt-1 text-xs text-eldra-text-faint"
          >
            Changes how this entity's name displays. Does not rename its slug or canonical identity.
          </p>
        </div>

        <template v-if="!isQuickField">
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
        </template>

        <div>
          <div class="flex items-center justify-between gap-2">
            <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Image</label>
            <!-- Two DIFFERENT "go back" actions, deliberately not merged:
                 this one reverts an ALREADY-SAVED customization via the
                 dedicated revert-path call (immediate, not deferred to
                 Save) -- shown only when there's a persisted override and
                 no unsaved pending change already covers it. -->
            <button
              v-if="customizedPaths.has('image') && !dirtyPaths.has('image')"
              type="button"
              class="text-xs text-eldra-accent-text underline underline-offset-4"
              :disabled="saveState === 'saving'"
              @click="revertPath('image')"
            >
              Restore inherited image
            </button>
          </div>
          <div class="mt-1 flex items-center gap-3">
            <img
              v-if="draft.image?.url || (draft.image === undefined && preview?.effectivePresentation?.image?.url)"
              :src="buildCardThumbnailUrl(draft.image?.url || preview?.effectivePresentation?.image?.url || '')"
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
                @click="clearImage"
              >
                Remove image (show no art)
              </button>
              <!-- The DRAFT-level equivalent of the header's revert link
                   above: undoes a PENDING, not-yet-saved image change
                   back to whatever the inherited/effective value is,
                   without a server round-trip -- resolved normally on
                   the next Save (or discarded on Cancel), same as any
                   other draft field. -->
              <button
                v-if="dirtyPaths.has('image') && draft.image !== undefined"
                type="button"
                class="min-h-9 rounded-none border border-eldra-accent/24 px-3 text-xs text-eldra-text-soft hover:border-eldra-accent"
                @click="draft.image = undefined"
              >
                Restore inherited image
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

        <!-- Mechanics -- Items Mechanics Editing, release one. Full editor
             only (this whole block sits inside the `v-if="!isQuickField"`
             template above), Item entities only. Changing a value here
             never rewrites description/notes/source prose -- mechanics and
             presentation are separate authored channels, saved together
             only because they share one Save button below. -->
        <template v-if="!isQuickField && isItemEntity">
        <div class="border-t border-eldra-accent/24 pt-4">
          <div class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">
            Mechanics
          </div>
          <p class="mt-1 text-xs text-eldra-text-faint">
            Changing these values does not rewrite the description above -- update both if the prose should match.
          </p>

          <div class="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div class="flex items-center justify-between gap-2">
                <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Rarity</label>
                <button
                  v-if="mechanicsCustomizedPaths.has('rarity')"
                  type="button"
                  class="text-xs text-eldra-accent-text underline underline-offset-4"
                  :disabled="saveState === 'saving'"
                  @click="revertMechanicsPath('rarity')"
                >
                  Revert
                </button>
              </div>
              <select
                v-model="mechanicsDraft.rarity"
                class="mt-1 min-h-11 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
              >
                <option value="">
                  Inherit ({{ preview?.itemMechanicsEditing?.rarity || 'none' }})
                </option>
                <option
                  v-for="option in ITEM_RARITY_OPTIONS"
                  :key="option"
                  :value="option"
                >
                  {{ option }}
                </option>
                <option
                  v-if="preview?.itemMechanicsEditing?.rarity && !ITEM_RARITY_OPTIONS.includes(preview.itemMechanicsEditing.rarity as typeof ITEM_RARITY_OPTIONS[number])"
                  :value="preview.itemMechanicsEditing.rarity"
                >
                  {{ preview.itemMechanicsEditing.rarity }} (current, unrecognized)
                </option>
              </select>
            </div>

            <div>
              <div class="flex items-center justify-between gap-2">
                <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Weight</label>
                <button
                  v-if="mechanicsCustomizedPaths.has('weight')"
                  type="button"
                  class="text-xs text-eldra-accent-text underline underline-offset-4"
                  :disabled="saveState === 'saving'"
                  @click="revertMechanicsPath('weight')"
                >
                  Revert
                </button>
              </div>
              <input
                v-model="mechanicsDraft.weight"
                type="number"
                min="0"
                step="any"
                :placeholder="`Inherit (${preview?.itemMechanicsEditing?.weight ?? 0})`"
                class="mt-1 min-h-11 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
              >
            </div>
          </div>

          <div class="mt-3">
            <div class="flex items-center justify-between gap-2">
              <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Attunement</label>
              <button
                v-if="mechanicsCustomizedPaths.has('attunement')"
                type="button"
                class="text-xs text-eldra-accent-text underline underline-offset-4"
                :disabled="saveState === 'saving'"
                @click="revertMechanicsPath('attunement')"
              >
                Revert
              </button>
            </div>
            <select
              v-model="mechanicsDraft.attunement"
              class="mt-1 min-h-11 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
            >
              <option value="inherit">
                Inherit ({{ preview?.itemMechanicsEditing?.attunement?.required ? 'requires attunement' : 'no attunement' }})
              </option>
              <option value="required">
                Requires attunement
              </option>
              <option value="not-required">
                Does not require attunement
              </option>
            </select>
            <input
              v-if="mechanicsDraft.attunement === 'required'"
              v-model="mechanicsDraft.attunementText"
              type="text"
              placeholder="Restriction text (optional), e.g. &quot;by a Spellcaster&quot;"
              class="mt-2 min-h-11 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
            >
            <p class="mt-1 text-xs text-eldra-text-faint">
              This only records a restriction -- Eldra does not enforce attunement limits automatically.
            </p>
          </div>

          <template v-if="isWeapon">
            <div class="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div class="flex items-center justify-between gap-2">
                  <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Damage dice</label>
                  <button
                    v-if="mechanicsCustomizedPaths.has('damage')"
                    type="button"
                    class="text-xs text-eldra-accent-text underline underline-offset-4"
                    :disabled="saveState === 'saving'"
                    @click="revertMechanicsPath('damage')"
                  >
                    Revert
                  </button>
                </div>
                <input
                  v-model="mechanicsDraft.damageDice"
                  type="text"
                  :placeholder="`Inherit (${preview?.itemMechanicsEditing?.damage?.dice || 'none'})`"
                  class="mt-1 min-h-11 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
                >
                <p class="mt-1 text-xs text-eldra-text-faint">
                  Whole dice only, e.g. "1d8" -- no modifiers.
                </p>
              </div>
              <div>
                <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Damage type</label>
                <select
                  v-model="mechanicsDraft.damageType"
                  class="mt-1 min-h-11 w-full rounded-none border border-eldra-accent/24 bg-eldra-well px-3 text-sm text-eldra-text-strong focus:border-eldra-accent focus:outline-none"
                >
                  <option value="">
                    None
                  </option>
                  <option
                    v-for="option in WEAPON_DAMAGE_TYPE_OPTIONS"
                    :key="option.code"
                    :value="option.code"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </div>
            </div>

            <div class="mt-3">
              <div class="flex items-center justify-between gap-2">
                <label class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">Weapon properties</label>
                <button
                  v-if="mechanicsCustomizedPaths.has('property')"
                  type="button"
                  class="text-xs text-eldra-accent-text underline underline-offset-4"
                  :disabled="saveState === 'saving'"
                  @click="revertMechanicsPath('property')"
                >
                  Revert
                </button>
              </div>
              <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                <label
                  v-for="row in propertyRowsForDisplay"
                  :key="row.property"
                  class="flex items-center gap-1.5 text-sm text-eldra-text-soft"
                  :class="row.state === 'locked' ? 'opacity-60' : ''"
                  :title="row.state === 'locked' ? `Not editable here -- carries a condition (${row.note}) that would be lost` : undefined"
                >
                  <input
                    v-if="row.state !== 'locked'"
                    v-model="mechanicsDraft.property[row.property]"
                    type="checkbox"
                  >
                  <input
                    v-else
                    type="checkbox"
                    checked
                    disabled
                  >
                  {{ row.label }}<span v-if="row.state === 'locked'"> ({{ row.note }})</span>
                </label>
              </div>
            </div>
          </template>
          <p
            v-else
            class="mt-3 text-xs text-eldra-text-faint"
          >
            Damage and weapon properties are only editable for items the system already resolves as a weapon.
          </p>
        </div>
        </template>

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

        <template v-if="!isQuickField">
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

        <div
          v-if="isItemEntity && mechanicsCustomizedPaths.size"
          class="border-t border-eldra-accent/24 pt-4"
        >
          <button
            type="button"
            class="min-h-9 rounded-none border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-500/10"
            :disabled="saveState === 'saving'"
            @click="revertMechanicsAll"
          >
            Revert all mechanics overrides
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
        </template>
      </div>

      <!-- Live preview -- omitted entirely in Quick edit, per the owner's
           own field list (no mechanics previews there either). -->
      <div
        v-if="!isQuickField"
        class="min-w-0"
      >
        <div class="text-[11px] uppercase tracking-[0.2em] text-eldra-text-faint">
          Last saved state
        </div>
        <p class="mt-1 text-xs text-eldra-text-faint">
          Reflects what was last saved, not your unsaved edits above -- Save, then this refreshes.
        </p>
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
             with what the admin sees once they close this editor. Reads
             the EFFECTIVE (merged) data, so it reflects a saved mechanics
             override above too, once Save completes and this reloads. -->
        <div
          v-if="preview?.metaLines?.length"
          class="mt-3 eldra-corner-runes rounded-none border border-eldra-accent/22 bg-eldra-panel/72 p-4 text-sm leading-7 text-slate-200"
        >
          <div class="mb-2 text-xs uppercase tracking-[0.25em] text-eldra-text-faint">
            {{ isItemEntity ? 'Other mechanics (read-only here)' : 'Mechanics (not editable here)' }}
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
