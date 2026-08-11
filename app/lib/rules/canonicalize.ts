// Deterministic canonical serialization for Rules Package integrity hashing.
// See .github/docs/architecture/rules-package-infrastructure.md §5.1
// ("Integrity hashing") and rules-engine.md §11.2: "`integrity` is computed
// over canonicalized definitions." This module produces the canonical
// string; hashing it is server/utils/rules-packages.ts's job (SHA-256 via
// node:crypto), not this one -- this file has no Node imports so it stays
// usable from a future browser-side self-test/preview tool, matching every
// other module under app/lib/rules/.
//
// V1 uses simple recursive, key-sorted serialization -- not full RFC 8785
// JSON Canonicalization Scheme. The requirement is determinism across our
// own two call sites (publish and verify), not cross-implementation
// interoperability (architecture doc, same section).
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. Object keys are sorted; array element order is preserved. Arrays here
//    represent ordered content (a package's `definitions` list) where
//    position is meaningful, not a set -- sorting them would change what is
//    being hashed, not just how it is serialized.
// 2. `undefined` object properties are omitted and `undefined` array
//    elements serialize as `null`, mirroring `JSON.stringify`'s own
//    behavior exactly, so canonicalization never silently diverges from
//    how the same values would round-trip through Directus's JSON columns.
// 3. Functions, symbols, and bigints throw rather than silently
//    serializing to something misleading -- Definitions and manifests are
//    plain JSON-shaped data (see types.ts), so encountering one of these
//    indicates a caller bug, not an expected validation failure. This
//    module's callers (integrity hashing) are internal and trusted; this
//    is not the FAILURE MODEL the loader in rules-packages.ts must satisfy.

function serialize(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null'
  }

  const valueType = typeof value

  if (valueType === 'string') {
    return JSON.stringify(value)
  }

  if (valueType === 'number') {
    return Number.isFinite(value as number) ? String(value) : 'null'
  }

  if (valueType === 'boolean') {
    return value ? 'true' : 'false'
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => serialize(item === undefined ? null : item))
    return `[${items.join(',')}]`
  }

  if (valueType === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
    const entries = keys.map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`)
    return `{${entries.join(',')}}`
  }

  throw new TypeError(`canonicalize: unsupported value type "${valueType}"`)
}

// Pure, deterministic, recursive, key-sorted. The sole hashing input for
// Rules Package integrity (rules-packages.ts computes SHA-256 over this
// string's output) -- never a hash itself.
export function canonicalize(value: unknown): string {
  return serialize(value)
}
