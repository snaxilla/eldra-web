// Installable Web App -- validates public/manifest.webmanifest directly
// off disk (the actual file this app serves, not a copy), and cross-
// checks its declared icon sizes against the real generated PNG
// dimensions (public/icons/, via sharp) rather than trusting the
// filenames. Catches the concrete regressions this manifest is most at
// risk of: a missing required field, an icon path that does not exist,
// or a declared size that no longer matches the actual file.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

const repoRoot = join(__dirname, '../..')

function readManifest() {
  const raw = readFileSync(join(repoRoot, 'public/manifest.webmanifest'), 'utf-8')
  return JSON.parse(raw)
}

describe('public/manifest.webmanifest', () => {
  it('is valid JSON with the fields Chromium requires for installability (web.dev/MDN install criteria)', () => {
    const manifest = readManifest()

    expect(typeof manifest.name === 'string' || typeof manifest.short_name === 'string').toBe(true)
    expect(Array.isArray(manifest.icons)).toBe(true)
    expect(typeof manifest.start_url).toBe('string')
    expect(['fullscreen', 'standalone', 'minimal-ui', 'window-controls-overlay']).toContain(manifest.display)
    expect(manifest.prefer_related_applications).not.toBe(true)
  })

  it('declares a 192px and a 512px icon -- Chromium\'s own stated minimum', () => {
    const manifest = readManifest()
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes)

    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
  })

  it('includes at least one maskable icon', () => {
    const manifest = readManifest()
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(true)
  })

  it('every icon path, start_url, and scope is relative (self-hosted: never a hardcoded absolute domain)', () => {
    const manifest = readManifest()

    expect(manifest.start_url.startsWith('/')).toBe(true)
    expect(manifest.scope.startsWith('/')).toBe(true)
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/')).toBe(true)
      expect(icon.src).not.toMatch(/^https?:\/\//)
    }
  })

  it('has a stable "id" so the installed app\'s identity does not change across deployments', () => {
    const manifest = readManifest()
    expect(typeof manifest.id).toBe('string')
    expect(manifest.id.length).toBeGreaterThan(0)
  })

  it('every declared icon file actually exists on disk at the declared pixel size', async () => {
    const manifest = readManifest()

    for (const icon of manifest.icons) {
      const [declaredWidth, declaredHeight] = String(icon.sizes).split('x').map(Number)
      const filePath = join(repoRoot, 'public', icon.src.replace(/^\//, ''))

      const metadata = await sharp(filePath).metadata()

      expect(metadata.width, `${icon.src} width`).toBe(declaredWidth)
      expect(metadata.height, `${icon.src} height`).toBe(declaredHeight)
      expect(metadata.format).toBe('png')
    }
  })

  it('the Apple touch icon referenced from nuxt.config.ts exists, is square, and has no transparency', async () => {
    const filePath = join(repoRoot, 'public/icons/apple-touch-icon.png')
    const metadata = await sharp(filePath).metadata()

    expect(metadata.width).toBe(metadata.height)
    expect(metadata.hasAlpha).toBe(false)
  })
})
