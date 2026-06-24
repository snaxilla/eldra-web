<script setup lang="ts">
import { renderMarkdown } from '~/utils/renderMarkdown'

const props = defineProps<{
  worldId: string | number
  markdown: string
}>()

const emit = defineEmits<{
  openMention: [mention: any]
}>()

const resolvedMentions = ref<Record<string, any>>({})
const resolving = ref(false)

function normalizeMention(value: any) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function mentionKey(value: any) {
  return normalizeMention(value).toLowerCase()
}

const mentionTexts = computed(() => {
  const raw = String(props.markdown || '')
  const found = new Map<string, string>()

  for (const match of raw.matchAll(/@\[([^\]]+)\]/g)) {
    const label = normalizeMention(match[1])
    if (label) found.set(mentionKey(label), label)
  }

  return Array.from(found.values())
})

async function resolveMentions() {
  const mentions = mentionTexts.value

  resolvedMentions.value = {}

  if (!props.worldId || !mentions.length) return

  resolving.value = true

  try {
    const response: any = await $fetch(`/api/worlds/${props.worldId}/mentions/resolve`, {
      method: 'POST',
      body: {
        mentions
      }
    })

    resolvedMentions.value = response?.mentions || {}
  } catch (error) {
    console.error('[WorldMentionText] failed to resolve mentions', error)
    resolvedMentions.value = {}
  } finally {
    resolving.value = false
  }
}

watch(
  () => [props.worldId, String(props.markdown || '')],
  () => resolveMentions(),
  { immediate: true }
)

const renderedHtml = computed(() => {
  const raw = String(props.markdown || '')

  const withMentionButtons = raw.replace(/@\[([^\]]+)\]/g, (_match, label) => {
    const cleanLabel = normalizeMention(label)
    const key = mentionKey(cleanLabel)
    const resolved = resolvedMentions.value[key]
    const stateClass = resolved?.resolved
      ? 'eldra-mention-link'
      : 'eldra-mention-link eldra-mention-link-unresolved'

    return `<button type="button" class="${stateClass}" data-eldra-mention="${encodeURIComponent(cleanLabel)}">${escapeHtml(cleanLabel)}</button>`
  })

  return renderMarkdown(withMentionButtons)
})

function onClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const button = target?.closest?.('[data-eldra-mention]') as HTMLElement | null

  if (!button) return

  event.preventDefault()
  event.stopPropagation()

  const label = decodeURIComponent(button.dataset.eldraMention || '')
  const resolved = resolvedMentions.value[mentionKey(label)]

  emit('openMention', {
    label,
    resolving: resolving.value,
    ...(resolved || {
      resolved: false,
      title: label,
      summary: `No matching world entity was found for "${label}".`
    })
  })
}
</script>

<template>
  <div
    class="world-mention-text"
    v-html="renderedHtml"
    @click="onClick"
  />
</template>

<style scoped>
.world-mention-text :deep(.eldra-mention-link) {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  margin: 0 0.1rem;
  padding: 0.05rem 0.38rem;
  border: 1px solid rgba(201, 164, 90, 0.45);
  border-radius: 0;
  background: linear-gradient(180deg, rgba(201, 164, 90, 0.18), rgba(20, 17, 12, 0.52));
  color: #fff7df;
  font: inherit;
  font-weight: 700;
  line-height: 1.55;
  text-decoration: none;
  cursor: pointer;
  box-shadow: 0 0 18px rgba(201, 164, 90, 0.08);
  transition: border-color 140ms ease, background 140ms ease, filter 140ms ease;
}

.world-mention-text :deep(.eldra-mention-link:hover) {
  border-color: rgba(255, 224, 139, 0.72);
  background: linear-gradient(180deg, rgba(201, 164, 90, 0.28), rgba(20, 17, 12, 0.68));
  filter: brightness(1.08);
}

.world-mention-text :deep(.eldra-mention-link-unresolved) {
  border-color: rgba(159, 146, 120, 0.32);
  color: #c8bda6;
  background: rgba(12, 16, 22, 0.52);
  box-shadow: none;
}
</style>
