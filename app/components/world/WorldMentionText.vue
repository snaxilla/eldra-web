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

function escapeHtml(value: any) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

function rawArticleHtml(value: any) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  if (/<\/?[a-z][\s\S]*>/i.test(raw)) return raw

  return renderMarkdown(raw)
}

function stripUnsafeHtml(value: string) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/\son\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, '')
}

function sanitizeInlineStyles(html: string) {
  return html.replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi, (_match, quoted, dbl, single) => {
    const style = String(dbl || single || '')
    const safe: string[] = []

    for (const rule of style.split(';')) {
      const [rawName, ...rawValueParts] = rule.split(':')
      const name = String(rawName || '').trim().toLowerCase()
      const value = rawValueParts.join(':').trim()

      if (!name || !value) continue

      if (name === 'color' && /^(#[0-9a-f]{3,8}|rgba?\([^)]+\)|[a-z]+)$/i.test(value)) {
        safe.push(`color: ${value}`)
      }

      if (name === 'width' && /^(\d+(\.\d+)?%|auto)$/i.test(value)) {
        safe.push(`width: ${value}`)
      }

      if (name === 'max-width' && /^(\d+(\.\d+)?%|auto)$/i.test(value)) {
        safe.push(`max-width: ${value}`)
      }
    }

    return safe.length ? ` style="${escapeHtml(safe.join('; '))}"` : ''
  })
}

function sanitizeHtml(value: string) {
  let html = stripUnsafeHtml(value)

  html = sanitizeInlineStyles(html)

  html = html.replace(/<a\b([^>]*)>/gi, (_match, attrs) => {
    const hrefMatch = String(attrs || '').match(/\shref\s*=\s*("([^"]*)"|'([^']*)')/i)
    const href = String(hrefMatch?.[2] || hrefMatch?.[3] || '').trim()

    if (!href || /^javascript:/i.test(href)) return '<a>'

    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">`
  })

  html = html.replace(/<img\b([^>]*)>/gi, (_match, attrs) => {
    const srcMatch = String(attrs || '').match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i)
    const src = String(srcMatch?.[2] || srcMatch?.[3] || srcMatch?.[4] || '').trim()

    if (
      !src ||
      !(
        src.startsWith('/api/assets/') ||
        src.startsWith('/api/asset-proxy/') ||
        src.startsWith('/assets/') ||
        /^https?:\/\//i.test(src)
      )
    ) {
      return ''
    }

    const altMatch = String(attrs || '').match(/\salt\s*=\s*("([^"]*)"|'([^']*)')/i)
    const titleMatch = String(attrs || '').match(/\stitle\s*=\s*("([^"]*)"|'([^']*)')/i)
    const classMatch = String(attrs || '').match(/\sclass\s*=\s*("([^"]*)"|'([^']*)')/i)
    const dataSizeMatch = String(attrs || '').match(/\sdata-size\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i)
    const dataAlignMatch = String(attrs || '').match(/\sdata-align\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i)
    const dataWidthMatch = String(attrs || '').match(/\sdata-width\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i)
    const styleMatch = String(attrs || '').match(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i)

    const alt = String(altMatch?.[2] || altMatch?.[3] || '').trim()
    const title = String(titleMatch?.[2] || titleMatch?.[3] || '').trim()
    const cls = String(classMatch?.[2] || classMatch?.[3] || 'eldra-article-image').trim()
    const dataSize = String(dataSizeMatch?.[2] || dataSizeMatch?.[3] || dataSizeMatch?.[4] || '').trim()
    const dataAlign = String(dataAlignMatch?.[2] || dataAlignMatch?.[3] || dataAlignMatch?.[4] || '').trim()
    const dataWidth = String(dataWidthMatch?.[2] || dataWidthMatch?.[3] || dataWidthMatch?.[4] || '').trim()
    const style = String(styleMatch?.[2] || styleMatch?.[3] || '').trim()

    return [
      '<img',
      ` src="${escapeHtml(src)}"`,
      alt ? ` alt="${escapeHtml(alt)}"` : ' alt="Article image"',
      title ? ` title="${escapeHtml(title)}"` : '',
      ` class="${escapeHtml(cls)}"`,
      dataSize ? ` data-size="${escapeHtml(dataSize)}"` : '',
      dataAlign ? ` data-align="${escapeHtml(dataAlign)}"` : '',
      dataWidth ? ` data-width="${escapeHtml(dataWidth)}"` : '',
      style ? ` style="${escapeHtml(style)}"` : '',
      ' loading="lazy"',
      '>'
    ].join('')
  })

  const allowedTags = new Set([
    'p', 'br', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'mark', 'span', 'a',
    'ul', 'ol', 'li',
    'blockquote',
    'img'
  ])

  html = html.replace(/<\/?([a-z0-9-]+)\b[^>]*>/gi, (tag, name) => {
    return allowedTags.has(String(name || '').toLowerCase()) ? tag : ''
  })

  return html
}

