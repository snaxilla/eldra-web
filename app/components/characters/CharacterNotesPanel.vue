<script setup lang="ts">
// Notes for Character Sheet V2 -- the second V1 feature rebuilt on the new
// Character Architecture, following CharacterInventoryPanel.vue's pattern.
//
// V1's Notes tab is an open-ended list of title+body cards for anything a
// table wants to remember. This is a deliberately different, smaller shape:
// six NAMED fields about the character itself. There is no V1 layout to
// preserve for this exact shape, so the layout below is new -- one field per
// labelled block, stacked, which is the natural presentation for "a short
// list of always-present fields" the same way V1's own field-by-field forms
// (the Add Item panel, the ability score editor) already look.
//
// NO ARITHMETIC, NO DERIVATION. This component is six textareas and a save.
// Nothing here reads a Rules Package, a Definition, or a catalogue entry --
// notes are the one piece of a character that resolves against nothing.
//
// ---------------------------------------------------------------------------
// SAVE ON BLUR, NOT ON EVERY KEYSTROKE
// ---------------------------------------------------------------------------
// Saving per-keystroke would mean a network write on every letter typed;
// saving only via an explicit button risks a player losing a paragraph if
// they navigate away first. Blur -- leaving the field, which a mobile
// keyboard's own "Done"/tap-away already triggers -- is the point a person
// has naturally finished a thought, and needs no debounce timer or a save
// button squeezed beside every field.
//
// ---------------------------------------------------------------------------
// PLAIN TEXT, ON PURPOSE
// ---------------------------------------------------------------------------
// No markdown, no rich text, no formatting toolbar, no @mentions -- this
// task's own scope excludes all of them. `white-space: pre-wrap` (via
// `whitespace-pre-wrap`) is the only formatting concession: it preserves the
// line breaks a player actually typed without interpreting anything.
//
// ---------------------------------------------------------------------------
// MOBILE
// ---------------------------------------------------------------------------
// Every textarea is min-h-28 (well past a comfortable tap target) with
// generous padding, one column always -- these are paragraphs, not a grid of
// short facts, so there is no two-column arrangement to break on a phone.
// Nothing here depends on hover or a pointer; blur-to-save is the same event
// a phone keyboard already fires.

import {
  CHARACTER_NOTE_FIELDS,
  CHARACTER_NOTE_FIELD_LABELS,
  CHARACTER_NOTE_FIELD_PLACEHOLDERS,
  type CharacterNoteField,
  type StoredCharacterNotes
} from '~/lib/characters/character-notes'

const props = withDefaults(defineProps<{
  notes: StoredCharacterNotes
  saving?: boolean
  errorMessage?: string
}>(), {
  saving: false,
  errorMessage: ''
})

const emit = defineEmits<{
  save: [StoredCharacterNotes]
}>()

// A local draft so typing never fights the prop the parent may re-assign
// after a save resolves. Reseeded only when the INCOMING record actually
// changes -- not on every render -- so a field mid-edit is never clobbered
// by the parent re-fetching around it.
const draft = reactive<StoredCharacterNotes>({ ...props.notes })

watch(
  () => props.notes,
  (value) => {
    for (const field of CHARACTER_NOTE_FIELDS) draft[field] = value[field]
  }
)

function onBlur(field: CharacterNoteField) {
  if (draft[field] === props.notes[field]) return
  emit('save', { ...draft })
}
</script>

<template>
  <div class="grid gap-4">
    <p
      v-if="errorMessage"
      class="rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
    >
      {{ errorMessage }}
    </p>

    <label
      v-for="field in CHARACTER_NOTE_FIELDS"
      :key="field"
      class="block"
    >
      <span class="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.22em] text-[#9f9278]">
        {{ CHARACTER_NOTE_FIELD_LABELS[field] }}
        <span
          v-if="saving"
          class="normal-case tracking-normal text-[10px] text-[#9f9278]"
        >
          Saving…
        </span>
      </span>
      <textarea
        v-model="draft[field]"
        rows="4"
        class="eldra-input min-h-28 w-full whitespace-pre-wrap rounded-none px-3 py-2 text-sm leading-6 text-white"
        :placeholder="CHARACTER_NOTE_FIELD_PLACEHOLDERS[field]"
        @blur="onBlur(field)"
      />
    </label>
  </div>
</template>
