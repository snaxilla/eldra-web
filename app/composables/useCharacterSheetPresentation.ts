// useCharacterSheetPresentation -- Phase 4C. Which of the V2 Character
// Sheet's two first-class presentations to render:
//
//   desktop    the dense workspace: header, reference columns, tabbed main
//              workspace, Eldra's contextual right rail
//   companion  the touch-first sheet: compact identity/HP, section
//              navigation, one section at a time, bottom-sheet details
//
// Both render the same components over the same data (useCharacterSheet,
// the mutation composables, the roll pipeline); this decides layout only.
//
// MEASURED ON THE CHARACTER WORKSPACE, NOT THE VIEWPORT. The width is the
// page's scroll root -- the space the World workspace actually gives the
// sheet after its own navigation rail -- read as the element's border box.
// The inspector's contraction is padding INSIDE that box, so opening or
// closing the inspector never changes the measured width and never
// switches presentation mid-interaction.
//
// Desktop has two densities: `full` (the inspector opens as the workspace
// right rail and the sheet contracts beside it) and `compact` (too narrow
// to give up 380px, so the inspector opens as a bottom sheet instead and
// nothing covers the gameplay columns).

import type { Ref } from 'vue'

export type CharacterSheetPresentation = 'desktop' | 'companion'
export type CharacterSheetDensity = 'full' | 'compact'

export type CharacterSheetPresentationState = {
  presentation: CharacterSheetPresentation
  density: CharacterSheetDensity
}

export const DESKTOP_FULL_MIN_WIDTH = 1280
export const DESKTOP_MIN_WIDTH = 800

export function resolveCharacterSheetPresentation(workspaceWidth: number): CharacterSheetPresentationState {
  if (workspaceWidth >= DESKTOP_FULL_MIN_WIDTH) return { presentation: 'desktop', density: 'full' }
  if (workspaceWidth >= DESKTOP_MIN_WIDTH) return { presentation: 'desktop', density: 'compact' }
  return { presentation: 'companion', density: 'compact' }
}

// NO GUESSING (Phase 4C). The server cannot know the workspace width, and
// guessing one means a phone briefly shows the desktop sheet. Instead
// `resolved` starts false -- identically on the server and in the first
// client render, so hydration matches -- and the page shows a neutral
// placeholder until the first measurement, taken as soon as the workspace
// element mounts. From then on the presentation follows the measurement.
export function useCharacterSheetPresentation(workspace: Ref<HTMLElement | null>) {
  const presentation = ref<CharacterSheetPresentation>('desktop')
  const density = ref<CharacterSheetDensity>('full')
  const resolved = ref(false)

  function apply(width: number) {
    const next = resolveCharacterSheetPresentation(width)
    presentation.value = next.presentation
    density.value = next.density
    resolved.value = true
  }

  let observer: ResizeObserver | null = null

  // The workspace element only exists once the page has rendered, so this
  // follows the ref rather than assuming it is there on mount.
  watch(workspace, (element, _, onCleanup) => {
    if (!element) return
    apply(element.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    observer = new ResizeObserver(([entry]) => {
      const box = entry?.borderBoxSize?.[0]
      apply(box ? box.inlineSize : element.getBoundingClientRect().width)
    })
    observer.observe(element)
    onCleanup(() => {
      observer?.disconnect()
      observer = null
    })
  }, { immediate: true, flush: 'post' })

  onBeforeUnmount(() => observer?.disconnect())

  return { presentation, density, resolved }
}
