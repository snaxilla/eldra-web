// 5etools Monster Importer -> Content Pack Publication Adapter.
//
// Sibling to content-pack-5etools-adapter.ts, not a replacement for it.
// That adapter's `toContentPublicationCandidate` assumes its input already
// satisfies `EldraImportPreviewEntity` (systemKey/entityType/title/slug/
// externalId/provider/sourceBook/sourcePage/blocks/raw) -- true for the six
// preview5eTools{Species,Classes,Backgrounds,Feats,Items,Spells} importers,
// false for preview5eToolsMonsters. That importer instead returns a bespoke
// shape per item: no `externalId`, no top-level `raw` (the untouched
// 5etools JSON lives at `_monsterData.monsterProfile.raw_payload_json`
// instead, alongside `_monsterData.statblock`/`.actions`, which are World
// entity_statblocks/monster_profiles/entity_actions PERSISTENCE
// instructions -- see server/utils/import-save-monsters.ts -- not content).
//
// This adapter is the ONE place that knows both shapes, exactly the role
// content-pack-5etools-adapter.ts's own header describes for itself. It
// does NOT change preview5eToolsMonsters (a redesign this task's own
// IMPORTANT section forbids) and does NOT touch content-pack-publishing.ts,
// which stays ignorant that a monster importer -- or any importer -- exists.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS (mirrors content-pack-5etools-adapter.ts's own)
// ---------------------------------------------------------------------------
// 1. `data` is the untouched upstream 5etools monster JSON
//    (`_monsterData.monsterProfile.raw_payload_json`, identical to
//    `_monsterData.statblock.raw_payload_json` -- both are `monster ?? null`
//    from the importer, so either works; monsterProfile's is used since
//    sourceBook/sourcePage are already normalized there too). `blocks`,
//    `summary`, and `_monsterData` itself are discarded entirely, same as
//    `blocks` is discarded for every other category.
//
// 2. `externalId` is synthesized here because preview5eToolsMonsters never
//    produces one -- `${name}__${source}`, the SAME convention
//    5etools-species.ts/5etools-classes.ts/5etools-backgrounds.ts/
//    5etools-feats.ts/5etools-spells.ts already use (5etools-items.ts's
//    `${importKind}__${name}__${source}` is the one outlier, and monsters
//    have no importKind concept). This is the majority convention, not an
//    invented one.
//
// 3. `entityType` passes through unchanged as `'enemy'` (preview5eToolsMonsters'
//    own literal) -- this task's own DECISIONS explicitly defer the
//    'enemy'/'monster' registry-naming mismatch; an adapter is not the
//    place to resolve it, and identity/provenance fields map across
//    unchanged per the sibling adapter's own design decision 2.
//
// 4. Pure, no I/O -- calls preview5eToolsMonsters (already pure) and
//    transforms its output; never reads DATA_ROOT itself. Bestiary/fluff
//    file access stays entirely in 5etools-dataset.ts's loadMonsterDatasetEntries.

import { preview5eToolsMonsters } from '../../app/lib/importers/5etools-monsters'
import type { ContentPublicationCandidate } from './content-pack-publishing'

export function toMonsterContentPublicationCandidates(monsterRows: any[]): {
  candidates: ContentPublicationCandidate[]
  warnings: string[]
} {
  const preview = preview5eToolsMonsters(monsterRows)
  const candidates: ContentPublicationCandidate[] = []
  const warnings = [...preview.warnings]

  for (const item of preview.items as any[]) {
    const monsterProfile = item?._monsterData?.monsterProfile
    const raw = monsterProfile?.raw_payload_json

    if (!raw || typeof raw !== 'object') {
      warnings.push(`Skipped '${item?.title || '(untitled)'}': no source data to publish.`)
      continue
    }

    const sourceBook = monsterProfile?.source ? String(monsterProfile.source) : undefined
    const sourcePage = monsterProfile?.page != null ? String(monsterProfile.page) : undefined

    candidates.push({
      systemKey: item.systemKey,
      entityType: item.entityType,
      title: item.title,
      slug: item.slug,
      externalId: `${item.title}__${sourceBook || 'unknown'}`,
      provider: '5etools-json',
      sourceBook,
      sourcePage,
      data: raw
    })
  }

  return { candidates, warnings }
}
