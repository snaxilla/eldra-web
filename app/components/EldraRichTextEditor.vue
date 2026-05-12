<script setup lang="ts">
import { watch, onBeforeUnmount } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const editor = useEditor({
  content: props.modelValue || '',
  extensions: [StarterKit],
  editorProps: {
    attributes: {
      class: 'min-h-[560px] px-5 py-5 text-[15px] leading-8 text-[#f5e7bd] outline-none'
    }
  },
  onUpdate({ editor }) {
    emit('update:modelValue', editor.getHTML())
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

onBeforeUnmount(() => {
  editor.value?.destroy()
})

function chain() {
  return editor.value?.chain().focus()
}
</script>

<template>
  <div class="eldra-ornate-panel eldra-frame-corners rounded-none border p-4">
    <div class="mb-3 flex flex-wrap gap-2 border-b border-[rgba(201,164,90,0.22)] pb-3">
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" :class="editor?.isActive('bold') ? 'eldra-selected-glow' : ''" @click="chain()?.toggleBold().run()">Bold</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" :class="editor?.isActive('italic') ? 'eldra-selected-glow' : ''" @click="chain()?.toggleItalic().run()">Italic</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" :class="editor?.isActive('heading', { level: 2 }) ? 'eldra-selected-glow' : ''" @click="chain()?.toggleHeading({ level: 2 }).run()">Heading</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" :class="editor?.isActive('bulletList') ? 'eldra-selected-glow' : ''" @click="chain()?.toggleBulletList().run()">Bullet List</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" :class="editor?.isActive('orderedList') ? 'eldra-selected-glow' : ''" @click="chain()?.toggleOrderedList().run()">Numbered List</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" :class="editor?.isActive('blockquote') ? 'eldra-selected-glow' : ''" @click="chain()?.toggleBlockquote().run()">Quote</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" @click="chain()?.setHorizontalRule().run()">Divider</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" @click="chain()?.undo().run()">Undo</button>
      <button type="button" class="eldra-button rounded-none px-3 py-1.5 text-sm" @click="chain()?.redo().run()">Redo</button>
    </div>

    <EditorContent
      :editor="editor"
      class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)]"
    />
  </div>
</template>

<style scoped>
:deep(.ProseMirror p) {
  margin: 0.65rem 0;
}

:deep(.ProseMirror h2) {
  margin: 1rem 0 0.65rem;
  font-size: 1.35rem;
  font-weight: 700;
  color: #fff7df;
}

:deep(.ProseMirror ul),
:deep(.ProseMirror ol) {
  margin: 0.75rem 0;
  padding-left: 1.5rem;
}

:deep(.ProseMirror li) {
  margin: 0.25rem 0;
}

:deep(.ProseMirror blockquote) {
  margin: 0.9rem 0;
  border-left: 3px solid rgba(201,164,90,0.55);
  background: rgba(201,164,90,0.08);
  padding: 0.75rem 1rem;
  color: #e8d9b5;
}

:deep(.ProseMirror hr) {
  margin: 1rem 0;
  border: 0;
  border-top: 1px solid rgba(201,164,90,0.34);
}
</style>
