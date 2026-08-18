<script setup lang="ts">
// Game Admin "Content Packs" tab -- the Content Pack Binding UI, now
// preceded by the Content Pack Builder Preview (AdminContentPackBuilderPanel,
// rendered first below -- Import -> Preview -> Curate, this tab's own
// pipeline order). See server/utils/world-content-pack-binding.ts (binding
// business logic, reused unchanged -- see BEHAVIOR below) and
// .github/docs/architecture/ownership-and-permissions.md (Revision 2) §7.5
// ("installing a pack is a Platform action; binding one to a world is a
// World action").
//
// BEHAVIOR: this component only ever calls existing routes --
// GET /api/content-packs (published packs), GET/POST /api/worlds/:id/content-packs
// (this World's bindings, and Bind), DELETE /api/worlds/:id/content-packs/:packageId
// (Unbind). It never talks to Directus and never reimplements
// bindContentPackToWorld/unbindContentPackFromWorld -- those already do
// 100% of the verification (loadPublishedContentPack's own status +
// integrity check) and persistence. Matching AdminRulesPanel.vue/
// AdminMembersPanel.vue's own established convention, nothing here updates
// its local idea of "what's bound" optimistically: every successful
// Bind/Unbind re-fetches the bound-packs list from the server (loadBoundPacks).
//
// AUTHORIZATION: Bind/Unbind controls render only when the current
// Principal's capabilities for this World (GET /api/worlds/:id, the exact
// mechanism app/layouts/world-workspace.vue already uses to gate Build
// mode) include the EXISTING `world.content.bind_pack` capability
// (server/utils/authorization.ts) -- no new capability invented. The
// published-/bound-pack LISTS themselves are read-only and left unguarded,
// matching GET /api/worlds/:id/content-packs and GET /api/worlds/:id/rules/summary's
// own shared "reading is not gated the way writing is" precedent. A bare
// Player never reaches this tab at all -- Game Admin's own page-level
// `middleware: 'admin'` (app/pages/worlds/[id]/admin.vue) already keeps
// them out; this capability check covers the narrower case of an
// authenticated admin viewing a World where they hold a role short of
// Owner/GM.

import AdminContentPackBuilderPanel from './AdminContentPackBuilderPanel.vue'

const props = defineProps<{
  worldId: string | number
}>()

const worldId = computed(() => String(props.worldId || ''))

type PublishedPack = {
  packageId: string
  version: string
  title: string
  contentSchemaVersion: number
  licenseId: string | null
}

type BoundPack = {
  id: string
  worldId: string
  packageId: string
  packageVersion: string
  packageIntegrity: string | null
  createdAt: string | null
  updatedAt: string | null
}

const canBindPacks = ref(false)

const publishedPacks = ref<PublishedPack[]>([])
const publishedPending = ref(false)
const publishedError = ref('')

const boundPacks = ref<BoundPack[]>([])
const boundPending = ref(false)
const boundError = ref('')

// Per-row pending/error state, keyed by `packageId@version` -- mirrors
// AdminMembersPanel.vue's own per-row keyed-by-accountId convention, so
// one row's Bind/Unbind in flight never disables every other row.
const bindPendingFor = ref<Record<string, boolean>>({})
const unbindPendingFor = ref<Record<string, boolean>>({})
const rowError = ref<Record<string, string>>({})

function packKey(packageId: string, version: string) {
  return `${packageId}@${version}`
}

async function loadCapabilities() {
  if (!worldId.value) return

  try {
    const world = await $fetch<{ capabilities?: string[] }>(`/api/worlds/${worldId.value}`)
    canBindPacks.value = Array.isArray(world?.capabilities) && world.capabilities.includes('world.content.bind_pack')
  } catch {
    // Fails closed -- an error reading capabilities never reveals controls.
    canBindPacks.value = false
  }
}

async function loadPublishedPacks() {
  publishedPending.value = true
  publishedError.value = ''

  try {
    const response = await $fetch<{ packages: PublishedPack[] }>('/api/content-packs')
    publishedPacks.value = response.packages || []
  } catch (error: any) {
    publishedPacks.value = []
    publishedError.value =
      error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to load published Content Packs.'
  } finally {
    publishedPending.value = false
  }
}

