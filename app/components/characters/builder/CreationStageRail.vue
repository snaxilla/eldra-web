<script setup lang="ts">
// Character Creator V3 -- stage navigation. A plain set of buttons, never a
// lock: every stage is reachable at any time regardless of completeness
// ("Next" is a convenience, never a gate -- create-v2.vue's own header).
// Generic over `stages` ({key, label, complete}[]) so the Level-Up Wizard can
// reuse it with its own stage set; the optional `icon` is the only extra.
//
// Two presentations of one component and one set of states
// (current / complete / remaining):
//
//   rail  (desktop / tablet) -- a narrow icon column, COLLAPSED by default so
//         it costs ~3.5rem of the screen. An explicit toggle button expands it
//         to show labels; expanded it OVERLAYS the stage rather than pushing
//         it, so artwork never re-flows (the component reserves only the
//         collapsed width in the page flow). Nothing is hover-only: the toggle is
//         a real button (aria-expanded), every icon button carries an
//         accessible name, and collapsed icons also expose their label as a
//         title for pointer users.
//
//   menu  (phone) -- a compact "Stage N of M" button that opens a full-width
//         list of 44px+ rows.
//
// Collapsed state is remembered per session only in memory: it is a view
// preference, never creation state.

export type CreationStage = {
  key: string
  label: string
  complete: boolean
  icon?: string
}

const props = withDefaults(defineProps<{
  stages: readonly CreationStage[]
  activeKey: string
  variant?: 'rail' | 'menu'
  // Initial expansion. The creator always starts collapsed.
  defaultExpanded?: boolean
}>(), {
  variant: 'rail',
  defaultExpanded: false
})

const emit = defineEmits<{ select: [key: string] }>()

const expanded = ref(props.defaultExpanded)
const rootRef = ref<HTMLElement | null>(null)

const activeIndex = computed(() => props.stages.findIndex((stage) => stage.key === props.activeKey))
const activeStage = computed(() => props.stages[activeIndex.value])
const completeCount = computed(() => props.stages.filter((stage) => stage.complete).length)

function choose(key: string) {
  emit('select', key)
  // Picking from the phone menu closes it; the desktop rail stays as the
  // player left it.
  if (props.variant === 'menu') expanded.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && expanded.value) {
    expanded.value = false
    rootRef.value?.querySelector<HTMLElement>('[data-stage-toggle]')?.focus()
  }
}

function stageState(stage: CreationStage): string {
  if (stage.key === props.activeKey) return 'current stage'
  return stage.complete ? 'complete' : 'not yet complete'
}
</script>

