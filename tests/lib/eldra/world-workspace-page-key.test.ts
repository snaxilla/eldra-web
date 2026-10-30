// Unit tests for app/lib/eldra/world-workspace-page-key.ts -- Map-Only
// Navigation Controls fix. This is the one route-identity rule
// WorldWorkspaceSidebar.vue's `isMapPage` prop (passed down from
// world-workspace.vue's own `isFullBleedMap`) is built on, so these tests
// are the route-to-control-visibility rule itself: `resolveWorldWorkspacePageKey(path)
// === 'world-map'` is exactly when Play/Build and Hide/Show Pins should be
// visible.
//
// No component-mounting/browser harness exists in this repo (vitest.config.ts
// runs in a Node, not DOM, environment; no Playwright/Cypress/Storybook
// config exists anywhere) -- this is the full extent of automated coverage
// available for this fix. See this task's own final report for that
// limitation stated plainly.

import { describe, expect, it } from 'vitest'
import { resolveWorldWorkspacePageKey } from '../../../app/lib/eldra/world-workspace-page-key'

describe('resolveWorldWorkspacePageKey', () => {
  it('resolves the bare World Map route to "world-map" -- the one surface Play/Build and Hide/Show Pins must stay visible on', () => {
    expect(resolveWorldWorkspacePageKey('/worlds/5')).toBe('world-map')
    expect(resolveWorldWorkspacePageKey('/worlds/5/')).toBe('world-map')
  })

  it('does NOT resolve the map gallery/upload page to "world-map" -- it contains "maps" but renders no pins and reads no build-mode state', () => {
    expect(resolveWorldWorkspacePageKey('/worlds/5/maps')).toBe('maps')
    expect(resolveWorldWorkspacePageKey('/worlds/5/maps')).not.toBe('world-map')
  })

  it('resolves every other content-browser/world page to its own, non-"world-map" key', () => {
    expect(resolveWorldWorkspacePageKey('/worlds/5/classes')).toBe('classes')
    expect(resolveWorldWorkspacePageKey('/worlds/5/spells')).toBe('spells')
    expect(resolveWorldWorkspacePageKey('/worlds/5/species')).toBe('species')
    expect(resolveWorldWorkspacePageKey('/worlds/5/items')).toBe('items')
    expect(resolveWorldWorkspacePageKey('/worlds/5/enemies')).toBe('enemies')
    expect(resolveWorldWorkspacePageKey('/worlds/5/feats')).toBe('feats')
    expect(resolveWorldWorkspacePageKey('/worlds/5/overview')).toBe('overview')
    expect(resolveWorldWorkspacePageKey('/worlds/5/admin')).toBe('admin')
    expect(resolveWorldWorkspacePageKey('/worlds/5/characters')).toBe('characters')
    expect(resolveWorldWorkspacePageKey('/worlds/5/locations')).toBe('locations')
    expect(resolveWorldWorkspacePageKey('/worlds/5/timelines')).toBe('timelines')
  })

  it('preserves the existing entity-article and character-sheet special cases unchanged', () => {
    expect(resolveWorldWorkspacePageKey('/worlds/5/entities/42')).toBe('entity-article')
    expect(resolveWorldWorkspacePageKey('/worlds/5/characters/42/sheet')).toBe('character-sheet')
    expect(resolveWorldWorkspacePageKey('/worlds/5/characters/42/sheet-v2')).toBe('character-sheet')
    // Every other /characters/** route keeps the generic 'characters' key.
    expect(resolveWorldWorkspacePageKey('/worlds/5/characters/42/builder')).toBe('characters')
  })

  it('falls back to "global" for a path with no /worlds/ segment at all', () => {
    expect(resolveWorldWorkspacePageKey('/')).toBe('global')
    expect(resolveWorldWorkspacePageKey('/admin')).toBe('global')
  })
})