async function loadBoundPacks() {
  if (!worldId.value) return

  boundPending.value = true
  boundError.value = ''

  try {
    const response = await $fetch<{ bindings: BoundPack[] }>(`/api/worlds/${worldId.value}/content-packs`)
    boundPacks.value = response.bindings || []
  } catch (error: any) {
    boundPacks.value = []
    boundError.value =
      error?.data?.statusMessage || error?.data?.message || error?.message || "Failed to load this World's bound Content Packs."
  } finally {
    boundPending.value = false
  }
}

watch(
  worldId,
  () => {
    loadCapabilities()
    loadPublishedPacks()
    loadBoundPacks()
  },
  { immediate: true }
)

function isBound(pack: PublishedPack) {
  return boundPacks.value.some((binding) => binding.packageId === pack.packageId && binding.packageVersion === pack.version)
}

async function bind(pack: PublishedPack) {
  const key = packKey(pack.packageId, pack.version)
  bindPendingFor.value = { ...bindPendingFor.value, [key]: true }
  rowError.value = { ...rowError.value, [key]: '' }

  try {
    await $fetch(`/api/worlds/${worldId.value}/content-packs`, {
      method: 'POST',
      body: { packageId: pack.packageId, version: pack.version }
    })
    await loadBoundPacks()
  } catch (error: any) {
    rowError.value = {
      ...rowError.value,
      [key]: error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to bind Content Pack.'
    }
  } finally {
    bindPendingFor.value = { ...bindPendingFor.value, [key]: false }
  }
}

async function unbind(binding: BoundPack) {
  const key = packKey(binding.packageId, binding.packageVersion)
  unbindPendingFor.value = { ...unbindPendingFor.value, [key]: true }
  rowError.value = { ...rowError.value, [key]: '' }

  try {
    await $fetch(`/api/worlds/${worldId.value}/content-packs/${encodeURIComponent(binding.packageId)}`, {
      method: 'DELETE'
    })
    await loadBoundPacks()
  } catch (error: any) {
    rowError.value = {
      ...rowError.value,
      [key]: error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to unbind Content Pack.'
    }
  } finally {
    unbindPendingFor.value = { ...unbindPendingFor.value, [key]: false }
  }
}

async function refreshAll() {
  await Promise.all([loadCapabilities(), loadPublishedPacks(), loadBoundPacks()])
}
</script>

