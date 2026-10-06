// Writes app/lib/content-rules/dnd5e-2024-mandatory-decisions.json from the XPHB corpus.
// Run from the repo root: pnpm exec vite-node scripts/content-rules/write-mandatory-decisions.ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildArtifact } from './generate-mandatory-decisions'

const path = join(process.cwd(), 'app/lib/content-rules/dnd5e-2024-mandatory-decisions.json')
writeFileSync(path, buildArtifact())
console.log(`wrote ${path}`)
