import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { createError, getHeader } from 'h3'

export type DatasetKey = 'src' | 'img'
export type DatasetUpdateTarget = DatasetKey | 'both'

export const DATASETS: Record<DatasetKey, { key: DatasetKey; label: string; path: string; description: string }> = {
  src: {
    key: 'src',
    label: '5e.tools Data',
    path: '/opt/eldra/datasets/5etools-src',
    description: 'Rules, monsters, spells, items, classes, feats, species, and source JSON.'
  },
  img: {
    key: 'img',
    label: '5e.tools Images',
    path: '/opt/eldra/datasets/5etools-img',
    description: 'Local image mirror used by imported fluff and image references.'
  }
}

const locks = new Set<DatasetKey>()

function truncate(value: string, limit = 12000) {
  const text = String(value || '')
  return text.length > limit ? `${text.slice(0, limit)}\n...[truncated]` : text
}



function configuredDatasetToken() {
  return String(
    process.env.ELDRA_DATASET_UPDATE_TOKEN ||
    process.env.DATASET_UPDATE_TOKEN ||
    process.env.IMPORT_DATASET_TOKEN ||
    ''
  ).trim()
}

function datasetTokenFromEvent(event: any) {
  const direct = String(getHeader(event, 'x-eldra-dataset-token') || '').trim()
  if (direct) return direct

  const auth = String(getHeader(event, 'authorization') || '').trim()
  if (/^bearer\s+/i.test(auth)) {
    return auth.replace(/^bearer\s+/i, '').trim()
  }

  return ''
}

function safeTokenEquals(actual: string, expected: string) {
  if (!actual || !expected || actual.length !== expected.length) return false

  let result = 0
  for (let i = 0; i < actual.length; i++) {
    result |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  }

  return result === 0
}

export async function assertDatasetAdmin(event: any) {
  const expected = configuredDatasetToken()

  if (!expected) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Dataset update token is not configured on the server.'
    })
  }

  const actual = datasetTokenFromEvent(event)

  if (!safeTokenEquals(actual, expected)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Dataset maintenance key required.'
    })
  }

  return {
    authenticated: true,
    method: 'dataset-maintenance-key'
  }
}


function run(command: string, args: string[], options: { timeoutMs?: number } = {}) {
  const startedAt = Date.now()
  const timeoutMs = options.timeoutMs || 120000

  return new Promise<{
    ok: boolean
    code: number | null
    stdout: string
    stderr: string
    durationMs: number
  }>((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const child = spawn(command, args, {
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      resolve({
        ok: false,
        code: null,
        stdout: truncate(stdout),
        stderr: truncate(`${stderr}\nCommand timed out after ${timeoutMs}ms.`),
        durationMs: Date.now() - startedAt
      })
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        ok: false,
        code: null,
        stdout: truncate(stdout),
        stderr: truncate(`${stderr}\n${error.message}`),
        durationMs: Date.now() - startedAt
      })
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        ok: code === 0,
        code,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
        durationMs: Date.now() - startedAt
      })
    })
  })
}

function git(dataset: DatasetKey, args: string[], timeoutMs = 120000) {
  const info = DATASETS[dataset]
  return run('git', ['-C', info.path, ...args], { timeoutMs })
}

export function datasetKeysForTarget(target: any): DatasetKey[] {
  const key = String(target || 'src').trim().toLowerCase()

  if (key === 'both') return ['src', 'img']
  if (key === 'src' || key === 'img') return [key]

  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid dataset target'
  })
}

export async function datasetStatus(dataset: DatasetKey) {
  const info = DATASETS[dataset]

  let exists = false
  try {
    await access(info.path)
    exists = true
  } catch {}

  if (!exists) {
    return {
      ...info,
      exists: false,
      isGitRepo: false,
      ok: false,
      dirty: false,
      branch: '',
      shortHash: '',
      lastCommit: '',
      remote: '',
      status: '',
      error: 'Dataset path is missing.'
    }
  }

  const isRepo = await git(dataset, ['rev-parse', '--is-inside-work-tree'])
  const branch = await git(dataset, ['branch', '--show-current'])
  const hash = await git(dataset, ['rev-parse', '--short', 'HEAD'])
  const log = await git(dataset, ['log', '-1', '--format=%h %s'])
  const remote = await git(dataset, ['remote', 'get-url', 'origin'])
  const status = await git(dataset, ['status', '--porcelain'])
  const upstream = await git(dataset, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])

  const dirty = Boolean(status.stdout.trim())
  const [ahead = '', behind = ''] = upstream.ok ? upstream.stdout.trim().split(/\s+/) : []

  return {
    ...info,
    exists: true,
    isGitRepo: isRepo.ok && isRepo.stdout.trim() === 'true',
    ok: Boolean(isRepo.ok && hash.ok),
    dirty,
    branch: branch.stdout.trim(),
    shortHash: hash.stdout.trim(),
    lastCommit: log.stdout.trim(),
    remote: remote.stdout.trim(),
    status: status.stdout.trim(),
    ahead: Number(ahead || 0),
    behind: Number(behind || 0),
    error: isRepo.ok ? '' : isRepo.stderr.trim()
  }
}

export async function updateDataset(dataset: DatasetKey) {
  const info = DATASETS[dataset]

  if (locks.has(dataset)) {
    return {
      key: dataset,
      label: info.label,
      ok: false,
      skipped: true,
      message: 'Update already running for this dataset.',
      commands: []
    }
  }

  locks.add(dataset)

  try {
    const before = await datasetStatus(dataset)

    if (!before.exists || !before.isGitRepo) {
      return {
        key: dataset,
        label: info.label,
        ok: false,
        skipped: true,
        message: 'Dataset path is not a git repository.',
        before,
        commands: []
      }
    }

    if (before.dirty) {
      return {
        key: dataset,
        label: info.label,
        ok: false,
        skipped: true,
        message: 'Dataset has local changes. Refusing to pull until the working tree is clean.',
        before,
        commands: []
      }
    }

    const fetchResult = await git(dataset, ['fetch', '--all', '--prune'], 600000)
    const pullResult = fetchResult.ok
      ? await git(dataset, ['pull', '--ff-only'], 600000)
      : {
          ok: false,
          code: null,
          stdout: '',
          stderr: 'Fetch failed, pull skipped.',
          durationMs: 0
        }

    const after = await datasetStatus(dataset)
    const ok = Boolean(fetchResult.ok && pullResult.ok)

    return {
      key: dataset,
      label: info.label,
      ok,
      skipped: false,
      message: ok ? 'Dataset updated.' : 'Dataset update failed.',
      before,
      after,
      commands: [
        {
          command: `git -C ${info.path} fetch --all --prune`,
          ...fetchResult
        },
        {
          command: `git -C ${info.path} pull --ff-only`,
          ...pullResult
        }
      ]
    }
  } finally {
    locks.delete(dataset)
  }
}
