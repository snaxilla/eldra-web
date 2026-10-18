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

import type { Ref } from 'vue'

// ---------------------------------------------------------------------------
// SECTIONS -- Phase 4B. Supersedes the five fixed tabs.
// ---------------------------------------------------------------------------
// The sheet is a set of SECTIONS. Two are reference sections (Stats,
// Skills): on desktop/tablet they are always-visible columns, and only on
// a phone do they become sections you switch to. The rest are MAIN
// sections: the tabbed workspace on wider screens, one-at-a-time on a
// phone. Which sections exist for a character is decided by the page from
// what the package/character actually provides (no Spells for a
// non-caster, no Skills for a package without a skills category) --
// `availableCharacterSheetSections` only filters this ordered list.
//
// Order is the D&D-first priority the phone nav reads left to right:
// Stats, Actions, Spells, Inventory, then the rest. Skills sits beside
// Stats in the reference columns; on a phone it is folded into Stats (see
// CharacterSheetShell.vue) and also reachable directly from More.
export type CharacterSheetSectionKey =
  | 'stats'
  | 'skills'
  | 'actions'
  | 'spells'
  | 'inventory'
  | 'features'
  | 'notes'
  | 'details'

// Kept as an alias so existing consumers of the old name keep compiling.
export type CharacterSheetTabKey = CharacterSheetSectionKey

export type CharacterSheetSection = {
  key: CharacterSheetSectionKey
  label: string
  // Phone nav label, when the full label is too long for a direct button.
  shortLabel?: string
  icon: string
  placement: 'reference' | 'main'
}

export type CharacterSheetTab = CharacterSheetSection

export const CHARACTER_SHEET_SECTIONS: readonly CharacterSheetSection[] = [
  { key: 'stats', label: 'Stats', icon: 'i-lucide-activity', placement: 'reference' },
  { key: 'actions', label: 'Actions', icon: 'i-lucide-swords', placement: 'main' },
  { key: 'spells', label: 'Spells', icon: 'i-lucide-sparkles', placement: 'main' },
  { key: 'inventory', label: 'Inventory', shortLabel: 'Gear', icon: 'i-lucide-backpack', placement: 'main' },
  { key: 'skills', label: 'Skills', icon: 'i-lucide-target', placement: 'reference' },
  { key: 'features', label: 'Features & Traits', shortLabel: 'Features', icon: 'i-lucide-scroll-text', placement: 'main' },
  { key: 'notes', label: 'Notes', icon: 'i-lucide-notebook-pen', placement: 'main' },
  { key: 'details', label: 'Details', icon: 'i-lucide-book-open', placement: 'main' }
]

// `?tab=` values from the five-tab era. `play` and `character` were the
// route keys behind the "Actions" and "Character" labels; links people
// already shared keep landing in the same place.
export const CHARACTER_SHEET_TAB_ALIASES: Readonly<Record<string, CharacterSheetSectionKey>> = {
  play: 'actions',
  character: 'features'
}

export const DEFAULT_CHARACTER_SHEET_SECTION: CharacterSheetSectionKey = 'actions'

export function normalizeCharacterSheetTab(value: unknown): CharacterSheetSectionKey {
  const raw = String(Array.isArray(value) ? value[0] : value || DEFAULT_CHARACTER_SHEET_SECTION)
  const tab = CHARACTER_SHEET_TAB_ALIASES[raw] ?? raw
  return CHARACTER_SHEET_SECTIONS.some((option) => option.key === tab)
    ? (tab as CharacterSheetSectionKey)
    : DEFAULT_CHARACTER_SHEET_SECTION
}

export type CharacterSheetSectionAvailability = Partial<Record<CharacterSheetSectionKey, boolean>>

// Sections whose availability is not `false`, in canonical order. A key
// the page does not mention stays available -- Actions/Inventory/Notes/
// Details always have something to show (an empty state, at minimum).
export function availableCharacterSheetSections(
  availability: CharacterSheetSectionAvailability
): CharacterSheetSection[] {
  return CHARACTER_SHEET_SECTIONS.filter((section) => availability[section.key] !== false)
}

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
export type CharacterSheetContextKind =
  | 'action'
  | 'spell'
  | 'item'
  | 'feature'
  | 'skill'
  | 'ability'
  | 'save'
  | 'condition'
  | 'resource'

// A roll the inspector can start for what it is showing. Data only: the
// page maps `id` back to the existing roll/cast handler that row already
// used, so the inspector never learns how a roll is made.
export type CharacterSheetContextRoll = {
  id: string
  label: string
  value: string
}

export type CharacterSheetContext = {
  kind: CharacterSheetContextKind
  id: string
  title: string
  eyebrow: string
  detailLines?: string[]
  summary?: string
  tags?: string[]
  imageUrl?: string | null
  rolls?: CharacterSheetContextRoll[]
}

export function useCharacterSheetLayout(
  availability: Ref<CharacterSheetSectionAvailability> = ref({})
) {
  const route = useRoute()
  const router = useRouter()

  const sections = computed(() => availableCharacterSheetSections(availability.value))

  // The requested section, falling back to the default when this
  // character does not have it (e.g. `?tab=spells` on a non-caster).
  const activeTab = computed<CharacterSheetSectionKey>(() => {
    const requested = normalizeCharacterSheetTab(route.query.tab)
    return sections.value.some((section) => section.key === requested) ? requested : DEFAULT_CHARACTER_SHEET_SECTION
  })

  // What the main workspace shows. A reference section (Stats/Skills) is
  // its own column wherever there is room for one, so the main workspace
  // keeps showing the default section beside it.
  const mainSection = computed<CharacterSheetSectionKey>(() => {
    const active = sections.value.find((section) => section.key === activeTab.value)
    return active?.placement === 'main' ? active.key : DEFAULT_CHARACTER_SHEET_SECTION
  })

  function setActiveTab(tab: CharacterSheetSectionKey) {
    router.replace({
      path: route.path,
      query: {
        ...route.query,
        tab: tab === DEFAULT_CHARACTER_SHEET_SECTION ? undefined : tab
      }
    })
  }

  // Phase 4C: also decides where the context inspector opens -- the
  // workspace's right rail from 1024px (Tailwind `lg`, tablet landscape
  // and up), the bottom sheet below that. Viewport-based on purpose: it
  // chooses between two workspace surfaces, not a sheet column layout
  // (that stays container-driven).
  const isDesktop = ref(true)
  let desktopQuery: MediaQueryList | null = null

  function onDesktopQueryChange(query: MediaQueryList | MediaQueryListEvent) {
    isDesktop.value = query.matches
  }

  onMounted(() => {
    if (!import.meta.client) return
    desktopQuery = window.matchMedia('(min-width: 1024px)')
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
    tabs: sections,
    sections,
    activeTab,
    mainSection,
    setActiveTab,
    isDesktop,
    context,
    contextEntity,
    openContext,
    closeContext
  }
}
