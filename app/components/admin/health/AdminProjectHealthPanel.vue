<script setup lang="ts">
// Game Admin "Project Health" tab -- see this task's own DESIGN
// PHILOSOPHY: "The application should tell the developer when something
// needs attention," answering "What needs my attention before I continue
// working?" This is an OPERATIONAL DASHBOARD, not a debug console --
// everything shown and every action offered already exists elsewhere
// (GET /api/worlds/:id/rules/summary, GET /api/rules-packages,
// GET/POST .../content-packs, POST /api/content-packs/refresh); this panel
// only reads them and tells the developer what to do next. It never
// constructs a Registry, a DependencyGraph, or a runtime itself -- the
// exact same restriction AdminRulesPanel.vue's own header states, for the
// same reason.
//
// ---------------------------------------------------------------------------
// RULES PACKAGE CARD
// ---------------------------------------------------------------------------
// Reuses the SAME summary endpoint AdminRulesPanel.vue's own
// AdminRulesReadyState/AdminRulesBrokenState already render, plus
// GET /api/rules-packages (Infrastructure Commit 9's package list) to
// compute "is this World on the latest published version" -- see
// projectHealth.ts's classifyRulesHealth for the actual comparison. No
// activation UI is duplicated here: the one action this card offers ("Go
// to Rules Activation") emits `navigate` for the PARENT
// (worlds/[id]/admin.vue) to switch its own `activePanel` to 'rules' --
// exactly the same emit-and-let-the-parent-decide shape every sibling
// panel already uses for `@published`/`@activated`/`@changed`.
//
// ---------------------------------------------------------------------------
// CONTENT PACK CARDS
// ---------------------------------------------------------------------------
// One per binding from GET /api/worlds/:id/content-packs
// (world-content-pack-binding.ts, unchanged), cross-referenced against
// GET /api/content-packs (every published version, unchanged) to compute
// "is this binding on the latest published version" -- see
// classifyContentPackHealth. Refresh availability is resolved the same way
// AdminContentPackBuilderPanel.vue's own Refresh section resolves its
// target: matching a bound packageId back to a registered (gameSystemKey,
// collectionKey) via the registry's own suggestedPackageId (see
// resolveContentSourceForPackageId). A packageId published under a custom
// name correctly shows Refresh as unavailable -- there is no provider to
// resolve it against, the same honest degradation the Builder panel's own
// Refresh section already accepts. "Rebuild Content Package" posts
// directly to the EXISTING POST /api/content-packs/refresh (Developer
// Workflow: Refresh Content Package) -- no second refresh implementation,
// no curation UI duplicated, matching this task's own "reuse the workflow
// implemented previously."
//
// ---------------------------------------------------------------------------
// FUTURE PLACEHOLDERS
// ---------------------------------------------------------------------------
// Importer/Rules Facet/Presentation fingerprint and Runtime/Schema/Entity
// health are rendered as inert, clearly-labeled "Reserved" tiles wired to
// NOTHING -- this task's own instruction is to leave the extension point
// obvious without implementing any detection yet. See projectHealth.ts's
// own header note on where a future fingerprint would actually plug in
// (ContentPackManifest.origin, per content-sources/refresh.ts's own
// documented extension point from the prior task).
//
// ---------------------------------------------------------------------------
// GRACEFUL DEGRADATION
// ---------------------------------------------------------------------------
// Four independent reads happen in parallel (Promise.allSettled): a single
// source failing degrades only the card(s) that depend on it (an unknown
// "latest version" reads as `null`/"Unknown", never as a false Warning or
// a false Healthy -- see projectHealth.ts's own `isLatest: null` case).
// Only a TOTAL failure across every source surfaces as a page-level error.

import { GAME_SYSTEM_REGISTRY } from '~/lib/content-sources/registry'
import AdminHealthStatusBadge from './AdminHealthStatusBadge.vue'
import AdminDeveloperToolsPanel from './AdminDeveloperToolsPanel.vue'
import {
  classifyContentPackHealth,
  classifyRulesHealth,
  resolveContentSourceForPackageId,
  type ContentPackHealth,
  type PackageListing,
  type RulesPackageHealth
} from './projectHealth'

const props = defineProps<{
  worldId: string | number
}>()

const emit = defineEmits<{ navigate: [string] }>()

const worldId = computed(() => String(props.worldId || ''))

type BoundPack = {
  id: string
  packageId: string
  packageVersion: string
  packageIntegrity: string | null
}

const pending = ref(false)
const errorMessage = ref('')

const rulesSummary = ref<unknown>(null)
const publishedRulesPackages = ref<PackageListing[]>([])
const boundContentPacks = ref<BoundPack[]>([])
const publishedContentPacks = ref<PackageListing[]>([])

