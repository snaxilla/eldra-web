<script setup lang="ts">
// Game Admin Refresh -- Game Admin's own section navigation, moved out of
// the header's overflowing tab row and into a collapsible vertical rail,
// using the SAME interaction/visual language as CreationStageRail.vue
// (Character Creator Stages) and CharacterSheetRollRail.vue (Character
// Sheet Roll Tray): a width-transitioning outer placeholder plus an
// absolutely-positioned `nav` inside it (so collapsing/expanding reflows
// the sibling content column rather than overlapping it), a `h-12` toggle
// header, eldra-accent/eldra-text-* theme tokens (not Game Admin's own
// older literal-rgba palette -- CLAUDE.md's theming doc asks new markup to
// use tokens, and this rail is meant to read as the same surface as the
// other two, not as Game Admin's pre-existing chrome).
//
// A new component rather than reusing CreationStageRail directly: that
// component's data model is `{key, label, complete, icon}[]` with
// hardcoded "stage"/"complete" copy and a completion progress meter --
// none of which fits a flat list of admin sections with no notion of
// completion. Teaching it a second, completion-less mode would mean
// touching a Character Creator component for an unrelated caller, which
// this task's own instructions rule out ("keep changes to the Character
// Creator and Character Sheet limited to genuinely shared code"). This
// component instead copies the two rails' own shell conventions directly,
// the same way CharacterSheetRollRail.vue copied CreationStageRail.vue's
// shell rather than extracting one -- see that file's own header for why
// that was preferred over a shared abstraction neither existing caller
// asked for.
//
// Responsive treatment: CSS-only, no matchMedia/JS breakpoint state. The
// rail (this file's "desktop" markup) is `hidden md:flex`; below `md` a
// compact dropdown bar (mirroring CreationStageRail's own phone "menu"
// variant) takes over via `md:hidden`. Both are rendered in the DOM at all
// times -- only one is ever visible -- so there is no hydration/breakpoint
// state to keep in sync, matching how world-workspace.vue's own mobile
// drawer is CSS-driven rather than JS-driven.

export type AdminRailSection = {
  key: string
  label: string
  icon?: string
}

const props = withDefaults(defineProps<{
  sections: readonly AdminRailSection[]
  activeKey: string
  defaultExpanded?: boolean
}>(), {
  defaultExpanded: true
})

const emit = defineEmits<{ select: [key: string] }>()

const expanded = ref(props.defaultExpanded)
const mobileOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const activeIndex = computed(() => props.sections.findIndex((section) => section.key === props.activeKey))
const activeSection = computed(() => props.sections[activeIndex.value])

function choose(key: string) {
  emit('select', key)
  mobileOpen.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return

  if (mobileOpen.value) {
    mobileOpen.value = false
    return
  }

  if (expanded.value) {
    expanded.value = false
    rootRef.value?.querySelector<HTMLElement>('[data-rail-toggle]')?.focus()
  }
}
</script>

<template>
  <!-- ======================= desktop / tablet rail ======================= -->
  <div
    class="relative z-40 hidden h-full shrink-0 transition-[width] duration-200 motion-reduce:transition-none md:block"
    :class="expanded ? 'w-64' : 'w-14'"
  >
    <nav
      ref="rootRef"
      aria-label="Game Admin sections"
      class="absolute inset-y-0 left-0 flex h-full flex-col border-r border-eldra-accent/20 bg-eldra-ink/80 backdrop-blur-md transition-[width] duration-200 motion-reduce:transition-none"
      :class="expanded ? 'w-64' : 'w-14'"
      @keydown="onKeydown"
    >
      <button
        type="button"
        data-rail-toggle
        class="flex h-12 w-full shrink-0 items-center gap-3 border-b border-eldra-accent/20 px-3.5 text-eldra-text-soft transition hover:text-eldra-text-strong focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-eldra-accent/65"
        :aria-expanded="expanded"
        :aria-label="expanded ? 'Collapse Game Admin navigation' : 'Expand Game Admin navigation'"
        @click="expanded = !expanded"
      >
        <UIcon
          :name="expanded ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
          class="size-5 shrink-0"
        />
        <span
          v-if="expanded"
          class="truncate text-xs font-semibold uppercase tracking-[0.16em]"
        >Sections</span>
      </button>

      <ol class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1.5">
        <li
          v-for="section in sections"
          :key="section.key"
        >
          <button
            type="button"
            class="group relative flex min-h-11 w-full items-center gap-3 rounded-none border px-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] transition focus-visible:ring-2 focus-visible:ring-eldra-accent/65"
            :class="activeKey === section.key
              ? 'border-eldra-accent/62 bg-eldra-accent/18 text-eldra-text-strong'
              : 'border-transparent text-eldra-text-faint hover:border-eldra-accent/30 hover:text-eldra-text-soft'"
            :aria-current="activeKey === section.key ? 'page' : undefined"
            :aria-label="expanded ? undefined : section.label"
            :title="section.label"
            @click="choose(section.key)"
          >
            <UIcon
              :name="section.icon || 'i-lucide-circle'"
              aria-hidden="true"
              class="size-4 shrink-0"
            />
            <span
              v-if="expanded"
              class="min-w-0 flex-1 truncate"
            >{{ section.label }}</span>
            <!-- Current-section marker for the collapsed rail: shape, not colour alone. -->
            <span
              v-if="activeKey === section.key"
              aria-hidden="true"
              class="absolute inset-y-1 left-0 w-0.5 bg-eldra-accent-bright"
            />
          </button>
        </li>
      </ol>
    </nav>
  </div>

  <!-- ============================ phone/narrow bar ============================= -->
  <nav
    class="relative shrink-0 md:hidden"
    aria-label="Game Admin sections"
    @keydown="onKeydown"
  >
    <button
      type="button"
      class="flex min-h-11 w-full items-center gap-3 border-b border-eldra-accent/20 bg-eldra-ink/80 px-3 text-left backdrop-blur"
      :aria-expanded="mobileOpen"
      aria-controls="admin-rail-mobile-menu"
      @click="mobileOpen = !mobileOpen"
    >
      <UIcon
        :name="activeSection?.icon || 'i-lucide-circle'"
        class="size-4 shrink-0 text-eldra-text-soft"
      />
      <span class="min-w-0 flex-1 truncate text-xs uppercase tracking-[0.14em] text-eldra-text-faint">
        Section {{ activeIndex + 1 }} of {{ sections.length }} ·
        <span class="font-semibold text-eldra-text-strong">{{ activeSection?.label }}</span>
      </span>
      <UIcon
        :name="mobileOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="size-4 shrink-0 text-eldra-text-soft"
      />
    </button>

    <ol
      v-if="mobileOpen"
      id="admin-rail-mobile-menu"
      class="absolute inset-x-0 top-full z-40 mt-1 max-h-[70vh] overflow-y-auto border border-eldra-accent/30 bg-eldra-ink/96 p-1 shadow-2xl backdrop-blur"
    >
      <li
        v-for="section in sections"
        :key="section.key"
      >
        <button
          type="button"
          class="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm font-semibold focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-eldra-accent/65"
          :class="activeKey === section.key ? 'bg-eldra-accent/18 text-eldra-text-strong' : 'text-eldra-text-soft'"
          :aria-current="activeKey === section.key ? 'page' : undefined"
          @click="choose(section.key)"
        >
          <UIcon
            :name="section.icon || 'i-lucide-circle'"
            aria-hidden="true"
            class="size-4 shrink-0"
          />
          <span class="min-w-0 flex-1 truncate">{{ section.label }}</span>
        </button>
      </li>
    </ol>
  </nav>
</template>
