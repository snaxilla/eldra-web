// Character Ability Scores -- Character Builder / Character Sheet Phase 3.
//
// The canonical shape of a character's six ability scores, plus the rules
// governing how a player may ENTER them. Pure: no I/O, no Vue, no Directus,
// no framework. Imported by both the Builder component (client) and the
// persistence route (server), so the two can never disagree about what a
// valid set of scores is.
//
// ---------------------------------------------------------------------------
// THE BOUNDARY THIS MODULE MUST NOT CROSS
// ---------------------------------------------------------------------------
// Ability Scores are PLAYER DATA. Ability score MODIFIERS are RULES.
//
// This module therefore contains no `Math.floor((score - 10) / 2)`, and no
// saving throw, skill bonus, armor class, hit point, initiative, movement, or
// spell attack derivation of any kind. Those belong exclusively to the Rules
// Engine (app/lib/rules/**), which this module neither imports nor duplicates
// -- the same posture app/lib/content-presentation/ already holds for
// published content.
//
// WHY POINT BUY LIVES HERE ANYWAY, and is not a rules violation: a point-buy
// cost table constrains what a player may TYPE. It produces no character
// statistic, is consumed by nothing downstream, and is discarded the moment
// the scores are stored -- what persists is six numbers. Compare a derived
// modifier, which would be a statement ABOUT a character that the Rules
// Engine must own because it changes with equipment, effects, and level.
// Entry constraints are Builder concerns; derivations are engine concerns.
//
// ---------------------------------------------------------------------------
// WHAT PERSISTS
// ---------------------------------------------------------------------------
// Exactly the six numbers, plus which method produced them. The method is
// stored as PROVENANCE (how did this character come to have these numbers?),
// never re-derived from or re-validated against the scores on read -- a GM
// who later nudges a point-buy character's Strength has not made the record
// invalid, and nothing here will claim otherwise.

export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

export type AbilityKey = (typeof ABILITY_KEYS)[number]

export type AbilityScores = Record<AbilityKey, number>

// A work-in-progress assignment: an ability may legitimately have no value
// yet (Standard Array starts entirely unassigned). `AbilityScores` is the
// completed form; this is the editable form.
export type AbilityScoreAssignment = Record<AbilityKey, number | null>

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma'
}

export const ABILITY_ABBREVIATIONS: Record<AbilityKey, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA'
}

export type AbilityScoreMethod = 'standard-array' | 'point-buy' | 'manual' | 'roll'

export const ABILITY_SCORE_METHODS: readonly AbilityScoreMethod[] = [
  'standard-array',
  'point-buy',
  'manual',
  'roll'
]

export const ABILITY_SCORE_METHOD_LABELS: Record<AbilityScoreMethod, string> = {
  'standard-array': 'Standard Array',
  'point-buy': 'Point Buy',
  manual: 'Manual Entry',
  roll: 'Roll'
}

export const ABILITY_SCORE_METHOD_DESCRIPTIONS: Record<AbilityScoreMethod, string> = {
  'standard-array': 'Assign a fixed set of six values, one to each ability.',
  'point-buy': 'Spend a budget of points to raise each ability from a common baseline.',
  manual: 'Type each score directly. Use this for a rolled character or a GM-provided array.',
  roll: 'Roll for your scores in the app.'
}

// Rolling is deliberately a declared-but-unavailable method rather than a
// hidden one -- this task's own IMPLEMENT section stubs it, and its own
// NON-GOALS forbid dice rolling logic. Showing it greyed with an explanation
// tells a player it is coming; omitting it would read as "Eldra does not
// support rolling." Manual Entry is the honest interim path and the stub
// says so.
export const UNAVAILABLE_ABILITY_SCORE_METHODS: readonly AbilityScoreMethod[] = ['roll']

export function isAbilityScoreMethodAvailable(method: AbilityScoreMethod): boolean {
  return !UNAVAILABLE_ABILITY_SCORE_METHODS.includes(method)
}

// ---------------------------------------------------------------------------
// Storage bounds
// ---------------------------------------------------------------------------
// Deliberately permissive: this is a data-integrity guard (reject strings,
// NaN, 0, 9999, Infinity), not a statement about what a legal character is.
// 1..30 is the widest range 5e itself ever uses, so nothing a GM might
// legitimately want to record is refused here. Method-specific limits
// (Point Buy's 8..15) are enforced by the Builder while editing, never
// retroactively against a stored record.
export const MIN_STORED_ABILITY_SCORE = 1
export const MAX_STORED_ABILITY_SCORE = 30

// ---------------------------------------------------------------------------
// Standard Array
// ---------------------------------------------------------------------------

export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8]

