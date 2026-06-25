<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'

type MentionEntity = {
  id: string | number
  title: string
  slug?: string
  entity_type?: string
  entityType?: string
  summary?: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  worldId?: string | number
}>(), {
  worldId: ''
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const allMentionEntities = ref<MentionEntity[]>([])
const mentionQuery = ref('')
const mentionRange = ref<{ from: number; to: number } | null>(null)
const mentionMenuOpen = ref(false)
const activeMentionIndex = ref(0)
const loadingMentions = ref(false)

function cleanText(value: any) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalized(value: any) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function entityTypeLabel(entity: MentionEntity) {
  return cleanText(entity.entityType || entity.entity_type || 'entity')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function entityTitle(entity: MentionEntity) {
  return cleanText(entity.title || `Entity ${entity.id}`)
}

async function loadMentionEntities() {
  const worldId = cleanText(props.worldId)
  allMentionEntities.value = []

  if (!worldId) return

  loadingMentions.value = true

  try {
    const response: any = await $fetch(`/api/worlds/${worldId}/entities`)
    const list = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : []

    allMentionEntities.value = list
      .map((entity: any) => ({
        id: entity.id,
        title: cleanText(entity.title || entity.name || ''),
        slug: cleanText(entity.slug || ''),
        entity_type: cleanText(entity.entity_type || entity.entityType || 'entity'),
        entityType: cleanText(entity.entityType || entity.entity_type || 'entity'),
        summary: cleanText(entity.summary || entity.preview_text || '')
      }))
      .filter((entity: MentionEntity) => entity.id && entity.title)
      .sort((a: MentionEntity, b: MentionEntity) => entityTitle(a).localeCompare(entityTitle(b)))
  } catch (error) {
    console.error('[EldraRichTextEditor] failed to load mention suggestions', error)
    allMentionEntities.value = []
  } finally {
    loadingMentions.value = false
  }
}

watch(
  () => props.worldId,
  () => loadMentionEntities(),
  { immediate: true }
)

const filteredMentionEntities = computed(() => {
  const query = normalized(mentionQuery.value)
  const list = allMentionEntities.value || []

  if (!mentionMenuOpen.value) return []

  const filtered = !query
    ? list
    : list.filter((entity) => {
        const haystack = [
          entity.title,
          entity.slug,
          entity.entity_type,
          entity.entityType,
          entity.summary
        ].map(normalized).join(' ')

        return haystack.includes(query)
      })

  return filtered.slice(0, 8)
})

const showMentionMenu = computed(() =>
  mentionMenuOpen.value && filteredMentionEntities.value.length > 0
)

function closeMentionMenu() {
  mentionMenuOpen.value = false
  mentionQuery.value = ''
  mentionRange.value = null
  activeMentionIndex.value = 0
}

function triggerBoundaryAllowsMention(value: string, index: number) {
  if (index <= 0) return true

  const before = value[index - 1] || ''

  return /\s/.test(before) || ['(', '[', '{', ',', '.', ';', ':', '"', "'"].includes(before)
}

function refreshMentionMenu() {
  const instance = editor.value
  if (!instance) return closeMentionMenu()

  const { state } = instance
  const selection: any = state.selection

  if (!selection?.empty) return closeMentionMenu()

  const $from = selection.$from
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n')

  let triggerStart = -1
  let query = ''

  const bracketStart = textBefore.lastIndexOf('@[')

  if (bracketStart !== -1) {
    const candidate = textBefore.slice(bracketStart + 2)

    if (
      candidate.length <= 80 &&
      !candidate.includes(']') &&
      !candidate.includes('\n') &&
      triggerBoundaryAllowsMention(textBefore, bracketStart)
    ) {
      triggerStart = bracketStart
      query = candidate
    }
  }

  if (triggerStart === -1) {
    const atStart = textBefore.lastIndexOf('@')

    if (atStart !== -1) {
      const candidate = textBefore.slice(atStart + 1)

      if (
        candidate.length <= 80 &&
        !candidate.includes('@') &&
        !candidate.includes('[') &&
        !candidate.includes(']') &&
        !candidate.includes('\n') &&
        triggerBoundaryAllowsMention(textBefore, atStart)
      ) {
        triggerStart = atStart
        query = candidate
      }
    }
  }

  if (triggerStart === -1) return closeMentionMenu()

  mentionQuery.value = query
  mentionRange.value = {
    from: $from.pos - (textBefore.length - triggerStart),
    to: $from.pos
  }

  mentionMenuOpen.value = true
  activeMentionIndex.value = Math.min(activeMentionIndex.value, Math.max(filteredMentionEntities.value.length - 1, 0))
}

function insertMention(entity: MentionEntity | null = filteredMentionEntities.value[activeMentionIndex.value] || null) {
  const instance = editor.value
  const range = mentionRange.value

  if (!instance || !range || !entity) return

  const title = entityTitle(entity)
  if (!title) return

  instance
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent(`@[${title}] `)
    .run()

  closeMentionMenu()

  nextTick(() => {
    instance.commands.focus()
  })
}

function handleMentionKeydown(event: KeyboardEvent) {
  if (!showMentionMenu.value) return false

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeMentionIndex.value = (activeMentionIndex.value + 1) % filteredMentionEntities.value.length
    return true
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeMentionIndex.value =
      (activeMentionIndex.value - 1 + filteredMentionEntities.value.length) % filteredMentionEntities.value.length
    return true
  }

  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    insertMention()
    return true
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeMentionMenu()
    return true
  }

  return false
}

