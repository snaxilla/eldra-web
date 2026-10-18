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
// to give up 380px, so the same rail overlays the sheet instead).

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

// The last presentation this browser resolved, so a server render on the
// next visit can start in the right one instead of flashing the desktop
// layout on a phone. A hint only -- the measurement always wins.
const PRESENTATION_COOKIE = 'eldra-sheet-presentation'

export function useCharacterSheetPresentation(workspace: Ref<HTMLElement | null>) {
  const hint = useCookie<string | null>(PRESENTATION_COOKIE, { sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  const initial = hint.value === 'companion'
    ? resolveCharacterSheetPresentation(0)
    : resolveCharacterSheetPresentation(DESKTOP_FULL_MIN_WIDTH)

  const presentation = ref<CharacterSheetPresentation>(initial.presentation)
  const density = ref<CharacterSheetDensity>(initial.density)

  function apply(width: number) {
    const next = resolveCharacterSheetPresentation(width)
    presentation.value = next.presentation
    density.value = next.density
    hint.value = next.presentation
  }

  let observer: ResizeObserver | null = null

  // The workspace element only exists once the sheet has loaded, so this
  // follows the ref rather than assuming it is there on mount.
  watch(workspace, (element, _, onCleanup) => {
    if (!element || typeof ResizeObserver === 'undefined') return
    apply(element.getBoundingClientRect().width)
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

  return { presentation, density }
}
