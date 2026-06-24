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

function renderInlineMarkdown(value: string) {
  const html = renderMarkdown(value || '')

  const singleParagraph = html.match(/^<p>([\s\S]*)<\/p>\s*$/i)
  if (singleParagraph) return singleParagraph[1]

  return html
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

type InlinePart =
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

type BlockPart = {
  key: string
  parts: InlinePart[]
}

/*
 * Parse mentions before markdown rendering.
 * Do not split already-rendered HTML; that breaks paragraph tags and causes
 * visible <p> garbage / duplicated output.
 */
const renderedBlocks = computed<BlockPart[]>(() => {
  const raw = String(props.markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  const blocks = raw
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  return blocks.map((block, blockIndex) => {
    const parts: InlinePart[] = []
    const regex = /@\[([^\]]+)\]/g
    let cursor = 0
    let mentionIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(block)) !== null) {
      const before = block.slice(cursor, match.index)
      if (before) {
        parts.push({
          type: 'html',
          key: `b${blockIndex}-html-${parts.length}`,
          html: renderInlineMarkdown(before)
        })
      }

      const label = normalizeMention(match[1])
      const key = normalizedKey(label)

      parts.push({
        type: 'mention',
        key: `b${blockIndex}-mention-${mentionIndex}-${key || label}`,
        label,
        resolved: resolvedMentions.value[key]
      })

      mentionIndex += 1
      cursor = match.index + match[0].length
    }

    const after = block.slice(cursor)
    if (after) {
      parts.push({
        type: 'html',
        key: `b${blockIndex}-html-${parts.length}`,
        html: renderInlineMarkdown(after)
      })
    }

    return {
      key: `block-${blockIndex}`,
      parts
    }
  })
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
    <p
      v-for="block in renderedBlocks"
      :key="block.key"
      class="world-mention-paragraph"
    >
      <template v-for="part in block.parts" :key="part.key">
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
    </p>
  </div>
</template>

<style scoped>
.world-mention-text {
  display: block;
}

.world-mention-paragraph {
  margin: 0 0 1rem;
}

.world-mention-paragraph:last-child {
  margin-bottom: 0;
}

.eldra-mention-link {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  margin: 0 0.1rem;
  padding: 0.05rem 0.38rem;
  border: 1px solid rgba(201, 164, 90, 0.48);
  border-radius: 0;
  background: linear-gradient(180deg, rgba(201, 164, 90, 0.20), rgba(20, 17, 12, 0.58));
  color: #fff7df;
  font: inherit;
  font-weight: 700;
  line-height: 1.55;
  text-decoration: none;
  cursor: pointer;
  box-shadow: 0 0 18px rgba(201, 164, 90, 0.10);
  transition: border-color 140ms ease, background 140ms ease, filter 140ms ease;
}

.eldra-mention-link:hover {
  border-color: rgba(255, 224, 139, 0.76);
  background: linear-gradient(180deg, rgba(201, 164, 90, 0.30), rgba(20, 17, 12, 0.72));
  filter: brightness(1.08);
}

.eldra-mention-link-unresolved {
  border-color: rgba(159, 146, 120, 0.32);
  color: #c8bda6;
  background: rgba(12, 16, 22, 0.52);
  box-shadow: none;
}
</style>
