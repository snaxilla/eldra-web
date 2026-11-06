// Maps follow-up pass, Area 1 (Media Gallery). Pure translation from a
// WorldMediaPicker selection (app/components/world/WorldMediaPicker.vue's
// MediaFile contract: {id, title, filename, type, url, ...}) into the File
// object the existing map upload FormData flow already expects
// (app/pages/worlds/[id]/maps.vue's uploadMap()). Extracted so this
// conversion is unit-testable without mounting the page -- this codebase
// has no Vue Test Utils / SFC-mounting test infrastructure (see
// tests/components/characters/catalogue-option-search.ts and its
// CharacterInventoryPanel.vue / CharacterSpellcastingPanel.vue callers for
// the established precedent of extracting UI logic this way).
export type GallerySelectedFile = {
  id?: string
  title?: string
  filename?: string
  type?: string
  url: string
}

export type GallerySelectionResult =
  | { ok: true; file: File; title: string | null }
  | { ok: false; error: string }

export async function buildFileFromGallerySelection(
  selected: GallerySelectedFile,
  fetchBlob: (url: string) => Promise<Blob>
): Promise<GallerySelectionResult> {
  try {
    const blob = await fetchBlob(selected.url)
    const filename = selected.filename || selected.title || `${selected.id || 'image'}.png`
    const file = new File([blob], filename, { type: selected.type || blob.type || 'image/png' })
    return { ok: true, file, title: selected.title || null }
  } catch (error: any) {
    return {
      ok: false,
      error: error?.data?.statusMessage || error?.data?.message || error?.message || 'Could not load the selected image from the gallery.'
    }
  }
}
