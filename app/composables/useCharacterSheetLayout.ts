// useCharacterSheetLayout -- Character Sheet Beautification Pass, Phase 4
// (see .github/docs/architecture/character-sheet-beauty-pass.md §3.4 "The
// five tabs", §8.3, §11 Phase 4). Owns the two pieces of state every
// region of the new shell needs to agree on: which tab is active, and
// whether the viewport is wide enough for the persistent left/right
// rails (§4, >= 1280px) or narrow enough that rail content must fold
// into its approved tab instead (§3.1: "T1 -- Rail... On smaller screens
// it becomes a T2 tab -- never removed").
//
// Tab state syncs to `?tab=`, the exact pattern
// app/pages/worlds/[id]/entities/[entityId]/sheet.vue (V1) already uses
// (`normalizeSheetTab`/`setSheetTab`, `router.replace` so a default-tab
// visit keeps a clean URL and a tab switch doesn't spam history) -- this
// task explicitly calls for reusing that pattern rather than inventing a
// new one.
//
// `isDesktop` is the one piece of JS-driven (not pure-CSS) responsiveness
// this phase introduces, and deliberately so: everywhere else (nav
// position, grid column count) is plain CSS breakpoint classes, matching
// this codebase's Phase 0 precedent (world-workspace.vue) for avoiding
// hydration mismatches. But rail content that must become tab content on
// narrow screens is DATA-BOUND (CharacterRecoveryPanel, CharacterAbility-
// ScoresPanel, ...) -- rendering it in two places at once via CSS
// visibility toggling would mean two live, independently-stateful
// instances of the same panel, which is a real correctness risk, not a
// cosmetic one (see CharacterSheetShell.vue's own header). A single JS
// boolean deciding WHERE that content mounts avoids the duplication
// entirely. Defaults to `true` for SSR (no `window`); corrected on mount
// via `matchMedia`, same mechanism world-workspace.vue's own breakpoint
// watcher already established.

export type CharacterSheetTabKey = 'play' | 'character' | 'spells' | 'inventory' | 'notes'

export type CharacterSheetTab = {
  key: CharacterSheetTabKey
  label: string
  icon: string
}

// Icons match §7.5's vocabulary exactly (i-lucide-swords Play/attack,
// i-lucide-user Character, i-lucide-sparkles Spells, i-lucide-backpack
// Inventory, i-lucide-notebook-pen Notes).
//
// ORDER AND LABELS -- Desktop IA pass. Reordered and relabelled to match
// the tab order a 5e player already has muscle memory for (Actions,
// Spells, Inventory, Features, Notes). The `play` KEY is deliberately
// unchanged behind its new "Actions" label: `?tab=play` is a URL other
// people may already have bookmarked or shared, and renaming a route
// vocabulary to match a label change would break those for nothing. The
// same applies to `character`, whose tab now holds what the reference
// sheet calls Features & Traits.
export const CHARACTER_SHEET_TABS: readonly CharacterSheetTab[] = [
  { key: 'play', label: 'Actions', icon: 'i-lucide-swords' },
  { key: 'spells', label: 'Spells', icon: 'i-lucide-sparkles' },
  { key: 'inventory', label: 'Inventory', icon: 'i-lucide-backpack' },
  { key: 'character', label: 'Character', icon: 'i-lucide-user' },
  { key: 'notes', label: 'Notes', icon: 'i-lucide-notebook-pen' }
]

// ---------------------------------------------------------------------------
// CONTEXT SELECTION -- WHAT THE SHARED DRAWER IS CURRENTLY SHOWING
// ---------------------------------------------------------------------------
// §8.3 assigns "drawer stack" to this composable, so the SELECTION lives
// here; the drawer COMPONENT is still mounted by the page, exactly as every
// other WorldEntityContextDrawer consumer in the app mounts its own.
//
// One payload shape for all five selectable things. Each field maps onto a
// prop the existing drawer already renders (title, eyebrow, detail lines,
// summary, chips, image), which is what let the Character Sheet adopt
// Eldra's one context system instead of growing a private drawer.
//
// Every field is already-resolved data handed over by a panel -- there is
// no fetch here, and nothing in this file reads `derived`, the catalogue,
// or a Content Pack.
export type CharacterSheetContextKind = 'action' | 'spell' | 'item' | 'feature' | 'skill'

export type CharacterSheetContext = {
  kind: CharacterSheetContextKind
  id: string
  title: string
  eyebrow: string
  detailLines?: string[]
  summary?: string
  tags?: string[]
  imageUrl?: string | null
}

const DEFAULT_TAB: CharacterSheetTabKey = 'play'

export function normalizeCharacterSheetTab(value: unknown): CharacterSheetTabKey {
  const tab = String(Array.isArray(value) ? value[0] : value || DEFAULT_TAB)
  return CHARACTER_SHEET_TABS.some((option) => option.key === tab) ? (tab as CharacterSheetTabKey) : DEFAULT_TAB
}

export function useCharacterSheetLayout() {
  const route = useRoute()
  const router = useRouter()

  const activeTab = computed<CharacterSheetTabKey>(() => normalizeCharacterSheetTab(route.query.tab))

  function setActiveTab(tab: CharacterSheetTabKey) {
    router.replace({
      path: route.path,
      query: {
        ...route.query,
        tab: tab === DEFAULT_TAB ? undefined : tab
      }
    })
  }

  const isDesktop = ref(true)
  let desktopQuery: MediaQueryList | null = null

  function onDesktopQueryChange(query: MediaQueryList | MediaQueryListEvent) {
    isDesktop.value = query.matches
  }

  onMounted(() => {
    if (!import.meta.client) return
    desktopQuery = window.matchMedia('(min-width: 1280px)')
    onDesktopQueryChange(desktopQuery)
    desktopQuery.addEventListener('change', onDesktopQueryChange)
  })

  onBeforeUnmount(() => {
    desktopQuery?.removeEventListener('change', onDesktopQueryChange)
  })

  // ---------------------------------------------------------------------
  // Context drawer selection
  // ---------------------------------------------------------------------

  const context = ref<CharacterSheetContext | null>(null)

  function openContext(next: CharacterSheetContext) {
    context.value = next
  }

  function closeContext() {
    context.value = null
  }

  // The shape WorldEntityContextDrawer already consumes. Mapping here (not
  // in the page) keeps the page a layout wiring file and keeps every
  // panel's `select` payload in Character Sheet vocabulary rather than
  // entity-drawer vocabulary.
  const contextEntity = computed(() => {
    const current = context.value
    if (!current) return null

    return {
      id: current.id,
      title: current.title,
      displayType: current.eyebrow,
      entityType: current.kind,
      detailLines: current.detailLines ?? [],
      summary: current.summary ?? '',
      tags: current.tags ?? [],
      image: current.imageUrl ?? ''
    }
  })

  return {
    tabs: CHARACTER_SHEET_TABS,
    activeTab,
    setActiveTab,
    isDesktop,
    context,
    contextEntity,
    openContext,
    closeContext
  }
}
