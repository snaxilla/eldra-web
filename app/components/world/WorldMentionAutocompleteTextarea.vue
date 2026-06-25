<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

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
  rows?: string | number
  placeholder?: string
  textareaClass?: string
}>(), {
  worldId: '',
  rows: 4,
  placeholder: '',
  textareaClass: ''
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const allMentionEntities = ref<MentionEntity[]>([])
const mentionQuery = ref('')
const mentionRange = ref<{ from: number; to: number } | null>(null)
const mentionMenuOpen = ref(false)
const activeMentionIndex = ref(0)
const loadingMentions = ref(false)

const textareaValue = computed({
  get: () => props.modelValue || '',
  set: (value: string) => emit('update:modelValue', value)
})

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

function entityTitle(entity: MentionEntity) {
  return cleanText(entity.title || `Entity ${entity.id}`)
}

function entityTypeLabel(entity: MentionEntity) {
  return cleanText(entity.entityType || entity.entity_type || 'entity')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
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
    console.error('[WorldMentionAutocompleteTextarea] failed to load mention suggestions', error)
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
  const textarea = textareaRef.value
  if (!textarea) return closeMentionMenu()

  const cursor = textarea.selectionStart ?? 0
  const selectedEnd = textarea.selectionEnd ?? cursor

  if (cursor !== selectedEnd) return closeMentionMenu()

  const textBefore = textareaValue.value.slice(0, cursor)

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
    from: triggerStart,
    to: cursor
  }

  mentionMenuOpen.value = true
  activeMentionIndex.value = Math.min(activeMentionIndex.value, Math.max(filteredMentionEntities.value.length - 1, 0))
}

function insertMention(entity: MentionEntity | null = filteredMentionEntities.value[activeMentionIndex.value] || null) {
  const textarea = textareaRef.value
  const range = mentionRange.value

  if (!textarea || !range || !entity) return

  const title = entityTitle(entity)
  if (!title) return

  const replacement = `@[${title}]`
  const before = textareaValue.value.slice(0, range.from)
  const after = textareaValue.value.slice(range.to)

  textareaValue.value = `${before}${replacement}${after}`
  closeMentionMenu()

  nextTick(() => {
    const nextCursor = before.length + replacement.length
    textarea.focus()
    textarea.setSelectionRange(nextCursor, nextCursor)
  })
}

function onInput(event: Event) {
  textareaValue.value = (event.target as HTMLTextAreaElement).value
  nextTick(refreshMentionMenu)
}

function onKeydown(event: KeyboardEvent) {
  if (!showMentionMenu.value) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeMentionIndex.value = (activeMentionIndex.value + 1) % filteredMentionEntities.value.length
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeMentionIndex.value =
      (activeMentionIndex.value - 1 + filteredMentionEntities.value.length) % filteredMentionEntities.value.length
    return
  }

  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    insertMention()
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeMentionMenu()
  }
}

function onBlur() {
  window.setTimeout(() => closeMentionMenu(), 180)
}
</script>

<template>
  <div class="relative">
    <textarea
      ref="textareaRef"
      :value="textareaValue"
      :rows="rows"
      :placeholder="placeholder || 'Type @ to mention a world entity...'"
      :class="textareaClass"
      @input="onInput"
      @keydown="onKeydown"
      @keyup="refreshMentionMenu"
      @click="refreshMentionMenu"
      @focus="refreshMentionMenu"
      @blur="onBlur"
    />

    <div
      v-if="showMentionMenu"
      class="absolute left-0 top-full z-50 mt-2 w-[360px] max-w-full overflow-hidden rounded-none border border-[rgba(201,164,90,0.36)] bg-[linear-gradient(to_bottom,rgba(20,17,12,0.98),rgba(7,6,4,0.98))] shadow-2xl"
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
      class="absolute left-0 top-full z-50 mt-2 w-[320px] rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(12,10,7,0.98)] px-3 py-2 text-sm text-[#9f9278] shadow-2xl"
    >
      No matching entities.
    </div>
  </div>
</template>
