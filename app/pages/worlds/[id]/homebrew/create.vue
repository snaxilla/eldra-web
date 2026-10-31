<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

import AdminHomebrewForgePanel from '~/components/admin/homebrew/AdminHomebrewForgePanel.vue'

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)

// Contextual Homebrew Authoring Entry Points -- this page is the one place
// the Spells list's "Create New Spell from Template" header action and
// per-card "Create New Spell From: ..." action both deep-link to. It
// reuses the existing Homebrew Forge panel unchanged (no second editor,
// no duplicated draft-creation logic); the only new wiring is translating
// this page's own query params into that panel's `initial-type`/
// `initial-template-id` props.
//
// `world.capabilities` (same per-World capability list already consumed
// by world-workspace.vue's own `canBuild`) gates this page's UI. This is
// convenience only -- POST /api/worlds/:id/homebrew/create independently
// calls requireCapability('world.homebrew.manage') server-side, which
// remains the authoritative check regardless of what this page shows.
const canManageHomebrew = computed(() =>
  Array.isArray(world.value?.capabilities) && world.value.capabilities.includes('world.homebrew.manage')
)

const initialType = computed(() => String(route.query.type || ''))
const initialTemplateId = computed(() => String(route.query.templateId || '') || undefined)
</script>

<template>
  <div class="game-admin-space relative isolate h-full overflow-y-auto text-[#efe2bd]">
    <div class="relative z-10 mx-auto max-w-[1700px] p-6">
      <section class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-6 backdrop-blur">
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Homebrew Forge
        </div>
        <h1 class="mt-2 text-3xl font-semibold text-white">
          Author New Content
        </h1>
        <p class="mt-2 max-w-3xl text-sm leading-6 text-[#d8ceb8]">
          Create a new world-owned draft from a legacy template or a published Content Pack entry.
        </p>
      </section>

      <section
        v-if="!canManageHomebrew"
        class="mt-6 eldra-empty rounded-none p-10 text-center shadow-xl"
      >
        <div class="text-lg font-medium text-white">
          Not Authorized
        </div>
        <p class="mt-2 text-sm text-eldra-text-soft">
          Only this World's GameMaster or an Admin can author Homebrew content.
        </p>
      </section>

      <AdminHomebrewForgePanel
        v-else
        :world-id="worldId"
        :initial-type="initialType"
        :initial-template-id="initialTemplateId"
      />
    </div>
  </div>
</template>
