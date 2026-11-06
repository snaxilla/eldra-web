// Unit tests for app/lib/maps/gallery-selection.ts -- the pure translation
// behind Maps follow-up pass Area 1 (Media Gallery integration).
//
// This codebase has no Vue Test Utils / SFC-mounting infrastructure (no
// test anywhere mounts a .vue file), so "opening the gallery" and
// "canceling" -- pure template/ref-toggle behavior with no logic of their
// own -- cannot be exercised as automated tests here; WorldMediaPicker
// already guarantees cancel-without-select never emits 'select', so
// app/pages/worlds/[id]/maps.vue's uploadFile ref is simply never touched
// on cancel. What IS logic, and what these tests cover, is "selecting an
// image supplies the map upload form with the correct asset": the exact
// File built from a gallery selection, including the filename/title
// fallback chain and a failed fetch surfacing a clean error instead of
// throwing. The resulting File then flows through the SAME uploadMap()
// FormData path already covered end to end by
// tests/server/api/worlds/[id]/maps/upload.post.test.ts.

import { describe, expect, it } from 'vitest'

import { buildFileFromGallerySelection } from '../../../app/lib/maps/gallery-selection'

describe('buildFileFromGallerySelection', () => {
  it('builds a File with the gallery filename, type, and bytes -- the correct asset reaching the form', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const fetchBlob = async (url: string) => {
      expect(url).toBe('/api/assets/file-1')
      return new Blob([bytes], { type: 'image/png' })
    }

    const result = await buildFileFromGallerySelection(
      { id: 'file-1', title: 'Sword Coast', filename: 'sword-coast.png', type: 'image/png', url: '/api/assets/file-1' },
      fetchBlob
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file.name).toBe('sword-coast.png')
    expect(result.file.type).toBe('image/png')
    expect(result.file instanceof File).toBe(true)
    expect(result.title).toBe('Sword Coast')
  })

  it('falls back to the title, then the id, when no filename is present', async () => {
    const fetchBlob = async () => new Blob([new Uint8Array([1])], { type: 'image/png' })

    const byTitle = await buildFileFromGallerySelection({ id: 'file-2', title: 'Icewind Dale', url: 'u' }, fetchBlob)
    expect(byTitle.ok && byTitle.file.name).toBe('Icewind Dale')

    const byId = await buildFileFromGallerySelection({ id: 'file-3', url: 'u' }, fetchBlob)
    expect(byId.ok && byId.file.name).toBe('file-3.png')
  })

  it('falls back to the blob type when the gallery entry has none', async () => {
    const fetchBlob = async () => new Blob([new Uint8Array([1])], { type: 'image/webp' })
    const result = await buildFileFromGallerySelection({ id: 'file-4', url: 'u' }, fetchBlob)
    expect(result.ok && result.file.type).toBe('image/webp')
  })

  it('returns a clean error instead of throwing when the fetch fails', async () => {
    const fetchBlob = async () => {
      throw { data: { statusMessage: 'Not Found' } }
    }

    const result = await buildFileFromGallerySelection({ id: 'file-5', url: 'u' }, fetchBlob)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toBe('Not Found')
  })

  it('never includes a title when the gallery entry has none, even on success', async () => {
    const fetchBlob = async () => new Blob([new Uint8Array([1])], { type: 'image/png' })
    const result = await buildFileFromGallerySelection({ id: 'file-6', url: 'u' }, fetchBlob)
    expect(result.ok && result.title).toBeNull()
  })
})