function mentionSourceText() {
  return decodeHtmlEntities(
    rawArticleHtml(props.markdown)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

const mentionTexts = computed(() => {
  const found = new Map<string, string>()

  for (const match of mentionSourceText().matchAll(/@\[([^\]]+)\]/g)) {
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

function replaceMentions(html: string) {
  return html.replace(/@\[([^\]]+)\]/g, (_match, rawLabel) => {
    const label = normalizeMention(rawLabel)
    const key = normalizedKey(label)
    const resolved = resolvedMentions.value[key]
    const unresolvedClass = resolved?.resolved ? '' : ' eldra-mention-link-unresolved'

    if (!props.interactive) {
      return `<span class="eldra-mention-link eldra-mention-link-static${unresolvedClass}" data-mention-label="${escapeHtml(label)}">${escapeHtml(label)}</span>`
    }

    return `<button type="button" class="eldra-mention-link${unresolvedClass}" data-mention-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`
  })
}

const renderedHtml = computed(() => {
  return replaceMentions(sanitizeHtml(rawArticleHtml(props.markdown)))
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

function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const mention = target?.closest?.('[data-mention-label]') as HTMLElement | null

  if (!mention || !props.interactive) return

  event.preventDefault()
  event.stopPropagation()

  openMention(mention.dataset.mentionLabel || '')
}
</script>

<template>
  <div
    class="world-mention-text"
    v-html="renderedHtml"
    @click="handleClick"
  />
</template>

<style scoped>
.world-mention-text {
  display: block;
}

:deep(p) {
  margin: 0 0 1rem;
  line-height: 1.9;
}

:deep(p:last-child) {
  margin-bottom: 0;
}

:deep(h1) {
  margin: 0 0 1rem;
  color: #fff7df;
  font-size: clamp(2rem, 4vw, 3.25rem);
  line-height: 1.08;
  font-weight: 850;
  letter-spacing: -0.035em;
}

:deep(h2) {
  margin: 1.45rem 0 0.85rem;
  color: #fff7df;
  font-size: clamp(1.45rem, 2.4vw, 2.15rem);
  line-height: 1.15;
  font-weight: 800;
}

:deep(h3),
:deep(h4),
:deep(h5),
:deep(h6) {
  margin: 1.2rem 0 0.7rem;
  color: #fff7df;
  font-size: clamp(1.15rem, 1.8vw, 1.55rem);
  line-height: 1.2;
  font-weight: 750;
}

:deep(ul),
:deep(ol) {
  margin: 0.85rem 0;
  padding-left: 1.85rem;
}

:deep(li) {
  margin: 0.35rem 0;
}

:deep(blockquote) {
  margin: 1.1rem 0;
  border-left: 3px solid rgba(201, 164, 90, 0.58);
  background: rgba(201, 164, 90, 0.08);
  padding: 0.85rem 1.05rem;
  color: #e8d9b5;
}

:deep(hr) {
  margin: 1.35rem 0;
  border: 0;
  border-top: 1px solid rgba(201, 164, 90, 0.34);
}

:deep(mark) {
  background: rgba(201, 164, 90, 0.28);
  color: #fff7df;
}

:deep(a) {
  color: #f5e7bd;
  text-decoration: underline;
  text-decoration-color: rgba(201, 164, 90, 0.75);
  text-underline-offset: 4px;
}

:deep(.eldra-article-image) {
  display: block;
  max-height: 720px;
  background: rgba(0, 0, 0, 0.28);
  object-fit: contain;
}

:deep(.eldra-article-image-small) {
  width: min(100%, 360px);
}

:deep(.eldra-article-image-medium) {
  width: min(100%, 640px);
}

:deep(.eldra-article-image-wide) {
  width: min(100%, 980px);
}

:deep(.eldra-article-image-full) {
  width: 100%;
}

:deep(.eldra-article-image-custom) {
  max-width: 100%;
}

:deep(.mr-auto) {
  margin-right: auto;
}

:deep(.mx-auto) {
  margin-left: auto;
  margin-right: auto;
}

:deep(.ml-auto) {
  margin-left: auto;
}

:deep(.eldra-mention-link) {
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

:deep(.eldra-mention-link:hover) {
  border-color: rgba(251, 191, 36, 0.85);
  background: linear-gradient(180deg, rgba(201, 164, 90, 0.32), rgba(20, 17, 12, 0.72));
  color: white;
}

:deep(.eldra-mention-link-static) {
  cursor: inherit;
}

:deep(.eldra-mention-link-static:hover) {
  border-color: rgba(201, 164, 90, 0.48);
  background: linear-gradient(180deg, rgba(201, 164, 90, 0.20), rgba(20, 17, 12, 0.58));
  color: #fff7df;
}

:deep(.eldra-mention-link-unresolved) {
  border-color: rgba(156, 163, 175, 0.38);
  background: rgba(75, 85, 99, 0.18);
  color: #d1d5db;
}
</style>
