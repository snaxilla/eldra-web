// GET /api/content-packs
// Metadata listing of installed, published Content Packs -- mirrors
// server/api/rules-packages/index.get.ts exactly. Envelope columns only;
// never manifest or content.
//
// Thin by design, matching every other route in this milestone: all logic
// lives in and is tested against server/utils/content-packs.ts
// (listPublishedContentPacks) -- this file performs no I/O of its own.

import { listPublishedContentPacks } from '../../utils/content-packs'

export default defineEventHandler(async () => {
  const packages = await listPublishedContentPacks()
  return { packages }
})
