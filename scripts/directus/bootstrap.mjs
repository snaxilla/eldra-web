import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Canonical entry point for Directus provisioning.
//
// This does NOT reimplement schema logic -- it runs the existing,
// independently-executable schema scripts in order, exactly as
// `pnpm run directus:create-*` already does, so each one keeps working
// standalone. Each script is already idempotent (ensureCollection /
// ensureField check-before-create), so running this repeatedly -- e.g.
// on every deploy -- is safe.
//
// Adding a new schema script means adding its filename to this list,
// nothing else.
const SCRIPTS = [
  'create-character-sheet-schema.mjs',
  'create-inventory-transfer-schema.mjs',
  'create-entity-relationship-schema.mjs',
  'create-scene-layer-objects-schema.mjs',
  'create-rules-packages-schema.mjs',
  'create-world-rules-config-schema.mjs'
]

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))

function runScript(filename) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(scriptsDir, filename)

    console.log(`\n--- Running ${filename} ---`)

    const child = spawn(process.execPath, [scriptPath], {
      stdio: 'inherit',
      env: process.env
    })

    child.on('error', reject)

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${filename} exited with code ${code}`))
      }
    })
  })
}

async function bootstrap() {
  for (const filename of SCRIPTS) {
    await runScript(filename)
  }

  console.log('\nDirectus schema bootstrap complete.')
}

bootstrap().catch((error) => {
  console.error(`\nDirectus schema bootstrap failed: ${error?.message || error}`)
  process.exit(1)
})
