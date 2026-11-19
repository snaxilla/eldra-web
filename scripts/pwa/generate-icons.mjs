#!/usr/bin/env node
// Rasterizes app/assets/pwa/icon-source.svg into every PNG size the web
// app manifest and the Apple touch icon link need. Run manually whenever
// icon-source.svg changes (not a build step -- the generated PNGs are
// committed to public/icons/, like any other static asset in this repo).
//
//   node scripts/pwa/generate-icons.mjs
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const sourceSvg = join(rootDir, 'app/assets/pwa/icon-source.svg')
const outDir = join(rootDir, 'public/icons')

// Sizes a manifest.json actually needs (192/512, "any" and "maskable" --
// the SAME source art for both, since icon-source.svg's own header
// explains why it already respects the maskable safe zone) plus the
// Apple touch icon size iOS/iPadOS look for (180x180).
const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 }
]

await mkdir(outDir, { recursive: true })

for (const { file, size } of targets) {
  let pipeline = sharp(sourceSvg, { density: 384 }).resize(size, size)

  // Apple's own guidance for the touch icon is no transparency at all --
  // the source art is already fully opaque (a full-bleed background rect),
  // so this only strips the alpha channel the PNG would otherwise still
  // carry, rather than changing any visible pixel.
  if (file === 'apple-touch-icon.png') {
    pipeline = pipeline.flatten({ background: '#0a0907' })
  }

  await pipeline.png().toFile(join(outDir, file))
  console.log(`wrote public/icons/${file} (${size}x${size})`)
}
