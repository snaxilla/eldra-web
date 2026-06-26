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

type TextTag = 'p' | 'h1' | 'h2' | 'h3' | 'blockquote'

type TextBlock = {
  type: 'text'
  key: string
  tag: TextTag
  html: string
  plain: string
}

type ImageBlock = {
  type: 'image'
  key: string
  src: string
  alt: string
  title: string
  size: string
  align: string
  width: string
}

type DividerBlock = {
  type: 'divider'
  key: string
}

type ArticleBlock = TextBlock | ImageBlock | DividerBlock

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

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stripUnsafeHtml(value: string) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, '')
}

function attrValue(tag: string, name: string) {
  const regex = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
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

function plainTextFromHtml(value: string) {
  return decodeHtmlEntities(
    String(value || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function sanitizeInlineHtml(value: string) {
  let html = stripUnsafeHtml(String(value || ''))

  html = html.replace(/<span\b([^>]*)>/gi, (_match, attrs) => {
    const styleMatch = String(attrs || '').match(/style\s*=\s*("([^"]*)"|'([^']*)')/i)
    const style = String(styleMatch?.[2] || styleMatch?.[3] || '')
    const colorMatch = style.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\)|[a-z]+)\s*(?:;|$)/i)
    const color = String(colorMatch?.[1] || '').trim()

    return color ? `<span style="color: ${escapeHtml(color)}">` : '<span>'
  })

  html = html.replace(/<a\b([^>]*)>/gi, (_match, attrs) => {
    const hrefMatch = String(attrs || '').match(/href\s*=\s*("([^"]*)"|'([^']*)')/i)
    const href = String(hrefMatch?.[2] || hrefMatch?.[3] || '').trim()

    if (!href || /^javascript:/i.test(href)) return '<a>'

    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">`
  })

  html = html
    .replace(/<br\s*\/?>/gi, '<br>')
    .replace(/<(\/?)(strong|b|em|i|u|s|strike|mark|span|a)\b[^>]*>/gi, (match) => match)
    .replace(/<[^>]+>/g, ' ')

  return html
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function tagForHtmlBlock(tag: string): TextTag {
  const normalized = String(tag || '').toLowerCase()

  if (normalized === 'h1') return 'h1'
  if (normalized === 'h2') return 'h2'
  if (['h3', 'h4', 'h5', 'h6'].includes(normalized)) return 'h3'
  if (normalized === 'blockquote') return 'blockquote'

  return 'p'
}

function headingFromMarkdownishPlain(plain: string): { tag: TextTag; plain: string } {
  const text = String(plain || '').trim()

  if (/^###\s+/.test(text)) return { tag: 'h3', plain: text.replace(/^###\s+/, '') }
  if (/^##\s+/.test(text)) return { tag: 'h2', plain: text.replace(/^##\s+/, '') }
  if (/^#\s+/.test(text)) return { tag: 'h1', plain: text.replace(/^#\s+/, '') }

  return { tag: 'p', plain: text }
}

function pushTextBlock(blocks: ArticleBlock[], html: string, key: string, tag: TextTag = 'p') {
  const sanitized = sanitizeInlineHtml(html)
  const plain = plainTextFromHtml(sanitized)

  if (!plain) return

  const markdownish = tag === 'p' ? headingFromMarkdownishPlain(plain) : { tag, plain }

  blocks.push({
    type: 'text',
    key,
    tag: markdownish.tag,
    html: markdownish.tag === tag ? sanitized : escapeHtml(markdownish.plain),
    plain: markdownish.plain
  })
}

function parseHtmlBlocks(html: string) {
  const blocks: ArticleBlock[] = []
  const raw = stripUnsafeHtml(html)

  const tokenRegex = /<img\b[^>]*>|<hr\s*\/?>|<(p|h[1-6]|blockquote)\b[^>]*>[\s\S]*?<\/\1>/gi

  let cursor = 0
  let index = 0
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(raw)) !== null) {
    const before = raw.slice(cursor, match.index)
    pushTextBlock(blocks, before, `text-before-${index}`, 'p')

    const token = match[0]

    if (/^<img\b/i.test(token)) {
      const src = safeImageSrc(attrValue(token, 'src'))

      if (src) {
        blocks.push({
          type: 'image',
          key: `image-${index}`,
          src,
          alt: attrValue(token, 'alt'),
          title: attrValue(token, 'title'),
          size: attrValue(token, 'data-size') || 'full',
          align: attrValue(token, 'data-align') || 'center',
          width: attrValue(token, 'data-width') || ''
        })
      }
    } else if (/^<hr\b/i.test(token)) {
      blocks.push({
        type: 'divider',
        key: `divider-${index}`
      })
    } else {
      const tagMatch = token.match(/^<(p|h[1-6]|blockquote)\b[^>]*>([\s\S]*?)<\/\1>$/i)
      const tag = tagForHtmlBlock(tagMatch?.[1] || 'p')
      const inner = tagMatch?.[2] || token

      pushTextBlock(blocks, inner, `text-${index}`, tag)
    }

    cursor = match.index + token.length
    index += 1
  }

  const after = raw.slice(cursor)
  pushTextBlock(blocks, after, `text-after-${index}`, 'p')

  return blocks
}

function articleBlocks(value: any): ArticleBlock[] {
  const raw = String(value || '').trim()
  if (!raw) return []

  if (/<\/?[a-z][\s\S]*>/i.test(raw)) {
    return parseHtmlBlocks(raw)
  }

  return parseHtmlBlocks(renderMarkdown(raw))
}

const mentionTexts = computed(() => {
  const found = new Map<string, string>()

  for (const block of articleBlocks(props.markdown)) {
    if (block.type !== 'text') continue

    for (const match of block.plain.matchAll(/@\[([^\]]+)\]/g)) {
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
  tag: TextTag
  parts: InlinePart[]
}

type RenderedImageBlock = ImageBlock

type RenderedDividerBlock = DividerBlock

type RenderedBlock = RenderedTextBlock | RenderedImageBlock | RenderedDividerBlock

function renderInlinePlain(value: string) {
  return escapeHtml(value).replace(/\n/g, '<br>')
}

function splitTextWithMentions(block: TextBlock, blockIndex: number): InlinePart[] {
  const plain = block.plain || ''

  if (!/@\[([^\]]+)\]/.test(plain)) {
    return [{
      type: 'html',
      key: `b${blockIndex}-html-0`,
      html: block.html
    }]
  }

  const parts: InlinePart[] = []
  const regex = /@\[([^\]]+)\]/g
  let cursor = 0
  let mentionIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(plain)) !== null) {
    const before = plain.slice(cursor, match.index)

    if (before) {
      parts.push({
        type: 'html',
        key: `b${blockIndex}-html-${parts.length}`,
        html: renderInlinePlain(before)
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

  const after = plain.slice(cursor)

  if (after) {
    parts.push({
      type: 'html',
      key: `b${blockIndex}-html-${parts.length}`,
      html: renderInlinePlain(after)
    })
  }

  return parts
}

const renderedBlocks = computed<RenderedBlock[]>(() => {
  return articleBlocks(props.markdown).map((block, blockIndex) => {
    if (block.type === 'text') {
      return {
        type: 'text',
        key: block.key || `text-${blockIndex}`,
        tag: block.tag || 'p',
        parts: splitTextWithMentions(block, blockIndex)
      }
    }

    return block
  })
})

function imageFrameClass(block: ImageBlock) {
  const hasWidth = Boolean(String(block.width || '').trim())
  const size = hasWidth ? 'custom' : String(block.size || 'full')
  const align = String(block.align || 'center')

  return [
    'world-mention-image-frame',
    `world-mention-image-${['small', 'medium', 'wide', 'full', 'custom'].includes(size) ? size : 'full'}`,
    `world-mention-image-align-${['left', 'center', 'right'].includes(align) ? align : 'center'}`
  ]
}

function imageFrameStyle(block: ImageBlock) {
  const raw = String(block.width || '').trim()
  if (!raw) return undefined

  const width = Math.max(1, Math.min(100, Math.round((Number(raw) || 100) * 10) / 10))
  const widthText = Number.isInteger(width) ? String(width) : width.toFixed(1)

  return {
    width: `${widthText}%`
  }
}

function textBlockClass(block: RenderedTextBlock) {
  return [
    'world-mention-text-block',
    `world-mention-${block.tag || 'p'}`
  ]
}

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
        :class="imageFrameClass(block)"
        :style="imageFrameStyle(block)"
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

      <hr
        v-else-if="block.type === 'divider'"
        class="world-mention-divider"
      >

      <component
        :is="block.tag || 'p'"
        v-else
        :class="textBlockClass(block)"
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
      </component>
    </template>
  </div>
</template>

<style scoped>
.world-mention-text {
  display: block;
}

.world-mention-text-block {
  margin: 0 0 1rem;
}

.world-mention-text-block:last-child {
  margin-bottom: 0;
}

.world-mention-p {
  line-height: 1.9;
}

.world-mention-h1 {
  margin: 0 0 1rem;
  color: #fff7df;
  font-size: clamp(2rem, 4vw, 3.25rem);
  line-height: 1.08;
  font-weight: 850;
  letter-spacing: -0.035em;
}

.world-mention-h2 {
  margin: 1.45rem 0 0.85rem;
  color: #fff7df;
  font-size: clamp(1.45rem, 2.4vw, 2.15rem);
  line-height: 1.15;
  font-weight: 800;
}

.world-mention-h3 {
  margin: 1.2rem 0 0.7rem;
  color: #fff7df;
  font-size: clamp(1.15rem, 1.8vw, 1.55rem);
  line-height: 1.2;
  font-weight: 750;
}

.world-mention-blockquote {
  margin: 1.1rem 0;
  border-left: 3px solid rgba(201, 164, 90, 0.58);
  background: rgba(201, 164, 90, 0.08);
  padding: 0.85rem 1.05rem;
  color: #e8d9b5;
}

.world-mention-divider {
  margin: 1.35rem 0;
  border: 0;
  border-top: 1px solid rgba(201, 164, 90, 0.34);
}

.world-mention-image-frame {
  margin-top: 1.35rem;
  margin-bottom: 1.35rem;
  overflow: hidden;
  border: 1px solid rgba(201, 164, 90, 0.30);
  border-radius: 0;
  background: rgba(0, 0, 0, 0.22);
  box-shadow: 0 18px 55px rgba(0, 0, 0, 0.30);
}

.world-mention-image-small {
  width: min(100%, 360px);
}

.world-mention-image-medium {
  width: min(100%, 640px);
}

.world-mention-image-wide {
  width: min(100%, 980px);
}

.world-mention-image-full {
  width: 100%;
}

.world-mention-image-custom {
  max-width: 100%;
}

.world-mention-image-align-left {
  margin-right: auto;
}

.world-mention-image-align-center {
  margin-left: auto;
  margin-right: auto;
}

.world-mention-image-align-right {
  margin-left: auto;
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