// The one place every piece of health state is (re)loaded -- called on
// mount, on manual Refresh, and after a successful Rebuild, matching
// AdminRulesPanel.vue's own "no optimistic updates, always refresh from
// the server" convention.
async function loadHealth() {
  if (!worldId.value) return

  pending.value = true
  errorMessage.value = ''

  const [summaryResult, rulesListResult, boundResult, publishedResult] = await Promise.allSettled([
    $fetch(`/api/worlds/${worldId.value}/rules/summary`),
    $fetch<{ packages: PackageListing[] }>('/api/rules-packages'),
    $fetch<{ bindings: BoundPack[] }>(`/api/worlds/${worldId.value}/content-packs`),
    $fetch<{ packages: PackageListing[] }>('/api/content-packs')
  ])

  rulesSummary.value = summaryResult.status === 'fulfilled' ? summaryResult.value : { configured: false }
  publishedRulesPackages.value = rulesListResult.status === 'fulfilled' ? rulesListResult.value.packages || [] : []
  boundContentPacks.value = boundResult.status === 'fulfilled' ? boundResult.value.bindings || [] : []
  publishedContentPacks.value = publishedResult.status === 'fulfilled' ? publishedResult.value.packages || [] : []

  if ([summaryResult, rulesListResult, boundResult, publishedResult].every((result) => result.status === 'rejected')) {
    errorMessage.value = 'Failed to load Project Health -- none of its data sources responded.'
  }

  pending.value = false
}

watch(worldId, loadHealth, { immediate: true })

const rulesHealth = computed<RulesPackageHealth>(() =>
  classifyRulesHealth(rulesSummary.value, publishedRulesPackages.value)
)

const contentPackHealth = computed<ContentPackHealth[]>(() =>
  boundContentPacks.value.map((binding) =>
    classifyContentPackHealth({
      packageId: binding.packageId,
      boundVersion: binding.packageVersion,
      publishedListings: publishedContentPacks.value,
      refreshAvailable: resolveContentSourceForPackageId(binding.packageId, GAME_SYSTEM_REGISTRY) !== null
    })
  )
)

const rebuildPendingFor = ref<Record<string, boolean>>({})
const rebuildErrorFor = ref<Record<string, string>>({})
const rebuildResultFor = ref<Record<string, string>>({})

async function rebuildContentPackage(packageId: string) {
  const source = resolveContentSourceForPackageId(packageId, GAME_SYSTEM_REGISTRY)
  if (!source) return

  rebuildPendingFor.value = { ...rebuildPendingFor.value, [packageId]: true }
  rebuildErrorFor.value = { ...rebuildErrorFor.value, [packageId]: '' }

  try {
    const response = await $fetch<{ version: string }>('/api/content-packs/refresh', {
      method: 'POST',
      body: { gameSystemKey: source.gameSystemKey, collectionKey: source.collectionKey, packageId }
    })
    rebuildResultFor.value = { ...rebuildResultFor.value, [packageId]: response.version }
    await loadHealth()
  } catch (error: any) {
    rebuildErrorFor.value = {
      ...rebuildErrorFor.value,
      [packageId]: error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to rebuild the Content Package.'
    }
  } finally {
    rebuildPendingFor.value = { ...rebuildPendingFor.value, [packageId]: false }
  }
}

function truncatedHash(hash: string | null): string {
  if (!hash) return '—'
  return hash.length > 20 ? `${hash.slice(0, 20)}…` : hash
}

const FUTURE_PLACEHOLDERS = [
  {
    key: 'importer-fingerprint',
    title: 'Importer Fingerprint',
    description: 'Will detect when a published Content Pack was built by an older version of the 5etools importer.'
  },
  {
    key: 'rules-facet-fingerprint',
    title: 'Rules Facet Fingerprint',
    description: "Will detect when a Content Pack's baked-in Rules Facets no longer match the current facet corpus (app/lib/content-rules)."
  },
  {
    key: 'presentation-fingerprint',
    title: 'Presentation Fingerprint',
    description: "Will detect when a Content Pack's presentation resolvers have changed since it was last published."
  },
  {
    key: 'runtime-health',
    title: 'Runtime Health',
    description: 'Will surface Rules Engine evaluation errors and dependency-graph issues for this World, beyond activation state.'
  },
  {
    key: 'schema-health',
    title: 'Schema Health',
    description: "Will verify this World's required Directus collections/fields exist and are readable/writable."
  },
  {
    key: 'entity-health',
    title: 'Entity Health',
    description: 'Will surface broken entity references (missing catalogue entries, orphaned block instances) across this World.'
  }
] as const
</script>

