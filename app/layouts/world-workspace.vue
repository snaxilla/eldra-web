<script setup lang="ts">
const route = useRoute()

const worldId = computed(() => String(route.params.id || ''))

const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')
const leftCollapsed = useState<boolean>('world-workspace-left-collapsed', () => false)

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)
</script>

<template>
  <div class="h-screen w-screen overflow-hidden bg-[#050913] text-slate-100">
    <div
      class="grid h-full"
      :style="{ gridTemplateColumns: leftCollapsed ? '68px minmax(0,1fr)' : '280px minmax(0,1fr)' }"
    >
      <WorldWorkspaceSidebar
        :world="world"
        :collapsed="leftCollapsed"
        :mode="mode"
        @toggle-collapse="leftCollapsed = !leftCollapsed"
        @set-mode="mode = $event"
      />

      <div class="min-w-0 overflow-hidden">
        <slot />
      </div>
    </div>
  </div>
</template>
