// D&D 2024 Character Rules P3.4 -- shared test fixture builder.
//
// A class with real `spellRequirements` (8 of the 12 XPHB classes) is used throughout the
// progression mechanics test suite as a REAL-fixture convenience class for UNRELATED mechanics
// (Wizard's Scholar/subclass choice, Paladin/Ranger's Fighting Style, the generic ASI/feat
// authority, the all-class subclass contract, the Level 1-20 acceptance walk). P3.4 wires a real,
// server-authoritative spell acquisition gate into `planProgression`/`confirmProgression`'s own
// `plan.valid` -- a caster class fixture with no persisted spell state would now be spuriously
// blocked by a requirement these tests have nothing to do with, exactly the "Wizard used as a
// convenience fixture" regression P3.3 already hit and fixed in create-v2-fighter-mechanics.test.ts.
// This is the identical remediation, generalized to any class's own real spellRequirements rather
// than re-derived per file.
//
// `fullySatisfyingSpellState` returns a persisted `AssembledSpellEntry[]` that makes EVERY one of a
// class's own real SpellRequirements satisfied at `targetLevel` -- cantrip/arcanum (exact, by their
// own declared level), a bounded `spell` pool (exact, membership-gated where `requiresMembershipPool`
// names a `spellbook` pool), and `spellbook` itself (cumulative minimum). Two passes, mirroring
// `evaluateRequirements`'s own documented order: independent requirements first, then
// membership-dependent ones, which ADD their own flag/tag onto an ALREADY-GENERATED pool-1 entry
// (Wizard's real "prepare FROM your spellbook" rule) rather than creating a second, unrelated
// physical row -- the same merge-by-identity discipline the real write path already uses.

import { flagFor } from '../../app/lib/characters/spell-requirements'
import type { SpellRequirement } from '../../app/lib/content-rules/types'
import type { AssembledSpellEntry } from '../../app/lib/characters/spellcasting'

const FIXTURE_PACKAGE_ID = 'eldra.content.xphb'

function spellEntry(slug: string, level: number, known: boolean, prepared: boolean, requirementIds: string[]): AssembledSpellEntry {
  return {
    instanceId: `fixture-${slug}`,
    ref: { packageId: FIXTURE_PACKAGE_ID, slug },
    known,
    prepared,
    requirementIds,
    status: 'resolved',
    title: slug,
    entry: {
      packageId: FIXTURE_PACKAGE_ID,
      packageVersion: '1.0.0',
      title: slug,
      slug,
      spellMechanics: {
        level,
        classLists: ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'],
        concentration: false,
        ritual: false,
        resolution: null
      }
    }
  }
}

export function fullySatisfyingSpellState(
  requirements: readonly SpellRequirement[],
  targetLevel: number
): AssembledSpellEntry[] {
  const entriesByRequirement = new Map<string, AssembledSpellEntry[]>()

  // Pass 1: every requirement with no membership dependency (cantrip, arcanum, and a non-Wizard
  // `spell` pool). Level 1 for a gated (`spell`/`spellbook`) pool is legal at every real target level
  // (the lowest real caster slot column, see this file's own header); cantrip/arcanum use the
  // requirement's own exact declared level.
  for (const requirement of requirements) {
    if (requirement.requiresMembershipPool) continue
    const target = requirement.totalByLevel[targetLevel - 1] ?? 0
    const flag = flagFor(requirement.pool)
    const level = requirement.pool === 'cantrip' || requirement.pool === 'arcanum' ? (requirement.filter.level ?? 0) : 1
    const generated: AssembledSpellEntry[] = []
    for (let i = 0; i < target; i++) {
      generated.push(spellEntry(`${requirement.id}-${i}`, level, flag === 'known', flag === 'prepared', [requirement.id]))
    }
    entriesByRequirement.set(requirement.id, generated)
  }

  // Pass 2: membership-dependent requirements (Wizard's own `spell` pool) -- reuse the referenced
  // pool's own already-generated entries, adding THIS requirement's own flag/tag onto them, never a
  // second, unrelated physical row for the same identity.
  for (const requirement of requirements) {
    const poolId = requirement.requiresMembershipPool
    if (!poolId) continue
    const poolEntries = entriesByRequirement.get(poolId) ?? []
    const target = requirement.totalByLevel[targetLevel - 1] ?? 0
    const flag = flagFor(requirement.pool)
    for (let i = 0; i < Math.min(target, poolEntries.length); i++) {
      const entry = poolEntries[i]!
      if (flag === 'known') entry.known = true
      else entry.prepared = true
      entry.requirementIds = [...new Set([...(entry.requirementIds ?? []), requirement.id])]
    }
  }

  return [...entriesByRequirement.values()].flat()
}