// Which STANDARD_ARRAY values are still unused, given an in-progress
// assignment. Duplicates matter: the array contains six distinct values
// today, but this counts by multiplicity so a future array with a repeat
// (e.g. [15, 14, 14, 12, 10, 8]) needs no change here.
export function remainingStandardArrayValues(assignment: AbilityScoreAssignment): number[] {
  const pool = [...STANDARD_ARRAY]

  for (const key of ABILITY_KEYS) {
    const value = assignment[key]
    if (value === null || value === undefined) continue
    const index = pool.indexOf(value)
    if (index >= 0) pool.splice(index, 1)
  }

  return pool
}

// True when every ability holds a value AND the six values are exactly
// STANDARD_ARRAY (as a multiset). Order is irrelevant -- assigning 15 to
// Dexterity rather than Strength is the entire point of the method.
export function isCompleteStandardArray(assignment: AbilityScoreAssignment): boolean {
  const values: number[] = []

  for (const key of ABILITY_KEYS) {
    const value = assignment[key]
    if (typeof value !== 'number') return false
    values.push(value)
  }

  return sameMultiset(values, STANDARD_ARRAY)
}

function sameMultiset(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  const left = [...a].sort((x, y) => x - y)
  const right = [...b].sort((x, y) => x - y)
  return left.every((value, index) => value === right[index])
}

// ---------------------------------------------------------------------------
// Point Buy
// ---------------------------------------------------------------------------

export const POINT_BUY_MIN = 8
export const POINT_BUY_MAX = 15
export const POINT_BUY_BUDGET = 27

// The 2024 Player's Handbook cost table. Costs are not linear above 13,
// which is the whole reason a table exists rather than a formula.
export const POINT_BUY_COSTS: Readonly<Record<number, number>> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9
}

// Cost of a single score, or null when the score is outside the buyable
// range. Null (rather than 0 or Infinity) so callers must decide what an
// out-of-range value means for them, instead of silently treating it as free.
export function pointBuyCost(score: number | null | undefined): number | null {
  if (typeof score !== 'number' || !Number.isInteger(score)) return null
  const cost = POINT_BUY_COSTS[score]
  return cost === undefined ? null : cost
}

// Total spent across all six abilities. An unassigned or out-of-range
// ability contributes 0 -- an incomplete draft has simply not spent anything
// on that ability yet.
export function pointBuySpent(assignment: AbilityScoreAssignment): number {
  let total = 0
  for (const key of ABILITY_KEYS) {
    total += pointBuyCost(assignment[key]) ?? 0
  }
  return total
}

export function pointBuyRemaining(assignment: AbilityScoreAssignment): number {
  return POINT_BUY_BUDGET - pointBuySpent(assignment)
}

// Can this ability be raised by one step right now? False at the ceiling,
// and false when the next step costs more than the remaining budget --
// which is why this is a function and not `score < POINT_BUY_MAX`: the step
// from 13 to 14 costs 2, not 1.
export function canRaisePointBuy(assignment: AbilityScoreAssignment, key: AbilityKey): boolean {
  const current = assignment[key]
  if (typeof current !== 'number') return false

  const next = current + 1
  const nextCost = pointBuyCost(next)
  const currentCost = pointBuyCost(current)
  if (nextCost === null || currentCost === null) return false

  return nextCost - currentCost <= pointBuyRemaining(assignment)
}

export function canLowerPointBuy(assignment: AbilityScoreAssignment, key: AbilityKey): boolean {
  const current = assignment[key]
  return typeof current === 'number' && current > POINT_BUY_MIN
}

export function isCompletePointBuy(assignment: AbilityScoreAssignment): boolean {
  for (const key of ABILITY_KEYS) {
    const value = assignment[key]
    if (typeof value !== 'number') return false
    if (pointBuyCost(value) === null) return false
  }

  return pointBuySpent(assignment) <= POINT_BUY_BUDGET
}

// ---------------------------------------------------------------------------
// Manual entry
// ---------------------------------------------------------------------------

export function isCompleteManual(assignment: AbilityScoreAssignment): boolean {
  return ABILITY_KEYS.every((key) => {
    const value = assignment[key]
    return (
      typeof value === 'number'
      && Number.isInteger(value)
      && value >= MIN_STORED_ABILITY_SCORE
      && value <= MAX_STORED_ABILITY_SCORE
    )
  })
}

// ---------------------------------------------------------------------------
// Method-agnostic helpers
// ---------------------------------------------------------------------------

export function isCompleteForMethod(method: AbilityScoreMethod, assignment: AbilityScoreAssignment): boolean {
  if (method === 'standard-array') return isCompleteStandardArray(assignment)
  if (method === 'point-buy') return isCompletePointBuy(assignment)
  if (method === 'manual') return isCompleteManual(assignment)
  // 'roll' is stubbed and can never be complete -- see
  // UNAVAILABLE_ABILITY_SCORE_METHODS.
  return false
}

