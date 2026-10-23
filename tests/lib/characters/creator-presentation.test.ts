import { describe, expect, it } from 'vitest'
import {
  focalObjectPosition,
  mergeCreatorPresentation,
  resolveCreatorBackdrop,
  resolveCreatorTransition,
  stageHeroKind,
  type CreatorPresentationConfig
} from '../../../app/lib/characters/creator-presentation'

const config: CreatorPresentationConfig = {
  version: 1,
  default: { image: '/world.jpg', overlay: 0.2 },
  stages: { spells: { image: '/stage-spells.jpg', focalX: 0.2 } },
  species: { aasimar: { image: '/cfg-aasimar.jpg', focalX: 0.3, focalY: 0.1 } },
  classes: { druid: { image: '/cfg-druid.jpg' } },
  overrides: [
    { kind: 'class', slug: 'druid', image: '/ovr-druid-any.jpg' },
    { kind: 'class', slug: 'druid', stage: 'spells', image: '/ovr-druid-spells.jpg', overlay: 0.6 }
  ]
}

const sel = {
  species: { slug: 'aasimar', imageUrl: '/art-aasimar.png' },
  class: { slug: 'druid', imageUrl: '/art-druid.png' },
  background: { slug: 'sailor', imageUrl: '/art-sailor.png' }
}

describe('resolveCreatorBackdrop precedence', () => {
  it('prefers a stage-specific override over a stage-agnostic one', () => {
    const r = resolveCreatorBackdrop(config, 'spells', sel)
    expect(r.image).toBe('/ovr-druid-spells.jpg')
    expect(r.source).toBe('override')
    expect(r.overlay).toBe(0.6)
  })

  it('falls to a stage-agnostic override where no stage-specific one exists', () => {
    const r = resolveCreatorBackdrop(config, 'class', sel)
    expect(r.image).toBe('/ovr-druid-any.jpg')
    expect(r.source).toBe('override')
  })

  it('uses configured content art before the content pack art', () => {
    const r = resolveCreatorBackdrop({ ...config, overrides: [] }, 'identity', sel)
    expect(r.image).toBe('/cfg-aasimar.jpg')
    expect(r.source).toBe('configured')
    expect(r.focalX).toBe(0.3)
    expect(r.focalY).toBe(0.1)
  })

  it('uses the selected content art when nothing is configured', () => {
    const r = resolveCreatorBackdrop({ version: 1 }, 'background', sel)
    expect(r.image).toBe('/art-sailor.png')
    expect(r.source).toBe('content-art')
  })

  it('walks the stage focus order on later stages (class, then background, then species)', () => {
    const r = resolveCreatorBackdrop({ version: 1 }, 'review', { species: sel.species, background: sel.background })
    expect(r.image).toBe('/art-sailor.png')
  })

  it('falls back to the stage tier, then the default tier, then no image', () => {
    const none = { species: null, class: null, background: null }
    expect(resolveCreatorBackdrop(config, 'spells', none)).toMatchObject({ image: '/stage-spells.jpg', source: 'stage' })
    expect(resolveCreatorBackdrop(config, 'abilities', none)).toMatchObject({ image: '/world.jpg', source: 'default' })
    expect(resolveCreatorBackdrop({ version: 1 }, 'abilities', none)).toMatchObject({ image: null, source: 'fallback', key: 'fallback' })
    expect(resolveCreatorBackdrop(null, 'identity', {})).toMatchObject({ image: null, source: 'fallback' })
  })

  it('is deterministic: identical inputs give identical output', () => {
    expect(resolveCreatorBackdrop(config, 'class', sel)).toEqual(resolveCreatorBackdrop(config, 'class', sel))
  })

  it('does not let selections outside the stage focus change the backdrop', () => {
    const a = resolveCreatorBackdrop({ version: 1 }, 'class', { species: sel.species })
    expect(a.source).toBe('fallback')
  })
})

describe('resolveCreatorBackdrop robustness', () => {
  it('skips an image the browser failed to load and degrades to the next tier', () => {
    const failed = new Set(['/ovr-druid-spells.jpg', '/ovr-druid-any.jpg'])
    expect(resolveCreatorBackdrop(config, 'spells', sel, { failedUrls: failed }).image).toBe('/cfg-druid.jpg')
    failed.add('/cfg-druid.jpg')
    failed.add('/art-druid.png')
    expect(resolveCreatorBackdrop(config, 'spells', sel, { failedUrls: failed }).source).toBe('stage')
  })

  it('ignores blank image strings and inherits style from artwork-less tiers', () => {
    const r = resolveCreatorBackdrop(
      { version: 1, stages: { class: { image: '  ', overlay: 0.4 } }, default: { image: '/d.jpg' } },
      'class',
      {}
    )
    expect(r.image).toBe('/d.jpg')
    expect(r.overlay).toBe(0.4)
  })

  it('clamps focal point and overlay into 0..1', () => {
    const r = resolveCreatorBackdrop({ version: 1, default: { image: '/d.jpg', focalX: 4, focalY: -2, overlay: 9 } }, 'review', {})
    expect([r.focalX, r.focalY, r.overlay]).toEqual([1, 0, 1])
    expect(focalObjectPosition(r)).toBe('100% 0%')
  })
})

describe('transition + merge + hero', () => {
  it('normalises the transition preference', () => {
    expect(resolveCreatorTransition(undefined)).toEqual({ enabled: true, durationMs: 700 })
    expect(resolveCreatorTransition({ version: 1, transition: { style: 'none' } })).toEqual({ enabled: false, durationMs: 0 })
    expect(resolveCreatorTransition({ version: 1, transition: { durationMs: 99999 } }).durationMs).toBe(2000)
    expect(resolveCreatorTransition({ version: 1, transition: { durationMs: 0 } }).enabled).toBe(false)
  })

  it('merges a patch over a base tier by tier, patch overrides first', () => {
    const merged = mergeCreatorPresentation(config, {
      default: { image: '/new.jpg' },
      classes: { wizard: { image: '/w.jpg' } },
      overrides: [{ kind: 'class', slug: 'druid', image: '/patched.jpg' }]
    })
    expect(merged.default?.image).toBe('/new.jpg')
    expect(merged.classes).toMatchObject({ druid: { image: '/cfg-druid.jpg' }, wizard: { image: '/w.jpg' } })
    expect(merged.stages?.spells?.image).toBe('/stage-spells.jpg')
    expect(resolveCreatorBackdrop(merged, 'class', sel).image).toBe('/patched.jpg')
    expect(mergeCreatorPresentation(config, null)).toBe(config)
  })

  it('names the hero content for each stage', () => {
    expect(stageHeroKind('identity')).toBe('species')
    expect(stageHeroKind('class')).toBe('class')
    expect(stageHeroKind('background')).toBe('background')
    expect(stageHeroKind('spells')).toBe('class')
  })
})
