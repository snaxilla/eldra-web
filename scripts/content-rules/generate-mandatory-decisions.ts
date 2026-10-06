// Regenerates app/lib/content-rules/dnd5e-2024-mandatory-decisions.json from the real
// 5etools XPHB corpus. Run from the repo root:
//
//   pnpm exec vite-node scripts/content-rules/write-mandatory-decisions.ts
//
// The corpus is discovery authority; the committed artifact is its structural index.
// tests/rules/mandatory-decision-discovery.test.ts fails when the artifact drifts from
// the corpus, so a regeneration is always a reviewed diff.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { detectAll, ownerSlugOf, type RawCorpus, type RawFeature, type RawSubclassFeature } from '../../app/lib/content-rules/mandatory-decisions'

export const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'))
}

// Loads the XPHB corpus exactly as the discovery sees it. Pure in its inputs: the same
// corpus files always produce the same RawCorpus.
export function loadXphbCorpus(root: string = DATA_ROOT): RawCorpus {
  const classFiles = readdirSync(join(root, 'class')).filter((f) => /^class-.*\.json$/.test(f)).sort()
  const classes = classFiles.map((file) => {
    const data = readJson(join(root, 'class', file))
    const cls = (data.class ?? []).find((c: any) => c.source === 'XPHB')
    if (!cls) return null
    const features: RawFeature[] = (data.classFeature ?? []).filter((f: any) => f.source === 'XPHB' && f.classSource === 'XPHB' && f.className === cls.name)
    const subclassFeatures: RawSubclassFeature[] = (data.subclassFeature ?? []).filter((f: any) => f.source === 'XPHB' && f.className === cls.name)
    const subclasses = (data.subclass ?? []).filter((s: any) => s.source === 'XPHB' && s.className === cls.name)
    return { cls, features, subclasses, subclassFeatures }
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const races = (readJson(join(root, 'races.json')).race ?? []).filter((r: any) => r.source === 'XPHB')
  const backgrounds = (readJson(join(root, 'backgrounds.json')).background ?? []).filter((b: any) => b.source === 'XPHB')
  const feats = (readJson(join(root, 'feats.json')).feat ?? []).filter((f: any) => f.source === 'XPHB')
  return { classes, races, backgrounds, feats }
}

// The corpus POPULATION (every XPHB species, class, and background by catalogue slug), recorded
// separately from the decisions: an entity with no decision never appears among the decision owners,
// and availability must still count it.
export function populationOf(corpus: RawCorpus): { species: string[], classes: string[], backgrounds: string[] } {
  return {
    species: corpus.races.map((r) => ownerSlugOf(r.name)).sort(),
    classes: corpus.classes.map((c) => ownerSlugOf(c.cls.name)).sort(),
    backgrounds: corpus.backgrounds.map((b) => ownerSlugOf(b.name)).sort()
  }
}

export function buildArtifact(root: string = DATA_ROOT): string {
  const corpus = loadXphbCorpus(root)
  const decisions = detectAll(corpus)
  return `${JSON.stringify({ corpus: 'XPHB (5etools-src)', population: populationOf(corpus), decisions }, null, 2)}\n`
}