// The completed six, or null when the assignment is not finished. Callers
// use null as "not ready to save", never as "all zeroes".
export function toAbilityScores(assignment: AbilityScoreAssignment): AbilityScores | null {
  const scores = {} as AbilityScores

  for (const key of ABILITY_KEYS) {
    const value = assignment[key]
    if (typeof value !== 'number') return null
    scores[key] = value
  }

  return scores
}

export function emptyAssignment(): AbilityScoreAssignment {
  return { str: null, dex: null, con: null, int: null, wis: null, cha: null }
}

export function filledAssignment(value: number): AbilityScoreAssignment {
  return { str: value, dex: value, con: value, int: value, wis: value, cha: value }
}

export function toAssignment(scores: AbilityScores): AbilityScoreAssignment {
  return { ...scores }
}

// The starting state for a method a player has not used yet. Point Buy
// starts at its floor (every ability at 8, the full budget unspent), Manual
// at a neutral 10, Standard Array unassigned -- each is that method's own
// natural zero, not a shared default.
export function defaultAssignmentForMethod(method: AbilityScoreMethod): AbilityScoreAssignment {
  if (method === 'point-buy') return filledAssignment(POINT_BUY_MIN)
  if (method === 'manual') return filledAssignment(10)
  return emptyAssignment()
}

// ---------------------------------------------------------------------------
// Carrying work across a method switch
// ---------------------------------------------------------------------------
// This task's own IMPLEMENT section: "Allow switching between methods
// without losing data where reasonable." Two mechanisms, and they are
// different things:
//
//   1. Each method keeps its OWN assignment (the Builder draft holds one per
//      method), so leaving Point Buy and coming back restores exactly what
//      was there. That is unconditional and needs no logic.
//
//   2. The FIRST time a method is opened, it is seeded from what the player
//      has already built elsewhere -- but only when the target method can
//      represent those numbers honestly. That is what `canRepresent` decides,
//      and it is why this is not simply a copy: seeding Point Buy with a
//      manually typed 18 would either silently clamp the player's number or
//      leave the method in a state it says is illegal. When a method cannot
//      represent the current scores, it opens at its own default instead --
//      no data is lost, because the previous method still holds its own.
export function canRepresent(method: AbilityScoreMethod, assignment: AbilityScoreAssignment): boolean {
  if (method === 'roll') return false
  return isCompleteForMethod(method, assignment)
}

export function seedAssignmentForMethod(
  method: AbilityScoreMethod,
  carriedFrom: AbilityScoreAssignment | null
): AbilityScoreAssignment {
  if (carriedFrom && canRepresent(method, carriedFrom)) {
    return { ...carriedFrom }
  }
  return defaultAssignmentForMethod(method)
}

// ---------------------------------------------------------------------------
// Persistence contract
// ---------------------------------------------------------------------------

export type StoredAbilityScores = {
  method: AbilityScoreMethod
  scores: AbilityScores
}

function normalizeMethod(value: unknown): AbilityScoreMethod {
  return ABILITY_SCORE_METHODS.includes(value as AbilityScoreMethod)
    ? (value as AbilityScoreMethod)
    // An unrecognized or absent method degrades to 'manual' rather than
    // rejecting the record: the SCORES are the player's data and must
    // survive; the method is provenance metadata, and "typed in by hand" is
    // the honest fallback for a record whose origin we cannot read.
    : 'manual'
}

// The single server-side validator. Shape and bounds ONLY -- see
// MIN/MAX_STORED_ABILITY_SCORE. It deliberately does NOT re-check that a
// 'point-buy' record is a legal point buy: this task's own PERSISTENCE
// section says "Store exactly what the player entered," and re-litigating a
// creation-time constraint on every write would make a GM's later
// adjustment un-saveable.
//
// Returns null for anything it cannot read as six integers in range, so
// callers reject rather than persist a partial record.
export function normalizeStoredAbilityScores(value: unknown): StoredAbilityScores | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const input = value as Record<string, unknown>
  const rawScores = input.scores

  if (!rawScores || typeof rawScores !== 'object' || Array.isArray(rawScores)) return null

  const source = rawScores as Record<string, unknown>
  const scores = {} as AbilityScores

  for (const key of ABILITY_KEYS) {
    const raw = source[key]
    // Accepts a numeric string ("14") as well as a number: an <input
    // type="number"> round-trip and a JSON body from a non-JS client both
    // legitimately produce one, and coercing here is safer than each caller
    // remembering to.
    const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN

    if (!Number.isInteger(parsed)) return null
    if (parsed < MIN_STORED_ABILITY_SCORE || parsed > MAX_STORED_ABILITY_SCORE) return null

    scores[key] = parsed
  }

  return { method: normalizeMethod(input.method), scores }
}
