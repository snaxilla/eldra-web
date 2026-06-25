<script setup lang="ts">
import { renderMarkdown } from '~/utils/renderMarkdown'

const props = withDefaults(defineProps<{
  worldId: string | number
  markdown: string
  interactive?: boolean
}>(), {
  interactive: true
})

const emit = defineEmits<{
  openMention: [mention: any]
}>()

const resolvedMentions = ref<Record<string, any>>({})
const resolving = ref(false)

type TextBlock = {
  type: 'text'
  key: string
  text: string
}

type ImageBlock = {
  type: 'image'
  key: string
  src: string
  alt: string
  title: string
}

type ArticleBlock = TextBlock | ImageBlock

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

function decodeHtmlEntities(value: string) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function stripUnsafeHtml(value: string) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
}

function attrValue(tag: string, name: string) {
  const regex = new RegExp(`${name}\\\\s*=\\\\s*("([^"]*)"|'([^']*)'|([^\\\\s"'>]+))`, 'i')
  const match = tag.match(regex)

  return decodeHtmlEntities(String(match?.[2] ?? match?.[3] ?? match?.[4] ?? '').trim())
}

function safeImageSrc(value: string) {
  const src = String(value || '').trim()

  if (!src) return ''

  if (src.startsWith('/api/assets/')) return src
  if (src.startsWith('/api/asset-proxy/')) return src
  if (src.startsWith('/assets/')) return src
  if (/^https?:\/\//i.test(src)) return src

  return ''
}

function inlineHtmlToText(value: string) {
  return decodeHtmlEntities(
    String(value || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(strong|b)>/gi, '**')
      .replace(/<\/?(em|i)>/gi, '*')
      .replace(/<\/?(s|strike)>/gi, '~~')
      .replace(/<mark(?:\s[^>]*)?>/gi, '**')
      .replace(/<\/mark>/gi, '**')
      .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href, label) => {
        const cleanLabel = String(label || '').replace(/<[^>]+>/g, '').trim()
        const cleanHref = String(href || '').trim()
        return cleanLabel && cleanHref ? `[${cleanLabel}](${cleanHref})` : cleanLabel || cleanHref
      })
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim()
  )
}

function pushTextBlock(blocks: ArticleBlock[], value: string, keyPrefix: string) {
  const text = decodeHtmlEntities(String(value || '').trim())
  if (!text) return

  const parts = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)

  for (const part of parts) {
    blocks.push({
      type: 'text',
      key: `${keyPrefix}-text-${blocks.length}`,
      text: part
    })
  }
}

function parseHtmlTextBlocks(value: string, keyPrefix: string) {
  const blocks: ArticleBlock[] = []
  const normalized = String(value || '')
    .replace(/<\/p>\s*<p(?:\s[^>]*)?>/gi, '\n\n')
    .replace(/<p(?:\s[^>]*)?>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>\s*<h[1-6](?:\s[^>]*)?>/gi, '\n\n')
    .replace(/<h[1-6](?:\s[^>]*)?>/gi, '')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<blockquote(?:\s[^>]*)?>/gi, '')
    .replace(/<\/blockquote>/gi, '\n\n')

  pushTextBlock(blocks, inlineHtmlToText(normalized), keyPrefix)
  return blocks
}

function parseHtmlArticleBlocks(rawHtml: string) {
  const blocks: ArticleBlock[] = []
  const raw = stripUnsafeHtml(rawHtml)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  /*
   * Image-first parsing matters because TipTap commonly saves images as:
   * <p><img src="..." alt="..."></p>
   *
   * If we tokenize paragraphs first, the paragraph text sanitizer strips the
   * image before the image renderer ever sees it.
   */
  const tokenRegex = /<img\b[^>]*>|<hr\s*\/?>/gi

  let cursor = 0
  let tokenIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(raw)) !== null) {
    const before = raw.slice(cursor, match.index)
    blocks.push(...parseHtmlTextBlocks(before, `before-${tokenIndex}`))

    const token = match[0]

    if (/^<img\b/i.test(token)) {
      const src = safeImageSrc(attrValue(token, 'src'))

      if (src) {
        blocks.push({
          type: 'image',
          key: `image-${tokenIndex}-${blocks.length}`,
          src,
          alt: attrValue(token, 'alt'),
          title: attrValue(token, 'title')
        })
      }
    } else if (/^<hr\b/i.test(token)) {
      blocks.push({
        type: 'text',
        key: `hr-${tokenIndex}-${blocks.length}`,
        text: '---'
      })
    }

    cursor = match.index + token.length
    tokenIndex += 1
  }

  const after = raw.slice(cursor)
  blocks.push(...parseHtmlTextBlocks(after, 'after'))

  return blocks
}

/*
 * TipTap saves article overrides as HTML, while generated/imported articles are
 * often Markdown/plain text. Normalize both into article blocks before mention
 * parsing. Important: preserve safe <img> tags from TipTap so Play mode can
 * render inline gallery images.
 */
