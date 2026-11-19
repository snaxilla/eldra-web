// Owner production acceptance follow-up -- WorldMediaPicker's grid passed
// acceptance, but its right-hand selection preview and
// MapImageOverlayEditor's own in-dialog preview both still rendered the
// plain original (`file.url`) directly, so merely clicking/selecting an
// image (not "using" it) could still download the full original purely
// for a passive preview -- exactly the reported gap (a ~146MB Caldera
// image left the picker's side panel blank/slow).
//
// This is the ONE place `?preset=card` (server/api/assets/[id].get.ts)
// is appended to a bare asset URL -- previously duplicated, with slightly
// different exact string-building, across app/pages/worlds/[id]/media.vue
// (the gallery grid), WorldMediaPicker.vue (its own grid AND, after this
// pass, its side panel), and now MapImageOverlayEditor.vue's own dialog
// preview. No SFC-mount test harness exists in this codebase (confirmed:
// no @vue/test-utils dependency, and the established convention --
// tests/components/**/*.test.ts -- tests pure logic extracted into its
// own module, never a mounted component) -- extracting this one shared,
// easily-tested rule here, rather than leaving it duplicated inline in
// three places, is this task's own version of that same convention.
export function buildCardThumbnailUrl(originalUrl: string, retryToken?: number): string {
  const url = String(originalUrl || '').trim()
  if (!url) return ''

  const separator = url.includes('?') ? '&' : '?'
  const retrySuffix = retryToken ? `&retry=${retryToken}` : ''
  return `${url}${separator}preset=card${retrySuffix}`
}