const editor = useEditor({
  content: props.modelValue || '',
  extensions: [
    StarterKit,
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Highlight.configure({ multicolor: false }),
    Placeholder.configure({ placeholder: 'Write your article here. Type @ to mention something in this world...' })
  ],
  editorProps: {
    attributes: {
      class: 'eldra-editor-prosemirror min-h-[620px] px-7 py-7 text-[16px] leading-8 text-[#f5e7bd] outline-none'
    },
    handleKeyDown(_view, event) {
      return handleMentionKeydown(event)
    }
  },
  onUpdate({ editor }) {
    emit('update:modelValue', editor.getHTML())
    refreshMentionMenu()
  },
  onSelectionUpdate() {
    refreshMentionMenu()
  },
  onBlur() {
    window.setTimeout(() => {
      closeMentionMenu()
    }, 180)
  }
})

watch(
  () => props.modelValue,
  (value) => {
    if (!editor.value) return
    if (editor.value.getHTML() === value) return
    editor.value.commands.setContent(value || '', false)
  }
)

onBeforeUnmount(() => editor.value?.destroy())

function chain() {
  return editor.value?.chain().focus()
}

function active(name: string, attrs?: Record<string, any>) {
  return editor.value?.isActive(name, attrs) ? 'eldra-selected-glow border-[rgba(251,191,36,0.85)] bg-[rgba(201,164,90,0.20)] text-[#fff7df]' : ''
}

function setLink() {
  if (!editor.value) return

  const oldUrl = editor.value.getAttributes('link').href || ''
  const url = window.prompt('Link URL', oldUrl)

  if (url === null) return

  if (!url.trim()) {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }

  editor.value.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
}

function clearFormatting() {
  chain()?.unsetAllMarks().clearNodes().run()
}

function buttonClass(name?: string, attrs?: Record<string, any>) {
  return [
    'eldra-editor-button rounded-none border px-3 py-1.5 text-sm transition',
    name ? active(name, attrs) : ''
  ]
}
</script>

<template>
  <div class="eldra-rich-editor eldra-ornate-panel eldra-frame-corners rounded-none border p-4">
    <div class="flex flex-col gap-3 border-b border-[rgba(201,164,90,0.22)] pb-4">
      <div class="flex flex-wrap items-center gap-2">
        <div class="mr-1 text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">
          Text
        </div>

        <button type="button" :class="buttonClass('paragraph')" @click="chain()?.setParagraph().run()">Paragraph</button>
        <button type="button" :class="buttonClass('heading', { level: 1 })" @click="chain()?.toggleHeading({ level: 1 }).run()">H1</button>
        <button type="button" :class="buttonClass('heading', { level: 2 })" @click="chain()?.toggleHeading({ level: 2 }).run()">H2</button>
        <button type="button" :class="buttonClass('heading', { level: 3 })" @click="chain()?.toggleHeading({ level: 3 }).run()">H3</button>

        <span class="mx-1 h-6 w-px bg-[rgba(201,164,90,0.22)]" />

        <button type="button" :class="buttonClass('bold')" class="font-bold" @click="chain()?.toggleBold().run()">B</button>
        <button type="button" :class="buttonClass('italic')" class="italic" @click="chain()?.toggleItalic().run()">I</button>
        <button type="button" :class="buttonClass('underline')" class="underline" @click="chain()?.toggleUnderline().run()">U</button>
        <button type="button" :class="buttonClass('strike')" class="line-through" @click="chain()?.toggleStrike().run()">S</button>
        <button type="button" :class="buttonClass('highlight')" @click="chain()?.toggleHighlight().run()">Highlight</button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="mr-1 text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">
          Blocks
        </div>

        <button type="button" :class="buttonClass('bulletList')" @click="chain()?.toggleBulletList().run()">Bullets</button>
        <button type="button" :class="buttonClass('orderedList')" @click="chain()?.toggleOrderedList().run()">Numbers</button>
        <button type="button" :class="buttonClass('blockquote')" @click="chain()?.toggleBlockquote().run()">Quote</button>
        <button type="button" :class="buttonClass()" @click="chain()?.setHorizontalRule().run()">Divider</button>

        <span class="mx-1 h-6 w-px bg-[rgba(201,164,90,0.22)]" />

        <button type="button" :class="buttonClass(undefined)" @click="chain()?.setTextAlign('left').run()">Left</button>
        <button type="button" :class="buttonClass(undefined)" @click="chain()?.setTextAlign('center').run()">Center</button>
        <button type="button" :class="buttonClass(undefined)" @click="chain()?.setTextAlign('right').run()">Right</button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="mr-1 text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">
          Insert
        </div>

        <button type="button" :class="buttonClass('link')" @click="setLink">Link</button>
        <button type="button" :class="buttonClass()" @click="chain()?.unsetLink().run()">Unlink</button>

        <span class="mx-1 h-6 w-px bg-[rgba(201,164,90,0.22)]" />

        <button type="button" :class="buttonClass()" @click="clearFormatting">Clear</button>
        <button type="button" :class="buttonClass()" @click="chain()?.undo().run()">Undo</button>
        <button type="button" :class="buttonClass()" @click="chain()?.redo().run()">Redo</button>

        <div class="ml-auto text-xs text-[#9f9278]">
          Type <span class="text-[#f5e7bd]">@</span> to mention a world entity.
        </div>
      </div>
    </div>

    <div class="relative mt-4">
      <EditorContent
        :editor="editor"
        class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] shadow-[inset_0_0_40px_rgba(0,0,0,0.24)]"
      />

      <div
        v-if="showMentionMenu"
        class="absolute left-6 top-6 z-50 w-[360px] max-w-[calc(100%-3rem)] overflow-hidden rounded-none border border-[rgba(201,164,90,0.36)] bg-[linear-gradient(to_bottom,rgba(20,17,12,0.98),rgba(7,6,4,0.98))] shadow-2xl"
      >
        <div class="border-b border-[rgba(201,164,90,0.20)] px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">
          Mention Entity
        </div>

        <button
          v-for="(entity, index) in filteredMentionEntities"
          :key="entity.id"
          type="button"
          class="block w-full border-b border-[rgba(201,164,90,0.12)] px-3 py-2 text-left transition last:border-b-0"
          :class="index === activeMentionIndex ? 'bg-[rgba(201,164,90,0.18)]' : 'hover:bg-[rgba(201,164,90,0.10)]'"
          @mousedown.prevent="insertMention(entity)"
          @mouseenter="activeMentionIndex = index"
        >
          <div class="text-sm font-semibold text-[#fff7df]">
            {{ entityTitle(entity) }}
          </div>
          <div class="mt-0.5 flex items-center gap-2 text-xs text-[#9f9278]">
            <span>{{ entityTypeLabel(entity) }}</span>
            <span v-if="entity.slug">/ {{ entity.slug }}</span>
          </div>
        </button>
      </div>

      <div
        v-else-if="mentionMenuOpen && !loadingMentions"
        class="absolute left-6 top-6 z-50 w-[320px] rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(12,10,7,0.98)] px-3 py-2 text-sm text-[#9f9278] shadow-2xl"
      >
        No matching entities.
      </div>
    </div>
  </div>
