<script setup lang="ts">
// Developer Tools -- a new subsection of Game Admin's "Project Health" tab
// (Eldra Roll System Phase 2A, .github/docs/architecture/eldra-roll-system.md).
// Did not exist before this task; created as the home for developer-facing
// tools that exercise a real system's production server pipeline end to
// end -- never a curated demo, never mocked data.
//
// This file is only the section frame: a kicker, a description, and a
// slot for each tool. The Roll Sandbox is the first (and, as of this
// commit, only) tool -- a future addition mounts its own component here
// alongside it, the same way Project Health's own Rules Package/Content
// Pack cards sit side by side in AdminProjectHealthPanel.vue.

import AdminRollSandbox from './AdminRollSandbox.vue'

defineProps<{
  worldId: string | number
}>()
</script>

<template>
  <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
      Developer Tools
    </div>
    <h3 class="mt-2 text-xl font-semibold text-white">
      Debugging &amp; Pipeline Utilities
    </h3>
    <p class="mt-2 max-w-2xl text-sm leading-6 text-[#d8ceb8]">
      Tools that exercise a real Eldra system directly -- no mocked data, no shortcut around authorization -- so a subsystem can be proven correct before any gameplay feature depends on it.
    </p>

    <div class="mt-5 border-t border-[rgba(201,164,90,0.14)] pt-5">
      <AdminRollSandbox :world-id="worldId" />
    </div>
  </div>
</template>