function articleBlocks(value: any): ArticleBlock[] {
  const raw = stripUnsafeHtml(String(value || '').trim())
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  if (!raw) return []

  if (/<\/?[a-z][\s\S]*>/i.test(raw)) {
    return parseHtmlArticleBlocks(raw)
  }

  return raw
    .split(/\n{2,}/)
    .map((block, index) => ({
      type: 'text' as const,
      key: `plain-${index}`,
      text: decodeHtmlEntities(block.trim())
    }))
    .filter((block) => Boolean(block.text))
}

function renderInlineMarkdown(value: string) {
  const html = renderMarkdown(value || '')
  const singleParagraph = html.match(/^<p>([\s\S]*)<\/p>\s*$/i)
  return singleParagraph ? singleParagraph[1] : html
}

const mentionTexts = computed(() => {
  const found = new Map<string, string>()

  for (const block of articleBlocks(props.markdown)) {
    if (block.type !== 'text') continue

    for (const match of block.text.matchAll(/@\[([^\]]+)\]/g)) {
      const label = normalizeMention(match[1])
      if (label) found.set(normalizedKey(label), label)
    }
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
      body: { mentions }
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

type RenderedTextBlock = {
  type: 'text'
  key: string
  parts: InlinePart[]
}

type RenderedImageBlock = {
  type: 'image'
  key: string
  src: string
  alt: string
  title: string
}

type RenderedBlock = RenderedTextBlock | RenderedImageBlock

const renderedBlocks = computed<RenderedBlock[]>(() => {
  return articleBlocks(props.markdown).map((block, blockIndex) => {
    if (block.type === 'image') {
      return {
        type: 'image',
        key: block.key || `image-${blockIndex}`,
        src: block.src,
        alt: block.alt,
        title: block.title
      }
    }

    const parts: InlinePart[] = []
    const regex = /@\[([^\]]+)\]/g
    let cursor = 0
    let mentionIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(block.text)) !== null) {
      const before = block.text.slice(cursor, match.index)

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

    const after = block.text.slice(cursor)

    if (after) {
      parts.push({
        type: 'html',
        key: `b${blockIndex}-html-${parts.length}`,
        html: renderInlineMarkdown(after)
      })
    }

    return {
      type: 'text',
      key: block.key || `block-${blockIndex}`,
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
    <template
      v-for="block in renderedBlocks"
      :key="block.key"
    >
      <figure
        v-if="block.type === 'image'"
        class="world-mention-image-frame"
      >
        <img
          :src="block.src"
          :alt="block.alt || block.title || 'Article image'"
          :title="block.title || block.alt || undefined"
          loading="lazy"
          class="world-mention-image"
        >

        <figcaption
          v-if="block.title && block.title !== block.alt"
          class="world-mention-image-caption"
        >
          {{ block.title }}
        </figcaption>
      </figure>

      <p
        v-else
        class="world-mention-paragraph"
      >
        <template v-for="part in block.parts" :key="part.key">
          <span
            v-if="part.type === 'html'"
            v-html="part.html"
          />

          <button
            v-else-if="props.interactive"
            type="button"
            :class="[
              'eldra-mention-link',
              part.resolved?.resolved ? '' : 'eldra-mention-link-unresolved'
            ]"
            @click.prevent.stop="openMention(part.label)"
          >
            {{ part.label }}
          </button>

          <span
            v-else
            :class="[
              'eldra-mention-link eldra-mention-link-static',
              part.resolved?.resolved ? '' : 'eldra-mention-link-unresolved'
            ]"
          >
            {{ part.label }}
          </span>
        </template>
      </p>
    </template>
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

.world-mention-image-frame {
  margin: 1.35rem 0;
  overflow: hidden;
  border: 1px solid rgba(201, 164, 90, 0.30);
  border-radius: 0;
  background: rgba(0, 0, 0, 0.22);
  box-shadow: 0 18px 55px rgba(0, 0, 0, 0.30);
}

.world-mention-image {
  display: block;
  width: 100%;
  max-height: 720px;
  object-fit: contain;
  background: rgba(0, 0, 0, 0.28);
}

.world-mention-image-caption {
  border-top: 1px solid rgba(201, 164, 90, 0.20);
  padding: 0.65rem 0.85rem;
  color: #9f9278;
  font-size: 0.78rem;
  line-height: 1.35;
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
  font-weight: 700;
  line-height: 1.45;
  text-decoration: none;
  box-shadow: 0 0 18px rgba(201, 164, 90, 0.08);
  vertical-align: baseline;
  cursor: pointer;
}

.eldra-mention-link:hover {
  border-color: rgba(251, 191, 36, 0.85);
  background: linear-gradient(180deg, rgba(201, 164, 90, 0.32), rgba(20, 17, 12, 0.72));
  color: white;
}

.eldra-mention-link-static {
  cursor: inherit;
}

.eldra-mention-link-static:hover {
  border-color: rgba(201, 164, 90, 0.48);
  background: linear-gradient(180deg, rgba(201, 164, 90, 0.20), rgba(20, 17, 12, 0.58));
  color: #fff7df;
}

.eldra-mention-link-unresolved {
  border-color: rgba(156, 163, 175, 0.38);
  background: rgba(75, 85, 99, 0.18);
  color: #d1d5db;
}
</style>