<template>
  <!-- ======================= desktop / tablet rail ======================= -->
  <!-- The placeholder reserves only the collapsed width in the page flow; the nav itself is
       absolutely positioned so expanding it overlays the stage instead of pushing it. -->
  <div
    v-if="variant === 'rail'"
    class="relative z-40 h-full w-14 shrink-0"
  >
    <nav
      ref="rootRef"
      aria-label="Character creation stages"
      class="creator-rail absolute inset-y-0 left-0 flex flex-col border-r border-eldra-accent/20 bg-eldra-ink/80 backdrop-blur-md transition-[width] duration-200 motion-reduce:transition-none"
      :class="expanded ? 'w-56 shadow-[8px_0_32px_rgb(0_0_0/0.55)]' : 'w-14'"
      @keydown="onKeydown"
    >
      <button
        type="button"
        data-stage-toggle
        class="flex h-12 w-full shrink-0 items-center gap-3 border-b border-eldra-accent/20 px-3.5 text-eldra-text-soft transition hover:text-eldra-text-strong focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-eldra-accent/65"
        :aria-expanded="expanded"
        :aria-label="expanded ? 'Collapse stage navigation' : 'Expand stage navigation'"
        @click="expanded = !expanded"
      >
        <UIcon
          :name="expanded ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
          class="size-5 shrink-0"
        />
        <span
          v-if="expanded"
          class="truncate text-xs font-semibold uppercase tracking-[0.16em]"
        >Stages</span>
      </button>

      <ol class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1.5">
        <li
          v-for="(stage, index) in stages"
          :key="stage.key"
        >
          <button
            type="button"
            class="group relative flex min-h-11 w-full items-center gap-3 rounded-none border px-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] transition focus-visible:ring-2 focus-visible:ring-eldra-accent/65"
            :class="activeKey === stage.key
              ? 'border-eldra-accent/62 bg-eldra-accent/18 text-eldra-text-strong'
              : 'border-transparent text-eldra-text-faint hover:border-eldra-accent/30 hover:text-eldra-text-soft'"
            :aria-current="activeKey === stage.key ? 'step' : undefined"
            :aria-label="expanded ? undefined : `${stage.label}, ${stageState(stage)}`"
            :title="stage.label"
            @click="choose(stage.key)"
          >
            <span
              aria-hidden="true"
              class="relative flex size-6 shrink-0 items-center justify-center rounded-full border transition"
              :class="stage.complete
                ? 'border-eldra-accent/70 bg-eldra-accent/70 text-eldra-ink'
                : activeKey === stage.key ? 'border-eldra-accent-bright text-eldra-accent-bright' : 'border-eldra-accent/30'"
            >
              <UIcon
                v-if="stage.complete"
                name="i-lucide-check"
                class="size-3.5"
              />
              <UIcon
                v-else
                :name="stage.icon || 'i-lucide-circle'"
                class="size-3.5"
              />
            </span>
            <template v-if="expanded">
              <span class="min-w-0 flex-1 truncate">{{ stage.label }}</span>
              <span class="text-[0.6rem] font-normal tracking-normal text-eldra-text-ghost">{{ index + 1 }}</span>
              <span class="sr-only">({{ stageState(stage) }})</span>
            </template>
            <!-- Current-stage marker for the collapsed rail: shape, not colour alone. -->
            <span
              v-if="activeKey === stage.key"
              aria-hidden="true"
              class="absolute inset-y-1 left-0 w-0.5 bg-eldra-accent-bright"
            />
          </button>
        </li>
      </ol>

      <!-- Progress: a thin gilded meter, with the numbers in words for
           assistive tech. -->
      <div
        class="shrink-0 border-t border-eldra-accent/20 px-3 py-2.5"
        :title="`${completeCount} of ${stages.length} stages complete`"
      >
        <div
          class="h-1 w-full bg-eldra-accent/15"
          aria-hidden="true"
        >
          <div
            class="h-full bg-eldra-accent-bright/80 transition-[width] duration-500 motion-reduce:transition-none"
            :style="{ width: `${stages.length ? (completeCount / stages.length) * 100 : 0}%` }"
          />
        </div>
        <p
          v-if="expanded"
          class="mt-1.5 text-[0.65rem] uppercase tracking-[0.14em] text-eldra-text-faint"
        >
          {{ completeCount }} of {{ stages.length }} complete
        </p>
        <span
          v-else
          class="sr-only"
        >{{ completeCount }} of {{ stages.length }} stages complete</span>
      </div>
    </nav>
  </div>

  <!-- ============================ phone menu ============================= -->
  <nav
    v-else
    ref="rootRef"
    aria-label="Character creation stages"
    class="relative"
    @keydown="onKeydown"
  >
    <button
      type="button"
      data-stage-toggle
      class="flex min-h-11 w-full items-center gap-3 border border-eldra-accent/30 bg-eldra-ink/70 px-3 text-left backdrop-blur focus-visible:ring-2 focus-visible:ring-eldra-accent/65"
      :aria-expanded="expanded"
      aria-controls="creator-stage-menu"
      @click="expanded = !expanded"
    >
      <span class="min-w-0 flex-1 truncate text-xs uppercase tracking-[0.14em] text-eldra-text-faint">
        Stage {{ activeIndex + 1 }} of {{ stages.length }} ·
        <span class="font-semibold text-eldra-text-strong">{{ activeStage?.label }}</span>
      </span>
      <span
        aria-hidden="true"
        class="flex items-center gap-1"
      >
        <span
          v-for="stage in stages"
          :key="stage.key"
          class="size-1.5 rounded-full"
          :class="stage.key === activeKey
            ? 'bg-eldra-accent-bright'
            : stage.complete ? 'bg-eldra-accent/70' : 'bg-eldra-accent/25'"
        />
      </span>
      <UIcon
        :name="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="size-4 shrink-0 text-eldra-text-soft"
      />
    </button>

    <ol
      v-if="expanded"
      id="creator-stage-menu"
      class="absolute inset-x-0 top-full z-40 mt-1 border border-eldra-accent/30 bg-eldra-ink/96 p-1 shadow-2xl backdrop-blur"
    >
      <li
        v-for="(stage, index) in stages"
        :key="stage.key"
      >
        <button
          type="button"
          class="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm font-semibold focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-eldra-accent/65"
          :class="activeKey === stage.key ? 'bg-eldra-accent/18 text-eldra-text-strong' : 'text-eldra-text-soft'"
          :aria-current="activeKey === stage.key ? 'step' : undefined"
          @click="choose(stage.key)"
        >
          <span
            aria-hidden="true"
            class="flex size-6 shrink-0 items-center justify-center rounded-full border"
            :class="stage.complete ? 'border-eldra-accent/70 bg-eldra-accent/70 text-eldra-ink' : 'border-eldra-accent/30'"
          >
            <UIcon
              :name="stage.complete ? 'i-lucide-check' : (stage.icon || 'i-lucide-circle')"
              class="size-3.5"
            />
          </span>
          <span class="min-w-0 flex-1 truncate">{{ index + 1 }}. {{ stage.label }}</span>
          <span class="sr-only">({{ stageState(stage) }})</span>
        </button>
      </li>
    </ol>
  </nav>
</template>
