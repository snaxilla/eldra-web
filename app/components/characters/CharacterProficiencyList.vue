<script setup lang="ts">
// CharacterProficiencyList -- Phase 4B reference rail. The proficiencies,
// trainings, and languages a character HAS, grouped the way the package
// tags them. Generic by construction: it reads only boolean Values that
// are `true`, groups them by each Value's FIRST tag (the package's own
// family name, e.g. `armor-proficiency`, `language`), and shows each
// Value's own label. No id, label, or tag is named here; a package with no
// tagged boolean Values renders nothing (the host omits the region).
import type { DerivedValue } from './characterDerivedValues'

const props = withDefaults(defineProps<{
  entries?: readonly DerivedValue[]
}>(), {
  entries: () => []
})

// `armor-proficiency` -> "Armor", `tool-proficiency` -> "Tool",
// `language` -> "Language". Purely typographic: strips a trailing
// "-proficiency" and title-cases what is left.
function familyLabel(tag: string): string {
  return tag
    .replace(/-proficiency$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export type CharacterProficiencyGroup = { key: string; label: string; items: string[] }

const groups = computed<CharacterProficiencyGroup[]>(() => {
  const byFamily = new Map<string, string[]>()
  for (const entry of props.entries) {
    if (entry.value !== true || !entry.label) continue
    const family = entry.tags?.[0]
    if (!family) continue
    const items = byFamily.get(family) ?? []
    items.push(entry.label)
    byFamily.set(family, items)
  }
  return [...byFamily].map(([key, items]) => ({ key, label: familyLabel(key), items }))
})

defineExpose({ groups })
</script>

<template>
  <dl
    v-if="groups.length"
    class="grid gap-2 text-sm"
  >
    <div
      v-for="group in groups"
      :key="group.key"
      class="min-w-0"
    >
      <dt class="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-eldra-text-faint">
        {{ group.label }}
      </dt>
      <dd class="mt-0.5 break-words leading-5 text-eldra-text-soft">
        {{ group.items.join(', ') }}
      </dd>
    </div>
  </dl>
</template>
