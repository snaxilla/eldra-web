// Character Creator V3 -- the INTEGRATION BOUNDARY for administrator-edited
// creator backgrounds.
//
// The creator consumes exactly one thing: a `CreatorPresentationConfig`
// (app/lib/characters/creator-presentation.ts). This composable is the only
// place that decides where that config comes from today, so a later milestone
// can swap the source without touching a creator component.
//
// WHAT IT READS TODAY (existing mechanisms only, nothing new persisted):
//   - BUILT_IN_CREATOR_PRESENTATION: ships empty of artwork on purpose -- the
//     creator then paints content art from the Content Pack, and a themed
//     gradient where there is none. No artwork is fabricated or bundled.
//   - The World's existing Page Setup backdrop (`world-page-presentation`
//     state, populated by layouts/world-workspace.vue from the existing
//     presentation endpoint) as the "World/theme default" tier. Read-only.
//
// WHAT A LATER MILESTONE PLUGS IN: a durable, admin-editable source (an Admin
// Portal screen backed by whatever storage Eldra standardises on) returning a
// `Partial<CreatorPresentationConfig>`, passed as `adminConfig` below. It must
// serve plain URL strings (never storage-specific ids); see the contract's own
// header. No schema, collection, auth, or storage is introduced here.

import {
  mergeCreatorPresentation,
  type CreatorPresentationConfig
} from '~/lib/characters/creator-presentation'

export const BUILT_IN_CREATOR_PRESENTATION: CreatorPresentationConfig = {
  version: 1,
  transition: { style: 'fade', durationMs: 700 }
}

type WorldPagePresentationState = {
  presentationMode?: string
  backgroundImageUrl?: string | null
  backgroundFileId?: string | null
}

export function useCreatorPresentation(
  adminConfig?: MaybeRefOrGetter<Partial<CreatorPresentationConfig> | null | undefined>
) {
  const pageState = useState<WorldPagePresentationState>('world-page-presentation', () => ({}))

  // The World's own Page Setup backdrop, expressed as the contract's default.
  const worldDefault = computed<Partial<CreatorPresentationConfig> | null>(() => {
    const state = pageState.value
    if (!state || state.presentationMode === 'neutral') return null
    const image = state.backgroundImageUrl
      || (state.backgroundFileId ? `/api/assets/${state.backgroundFileId}` : '')
    return image ? { default: { image: String(image), overlay: 0.25 } } : null
  })

  const config = computed(() =>
    mergeCreatorPresentation(
      mergeCreatorPresentation(BUILT_IN_CREATOR_PRESENTATION, worldDefault.value),
      toValue(adminConfig)
    )
  )

  return { config }
}
