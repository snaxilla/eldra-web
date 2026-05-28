import { directusServiceRequest } from './directus'
import { loadActiveCharacterSheet } from './character-sheet-inventory'

type NoteStorage = {
  field: string
  nestedKey?: string
  stringify?: boolean
}

let noteStorageCache: NoteStorage | null = null

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function textValue(value: any, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function randomNoteId() {
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeNote(raw: any) {
  const now = new Date().toISOString()

  return {
    id: textValue(raw?.id, randomNoteId()),
    title: textValue(raw?.title, 'Untitled Note'),
    body: String(raw?.body ?? raw?.text ?? raw?.content ?? '').trim(),
    createdAt: textValue(raw?.createdAt ?? raw?.created_at, now),
    updatedAt: textValue(raw?.updatedAt ?? raw?.updated_at, now)
  }
}

function parseMaybeJson(value: any) {
  if (Array.isArray(value)) return value

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []

    try {
      const parsed = JSON.parse(trimmed)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

async function noteStorage(): Promise<NoteStorage> {
  if (noteStorageCache) return noteStorageCache

  try {
    const res = await directusServiceRequest('/fields/character_sheets', {
      method: 'GET'
    })

    const fields = Array.isArray(res?.data) ? res.data : []
    const byName = new Map(fields.map((field: any) => [String(field?.field || ''), field]))

    for (const fieldName of ['notes', 'note_cards', 'sheet_notes']) {
      if (byName.has(fieldName)) {
        const field = byName.get(fieldName) as any
        const type = String(field?.type || field?.schema?.data_type || '').toLowerCase()

        noteStorageCache = {
          field: fieldName,
          stringify: !['json', 'alias'].includes(type) && !type.includes('json')
        }

        return noteStorageCache
      }
    }

    if (byName.has('choices')) {
      noteStorageCache = {
        field: 'choices',
        nestedKey: '__notes'
      }

      return noteStorageCache
    }
  } catch {}

  noteStorageCache = {
    field: 'choices',
    nestedKey: '__notes'
  }

  return noteStorageCache
}

function readNotesFromSheet(sheet: any, storage: NoteStorage) {
  if (storage.nestedKey) {
    return parseMaybeJson(asObject(sheet?.[storage.field])?.[storage.nestedKey])
      .map(normalizeNote)
  }

  return parseMaybeJson(sheet?.[storage.field])
    .map(normalizeNote)
}

function buildPatchBody(sheet: any, storage: NoteStorage, notes: any[]) {
  if (storage.nestedKey) {
    return {
      [storage.field]: {
        ...asObject(sheet?.[storage.field]),
        [storage.nestedKey]: notes
      }
    }
  }

  return {
    [storage.field]: storage.stringify ? JSON.stringify(notes) : notes
  }
}

async function saveNotesToSheet(sheet: any, notes: any[]) {
  const storage = await noteStorage()
  const normalized = notes.map(normalizeNote)
  const patchBody = buildPatchBody(sheet, storage, normalized)

  const patched = await directusServiceRequest(`/items/character_sheets/${sheet.id}`, {
    method: 'PATCH',
    body: patchBody
  })

  return {
    notes: normalized,
    sheet: {
      ...sheet,
      ...(patched?.data || {}),
      ...patchBody
    }
  }
}

export async function loadNotesForSheet(worldId: string, entityId: string) {
  const sheet = await loadActiveCharacterSheet(worldId, entityId)
  const storage = await noteStorage()

  return {
    notes: readNotesFromSheet(sheet, storage),
    sheet
  }
}

export async function createNoteForSheet(worldId: string, entityId: string, body: any = {}) {
  const sheet = await loadActiveCharacterSheet(worldId, entityId)
  const storage = await noteStorage()
  const notes = readNotesFromSheet(sheet, storage)

  const title = textValue(body?.title, '')
  const noteBody = String(body?.body ?? '').trim()

  if (!title && !noteBody) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Note title or body is required'
    })
  }

  const now = new Date().toISOString()
  const note = normalizeNote({
    id: randomNoteId(),
    title: title || 'Untitled Note',
    body: noteBody,
    createdAt: now,
    updatedAt: now
  })

  return await saveNotesToSheet(sheet, [note, ...notes])
}

export async function updateNoteForSheet(worldId: string, entityId: string, noteId: string, body: any = {}) {
  const sheet = await loadActiveCharacterSheet(worldId, entityId)
  const storage = await noteStorage()
  const notes = readNotesFromSheet(sheet, storage)
  const needle = String(noteId || '').trim()

  if (!needle) {
    throw createError({
      statusCode: 400,
      statusMessage: 'noteId is required'
    })
  }

  const index = notes.findIndex((note: any) => String(note.id) === needle)

  if (index < 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Note not found'
    })
  }

  const title = textValue(body?.title, notes[index].title)
  const noteBody = body?.body !== undefined ? String(body.body || '').trim() : notes[index].body

  notes[index] = normalizeNote({
    ...notes[index],
    title,
    body: noteBody,
    updatedAt: new Date().toISOString()
  })

  return await saveNotesToSheet(sheet, notes)
}

export async function deleteNoteForSheet(worldId: string, entityId: string, noteId: string) {
  const sheet = await loadActiveCharacterSheet(worldId, entityId)
  const storage = await noteStorage()
  const notes = readNotesFromSheet(sheet, storage)
  const needle = String(noteId || '').trim()

  if (!needle) {
    throw createError({
      statusCode: 400,
      statusMessage: 'noteId is required'
    })
  }

  return await saveNotesToSheet(
    sheet,
    notes.filter((note: any) => String(note.id) !== needle)
  )
}
