// Unit tests for app/lib/media/thumbnail-url.ts -- the one shared rule
// for turning a plain /api/assets/:id original URL into its `preset=card`
// derivative, used by app/pages/worlds/[id]/media.vue, WorldMediaPicker.vue
// (grid and, after the owner production acceptance follow-up, its own
// side panel), and MapImageOverlayEditor.vue's in-dialog preview.
import { describe, expect, it } from 'vitest'
import { buildCardThumbnailUrl } from '../../../app/lib/media/thumbnail-url'

describe('buildCardThumbnailUrl', () => {
  it('appends ?preset=card to a bare asset URL', () => {
    expect(buildCardThumbnailUrl('/api/assets/file-1')).toBe('/api/assets/file-1?preset=card')
  })

  it('appends &preset=card when the URL already has a query string', () => {
    expect(buildCardThumbnailUrl('/api/assets/file-1?foo=bar')).toBe('/api/assets/file-1?foo=bar&preset=card')
  })

  it('appends a retry token as &retry=<token> when supplied', () => {
    expect(buildCardThumbnailUrl('/api/assets/file-1', 12345)).toBe('/api/assets/file-1?preset=card&retry=12345')
  })

  it('omits the retry param entirely when no token is supplied', () => {
    expect(buildCardThumbnailUrl('/api/assets/file-1')).not.toContain('retry')
  })

  it('omits the retry param for a falsy (zero) token -- Date.now() never returns 0 in practice, but this must not silently produce "retry=0"', () => {
    expect(buildCardThumbnailUrl('/api/assets/file-1', 0)).toBe('/api/assets/file-1?preset=card')
  })

  it('returns an empty string for an empty/missing original URL rather than producing a bare "?preset=card"', () => {
    expect(buildCardThumbnailUrl('')).toBe('')
    expect(buildCardThumbnailUrl(undefined as unknown as string)).toBe('')
  })

  it('trims surrounding whitespace before building the URL', () => {
    expect(buildCardThumbnailUrl('  /api/assets/file-1  ')).toBe('/api/assets/file-1?preset=card')
  })
})
