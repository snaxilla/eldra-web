// Source Collection Provider registration -- static, not discovered. See
// .github/docs/architecture/content-source-architecture.md §6.6: Nitro
// bundles the server, so a scanned-directory provider list works in
// `pnpm dev` and silently vanishes in the production container -- the
// exact class of failure that left `scene_layer_objects` missing in
// production for weeks (ownership-and-permissions.md's Deployment
// Checklist). A one-line array edit here is the deliberate cost of
// avoiding that.
//
// Registering a new Source Collection is exactly this: one import and one
// array entry. `xphbProvider` (Player's Handbook 2024) was added as the
// architecture's own acceptance test (§12 Step 8) and required no change
// to this module beyond those two lines -- getProvider/listProviders,
// both generic routes, the preview builder, the publish orchestrator, and
// the Builder are all untouched by it. `xdmgProvider` (Dungeon Master's
// Guide 2024) is the second acceptance test and required the same two
// lines, nothing more -- see xdmg.ts's own header for why its category
// list is shorter than XPHB's (one populated category, measured against
// the dataset, not five artificial empty ones). `xmmProvider` (Monster
// Manual 2025) is the third -- again the same two lines, and the first
// collection to actually declare a 'monsters' category (via xmm.ts's own
// `loadCandidates` hook), proving Monster Content Publication integrates
// here exactly like every other category.

import { srd51Provider } from './dnd5e/srd-5-1'
import { xdmgProvider } from './dnd5e/xdmg'
import { xmmProvider } from './dnd5e/xmm'
import { xphbProvider } from './dnd5e/xphb'
import type { SourceCollectionProvider } from './types'

const PROVIDERS: readonly SourceCollectionProvider[] = [srd51Provider, xphbProvider, xdmgProvider, xmmProvider]

export function getProvider(gameSystemKey: string, collectionKey: string): SourceCollectionProvider | undefined {
  return PROVIDERS.find((provider) => provider.gameSystemKey === gameSystemKey && provider.collectionKey === collectionKey)
}

export function listProviders(): readonly SourceCollectionProvider[] {
  return PROVIDERS
}
