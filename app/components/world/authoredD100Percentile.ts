// authoredD100Percentile -- pure presentation mapping from ONE
// authoritative 1d100 result to the conventional two-physical-d10
// tabletop percentile presentation (a "tens" die and a "ones" die). Roll
// System Phase 4C.
//
// SERVER SEMANTICS UNCHANGED. `WorldManualDiceRack`'s d100 control sends
// a literal `1d100` expression -- OpenDice/server authority validates and
// rolls it exactly as written, producing ONE `RollDieGroup` with
// `sides: 100` and a single `results[0]` in 1-100. Nothing here rolls a
// second die, generates a second random value, or changes that contract
// in any way -- this module ONLY computes how to DISPLAY that one
// already-decided value using two authored d10 dice (authoredD10Three.ts,
// reused unchanged), which is a strictly presentational decomposition.
//
// CONVENTIONAL PERCENTILE-DICE SEMANTICS (researched, not guessed -- no
// existing project convention was found; this is the standard tabletop
// reading two d10s together, one printed 00/10/20.../90, the other 0-9):
//   tens = floor((value-1)/10) * 10 wrapped so that value=100 -> tens=0
//   ones = value mod 10, wrapped so that value=100 -> ones=0
// Both formulas reduce to the SAME closed form for every value 1-100:
//   tens = (Math.floor(value/10) * 10) % 100
//   ones = value % 10
// The special case every percentile-dice player already knows -- a
// displayed "00"+"0" is read as 100, never as 0 -- falls out of this
// formula for free (value=100 -> tens=0,ones=0) and needs no extra branch
// here; it is a READING convention, not a computation.
export type D100PercentileDigits = {
  tens: number // 0,10,20,...,90 -- the value printed on the tens die (0 means "00")
  ones: number // 0-9 -- the value printed on the ones die
}

export function percentileDigitsForD100(value: number): D100PercentileDigits {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new RangeError(`percentileDigitsForD100: ${value} is outside the authoritative 1-100 domain`)
  }
  return {
    tens: (Math.floor(value / 10) * 10) % 100,
    ones: value % 10
  }
}

// The label printed on the tens die's face for a given `tens` digit
// (0,10,...,90) -- "00" for zero (matching the tens die's own physical
// printing convention: it never shows a bare "0", to stay visually
// distinct from the ones die).
export function tensDieLabel(tens: number): string {
  return tens === 0 ? '00' : String(tens)
}

// The label printed on the ones die's face -- identical to
// authoredD10Three.ts's own standalone-d10 labeling (0-9 shown as-is).
export function onesDieLabel(ones: number): string {
  return String(ones)
}
