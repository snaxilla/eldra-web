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

function normalizedKey(value: any) {
  return normalizeMention(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const mentionTexts = computed(() => {
  const raw = String(props.markdown || '')
  const found = new Map<string, string>()

  for (const match of raw.matchAll(/@\[([^\]]+)\]/g)) {
    const label = normalizeMention(match[1])
    if (label) found.set(normalizedKey(label), label)
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

type RenderPart =
  | {
      type: 'html'
      key: string
      html: string
    }
  | {
      type: 'mention'
      key: string
      label: string
      resolved: any
    }

/*
 * Important:
 * Do not inject <button> through renderMarkdown/v-html. Some markdown renderers
 * sanitize or escape interactive HTML. Instead, put stable text placeholders
 * through markdown, split the final HTML on those placeholders, and render the
 * actual mention buttons with Vue.
 */
const renderedParts = computed<RenderPart[]>(() => {
  const raw = String(props.markdown || '')
  const mentions: string[] = []
  const tokenPrefix = 'ELDRA_MENTION_TOKEN_'

  const markdownWithTokens = raw.replace(/@\[([^\]]+)\]/g, (_match, label) => {
    const cleanLabel = normalizeMention(label)
    const index = mentions.length
    mentions.push(cleanLabel)
    return `${tokenPrefix}${index}__`
  })

  const html = renderMarkdown(markdownWithTokens)
  const parts: RenderPart[] = []
  const tokenRegex = new RegExp(`${tokenPrefix}(\\d+)__`, 'g')

  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(html)) !== null) {
    const before = html.slice(cursor, match.index)
    if (before) {
      parts.push({
        type: 'html',
        key: `html-${parts.length}`,
        html: before
      })
    }

    const index = Number(match[1])
    const label = mentions[index] || ''
    const key = normalizedKey(label)
    const resolved = resolvedMentions.value[key]

    parts.push({
      type: 'mention',
      key: `mention-${index}-${key || label}`,
      label,
      resolved
    })

    cursor = match.index + match[0].length
  }

  const after = html.slice(cursor)
  if (after) {
    parts.push({
      type: 'html',
      key: `html-${parts.length}`,
      html: after
    })
  }

  return parts
})

function openMention(label: string) {
  const resolved = resolvedMentions.value[normalizedKey(label)]

  emit('openMention', {
    label,
    resolving: resolving.value,
    ...(resolved || {
      resolved: false,
      title: label,
      entityType: 'Unresolved Mention',
      summary: `No matching world entity was found for "${label}".`,
      markdown: `No matching world entity was found for **${label}**.`
    })
  })
}
</script>

<template>
  <div class="world-mention-text">
    <template v-for="part in renderedParts" :key="part.key">
      <span
        v-if="part.type === 'html'"
        v-html="part.html"
      />

      <button
        v-else
        type="button"
        :class="[
          'eldra-mention-link',
          part.resolved?.resolved ? '' : 'eldra-mention-link-unresolved'
        ]"
        @click.prevent.stop="openMention(part.label)"
      >
        {{ part.label }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.world-mention-text {
  display: block;
}

.world-mention-text :deep(p) {
  margin: 0 0 1rem;
}

.world-mention-text :deep(p:last-child) {
  margin-bottom: 0;
}

.eldra-mention-link {
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

.eldra-mention-link:hover {
  border-color: rgba(255, 224, 139, 0.72);
  background: linear-gradient(180deg, rgba(201, 164, 90, 0.28), rgba(20, 17, 12, 0.68));
  filter: brightness(1.08);
}

.eldra-mention-link-unresolved {
  border-color: rgba(159, 146, 120, 0.32);
  color: #c8bda6;
  background: rgba(12, 16, 22, 0.52);
  box-shadow: none;
}
</style>