</template>

<style scoped>
.eldra-editor-button {
  border-color: rgba(201, 164, 90, 0.28);
  background: rgba(20, 17, 12, 0.70);
  color: #f5e7bd;
}

.eldra-editor-button:hover {
  border-color: rgba(201, 164, 90, 0.55);
  background: rgba(201, 164, 90, 0.14);
  color: #fff7df;
}

:deep(.ProseMirror) {
  caret-color: #f5e7bd;
}

:deep(.ProseMirror:focus) {
  outline: none;
}

:deep(.ProseMirror p) {
  margin: 0.65rem 0;
}

:deep(.ProseMirror h1) {
  margin: 1.35rem 0 0.8rem;
  font-size: 2.2rem;
  line-height: 1.12;
  font-weight: 800;
  color: #fff7df;
}

:deep(.ProseMirror h2) {
  margin: 1.15rem 0 0.7rem;
  font-size: 1.65rem;
  line-height: 1.2;
  font-weight: 750;
  color: #fff7df;
}

:deep(.ProseMirror h3) {
  margin: 1rem 0 0.6rem;
  font-size: 1.28rem;
  line-height: 1.25;
  font-weight: 700;
  color: #fff7df;
}

:deep(.ProseMirror ul),
:deep(.ProseMirror ol) {
  margin: 0.85rem 0;
  padding-left: 1.85rem;
}

:deep(.ProseMirror li) {
  margin: 0.35rem 0;
}

:deep(.ProseMirror blockquote) {
  margin: 1rem 0;
  border-left: 3px solid rgba(201, 164, 90, 0.58);
  background: rgba(201, 164, 90, 0.08);
  padding: 0.85rem 1.05rem;
  color: #e8d9b5;
}

:deep(.ProseMirror hr) {
  margin: 1.2rem 0;
  border: 0;
  border-top: 1px solid rgba(201, 164, 90, 0.34);
}

:deep(.ProseMirror mark) {
  background: rgba(201, 164, 90, 0.28);
  color: #fff7df;
}

:deep(.ProseMirror a) {
  color: #f5e7bd;
  text-decoration: underline;
  text-decoration-color: rgba(201, 164, 90, 0.75);
  text-underline-offset: 4px;
}

:deep(.ProseMirror .is-editor-empty:first-child::before) {
  color: rgba(216, 206, 184, 0.45);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

:deep(.ProseMirror-selectednode) {
  outline: 2px solid rgba(201, 164, 90, 0.45);
}
</style>