<template>
  <section class="mt-6 grid gap-5">
    <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Operational Dashboard
          </div>
          <h2 class="mt-2 text-2xl font-semibold text-white">
            Project Health
          </h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-[#d8ceb8]">
            What needs your attention before you continue working -- the current state of this World's Rules Package and Content Packs, and what to do about anything that isn't Healthy.
          </p>
        </div>

        <button
          type="button"
          class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
          @click="loadHealth"
        >
          Refresh
        </button>
      </div>

      <div
        v-if="pending"
        class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
      >
        Loading Project Health...
      </div>

      <div
        v-else-if="errorMessage"
        class="mt-5 rounded-none border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200"
      >
        {{ errorMessage }}
      </div>
    </div>

    <template v-if="!pending">
      <!-- Rules Package Card -->
      <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Rules Package
            </div>
            <h3 class="mt-2 text-xl font-semibold text-white">
              {{ rulesHealth.activePackageId || 'No Rules Package activated' }}
            </h3>
          </div>

          <AdminHealthStatusBadge :status="rulesHealth.status" />
        </div>

        <div
          v-if="rulesHealth.status === 'not-configured'"
          class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-4 text-sm text-[#9f9278]"
        >
          <div class="font-semibold text-[#d8ceb8]">
            Current state
          </div>
          <p class="mt-1">
            This World has no active Rules Package. Character sheets and rolls have no mechanics to evaluate against.
          </p>
          <div class="mt-3 font-semibold text-[#d8ceb8]">
            Recommended action
          </div>
          <button
            type="button"
            class="eldra-button mt-2 rounded-none px-3 py-2 text-xs font-semibold"
            @click="emit('navigate', 'rules')"
          >
            Go to Rules Activation
          </button>
        </div>

        <div
          v-else-if="rulesHealth.status === 'needs-attention'"
          class="mt-4 rounded-none border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200"
        >
          <div class="font-semibold">
            Problem
          </div>
          <p class="mt-1">
            The active Rules Package failed to load ({{ rulesHealth.brokenStage || 'unknown stage' }}). This World's Rules Engine runtime is broken -- see the Rules tab for the full failure detail.
          </p>
          <div class="mt-3 font-semibold">
            Recommended action
          </div>
          <button
            type="button"
            class="eldra-button mt-2 rounded-none px-3 py-2 text-xs font-semibold"
            @click="emit('navigate', 'rules')"
          >
            Go to Rules Activation
          </button>
        </div>

        <template v-else>
          <dl class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                Version
              </dt>
              <dd class="mt-1 font-mono text-sm text-[#fff7df]">
                {{ rulesHealth.activeVersion }}
              </dd>
            </div>
            <div>
              <dt class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                Integrity
              </dt>
              <dd class="mt-1 truncate font-mono text-xs text-[#d8ceb8]" :title="rulesHealth.integrityHash || ''">
                {{ truncatedHash(rulesHealth.integrityHash) }}
              </dd>
            </div>
            <div>
              <dt class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                Latest published version
              </dt>
              <dd class="mt-1 font-mono text-sm text-[#fff7df]">
                {{ rulesHealth.latestVersion || 'Unknown' }}
              </dd>
            </div>
            <div>
              <dt class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                Using latest?
              </dt>
              <dd class="mt-1 text-sm" :class="rulesHealth.isLatest === false ? 'text-amber-200' : 'text-[#d8ceb8]'">
                {{ rulesHealth.isLatest === null ? 'Unknown' : rulesHealth.isLatest ? 'Yes' : 'No' }}
              </dd>
            </div>
          </dl>

          <div
            v-if="rulesHealth.status === 'warning'"
            class="mt-4 rounded-none border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100"
          >
            <div class="font-semibold">
              Problem
            </div>
            <p class="mt-1">
              This World is running <span class="font-mono">{{ rulesHealth.activeVersion }}</span>, but <span class="font-mono">{{ rulesHealth.latestVersion }}</span> has already been published. Newer mechanics/fixes will not take effect until this World is reactivated.
            </p>
            <div class="mt-3 font-semibold">
              Recommended action
            </div>
            <button
              type="button"
              class="eldra-button mt-2 rounded-none px-3 py-2 text-xs font-semibold"
              @click="emit('navigate', 'rules')"
            >
              Go to Rules Activation
            </button>
          </div>
        </template>
      </div>

      <!-- Content Pack Cards -->
      <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Content Packs
            </div>
            <h3 class="mt-2 text-xl font-semibold text-white">
              Bound to This World
            </h3>
          </div>

          <button
            type="button"
            class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
            @click="emit('navigate', 'content-packs')"
          >
            Go to Content Packs
          </button>
        </div>

        <div
          v-if="!boundContentPacks.length"
          class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-4 text-sm text-[#9f9278]"
        >
          <div class="font-semibold text-[#d8ceb8]">
            Current state
          </div>
          <p class="mt-1">
            No Content Packs are bound to this World. Species, Classes, Backgrounds, Feats, Items, and Spells are unavailable to Character Creation.
          </p>
          <div class="mt-3 font-semibold text-[#d8ceb8]">
            Recommended action
          </div>
          <button
            type="button"
            class="eldra-button mt-2 rounded-none px-3 py-2 text-xs font-semibold"
            @click="emit('navigate', 'content-packs')"
          >
            Go to Content Packs
          </button>
        </div>

        <div
          v-else
          class="mt-4 grid gap-3"
        >
          <article
            v-for="health in contentPackHealth"
            :key="health.packageId"
            class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.42)] p-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-white">
                  {{ health.packageId }}
                </div>
              </div>
              <AdminHealthStatusBadge :status="health.status" />
            </div>

            <dl class="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <dt class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                  Bound version
                </dt>
                <dd class="mt-1 font-mono text-sm text-[#fff7df]">
                  {{ health.boundVersion }}
                </dd>
              </div>
              <div>
                <dt class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                  Published version
                </dt>
                <dd class="mt-1 font-mono text-sm text-[#fff7df]">
                  {{ health.latestVersion || 'Unknown' }}
                </dd>
              </div>
              <div>
                <dt class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                  Refresh available?
                </dt>
                <dd class="mt-1 text-sm text-[#d8ceb8]">
                  {{ health.refreshAvailable ? 'Yes' : 'No' }}
                </dd>
              </div>
            </dl>

            <div
              v-if="!health.publishedVersionExists"
              class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-xs leading-5 text-red-200"
            >
              <div class="font-semibold">
                Problem
              </div>
              <p class="mt-1">
                This World is bound to <span class="font-mono">{{ health.boundVersion }}</span>, which no longer resolves to a published Content Pack row (integrity or version mismatch). Content from this pack may not load at all.
              </p>
            </div>

            <div
              v-else-if="health.status === 'warning'"
              class="mt-3 rounded-none border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100"
            >
              <div class="font-semibold">
                Problem
              </div>
              <p class="mt-1">
                Bound to <span class="font-mono">{{ health.boundVersion }}</span>, but <span class="font-mono">{{ health.latestVersion }}</span> has already been published.
              </p>
            </div>

            <div
              v-if="health.status !== 'healthy'"
              class="mt-3"
            >
              <div class="text-xs font-semibold uppercase tracking-[0.14em] text-[#9f9278]">
                Recommended action
              </div>

              <button
                v-if="health.refreshAvailable"
                type="button"
                class="eldra-button mt-2 rounded-none px-3 py-2 text-xs font-semibold disabled:opacity-50"
                :disabled="rebuildPendingFor[health.packageId]"
                @click="rebuildContentPackage(health.packageId)"
              >
                {{ rebuildPendingFor[health.packageId] ? 'Rebuilding…' : 'Rebuild Content Package' }}
              </button>

              <p
                v-else
                class="mt-2 text-xs text-[#9f9278]"
              >
                Refresh is unavailable for this package -- it was not published under a registered Content Source's suggested identity. Republish it from Content Packs instead.
              </p>

              <div
                v-if="rebuildResultFor[health.packageId]"
                class="mt-2 rounded-none border border-emerald-500/20 bg-emerald-500/10 p-2 text-xs text-emerald-100"
              >
                Rebuilt as v{{ rebuildResultFor[health.packageId] }}. Bind the new version from Content Packs when ready.
              </div>

              <div
                v-if="rebuildErrorFor[health.packageId]"
                class="mt-2 rounded-none border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-200"
              >
                {{ rebuildErrorFor[health.packageId] }}
              </div>
            </div>
          </article>
        </div>
      </div>

      <!-- Developer Tools -- Eldra Roll System Phase 2A. See
           AdminDeveloperToolsPanel.vue's own header for why this
           subsection exists and how future tools join it. -->
      <AdminDeveloperToolsPanel :world-id="worldId" />

      <!-- Future Placeholders -->
      <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-dashed border-[rgba(201,164,90,0.22)] bg-[rgba(8,17,27,0.34)] p-5">
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Reserved -- Not Yet Implemented
        </div>
        <h3 class="mt-2 text-xl font-semibold text-white">
          Coming to Project Health
        </h3>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-[#d8ceb8]">
          Extension points for future automatic staleness detection. No detection runs yet -- these tiles are reserved layout only.
        </p>

        <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="placeholder in FUTURE_PLACEHOLDERS"
            :key="placeholder.key"
            class="rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(20,17,12,0.44)] p-3"
          >
            <div class="text-sm font-semibold text-white">
              {{ placeholder.title }}
            </div>
            <p class="mt-1 text-xs leading-5 text-[#9f9278]">
              {{ placeholder.description }}
            </p>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
