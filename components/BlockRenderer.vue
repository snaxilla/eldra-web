<script setup lang="ts">
defineProps<{ block: any }>()
</script>

<template>
  <div class="p-4 border border-neutral-800 bg-neutral-900 mb-4 rounded">
    <div class="text-sm font-semibold mb-2">
      {{ block.template }}
    </div>

    <pre class="text-xs text-neutral-400">
{{ JSON.stringify(block.data, null, 2) }}
    </pre>
  </div>
</template>
