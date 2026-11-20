// BLANK ARTICLE + QUICK-CREATE IMAGE coverage for the Create Location
// image picker added to app/components/world/WorldEntityInteractivePage.vue.
//
// No Vue Test Utils / SFC-mounting infrastructure exists in this codebase
// (see tests/app/pages/worlds/maps.test.ts's own header for the
// established precedent this file follows): read the raw source and
// assert on it directly, rather than mounting and interacting with the
// component.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('../../../app/components/world/WorldEntityInteractivePage.vue', import.meta.url)),
  'utf8'
)

describe('app/components/world/WorldEntityInteractivePage.vue Create Location image picker', () => {
  it('wires the Media Gallery (WorldMediaPicker) into the Create Location image selector', () => {
    expect(source).toContain("import WorldMediaPicker from '~/components/world/WorldMediaPicker.vue'")
    expect(source).toContain('<WorldMediaPicker')
    expect(source).toContain('v-model:open="locationImagePickerOpen"')
    expect(source).toContain('@select="onLocationImageSelected"')
  })

  it('reuses buildCardThumbnailUrl for the preview, never for the stored reference', () => {
    expect(source).toContain("import { buildCardThumbnailUrl } from '~/lib/media/thumbnail-url'")
    expect(source).toContain('buildCardThumbnailUrl(newLocationForm.imageUrl)')
  })

  it('stores the draft image as imageFileId/imageUrl on newLocationForm, reset on success and on form reset', () => {
    expect(source).toContain('newLocationForm.imageFileId = String(file.id)')
    expect(source).toContain("newLocationForm.imageFileId = ''")
    expect(source).toContain("newLocationForm.imageUrl = ''")
  })

  it('never calls a delete/remove-asset endpoint when clearing the draft image', () => {
    const removeFn = source.slice(
      source.indexOf('function removeLocationImage'),
      source.indexOf('function removeLocationImage') + 300
    )
    expect(removeFn).not.toMatch(/\$fetch|DELETE/)
  })

  it('toggles the outer modal\'s dismissible state while the picker is open (nested-modal precedent)', () => {
    expect(source).toContain(':dismissible="!locationImagePickerOpen"')
  })

  it('includes imageFileId in the create-location POST body', () => {
    const createFnStart = source.indexOf('async function createLocationArticle')
    const createFnBlock = source.slice(createFnStart, createFnStart + 1200)
    expect(createFnBlock).toContain('imageFileId: newLocationForm.imageFileId || null')
  })

  it('treats a selected image as part of the dirty-draft check (route-navigation guard)', () => {
    const dirtyBlock = source.slice(
      source.indexOf('const newLocationFormDirty = computed('),
      source.indexOf('function confirmDiscardLocationDraftIfDirty')
    )
    expect(dirtyBlock).toContain('newLocationForm.imageFileId')
  })
})
