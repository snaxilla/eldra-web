// Character Notes -- free text a player writes about their own character.
//
// The fourth module in the family app/lib/characters/{ability-scores,
// rules-choices,inventory}.ts already established, and deliberately shaped
// like them: pure, re-validated on read rather than trusted, and computing
// nothing. Notes are the simplest member of the family, because they
// resolve against nothing -- an ability score is a number the engine reads,
// an inventory item is a reference the catalogue joins against, but a note
// is just text the player wrote and nothing reads it back. It is stored
// exactly as entered and rendered exactly as stored.
//
// ---------------------------------------------------------------------------
// A FIXED RECORD, NOT A LIST
// ---------------------------------------------------------------------------
// V1's Notes tab (SheetNotesTab.vue) is an open-ended list of arbitrarily
// many title+body cards for anything a table wants to remember -- NPCs,
// cities, quests, clues. This is a different, smaller shape by design: six
// NAMED fields about the character itself (General, Appearance, Personality,
// Backstory, Goals, Secrets), each free text. It is closer to a character
// bio than to V1's notebook, because that is what was asked for -- V1 has no
// precedent for this exact shape to preserve.
//
// A fixed record rather than a list keeps the model honest about what it is:
// there is no note "title" to search, no per-note timestamp, no add/remove
// flow. Six always-present fields, each of which may be empty.
//
// ---------------------------------------------------------------------------
// WHY 'secrets' IS AN ORDINARY FIELD
// ---------------------------------------------------------------------------
// A `visibility: 'gm'` value exists elsewhere in this codebase (the entity
// article sidebar, map pins) but it is a DISPLAY hint only -- nothing in
// server/utils enforces it, and ownership-and-permissions.md's own finding
// is that `isAdmin` currently evaluates true for every human user, so there
// is no real per-world Game Master role to gate on yet. Labelling this field
// "GM-only" would be a promise the platform cannot keep: a player would
// write a secret believing it hidden, and any authenticated user could read
// it back through the exact same assembly endpoint. `secrets` is therefore
// an ordinary field, stored and rendered like the other five. Revisit when a
// real permission model exists to enforce it (ownership-and-permissions.md
// §2.7, §634's capability table).
//
// ---------------------------------------------------------------------------
// NO MARKDOWN, NO RICH TEXT
// ---------------------------------------------------------------------------
// Every field is a plain string, stored and displayed verbatim (rendered
// with CSS `white-space: pre-wrap` so line breaks survive, never through a
// markdown or HTML renderer). Eldra already has a rich text editor
// (EldraRichTextEditor.vue) for wiki article content; reaching for it here
// would be scope this task explicitly excludes, not a missing feature.

export type CharacterNoteField =
  | 'general'
  | 'appearance'
  | 'personality'
  | 'backstory'
  | 'goals'
  | 'secrets'

export const CHARACTER_NOTE_FIELDS: readonly CharacterNoteField[] = [
  'general',
  'appearance',
  'personality',
  'backstory',
  'goals',
  'secrets'
]

export const CHARACTER_NOTE_FIELD_LABELS: Record<CharacterNoteField, string> = {
  general: 'General Notes',
  appearance: 'Appearance',
  personality: 'Personality',
  backstory: 'Backstory',
  goals: 'Goals',
  secrets: 'Secrets'
}

export const CHARACTER_NOTE_FIELD_PLACEHOLDERS: Record<CharacterNoteField, string> = {
  general: 'Reminders, quirks, anything that does not fit elsewhere…',
  appearance: 'What does this character look like?',
  personality: 'How do they act, speak, and react?',
  backstory: 'Where did they come from, and what happened to them?',
  goals: 'What are they trying to achieve?',
  secrets: 'Something only this character knows.'
}

export type StoredCharacterNotes = Record<CharacterNoteField, string>

export function emptyCharacterNotes(): StoredCharacterNotes {
  return {
    general: '',
    appearance: '',
    personality: '',
    backstory: '',
    goals: '',
    secrets: ''
  }
}

// True when every field is blank -- used to decide whether a character has
// "notes yet" without treating an all-empty record as absent (see
// normalizeStoredCharacterNotes' own note on that distinction).
export function isCharacterNotesEmpty(notes: StoredCharacterNotes): boolean {
  return CHARACTER_NOTE_FIELDS.every((field) => notes[field].trim().length === 0)
}

// Re-validated on read, never trusted -- the same posture every module in
// this family takes. A record hand-edited into an unreadable shape degrades
// to "no notes yet" rather than rendering broken content.
//
// Unlike ability scores or rules choices, there is no bounds check to fail:
// any string is a legal note. So this can only fail on ENVELOPE shape (not
// an object), never on a field's content -- every field coerces to '' if it
// is missing or not a string, rather than rejecting the whole record the
// way one bad ability score does. A note field is not a value the engine
// depends on being well-formed; losing a coercion is strictly better than
// losing the other five fields over one bad one.
export function normalizeStoredCharacterNotes(value: unknown): StoredCharacterNotes | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const input = value as Record<string, unknown>
  const notes = emptyCharacterNotes()

  for (const field of CHARACTER_NOTE_FIELDS) {
    const raw = input[field]
    if (typeof raw === 'string') notes[field] = raw
  }

  return notes
}
