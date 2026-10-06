// PHASE 2C.3A -- the Builder's view of creation availability, read from the REAL
// Background facets. The picker disables an option exactly when this returns a
// reason; create-v2 POST refuses the same selection on the server regardless.

import { describe, expect, it } from 'vitest'
import { creationUnavailableReason } from '../../../../app/components/characters/builder/characterBuilderSelection'
import { findRulesFacet } from '../../../../app/lib/content-rules'

const slugOf = (name: string) => `${name.toLowerCase().replace(/ /g, '-')}-xphb`
const entryOf = (name: string) => ({
  packageId: 'eldra.solaris.xphb',
  slug: slugOf(name),
  rulesFacet: findRulesFacet('dnd5e.2024', 'background', slugOf(name)) ?? undefined
})

// P1: Artisan, Entertainer, Charlatan, Noble, and Scribe have a representable Origin feat, so the
// package no longer authors an Origin-feat reason for them. Their remaining blockers (ability bonus,
// equipment, Weapon Mastery) come from the completeness authority, not from this facet field.
const SUPPORTED = ['Criminal', 'Guard', 'Farmer', 'Hermit', 'Merchant', 'Wayfarer', 'Sailor', 'Soldier', 'Artisan', 'Entertainer', 'Charlatan', 'Noble', 'Scribe']
const BLOCKED = ['Acolyte', 'Guide', 'Sage']

describe('Builder availability -- visible, disabled, with a reason', () => {
  it.each(SUPPORTED)('%s is selectable (no unavailable reason)', (name) => {
    expect(creationUnavailableReason(entryOf(name))).toBeNull()
  })

  it.each(BLOCKED)('%s is unavailable with a concise, user-facing reason', (name) => {
    const reason = creationUnavailableReason(entryOf(name))
    expect(reason).toBeTruthy()
    expect(reason).toMatch(/^Its Origin Feat \(/)
    expect(reason).not.toMatch(/ENGINE_BLOCKED|CONTENT_BLOCKED|:\w+\.\w+/)
  })

  it('an entry with no facet at all is available, never blocked by absence', () => {
    expect(creationUnavailableReason({ rulesFacet: undefined })).toBeNull()
    expect(creationUnavailableReason(null)).toBeNull()
  })
})