<template>
  <section class="mt-6 grid gap-5">
    <AdminContentPackBuilderPanel />
    <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Published Content Packs
          </div>
          <h2 class="mt-2 text-2xl font-semibold text-white">
            Bind a Content Pack
          </h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-[#d8ceb8]">
            Every Content Pack published to the platform. Binding one makes its Species, Classes, Backgrounds, Feats, Items, and Spells available to this World.
          </p>
        </div>

        <button
          type="button"
          class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
          @click="refreshAll"
        >
          Refresh
        </button>
      </div>

      <div
        v-if="publishedPending"
        class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
      >
        Loading published Content Packs...
      </div>

      <div
        v-else-if="publishedError"
        class="mt-5 rounded-none border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200"
      >
        {{ publishedError }}
      </div>

      <div
        v-else-if="!publishedPacks.length"
        class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
      >
        No Content Packs have been published yet.
      </div>

      <div
        v-else
        class="mt-5 overflow-x-auto"
      >
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-[rgba(201,164,90,0.24)] text-xs uppercase tracking-[0.2em] text-[#9f9278]">
              <th class="py-2 pr-4 font-semibold">
                Package
              </th>
              <th class="py-2 pr-4 font-semibold">
                Version
              </th>
              <th class="py-2 pr-4 font-semibold">
                License
              </th>
              <th
                v-if="canBindPacks"
                class="py-2 pr-4 font-semibold"
              />
            </tr>
          </thead>
          <tbody>
            <template
              v-for="pack in publishedPacks"
              :key="packKey(pack.packageId, pack.version)"
            >
              <tr class="border-b border-[rgba(201,164,90,0.12)]">
                <td class="py-3 pr-4 text-[#fff7df]">
                  {{ pack.title || pack.packageId }}
                </td>
                <td class="py-3 pr-4 font-mono text-[#d8ceb8]">
                  {{ pack.version }}
                </td>
                <td class="py-3 pr-4 text-[#9f9278]">
                  {{ pack.licenseId || '—' }}
                </td>
                <td
                  v-if="canBindPacks"
                  class="py-3 pr-4 text-right"
                >
                  <button
                    type="button"
                    class="rounded-none border border-[rgba(201,164,90,0.24)] px-2 py-1 text-xs font-semibold text-[#fff7df] disabled:opacity-50"
                    :disabled="isBound(pack) || bindPendingFor[packKey(pack.packageId, pack.version)]"
                    @click="bind(pack)"
                  >
                    {{ isBound(pack) ? 'Bound' : bindPendingFor[packKey(pack.packageId, pack.version)] ? 'Binding…' : 'Bind' }}
                  </button>
                </td>
              </tr>
              <tr v-if="rowError[packKey(pack.packageId, pack.version)]">
                <td
                  colspan="4"
                  class="pb-2 text-xs text-red-300"
                >
                  {{ rowError[packKey(pack.packageId, pack.version)] }}
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
      <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
        Currently Bound Content Packs
      </div>
      <h2 class="mt-2 text-2xl font-semibold text-white">
        This World's Content
      </h2>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-[#d8ceb8]">
        Character Creation and every other gameplay system read from exactly this list.
      </p>

      <div
        v-if="boundPending"
        class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
      >
        Loading bound Content Packs...
      </div>

      <div
        v-else-if="boundError"
        class="mt-5 rounded-none border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200"
      >
        {{ boundError }}
      </div>

      <div
        v-else-if="!boundPacks.length"
        class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
      >
        This World has no Content Packs yet.
      </div>

      <div
        v-else
        class="mt-5 overflow-x-auto"
      >
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-[rgba(201,164,90,0.24)] text-xs uppercase tracking-[0.2em] text-[#9f9278]">
              <th class="py-2 pr-4 font-semibold">
                Package
              </th>
              <th class="py-2 pr-4 font-semibold">
                Version
              </th>
              <th class="py-2 pr-4 font-semibold">
                Integrity
              </th>
              <th
                v-if="canBindPacks"
                class="py-2 pr-4 font-semibold"
              />
            </tr>
          </thead>
          <tbody>
            <template
              v-for="binding in boundPacks"
              :key="binding.id"
            >
              <tr class="border-b border-[rgba(201,164,90,0.12)]">
                <td class="py-3 pr-4 text-[#fff7df]">
                  {{ binding.packageId }}
                </td>
                <td class="py-3 pr-4 font-mono text-[#d8ceb8]">
                  {{ binding.packageVersion }}
                </td>
                <td class="py-3 pr-4 truncate font-mono text-xs text-[#9f9278]" style="max-width: 220px;">
                  {{ binding.packageIntegrity || '—' }}
                </td>
                <td
                  v-if="canBindPacks"
                  class="py-3 pr-4 text-right"
                >
                  <button
                    type="button"
                    class="rounded-none border border-red-500/30 px-2 py-1 text-xs font-semibold text-red-200 disabled:opacity-50"
                    :disabled="unbindPendingFor[packKey(binding.packageId, binding.packageVersion)]"
                    @click="unbind(binding)"
                  >
                    {{ unbindPendingFor[packKey(binding.packageId, binding.packageVersion)] ? 'Unbinding…' : 'Unbind' }}
                  </button>
                </td>
              </tr>
              <tr v-if="rowError[packKey(binding.packageId, binding.packageVersion)]">
                <td
                  colspan="4"
                  class="pb-2 text-xs text-red-300"
                >
                  {{ rowError[packKey(binding.packageId, binding.packageVersion)] }}
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
