import { readFile } from 'node:fs/promises'

export function safeSource(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
}

export async function readJsonFile(path: string) {
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw)
}

export function itemKeyOf(item: any) {
  return `${String(item?.name || '').trim().toLowerCase()}::${String(item?.source || '').trim().toLowerCase()}`
}

export function uniqueSortedSources(values: any[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort()
}

export function matchesQuery(values: any[], q: string) {
  const needle = String(q || '').trim().toLowerCase()
  if (!needle) return true

  return values
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle))
}
