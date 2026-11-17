<script setup lang="ts">
// Dedicated Full-Page Entity Editor -- Quick Edit Rail + Full-Page
// Editor pass. Comfortable, dedicated width for substantial editing
// (long descriptions, notes, source citations, mechanics preview,
// history/checkpoint), as opposed to the compact rail-embedded Quick
// Edit for a fast name/image change. Reuses the EXACT SAME shared
// direct-edit workflow (WorldEntityDirectEditDialog.vue /
// StudioEntityEditor.vue) with `surface="full"` -- no second form, no
// second persistence path.
//
// IDENTITY. Resolved ENTIRELY from this route's own params
// (worldId/entityType/slug) via the SAME `edit-target` GET the rail
// already calls -- never from a previously-selected rail row or any
// other in-memory navigation state. A direct URL visit or a hard
// refresh therefore always loads the correct entity.
definePageMeta({
  layout: 'world-workspace'
})

import { onBeforeRouteLeave } from 'vue-router'
import WorldEntityDirectEditDialog from '~/components/world/WorldEntityDirectEditDialog.vue'
import { consumeDraftTransfer, isSafeCollectionReturnPath } from '~/lib/world-entity-collection/direct-edit-navigation'

const route = useRoute()
const router = useRouter()

const worldId = computed(() => String(route.params.id || ''))
const entityType = computed(() => String(route.params.entityType || ''))
const slug = computed(() => String(route.params.slug || ''))

// A known, humanized fallback for the heading/category label and the
// Back link's own text, independent of whether the entity resolves at
// all -- a denied/not-found entity still gets a useful heading, per
// this pass's own "show a useful unavailable state" requirement.
const CATEGORY_PAGE_BY_ENTITY_TYPE: Record<string, { path: string; label: string }> = {
  item: { path: 'items', label: 'Items' },
  spell: { path: 'spells', label: 'Spells' },
  species: { path: 'species', label: 'Species' },
  class: { path: 'classes', label: 'Classes' },
  background: { path: 'backgrounds', label: 'Backgrounds' }
}
const categoryPage = computed(() => CATEGORY_PAGE_BY_ENTITY_TYPE[entityType.value] ?? null)
const categoryLabel = computed(() => categoryPage.value?.label ?? entityType.value)

function humanizeSlug(value: string): string {
  return value
    .replace(/-[a-z0-9]{2,8}$/i, '') // drop a trailing source-code suffix, e.g. "-xphb"
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || value
}

// Best-effort heading/title -- the SAME summary read the collection page
// itself uses (no new route), just to find this one row's current
// title. Never required for the editor to function: the dialog does its
// own authoritative resolve regardless of whether this succeeds.
const { data: summaryRows } = await useFetch<any[]>(
  () => `/api/worlds/${worldId.value}/entities`,
  { query: { summary: 1, type: entityType.value }, default: () => [] }
)
const summaryRow = computed(() =>
  (summaryRows.value || []).find((row: any) => String(row.slug || '') === slug.value) || null
)
const entityTitle = computed(() => summaryRow.value?.title || humanizeSlug(slug.value))

// Return-to-collection target. `return` must be THIS World's own path --
// validated here AND, independently, wherever it's actually navigated to
// (defense in depth; direct-edit-navigation.ts's own rules are shared,
// not reimplemented). Falls back to the category page (or the World Map
// if the category isn't one of the known ones) when absent/unsafe --
// e.g. a bookmarked/direct edit URL with no prior collection visit at
// all.
const returnPath = computed(() => {
  const raw = route.query.return
  const candidate = typeof raw === 'string' ? raw : ''
  if (isSafeCollectionReturnPath(candidate, worldId.value)) return candidate
  return categoryPage.value ? `/worlds/${worldId.value}/${categoryPage.value.path}` : `/worlds/${worldId.value}`
})

// Draft transfer FROM Quick Edit -- consumed (read + cleared) exactly
// once, synchronously, before the dialog ever mounts, so it can never be
// reapplied on a later, unrelated visit to this same entity.
const transferredDraft = (() => {
  if (typeof window === 'undefined') return null
  try {
    return consumeDraftTransfer(window.sessionStorage, { worldId: worldId.value, entityType: entityType.value, slug: slug.value })
  } catch {
    return null // sessionStorage can throw in some private-browsing modes
  }
})()

const isDirty = ref(false)
function onDirtyChange(dirty: boolean) {
  isDirty.value = dirty
}

function confirmDiscardIfDirty(): boolean {
  if (!isDirty.value) return true
  return window.confirm('Discard unsaved changes?')
}

// Router-navigation guard (Back link, browser back/forward) -- distinct
// from StudioEntityEditor's own `beforeunload` listener, which only
// covers a hard refresh/tab close. The dialog's own internal Close
// button already confirms via its own requestClose; this guard covers
// every OTHER way to leave this page.
onBeforeRouteLeave(() => {
  if (confirmDiscardIfDirty()) return true
  return false
})

function goToReturnPath(extraQuery: Record<string, string> = {}) {
  const [path, existingQuery] = returnPath.value.split('?')
  const query = { ...Object.fromEntries(new URLSearchParams(existingQuery || '')), ...extraQuery }
  router.push({ path, query })
}

function onSaved(contentEntityId: string) {
  // Immediate effective-content refresh on return: the collection page's
  // own `savedEntity` query param drives an identity-safe reselect by
  // canonical contentEntityId (never title/slug/type alone), and its own
  // useFetch naturally re-reads the entity list on that fresh page load.
  isDirty.value = false
  goToReturnPath({ savedEntity: contentEntityId })
}

// StudioEntityEditor's own requestClose/cancelDraft (or the first-save
// draft's own requestClose) already confirmed discarding any unsaved
// work before ever emitting this -- clearing `isDirty` first means the
// router.push below doesn't trigger a SECOND confirm() via
// onBeforeRouteLeave for the same decision the user already made.
function onClose() {
  isDirty.value = false
  goToReturnPath()
}
</script>

<template>
  <div class="mx-auto max-w-5xl p-6">
    <div class="mb-6 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <NuxtLink
          :to="returnPath"
          class="text-xs uppercase tracking-[0.25em] text-eldra-accent-text hover:underline"
        >
          ← Back to {{ categoryLabel }}
        </NuxtLink>
        <h1 class="eldra-display mt-2 truncate text-2xl text-eldra-text-strong">
          {{ entityTitle }}
        </h1>
      </div>
    </div>

    <WorldEntityDirectEditDialog
      :world-id="worldId"
      :entity-type="entityType"
      :slug="slug"
      :title="entityTitle"
      surface="full"
      :seed-draft="transferredDraft"
      @saved="onSaved"
      @close="onClose"
      @dirty-change="onDirtyChange"
    />
  </div>
</template>
