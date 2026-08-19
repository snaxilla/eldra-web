// Source Collection Provider registration -- static, not discovered. See
// .github/docs/architecture/content-source-architecture.md §6.6: Nitro
// bundles the server, so a scanned-directory provider list works in
// `pnpm dev` and silently vanishes in the production container -- the
// exact class of failure that left `scene_layer_objects` missing in
// production for weeks (ownership-and-permissions.md's Deployment
// Checklist). A one-line array edit here is the deliberate cost of
// avoiding that.
//
// SRD 5.1 is the only entry -- this step implements no other provider.
// getProvider/listProviders are not called by anything yet (the three
// SRD routes still import `srd51Provider` directly, since generic
// key-driven routing is explicitly out of scope for this step); they
// exist because the architecture doc's own Step 2 file list names this
// module, and Step 3's generic routes are the first real caller.

import { srd51Provider } from './dnd5e/srd-5-1'
import type { SourceCollectionProvider } from './types'

const PROVIDERS: readonly SourceCollectionProvider[] = [srd51Provider]

export function getProvider(gameSystemKey: string, collectionKey: string): SourceCollectionProvider | undefined {
  return PROVIDERS.find((provider) => provider.gameSystemKey === gameSystemKey && provider.collectionKey === collectionKey)
}

export function listProviders(): readonly SourceCollectionProvider[] {
  return PROVIDERS
}
