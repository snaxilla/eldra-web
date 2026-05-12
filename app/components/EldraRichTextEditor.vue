<script setup lang="ts">
import { watch, onBeforeUnmount } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const editor = useEditor({
  content: props.modelValue || '',
  extensions: [
    StarterKit,
    Underline,
    Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Highlight,
    Placeholder.configure({ placeholder: 'Write your article here...' })
  ],
  editorProps: {
    attributes: {
      class: 'min-h-[620px] px-6 py-6 text-[16px] leading-8 text-[#f5e7bd] outline-none'
    }
  },
  onUpdate({ editor }) {
    emit('update:modelValue', editor.getHTML())
  }
})

watch(() => props.modelValue, (value) => {
  if (!editor.value) return
  if (editor.value.getHTML() === value) return
  editor.value.commands.setContent(value || '', false)
})

onBeforeUnmount(() => editor.value?.destroy())

function chain() {
  return editor.value?.chain().focus()
}

function active(name: string, attrs?: Record<string, any>) {
  return editor.value?.isActive(name, attrs) ? 'eldra-selected-glow border-[rgba(251,191,36,0.85)]' : ''
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
</script>

<template>
  <div class="eldra-ornate-panel eldra-frame-corners rounded-none border p-4">
    <div class="mb-3 flex flex-wrap gap-2 border-b border-[rgba(201,164,90,0.22)] pb-3">
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" :class="active('paragraph')" @click="chain()?.setParagraph().run()">Paragraph</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" :class="active('heading', { level: 1 })" @click="chain()?.toggleHeading({ level: 1 }).run()">H1</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" :class="active('heading', { level: 2 })" @click="chain()?.toggleHeading({ level: 2 }).run()">H2</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" :class="active('heading', { level: 3 })" @click="chain()?.toggleHeading({ level: 3 }).run()">H3</button>

      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm font-bold" :class="active('bold')" @click="chain()?.toggleBold().run()">B</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm italic" :class="active('italic')" @click="chain()?.toggleItalic().run()">I</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm underline" :class="active('underline')" @click="chain()?.toggleUnderline().run()">U</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm line-through" :class="active('strike')" @click="chain()?.toggleStrike().run()">S</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" :class="active('highlight')" @click="chain()?.toggleHighlight().run()">Highlight</button>

      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" :class="active('bulletList')" @click="chain()?.toggleBulletList().run()">Bullets</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" :class="active('orderedList')" @click="chain()?.toggleOrderedList().run()">Numbers</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" :class="active('blockquote')" @click="chain()?.toggleBlockquote().run()">Quote</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" @click="chain()?.setHorizontalRule().run()">Divider</button>

      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" @click="chain()?.setTextAlign('left').run()">Left</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" @click="chain()?.setTextAlign('center').run()">Center</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" @click="chain()?.setTextAlign('right').run()">Right</button>

      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" :class="active('link')" @click="setLink">Link</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" @click="chain()?.unsetLink().run()">Unlink</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" @click="chain()?.unsetAllMarks().clearNodes().run()">Clear</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" @click="chain()?.undo().run()">Undo</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" @click="chain()?.redo().run()">Redo</button>
    </div>

    <EditorContent :editor="editor" class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)]" />
  </div>
</template>

<style scoped>
:deep(.ProseMirror p) { margin: 0.65rem 0; }
:deep(.ProseMirror h1) { margin: 1.25rem 0 0.75rem; font-size: 2rem; line-height: 1.15; font-weight: 800; color: #fff7df; }
:deep(.ProseMirror h2) { margin: 1rem 0 0.65rem; font-size: 1.55rem; line-height: 1.2; font-weight: 750; color: #fff7df; }
:deep(.ProseMirror h3) { margin: 0.9rem 0 0.55rem; font-size: 1.25rem; line-height: 1.25; font-weight: 700; color: #fff7df; }
:deep(.ProseMirror ul), :deep(.ProseMirror ol) { margin: 0.75rem 0; padding-left: 1.75rem; }
:deep(.ProseMirror li) { margin: 0.3rem 0; }
:deep(.ProseMirror blockquote) { margin: 0.9rem 0; border-left: 3px solid rgba(201,164,90,0.55); background: rgba(201,164,90,0.08); padding: 0.75rem 1rem; color: #e8d9b5; }
:deep(.ProseMirror hr) { margin: 1rem 0; border: 0; border-top: 1px solid rgba(201,164,90,0.34); }
:deep(.ProseMirror mark) { background: rgba(201,164,90,0.28); color: #fff7df; }
:deep(.ProseMirror a) { color: #f5e7bd; text-decoration: underline; text-decoration-color: rgba(201,164,90,0.75); text-underline-offset: 4px; }
:deep(.ProseMirror .is-editor-empty:first-child::before) { color: rgba(216,206,184,0.45); content: attr(data-placeholder); float: left; height: 0; pointer-events: none; }
</style>
